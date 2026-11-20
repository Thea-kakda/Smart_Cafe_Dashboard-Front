import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Store } from '../types';
import { ApiError } from '../lib/api';
import { BranchListQuery, ManagementStore, branchesApi, toStore } from '../lib/management';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import { BranchAccess, useAuth } from './AuthContext';

/**
 * Branch context backed by the real management API.
 *
 * - With branch:read the list comes from GET /api/v1/management/stores
 *   (server search/status filter + pagination).
 * - Without branch:read the selectable branches fall back to the
 *   access-context accessibleBranches (still real backend data).
 * - localStorage keeps ONLY the last selected branch id, and that id is
 *   accepted only if it exists in the user's authoritative branch scope.
 * - Mutations use the authoritative response body; optimistic-lock conflicts
 *   bubble up as ApiError for localized handling in the view.
 */

const SELECTED_STORE_KEY = 'erp_selected_store_id';

interface StoreContextType {
  stores: Store[];
  rawStores: ManagementStore[];
  selectedStore: Store | null;
  selectedStoreId: string;
  setSelectedStoreId: (id: string) => void;
  accessibleBranches: BranchAccess[];
  canRead: boolean;
  canManage: boolean;
  isLoading: boolean;
  error: ApiError | null;
  pagination: { page: number; size: number; totalElements: number; totalPages: number };
  filters: { search: string; active?: boolean };
  setFilters: (f: { search?: string; active?: boolean | undefined }) => void;
  setPage: (page: number) => void;
  /** Requested page size for the branch list; changing it resets to page 0. */
  setSize: (size: number) => void;
  refresh: () => Promise<void>;
  createStore: (input: Parameters<typeof branchesApi.create>[0]) => Promise<Store>;
  updateStore: (id: string, input: Parameters<typeof branchesApi.update>[1]) => Promise<Store>;
  setStoreStatus: (id: string, active: boolean, version: number) => Promise<Store>;
  /** Kept for older consumers; equivalent to setStoreStatus with a flip needing version. */
  toggleStoreStatus: (id: string) => Promise<Store>;
}

const EMPTY_PAGE = { page: 0, size: 20, totalElements: 0, totalPages: 0 };

const StoreContext = createContext<StoreContextType>({
  stores: [],
  rawStores: [],
  selectedStore: null,
  selectedStoreId: '',
  setSelectedStoreId: () => {},
  accessibleBranches: [],
  canRead: false,
  canManage: false,
  isLoading: false,
  error: null,
  pagination: EMPTY_PAGE,
  filters: { search: '' },
  setFilters: () => {},
  setPage: () => {},
  setSize: () => {},
  refresh: async () => {},
  createStore: async () => {
    throw new Error('StoreProvider not mounted');
  },
  updateStore: async () => {
    throw new Error('StoreProvider not mounted');
  },
  setStoreStatus: async () => {
    throw new Error('StoreProvider not mounted');
  },
  toggleStoreStatus: async () => {
    throw new Error('StoreProvider not mounted');
  },
});

function branchToStore(b: BranchAccess): Store {
  return {
    id: b.storeId,
    code: b.storeCode,
    name: b.storeName,
    timezone: b.timezone,
    defaultCurrency: b.defaultCurrency,
    defaultLanguage: b.defaultLanguage,
    isActive: b.active,
  };
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, hasPermission, accessibleBranches, globalAccess } = useAuth();

  const canRead = hasPermission('branch:read');
  const canManage = hasPermission('branch:manage');

  const [rawStores, setRawStores] = useState<ManagementStore[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [filters, setFiltersState] = useState<{ search: string; active?: boolean }>({ search: '' });
  const [page, setPage] = useState(0);
  // Requested page size (single source of truth for the query). Server echoes
  // it back in pagination, but the effect below must not depend on the echo.
  const [size, setSizeState] = useState(DEFAULT_PAGE_SIZE);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Authoritative scope for selection: the access-context branches. Global
   * administrators may additionally select any branch visible in the loaded
   * management list.
   */
  const selectableIds = useMemo(() => {
    const ids = new Set(accessibleBranches.map((b) => b.storeId));
    rawStores.forEach((s) => {
      if (globalAccess || accessibleBranches.some((b) => b.storeId === s.storeId)) ids.add(s.storeId);
    });
    return ids;
  }, [accessibleBranches, rawStores, globalAccess]);

  const [selectedStoreId, setSelectedStoreIdState] = useState<string>(() => {
    return localStorage.getItem(SELECTED_STORE_KEY) || '';
  });

  const setSelectedStoreId = useCallback((id: string) => {
    setSelectedStoreIdState(id);
    if (id) localStorage.setItem(SELECTED_STORE_KEY, id);
    else localStorage.removeItem(SELECTED_STORE_KEY);
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated || !canRead) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const query: BranchListQuery = { search: filters.search, active: filters.active, page, size };
      const result = await branchesApi.list(query, controller.signal);
      setRawStores(result.items);
      setPagination({
        page: result.pagination.page,
        size: result.pagination.size,
        totalElements: result.pagination.totalElements,
        totalPages: result.pagination.totalPages,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Branch data could not be loaded.'));
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [isAuthenticated, canRead, filters.search, filters.active, page, size]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const stores: Store[] = useMemo(() => {
    if (canRead && isAuthenticated) return rawStores.map(toStore);
    // Non-management staff still get REAL branches from the access context.
    return accessibleBranches.map(branchToStore);
  }, [canRead, isAuthenticated, rawStores, accessibleBranches]);

  // Keep the selection valid: prefer the stored id when it exists in the
  // authoritative scope, otherwise fall back to the first selectable branch.
  useEffect(() => {
    if (selectableIds.size === 0) {
      if (selectedStoreId) setSelectedStoreId('');
      return;
    }
    if (!selectedStoreId || !selectableIds.has(selectedStoreId)) {
      const fallback = stores.find((s) => selectableIds.has(s.id)) ?? stores[0];
      if (fallback && fallback.id !== selectedStoreId) setSelectedStoreId(fallback.id);
    }
  }, [selectableIds, stores, selectedStoreId, setSelectedStoreId]);

  const setFilters = useCallback((f: { search?: string; active?: boolean }) => {
    setFiltersState((prev) => ({ ...prev, ...f }));
    setPage(0);
  }, []);

  const setSize = useCallback((next: number) => {
    setSizeState(next);
    setPage(0);
  }, []);

  const applyAuthoritative = useCallback((updated: ManagementStore) => {
    setRawStores((prev) => prev.map((s) => (s.storeId === updated.storeId ? updated : s)));
  }, []);

  const createStore = useCallback(
    async (input: Parameters<typeof branchesApi.create>[0]): Promise<Store> => {
      const created = await branchesApi.create(input);
      // Refetch so ordering/pagination totals stay authoritative.
      await load();
      return toStore(created);
    },
    [load],
  );

  const updateStore = useCallback(
    async (id: string, input: Parameters<typeof branchesApi.update>[1]): Promise<Store> => {
      const updated = await branchesApi.update(id, input);
      applyAuthoritative(updated);
      return toStore(updated);
    },
    [applyAuthoritative],
  );

  const setStoreStatus = useCallback(
    async (id: string, active: boolean, version: number): Promise<Store> => {
      const updated = await branchesApi.changeStatus(id, { active, version });
      applyAuthoritative(updated);
      return toStore(updated);
    },
    [applyAuthoritative],
  );

  const toggleStoreStatus = useCallback(
    async (id: string): Promise<Store> => {
      const current = rawStores.find((s) => s.storeId === id);
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'Branch is not loaded; refresh before changing status.');
      return setStoreStatus(id, !current.active, current.version);
    },
    [rawStores, setStoreStatus],
  );

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId],
  );

  return (
    <StoreContext.Provider
      value={{
        stores,
        rawStores,
        selectedStore,
        selectedStoreId,
        setSelectedStoreId,
        accessibleBranches,
        canRead,
        canManage,
        isLoading,
        error,
        pagination,
        filters,
        setFilters,
        setPage,
        setSize,
        refresh: load,
        createStore,
        updateStore,
        setStoreStatus,
        toggleStoreStatus,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => useContext(StoreContext);
