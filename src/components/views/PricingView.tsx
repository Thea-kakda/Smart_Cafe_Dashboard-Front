import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Eye, AlertCircle, CheckCircle2, XCircle, X, Clock,
  RefreshCw, Store as StoreIcon, Edit2,
  Loader2, Lock,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  storeProductsApi, fetchCategories, fetchStations, toProductSummary,
  StoreProductRow, CategoryRow, StationRow, StoreProductQuery, PaginationMeta,
} from '../../lib/storeProducts';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

type ProductRow = ReturnType<typeof toProductSummary>;

interface FormState {
  overridePrice: string;
  available: boolean;
  stationCode: string;
  soldOutUntil: string;
}

const EMPTY_FORM: FormState = { overridePrice: '', available: true, stationCode: '', soldOutUntil: '' };

export const PricingView: React.FC = () => {
  const { t } = useTranslation();
  const { selectedStore, stores, setSelectedStoreId, canRead: canReadBranch } = useStore();
  const { isAuthenticated, hasPermission } = useAuth();

  const canRead = hasPermission('branch-product:read');
  const canManage = hasPermission('branch-product:manage');

  // Data
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 0, size: DEFAULT_PAGE_SIZE, totalElements: 0, totalPages: 0, first: true, last: true });
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [stations, setStations] = useState<StationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters (server-side)
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [overrideState, setOverrideState] = useState('');
  const [availability, setAvailability] = useState('');
  const [stationCode, setStationCode] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Edit modal
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Detail modal
  const [detail, setDetail] = useState<ProductRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Debounced search
  useEffect(() => {
    const h = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(h);
  }, [searchInput]);

  // Reset page when other filters change
  useEffect(() => { setPage(0); }, [categoryId, overrideState, availability, stationCode, pageSize]);

  // Load categories (public)
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchCategories().then(setCategories).catch(() => {});
  }, [isAuthenticated]);

  // Load stations when branch changes
  useEffect(() => {
    if (!selectedStore?.id || !canRead) { setStations([]); return; }
    const ctrl = new AbortController();
    fetchStations(selectedStore.id, ctrl.signal).then(setStations).catch(() => {});
    return () => ctrl.abort();
  }, [selectedStore?.id, canRead]);

  // Main data load
  const loadData = useCallback(async () => {
    if (!selectedStore?.id || !canRead || !isAuthenticated) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    setLoadError(null);
    try {
      const query: StoreProductQuery = {
        search: search || undefined,
        categoryId: categoryId || undefined,
        overrideState: overrideState || undefined,
        availability: availability || undefined,
        stationCode: stationCode || undefined,
        page,
        size: pageSize,
      };
      const result = await storeProductsApi.list(selectedStore.id, query, ctrl.signal);
      setRows(result.items.map(toProductSummary));
      setPagination(result.pagination);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) {
        setLoadError(t('pricing.forbidden'));
      } else {
        setLoadError(t('pricing.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedStore?.id, canRead, isAuthenticated, search, categoryId, overrideState, availability, stationCode, page, pageSize, t]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Feedback auto-dismiss
  useEffect(() => {
    if (!feedback) return;
    const h = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(h);
  }, [feedback]);

  // Open edit modal
  const openEdit = (prod: ProductRow) => {
    setEditing(prod);
    setForm({
      overridePrice: prod.branchPrice != null ? String(prod.branchPrice) : '',
      available: prod.isAvailable,
      stationCode: prod.stationCode || '',
      soldOutUntil: prod.soldOutUntil || '',
    });
  };

  // Map station back to stationCode for API
  // (toProductSummary preserves raw stationCode on ProductRow)

  // Submit edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !selectedStore?.id) return;
    if (!form.stationCode) {
      setFeedback({ kind: 'error', text: t('pricing.stationRequired') });
      return;
    }
    setIsSubmitting(true);
    try {
      const overridePrice = form.overridePrice ? Number(form.overridePrice) : null;
      const soldOutUntil = form.soldOutUntil ? new Date(form.soldOutUntil).toISOString() : null;
      const updated = await storeProductsApi.update(selectedStore.id, editing.id, {
        overridePrice,
        available: form.available,
        soldOutUntil,
        stationCode: form.stationCode,
        storeProductVersion: editing.storeProductVersion,
      });
      // Apply authoritative response into local list
      const mapped = toProductSummary(updated);
      setRows((prev) => prev.map((r) => (r.id === mapped.id ? mapped : r)));
      setEditing(null);
      setFeedback({ kind: 'success', text: t('pricing.saveSuccess') });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setFeedback({ kind: 'warning', text: t('pricing.conflict') });
        setEditing(null);
        void loadData();
      } else if (err instanceof ApiError && err.status === 403) {
        setFeedback({ kind: 'error', text: t('pricing.forbidden') });
      } else {
        setFeedback({ kind: 'error', text: t('pricing.networkError') });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick toggle availability
  const toggleAvail = async (prod: ProductRow) => {
    if (!selectedStore?.id || !canManage) return;
    setPendingId(prod.id);
    try {
      const updated = await storeProductsApi.update(selectedStore.id, prod.id, {
        overridePrice: prod.branchPrice ?? null,
        available: !prod.isAvailable,
        soldOutUntil: null,
        stationCode: prod.stationCode || stations[0]?.stationCode || 'DEFAULT',
        storeProductVersion: prod.storeProductVersion,
      });
      setRows((prev) => prev.map((r) => (r.id === updated.productId ? toProductSummary(updated) : r)));
      setFeedback({ kind: 'success', text: prod.isAvailable ? t('pricing.availToggledOff') : t('pricing.availToggledOn') });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setFeedback({ kind: 'warning', text: t('pricing.conflict') });
        void loadData();
      } else {
        setFeedback({ kind: 'error', text: t('pricing.networkError') });
      }
    } finally {
      setPendingId(null);
    }
  };

  const showSkeleton = isLoading && rows.length === 0;
  const showEmpty = !isLoading && !loadError && rows.length === 0;

  // No branch selected guard
  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('pricing.title')}</h2>
        <div className="rounded-xl border p-6 text-center text-sm text-[#6E5E4F] flex items-center gap-2 justify-center">
          <Lock className="w-4 h-4 text-[#C48A56]" /> {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('pricing.title')}</h2>
        <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-4 text-xs font-medium text-[#B45309]">
          {t('pricing.forbidden')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('pricing.title')}</h2>
            <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">{t('pricing.branchScoped')}</span>
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">
            {t('pricing.description')} <span className="font-semibold text-[#C48A56]">{selectedStore?.name}</span> ({selectedStore?.code})
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] text-xs font-semibold">
            <StoreIcon className="w-4 h-4 text-[#C48A56]" />
            <select value={selectedStore?.id ?? ''} onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-transparent text-[#1C1A19] dark:text-[#F5F3F0] font-bold focus:outline-none cursor-pointer">
              {stores.map((s) => (<option key={s.id} value={s.id} className="dark:bg-[#201D19]">{s.name} ({s.code})</option>))}
            </select>
          </div>
          <button type="button" onClick={() => void loadData()} disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 text-[#C48A56] ${isLoading ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between animate-in fade-in ${
          feedback.kind === 'success' ? 'border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]'
          : feedback.kind === 'warning' ? 'border-[#B45309]/30 bg-[#B45309]/10 text-[#B45309]'
          : 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]'}`}>
          <div className="flex items-center gap-2">
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Error banner with retry */}
      {loadError && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs text-[#DC2626] font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{loadError}</div>
          <button type="button" onClick={() => void loadData()} className="underline">{t('common.retry')}</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: t('pricing.totalProducts'), value: pagination.totalElements, color: 'text-[#1C1A19] dark:text-[#F5F3F0]' },
          { label: t('pricing.overrides'), value: rows.filter((r) => r.pricingMode === 'Branch Override').length, color: 'text-[#C48A56]' },
          { label: t('pricing.inheritedCount'), value: rows.filter((r) => r.pricingMode === 'Inherited').length, color: 'text-[#1C1A19] dark:text-[#F5F3F0]' },
          { label: t('pricing.availableCount'), value: rows.filter((r) => r.isAvailable).length, color: 'text-[#2E7D32]' },
          { label: t('pricing.soldOutCount'), value: rows.filter((r) => !r.isAvailable).length, color: 'text-[#DC2626]' },
        ].map((c, i) => (
          <div key={i} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-4 shadow-xs">
            <span className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider block">{c.label}</span>
            <span className={`mt-1 block text-xl sm:text-2xl font-extrabold font-mono ${c.color}`}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-4 shadow-xs flex flex-col md:flex-row items-center gap-3">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8C7C6B]" />
          <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('pricing.search')}
            className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] pl-9 pr-4 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] placeholder-[#8C7C6B] focus:border-[#C48A56] focus:outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs focus:border-[#C48A56] focus:outline-none">
            <option value="">{t('common.all')} {t('pricing.category')}</option>
            {categories.map((c) => (<option key={c.categoryId} value={c.categoryId}>{c.name}</option>))}
          </select>
          <select value={overrideState} onChange={(e) => setOverrideState(e.target.value)}
            className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs focus:border-[#C48A56] focus:outline-none">
            <option value="">{t('pricing.allPricing')}</option>
            <option value="INHERITED">{t('pricing.inherited')}</option>
            <option value="OVERRIDE">{t('pricing.branchOverride')}</option>
          </select>
          <select value={availability} onChange={(e) => setAvailability(e.target.value)}
            className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs focus:border-[#C48A56] focus:outline-none">
            <option value="">{t('common.all')} {t('pricing.availability')}</option>
            <option value="AVAILABLE">{t('pricing.available')}</option>
            <option value="UNAVAILABLE">{t('pricing.unavailable')}</option>
          </select>
          <select value={stationCode} onChange={(e) => setStationCode(e.target.value)}
            className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs focus:border-[#C48A56] focus:outline-none font-semibold text-[#C48A56]">
            <option value="">{t('pricing.allStations')}</option>
            {stations.map((s) => (<option key={s.stationId} value={s.stationCode}>{s.stationName}</option>))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-right">Branch Price</th>
                <th className="py-3 px-4 text-center">Mode</th>
                <th className="py-3 px-4 text-right">Effective</th>
                <th className="py-3 px-4 text-center">Currency</th>
                <th className="py-3 px-4 text-center">Avail</th>
                <th className="py-3 px-4 text-center">Station</th>
                <th className="py-3 px-4 text-center">Prep</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
              {showSkeleton ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="py-3 px-4"><div className="h-4 bg-[#E5E3DF] dark:bg-[#2B2522] rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : showEmpty ? (
                <tr><td colSpan={9} className="py-12 text-center text-[#8C7C6B]">
                  <div className="flex flex-col items-center gap-2"><AlertCircle className="w-6 h-6" /><p>{t('pricing.empty')}</p></div>
                </td></tr>
              ) : (
                rows.map((prod) => (
                  <tr key={prod.id} className="hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40 transition-colors">
                    <td className="py-3 px-4 font-semibold">
                      <p className="font-bold">{prod.name}</p>
                      <span className="font-mono text-[10px] text-[#8C7C6B]">{prod.code} · {prod.categoryName}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{prod.branchPrice != null ? `$${prod.branchPrice.toFixed(2)}` : '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${prod.pricingMode === 'Branch Override' ? 'bg-[#C48A56]/15 text-[#C48A56]' : 'bg-[#8C7C6B]/10 text-[#8C7C6B]'}`}>
                        {prod.pricingMode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C48A56]">${prod.effectivePrice.toFixed(2)}</td>
                    <td className="py-3 px-4 text-center font-mono text-[11px] text-[#8C7C6B]">{prod.currencyCode}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${prod.isAvailable ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#DC2626]/10 text-[#DC2626]'}`}>
                        {prod.isAvailable ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {prod.isAvailable ? t('pricing.available') : t('pricing.unavailable')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center"><span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#F0EFED] dark:bg-[#2B2522] font-bold">{prod.station}</span></td>
                    <td className="py-3 px-4 text-center text-[#8C7C6B]"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-[#C48A56]" />{prod.preparationTimeMinutes}m</span></td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {canManage && (
                          <button type="button" onClick={() => openEdit(prod)}
                            className="p-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] hover:border-[#C48A56] text-[#C48A56] transition-colors" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canManage && (
                          <button type="button" onClick={() => void toggleAvail(prod)} disabled={pendingId === prod.id}
                            className={`p-1.5 rounded-lg border transition-colors disabled:opacity-50 ${prod.isAvailable ? 'border-[#DC2626]/30 text-[#DC2626]' : 'border-[#2E7D32]/30 text-[#2E7D32]'}`}
                            title={prod.isAvailable ? 'Mark Sold Out' : 'Mark Available'}>
                            {pendingId === prod.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : prod.isAvailable ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button type="button" onClick={() => setDetail(prod)}
                          className="p-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] hover:border-[#C48A56] text-[#8C7C6B] hover:text-[#C48A56] transition-colors" title="Details">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <PaginationBar
          page={pagination.page}
          size={pageSize}
          totalElements={pagination.totalElements}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
          onSizeChange={setPageSize}
          disabled={isLoading}
        />
      </div>

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DF] dark:border-[#2B2522]">
              <div>
                <h3 className="text-base font-bold">{t('pricing.edit')}</h3>
                <p className="text-xs text-[#C48A56] font-semibold">{editing.name} ({editing.code})</p>
              </div>
              <button type="button" onClick={() => setEditing(null)}><X className="w-5 h-5 text-[#8C7C6B]" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] p-3 text-xs space-y-1.5">
                <div className="flex justify-between"><span className="text-[#8C7C6B]">{t('pricing.basePrice')}:</span><span className="font-mono font-bold">${editing.basePrice?.toFixed(2)} {editing.currencyCode}</span></div>
                <div className="flex justify-between"><span className="text-[#8C7C6B]">{t('pricing.version')}:</span><span className="font-mono">v{editing.storeProductVersion}</span></div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{t('pricing.overridePrice')}</label>
                <input type="number" step="0.05" min="0" value={form.overridePrice}
                  onChange={(e) => setForm((f) => ({ ...f, overridePrice: e.target.value }))}
                  placeholder={t('pricing.overrideHint')}
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-sm font-mono font-bold text-[#C48A56] focus:border-[#C48A56] focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{t('pricing.station')}</label>
                <select value={form.stationCode} onChange={(e) => setForm((f) => ({ ...f, stationCode: e.target.value }))}
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs focus:border-[#C48A56] focus:outline-none">
                  <option value="">-- Select Station --</option>
                  {stations.map((s) => (<option key={s.stationId} value={s.stationCode}>{s.stationName} ({s.stationType})</option>))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label className="font-semibold">{t('pricing.availability')}:</label>
                <input type="checkbox" checked={form.available} onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))} className="accent-[#2E7D32]" />
                <span>{form.available ? t('pricing.available') : t('pricing.unavailable')}</span>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] py-2 text-xs font-bold text-[#6E5E4F]">{t('common.cancel')}</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl bg-[#C48A56] py-2 text-xs font-bold text-white disabled:opacity-60 hover:bg-[#B37947]">
                  {isSubmitting ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{detail.name}</h3>
              <button type="button" onClick={() => setDetail(null)} className="text-xs text-[#8C7C6B]">{t('common.close')}</button>
            </div>
            <div className="space-y-2 text-xs divide-y divide-[#E5E3DF] dark:divide-[#2B2522]">
              {[
                [t('pricing.basePrice'), `$${detail.basePrice?.toFixed(2)}`],
                [t('pricing.overridePrice'), detail.branchPrice != null ? `$${detail.branchPrice.toFixed(2)}` : '—'],
                ['Pricing Mode', detail.pricingMode],
                [t('pricing.effectivePrice'), `$${detail.effectivePrice.toFixed(2)} ${detail.currencyCode}`],
                [t('pricing.station'), detail.station],
                [t('pricing.availability'), detail.isAvailable ? t('pricing.available') : t('pricing.unavailable')],
                [t('pricing.soldOutUntil'), detail.soldOutUntil ?? '—'],
                [t('pricing.preparationTime'), `${detail.preparationTimeMinutes}m`],
                [t('pricing.version'), `v${detail.storeProductVersion}`],
                [t('pricing.updatedAt'), new Date(detail.updatedAt).toLocaleString()],
              ].map(([k, v], i) => (
                <div key={i} className="flex justify-between py-1.5"><span className="text-[#8C7C6B]">{k}</span><span className="font-semibold">{v}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
