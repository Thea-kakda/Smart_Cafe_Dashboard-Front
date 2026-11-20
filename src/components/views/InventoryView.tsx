/**
 * Store Inventory view backed by the real inventory API (§1.5). On-hand
 * balances are read from GET /api/v1/stores/{storeId}/inventory, stock changes
 * are committed through the guarded POST /adjustments command (IN/OUT with a
 * mandatory reason, optimistic floor → 409 INSUFFICIENT_STOCK), and the ledger
 * is read from GET /movements. Ingredient master CRUD (create/edit) lives on the
 * dedicated Ingredient Master view (POST/PATCH /api/v1/ingredients under
 * ingredient:manage); this store-scoped view intentionally handles on-hand stock
 * only, so a freshly created ingredient appears here once a stock movement seeds
 * its balance — never as a fake local mutation.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  AlertTriangle,
  Search,
  Info,
  CheckCircle2,
  X,
  RefreshCw,
  ArrowLeftRight,
  Lock,
  PackagePlus,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { ApiError } from '../../lib/api';
import {
  InventoryBalanceRow,
  StockMovementRow,
  inventoryAdminApi,
  toInventoryItem,
} from '../../lib/inventoryAdmin';
import {
  reorderAdminApi,
  ReorderSuggestionRow,
  ReorderInput,
} from '../../lib/inventoryMgmtAdmin';
import { suppliersAdminApi, SupplierRow } from '../../lib/purchaseAdmin';
import { InventoryItem } from '../../types';
import { Paginated } from '../../lib/management';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

const REASONS = [
  'Supplier Delivery Restock',
  'Daily Inventory Discrepancy Correction',
  'Kitchen Recipe Waste & Spoilage',
  'Inter-Branch Stock Transfer',
];

export const InventoryView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const { selectedStore, selectedStoreId } = useStore();

  const canRead = hasPermission('inventory:read');
  const canAdjust = hasPermission('inventory:adjust');
  const canReorder = hasPermission('inventory:reorder');

  const [raw, setRaw] = useState<InventoryBalanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Adjust modal
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(1);
  const [adjustAction, setAdjustAction] = useState<'ADD' | 'DEDUCT'>('ADD');
  const [adjustReason, setAdjustReason] = useState<string>(REASONS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Movement ledger panel
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movements, setMovements] = useState<Paginated<StockMovementRow> | null>(null);
  const [mvLoading, setMvLoading] = useState(false);
  const [mvPage, setMvPage] = useState(0);
  const [mvSize, setMvSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [mvError, setMvError] = useState<ApiError | null>(null);

  // Reorder / low-stock panel (M2)
  const [reorderOpen, setReorderOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ReorderSuggestionRow[]>([]);
  const [roLoading, setRoLoading] = useState(false);
  const [roError, setRoError] = useState<ApiError | null>(null);
  const [roQty, setRoQty] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [draftSupplier, setDraftSupplier] = useState('');
  const [draftExpected, setDraftExpected] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  // ── Balances ──────────────────────────────────────────────────────────────
  const loadBalances = useCallback(async () => {
    if (!isAuthenticated || !canRead || !selectedStoreId) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    try {
      setRaw(await inventoryAdminApi.list(selectedStoreId, controller.signal));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Inventory could not be loaded.'));
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [isAuthenticated, canRead, selectedStoreId]);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances, reloadKey]);

  const items = useMemo(() => raw.map(toInventoryItem), [raw]);

  const filtered = items.filter((i) => {
    const matchesSearch =
      i.ingredientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.ingredientCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLowStock = !filterLowStockOnly || i.isLowStock;
    return matchesSearch && matchesLowStock;
  });

  // ── Movements ───────────────────────────────────────────────────────────────
  const loadMovements = useCallback(async () => {
    if (!isAuthenticated || !canRead || !selectedStoreId) return;
    const controller = new AbortController();
    setMvLoading(true);
    setMvError(null);
    try {
      setMovements(await inventoryAdminApi.movements(selectedStoreId, { page: mvPage, size: mvSize }, controller.signal));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      setMvError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Movement ledger could not be loaded.'));
    } finally {
      if (!controller.signal.aborted) setMvLoading(false);
    }
  }, [isAuthenticated, canRead, selectedStoreId, mvPage, mvSize]);

  useEffect(() => {
    if (movementsOpen) void loadMovements();
  }, [movementsOpen, loadMovements]);

  // ── Reorder / low-stock (M2) ──────────────────────────────────────────────
  const loadSuggestions = useCallback(async () => {
    if (!isAuthenticated || !canRead || !selectedStoreId) return;
    const controller = new AbortController();
    setRoLoading(true);
    setRoError(null);
    try {
      const [sugg, sup] = await Promise.all([
        reorderAdminApi.suggestions(selectedStoreId, controller.signal),
        canReorder ? suppliersAdminApi.list({ size: 100 }, controller.signal).then((r) => r.items.filter((s) => s.active)) : Promise.resolve([] as SupplierRow[]),
      ]);
      setSuggestions(sugg);
      setSuppliers(sup);
      // Seed each line's quantity with the server suggestion (clamped at 0).
      setRoQty(Object.fromEntries(sugg.map((s) => [s.ingredientId, String(Math.max(0, s.suggestedQuantity))])));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      setRoError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Reorder suggestions could not be loaded.'));
    } finally {
      if (!controller.signal.aborted) setRoLoading(false);
    }
  }, [isAuthenticated, canRead, canReorder, selectedStoreId]);

  useEffect(() => {
    if (reorderOpen) void loadSuggestions();
  }, [reorderOpen, loadSuggestions]);

  const draftPurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    setDraftError(null);
    if (!draftSupplier) { setDraftError(t('inv.reorder.errSupplier')); return; }
    const lines = suggestions
      .map((s) => ({ ingredientId: s.ingredientId, quantity: Number(roQty[s.ingredientId] ?? '0') }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) { setDraftError(t('inv.reorder.errNoLines')); return; }
    const input: ReorderInput = {
      supplierId: draftSupplier,
      expectedAt: draftExpected ? new Date(draftExpected).toISOString() : null,
      notes: draftNotes.trim() || null,
      lines,
    };
    setIsDrafting(true);
    try {
      const po = await reorderAdminApi.reorder(selectedStoreId, input);
      setDraftError(null);
      showFeedback(t('inv.reorder.drafted').replace('{n}', po.poNumber));
      setReorderOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'SUPPLIER_NOT_FOUND') setDraftError(t('inv.reorder.errSupplier'));
        else if (err.code === 'INGREDIENT_NOT_FOUND') setDraftError(t('inv.reorder.errIngredient'));
        else if (err.isForbidden) setDraftError(t('inv.reorder.forbidden'));
        else if (err.status === 400) setDraftError(err.message || t('inv.reorder.errValidation'));
        else setDraftError(t('inv.networkError'));
      } else setDraftError(t('inv.networkError'));
    } finally {
      setIsDrafting(false);
    }
  };

  // ── Adjust commit ────────────────────────────────────────────────────────
  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem || !selectedStoreId) return;
    setIsSubmitting(true);
    setAdjustError(null);
    try {
      const result = await inventoryAdminApi.adjust(selectedStoreId, {
        ingredientId: adjustingItem.id,
        direction: adjustAction === 'ADD' ? 'IN' : 'OUT',
        quantity: Number(adjustQty),
        reason: adjustReason,
        type: 'ADJUSTMENT',
      });
      setAdjustingItem(null);
      const unit = adjustingItem.baseUnit;
      showFeedback(
        locale === 'km'
          ? `បានកត់ត្រាការកែសម្រួល ${result.direction === 'IN' ? '+' : '-'}${result.quantity} ${unit} (${result.transactionNumber})`
          : `Adjustment recorded: ${result.direction === 'IN' ? '+' : '-'}${result.quantity} ${unit} · ${result.transactionNumber}`,
      );
      setReloadKey((k) => k + 1);
      if (movementsOpen) void loadMovements();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isConflict) setAdjustError(locale === 'km' ? 'បរិមាណដកលើសស្តុកមាន' : 'Deduct quantity exceeds available stock.');
        else if (err.isForbidden) setAdjustError(t('inv.adjustForbidden'));
        else if (err.isNetworkError) setAdjustError(t('inv.networkError'));
        else setAdjustError(`${err.code}`);
      } else {
        setAdjustError(t('inv.networkError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Gates ─────────────────────────────────────────────────────────────────
  if (!isAuthenticated || !canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.inventory')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('inv.readForbidden') : t('inv.signInPrompt')}</span>
        </div>
      </div>
    );
  }

  const initialLoading = isLoading && raw.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
              {t('nav.inventory')}
            </h2>
            <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">
              {t('inv.adjustBadge')}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1 max-w-2xl">
            {selectedStoreId ? t('inv.description') : t('inv.noStoreSelected')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReorderOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${
              reorderOpen
                ? 'bg-[#C48A56] text-white border-[#C48A56]'
                : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:border-[#C48A56]'
            }`}
          >
            <PackagePlus className="w-4 h-4" />
            <span>{t('inv.reorder.button')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMovementsOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${
              movementsOpen
                ? 'bg-[#C48A56] text-white border-[#C48A56]'
                : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:border-[#C48A56]'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>{t('inv.movements')}</span>
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={isLoading}
            title={t('common.refresh')}
            className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-[#2E7D32]/30 bg-[#2E7D32]/10 p-3 text-xs text-[#2E7D32] font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Ingredient master CRUD lives in the Ingredient Master view; point users there */}
      <div className="rounded-xl border border-[#D97706]/30 bg-[#D97706]/10 p-3.5 text-xs text-[#8C7C6B] flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-[#D97706] uppercase tracking-wide text-[10px]">{t('inv.ingredientCrudGapTitle')}</p>
          <p className="mt-0.5 text-[#6E5E4F] dark:text-[#A89D94]">{t('inv.ingredientCrudGapBody')}</p>
        </div>
      </div>

      {!selectedStoreId ? (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('inv.noStoreSelected')}</div>
      ) : (
        <>
          {/* Search and Filters */}
          <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8C7C6B]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('inv.searchPlaceholder')}
                className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] pl-9 pr-4 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                filterLowStockOnly
                  ? 'bg-[#DC2626] text-white border-[#DC2626]'
                  : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]'
              }`}
            >
              {filterLowStockOnly ? t('inv.filterLowStockOn') : t('inv.filterLowStock')}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error.isNetworkError ? t('inv.networkError') : t('inv.loadError')} ({error.code})</span>
              </div>
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold hover:bg-[#B91C1C]">{t('common.retry')}</button>
            </div>
          )}

          {initialLoading && (
            <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 animate-pulse space-y-3">
              <div className="h-4 w-1/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
            </div>
          )}

          {!initialLoading && !error && filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B] flex flex-col items-center gap-2">
              <Boxes className="w-6 h-6" />
              {t('inv.empty')}
            </div>
          )}

          {!initialLoading && filtered.length > 0 && (
            <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">{t('inv.colName')}</th>
                      <th className="py-3 px-4">{t('inv.colCode')}</th>
                      <th className="py-3 px-4 text-center">{t('inv.colUnit')}</th>
                      <th className="py-3 px-4 text-right">{t('inv.colCurrent')}</th>
                      <th className="py-3 px-4 text-right">{t('inv.colReserved')}</th>
                      <th className="py-3 px-4 text-right">{t('inv.colAvailable')}</th>
                      <th className="py-3 px-4 text-right">{t('inv.colMin')}</th>
                      <th className="py-3 px-4 text-center">{t('inv.colStatus')}</th>
                      <th className="py-3 px-4 text-right">{t('inv.colCost')}</th>
                      <th className="py-3 px-4 text-center">{t('inv.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
                    {filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold">{item.ingredientName}</td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-[#8C7C6B]">{item.ingredientCode}</td>
                        <td className="py-3.5 px-4 text-center font-semibold text-[#8C7C6B]">{item.baseUnit}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold">{item.currentStock.toFixed(1)}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-[#8C7C6B]">{item.reservedStock.toFixed(1)}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[#C48A56]">{item.availableStock.toFixed(1)}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-[#8C7C6B]">{item.minimumStock.toFixed(1)}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            item.isLowStock ? 'bg-[#DC2626]/10 text-[#DC2626]' : 'bg-[#2E7D32]/10 text-[#2E7D32]'
                          }`}>
                            {item.isLowStock ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            {item.isLowStock ? t('badge.lowStock') : t('badge.inStock')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold">
                          {item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {canAdjust ? (
                            <button
                              type="button"
                              onClick={() => { setAdjustingItem(item); setAdjustError(null); setAdjustQty(1); }}
                              className="px-2 py-1 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] hover:border-[#C48A56] text-[#C48A56] hover:bg-[#C48A56]/10 text-[11px] font-semibold transition-colors"
                            >
                              {t('inv.adjust')}
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#8C7C6B]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Movement Ledger panel */}
      {movementsOpen && selectedStoreId && (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E3DF] dark:border-[#2B2522]">
            <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0] flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[#C48A56]" /> {t('inv.movementsTitle')}
            </h3>
            <button type="button" onClick={() => setMovementsOpen(false)} className="text-[#8C7C6B] hover:text-[#1C1A19]"><X className="w-4 h-4" /></button>
          </div>

          {mvError && (
            <div className="p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
              <span>{mvError.isNetworkError ? t('inv.networkError') : t('inv.loadError')} ({mvError.code})</span>
              <button type="button" onClick={() => void loadMovements()} className="px-2 py-1 rounded-lg bg-[#DC2626] text-white font-bold">{t('common.retry')}</button>
            </div>
          )}

          {mvLoading && <div className="p-5 text-xs text-[#8C7C6B] flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> {t('common.loading')}</div>}

          {!mvLoading && movements && movements.items.length === 0 && (
            <div className="p-6 text-center text-xs text-[#8C7C6B]">{t('inv.movementsEmpty')}</div>
          )}

          {!mvLoading && movements && movements.items.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-4">{t('inv.colTxn')}</th>
                      <th className="py-2.5 px-4">{t('inv.colType')}</th>
                      <th className="py-2.5 px-4">{t('inv.colName')}</th>
                      <th className="py-2.5 px-4 text-right">{t('inv.colDelta')}</th>
                      <th className="py-2.5 px-4 text-right">{t('inv.colBalance')}</th>
                      <th className="py-2.5 px-4">{t('inv.colOccurred')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
                    {movements.items.map((mv) => (
                      <tr key={mv.transactionId} className="hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-[#8C7C6B]">{mv.transactionNumber}</td>
                        <td className="py-2.5 px-4"><span className="rounded-md bg-[#F0EFED] dark:bg-[#2B2522] px-1.5 py-0.5 text-[10px] font-semibold">{mv.transactionType}</span></td>
                        <td className="py-2.5 px-4">{mv.ingredientName}</td>
                        <td className={`py-2.5 px-4 text-right font-mono font-bold ${mv.delta >= 0 ? 'text-[#2E7D32]' : 'text-[#DC2626]'}`}>
                          {mv.delta >= 0 ? '+' : ''}{mv.delta.toFixed(1)} {mv.unitCode}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono">{mv.balanceAfter.toFixed(1)}</td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] text-[#8C7C6B]">
                          {new Date(mv.occurredAt).toLocaleString(locale === 'km' ? 'km-KH' : 'en-US')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={movements.pagination.page}
                size={mvSize}
                totalElements={movements.pagination.totalElements}
                totalPages={movements.pagination.totalPages}
                onPageChange={setMvPage}
                onSizeChange={setMvSize}
                disabled={mvLoading}
              />
            </>
          )}
        </div>
      )}

      {/* Reorder / low-stock panel (M2) — reads under inventory:read, drafts a DRAFT PO under inventory:reorder */}
      {reorderOpen && selectedStoreId && (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E3DF] dark:border-[#2B2522]">
            <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0] flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-[#C48A56]" /> {t('inv.reorder.title')}
            </h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void loadSuggestions()} disabled={roLoading} title={t('common.refresh')} className="p-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${roLoading ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={() => setReorderOpen(false)} className="text-[#8C7C6B] hover:text-[#1C1A19]"><X className="w-4 h-4" /></button>
            </div>
          </div>

          {roError && (
            <div className="p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
              <span>{roError.isNetworkError ? t('inv.networkError') : t('inv.reorder.loadError')} ({roError.code})</span>
              <button type="button" onClick={() => void loadSuggestions()} className="px-2 py-1 rounded-lg bg-[#DC2626] text-white font-bold">{t('common.retry')}</button>
            </div>
          )}

          {roLoading && <div className="p-5 text-xs text-[#8C7C6B] flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> {t('common.loading')}</div>}

          {!roLoading && !roError && suggestions.length === 0 && (
            <div className="p-6 text-center text-xs text-[#8C7C6B]">{t('inv.reorder.empty')}</div>
          )}

          {!roLoading && !roError && suggestions.length > 0 && (
            <form onSubmit={draftPurchaseOrder} className="space-y-3 p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-4">{t('inv.colName')}</th>
                      <th className="py-2.5 px-4 text-center">{t('inv.colUnit')}</th>
                      <th className="py-2.5 px-4 text-right">{t('inv.colAvailable')}</th>
                      <th className="py-2.5 px-4 text-right">{t('inv.reorder.colReorderPoint')}</th>
                      <th className="py-2.5 px-4 text-right">{t('inv.reorder.colMax')}</th>
                      <th className="py-2.5 px-4 text-right">{t('inv.reorder.colSuggest')}</th>
                      <th className="py-2.5 px-4 text-right">{t('inv.reorder.colQty')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
                    {suggestions.map((s) => (
                      <tr key={s.ingredientId} className="hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40">
                        <td className="py-2.5 px-4 font-semibold">{s.ingredientName} <span className="font-mono text-[11px] text-[#8C7C6B]">({s.ingredientCode})</span></td>
                        <td className="py-2.5 px-4 text-center text-[#8C7C6B]">{s.baseUnitCode}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-[#DC2626] font-bold">{s.availableStock.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-[#8C7C6B]">{s.reorderPoint.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-[#8C7C6B]">{s.maxStock != null ? s.maxStock.toFixed(1) : '—'}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-[#C48A56]">{s.suggestedQuantity.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right">
                          <input
                            type="number" step="0.0001" min="0"
                            value={roQty[s.ingredientId] ?? ''}
                            onChange={(ev) => setRoQty((prev) => ({ ...prev, [s.ingredientId]: ev.target.value }))}
                            disabled={!canReorder}
                            className="w-24 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-2 py-1 text-right font-mono text-xs disabled:opacity-60"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canReorder ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-[#E5E3DF] dark:border-[#2B2522]">
                  <div>
                    <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('inv.reorder.fieldSupplier')} *</label>
                    <select value={draftSupplier} onChange={(e) => setDraftSupplier(e.target.value)} className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs">
                      <option value="">— {t('inv.reorder.selectSupplier')} —</option>
                      {suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.name} ({s.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('inv.reorder.fieldExpected')}</label>
                    <input type="date" value={draftExpected} onChange={(e) => setDraftExpected(e.target.value)} className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('inv.reorder.fieldNotes')}</label>
                    <input type="text" value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} maxLength={1000} className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs" />
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[#8C7C6B] pt-1 border-t border-[#E5E3DF] dark:border-[#2B2522]">{t('inv.reorder.readOnlyHint')}</p>
              )}

              {draftError && (
                <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-2.5 text-[11px] text-[#DC2626] font-semibold">{draftError}</div>
              )}

              {canReorder && (
                <div className="flex items-center justify-end pt-1">
                  <button type="submit" disabled={isDrafting} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-60 transition-colors">
                    <PackagePlus className="w-4 h-4" /> {t('inv.reorder.draftPo')}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {/* ADJUST STOCK MODAL — the only supported inventory write */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DF] dark:border-[#2B2522]">
              <div>
                <h3 className="text-base font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('inv.adjustTitle')}: {adjustingItem.ingredientName}</h3>
                <p className="text-xs text-[#8C7C6B]">{t('inv.adjustCurrent')}: {adjustingItem.currentStock} {adjustingItem.baseUnit}</p>
              </div>
              <button type="button" onClick={() => setAdjustingItem(null)} className="text-[#8C7C6B] hover:text-[#1C1A19]"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleAdjust} className="space-y-3">
              <div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setAdjustAction('ADD')} className={`py-2 text-xs font-bold rounded-xl border transition-all ${adjustAction === 'ADD' ? 'bg-[#2E7D32] text-white border-[#2E7D32]' : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94]'}`}>
                    {t('inv.addRestock')}
                  </button>
                  <button type="button" onClick={() => setAdjustAction('DEDUCT')} className={`py-2 text-xs font-bold rounded-xl border transition-all ${adjustAction === 'DEDUCT' ? 'bg-[#DC2626] text-white border-[#DC2626]' : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94]'}`}>
                    {t('inv.deductWaste')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('inv.quantity')} ({adjustingItem.baseUnit})</label>
                <input type="number" step="0.1" min={0.1} required value={adjustQty} onChange={(e) => setAdjustQty(Number(e.target.value))} className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs font-mono font-bold" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('staff.fieldReason')}</label>
                <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs">
                  {REASONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
              </div>

              {adjustError && (
                <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-2.5 text-[11px] text-[#DC2626] font-semibold">{adjustError}</div>
              )}

              <div className="pt-2 flex gap-2">
                <button type="button" onClick={() => setAdjustingItem(null)} className="flex-1 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] py-2 text-xs font-bold text-[#6E5E4F] dark:text-[#A89D94]">{t('common.cancel')}</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl bg-[#C48A56] py-2 text-xs font-bold text-white hover:bg-[#B37947] disabled:opacity-60">
                  {isSubmitting ? t('inv.adjusting') : t('inv.commit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
