import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Flame,
  FileText,
  Clock,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useProduction, STATIONS } from '../../context/ProductionContext';
import { ApiError } from '../../lib/api';
import { PERMISSIONS } from '../../lib/permissionCodes';
import { metricState, productionState as toProductionState } from '../../lib/dashboardWidgetState';
import { reportsAdminApi, SalesSummaryRow } from '../../lib/reportsAdmin';
import { inventoryAdminApi, toInventoryItem } from '../../lib/inventoryAdmin';
import { auditAdminApi, toAuditLog } from '../../lib/auditAdmin';
import { AuditLog } from '../../types';
import { TrendDataPoint } from '../dashboard/InteractiveTrendLine';
import { DashboardSummaryCards } from '../dashboard/DashboardSummaryCards';
import { MonthlyRevenueChart, SalesPoint } from '../dashboard/MonthlyRevenueChart';

interface OverviewViewProps {
  onNavigate: (tab: string) => void;
  onOpenCreateTicket?: () => void;
}

const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const { stores, selectedStore, selectedStoreId } = useStore();
  const {
    tickets,
    error: productionError,
    forbidden: productionForbidden,
    loaded: productionLoaded,
    unconfiguredStations,
  } = useProduction();

  const canSales = hasPermission(PERMISSIONS.REPORT_SALES_READ);
  const canInventory = hasPermission(PERMISSIONS.INVENTORY_READ);
  const canAudit = hasPermission(PERMISSIONS.AUDIT_READ);
  const canProduction = hasPermission(PERMISSIONS.PRODUCTION_QUEUE_READ);

  const [salesRows, setSalesRows] = useState<SalesSummaryRow[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesFailure, setSalesFailure] = useState<unknown>(null);

  const [inventory, setInventory] = useState<ReturnType<typeof toInventoryItem>[] | null>(null);
  const [inventoryFailure, setInventoryFailure] = useState<unknown>(null);

  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [auditError, setAuditError] = useState(false);

  const load = useCallback(async (ctrl: AbortController) => {
    if (!isAuthenticated) return;
    if (canSales && selectedStoreId) {
      setSalesLoading(true);
      setSalesFailure(null);
      try {
        const report = await reportsAdminApi.salesSummary(
          {
            storeId: selectedStoreId,
            from: `${daysAgoIso(13)}T00:00:00Z`,
            to: `${daysAgoIso(0)}T23:59:59.999Z`,
            grouping: 'DAY',
          },
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        setSalesRows(report.rows);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ABORTED') return;
        setSalesRows([]);
        setSalesFailure(err ?? new Error('Sales report could not be loaded.'));
      } finally {
        if (!ctrl.signal.aborted) setSalesLoading(false);
      }
    } else {
      setSalesLoading(false);
    }

    if (canInventory && selectedStoreId) {
      setInventoryFailure(null);
      try {
        const rows = await inventoryAdminApi.list(selectedStoreId, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setInventory(rows.map(toInventoryItem));
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ABORTED') return;
        setInventory(null);
        setInventoryFailure(err ?? new Error('Inventory could not be loaded.'));
      }
    }

    if (canAudit) {
      setAuditError(false);
      try {
        const page = await auditAdminApi.search(
          { storeId: selectedStoreId || undefined, page: 0, size: 4 },
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        setRecentLogs(page.items.map(toAuditLog));
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ABORTED') return;
        setRecentLogs([]);
        setAuditError(true);
      }
    }
  }, [isAuthenticated, canSales, canInventory, canAudit, selectedStoreId]);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl);
    return () => ctrl.abort();
  }, [load]);

  // Restrict the trend/chart to a single currency (mixed-currency sums are invalid).
  const { points, netSales, currencyCode } = useMemo(() => {
    const primary = salesRows[0]?.currencyCode;
    if (!primary) {
      return { points: [] as SalesPoint[], netSales: null as number | null, currencyCode: undefined as string | undefined };
    }
    const rows = salesRows.filter((r) => r.currencyCode === primary);
    const pts: SalesPoint[] = rows.map((r) => ({
      period: r.period,
      netSales: r.netSales,
      orderCount: r.orderCount,
      currencyCode: r.currencyCode,
    }));
    const total = rows.reduce((a, r) => a + r.netSales, 0);
    return { points: pts, netSales: total, currencyCode: primary };
  }, [salesRows]);

  const revenueTrend: TrendDataPoint[] = points.map((p) => ({ label: p.period, value: p.netSales }));

  const activeStoresCount = stores.filter((s) => s.isActive).length;
  const activeInventoryCount = inventory ? inventory.length : null;
  const lowStockCount = inventory ? inventory.filter((i) => i.isLowStock).length : null;
  const pendingOrdersCount = canProduction ? tickets.length : null;

  const salesState = metricState({
    permitted: canSales,
    loading: salesLoading,
    error: salesFailure,
    hasData: netSales !== null,
  });
  const salesError = salesFailure && salesState === 'error'
    ? (salesFailure instanceof Error ? salesFailure.message : 'Sales report could not be loaded.')
    : null;
  const inventoryState = metricState({
    permitted: canInventory,
    loading: inventory === null && !inventoryFailure,
    error: inventoryFailure,
    hasData: inventory !== null,
  });
  const productionState = toProductionState({
    permitted: canProduction,
    forbidden: productionForbidden,
    error: productionError,
    loaded: productionLoaded,
    allStationsUnconfigured: unconfiguredStations.length === STATIONS.length,
  });

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.dashboard')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          {t('overview.signInPrompt')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
            {t('nav.dashboard')}
          </h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">
            {t('overview.salesTrendSubtitle').replace(/\s*\(.*\)/, '')}{' '}
            <span className="font-semibold text-[#C48A56]">{selectedStore?.name}</span>
            {selectedStore?.code ? ` (${selectedStore.code})` : ''}
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] text-xs font-medium text-[#1C1A19] dark:text-[#F5F3F0]">
          <span className={`w-2 h-2 rounded-full ${selectedStore?.isActive ? 'bg-[#2E7D32]' : 'bg-[#DC2626]'}`} />
          {selectedStore?.isActive ? t('badge.active') : t('badge.inactive')}
        </span>
      </div>

      {/* Primary KPI cards — all values sourced from live APIs */}
      <DashboardSummaryCards
        netSales={canSales ? netSales : null}
        currencyCode={currencyCode}
        revenueTrend={canSales ? revenueTrend : undefined}
        activeInventoryCount={canInventory ? activeInventoryCount : null}
        lowStockCount={canInventory ? lowStockCount : null}
        pendingOrdersCount={pendingOrdersCount}
        activeStoresCount={activeStoresCount}
        salesState={salesState}
        inventoryState={inventoryState}
        productionState={productionState}
        onNavigate={onNavigate}
      />

      {/* Sales trend chart (reporting API) */}
      <MonthlyRevenueChart
        points={points}
        isLoading={salesLoading}
        restricted={salesState === 'forbidden'}
        error={salesError}
      />

      {/* Two Column: Open Production Tickets & Recent Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Production Queue Status */}
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E3DF] dark:border-[#2B2522]">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[#C48A56]" />
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('overview.recentProduction')}</h3>
            </div>
            <button type="button" onClick={() => onNavigate('production')} className="text-xs font-semibold text-[#C48A56] hover:underline">
              {t('overview.viewProduction')}
            </button>
          </div>

          {productionState === 'forbidden' ? (
            <div className="flex items-center gap-2 text-xs text-[#6E5E4F] dark:text-[#A89D94] py-6">
              <Lock className="w-4 h-4 text-[#C48A56]" /> {t('overview.productionForbidden')}
            </div>
          ) : productionState === 'error' ? (
            <div className="flex items-center gap-2 text-xs text-[#DC2626] py-6">
              <AlertCircle className="w-4 h-4" /> {t('overview.productionError')}
            </div>
          ) : productionState === 'empty' ? (
            <div className="py-8 text-center text-xs text-[#8C7C6B]">{t('overview.productionUnconfigured')}</div>
          ) : tickets.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8C7C6B]">{t('overview.productionEmpty')}</div>
          ) : (
            <div className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] mt-2">
              {tickets.slice(0, 6).map((ticket) => (
                <div key={ticket.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{ticket.orderNumber}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F0EFED] dark:bg-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] font-mono">
                        {ticket.station}
                      </span>
                      {ticket.priority === 'RUSH' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#DC2626]/15 text-[#DC2626] font-bold">RUSH</span>
                      )}
                    </div>
                    <p className="text-xs text-[#6E5E4F] dark:text-[#A89D94] mt-0.5">
                      {ticket.quantity}× {ticket.productName}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        ticket.status === 'IN_PROGRESS' ? 'bg-[#C48A56]/15 text-[#C48A56]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Audit Trail */}
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E3DF] dark:border-[#2B2522]">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#C48A56]" />
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('overview.recentAudit')}</h3>
            </div>
            <button type="button" onClick={() => onNavigate('audit-logs')} className="text-xs font-semibold text-[#C48A56] hover:underline">
              {t('overview.viewAllLogs')}
            </button>
          </div>

          {!canAudit ? (
            <div className="flex items-center gap-2 text-xs text-[#6E5E4F] dark:text-[#A89D94] py-6">
              <Lock className="w-4 h-4 text-[#C48A56]" /> {t('overview.auditForbidden')}
            </div>
          ) : auditError ? (
            <div className="flex items-center gap-2 text-xs text-[#DC2626] py-6">
              <AlertCircle className="w-4 h-4" /> {t('common.error')}
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8C7C6B]">{t('overview.auditEmpty')}</div>
          ) : (
            <div className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] mt-2">
              {recentLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{log.action}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                          log.outcome === 'SUCCESS' ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : log.outcome === 'WARNING' ? 'bg-[#D97706]/10 text-[#D97706]' : 'bg-[#DC2626]/10 text-[#DC2626]'
                        }`}
                      >
                        {log.outcome}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
                      <span className="font-medium text-[#1C1A19] dark:text-[#F5F3F0]">{log.actor}</span>
                      {log.aggregate ? ` • ${log.aggregate}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-[#8C7C6B] font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low-stock nudge when present (from real inventory balances) */}
      {canInventory && lowStockCount !== null && lowStockCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('inventory')}
          className="w-full flex items-center gap-2 rounded-xl border border-[#D97706]/30 bg-[#D97706]/5 px-4 py-3 text-left text-xs text-[#D97706] hover:bg-[#D97706]/10 transition-colors"
        >
          <AlertTriangle className="w-4 h-4" />
          {lowStockCount} {t('overview.belowMinimum')}
        </button>
      )}
    </div>
  );
};
