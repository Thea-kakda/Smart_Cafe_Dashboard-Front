/**
 * Round 2 "Inventory" tab (Slice 4A §14). This is a READ-ONLY operational view:
 * it answers "can this product be made right now, and what would it consume"
 * without ever becoming a second place to move stock. The dedicated Inventory
 * module owns adjustments; this surface links to it rather than duplicating it.
 *
 * What is deliberately NOT here:
 *  - no stock-in / stock-out / adjust controls (spec §14: "Do not embed
 *    arbitrary stock adjustment in Product Editor");
 *  - no frontend consumption math — the ingredient quantities come straight from
 *    the server's Consumption Plan preview, never multiplied or summed here;
 *  - no invented "packaging" field: the preview reports what it reports, and the
 *    low-stock cross-reference only flags ingredients the API actually returns.
 *
 * Every fact is fetched live for the selected store, because availability, the
 * resolved recipe and low-stock state are all per-branch.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Boxes, ExternalLink, Loader2, Package, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useAuth } from '../../../context/AuthContext';
import { useStore } from '../../../context/StoreContext';
import { ApiError } from '../../../lib/api';
import {
  AvailabilityPreview, ConsumptionPlanPreview, ProductDetails, ResolvedRecipe,
  availabilityApi, consumptionPlanApi, recipeApi,
} from '../../../lib/productEditor';
import { LowStockRow, reorderAdminApi } from '../../../lib/inventoryMgmtAdmin';
import { editorErrorKey, reasonKey } from '../../../lib/productEditorState';
import { Banner, SectionCard, StaticValue } from '../EditorPrimitives';

export interface InventorySectionProps {
  product: ProductDetails;
  /** Jumps the dashboard to the dedicated Inventory module for stock operations. */
  onOpenInventory?: (tab: string) => void;
}

const errOf = (err: unknown): { code?: string; status: number } =>
  err instanceof ApiError ? { code: err.code, status: err.status } : { status: -1 };

/** Track-inventory is derived from the classification, never a separate guess. */
const isTracked = (stockMode: ProductDetails['stockMode']): boolean => stockMode !== 'NOT_TRACKED';

export const InventorySection: React.FC<InventorySectionProps> = ({ product, onOpenInventory }) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { stores, selectedStoreId, setSelectedStoreId } = useStore();

  const canPreview = hasPermission('branch-product:read') && hasPermission('inventory:read');
  const canReadInventory = hasPermission('inventory:read');
  const storeId = selectedStoreId || stores[0]?.id || '';

  const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
  const [resolved, setResolved] = useState<ResolvedRecipe | null>(null);
  const [plan, setPlan] = useState<ConsumptionPlanPreview | null>(null);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canPreview || !storeId) return;
    setLoading(true);
    setErrorKey(null);
    // Each feed is independent; a missing one (e.g. a store without reorder
    // settings) degrades the view instead of blanking the whole tab.
    try {
      const [av, rc, cp, low] = await Promise.all([
        availabilityApi.preview(storeId, product.productId, { includeOptions: false, quantity: 1 }),
        recipeApi.resolveProduct(product.productId).catch(() => null),
        consumptionPlanApi.preview({ productId: product.productId, productQuantity: 1 }).catch(() => null),
        canReadInventory ? reorderAdminApi.lowStock(storeId).catch(() => [] as LowStockRow[]) : Promise.resolve([] as LowStockRow[]),
      ]);
      setPreview(av);
      setResolved(rc);
      setPlan(cp);
      setLowStock(low ?? []);
    } catch (err) {
      const e = errOf(err);
      setErrorKey(editorErrorKey(e.code, e.status));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [canPreview, canReadInventory, product.productId, storeId]);

  useEffect(() => { void load(); }, [load]);

  const lowIds = useMemo(() => new Set(lowStock.map((r) => r.ingredientId)), [lowStock]);
  const inconsistencies = useMemo(() => {
    const codes = new Set<string>();
    for (const c of preview?.reasonCodes ?? []) if (c === 'INVENTORY_DATA_INCONSISTENT') codes.add(c);
    for (const w of plan?.warnings ?? []) codes.add(w);
    return [...codes];
  }, [preview, plan]);

  if (stores.length === 0) return <Banner tone="info" text={t('channelAdmin.noBranch')} />;

  return (
    <SectionCard
      title={t('productEditor.inventory.title')}
      description={t('productEditor.inventory.description')}
      actions={
        <>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <span>{t('channelAdmin.branch')}</span>
            <select value={storeId} onChange={(e) => setSelectedStoreId(e.target.value)}
              className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2 py-1.5 text-xs font-semibold">
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading || !canPreview}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('common.refresh')}
          </button>
        </>
      }
    >
      {!canPreview && <Banner tone="info" text={t('previewAdmin.forbidden')} />}

      <Banner tone="info" text={t('productEditor.inventory.readOnlyNote')} />

      {errorKey && <Banner tone="bad" role="alert" text={t(errorKey)} dismissLabel={t('common.close')} onDismiss={() => setErrorKey(null)} />}
      {loading && !preview && (
        <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>
      )}

      {inconsistencies.length > 0 && (
        <Banner tone="warn" role="alert" text={`${t('productEditor.inventory.inconsistent')}: ${inconsistencies.map((c) => t(reasonKey(c))).join(', ')}`} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <StaticValue label={t('productEditor.inventory.stockMode')} value={t(`productEditor.stockMode.${product.stockMode}`)} />
        <StaticValue label={t('productEditor.inventory.trackState')}
          value={isTracked(product.stockMode) ? t('previewAdmin.yes') : t('previewAdmin.no')}
          hint={t('productEditor.inventory.trackHint')} />
        <StaticValue label={t('productEditor.inventory.recipeState')}
          value={resolved && resolved.recipeVersion
            ? `${t(`productEditor.inventory.resolve.${resolved.source}`)} · v${resolved.recipeVersion.versionNumber}`
            : t('productEditor.inventory.noRecipe')}
          hint={t('productEditor.inventory.recipeHint')} />
      </div>

      {preview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <StaticValue label={t('previewAdmin.baseServings')}
            value={preview.availableBaseServings === null ? t('previewAdmin.notTracked') : String(preview.availableBaseServings)} />
          <StaticValue label={t('previewAdmin.factInStock')} value={preview.inStock ? t('previewAdmin.yes') : t('previewAdmin.no')} />
          <StaticValue label={t('previewAdmin.factOrderable')} value={preview.orderable ? t('previewAdmin.yes') : t('previewAdmin.no')} />
        </div>
      )}

      {preview && preview.reasonCodes.length > 0 && (
        <div className="space-y-1">
          <span className="block text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('previewAdmin.productReasons')}</span>
          <ul className="flex flex-wrap gap-1">
            {preview.reasonCodes.map((c) => (
              <li key={c}>
                <code title={t(reasonKey(c))} className="rounded bg-[#B45309]/10 px-1.5 py-0.5 text-[10px] text-[#B45309]">{c}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Required items: straight from the server's Consumption Plan preview. */}
      <div className="space-y-2">
        <h5 className="flex items-center gap-2 text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
          <Boxes className="w-4 h-4 text-[#8C7C6B]" aria-hidden="true" /> {t('productEditor.inventory.requiredTitle')}
        </h5>
        {plan && plan.lines.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522]">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{t('productEditor.inventory.requiredCaption')}</caption>
              <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] uppercase text-[10px] tracking-wide">
                <tr>
                  <th scope="col" className="py-3 px-3">{t('productEditor.inventory.colIngredient')}</th>
                  <th scope="col" className="py-3 px-3 text-right">{t('productEditor.inventory.colQuantity')}</th>
                  <th scope="col" className="py-3 px-3">{t('productEditor.inventory.colUnit')}</th>
                  <th scope="col" className="py-3 px-3">{t('productEditor.inventory.colSource')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                {plan.lines.map((l) => (
                  <tr key={`${l.ingredientId}-${l.displayOrder}`}>
                    <td className="py-2 px-3 font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
                      {l.ingredientName}
                      {lowIds.has(l.ingredientId) && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-[#DC2626]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#DC2626]">
                          <AlertCircle className="w-3 h-3" aria-hidden="true" /> {t('productEditor.inventory.lowStock')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{String(l.quantity)}</td>
                    <td className="py-2 px-3 text-[#6E5E4F]">{l.baseUnitCode}</td>
                    <td className="py-2 px-3 text-[#6E5E4F]">{t(`productEditor.consumeSource.${l.source}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-4 text-center text-xs text-[#6E5E4F]">
            {resolved && resolved.recipeVersion ? t('productEditor.inventory.noLines') : t('productEditor.inventory.noRecipe')}
          </p>
        )}
        <p className="text-[11px] text-[#6E5E4F]">{t('productEditor.inventory.previewFootnote')}</p>
      </div>

      {/* Stock operations belong to the Inventory module, never to this editor. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#F7F5F2] dark:bg-[#26221F] p-3">
        <p className="flex items-center gap-2 text-xs text-[#6E5E4F]">
          <Package className="w-4 h-4 text-[#8C7C6B]" aria-hidden="true" /> {t('productEditor.inventory.adjustNote')}
        </p>
        {onOpenInventory && (
          <button type="button" onClick={() => onOpenInventory('inventory')}
            className="flex items-center gap-1.5 rounded-xl bg-[#C48A56] px-3 py-2 text-xs font-bold text-white hover:bg-[#A36C3D] transition-colors">
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> {t('productEditor.inventory.openModule')}
          </button>
        )}
      </div>
    </SectionCard>
  );
};
