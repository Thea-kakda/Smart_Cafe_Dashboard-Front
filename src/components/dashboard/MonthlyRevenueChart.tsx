import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TrendingUp, Calendar, Layers, Lock, AlertCircle } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';

/**
 * Sales-trend chart fed entirely by OverviewView's reporting API result. Each
 * point is one server-aggregated period (a DAY bucket from
 * /management/reports/sales-summary). The old mock-era version fabricated a
 * revenue *target*, a coffee/bakery/brunch category split, ingredient COGS and
 * a "+14.2%" delta; none of those columns exist in the sales contract, so they
 * are removed entirely. We only ever show netSales and orderCount the backend
 * actually returned, and we never assemble a mixed-currency total.
 */
export interface SalesPoint {
  period: string;
  netSales: number;
  orderCount: number;
  currencyCode: string;
}

interface MonthlyRevenueChartProps {
  points: SalesPoint[];
  isLoading: boolean;
  restricted: boolean;
  error: string | null;
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', KHR: '៛' };
const symbolFor = (code?: string) =>
  (code && CURRENCY_SYMBOL[code]) || (code ? `${code} ` : '$');

const periodLabel = (period: string) => {
  const d = period.slice(0, 10);
  const parts = d.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : period;
};

export const MonthlyRevenueChart: React.FC<MonthlyRevenueChartProps> = ({
  points,
  isLoading,
  restricted,
  error,
}) => {
  const { t, locale } = useTranslation();
  const { selectedStore } = useStore();
  const [mode, setMode] = useState<'SALES' | 'ORDERS'>('SALES');

  const data = useMemo(
    () =>
      points.map((p) => ({
        label: periodLabel(p.period),
        netSales: p.netSales,
        orderCount: p.orderCount,
        currencyCode: p.currencyCode,
      })),
    [points],
  );

  const currency = points[0]?.currencyCode;
  const sym = symbolFor(currency);

  const totals = useMemo(() => {
    if (!points.length) return null;
    // Only sum when every row shares one currency (mixed-currency sums are invalid).
    const singleCurrency = points.every((p) => p.currencyCode === currency);
    const totalSales = singleCurrency ? points.reduce((a, p) => a + p.netSales, 0) : null;
    const totalOrders = points.reduce((a, p) => a + p.orderCount, 0);
    const peak = points.reduce((m, p) => (p.netSales > m.netSales ? p : m), points[0]);
    const avg = totalSales !== null && points.length ? totalSales / points.length : null;
    return { totalSales, totalOrders, peak, avg, singleCurrency };
  }, [points, currency]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;
    return (
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF]/95 dark:bg-[#201D19]/95 p-3 shadow-xl backdrop-blur-md text-xs min-w-[160px]">
        <div className="flex items-center gap-1.5 pb-1.5 border-b border-[#E5E3DF] dark:border-[#2B2522] font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
          <Calendar className="w-3.5 h-3.5 text-[#C48A56]" />
          {item.label}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[#8C7C6B]">{locale === 'km' ? 'ការលក់សុទ្ធ' : 'Net Sales'}</span>
          <span className="font-mono font-bold text-[#C48A56]">
            {symbolFor(item.currencyCode)}
            {item.netSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#8C7C6B]">{locale === 'km' ? 'ការបញ្ជាទិញ' : 'Orders'}</span>
          <span className="font-mono text-[#6E5E4F] dark:text-[#A89D94]">{item.orderCount.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-[#C48A56]/15 text-[#C48A56]">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
            {t('overview.salesTrendTitle')}
          </h3>
          <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
            {t('overview.salesTrendSubtitle')} {selectedStore ? `— ${selectedStore.name}` : ''}
          </p>
        </div>
      </div>

      {!restricted && data.length > 0 && (
        <div className="flex rounded-xl bg-[#F0EFED] dark:bg-[#2B2522] p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('SALES')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
              mode === 'SALES' ? 'bg-white dark:bg-[#201D19] text-[#C48A56] shadow-xs' : 'text-[#6E5E4F] dark:text-[#A89D94]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> {locale === 'km' ? 'ការលក់' : 'Net Sales'}
          </button>
          <button
            type="button"
            onClick={() => setMode('ORDERS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
              mode === 'ORDERS' ? 'bg-white dark:bg-[#201D19] text-[#C48A56] shadow-xs' : 'text-[#6E5E4F] dark:text-[#A89D94]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> {locale === 'km' ? 'ការបញ្ជាទិញ' : 'Orders'}
          </button>
        </div>
      )}
    </div>
  );

  // ---- Honest states (no fabricated fallback data) ----
  if (restricted) {
    return (
      <div className="rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-xs space-y-3">
        {header}
        <div className="flex items-center gap-2 text-xs text-[#6E5E4F] dark:text-[#A89D94] py-6">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          {t('overview.salesForbidden')}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-xs space-y-3">
        {header}
        <div className="h-64 animate-pulse rounded-2xl bg-[#F0EFED] dark:bg-[#2B2522]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-xs space-y-3">
        {header}
        <div className="flex items-center gap-2 text-xs text-[#DC2626] py-6">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-xs space-y-3">
        {header}
        <div className="py-10 text-center text-xs text-[#8C7C6B]">{t('overview.noSales')}</div>
      </div>
    );
  }

  const fmtMoney = (v: number) => `${sym}${(v / 1000).toFixed(1)}k`;

  return (
    <div className="rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 sm:p-6 shadow-xs space-y-5">
      {header}

      {/* KPI strip — only values derivable from the returned rows */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] p-3.5">
          <span className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider block">
            {t('overview.kpiTotal')}
          </span>
          <div className="mt-1 text-xl font-extrabold text-[#1C1A19] dark:text-[#F5F3F0] font-mono">
            {totals?.singleCurrency && totals.totalSales !== null
              ? `${sym}${totals.totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] p-3.5">
          <span className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider block">
            {t('overview.kpiAverage')}
          </span>
          <div className="mt-1 text-xl font-extrabold text-[#C48A56] font-mono">
            {totals?.avg !== null && totals?.avg !== undefined ? `${sym}${totals.avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] p-3.5">
          <span className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider block">
            {t('overview.kpiPeak')}
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-[#1C1A19] dark:text-[#F5F3F0]">{periodLabel(totals!.peak.period)}</span>
            <span className="text-xs font-mono font-bold text-[#2E7D32]">{sym}{totals!.peak.netSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] p-3.5">
          <span className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider block">
            {t('overview.kpiOrders')}
          </span>
          <div className="mt-1 text-xl font-extrabold text-[#1C1A19] dark:text-[#F5F3F0] font-mono">
            {totals?.totalOrders.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="w-full h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          {mode === 'SALES' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C48A56" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#C48A56" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DF" opacity={0.4} vertical={false} />
              <XAxis dataKey="label" stroke="#8C7C6B" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#8C7C6B" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtMoney} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="netSales" stroke="#C48A56" strokeWidth={3} fillOpacity={1} fill="url(#salesGradient)" />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DF" opacity={0.4} vertical={false} />
              <XAxis dataKey="label" stroke="#8C7C6B" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#8C7C6B" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="orderCount" name={locale === 'km' ? 'ការបញ្ជាទិញ' : 'Orders'} fill="#C48A56" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-[#E5E3DF] dark:border-[#2B2522] text-[11px] text-[#8C7C6B]">
        <span className="w-2 h-2 rounded-full bg-[#2E7D32]" />
        {locale === 'km'
          ? 'តម្លៃទាំងអស់មកពី API របាយការណ៍របស់សេវា។'
          : 'All figures come directly from the server reporting API.'}
      </div>
    </div>
  );
};
