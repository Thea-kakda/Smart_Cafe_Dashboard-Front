import React, { useEffect, useMemo, useState } from 'react';
import {
  Store as StoreIcon,
  MapPin,
  Phone,
  Globe,
  Coins,
  CheckCircle2,
  XCircle,
  Plus,
  Edit3,
  Eye,
  Search,
  Power,
  X,
  AlertCircle,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError, ValidationDetail } from '../../lib/api';
import { Store } from '../../types';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

interface BranchFormState {
  storeCode: string;
  storeName: string;
  address: string;
  phone: string;
  timezone: string;
  defaultCurrency: string;
  defaultLanguage: string;
  active: boolean;
}

const EMPTY_FORM: BranchFormState = {
  storeCode: '',
  storeName: '',
  address: '',
  phone: '',
  timezone: 'Asia/Phnom_Penh',
  defaultCurrency: 'USD',
  defaultLanguage: 'km-KH',
  active: true,
};

export const StoresView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated } = useAuth();
  const {
    stores,
    selectedStore,
    setSelectedStoreId,
    canRead,
    canManage,
    isLoading,
    error,
    pagination,
    filters,
    setFilters,
    setPage,
    setSize,
    refresh,
    createStore,
    updateStore,
    setStoreStatus,
    accessibleBranches,
  } = useStore();

  const [searchInput, setSearchInput] = useState(filters.search);
  const [detailStore, setDetailStore] = useState<Store | null>(null);
  const [editing, setEditing] = useState<Store | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<BranchFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Server-side search with debounce; the backend owns filtering.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchInput !== filters.search) setFilters({ search: searchInput });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [searchInput, filters.search, setFilters]);

  useEffect(() => {
    if (!feedback) return;
    const handle = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(handle);
  }, [feedback]);

  const localizedError = (err: unknown): { kind: 'warning' | 'error'; text: string; details: ValidationDetail[] } => {
    if (!(err instanceof ApiError)) {
      return { kind: 'error', text: t('branches.networkError'), details: [] };
    }
    if (err.status === 401) return { kind: 'error', text: t('branches.sessionExpired'), details: [] };
    if (err.status === 403) return { kind: 'error', text: t('branches.forbidden'), details: [] };
    if (err.status === 404) return { kind: 'error', text: t('branches.notFound'), details: [] };
    if (err.code === 'VERSION_CONFLICT') return { kind: 'warning', text: t('branches.conflict'), details: [] };
    if (err.code === 'STORE_CODE_TAKEN' || err.code === 'DUPLICATE_RESOURCE') {
      return { kind: 'error', text: t('branches.duplicateCode'), details: [] };
    }
    if (err.isNetworkError) return { kind: 'error', text: t('branches.networkError'), details: [] };
    return { kind: 'error', text: err.message || t('common.error'), details: err.details };
  };

  const applyFieldDetails = (details: ValidationDetail[]) => {
    const map: Record<string, string> = {};
    details.forEach((d) => {
      if (d.field) map[d.field] = d.message || d.issue || 'invalid';
    });
    setFieldErrors(map);
  };

  const handleStatusFilter = (value: string) => {
    setFilters({ active: value === 'all' ? undefined : value === 'true' });
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setIsCreateOpen(true);
  };

  const openEdit = (store: Store) => {
    setEditing(store);
    setForm({
      storeCode: store.code,
      storeName: store.name,
      address: store.address || '',
      phone: store.phone || '',
      timezone: store.timezone || 'Asia/Phnom_Penh',
      defaultCurrency: store.defaultCurrency || 'USD',
      defaultLanguage: store.defaultLanguage || 'km-KH',
      active: store.isActive,
    });
    setFieldErrors({});
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.storeCode || !form.storeName || !form.address || !form.timezone || !form.defaultCurrency || !form.defaultLanguage) {
      setFeedback({ kind: 'error', text: t('branches.required') });
      return;
    }
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      await createStore({
        storeCode: form.storeCode.toUpperCase(),
        storeName: form.storeName,
        address: form.address,
        phone: form.phone || null,
        timezone: form.timezone,
        defaultCurrency: form.defaultCurrency,
        defaultLanguage: form.defaultLanguage,
        active: form.active,
      });
      setIsCreateOpen(false);
      setFeedback({ kind: 'success', text: t('branches.createdSuccess') });
    } catch (err) {
      const mapped = localizedError(err);
      applyFieldDetails(mapped.details);
      setFeedback({ kind: mapped.kind, text: mapped.text });
      void refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || editing.version === undefined) return;
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      // Full replacement including the version we loaded; the backend
      // answers 409 VERSION_CONFLICT if it changed in the meantime.
      const updated = await updateStore(editing.id, {
        storeName: form.storeName,
        address: form.address,
        phone: form.phone || null,
        timezone: form.timezone,
        defaultCurrency: form.defaultCurrency,
        defaultLanguage: form.defaultLanguage,
        version: editing.version,
      });
      setEditing(null);
      setFeedback({ kind: 'success', text: `${t('branches.updatedSuccess')} (${updated.code})` });
    } catch (err) {
      const mapped = localizedError(err);
      applyFieldDetails(mapped.details);
      setFeedback({ kind: mapped.kind, text: mapped.text });
      // Never overwrite automatically on conflict: refetch authoritative data.
      void refresh();
      setEditing(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (store: Store) => {
    if (store.version === undefined) return;
    setPendingId(store.id);
    try {
      await setStoreStatus(store.id, !store.isActive, store.version);
      setFeedback({
        kind: 'success',
        text: store.isActive ? t('branches.deactivatedSuccess') : t('branches.activatedSuccess'),
      });
    } catch (err) {
      const mapped = localizedError(err);
      setFeedback({ kind: mapped.kind, text: mapped.text });
      void refresh();
    } finally {
      setPendingId(null);
    }
  };

  const initialLoading = isLoading && stores.length === 0;
  const showEmpty = !isLoading && !error && stores.length === 0;
  const noScope = isAuthenticated && !canRead && accessibleBranches.length === 0;

  const statusValue = filters.active === undefined ? 'all' : filters.active ? 'true' : 'false';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
              {t('nav.stores')}
            </h2>
            {canRead && (
              <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">
                {pagination.totalElements} {t('branches.registeredCount')}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('branches.description')}</p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{t('branches.create')}</span>
          </button>
        )}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between animate-in fade-in ${
            feedback.kind === 'success'
              ? 'border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]'
              : feedback.kind === 'warning'
                ? 'border-[#B45309]/30 bg-[#B45309]/10 text-[#B45309]'
                : 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!isAuthenticated && (
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-4 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{locale === 'km' ? 'សូមចូលប្រើប្រាស់ ដើម្បីគ្រប់គ្រងសាខា។' : 'Sign in to manage branches.'}</span>
        </div>
      )}
      {noScope && (
        <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-4 text-xs font-medium text-[#B45309]">
          {t('branches.noBranchScope')}
        </div>
      )}

      {/* Search + status filter + refresh */}
      {canRead && (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-2.5 flex-1">
            <Search className="w-4 h-4 text-[#8C7C6B] shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('branches.searchPlaceholder')}
              className="w-full bg-transparent text-xs text-[#1C1A19] dark:text-[#F5F3F0] placeholder-[#8C7C6B] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-[#8C7C6B] uppercase">{t('branches.statusFilter')}</label>
            <select
              value={statusValue}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-1.5 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:outline-none"
            >
              <option value="all">{t('branches.statusAll')}</option>
              <option value="true">{t('branches.statusActive')}</option>
              <option value="false">{t('branches.statusInactive')}</option>
            </select>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading}
              title={t('common.refresh')}
              className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Load error with retry */}
      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error.isNetworkError ? t('branches.networkError') : t('branches.loadError')} ({error.code})</span>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold hover:bg-[#B91C1C] transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Skeleton */}
      {initialLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 animate-pulse space-y-3">
              <div className="h-4 w-2/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-1/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-4/5 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {showEmpty && (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">
          {stores.length === 0 && !canRead ? t('branches.noBranchScope') : t('branches.empty')}
        </div>
      )}

      {/* Branch cards */}
      {!initialLoading && stores.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {stores.map((store) => {
            const isSelected = store.id === selectedStore?.id;
            const pending = pendingId === store.id;
            return (
              <div
                key={store.id}
                className={`rounded-2xl border transition-all p-5 flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#C48A56] bg-[#FFFFFF] dark:bg-[#201D19] shadow-md ring-2 ring-[#C48A56]/20'
                    : 'border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs hover:border-[#C48A56]/60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56]">
                        <StoreIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{store.name}</h3>
                        <span className="text-[11px] font-mono font-semibold text-[#8C7C6B]">{store.code}</span>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                        store.isActive ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#DC2626]/10 text-[#DC2626]'
                      }`}
                    >
                      {store.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>{store.isActive ? t('badge.active') : t('badge.inactive')}</span>
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-xs text-[#6E5E4F] dark:text-[#A89D94]">
                    {store.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#8C7C6B] shrink-0 mt-0.5" />
                        <span>{store.address}</span>
                      </div>
                    )}
                    {store.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#8C7C6B] shrink-0" />
                        <span>{store.phone}</span>
                      </div>
                    )}
                    {store.timezone && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-[#8C7C6B] shrink-0" />
                        <span>{store.timezone}</span>
                      </div>
                    )}
                    {store.defaultCurrency && (
                      <div className="flex items-center gap-2">
                        <Coins className="w-3.5 h-3.5 text-[#8C7C6B] shrink-0" />
                        <span>
                          {store.defaultCurrency}
                          {store.defaultLanguage ? ` · ${store.defaultLanguage}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-[#E5E3DF] dark:border-[#2B2522] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDetailStore(store)}
                      className="p-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors"
                      title={t('branches.detail')}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(store)}
                          className="p-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors"
                          title={t('branches.edit')}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(store)}
                          disabled={pending || store.version === undefined}
                          title={store.isActive ? t('branches.deactivate') : t('branches.activate')}
                          className={`p-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                            store.isActive
                              ? 'border-[#DC2626]/30 text-[#DC2626] hover:bg-[#DC2626]/10'
                              : 'border-[#2E7D32]/30 text-[#2E7D32] hover:bg-[#2E7D32]/10'
                          }`}
                        >
                          <Power className={`w-3.5 h-3.5 ${pending ? 'animate-pulse' : ''}`} />
                        </button>
                      </>
                    )}
                    {store.version !== undefined && (
                      <span className="ml-1 text-[9px] font-mono text-[#A89D94]" title={t('branches.version')}>
                        v{store.version}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedStoreId(store.id)}
                    disabled={isSelected}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      isSelected
                        ? 'bg-[#C48A56] text-white cursor-default'
                        : 'border border-[#E5E3DF] dark:border-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]'
                    }`}
                  >
                    {isSelected ? t('branches.selected') : t('branches.select')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {canRead && (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19]">
          <PaginationBar
            page={pagination.page}
            size={pagination.size || DEFAULT_PAGE_SIZE}
            totalElements={pagination.totalElements}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            onSizeChange={setSize}
            disabled={isLoading}
          />
        </div>
      )}

      {/* CREATE / EDIT MODAL (shared form) */}
      {(isCreateOpen || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DF] dark:border-[#2B2522]">
              <h3 className="text-base font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
                {editing ? t('branches.edit') : t('branches.create')}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditing(null);
                }}
                className="text-[#8C7C6B] hover:text-[#1C1A19]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={editing ? handleUpdate : handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('branches.code')}</label>
                <input
                  type="text"
                  required={!editing}
                  disabled={!!editing}
                  value={form.storeCode}
                  onChange={(e) => setForm({ ...form, storeCode: e.target.value.toUpperCase() })}
                  placeholder="BKK2"
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs font-mono font-bold disabled:opacity-60"
                />
                {editing && <p className="mt-1 text-[10px] text-[#8C7C6B]">{t('branches.codeImmutable')}</p>}
                {fieldErrors.storeCode && <p className="mt-1 text-[10px] text-[#DC2626]">{fieldErrors.storeCode}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('branches.name')}</label>
                <input
                  type="text"
                  required
                  value={form.storeName}
                  onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                  placeholder="SMART Coffee Aeon 2"
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs"
                />
                {fieldErrors.storeName && <p className="mt-1 text-[10px] text-[#DC2626]">{fieldErrors.storeName}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('branches.address')}</label>
                <input
                  type="text"
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Street address, Khan, Phnom Penh"
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs"
                />
                {fieldErrors.address && <p className="mt-1 text-[10px] text-[#DC2626]">{fieldErrors.address}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('branches.phone')}</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+855 23 999 888"
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs font-mono"
                />
                {fieldErrors.phone && <p className="mt-1 text-[10px] text-[#DC2626]">{fieldErrors.phone}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('branches.timezone')}</label>
                <input
                  type="text"
                  required
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  placeholder="Asia/Phnom_Penh"
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs font-mono"
                />
                {fieldErrors.timezone && <p className="mt-1 text-[10px] text-[#DC2626]">{fieldErrors.timezone}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('branches.currency')}</label>
                  <select
                    value={form.defaultCurrency}
                    onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}
                    className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs"
                  >
                    <option value="USD">USD</option>
                    <option value="KHR">KHR</option>
                  </select>
                  {fieldErrors.defaultCurrency && <p className="mt-1 text-[10px] text-[#DC2626]">{fieldErrors.defaultCurrency}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('branches.language')}</label>
                  <select
                    value={form.defaultLanguage}
                    onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}
                    className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs"
                  >
                    <option value="km-KH">ខ្មែរ (km-KH)</option>
                    <option value="en-US">English (en-US)</option>
                  </select>
                  {fieldErrors.defaultLanguage && <p className="mt-1 text-[10px] text-[#DC2626]">{fieldErrors.defaultLanguage}</p>}
                </div>
              </div>

              {editing && (
                <p className="text-[10px] text-[#8C7C6B] font-mono">
                  {t('branches.version')}: v{editing.version}
                </p>
              )}

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditing(null);
                  }}
                  className="flex-1 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] py-2 text-xs font-bold text-[#6E5E4F] dark:text-[#A89D94]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-[#C48A56] py-2 text-xs font-bold text-white hover:bg-[#B37947] disabled:opacity-50"
                >
                  {isSubmitting ? '...' : editing ? t('common.save') : t('branches.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DF] dark:border-[#2B2522]">
              <div className="flex items-center gap-2">
                <StoreIcon className="w-5 h-5 text-[#C48A56]" />
                <h3 className="text-base font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{detailStore.name}</h3>
              </div>
              <button type="button" onClick={() => setDetailStore(null)} className="text-[#8C7C6B] hover:text-[#1C1A19]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs divide-y divide-[#E5E3DF] dark:divide-[#2B2522]">
              <div className="flex justify-between pt-1">
                <span className="text-[#8C7C6B]">{t('branches.code')}</span>
                <span className="font-mono font-bold">{detailStore.code}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#8C7C6B]">{t('branches.address')}</span>
                <span className="text-right max-w-[240px] font-medium">{detailStore.address || '—'}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#8C7C6B]">{t('branches.phone')}</span>
                <span className="font-mono">{detailStore.phone || '—'}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#8C7C6B]">{t('branches.timezone')}</span>
                <span className="font-mono">{detailStore.timezone || '—'}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#8C7C6B]">{t('branches.currency')}</span>
                <span className="font-mono">{detailStore.defaultCurrency || '—'}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#8C7C6B]">{t('branches.language')}</span>
                <span className="font-mono">{detailStore.defaultLanguage || '—'}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#8C7C6B]">{t('branches.status')}</span>
                <span className={`font-bold ${detailStore.isActive ? 'text-[#2E7D32]' : 'text-[#DC2626]'}`}>
                  {detailStore.isActive ? t('badge.active') : t('badge.inactive')}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#8C7C6B]">{t('branches.version')}</span>
                <span className="font-mono">{detailStore.version !== undefined ? `v${detailStore.version}` : '—'}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#8C7C6B]">{t('branches.updatedAt')}</span>
                <span className="font-mono">{detailStore.updatedAt ? new Date(detailStore.updatedAt).toLocaleString() : '—'}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setDetailStore(null)}
                className="w-full rounded-xl bg-[#C48A56] py-2 text-xs font-bold text-white hover:bg-[#B37947] transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
