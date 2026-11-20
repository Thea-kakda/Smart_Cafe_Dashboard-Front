import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, XCircle, X, Lock, RefreshCw,
  Loader2, Ban, Globe, Building2,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  exchangeRatesApi, ExchangeRateRow, ExchangeRateQuery, RateScope, SUPPORTED_CURRENCIES,
} from '../../lib/exchangeRates';
import { PaginationMeta } from '../../lib/storeProducts';

interface FormState {
  scope: 'GLOBAL' | 'BRANCH';
  storeId: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  source: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const EMPTY_FORM: FormState = {
  scope: 'GLOBAL', storeId: '', baseCurrency: 'USD', quoteCurrency: 'KHR',
  rate: '', source: 'MANUAL', effectiveFrom: '', effectiveTo: '',
};

/**
 * Exchange-rate administration (Checkpoint 10). Lists the authoritative rate
 * table and lets a permissioned operator create or retire rates. The model is
 * append-only — creating a newer rate closes the previous one server-side, and
 * retiring keeps history. Nothing about selection, precedence or conversion is
 * recomputed in the browser; the table simply reflects what the backend says.
 */
export const ExchangeRatesView: React.FC = () => {
  const { t } = useTranslation();
  const { stores, selectedStore } = useStore();
  const { isAuthenticated, hasPermission, globalAccess } = useAuth();

  const canRead = hasPermission('currency-rate:read');
  const canManage = hasPermission('currency-rate:manage');

  const [rows, setRows] = useState<ExchangeRateRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 0, size: DEFAULT_PAGE_SIZE, totalElements: 0, totalPages: 0, first: true, last: true });
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters (server-side, sentinel-driven)
  const [base, setBase] = useState('');
  const [quote, setQuote] = useState('');
  const [scope, setScope] = useState<RateScope>('ALL');
  const [storeId, setStoreId] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setPage(0); }, [base, quote, scope, storeId, activeFilter]);

  useEffect(() => {
    if (!feedback) return;
    const h = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(h);
  }, [feedback]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !canRead) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    setLoadError(null);
    try {
      const query: ExchangeRateQuery = {
        base: base || undefined,
        quote: quote || undefined,
        scope,
        storeId: storeId || undefined,
        active: activeFilter === '' ? undefined : activeFilter === 'true',
        page,
        size,
      };
      const result = await exchangeRatesApi.list(query, ctrl.signal);
      setRows(result.items);
      setPagination(result.pagination);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) setLoadError(t('fx.forbidden'));
      else setLoadError(t('fx.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, canRead, base, quote, scope, storeId, activeFilter, page, size, t]);

  useEffect(() => { void loadData(); }, [loadData]);

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      scope: globalAccess ? 'GLOBAL' : 'BRANCH',
      storeId: selectedStore?.id ?? stores[0]?.id ?? '',
    });
    setFormError(null);
    setCreating(true);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (form.baseCurrency === form.quoteCurrency) { setFormError(t('fx.sameCurrency')); return; }
    if (!form.rate || !/^\d{1,10}(\.\d{1,10})?$/.test(form.rate.trim())) { setFormError(t('fx.rateInvalid')); return; }
    if (form.scope === 'BRANCH' && !form.storeId) { setFormError(t('fx.branchRequired')); return; }

    const toIso = (local: string) => (local ? new Date(local).toISOString() : null);
    setIsSubmitting(true);
    try {
      const created = await exchangeRatesApi.create({
        storeId: form.scope === 'GLOBAL' ? null : form.storeId,
        baseCurrency: form.baseCurrency,
        quoteCurrency: form.quoteCurrency,
        rate: form.rate.trim(),
        source: form.source.trim() || undefined,
        effectiveFrom: toIso(form.effectiveFrom),
        effectiveTo: toIso(form.effectiveTo),
      });
      setCreating(false);
      setFeedback({ kind: 'success', text: t('fx.createSuccess') });
      // Superseding may have closed the previous row: refetch, don't patch locally.
      void loadData();
      if (created.scope === 'BRANCH' && created.storeId && created.storeId !== storeId) {
        // keep filters untouched; the new row is visible under ALL
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'RATE_PERIOD_OVERLAP') setFormError(t('fx.overlap'));
        else if (err.code === 'IDENTICAL_CURRENCY') setFormError(t('fx.sameCurrency'));
        else if (err.code === 'INVALID_RATE') setFormError(t('fx.rateInvalid'));
        else if (err.code === 'UNSUPPORTED_CURRENCY') setFormError(t('fx.unsupportedCurrency'));
        else if (err.code === 'INVALID_EFFECTIVE_PERIOD') setFormError(t('fx.periodInvalid'));
        else if (err.status === 403) setFormError(t('fx.forbiddenManage'));
        else if (err.status === 400) setFormError(t('fx.validationError'));
        else setFormError(t('fx.networkError'));
      } else setFormError(t('fx.networkError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const deactivate = async (row: ExchangeRateRow) => {
    if (!canManage || pendingId) return;
    setPendingId(row.exchangeRateId);
    try {
      await exchangeRatesApi.deactivate(row.exchangeRateId, row.version);
      setRows((prev) => prev.map((r) => (r.exchangeRateId === row.exchangeRateId ? { ...r, active: false, version: r.version + 1 } : r)));
      setFeedback({ kind: 'success', text: t('fx.deactivateSuccess') });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setFeedback({ kind: 'warning', text: t('fx.conflict') });
        void loadData();
      } else if (err instanceof ApiError && err.status === 403) {
        setFeedback({ kind: 'error', text: t('fx.forbiddenManage') });
      } else {
        setFeedback({ kind: 'error', text: t('fx.networkError') });
      }
    } finally {
      setPendingId(null);
    }
  };

  const branchName = (id: string | null) =>
    id ? (stores.find((s) => s.id === id)?.name ?? id.slice(0, 8)) : t('fx.global');

  const fmtRate = (value: number) => {
    // Display only — never re-derived. Trims backend trailing zeros without rounding.
    return String(value);
  };
  const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : t('fx.openEnded'));

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('fx.title')}</h2>
        <div className="rounded-xl border p-6 text-center text-sm text-[#6E5E4F] flex items-center gap-2 justify-center">
          <Lock className="w-4 h-4 text-[#C48A56]" /> {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('fx.title')}</h2>
        <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-4 text-xs font-medium text-[#B45309]">
          {t('fx.forbidden')}
        </div>
      </div>
    );
  }

  const showSkeleton = isLoading && rows.length === 0;
  const showEmpty = !isLoading && !loadError && rows.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('fx.title')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('fx.description')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          {canManage && (
            <button type="button" onClick={openCreate}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors">
              <Plus className="w-4 h-4" /> {t('fx.create')}
            </button>
          )}
          <button type="button" onClick={() => void loadData()} disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 text-[#C48A56] ${isLoading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Append-only policy note */}
      <div className="rounded-xl border border-[#C48A56]/30 bg-[#C48A56]/10 p-3 text-[11px] font-medium text-[#8C6239] dark:text-[#D4A87A]">
        {t('fx.appendOnly')}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between gap-2 ${
          feedback.kind === 'success' ? 'border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]'
            : feedback.kind === 'warning' ? 'border-[#B45309]/30 bg-[#B45309]/10 text-[#B45309]'
              : 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]'}`}>
          <span className="flex items-center gap-2">
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : feedback.kind === 'warning' ? <AlertCircle className="w-4 h-4 shrink-0" />
                : <XCircle className="w-4 h-4 shrink-0" />}
            {feedback.text}
          </span>
          <button type="button" onClick={() => setFeedback(null)} aria-label={t('common.close')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <FilterSelect label={t('fx.filterBase')} value={base} onChange={setBase}
          options={[{ value: '', label: t('fx.any') }, ...SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))]} />
        <FilterSelect label={t('fx.filterQuote')} value={quote} onChange={setQuote}
          options={[{ value: '', label: t('fx.any') }, ...SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))]} />
        <FilterSelect label={t('fx.scope')} value={scope} onChange={(v) => setScope(v as RateScope)}
          options={[
            { value: 'ALL', label: t('fx.scopeAll') },
            { value: 'GLOBAL', label: t('fx.scopeGlobal') },
            { value: 'BRANCH', label: t('fx.scopeBranch') },
          ]} />
        <FilterSelect label={t('fx.filterBranch')} value={storeId} onChange={setStoreId}
          options={[{ value: '', label: t('fx.any') }, ...stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))]} />
        <FilterSelect label={t('fx.status')} value={activeFilter} onChange={setActiveFilter}
          options={[
            { value: '', label: t('fx.any') },
            { value: 'true', label: t('badge.active') },
            { value: 'false', label: t('badge.inactive') },
          ]} />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] overflow-hidden">
        {loadError && (
          <div className="p-6 text-center space-y-3">
            <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto" />
            <p className="text-xs font-semibold text-[#DC2626]">{loadError}</p>
            <button type="button" onClick={() => void loadData()}
              className="text-xs font-bold text-[#C48A56] hover:underline">{t('common.retry')}</button>
          </div>
        )}

        {showSkeleton && (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-[#F0EFED] dark:bg-[#26221F] animate-pulse" />)}
            <p className="text-[11px] text-[#8C7C6B]">{t('fx.loading')}</p>
          </div>
        )}

        {showEmpty && (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-[#6E5E4F]">{t('fx.empty')}</p>
            <p className="text-[11px] text-[#8C7C6B]">{t('fx.emptyHint')}</p>
          </div>
        )}

        {!loadError && !showSkeleton && !showEmpty && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] dark:text-[#A89D94] uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="py-3 px-4">{t('fx.pair')}</th>
                  <th className="py-3 px-4 text-right">{t('fx.rate')}</th>
                  <th className="py-3 px-4">{t('fx.scope')}</th>
                  <th className="py-3 px-4">{t('fx.effectiveWindow')}</th>
                  <th className="py-3 px-4">{t('fx.source')}</th>
                  <th className="py-3 px-4">{t('fx.status')}</th>
                  <th className="py-3 px-4 text-center">{t('fx.version')}</th>
                  <th className="py-3 px-4 text-right">{t('fx.updatedAt')}</th>
                  {canManage && <th className="py-3 px-4 text-right">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                {rows.map((row) => (
                  <tr key={row.exchangeRateId} className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F] transition-colors">
                    <td className="py-3 px-4 font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
                      {row.baseCurrency} → {row.quoteCurrency}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{fmtRate(row.rate)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${row.scope === 'GLOBAL' ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : 'bg-[#C48A56]/15 text-[#A36C3D] dark:text-[#D4A87A]'}`}>
                        {row.scope === 'GLOBAL' ? <Globe className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                        {row.scope === 'GLOBAL' ? t('fx.global') : branchName(row.storeId)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#6E5E4F] dark:text-[#A89D94] whitespace-nowrap">
                      {new Date(row.effectiveFrom).toLocaleDateString()} → {row.effectiveTo ? new Date(row.effectiveTo).toLocaleDateString() : <span className="font-semibold text-[#2E7D32]">{t('fx.openEnded')}</span>}
                    </td>
                    <td className="py-3 px-4 text-[#6E5E4F] dark:text-[#A89D94]">{row.source}</td>
                    <td className="py-3 px-4">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${row.active ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                        {row.active ? t('badge.active') : t('badge.inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[#8C7C6B]">v{row.version}</td>
                    <td className="py-3 px-4 text-right text-[#8C7C6B] whitespace-nowrap">{fmtTime(row.updatedAt)}</td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        {row.active ? (
                          <button type="button" onClick={() => void deactivate(row)} disabled={pendingId !== null}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-40 transition-colors"
                            title={t('fx.deactivate')}>
                            {pendingId === row.exchangeRateId
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Ban className="w-3.5 h-3.5" />}
                            {t('fx.deactivate')}
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#8C7C6B]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loadError && !showEmpty && (
          <PaginationBar
            page={pagination.page}
            size={size}
            totalElements={pagination.totalElements}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            onSizeChange={setSize}
            disabled={isLoading}
          />
        )}
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCreating(false)}>
          <form onSubmit={submitCreate} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('fx.createTitle')}</h3>
              <button type="button" onClick={() => setCreating(false)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            <p className="text-[11px] text-[#8C7C6B] -mt-2">{t('fx.createHint')}</p>

            {/* Scope */}
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer transition-colors ${form.scope === 'GLOBAL' ? 'border-[#C48A56] bg-[#C48A56]/10 text-[#A36C3D] dark:text-[#D4A87A]' : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B]'}`}>
                <input type="radio" name="scope" className="hidden" checked={form.scope === 'GLOBAL'} disabled={!globalAccess}
                  onChange={() => setForm({ ...form, scope: 'GLOBAL' })} />
                <Globe className="w-3.5 h-3.5" /> {t('fx.scopeGlobal')}
              </label>
              <label className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer transition-colors ${form.scope === 'BRANCH' ? 'border-[#C48A56] bg-[#C48A56]/10 text-[#A36C3D] dark:text-[#D4A87A]' : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B]'}`}>
                <input type="radio" name="scope" className="hidden" checked={form.scope === 'BRANCH'}
                  onChange={() => setForm({ ...form, scope: 'BRANCH' })} />
                <Building2 className="w-3.5 h-3.5" /> {t('fx.scopeBranch')}
              </label>
            </div>
            {!globalAccess && <p className="text-[10px] text-[#B45309]">{t('fx.globalOnlyAdmin')}</p>}

            {form.scope === 'BRANCH' && (
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('fx.branchLabel')}</label>
                <select value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })}
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40">
                  <option value="">— {t('branches.select')} —</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('fx.pairBase')}</label>
                <select value={form.baseCurrency} onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })}
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40">
                  {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <span className="mb-2 text-xs font-bold text-[#8C7C6B]">=</span>
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('fx.pairQuote')}</label>
                <select value={form.quoteCurrency} onChange={(e) => setForm({ ...form, quoteCurrency: e.target.value })}
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40">
                  {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-[#8C7C6B] -mt-2">1 {form.baseCurrency} = [{form.rate || '…'}] {form.quoteCurrency}</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('fx.rate')} *</label>
                <input type="text" inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  placeholder="4100.0000000000"
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('fx.source')}</label>
                <input type="text" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} maxLength={40}
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('fx.effectiveFrom')}</label>
                <input type="datetime-local" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40" />
                <p className="mt-1 text-[10px] text-[#8C7C6B]">{t('fx.effectiveFromHint')}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('fx.effectiveTo')}</label>
                <input type="datetime-local" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                  className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40" />
                <p className="mt-1 text-[10px] text-[#8C7C6B]">{t('fx.effectiveToHint')}</p>
              </div>
            </div>

            {formError && (
              <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-60 transition-colors">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isSubmitting ? t('common.save') : t('fx.create')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#8C7C6B] mb-1">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40">
      {options.map((o) => <option key={o.value} value={o.value} className="dark:bg-[#201D19]">{o.label}</option>)}
    </select>
  </div>
);
