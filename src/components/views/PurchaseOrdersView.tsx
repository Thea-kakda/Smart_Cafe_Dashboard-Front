import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, X, Lock, RefreshCw, Loader2, ClipboardList,
  ChevronDown, ChevronUp, Trash2, PackageCheck, Send, XCircle, Archive,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { ApiError } from '../../lib/api';
import {
  purchaseOrdersAdminApi, suppliersAdminApi,
  PurchaseOrderRow, PurchaseOrderStatus, SupplierRow,
  CreatePurchaseOrderInput, ReceiveGoodsInput, ReceiveGoodsLineInput,
} from '../../lib/purchaseAdmin';
import { inventoryAdminApi, InventoryBalanceRow } from '../../lib/inventoryAdmin';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

/** Statuses that may be physically received (at least one outstanding line). */
const RECEIVABLE: PurchaseOrderStatus[] = ['SUBMITTED', 'PARTIALLY_RECEIVED'];

interface DraftLine {
  ingredientId: string;
  quantityOrdered: string;
  unitCost: string;
}

interface ReceiveLine {
  ingredientId: string;
  ingredientName: string;
  unitCode: string;
  outstanding: number;
  quantity: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
}

const STATUS_TONE: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'bg-[#8C7C6B]/15 text-[#8C7C6B]',
  SUBMITTED: 'bg-[#2563EB]/15 text-[#2563EB]',
  PARTIALLY_RECEIVED: 'bg-[#D97706]/15 text-[#D97706]',
  RECEIVED: 'bg-[#2E7D32]/15 text-[#2E7D32]',
  CANCELLED: 'bg-[#DC2626]/15 text-[#DC2626]',
  CLOSED: 'bg-[#6E5E4F]/15 text-[#6E5E4F]',
};

/**
 * Store purchase orders and goods receiving. Purchase orders are scoped to the
 * selected branch; lifecycle commands are gated by purchase:manage and the
 * physical receive by inventory:receive — exactly the codes the server enforces.
 * Receiving increments balances through the guarded backend command (never a
 * local edit) and writes one PURCHASE_RECEIPT ledger entry; over-receipt is
 * refused with 409 OVER_RECEIPT. The ingredient picker reuses the branch balance
 * list (the practical set of tracked raw materials).
 */
export const PurchaseOrdersView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const { selectedStore, selectedStoreId } = useStore();

  const canManage = hasPermission('purchase:manage');
  const canReceive = hasPermission('inventory:receive');

  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | ''>('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Picking data for the create modal (loaded lazily when it opens).
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [ingredients, setIngredients] = useState<InventoryBalanceRow[]>([]);

  // Create modal
  const [creating, setCreating] = useState(false);
  const [cSupplier, setCSupplier] = useState('');
  const [cExpected, setCExpected] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cLines, setCLines] = useState<DraftLine[]>([{ ingredientId: '', quantityOrdered: '', unitCost: '' }]);
  const [cError, setCError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Receive modal
  const [receivingPo, setReceivingPo] = useState<PurchaseOrderRow | null>(null);
  const [rLines, setRLines] = useState<ReceiveLine[]>([]);
  const [rError, setRError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const h = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(h);
  }, [feedback]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !canManage || !selectedStoreId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await purchaseOrdersAdminApi.list(selectedStoreId, { status: statusFilter, page, size }, ctrl.signal);
      setRows(result.items);
      setTotalPages(Math.max(result.pagination.totalPages, 1));
      setTotalElements(result.pagination.totalElements);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) setLoadError(t('poAdmin.forbidden'));
      else setLoadError(t('poAdmin.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, canManage, selectedStoreId, statusFilter, page, size, t]);

  useEffect(() => { void loadData(); }, [loadData]);

  const statusLabel = (s: PurchaseOrderStatus) => t(`poAdmin.st.${s}`);

  // ── Create ────────────────────────────────────────────────────────────────
  const openCreate = async () => {
    setCError(null);
    setCSupplier('');
    setCExpected('');
    setCNotes('');
    setCLines([{ ingredientId: '', quantityOrdered: '', unitCost: '' }]);
    setCreating(true);
    // Load pickers on demand (suppliers + this branch's tracked ingredients).
    try {
      const [sup, ing] = await Promise.all([
        suppliersAdminApi.list({ size: 100 }),
        selectedStoreId ? inventoryAdminApi.list(selectedStoreId) : Promise.resolve([]),
      ]);
      setSuppliers(sup.items.filter((s) => s.active));
      setIngredients(ing);
    } catch {
      /* non-fatal: the picker can be empty; user can retry */
    }
  };

  const setLine = (idx: number, patch: Partial<DraftLine>) =>
    setCLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const addLine = () => setCLines((prev) => [...prev, { ingredientId: '', quantityOrdered: '', unitCost: '' }]);
  const removeLine = (idx: number) => setCLines((prev) => prev.filter((_, i) => i !== idx));

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    setCError(null);
    if (!cSupplier) { setCError(t('poAdmin.errSelectSupplier')); return; }
    const filled = cLines.filter((l) => l.ingredientId);
    if (filled.length === 0) { setCError(t('poAdmin.errNeedLine')); return; }
    const parsed = filled.map((l) => ({
      ingredientId: l.ingredientId,
      quantityOrdered: Number(l.quantityOrdered),
      unitCost: Number(l.unitCost || '0'),
    }));
    if (parsed.some((l) => !(l.quantityOrdered > 0))) { setCError(t('poAdmin.errInvalidQty')); return; }
    if (parsed.some((l) => l.unitCost < 0)) { setCError(t('poAdmin.errInvalidCost')); return; }
    const ids = parsed.map((l) => l.ingredientId);
    if (new Set(ids).size !== ids.length) { setCError(t('poAdmin.errDuplicateIngredient')); return; }

    setIsSubmitting(true);
    const input: CreatePurchaseOrderInput = {
      supplierId: cSupplier,
      expectedAt: cExpected ? new Date(cExpected).toISOString() : null,
      notes: cNotes.trim() || null,
      lines: parsed,
    };
    try {
      await purchaseOrdersAdminApi.create(selectedStoreId, input);
      setCreating(false);
      setFeedback({ kind: 'success', text: t('poAdmin.createdMsg') });
      void loadData();
    } catch (err) {
      setCError(mapPoError(err, t, locale));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Lifecycle actions ──────────────────────────────────────────────────────
  const runAction = async (po: PurchaseOrderRow, action: 'submit' | 'cancel' | 'close') => {
    if (!selectedStoreId) return;
    setLoadError(null);
    try {
      if (action === 'submit') { await purchaseOrdersAdminApi.submit(selectedStoreId, po.purchaseOrderId); setFeedback({ kind: 'success', text: t('poAdmin.submittedMsg') }); }
      else if (action === 'cancel') { await purchaseOrdersAdminApi.cancel(selectedStoreId, po.purchaseOrderId); setFeedback({ kind: 'success', text: t('poAdmin.cancelledMsg') }); }
      else { await purchaseOrdersAdminApi.close(selectedStoreId, po.purchaseOrderId); setFeedback({ kind: 'success', text: t('poAdmin.closedMsg') }); }
      void loadData();
    } catch (err) {
      setFeedback({ kind: 'error', text: mapPoError(err, t, locale) });
    }
  };

  // ── Receiving ──────────────────────────────────────────────────────────────
  const openReceive = (po: PurchaseOrderRow) => {
    setRError(null);
    setRLines(po.lines
      .filter((l) => l.outstanding > 0)
      .map((l) => ({
        ingredientId: l.ingredientId,
        ingredientName: l.ingredientName,
        unitCode: l.unitCode,
        outstanding: l.outstanding,
        quantity: String(l.outstanding),
        unitCost: '',
        lotNumber: '',
        expiryDate: '',
      })));
    setReceivingPo(po);
  };

  const setReceiveLine = (idx: number, patch: Partial<ReceiveLine>) =>
    setRLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const submitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId || !receivingPo) return;
    setRError(null);
    const active = rLines.filter((l) => Number(l.quantity) > 0);
    if (active.length === 0) { setRError(t('poAdmin.errReceiveNothing')); return; }
    const over = active.find((l) => Number(l.quantity) > l.outstanding);
    if (over) { setRError(t('poAdmin.errOverReceiptLine')); return; }
    const input: ReceiveGoodsInput = {
      lines: active.map<ReceiveGoodsLineInput>((l) => ({
        ingredientId: l.ingredientId,
        quantity: Number(l.quantity),
        unitCost: l.unitCost.trim() ? Number(l.unitCost) : null,
        lotNumber: l.lotNumber.trim() || null,
        expiryDate: l.expiryDate || null,
      })),
    };
    setIsSubmitting(true);
    try {
      const receipt = await purchaseOrdersAdminApi.receive(selectedStoreId, receivingPo.purchaseOrderId, input);
      setReceivingPo(null);
      setFeedback({ kind: 'success', text: t('poAdmin.receivedMsg').replace('{n}', receipt.receiptNumber) });
      void loadData();
    } catch (err) {
      setRError(mapPoError(err, t, locale));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Gates ──────────────────────────────────────────────────────────────────
  if (!isAuthenticated || !canManage) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('poAdmin.title')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('poAdmin.forbidden') : t('inv.signInPrompt')}</span>
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
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('poAdmin.title')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">
            {selectedStoreId ? `${t('poAdmin.description')} · ${selectedStore?.name ?? ''}` : t('poAdmin.noStoreSelected')}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => void openCreate()} disabled={!selectedStoreId}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> {t('poAdmin.create')}
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

      {/* Filter */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-4 flex items-center gap-3">
        <label className="text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94]">{t('poAdmin.filterStatus')}</label>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as PurchaseOrderStatus | ''); setPage(0); }}
          className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-1.5 text-xs font-semibold focus:border-[#C48A56] focus:outline-none">
          <option value="">{t('common.all')}</option>
          {(['DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED'] as PurchaseOrderStatus[]).map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </div>

      {!selectedStoreId ? (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('poAdmin.noStoreSelected')}</div>
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
              <ClipboardList className="w-6 h-6 text-[#8C7C6B] mx-auto" />
              <p className="text-sm font-semibold text-[#6E5E4F]">{t('poAdmin.empty')}</p>
            </div>
          )}
          {!loadError && !showSkeleton && !showEmpty && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] dark:text-[#A89D94] uppercase text-[10px] tracking-wide">
                    <tr>
                      <th className="py-3 px-3"></th>
                      <th className="py-3 px-4">{t('poAdmin.colNumber')}</th>
                      <th className="py-3 px-4">{t('poAdmin.colSupplier')}</th>
                      <th className="py-3 px-4">{t('poAdmin.colStatus')}</th>
                      <th className="py-3 px-4">{t('poAdmin.colOrdered')}</th>
                      <th className="py-3 px-4">{t('poAdmin.colExpected')}</th>
                      <th className="py-3 px-4 text-right">{t('poAdmin.colLines')}</th>
                      <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                    {rows.map((po) => {
                      const isOpen = expanded === po.purchaseOrderId;
                      const totalOrdered = po.lines.reduce((a, l) => a + l.quantityOrdered, 0);
                      return (
                        <React.Fragment key={po.purchaseOrderId}>
                          <tr className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F] transition-colors">
                            <td className="py-3 px-3">
                              <button type="button" onClick={() => setExpanded(isOpen ? null : po.purchaseOrderId)} aria-label={t('common.actions')}>
                                {isOpen ? <ChevronUp className="w-4 h-4 text-[#8C7C6B]" /> : <ChevronDown className="w-4 h-4 text-[#8C7C6B]" />}
                              </button>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#C48A56]">{po.poNumber}</td>
                            <td className="py-3 px-4 font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{po.supplierName}</td>
                            <td className="py-3 px-4">
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[po.status]}`}>{statusLabel(po.status)}</span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-[#8C7C6B]">{new Date(po.orderedAt).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US')}</td>
                            <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-[#8C7C6B]">{po.expectedAt ? new Date(po.expectedAt).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US') : '—'}</td>
                            <td className="py-3 px-4 text-right font-mono text-[#6E5E4F] dark:text-[#A89D94]">{po.lines.length} · {totalOrdered.toLocaleString()}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {po.status === 'DRAFT' && canManage && (
                                  <ActionButton onClick={() => void runAction(po, 'submit')} tone="primary" icon={<Send className="w-3.5 h-3.5" />} label={t('poAdmin.submit')} />
                                )}
                                {(po.status === 'DRAFT' || po.status === 'SUBMITTED') && canManage && (
                                  <ActionButton onClick={() => void runAction(po, 'cancel')} tone="danger" icon={<XCircle className="w-3.5 h-3.5" />} label={t('poAdmin.cancel')} />
                                )}
                                {RECEIVABLE.includes(po.status) && canReceive && (
                                  <ActionButton onClick={() => openReceive(po)} tone="success" icon={<PackageCheck className="w-3.5 h-3.5" />} label={t('poAdmin.receive')} />
                                )}
                                {po.status === 'RECEIVED' && canManage && (
                                  <ActionButton onClick={() => void runAction(po, 'close')} tone="neutral" icon={<Archive className="w-3.5 h-3.5" />} label={t('poAdmin.close')} />
                                )}
                              </div>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-[#FBFBF9] dark:bg-[#151310]">
                              <td colSpan={8} className="px-6 py-3">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-[11px]">
                                    <thead className="text-[#8C7C6B] uppercase text-[9px] tracking-wide">
                                      <tr>
                                        <th className="py-1.5 px-2">{t('inv.colName')}</th>
                                        <th className="py-1.5 px-2 text-center">{t('inv.colUnit')}</th>
                                        <th className="py-1.5 px-2 text-right">{t('poAdmin.ordered')}</th>
                                        <th className="py-1.5 px-2 text-right">{t('poAdmin.received')}</th>
                                        <th className="py-1.5 px-2 text-right">{t('poAdmin.outstanding')}</th>
                                        <th className="py-1.5 px-2 text-right">{t('inv.colCost')}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
                                      {po.lines.map((l) => (
                                        <tr key={l.lineId}>
                                          <td className="py-1.5 px-2 font-semibold">{l.ingredientName} <span className="font-mono text-[#8C7C6B]">({l.ingredientCode})</span></td>
                                          <td className="py-1.5 px-2 text-center">{l.unitCode}</td>
                                          <td className="py-1.5 px-2 text-right font-mono">{l.quantityOrdered.toLocaleString()}</td>
                                          <td className="py-1.5 px-2 text-right font-mono text-[#2E7D32]">{l.quantityReceived.toLocaleString()}</td>
                                          <td className="py-1.5 px-2 text-right font-mono text-[#C48A56]">{l.outstanding.toLocaleString()}</td>
                                          <td className="py-1.5 px-2 text-right font-mono">{`$${Number(l.unitCost).toFixed(2)}`}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {po.notes && <p className="mt-2 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">{po.notes}</p>}
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
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('poAdmin.createTitle')}</h3>
              <button type="button" onClick={() => setCreating(false)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('poAdmin.fieldSupplier') + ' *'}>
                <select value={cSupplier} onChange={(e) => setCSupplier(e.target.value)} className={inputCls}>
                  <option value="">— {t('poAdmin.selectSupplier')} —</option>
                  {suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.name} ({s.code})</option>)}
                </select>
              </Field>
              <Field label={t('poAdmin.fieldExpected')}>
                <input type="date" value={cExpected} onChange={(e) => setCExpected(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{t('poAdmin.lines')} *</label>
                <button type="button" onClick={addLine} className="flex items-center gap-1 text-[11px] font-bold text-[#A36C3D] hover:underline">
                  <Plus className="w-3.5 h-3.5" /> {t('poAdmin.addLine')}
                </button>
              </div>
              <div className="space-y-2">
                {cLines.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6">
                      <select value={l.ingredientId} onChange={(e) => setLine(idx, { ingredientId: e.target.value })} className={inputCls}>
                        <option value="">— {t('poAdmin.selectIngredient')} —</option>
                        {ingredients.map((i) => <option key={i.ingredientId} value={i.ingredientId}>{i.ingredientName} ({i.baseUnitCode})</option>)}
                      </select>
                    </div>
                    <input type="number" step="0.0001" min="0" placeholder={t('poAdmin.qty')} value={l.quantityOrdered} onChange={(e) => setLine(idx, { quantityOrdered: e.target.value })} className={`${inputCls} col-span-3`} />
                    <input type="number" step="0.0001" min="0" placeholder={t('poAdmin.unitCost')} value={l.unitCost} onChange={(e) => setLine(idx, { unitCost: e.target.value })} className={`${inputCls} col-span-2`} />
                    <button type="button" onClick={() => removeLine(idx)} disabled={cLines.length === 1}
                      className="col-span-1 flex items-center justify-center rounded-lg p-2 text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Field label={t('poAdmin.fieldNotes')}>
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
                {t('poAdmin.saveDraft')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Receive modal */}
      {receivingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setReceivingPo(null)}>
          <form onSubmit={submitReceive} onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-3xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('poAdmin.receiveTitle')} · {receivingPo.poNumber}</h3>
                <p className="text-[11px] text-[#8C7C6B]">{receivingPo.supplierName}</p>
              </div>
              <button type="button" onClick={() => setReceivingPo(null)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            {rLines.length === 0 ? (
              <p className="text-xs text-[#6E5E4F] dark:text-[#A89D94]">{t('poAdmin.errNothingOutstanding')}</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-wide text-[#8C7C6B] font-semibold px-1">
                  <span className="col-span-4">{t('inv.colName')}</span>
                  <span className="col-span-2 text-right">{t('poAdmin.outstanding')}</span>
                  <span className="col-span-2 text-right">{t('poAdmin.qty')}</span>
                  <span className="col-span-2">{t('poAdmin.lot')}</span>
                  <span className="col-span-2">{t('poAdmin.expiry')}</span>
                </div>
                {rLines.map((l, idx) => (
                  <div key={l.ingredientId} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4 text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] truncate" title={l.ingredientName}>
                      {l.ingredientName} <span className="font-mono text-[#8C7C6B]">/{l.unitCode}</span>
                    </div>
                    <div className="col-span-2 text-right font-mono text-[11px] text-[#C48A56]">{l.outstanding.toLocaleString()}</div>
                    <input type="number" step="0.0001" min="0" max={l.outstanding} value={l.quantity} onChange={(e) => setReceiveLine(idx, { quantity: e.target.value })} className={`${inputCls} col-span-2`} />
                    <input type="text" maxLength={60} value={l.lotNumber} onChange={(e) => setReceiveLine(idx, { lotNumber: e.target.value })} className={`${inputCls} col-span-2`} />
                    <input type="date" value={l.expiryDate} onChange={(e) => setReceiveLine(idx, { expiryDate: e.target.value })} className={`${inputCls} col-span-2`} />
                  </div>
                ))}
              </div>
            )}

            {rError && (
              <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {rError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setReceivingPo(null)}
                className="px-4 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting || rLines.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#256428] text-white text-xs font-bold disabled:opacity-60 transition-colors">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                {t('poAdmin.commitReceipt')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const ActionButton: React.FC<{ onClick: () => void; tone: 'primary' | 'danger' | 'success' | 'neutral'; icon: React.ReactNode; label: string }> = ({ onClick, tone, icon, label }) => {
  const tones: Record<string, string> = {
    primary: 'text-[#2563EB] hover:bg-[#2563EB]/10 border-[#2563EB]/30',
    danger: 'text-[#DC2626] hover:bg-[#DC2626]/10 border-[#DC2626]/30',
    success: 'text-[#2E7D32] hover:bg-[#2E7D32]/10 border-[#2E7D32]/30',
    neutral: 'text-[#6E5E4F] hover:bg-[#6E5E4F]/10 border-[#6E5E4F]/30',
  };
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors ${tones[tone]}`}>
      {icon} {label}
    </button>
  );
};

/** Map a purchasing ApiError onto a localized message. */
function mapPoError(err: unknown, t: (k: string) => string, locale: string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'SUPPLIER_NOT_FOUND': return t('poAdmin.errSupplierNotFound');
      case 'INGREDIENT_NOT_FOUND': return t('poAdmin.errIngredientNotFound');
      case 'PURCHASE_ORDER_NOT_FOUND': return t('poAdmin.errNotFound');
      case 'OVER_RECEIPT': return t('poAdmin.errOverReceipt');
      case 'PO_NOT_RECEIVABLE': return t('poAdmin.errNotReceivable');
      case 'INVALID_STATUS_TRANSITION': return t('poAdmin.errStatusTransition');
      case 'STORE_MISMATCH': return t('poAdmin.errStoreMismatch');
      case 'DUPLICATE_LINE': return t('poAdmin.errDuplicateIngredient');
      case 'VERSION_CONFLICT': return t('poAdmin.errConflict');
      case 'STORE_ACCESS_DENIED': return t('poAdmin.forbidden');
      case 'AUTH_FORBIDDEN': return t('poAdmin.forbidden');
      default:
        if (err.status === 403) return t('poAdmin.forbidden');
        if (err.status === 404) return t('poAdmin.errNotFound');
        if (err.status === 400) return err.message || t('poAdmin.errValidation');
        if (err.isNetworkError) return t('poAdmin.errNetwork');
        return `${err.code}`;
    }
  }
  void locale;
  return t('poAdmin.errNetwork');
}

const inputCls = 'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{label}</label>
    {children}
  </div>
);
