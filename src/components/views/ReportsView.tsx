/**
 * BI & financial reports view (Master Prompt Phase 8 / §10). Displays only
 * server-aggregated rows from /api/v1/management/reports/**: sales summary is
 * rendered exactly as computed (per period AND per currency — mixed-currency
 * totals are never assembled in the browser), and the inventory report is
 * quantity-only: historical COGS does not exist behind the API, so the
 * BACKEND API GAP banner from the payload is shown instead of a fabricated
 * margin. No totals are derived from one page of data.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  AlertCircle,
  RefreshCw,
  Lock,
  Package,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  InventoryConsumptionReport,
  SalesGrouping,
  SalesSummaryReport,
  reportsAdminApi,
} from '../../lib/reportsAdmin';

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export const ReportsView: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, hasPermission, accessibleBranches, globalAccess } = useAuth();
  const canSales = hasPermission('report:sales-read');
  const canCogs = hasPermission('report:inventory-cogs-read');

  const [tab, setTab] = useState<'sales' | 'consumption'>(canSales ? 'sales' : 'consumption');
  const [storeId, setStoreId] = useState('');
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(daysAgoIso(0));
  const [grouping, setGrouping] = useState<SalesGrouping>('DAY');
  const [currency, setCurrency] = useState('');

  const [sales, setSales] = useState<SalesSummaryReport | null>(null);
  const [consumption, setConsumption] = useState<InventoryConsumptionReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    if (!canSales && !canCogs) return;
    if (!from || !to) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = {
        storeId: storeId || undefined,
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59.999Z`,
      };
      if (tab === 'sales' && canSales) {
        setSales(await reportsAdminApi.salesSummary({ ...params, grouping, currencyCode: currency || undefined }));
      } else if (tab === 'consumption' && canCogs) {
        setConsumption(await reportsAdminApi.inventoryCogs(params));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err : null);
    } finally {
      setIsLoading(false);
    }
  }, [canSales, canCogs, tab, storeId, from, to, grouping, currency]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAuthenticated || (!canSales && !canCogs)) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.reports')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('reports.readForbidden') : t('reports.signInPrompt')}</span>
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:outline-none focus:ring-2 focus:ring-[#C48A56]/30';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.reports')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('reports.description')}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={isLoading} title={t('common.refresh')} className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab switch (only tabs the actor may read) */}
      <div className="flex items-center gap-2">
        {canSales && (
          <button type="button" onClick={() => setTab('sales')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${tab === 'sales' ? 'bg-[#C48A56] text-white' : 'border border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:border-[#C48A56]'}`}>
            <TrendingUp className="w-4 h-4" /> {t('reports.tabSales')}
          </button>
        )}
        {canCogs && (
          <button type="button" onClick={() => setTab('consumption')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${tab === 'consumption' ? 'bg-[#C48A56] text-white' : 'border border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:border-[#C48A56]'}`}>
            <Package className="w-4 h-4" /> {t('reports.tabConsumption')}
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-3.5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select className={inputCls} value={storeId} onChange={(e) => setStoreId(e.target.value)} title={t('reports.store')}>
            <option value="">{globalAccess && accessibleBranches.length === 0 ? t('reports.scopeAll') : t('reports.scopeDefault')}</option>
            {accessibleBranches.map((b) => <option key={b.storeId} value={b.storeId}>{b.storeName}</option>)}
          </select>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} title={t('reports.from')} />
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} title={t('reports.to')} />
          {tab === 'sales' && (
            <>
              <select className={inputCls} value={grouping} onChange={(e) => setGrouping(e.target.value as SalesGrouping)}>
                <option value="DAY">{t('reports.groupDay')}</option>
                <option value="WEEK">{t('reports.groupWeek')}</option>
                <option value="MONTH">{t('reports.groupMonth')}</option>
              </select>
              <input className={inputCls} placeholder={t('reports.currencyFilter')} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </>
          )}
        </div>
        <p className="text-[10px] text-[#8C7C6B] mt-2">{t('reports.scopeNote')}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error.isNetworkError ? t('reports.networkError') : t('reports.loadError')} ({error.code})</span>
          </div>
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold">{t('common.retry')}</button>
        </div>
      )}

      {isLoading && !sales && !consumption && (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 animate-pulse space-y-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-4 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />)}
        </div>
      )}

      {/* Sales summary */}
      {tab === 'sales' && sales && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#6E5E4F] dark:text-[#A89D94]">
            <BarChart3 className="w-4 h-4 text-[#C48A56]" />
            <span className="font-semibold">{t('reports.periodLabel')}:</span>
            {sales.from.slice(0, 10)} → {sales.to.slice(0, 10)} · {sales.grouping} · {sales.timezone}
          </div>
          {sales.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('reports.empty')}</div>
          ) : (
            <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] text-[10px] uppercase tracking-wider text-[#8C7C6B]">
                    <th className="px-4 py-3 font-semibold">{t('reports.colPeriod')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reports.colCurrency')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colOrders')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colPaid')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colGross')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colDiscounts')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colTax')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colDelivery')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colRounding')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colNet')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colAvg')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.rows.map((r, i) => (
                    <tr key={`${r.period}-${r.currencyCode}-${i}`} className="border-b border-[#F0EFED] dark:border-[#2B2522] last:border-0">
                      <td className="px-4 py-2.5 font-semibold text-[#1C1A19] dark:text-[#F5F3F0] whitespace-nowrap">{r.period}</td>
                      <td className="px-4 py-2.5 font-mono text-[#8C7C6B]">{r.currencyCode}</td>
                      <td className="px-4 py-2.5 text-right">{r.orderCount}</td>
                      <td className="px-4 py-2.5 text-right">{r.paidOrderCount}</td>
                      <td className="px-4 py-2.5 text-right">{money(r.grossSales)}</td>
                      <td className="px-4 py-2.5 text-right">{money(r.discounts)}</td>
                      <td className="px-4 py-2.5 text-right">{money(r.tax)}</td>
                      <td className="px-4 py-2.5 text-right">{money(r.deliveryFees)}</td>
                      <td className="px-4 py-2.5 text-right">{money(r.rounding)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{money(r.netSales)}</td>
                      <td className="px-4 py-2.5 text-right text-[#8C7C6B]">{r.averageOrderValue == null ? '—' : money(r.averageOrderValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sales.truncated && (
            <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-3 text-[11px] font-semibold text-[#B45309] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {t('reports.truncated')}
            </div>
          )}
          <p className="text-[10px] text-[#8C7C6B]">{sales.metricBasis}</p>
        </div>
      )}

      {/* Inventory consumption */}
      {tab === 'consumption' && consumption && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#6E5E4F] dark:text-[#A89D94]">
            <Package className="w-4 h-4 text-[#C48A56]" />
            <span className="font-semibold">{t('reports.periodLabel')}:</span>
            {consumption.from.slice(0, 10)} → {consumption.to.slice(0, 10)}
          </div>

          {/* Honest gap banner: the backend itself reports COGS/margin availability */}
          <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-3.5 text-[11px] text-[#B45309] space-y-1">
            <div className="flex items-center gap-2 font-bold uppercase tracking-wide">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {t('reports.gapBadge')}
            </div>
            <p>{consumption.unavailableReason ?? t('reports.cogsGapFallback')}</p>
            <p className="font-semibold">
              COGS: {consumption.cogsAvailable ? 'available' : 'BACKEND API GAP'} · {t('reports.marginLabel')}:{' '}
              {consumption.grossMarginAvailable ? 'available' : 'BACKEND API GAP'}
            </p>
          </div>

          {consumption.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('reports.empty')}</div>
          ) : (
            <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] text-[10px] uppercase tracking-wider text-[#8C7C6B]">
                    <th className="px-4 py-3 font-semibold">{t('reports.colProduct')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reports.colIngredient')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reports.colUnit')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('reports.colConsumed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {consumption.rows.map((r, i) => (
                    <tr key={`${r.productName}-${r.ingredientName}-${i}`} className="border-b border-[#F0EFED] dark:border-[#2B2522] last:border-0">
                      <td className="px-4 py-2.5 font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{r.productName}</td>
                      <td className="px-4 py-2.5 text-[#6E5E4F] dark:text-[#A89D94]">{r.ingredientName}</td>
                      <td className="px-4 py-2.5 font-mono text-[#8C7C6B]">{r.unitCode}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{r.unitsConsumed.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {consumption.truncated && (
            <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-3 text-[11px] font-semibold text-[#B45309] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {t('reports.truncated')}
            </div>
          )}
          {consumption.itemsWithoutRecipeSnapshot > 0 && (
            <p className="text-[10px] text-[#8C7C6B]">
              {t('reports.noRecipeSnapshot')}: {consumption.itemsWithoutRecipeSnapshot}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
