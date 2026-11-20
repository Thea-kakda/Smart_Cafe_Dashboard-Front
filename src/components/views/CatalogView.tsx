/**
 * Product Catalog view backed by the protected branch-product API
 * (GET /api/v1/management/stores/{storeId}/store-products, permission
 * branch-product:read) and the public categories endpoint. Search and category
 * filtering are executed server-side. This view is intentionally read-only:
 * price / availability configuration is edited in Branch Pricing, and the
 * catalog row contract exposes no image column, so images simply are not shown
 * rather than being fabricated.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Eye, Loader2, AlertCircle, Lock, Store as StoreIcon, Plus, CheckCircle2, X } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  CategoryRow,
  fetchCategories,
  storeProductsApi,
  toProductSummary,
} from '../../lib/storeProducts';
import { ProductSummary } from '../../types';
import AddProductToBranchModal from '../catalog/AddProductToBranchModal';

export const CatalogView: React.FC = () => {
  const { t } = useTranslation();
  const { selectedStore, selectedStoreId } = useStore();
  const { isAuthenticated, hasPermission } = useAuth();

  const canRead = hasPermission('branch-product:read');
  const canManage = hasPermission('branch-product:manage');

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const assignedProductIds = useMemo(() => new Set(products.map((p) => p.id)), [products]);

  useEffect(() => {
    if (!notice) return;
    const h = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(h);
  }, [notice]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [activeProduct, setActiveProduct] = useState<ProductSummary | null>(null);

  // Debounced server-side search.
  useEffect(() => {
    const h = window.setTimeout(() => setSearch(searchInput), 400);
    return () => window.clearTimeout(h);
  }, [searchInput]);

  // Categories (public endpoint, no auth needed).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchCategories(ctrl.signal).then(setCategories).catch(() => setCategories([]));
    return () => ctrl.abort();
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated || !canRead || !selectedStoreId) return;
    const ctrl = new AbortController();
    setIsLoading(true);
    setError(null);
    try {
      const result = await storeProductsApi.list(
        selectedStoreId,
        { search: search || undefined, categoryId: categoryId || undefined, size: 100 },
        ctrl.signal,
      );
      setProducts(result.items.map(toProductSummary));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Catalog could not be loaded.'));
    } finally {
      if (!ctrl.signal.aborted) setIsLoading(false);
    }
  }, [isAuthenticated, canRead, selectedStoreId, search, categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAuthenticated || !canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.catalog')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('catalog.readForbidden') : t('catalog.signInPrompt')}</span>
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
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
              {t('nav.catalog')}
            </h2>
            {!canManage && (
              <span className="rounded-md bg-[#8C7C6B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8C7C6B] uppercase">
                {t('badge.readOnly')}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1 max-w-2xl">
            {selectedStoreId ? `${t('catalog.description')} (${selectedStore?.name})` : t('catalog.noStoreSelected')}
          </p>
        </div>
        {canManage && selectedStoreId && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('catalog.add')}
          </button>
        )}
      </div>

      {notice && (
        <div className="rounded-xl border border-[#2E7D32]/30 bg-[#2E7D32]/10 p-3 text-xs font-semibold text-[#2E7D32] flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label={t('common.close')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {!selectedStoreId ? (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B] flex flex-col items-center gap-2">
          <StoreIcon className="w-6 h-6" /> {t('catalog.noStoreSelected')}
        </div>
      ) : (
        <>
          {/* Filter / Search Bar (server-side) */}
          <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8C7C6B]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('common.search')}
                className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] pl-9 pr-4 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none focus:ring-1 focus:ring-[#C48A56]"
              />
            </div>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full sm:w-auto rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
            >
              <option value="">{t('common.all')} {t('pricing.category')}</option>
              {categories.map((c) => (<option key={c.categoryId} value={c.categoryId}>{c.name}</option>))}
            </select>
          </div>

          {error && (
            <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
              <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error.isNetworkError ? t('pricing.networkError') : t('pricing.loadError')} ({error.code})</span></div>
              <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold hover:bg-[#B91C1C]">{t('common.retry')}</button>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-[#8C7C6B] py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('pricing.loading')}
            </div>
          )}

          {!isLoading && !error && products.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('catalog.empty')}</div>
          )}

          {/* Products Grid */}
          {!isLoading && products.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {products.map((prod) => (
                <div key={prod.id} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] overflow-hidden shadow-xs hover:border-[#C48A56]/60 transition-all flex flex-col justify-between">
                  <div>
                    {prod.imageUrl && (<img src={prod.imageUrl} alt={prod.name} className="w-full h-44 object-cover" />)}
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[#8C7C6B]">{prod.categoryName}</span>
                          <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{prod.name}</h3>
                        </div>
                        <span className="font-mono text-xs font-semibold text-[#8C7C6B]">{prod.code}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-base font-bold text-[#C48A56] font-mono">{prod.effectivePrice.toFixed(2)} {prod.currencyCode}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${prod.isAvailable ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#DC2626]/10 text-[#DC2626]'}`}>
                          {prod.isAvailable ? t('pricing.available') : t('pricing.unavailable')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 pt-0">
                    <button type="button" onClick={() => setActiveProduct(prod)} className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] py-2 text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">
                      <Eye className="w-3.5 h-3.5 text-[#C48A56]" /><span>{t('pricing.viewDetails')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add product to branch (assign master product -> store_products) */}
      {adding && selectedStoreId && (
        <AddProductToBranchModal
          storeId={selectedStoreId}
          assignedProductIds={assignedProductIds}
          onClose={() => setAdding(false)}
          onAdded={(name) => {
            setAdding(false);
            setNotice(name ? `${t('catalog.addedMsg')} ${name}` : t('catalog.addedMsg'));
            void load();
          }}
        />
      )}

      {/* Details Modal */}
      {activeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{activeProduct.name}</h3>
              <button type="button" onClick={() => setActiveProduct(null)} className="text-xs font-semibold text-[#8C7C6B] hover:text-[#1C1A19]">{t('common.close')}</button>
            </div>
            {activeProduct.imageUrl && (<img src={activeProduct.imageUrl} alt={activeProduct.name} className="w-full h-44 rounded-xl object-cover" />)}
            <div className="space-y-2 text-xs divide-y divide-[#E5E3DF] dark:divide-[#2B2522]">
              <div className="flex justify-between py-1.5"><span className="text-[#8C7C6B]">{t('inv.colCode')}</span><span className="font-mono font-bold">{activeProduct.code}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-[#8C7C6B]">{t('pricing.category')}</span><span>{activeProduct.categoryName}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-[#8C7C6B]">{t('catalog.pricingMode')}</span><span className="font-semibold">{activeProduct.pricingMode}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-[#8C7C6B]">{t('pricing.effectivePrice')}</span><span className="font-mono font-bold text-[#C48A56]">{activeProduct.effectivePrice.toFixed(2)} {activeProduct.currencyCode}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-[#8C7C6B]">{t('pricing.preparationTime')}</span><span>{activeProduct.preparationTimeMinutes} {t('pricing.minutes')}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-[#8C7C6B]">{t('catalog.station')}</span><span className="font-semibold">{activeProduct.station}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-[#8C7C6B]">{t('inv.colStatus')}</span><span className={`font-semibold ${activeProduct.isAvailable ? 'text-[#2E7D32]' : 'text-[#DC2626]'}`}>{activeProduct.isAvailable ? t('pricing.available') : t('pricing.unavailable')}</span></div>
            </div>
            <button type="button" onClick={() => setActiveProduct(null)} className="w-full rounded-xl bg-[#C48A56] py-2 text-xs font-bold text-white hover:bg-[#B37947]">{t('common.close')}</button>
          </div>
        </div>
      )}
    </div>
  );
};
