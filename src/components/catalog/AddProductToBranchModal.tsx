/**
 * AddProductToBranchModal — the missing completion step of the product
 * lifecycle.
 *
 * Creating a product in the Dashboard writes catalog master data
 * (POST /api/v1/products) only. Both the customer menu and the Staff POS read
 * the store-scoped catalog (GET /api/v1/stores/{storeId}/catalog), which is
 * backed by an INNER JOIN on catalog.store_products — so a product stays
 * invisible to both until it is explicitly assigned to a branch. That
 * assignment endpoint (POST /api/v1/management/stores/{storeId}/store-products)
 * and its typed client (storeProductsApi.add) already existed but were never
 * wired to any surface. This modal is that surface.
 *
 * It preserves every established backend rule rather than working around them:
 *  - only products NOT already on the branch are offered (unassignedProducts),
 *    so a doomed CONFIGURATION_EXISTS submit is prevented client-side;
 *  - a production station is mandatory and selected from THIS branch's active
 *    stations (the service re-validates existence + activeness + store scope);
 *  - override price is optional (blank = inherit base); the service remains the
 *    authority on currency alignment and numeric precision;
 *  - success is shown only after the backend commits, and errors map to the
 *    specific server code instead of a generic failure or a silent empty state.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { ApiError } from '../../lib/api';
import { productsAdminApi, ManagementProduct } from '../../lib/catalogAdmin';
import {
  storeProductsApi,
  fetchStations,
  StationRow,
  unassignedProducts,
} from '../../lib/storeProducts';

interface Props {
  storeId: string;
  /** Product ids already configured for this branch (excluded from the picker). */
  assignedProductIds: Set<string>;
  onClose: () => void;
  /** Called after a successful add so the parent refreshes its list + toasts. */
  onAdded: (productName: string) => void;
}

const inputCls =
  'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40';

const AddProductToBranchModal: React.FC<Props> = ({ storeId, assignedProductIds, onClose, onAdded }) => {
  const { t } = useTranslation();

  const [masterProducts, setMasterProducts] = useState<ManagementProduct[]>([]);
  const [stations, setStations] = useState<StationRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const [productId, setProductId] = useState('');
  const [stationCode, setStationCode] = useState('');
  const [available, setAvailable] = useState(true);
  const [overridePrice, setOverridePrice] = useState('');
  const [search, setSearch] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    // Master-data read requires product:manage; a 403 is surfaced, not hidden.
    productsAdminApi.list({ size: 200, sort: 'name' }, ctrl.signal)
      .then((res) => setMasterProducts(res.items))
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'ABORTED') return;
        // Master-data read requires product:manage; a 403 or network failure is
        // surfaced as an error state (never silently shown as an empty picker).
        setProductsError(t('catalog.productsLoadError'));
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingProducts(false); });
    fetchStations(storeId, ctrl.signal)
      .then((rows) => setStations(rows.filter((r) => r.active)))
      .catch(() => { /* station list simply stays empty; submit guards it */ });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const assignable = useMemo(
    () => unassignedProducts(masterProducts, assignedProductIds),
    [masterProducts, assignedProductIds],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignable;
    return assignable.filter((p) =>
      p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [assignable, search]);

  const selectedProduct = useMemo(
    () => assignable.find((p) => p.productId === productId) ?? null,
    [assignable, productId],
  );

  const mapServerError = (err: ApiError): string => {
    switch (err.code) {
      case 'CONFIGURATION_EXISTS': return t('catalog.errDuplicate');
      case 'CURRENCY_MISMATCH': return t('catalog.errCurrencyMismatch');
      case 'STATION_NOT_FOUND':
      case 'STATION_INACTIVE':
      case 'STATION_REQUIRED': return t('catalog.errStationNotFound');
      case 'PRODUCT_NOT_FOUND': return t('catalog.errProductNotFound');
      case 'NEGATIVE_PRICE':
      case 'PRICE_SCALE_EXCEEDED': return t('catalog.errPriceInvalid');
      default:
        if (err.isNetworkError) return t('catalog.errAddNetwork');
        return err.message || t('catalog.errAddValidation');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) { setFormError(t('catalog.errProductRequired')); return; }
    if (!stationCode) { setFormError(t('catalog.errStationRequired')); return; }
    const trimmed = overridePrice.trim();
    if (trimmed !== '') {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0 || !/^\d{1,10}(\.\d{1,4})?$/.test(trimmed)) {
        setFormError(t('catalog.errPriceInvalid')); return;
      }
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await storeProductsApi.add(storeId, {
        productId,
        stationCode,
        available,
        overridePrice: trimmed === '' ? null : Number(trimmed),
        soldOutUntil: null,
      });
      onAdded(selectedProduct?.name ?? '');
    } catch (err) {
      setFormError(err instanceof ApiError ? mapServerError(err) : t('catalog.errAddNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('catalog.addTitle')}</h3>
            <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94] mt-0.5">{t('catalog.addDescription')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}>
            <X className="w-4 h-4 text-[#8C7C6B]" />
          </button>
        </div>

        {loadingProducts ? (
          <div className="flex items-center gap-2 text-xs text-[#8C7C6B] py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : productsError ? (
          <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {productsError}
          </div>
        ) : assignable.length === 0 ? (
          <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-3 text-xs font-semibold text-[#B45309] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {t('catalog.noAssignable')}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{t('common.search')}</label>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className={inputCls} />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{t('prodAdmin.fieldName')} *</label>
              <select
                value={productId}
                onChange={(e) => { setProductId(e.target.value); setFormError(null); }}
                className={inputCls}
              >
                <option value="">{t('catalog.selectProduct')}</option>
                {filtered.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.name} · {p.code} · {p.basePrice} {p.currencyCode}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{t('catalog.station')} *</label>
              <select value={stationCode} onChange={(e) => setStationCode(e.target.value)} className={inputCls}>
                <option value="">{t('catalog.selectStation')}</option>
                {stations.map((s) => (
                  <option key={s.stationCode} value={s.stationCode}>{s.stationName} ({s.stationCode})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{t('catalog.fieldOverridePrice')}</label>
              <input type="text" inputMode="decimal" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} placeholder="0.0000" className={inputCls} />
              <p className="text-[11px] text-[#8C7C6B]">{t('catalog.overrideHint')}</p>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="accent-[#C48A56]" />
              {t('catalog.fieldAvailable')}
            </label>
          </>
        )}

        {formError && (
          <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={submitting || !!productsError || assignable.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-60 transition-colors">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddProductToBranchModal;
