import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  Coffee,
  AlertCircle,
  RefreshCw,
  Lock,
  Info,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  storeProductsApi,
  fetchCategories,
  toProductSummary,
  CategoryRow,
  StoreProductRow,
} from '../../lib/storeProducts';
import { ProductSummary } from '../../types';

interface CartItem {
  product: ProductSummary;
  quantity: number;
  unitPrice: number;
}

/**
 * Staff POS register PREVIEW. The product grid and prices are now sourced live
 * from the branch-catalog API (no sample data). The cart is a local, ephemeral
 * build-up so a cashier can see a running total — but the dashboard never posts
 * an order or prints a receipt, because real transaction creation, payment
 * capture and change/rounding live in the dedicated POS application and the
 * ordering/payment APIs. The former fake "Dispatch to KDS" (a Math.random order
 * number, fabricated VAT and a client-only success receipt) has been removed
 * rather than faked; the register shows an honest hand-off notice instead.
 */
export const PosView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { selectedStore, selectedStoreId } = useStore();
  const { isAuthenticated } = useAuth();

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Load the branch catalog + public categories from the real API.
  const load = async () => {
    if (!isAuthenticated || !selectedStoreId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const [page, cats] = await Promise.all([
        storeProductsApi.list(selectedStoreId, { size: 200 }, controller.signal),
        fetchCategories(controller.signal).catch(() => [] as CategoryRow[]),
      ]);
      if (controller.signal.aborted) return;
      const rows: StoreProductRow[] = page.items;
      setProducts(rows.map(toProductSummary));
      setCategories(cats);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Catalog could not be loaded.'));
      setProducts([]);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId, isAuthenticated]);

  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchCat = selectedCategory === 'ALL' || prod.categoryId === selectedCategory;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        prod.name.toLowerCase().includes(term) || prod.code.toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchTerm]);

  const addToCart = (product: ProductSummary) => {
    if (!product.isAvailable) return;
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex].quantity += 1;
        return next;
      }
      return [...prev, { product, quantity: 1, unitPrice: product.effectivePrice }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const removeFromCart = (productId: string) => setCart((prev) => prev.filter((i) => i.product.id !== productId));
  const clearCart = () => setCart([]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [cart]);

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.pos')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{t('staff.signInPrompt')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* POS Terminal Header */}
      <div className="rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
            {locale === 'km' ? 'ម៉ាស៊ីនគិតលុយបុគ្គលិក (Staff POS)' : 'Staff POS Register Terminal'}
          </h2>
          <p className="text-xs text-[#6E5E4F] dark:text-[#A89D94] mt-0.5">
            {selectedStore?.name} — {locale === 'km' ? 'តំបន់មើលសាកល្បងកាតាលោក' : 'live catalog preview from the branch-product API'}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#C48A56] ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </button>
      </div>

      {/* Main Layout: Catalog Grid (Left) + Cart / Register Drawer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Product Catalog Grid (REAL API data) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === 'ALL'
                    ? 'bg-[#C48A56] text-white shadow-xs'
                    : 'bg-[#FFFFFF] dark:bg-[#201D19] border border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94]'
                }`}
              >
                {t('common.all')}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.categoryId}
                  type="button"
                  onClick={() => setSelectedCategory(cat.categoryId)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === cat.categoryId
                      ? 'bg-[#C48A56] text-white shadow-xs'
                      : 'bg-[#FFFFFF] dark:bg-[#201D19] border border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8C7C6B]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('common.search')}
                className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] pl-8 pr-3 py-1.5 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
              />
            </div>
          </div>

          {isLoading && products.length === 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-3 animate-pulse">
                  <div className="h-28 w-full rounded-xl bg-[#F0EFED] dark:bg-[#2B2522] mb-2.5" />
                  <div className="h-3 w-2/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-2xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-5 text-xs text-[#DC2626] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {error.isForbidden ? t('staff.readForbidden') : t('staff.networkError')} ({error.code})
                </p>
                <button type="button" onClick={() => void load()} className="mt-1.5 underline font-semibold">{t('common.retry')}</button>
              </div>
            </div>
          )}

          {!isLoading && !error && filteredProducts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">
              {t('common.noData')}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredProducts.map((prod) => {
              const isAvailable = prod.isAvailable;
              return (
                <div
                  key={prod.id}
                  onClick={() => isAvailable && addToCart(prod)}
                  className={`rounded-2xl border p-3 bg-[#FFFFFF] dark:bg-[#201D19] flex flex-col justify-between transition-all select-none ${
                    isAvailable
                      ? 'border-[#E5E3DF] dark:border-[#2B2522] hover:border-[#C48A56] hover:shadow-md cursor-pointer'
                      : 'border-[#E5E3DF] dark:border-[#2B2522] opacity-60 cursor-not-allowed bg-[#F0EFED]/40 dark:bg-[#151310]'
                  }`}
                >
                  <div>
                    <div className="relative h-28 w-full rounded-xl overflow-hidden bg-[#F0EFED] dark:bg-[#2B2522] mb-2.5">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[#8C7C6B]">
                          <Coffee className="w-8 h-8" />
                        </div>
                      )}
                      {!isAvailable && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-2 text-center">
                          <span className="text-[10px] font-extrabold text-white uppercase tracking-wider bg-[#DC2626] px-2 py-0.5 rounded">
                            {t('pricing.unavailable')}
                          </span>
                        </div>
                      )}
                      <span className="absolute top-1.5 right-1.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs">
                        {prod.station}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0] line-clamp-1">{prod.name}</h4>
                    <span className="font-mono text-[10px] text-[#8C7C6B]">{prod.code}</span>
                  </div>

                  <div className="mt-3 pt-2 border-t border-[#E5E3DF] dark:border-[#2B2522] flex items-center justify-between">
                    <span className="text-sm font-extrabold text-[#C48A56] font-mono">
                      ${prod.effectivePrice.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      disabled={!isAvailable}
                      className="p-1.5 rounded-lg bg-[#C48A56] text-white hover:bg-[#B37947] disabled:opacity-40 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Cart / Register Drawer (local preview state only) */}
        <div className="lg:col-span-5 xl:col-span-4 rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-lg space-y-4 sticky top-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DF] dark:border-[#2B2522]">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#C48A56]" />
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
                {locale === 'km' ? 'កន្ត្រកសាកល្បង' : 'Cart Preview'}
              </h3>
            </div>
            {cart.length > 0 && (
              <button type="button" onClick={clearCart} className="text-[11px] font-semibold text-[#DC2626] hover:underline">
                {t('common.cancel')}
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-3 divide-y divide-[#E5E3DF] dark:divide-[#2B2522]">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-[#8C7C6B]">
                <ShoppingBag className="w-8 h-8 mx-auto text-[#8C7C6B]/40" />
                <p className="mt-2 text-xs font-semibold">{t('common.noData')}</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="pt-2.5 first:pt-0 flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{item.product.name}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-[#F0EFED] dark:bg-[#2B2522] font-mono text-[#8C7C6B]">{item.product.station}</span>
                    </div>
                    <div className="text-[11px] text-[#C48A56] font-mono font-bold mt-0.5">
                      ${item.unitPrice.toFixed(2)} ea
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310]">
                      <button type="button" onClick={() => updateQuantity(item.product.id, -1)} className="p-1 hover:text-[#C48A56]">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-mono text-xs font-bold">{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.product.id, 1)} className="p-1 hover:text-[#C48A56]">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button type="button" onClick={() => removeFromCart(item.product.id)} className="text-[#8C7C6B] hover:text-[#DC2626] p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-[#E5E3DF] dark:border-[#2B2522] space-y-1.5 text-xs">
            <div className="flex justify-between text-[#8C7C6B]">
              <span>{locale === 'km' ? 'សរុបបឋម' : 'Subtotal'}</span>
              <span className="font-mono font-semibold">${subtotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Honest hand-off: no fake order creation / receipt / VAT here. */}
          <div className="rounded-2xl border border-[#C48A56]/25 bg-[#C48A56]/5 p-3.5 text-[11px] text-[#6E5E4F] dark:text-[#A89D94] flex items-start gap-2">
            <Info className="w-4 h-4 text-[#C48A56] shrink-0 mt-0.5" />
            <span>
              {locale === 'km'
                ? 'នេះគ្រាន់តែជាតំបន់មើលសាកល្បង។ ការបញ្ជាទិញពិតប្រាកដ ការទូទាត់ និងវិក្កយបត្រ ត្រូវបានធ្វើនៅក្នុងកម្មវិធី POS ផ្សេងទៀត។'
                : 'This register is a live catalog preview only. Placing real orders, payment capture and receipt printing are performed in the dedicated POS application against the ordering & payment APIs.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
