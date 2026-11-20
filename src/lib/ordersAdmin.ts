/**
 * Typed client for the Orders Administration read API
 * (GET /api/v1/management/orders/**). Search, filtering and pagination are
 * executed server-side; the view never downloads a full order table to filter
 * it in the browser. Guarded by the dedicated order:admin-read permission.
 */
import { api } from './api';
import { Paginated } from './management';

/** ordering.api.ManagementOrderSummary — persisted columns only. */
export interface ManagementOrder {
  orderId: string;
  orderNumber: string;
  storeId: string;
  customerId?: string | null;
  source: string;
  fulfillmentType: string;
  status: string;
  paymentStatus: string;
  currencyCode: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryFee: number;
  roundingAmount: number;
  totalAmount: number;
  totalQuantity: number;
  orderedAt: string;
  updatedAt: string;
  version: number;
}

/** ordering.api.OrderItemResponse */
export interface ManagementOrderItem {
  orderItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  lineTotal: number;
  customizations: string[];
}

/** ordering.api.ManagementOrderDetail */
export interface ManagementOrderDetail {
  order: ManagementOrder;
  items: ManagementOrderItem[];
}

export interface OrderListQuery {
  storeId?: string;
  orderNumber?: string;
  customerId?: string;
  status?: string;
  paymentStatus?: string;
  source?: string;
  fulfillmentType?: string;
  /** ISO-8601 instants; the view converts date inputs to day boundaries. */
  orderedFrom?: string;
  orderedTo?: string;
  sort?: string;
  page?: number;
  size?: number;
}

const BASE = '/api/v1/management/orders';

export const ordersAdminApi = {
  list: (query: OrderListQuery = {}, signal?: AbortSignal) =>
    api.get<Paginated<ManagementOrder>>(BASE, {
      query: {
        storeId: query.storeId || undefined,
        orderNumber: query.orderNumber || undefined,
        customerId: query.customerId || undefined,
        status: query.status || undefined,
        paymentStatus: query.paymentStatus || undefined,
        source: query.source || undefined,
        fulfillmentType: query.fulfillmentType || undefined,
        orderedFrom: query.orderedFrom || undefined,
        orderedTo: query.orderedTo || undefined,
        sort: query.sort ?? 'orderedAt',
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),

  detail: (orderId: string, signal?: AbortSignal) =>
    api.get<ManagementOrderDetail>(`${BASE}/${orderId}`, { signal }),
};
