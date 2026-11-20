import React from 'react';
import {
  DollarSign,
  Boxes,
  Flame,
  Store as StoreIcon,
  AlertTriangle,
  CheckCircle2,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { WidgetState } from '../../lib/dashboardWidgetState';
import { InteractiveTrendLine, TrendDataPoint } from './InteractiveTrendLine';

/**
 * Four primary KPI cards for the Overview. Every value here is passed in by
 * OverviewView from a real API (reports sales-summary, inventory balances, the
 * production queue, the store directory). There are no mock defaults and no
 * invented trend series: the sparkline renders ONLY when the reporting API
 * actually returned a multi-point daily series. Each metric carries an explicit
 * WidgetState; only `forbidden` renders "Permission required".
 */
interface DashboardSummaryCardsProps {
  netSales: number | null;
  currencyCode?: string;
  revenueTrend?: TrendDataPoint[];
  activeInventoryCount: number | null;
  lowStockCount: number | null;
  pendingOrdersCount: number | null;
  activeStoresCount: number | null;
  salesState: WidgetState;
  inventoryState: WidgetState;
  productionState: WidgetState;
  onNavigate?: (tab: string) => void;
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', KHR: '៛' };

const money = (n: number, currencyCode?: string) => {
  const symbol = (currencyCode && CURRENCY_SYMBOL[currencyCode]) || `${currencyCode ? currencyCode + ' ' : ''}`;
  return `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const shortDate = (iso: string) => {
  // Reporting "period" is a day (YYYY-MM-DD), week, or month bucket — show as-is.
  const d = iso.slice(0, 10);
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return iso;
};

export const DashboardSummaryCards: React.FC<DashboardSummaryCardsProps> = ({
  netSales,
  currencyCode,
  revenueTrend,
  activeInventoryCount,
  lowStockCount,
  pendingOrdersCount,
  activeStoresCount,
  salesState,
  inventoryState,
  productionState,
  onNavigate,
}) => {
  const { locale } = useTranslation();
  const { selectedStore } = useStore();
  const km = locale === 'km';

  const trend = revenueTrend && revenueTrend.length >= 2 ? revenueTrend : undefined;
  const previousRevenue = trend ? trend[0].value : undefined;

  const cardBase =
    'group relative overflow-hidden rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-xs hover:border-[#C48A56] dark:hover:border-[#D4A87A] transition-all cursor-pointer flex flex-col justify-between';

  const statusBadge = (state: WidgetState, emptyLabel: string) => {
    if (state === 'forbidden') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8C7C6B]">
          <Lock className="w-3 h-3" />
          {km ? 'ត្រូវការសិទ្ធិ' : 'Permission required'}
        </span>
      );
    }
    if (state === 'error') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#DC2626]">
          <AlertCircle className="w-3 h-3" />
          {km ? 'មិនអាចផ្ទុកបាន' : 'Could not load'}
        </span>
      );
    }
    if (state === 'loading') {
      return <span className="text-[11px] font-medium text-[#8C7C6B]">{km ? 'កំពុងផ្ទុក…' : 'Loading…'}</span>;
    }
    return <span className="text-[11px] font-medium text-[#8C7C6B]">{emptyLabel}</span>;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Net Sales (period-to-date, from reporting API) */}
      <div onClick={() => onNavigate?.('reports')} className={cardBase}>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8C7C6B] dark:text-[#A89D94] uppercase tracking-wider">
              {km ? 'ការលក់សុទ្ធ (១៤ ថ្ងៃ)' : 'Net Sales (14d)'}
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E7D32]/10 text-[#2E7D32] group-hover:bg-[#2E7D32] group-hover:text-white transition-colors">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            {salesState === 'value' && netSales !== null ? (
              <span className="text-2xl sm:text-3xl font-extrabold text-[#1C1A19] dark:text-[#F5F3F0] font-mono tracking-tight">
                {money(netSales, currencyCode)}
              </span>
            ) : (
              <span className="text-lg font-bold text-[#8C7C6B]">
                {statusBadge(salesState, km ? 'គ្មានការលក់ក្នុងអំឡុងពេលនេះ' : 'No sales in this period')}
              </span>
            )}
          </div>

          {trend && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <InteractiveTrendLine
                data={trend.map((p) => ({ label: shortDate(p.label), value: p.value }))}
                previousPeriodValue={previousRevenue ?? 0}
                color="#2E7D32"
                formatValue={(val) => money(val, currencyCode)}
                periodLabel={locale === 'km' ? 'ធៀបនឹងថ្ងៃមុន' : 'vs first day'}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-[#6E5E4F] dark:text-[#A89D94] pt-2 border-t border-[#E5E3DF]/60 dark:border-[#2B2522]">
          <span>Register: {selectedStore?.code || '—'}</span>
          <span className="font-medium text-[#8C7C6B]">
            {salesState === 'forbidden' ? '' : km ? 'ការលក់សុទ្ធពីរបាយការណ៍' : 'Server-aggregated net sales'}
          </span>
        </div>
      </div>

      {/* 2. Active Inventory Items (inventory:read) */}
      <div onClick={() => onNavigate?.('inventory')} className={cardBase}>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8C7C6B] dark:text-[#A89D94] uppercase tracking-wider">
              {locale === 'km' ? 'គ្រឿងផ្សំក្នុងស្តុកសកម្ម' : 'Active Inventory Items'}
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C48A56]/15 text-[#C48A56] group-hover:bg-[#C48A56] group-hover:text-white transition-colors">
              <Boxes className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            {inventoryState === 'value' && activeInventoryCount !== null ? (
              <>
                <span className="text-2xl sm:text-3xl font-extrabold text-[#1C1A19] dark:text-[#F5F3F0] font-mono">
                  {activeInventoryCount}
                </span>
                <span className="text-xs text-[#8C7C6B] dark:text-[#7E746C]">
                  {km ? 'គ្រឿងផ្សំ' : 'ingredients tracked'}
                </span>
              </>
            ) : (
              <span className="text-lg font-bold text-[#8C7C6B]">
                {statusBadge(inventoryState, km ? 'គ្មានគ្រឿងផ្សំតាមដាន' : 'No ingredients tracked')}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] pt-2 border-t border-[#E5E3DF]/60 dark:border-[#2B2522]">
          <span className="text-[#8C7C6B]">Status:</span>
          {inventoryState !== 'value' || lowStockCount === null ? (
            <span className="text-[#8C7C6B]">—</span>
          ) : lowStockCount > 0 ? (
            <span className="font-semibold text-[#DC2626] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {lowStockCount} {locale === 'km' ? 'ទាបជាងអប្បបរមា' : 'below minimum'}
            </span>
          ) : (
            <span className="font-semibold text-[#2E7D32] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {locale === 'km' ? 'ស្តុកល្អ' : 'All stock above minimum'}
            </span>
          )}
        </div>
      </div>

      {/* 3. Open Production Tickets (production:queue-read) */}
      <div onClick={() => onNavigate?.('production')} className={cardBase}>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8C7C6B] dark:text-[#A89D94] uppercase tracking-wider">
              {locale === 'km' ? 'សំបុត្រផលិតកម្មកំពុងបើក' : 'Open Production Tickets'}
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D97706]/15 text-[#D97706] group-hover:bg-[#D97706] group-hover:text-white transition-colors">
              <Flame className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            {productionState === 'value' && pendingOrdersCount !== null ? (
              <>
                <span className="text-2xl sm:text-3xl font-extrabold text-[#1C1A19] dark:text-[#F5F3F0] font-mono">
                  {pendingOrdersCount}
                </span>
                <span className="text-xs text-[#8C7C6B] dark:text-[#7E746C]">
                  {km ? 'កំពុងចែកចាយ' : 'in dispatch'}
                </span>
              </>
            ) : (
              <span className="text-lg font-bold text-[#8C7C6B]">
                {statusBadge(productionState, km ? 'មិនទាន់កំណត់ស្ថានីយផលិតកម្ម' : 'No production stations')}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-[#6E5E4F] dark:text-[#A89D94] pt-2 border-t border-[#E5E3DF]/60 dark:border-[#2B2522]">
          <span>{locale === 'km' ? 'ជួរដែលផ្ទុកពី API' : 'Live queue from the production API'}</span>
        </div>
      </div>

      {/* 4. Operating Stores (store directory) */}
      <div onClick={() => onNavigate?.('stores')} className={cardBase}>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8C7C6B] dark:text-[#A89D94] uppercase tracking-wider">
              {locale === 'km' ? 'សាខាដំណើរការ' : 'Operating Stores'}
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] group-hover:bg-[#C48A56] group-hover:text-white transition-colors">
              <StoreIcon className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#1C1A19] dark:text-[#F5F3F0] font-mono">
              {activeStoresCount ?? 0}
            </span>
            <span className="text-xs text-[#8C7C6B] dark:text-[#7E746C]">
              {locale === 'km' ? 'សាខាសកម្ម' : 'active branches'}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-[#6E5E4F] dark:text-[#A89D94] pt-2 border-t border-[#E5E3DF]/60 dark:border-[#2B2522]">
          <span className="truncate">Active: {selectedStore?.name || '—'}</span>
        </div>
      </div>
    </div>
  );
};
