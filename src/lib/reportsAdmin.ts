/**
 * Typed client for the BI & financial reports API
 * (GET /api/v1/management/reports/**). All aggregation happens in the
 * database; the browser only displays server-computed rows. Rows are grouped
 * per currency by construction, so mixed-currency sums cannot occur here.
 */
import { api } from './api';

/** reporting.api.SalesSummaryRow */
export interface SalesSummaryRow {
  period: string;
  currencyCode: string;
  orderCount: number;
  paidOrderCount: number;
  grossSales: number;
  discounts: number;
  tax: number;
  deliveryFees: number;
  rounding: number;
  netSales: number;
  averageOrderValue?: number | null;
}

/** reporting.api.SalesSummaryReport */
export interface SalesSummaryReport {
  from: string;
  to: string;
  grouping: string;
  timezone: string;
  rows: SalesSummaryRow[];
  truncated: boolean;
  metricBasis: string;
}

/** reporting.api.InventoryConsumptionRow — quantities only (no cost columns exist historically). */
export interface InventoryConsumptionRow {
  productName: string;
  ingredientName: string;
  unitCode: string;
  unitsConsumed: number;
}

/** reporting.api.InventoryConsumptionReport */
export interface InventoryConsumptionReport {
  from: string;
  to: string;
  rows: InventoryConsumptionRow[];
  itemsWithoutRecipeSnapshot: number;
  truncated: boolean;
  cogsAvailable: boolean;
  grossMarginAvailable: boolean;
  unavailableReason?: string | null;
}

export type SalesGrouping = 'DAY' | 'WEEK' | 'MONTH';

const BASE = '/api/v1/management/reports';

export const reportsAdminApi = {
  salesSummary: (params: {
    storeId?: string;
    from: string;
    to: string;
    grouping?: SalesGrouping;
    currencyCode?: string;
  }, signal?: AbortSignal) =>
    api.get<SalesSummaryReport>(`${BASE}/sales-summary`, {
      query: {
        storeId: params.storeId || undefined,
        from: params.from,
        to: params.to,
        grouping: params.grouping ?? 'DAY',
        currencyCode: params.currencyCode || undefined,
      },
      signal,
    }),

  inventoryCogs: (params: { storeId?: string; from: string; to: string }, signal?: AbortSignal) =>
    api.get<InventoryConsumptionReport>(`${BASE}/inventory-cogs`, {
      query: {
        storeId: params.storeId || undefined,
        from: params.from,
        to: params.to,
      },
      signal,
    }),
};
