import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, X, Lock, RefreshCw, Loader2, CalendarX2, CalendarClock, Flame,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { ApiError } from '../../lib/api';
import {
  batchesAdminApi, ingredientsAdminApi, BatchRow, BatchStatus, BatchListQuery, IngredientRow,
} from '../../lib/inventoryMgmtAdmin';

const STATUS_TONE: Record<BatchStatus, string> = {
  ACTIVE: 'bg-[#2E7D32]/15 text-[#2E7D32]',
  EXHAUSTED: 'bg-[#8C7C6B]/15 text-[#8C7C6B]',
  EXPIRED: 'bg-[#DC2626]/15 text-[#DC2626]',
  ADJUSTED_OUT: 'bg-[#D97706]/15 text-[#D97706]',
};

/**
 * Batch / lot + expiry console (V038, M3). Lists a branch's lots FEFO-ordered
 * (earliest expiry first) with an ingredient filter and an optional
 * "expiring within N days" window. A lot can be written off (waste / expiry
 * stock-out) through the guarded backend command — one DAMAGED ledger line
 * drives the quantity out of the aggregate — never a local edit. FEFO is opt-in
 * per ingredient, so a branch that tracks no lots simply shows an empty board.
 * The list needs inventory:read + store scope; the write-off needs
 * inventory:adjust + store scope (both enforced server-side).
 */
export const BatchExpiryView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const { selectedStore, selectedStoreId } = useStore();

  const canRead = hasPermission('inventory:read');
  const canAdjust = hasPermission('inventory:adjust');

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [fIngredient, setFIngredient] = useState('');
  const [fExpiring, setFExpiring] = useState('');

  // Write-off modal
  const [writeTarget, setWriteTarget] = useState<BatchRow | null>(null);
  const [reason, setReason] = useState('');
  const [wError, setWError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const h = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(h);
  }, [feedback]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !canRead || !selectedStoreId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    setLoadError(null);
    const query: BatchListQuery = {
      ingredientId: fIngredient || undefined,
      expiringDays: fExpiring === '' ? '' : Number(fExpiring),
    };
    try {
      const result = await batchesAdminApi.list(selectedStoreId, query, ctrl.signal);
      setRows(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) setLoadError(t('batchAdmin.forbidden'));
      else setLoadError(t('batchAdmin.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, canRead, selectedStoreId, fIngredient, fExpiring, t]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Ingredient options for the filter (the store's tracked masters).
  useEffect(() => {
    if (!isAuthenticated || !canRead) { setIngredients([]); return; }
    const ctrl = new AbortController();
    ingredientsAdminApi.list({ page: 0, size: 200 }, ctrl.signal)
      .then((r) => setIngredients(r.items))
      .catch(() => setIngredients([]));
    return () => ctrl.abort();
  }, [isAuthenticated, canRead]);

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US');
  };

  const statusLabel = (s: BatchStatus) => t(`batchAdmin.st.${s}`);

  // ── Write-off ──────────────────────────────────────────────────────────────
  const openWriteOff = (row: BatchRow) => {
    setWError(null);
    setReason('');
    setWriteTarget(row);
  };

  const submitWriteOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writeTarget || !selectedStoreId) return;
    setWError(null);
    if (!reason.trim()) { setWError(t('batchAdmin.errNeedReason')); return; }
    setIsSubmitting(true);
    try {
      await batchesAdminApi.writeOff(selectedStoreId, writeTarget.batchId, reason.trim());
      setWriteTarget(null);
      setFeedback({ kind: 'success', text: t('batchAdmin.writtenOffMsg') });
      void loadData();
    } catch (err) {
      setWError(mapBatchError(err, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Gates ──────────────────────────────────────────────────────────────────
  if (!isAuthenticated || !canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('batchAdmin.title')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('batchAdmin.forbidden') : t('inv.signInPrompt')}</span>
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
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('batchAdmin.title')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">
            {selectedStoreId ? `${t('batchAdmin.description')} · ${selectedStore?.name ?? ''}` : t('batchAdmin.noStoreSelected')}
          </p>
        </div>
        <button type="button" onClick={() => void loadData()} disabled={isLoading || !selectedStoreId}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors self-start">
          <RefreshCw className={`w-3.5 h-3.5 text-[#C48A56] ${isLoading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
        </button>
      </div>

      {feedback && (
        <div className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between gap-2 ${
          feedback.kind === 'success' ? 'border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]' : 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]'}`}>
          <span className="flex items-center gap-2">
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {feedback.text}
          </span>
          <button type="button" onClick={() => setFeedback(null)} aria-label={t('common.close')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div className="lg:col-span-2">
          <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('batchAdmin.filterIngredient')}</label>
          <select value={fIngredient} onChange={(e) => setFIngredient(e.target.value)} className={inputCls}>
            <option value="">{t('batchAdmin.filterAllIngredients')}</option>
            {ingredients.map((i) => <option key={i.ingredientId} value={i.ingredientId}>{i.name} ({i.code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('batchAdmin.filterExpiring')}</label>
          <input type="number" min="0" step="1" placeholder={t('batchAdmin.filterExpiringPlaceholder')}
            value={fExpiring} onChange={(e) => setFExpiring(e.target.value)} className={inputCls} />
        </div>
        <button type="button" onClick={() => { setFIngredient(''); setFExpiring(''); }}
          className="px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">
          {t('batchAdmin.clearFilters')}
        </button>
      </div>

      {!selectedStoreId ? (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('batchAdmin.noStoreSelected')}</div>
      ) : (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] overflow-hidden">
          {loadError && (
            <div className="p-6 text-center space-y-3">
              <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto" />
              <p className="text-xs font-semibold text-[#DC2626]">{loadError}</p>
              <button type="button" onClick={() => void loadData()} className="text-xs font-bold text-[#C48A56] hover:underline">{t('common.retry')}</button>
            </div>
          )}
          {showSkeleton && (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-[#F0EFED] dark:bg-[#26221F] animate-pulse" />)}
            </div>
          )}
          {showEmpty && (
            <div className="p-10 text-center space-y-2">
              <CalendarX2 className="w-6 h-6 text-[#8C7C6B] mx-auto" />
              <p className="text-sm font-semibold text-[#6E5E4F]">{t('batchAdmin.empty')}</p>
            </div>
          )}
          {!loadError && !showSkeleton && !showEmpty && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] dark:text-[#A89D94] uppercase text-[10px] tracking-wide">
                  <tr>
                    <th className="py-3 px-4">{t('batchAdmin.colLot')}</th>
                    <th className="py-3 px-4">{t('inv.colName')}</th>
                    <th className="py-3 px-4">{t('batchAdmin.colExpiry')}</th>
                    <th className="py-3 px-4 text-right">{t('batchAdmin.colDaysLeft')}</th>
                    <th className="py-3 px-4 text-right">{t('batchAdmin.colQty')}</th>
                    <th className="py-3 px-4 text-right">{t('inv.colCost')}</th>
                    <th className="py-3 px-4">{t('batchAdmin.colStatus')}</th>
                    <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                  {rows.map((b) => {
                    const pastExpiry = b.daysToExpiry != null && b.daysToExpiry < 0;
                    const soon = b.daysToExpiry != null && b.daysToExpiry >= 0 && b.daysToExpiry <= 7;
                    return (
                      <tr key={b.batchId} className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[#C48A56]">{b.lotNumber}</td>
                        <td className="py-3 px-4 font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">
                          {b.ingredientName} <span className="font-mono text-[#8C7C6B]">({b.ingredientCode})</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
                          {b.expiryDate ? fmtDate(b.expiryDate) : t('batchAdmin.noExpiry')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {b.daysToExpiry == null ? '—' : (
                            <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold ${
                              pastExpiry ? 'text-[#DC2626]' : soon ? 'text-[#D97706]' : 'text-[#6E5E4F] dark:text-[#A89D94]'}`}>
                              {(pastExpiry || soon) && <CalendarClock className="w-3.5 h-3.5" />}
                              {pastExpiry ? `${Math.abs(b.daysToExpiry)} ${t('batchAdmin.daysOverdue')}` : `${b.daysToExpiry} ${t('batchAdmin.daysLeft')}`}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[#1C1A19] dark:text-[#F5F3F0]">
                          {b.quantityBase.toLocaleString()} <span className="text-[#8C7C6B]">{b.baseUnitCode}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[#6E5E4F] dark:text-[#A89D94]">{`$${Number(b.unitCost).toFixed(2)}`}</td>
                        <td className="py-3 px-4">
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[b.status]}`}>{statusLabel(b.status)}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end">
                            {b.status === 'ACTIVE' && b.quantityBase > 0 && (
                              canAdjust ? (
                                <button type="button" onClick={() => openWriteOff(b)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#DC2626]/30 text-[#DC2626] hover:bg-[#DC2626]/10 px-2 py-1 text-[11px] font-bold transition-colors">
                                  <Flame className="w-3.5 h-3.5" /> {t('batchAdmin.writeOff')}
                                </button>
                              ) : (
                                <span className="text-[10px] text-[#8C7C6B]" title={t('batchAdmin.readOnlyHint')}>—</span>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Write-off modal */}
      {writeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setWriteTarget(null)}>
          <form onSubmit={submitWriteOff} onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-lg rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('batchAdmin.writeOffTitle')}</h3>
              <button type="button" onClick={() => setWriteTarget(null)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            <div className="rounded-xl bg-[#F7F5F2] dark:bg-[#26221F] p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-[#6E5E4F] dark:text-[#A89D94]">{t('batchAdmin.colLot')}</span><span className="font-mono font-bold text-[#C48A56]">{writeTarget.lotNumber}</span></div>
              <div className="flex justify-between"><span className="text-[#6E5E4F] dark:text-[#A89D94]">{t('inv.colName')}</span><span className="font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{writeTarget.ingredientName}</span></div>
              <div className="flex justify-between"><span className="text-[#6E5E4F] dark:text-[#A89D94]">{t('batchAdmin.colQty')}</span><span className="font-mono text-[#1C1A19] dark:text-[#F5F3F0]">{writeTarget.quantityBase.toLocaleString()} {writeTarget.baseUnitCode}</span></div>
              <div className="flex justify-between"><span className="text-[#6E5E4F] dark:text-[#A89D94]">{t('batchAdmin.colExpiry')}</span><span className="font-mono text-[#1C1A19] dark:text-[#F5F3F0]">{writeTarget.expiryDate ? fmtDate(writeTarget.expiryDate) : t('batchAdmin.noExpiry')}</span></div>
            </div>

            <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">{t('batchAdmin.writeOffHint')}</p>

            <div>
              <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('batchAdmin.fieldReason')} *</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
                placeholder={t('batchAdmin.reasonPlaceholder')} className={inputCls} />
            </div>

            {wError && (
              <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {wError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setWriteTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold disabled:opacity-60 transition-colors">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
                {t('batchAdmin.confirmWriteOff')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/** Map a batch write-off ApiError onto a localized message. */
function mapBatchError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'BATCH_NOT_FOUND': return t('batchAdmin.errNotFound');
      case 'BATCH_NOT_ACTIVE': return t('batchAdmin.errNotActive');
      case 'BATCH_EMPTY': return t('batchAdmin.errEmpty');
      case 'STORE_MISMATCH': return t('batchAdmin.errStoreMismatch');
      case 'INSUFFICIENT_STOCK': return t('batchAdmin.errInsufficient');
      case 'STORE_ACCESS_DENIED': return t('batchAdmin.errForbidden');
      case 'AUTH_FORBIDDEN': return t('batchAdmin.errForbidden');
      default:
        if (err.status === 403) return t('batchAdmin.errForbidden');
        if (err.status === 404) return t('batchAdmin.errNotFound');
        if (err.status === 400) return err.message || t('batchAdmin.errValidation');
        if (err.isNetworkError) return t('batchAdmin.errNetwork');
        return `${err.code}`;
    }
  }
  return t('batchAdmin.errNetwork');
}

const inputCls = 'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40';
