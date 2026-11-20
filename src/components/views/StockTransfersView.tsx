import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, X, Lock, RefreshCw, Loader2, ArrowLeftRight,
  Send, PackageCheck, XCircle, Trash2, ArrowRight,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { ApiError } from '../../lib/api';
import {
  stockTransfersAdminApi, StockTransferRow, StockTransferStatus,
  CreateStockTransferInput, CreateStockTransferLineInput,
} from '../../lib/inventoryMgmtAdmin';
import { inventoryAdminApi, InventoryBalanceRow } from '../../lib/inventoryAdmin';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

interface DraftLine {
  ingredientId: string;
  quantity: string;
  unitCost: string;
}

const STATUS_TONE: Record<StockTransferStatus, string> = {
  REQUESTED: 'bg-[#8C7C6B]/15 text-[#8C7C6B]',
  IN_TRANSIT: 'bg-[#2563EB]/15 text-[#2563EB]',
  RECEIVED: 'bg-[#2E7D32]/15 text-[#2E7D32]',
  CANCELLED: 'bg-[#DC2626]/15 text-[#DC2626]',
};

/**
 * Inter-branch stock transfers. A transfer spans two stores, so it is listed for
 * the selected branch (as source OR destination) and the create modal lets the
 * actor pick both endpoints from their accessible branches. Lifecycle is
 * request → dispatch → receive; dispatch debits the source through the guarded
 * backend command (one TRANSFER_OUT ledger) and receive credits the destination
 * (one TRANSFER_IN ledger) — never a local edit. An already-dispatched transfer
 * cannot be cancelled (409 TRANSFER_IN_TRANSIT). Everything is gated by the exact
 * code the server enforces: inventory:transfer + both stores in scope.
 */
export const StockTransfersView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const { stores, selectedStore, selectedStoreId } = useStore();

  const canTransfer = hasPermission('inventory:transfer');

  const [rows, setRows] = useState<StockTransferRow[]>([]);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Create modal
  const [creating, setCreating] = useState(false);
  const [cSource, setCSource] = useState('');
  const [cDest, setCDest] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cLines, setCLines] = useState<DraftLine[]>([{ ingredientId: '', quantity: '', unitCost: '' }]);
  const [sourceIngredients, setSourceIngredients] = useState<InventoryBalanceRow[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);
  const [cError, setCError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const h = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(h);
  }, [feedback]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !canTransfer || !selectedStoreId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await stockTransfersAdminApi.list(selectedStoreId, { page, size }, ctrl.signal);
      setRows(result.items);
      setTotalPages(Math.max(result.pagination.totalPages, 1));
      setTotalElements(result.pagination.totalElements);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) setLoadError(t('transferAdmin.forbidden'));
      else setLoadError(t('transferAdmin.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, canTransfer, selectedStoreId, page, size, t]);

  useEffect(() => { void loadData(); }, [loadData]);

  const statusLabel = (s: StockTransferStatus) => t(`transferAdmin.st.${s}`);

  // ── Create ────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setCError(null);
    setCSource(selectedStoreId);
    setCDest('');
    setCNotes('');
    setCLines([{ ingredientId: '', quantity: '', unitCost: '' }]);
    setSourceIngredients([]);
    setCreating(true);
  };

  // Load the source branch's tracked ingredients whenever the source changes.
  useEffect(() => {
    if (!creating || !cSource) { setSourceIngredients([]); return; }
    const ctrl = new AbortController();
    setLoadingIngredients(true);
    inventoryAdminApi.list(cSource, ctrl.signal)
      .then(setSourceIngredients)
      .catch(() => setSourceIngredients([]))
      .finally(() => setLoadingIngredients(false));
    return () => ctrl.abort();
  }, [creating, cSource]);

  const setLine = (idx: number, patch: Partial<DraftLine>) =>
    setCLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const addLine = () => setCLines((prev) => [...prev, { ingredientId: '', quantity: '', unitCost: '' }]);
  const removeLine = (idx: number) => setCLines((prev) => prev.filter((_, i) => i !== idx));

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCError(null);
    if (!cSource || !cDest) { setCError(t('transferAdmin.errNeedStores')); return; }
    if (cSource === cDest) { setCError(t('transferAdmin.errSameStore')); return; }
    const filled = cLines.filter((l) => l.ingredientId);
    if (filled.length === 0) { setCError(t('transferAdmin.errNeedLine')); return; }
    const parsed = filled.map((l) => ({
      ingredientId: l.ingredientId,
      quantity: Number(l.quantity),
      unitCost: Number(l.unitCost || '0'),
    }));
    if (parsed.some((l) => !(l.quantity > 0))) { setCError(t('transferAdmin.errInvalidQty')); return; }
    if (parsed.some((l) => l.unitCost < 0)) { setCError(t('transferAdmin.errInvalidCost')); return; }
    const ids = parsed.map((l) => l.ingredientId);
    if (new Set(ids).size !== ids.length) { setCError(t('transferAdmin.errDuplicateIngredient')); return; }

    setIsSubmitting(true);
    const input: CreateStockTransferInput = {
      sourceStoreId: cSource,
      destStoreId: cDest,
      notes: cNotes.trim() || null,
      lines: parsed.map<CreateStockTransferLineInput>((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity, unitCost: l.unitCost })),
    };
    try {
      await stockTransfersAdminApi.request(input);
      setCreating(false);
      setFeedback({ kind: 'success', text: t('transferAdmin.createdMsg') });
      void loadData();
    } catch (err) {
      setCError(mapTransferError(err, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Lifecycle actions ──────────────────────────────────────────────────────
  const runAction = async (tr: StockTransferRow, action: 'dispatch' | 'receive' | 'cancel') => {
    setLoadError(null);
    try {
      if (action === 'dispatch') { await stockTransfersAdminApi.dispatch(tr.stockTransferId); setFeedback({ kind: 'success', text: t('transferAdmin.dispatchedMsg') }); }
      else if (action === 'receive') { await stockTransfersAdminApi.receive(tr.stockTransferId); setFeedback({ kind: 'success', text: t('transferAdmin.receivedMsg') }); }
      else { await stockTransfersAdminApi.cancel(tr.stockTransferId); setFeedback({ kind: 'success', text: t('transferAdmin.cancelledMsg') }); }
      void loadData();
    } catch (err) {
      setFeedback({ kind: 'error', text: mapTransferError(err, t) });
    }
  };

  // ── Gates ──────────────────────────────────────────────────────────────────
  if (!isAuthenticated || !canTransfer) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('transferAdmin.title')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('transferAdmin.forbidden') : t('inv.signInPrompt')}</span>
        </div>
      </div>
    );
  }

  const otherStores = stores.filter((s) => s.id !== cSource);
  const showSkeleton = isLoading && rows.length === 0;
  const showEmpty = !isLoading && !loadError && rows.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('transferAdmin.title')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">
            {selectedStoreId ? `${t('transferAdmin.description')} · ${selectedStore?.name ?? ''}` : t('transferAdmin.noStoreSelected')}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={openCreate} disabled={!selectedStoreId}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> {t('transferAdmin.create')}
          </button>
          <button type="button" onClick={() => void loadData()} disabled={isLoading || !selectedStoreId}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 text-[#C48A56] ${isLoading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
          </button>
        </div>
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

      {!selectedStoreId ? (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('transferAdmin.noStoreSelected')}</div>
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
              <ArrowLeftRight className="w-6 h-6 text-[#8C7C6B] mx-auto" />
              <p className="text-sm font-semibold text-[#6E5E4F]">{t('transferAdmin.empty')}</p>
            </div>
          )}
          {!loadError && !showSkeleton && !showEmpty && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] dark:text-[#A89D94] uppercase text-[10px] tracking-wide">
                    <tr>
                      <th className="py-3 px-3"></th>
                      <th className="py-3 px-4">{t('transferAdmin.colNumber')}</th>
                      <th className="py-3 px-4">{t('transferAdmin.colRoute')}</th>
                      <th className="py-3 px-4">{t('transferAdmin.colStatus')}</th>
                      <th className="py-3 px-4 text-right">{t('transferAdmin.colLines')}</th>
                      <th className="py-3 px-4">{t('transferAdmin.colRequested')}</th>
                      <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                    {rows.map((tr) => {
                      const isOpen = expanded === tr.stockTransferId;
                      const totalQty = tr.lines.reduce((a, l) => a + l.quantity, 0);
                      return (
                        <React.Fragment key={tr.stockTransferId}>
                          <tr className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F] transition-colors">
                            <td className="py-3 px-3">
                              <button type="button" onClick={() => setExpanded(isOpen ? null : tr.stockTransferId)} aria-label={t('common.actions')}>
                                {isOpen ? <ArrowRight className="w-4 h-4 rotate-90 text-[#8C7C6B]" /> : <ArrowRight className="w-4 h-4 text-[#8C7C6B]" />}
                              </button>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#C48A56]">{tr.transferNumber}</td>
                            <td className="py-3 px-4 font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">
                              {tr.sourceStoreName} <span className="text-[#8C7C6B]">→</span> {tr.destStoreName}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[tr.status]}`}>{statusLabel(tr.status)}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-[#6E5E4F] dark:text-[#A89D94]">{tr.lines.length} · {totalQty.toLocaleString()}</td>
                            <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-[#8C7C6B]">{new Date(tr.createdAt).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US')}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {tr.status === 'REQUESTED' && (
                                  <ActionButton onClick={() => void runAction(tr, 'dispatch')} tone="primary" icon={<Send className="w-3.5 h-3.5" />} label={t('transferAdmin.dispatch')} />
                                )}
                                {tr.status === 'IN_TRANSIT' && (
                                  <ActionButton onClick={() => void runAction(tr, 'receive')} tone="success" icon={<PackageCheck className="w-3.5 h-3.5" />} label={t('transferAdmin.receive')} />
                                )}
                                {(tr.status === 'REQUESTED' || tr.status === 'IN_TRANSIT') && (
                                  <ActionButton onClick={() => void runAction(tr, 'cancel')} tone="danger" icon={<XCircle className="w-3.5 h-3.5" />} label={t('transferAdmin.cancel')} />
                                )}
                              </div>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-[#FBFBF9] dark:bg-[#151310]">
                              <td colSpan={7} className="px-6 py-3">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-[11px]">
                                    <thead className="text-[#8C7C6B] uppercase text-[9px] tracking-wide">
                                      <tr>
                                        <th className="py-1.5 px-2">{t('inv.colName')}</th>
                                        <th className="py-1.5 px-2 text-center">{t('inv.colUnit')}</th>
                                        <th className="py-1.5 px-2 text-right">{t('transferAdmin.qty')}</th>
                                        <th className="py-1.5 px-2 text-right">{t('inv.colCost')}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
                                      {tr.lines.map((l) => (
                                        <tr key={l.stockTransferLineId}>
                                          <td className="py-1.5 px-2 font-semibold">{l.ingredientName} <span className="font-mono text-[#8C7C6B]">({l.ingredientCode})</span></td>
                                          <td className="py-1.5 px-2 text-center">{l.baseUnitCode}</td>
                                          <td className="py-1.5 px-2 text-right font-mono">{l.quantity.toLocaleString()}</td>
                                          <td className="py-1.5 px-2 text-right font-mono">{`$${Number(l.unitCost).toFixed(2)}`}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {tr.notes && <p className="mt-2 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">{tr.notes}</p>}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={page}
                size={size}
                totalElements={totalElements}
                totalPages={totalPages}
                onPageChange={setPage}
                onSizeChange={setSize}
                disabled={isLoading}
              />
            </>
          )}
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setCreating(false)}>
          <form onSubmit={submitCreate} onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-3xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('transferAdmin.createTitle')}</h3>
              <button type="button" onClick={() => setCreating(false)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('transferAdmin.fieldSource') + ' *'}>
                <select value={cSource} onChange={(e) => setCSource(e.target.value)} className={inputCls}>
                  <option value="">— {t('transferAdmin.selectStore')} —</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </Field>
              <Field label={t('transferAdmin.fieldDest') + ' *'}>
                <select value={cDest} onChange={(e) => setCDest(e.target.value)} className={inputCls}>
                  <option value="">— {t('transferAdmin.selectStore')} —</option>
                  {otherStores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{t('transferAdmin.lines')} *</label>
                <button type="button" onClick={addLine} className="flex items-center gap-1 text-[11px] font-bold text-[#A36C3D] hover:underline">
                  <Plus className="w-3.5 h-3.5" /> {t('transferAdmin.addLine')}
                </button>
              </div>
              {loadingIngredients && (
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[#8C7C6B]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('common.loading')}</p>
              )}
              <div className="space-y-2">
                {cLines.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6">
                      <select value={l.ingredientId} onChange={(e) => setLine(idx, { ingredientId: e.target.value })} className={inputCls}>
                        <option value="">— {t('transferAdmin.selectIngredient')} —</option>
                        {sourceIngredients.map((i) => <option key={i.ingredientId} value={i.ingredientId}>{i.ingredientName} ({i.baseUnitCode}) · {i.currentStock.toLocaleString()}</option>)}
                      </select>
                    </div>
                    <input type="number" step="0.0001" min="0" placeholder={t('transferAdmin.qty')} value={l.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} className={`${inputCls} col-span-3`} />
                    <input type="number" step="0.0001" min="0" placeholder={t('transferAdmin.unitCost')} value={l.unitCost} onChange={(e) => setLine(idx, { unitCost: e.target.value })} className={`${inputCls} col-span-2`} />
                    <button type="button" onClick={() => removeLine(idx)} disabled={cLines.length === 1}
                      className="col-span-1 flex items-center justify-center rounded-lg p-2 text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Field label={t('transferAdmin.fieldNotes')}>
              <textarea value={cNotes} onChange={(e) => setCNotes(e.target.value)} rows={2} maxLength={1000} className={inputCls} />
            </Field>

            {cError && (
              <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {cError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-60 transition-colors">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('transferAdmin.saveRequest')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const ActionButton: React.FC<{ onClick: () => void; tone: 'primary' | 'danger' | 'success'; icon: React.ReactNode; label: string }> = ({ onClick, tone, icon, label }) => {
  const tones: Record<string, string> = {
    primary: 'text-[#2563EB] hover:bg-[#2563EB]/10 border-[#2563EB]/30',
    danger: 'text-[#DC2626] hover:bg-[#DC2626]/10 border-[#DC2626]/30',
    success: 'text-[#2E7D32] hover:bg-[#2E7D32]/10 border-[#2E7D32]/30',
  };
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors ${tones[tone]}`}>
      {icon} {label}
    </button>
  );
};

/** Map a transfer ApiError onto a localized message. */
function mapTransferError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'SAME_STORE': return t('transferAdmin.errSameStore');
      case 'DUPLICATE_LINE': return t('transferAdmin.errDuplicateIngredient');
      case 'INGREDIENT_NOT_FOUND': return t('transferAdmin.errIngredientNotFound');
      case 'STOCK_TRANSFER_NOT_FOUND': return t('transferAdmin.errNotFound');
      case 'INSUFFICIENT_STOCK': return t('transferAdmin.errInsufficientStock');
      case 'INVALID_STATUS_TRANSITION': return t('transferAdmin.errStatusTransition');
      case 'TRANSFER_IN_TRANSIT': return t('transferAdmin.errInTransit');
      case 'STORE_ACCESS_DENIED': return t('transferAdmin.forbidden');
      case 'AUTH_FORBIDDEN': return t('transferAdmin.forbidden');
      default:
        if (err.status === 403) return t('transferAdmin.forbidden');
        if (err.status === 404) return t('transferAdmin.errNotFound');
        if (err.status === 400) return err.message || t('transferAdmin.errValidation');
        if (err.isNetworkError) return t('transferAdmin.errNetwork');
        return `${err.code}`;
    }
  }
  return t('transferAdmin.errNetwork');
}

const inputCls = 'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{label}</label>
    {children}
  </div>
);
