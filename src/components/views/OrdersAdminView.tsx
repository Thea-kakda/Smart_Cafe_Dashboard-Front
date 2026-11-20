/**
 * Orders Administration view (Master Prompt Phase 8 / §8). Uses the dedicated
 * order:admin-read scope and the real /api/v1/management/orders contract:
 * filtering, sorting and pagination all happen server-side — the view never
 * pulls the full order table into the browser, and it never derives global
 * totals from one page of data (no fake summary cards).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Receipt,
  Eye,
  X,
  AlertCircle,
  RefreshCw,
  Lock,
  Search,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import { ManagementOrder, ManagementOrderDetail, OrderListQuery, ordersAdminApi } from '../../lib/ordersAdmin';
import { Paginated } from '../../lib/management';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

const ORDER_STATUSES = ['AWAITING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
const SOURCES = ['CUSTOMER_WEB', 'POS'];
const FULFILLMENTS = ['DINE_IN', 'PICKUP', 'DELIVERY'];

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const OrdersAdminView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission, accessibleBranches } = useAuth();
  const canRead = hasPermission('order:admin-read');

  const [data, setData] = useState<Paginated<ManagementOrder> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState<OrderListQuery>({ orderNumber: '', page: 0, size: DEFAULT_PAGE_SIZE, sort: 'orderedAt' });
  const [orderNumberInput, setOrderNumberInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detail, setDetail] = useState<ManagementOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounced order-number search executed by the backend.
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (orderNumberInput !== (query.orderNumber ?? '')) setQuery((q) => ({ ...q, orderNumber: orderNumberInput, page: 0 }));
    }, 400);
    return () => window.clearTimeout(h);
  }, [orderNumberInput, query.orderNumber]);

  const load = useCallback(async () => {
    if (!canRead) return;
    setIsLoading(true);
    setError(null);
    try {
      const range: OrderListQuery = {
        ...query,
        orderedFrom: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
        orderedTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
      };
      setData(await ordersAdminApi.list(range));
    } catch (err) {
      setError(err instanceof ApiError ? err : null);
    } finally {
      setIsLoading(false);
    }
  }, [canRead, query, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (orderId: string) => {
    setDetailLoading(true);
    try {
      setDetail(await ordersAdminApi.detail(orderId));
    } catch (err) {
      setDetail(null);
      setError(err instanceof ApiError ? err : null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (!isAuthenticated || !canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.orders')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('orders.readForbidden') : t('orders.signInPrompt')}</span>
        </div>
      </div>
    );
  }

  const rows = data?.items ?? [];
  const pagination = data?.pagination;
  const initialLoading = isLoading && !data;
  const inputCls =
    'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:outline-none focus:ring-2 focus:ring-[#C48A56]/30';

  const storeName = (storeId: string) =>
    accessibleBranches.find((b) => b.storeId === storeId)?.storeName ?? storeId.slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.orders')}</h2>
          {pagination && (
            <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">
              {pagination.totalElements} {t('orders.totalCount')}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('orders.description')}</p>
      </div>

      {/* Server-side filter grid */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-3.5 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] px-3">
            <Search className="w-4 h-4 text-[#8C7C6B] shrink-0" />
            <input
              type="text"
              value={orderNumberInput}
              onChange={(e) => setOrderNumberInput(e.target.value)}
              placeholder={t('orders.searchPlaceholder')}
              className="w-full bg-transparent py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] placeholder-[#8C7C6B] focus:outline-none"
            />
          </div>
          <select className={inputCls} value={query.status ?? ''} onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value || undefined, page: 0 }))}>
            <option value="">{t('orders.statusAll')}</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={inputCls} value={query.paymentStatus ?? ''} onChange={(e) => setQuery((q) => ({ ...q, paymentStatus: e.target.value || undefined, page: 0 }))}>
            <option value="">{t('orders.paymentAll')}</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={inputCls} value={query.storeId ?? ''} onChange={(e) => setQuery((q) => ({ ...q, storeId: e.target.value || undefined, page: 0 }))}>
            <option value="">{hasPermission('order:admin-read') && accessibleBranches.length === 0 ? t('orders.scopeAllStores') : t('orders.storeAll')}</option>
            {accessibleBranches.map((b) => <option key={b.storeId} value={b.storeId}>{b.storeName}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select className={inputCls} value={query.source ?? ''} onChange={(e) => setQuery((q) => ({ ...q, source: e.target.value || undefined, page: 0 }))}>
            <option value="">{t('orders.sourceAll')}</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={inputCls} value={query.fulfillmentType ?? ''} onChange={(e) => setQuery((q) => ({ ...q, fulfillmentType: e.target.value || undefined, page: 0 }))}>
            <option value="">{t('orders.fulfillmentAll')}</option>
            {FULFILLMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" className={inputCls} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setQuery((q) => ({ ...q, page: 0 })); }} title={t('orders.orderedFrom')} />
          <input type="date" className={inputCls} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setQuery((q) => ({ ...q, page: 0 })); }} title={t('orders.orderedTo')} />
          <div className="flex items-center gap-2">
            <select className={inputCls} value={query.sort ?? 'orderedAt'} onChange={(e) => setQuery((q) => ({ ...q, sort: e.target.value }))}>
              <option value="orderedAt">{t('orders.sortOrderedAt')}</option>
              <option value="totalAmount">{t('orders.sortTotal')}</option>
              <option value="status">{t('orders.sortStatus')}</option>
              <option value="orderNumber">{t('orders.sortNumber')}</option>
            </select>
            <button type="button" onClick={() => void load()} disabled={isLoading} title={t('common.refresh')} className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] disabled:opacity-50 shrink-0">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-[#8C7C6B]">{t('orders.timezoneNote')}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error.isNetworkError ? t('orders.networkError') : t('orders.loadError')} ({error.code})</span>
          </div>
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold">{t('common.retry')}</button>
        </div>
      )}

      {initialLoading && (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 animate-pulse space-y-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-4 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />)}
        </div>
      )}

      {!initialLoading && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('orders.empty')}</div>
      )}

      {!initialLoading && rows.length > 0 && (
        <>
          <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] text-[10px] uppercase tracking-wider text-[#8C7C6B]">
                  <th className="px-4 py-3 font-semibold">{t('orders.colNumber')}</th>
                  <th className="px-4 py-3 font-semibold">{t('orders.colStore')}</th>
                  <th className="px-4 py-3 font-semibold">{t('orders.colStatus')}</th>
                  <th className="px-4 py-3 font-semibold">{t('orders.colPayment')}</th>
                  <th className="px-4 py-3 font-semibold">{t('orders.colSource')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('orders.colTotal')}</th>
                  <th className="px-4 py-3 font-semibold">{t('orders.colWhen')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.orderId} className="border-b border-[#F0EFED] dark:border-[#2B2522] last:border-0 hover:bg-[#FBFBF9] dark:hover:bg-[#231E1B] transition-colors">
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{o.orderNumber}</td>
                    <td className="px-4 py-2.5 text-[#6E5E4F] dark:text-[#A89D94]">{storeName(o.storeId)}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-md bg-[#C48A56]/10 px-2 py-0.5 text-[10px] font-semibold text-[#A36C3D]">{o.status}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                          o.paymentStatus === 'PAID'
                            ? 'bg-[#2E7D32]/10 text-[#2E7D32]'
                            : o.paymentStatus === 'FAILED' || o.paymentStatus === 'REFUNDED'
                              ? 'bg-[#DC2626]/10 text-[#DC2626]'
                              : 'bg-[#B45309]/10 text-[#B45309]'
                        }`}
                      >
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#6E5E4F] dark:text-[#A89D94]">{o.source} · {o.fulfillmentType}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[#1C1A19] dark:text-[#F5F3F0] whitespace-nowrap">
                      {money(o.totalAmount)} {o.currencyCode}
                    </td>
                    <td className="px-4 py-2.5 text-[#8C7C6B] whitespace-nowrap">{new Date(o.orderedAt).toLocaleString(locale === 'km' ? 'km-KH' : 'en-US')}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => void openDetail(o.orderId)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#C48A56] hover:bg-[#C48A56]/10 transition-colors">
                        <Eye className="w-3.5 h-3.5" /> {t('common.view')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19]">
              <PaginationBar
                page={pagination.page}
                size={query.size ?? DEFAULT_PAGE_SIZE}
                totalElements={pagination.totalElements}
                totalPages={pagination.totalPages}
                onPageChange={(p) => setQuery((q) => ({ ...q, page: p }))}
                onSizeChange={(s) => setQuery((q) => ({ ...q, size: s }))}
                disabled={isLoading}
              />
            </div>
          )}
        </>
      )}

      {/* Detail modal: header + line items (server-scoped read) */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-2xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] shrink-0">
                  <Receipt className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0] font-mono">{detail.order.orderNumber}</h3>
                  <p className="text-[11px] text-[#8C7C6B]">{detail.order.status} · {detail.order.paymentStatus}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 text-[11px]">
              {[
                [t('orders.fieldSubtotal'), `${money(detail.order.subtotal)} ${detail.order.currencyCode}`],
                [t('orders.fieldDiscount'), money(detail.order.discountAmount)],
                [t('orders.fieldTax'), money(detail.order.taxAmount)],
                [t('orders.fieldDelivery'), money(detail.order.deliveryFee)],
                [t('orders.fieldRounding'), money(detail.order.roundingAmount)],
                [t('orders.fieldTotal'), `${money(detail.order.totalAmount)} ${detail.order.currencyCode}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] p-2">
                  <div className="text-[9px] uppercase tracking-wider text-[#8C7C6B]">{label}</div>
                  <div className="font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{value}</div>
                </div>
              ))}
            </div>

            <h4 className="text-[11px] font-semibold text-[#8C7C6B] uppercase tracking-wider mt-5 mb-2">
              {t('orders.itemsTitle')} ({detail.items.length})
            </h4>
            <div className="space-y-1.5">
              {detail.items.map((it) => (
                <div key={it.orderItemId} className="rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{it.productName}</span>
                    <span className="text-[10px] text-[#8C7C6B]"> × {it.quantity}</span>
                    {it.customizations.length > 0 && (
                      <p className="text-[10px] text-[#8C7C6B] truncate">{it.customizations.join(', ')}</p>
                    )}
                  </div>
                  <span className="font-bold text-[#1C1A19] dark:text-[#F5F3F0] shrink-0">{money(it.lineTotal)}</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-[#8C7C6B] mt-4">{t('orders.noCustomerDataNotice')}</p>
          </div>
        </div>
      )}

      {detailLoading && !detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-xl bg-[#FFFFFF] dark:bg-[#201D19] px-5 py-4 text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94]">{t('common.loading')}</div>
        </div>
      )}
    </div>
  );
};
