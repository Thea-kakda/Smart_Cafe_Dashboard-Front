/**
 * Typed client for the protected branch-management API
 * (GET/POST/PUT /api/v1/management/stores/**). Kept separate from the generic
 * fetch layer so view code deals in backend contracts, not URLs.
 */
import { api } from './api';
import { Store } from '../types';

export interface ManagementStore {
  storeId: string;
  storeCode: string;
  storeName: string;
  address: string;
  phone?: string | null;
  timezone: string;
  defaultCurrency: string;
  defaultLanguage: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PaginationMeta {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface BranchListQuery {
  search?: string;
  active?: boolean;
  page?: number;
  size?: number;
}

export interface CreateBranchInput {
  storeCode: string;
  storeName: string;
  address: string;
  phone?: string | null;
  timezone: string;
  defaultCurrency: string;
  defaultLanguage: string;
  active?: boolean;
}

/** PUT body: storeCode is immutable business identity and deliberately absent. */
export interface UpdateBranchInput {
  storeName: string;
  address: string;
  phone?: string | null;
  timezone: string;
  defaultCurrency: string;
  defaultLanguage: string;
  version: number;
}

export interface BranchStatusInput {
  active: boolean;
  version: number;
}

const BASE = '/api/v1/management/stores';

export const branchesApi = {
  list: (query: BranchListQuery = {}, signal?: AbortSignal) =>
    api.get<Paginated<ManagementStore>>(BASE, {
      query: {
        search: query.search ?? '',
        active: query.active === undefined ? '' : String(query.active),
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),

  get: (storeId: string, signal?: AbortSignal) =>
    api.get<ManagementStore>(`${BASE}/${storeId}`, { signal }),

  create: (input: CreateBranchInput) => api.post<ManagementStore>(BASE, input),

  update: (storeId: string, input: UpdateBranchInput) =>
    api.put<ManagementStore>(`${BASE}/${storeId}`, input),

  changeStatus: (storeId: string, input: BranchStatusInput) =>
    api.post<ManagementStore>(`${BASE}/${storeId}/status`, input),
};

/** Map the authoritative management response onto the dashboard Store shape. */
export function toStore(m: ManagementStore): Store {
  return {
    id: m.storeId,
    code: m.storeCode,
    name: m.storeName,
    address: m.address,
    phone: m.phone ?? undefined,
    timezone: m.timezone,
    defaultCurrency: m.defaultCurrency,
    defaultLanguage: m.defaultLanguage,
    isActive: m.active,
    updatedAt: m.updatedAt,
    version: m.version,
  };
}
