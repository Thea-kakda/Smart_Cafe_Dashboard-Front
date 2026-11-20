/**
 * Typed client for the purchasing surface added in Inventory Management M1:
 *  - supplier master data (/api/v1/suppliers**, permission supplier:manage);
 *  - store-scoped purchase orders and goods receiving
 *    (/api/v1/stores/{storeId}/purchase-orders**). Lifecycle commands require
 *    purchase:manage + the store scope; the physical receive requires
 *    inventory:receive + the store scope (server-enforced).
 *
 * Shapes mirror the backend records exactly (inventory.api.*). Suppliers are
 * global master data, so they carry no store id; purchase orders and receipts
 * are always resolved against the selected branch. The optimistic-lock
 * `version` is echoed on supplier PATCH; a stale value maps to 409
 * VERSION_CONFLICT (catalog convention). Quantities are in the ingredient's
 * base unit, matching the balance ledger. No fabricated URLs or storage keys.
 */
import { api } from './api';
import { Paginated } from './management';

// ─── Suppliers (SupplierResponse / Create|UpdateSupplierRequest) ────────────

export interface SupplierRow {
  supplierId: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateSupplierInput {
  code: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  active?: boolean;
}

/** Full-replacement update: echoes the version from the last read. */
export interface UpdateSupplierInput extends CreateSupplierInput {
  version: number;
}

export interface SupplierListQuery {
  q?: string;
  page?: number;
  size?: number;
}

// ─── Purchase orders (PurchaseOrderResponse / CreatePurchaseOrderRequest) ───

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'
  | 'CLOSED';

export interface PurchaseOrderLineRow {
  lineId: string;
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  unitCode: string;
  quantityOrdered: number;
  quantityReceived: number;
  outstanding: number;
  unitCost: number;
}

export interface PurchaseOrderRow {
  purchaseOrderId: string;
  poNumber: string;
  storeId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  orderedAt: string;
  expectedAt: string | null;
  notes: string | null;
  createdByUserId: string | null;
  lines: PurchaseOrderLineRow[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreatePurchaseOrderLineInput {
  ingredientId: string;
  quantityOrdered: number;
  unitCost: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  /** ISO-8601 instant string, or null when no target delivery date. */
  expectedAt?: string | null;
  notes?: string | null;
  lines: CreatePurchaseOrderLineInput[];
}

export interface PurchaseOrderListQuery {
  status?: PurchaseOrderStatus | '';
  page?: number;
  size?: number;
}

// ─── Receiving (GoodsReceiptResponse / ReceiveGoodsRequest) ─────────────────

export interface ReceiveGoodsLineInput {
  ingredientId: string;
  quantity: number;
  /** Null falls back to the PO line's unit cost when restating the average. */
  unitCost?: number | null;
  lotNumber?: string | null;
  /** ISO date (yyyy-MM-dd) captured for M3 batch tracking; optional. */
  expiryDate?: string | null;
}

export interface ReceiveGoodsInput {
  lines: ReceiveGoodsLineInput[];
}

export interface GoodsReceiptLineRow {
  lineId: string;
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  quantity: number;
  unitCost: number | null;
  lotNumber: string | null;
  expiryDate: string | null;
}

export interface GoodsReceiptRow {
  goodsReceiptId: string;
  receiptNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  storeId: string;
  receivedByUserId: string | null;
  receivedAt: string;
  lines: GoodsReceiptLineRow[];
  version: number;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

const SUPPLIERS = '/api/v1/suppliers';
const poBase = (storeId: string) => `/api/v1/stores/${storeId}/purchase-orders`;

export const suppliersAdminApi = {
  list: (query: SupplierListQuery = {}, signal?: AbortSignal): Promise<Paginated<SupplierRow>> =>
    api.get<Paginated<SupplierRow>>(SUPPLIERS, {
      query: {
        q: query.q ?? '',
        page: query.page ?? 0,
        size: query.size ?? 100,
      },
      signal,
    }),

  get: (supplierId: string, signal?: AbortSignal): Promise<SupplierRow> =>
    api.get<SupplierRow>(`${SUPPLIERS}/${supplierId}`, { signal }),

  create: (input: CreateSupplierInput): Promise<SupplierRow> =>
    api.post<SupplierRow>(SUPPLIERS, input),

  update: (supplierId: string, input: UpdateSupplierInput): Promise<SupplierRow> =>
    api.patch<SupplierRow>(`${SUPPLIERS}/${supplierId}`, input),
};

export const purchaseOrdersAdminApi = {
  list: (
    storeId: string,
    query: PurchaseOrderListQuery = {},
    signal?: AbortSignal,
  ): Promise<Paginated<PurchaseOrderRow>> =>
    api.get<Paginated<PurchaseOrderRow>>(poBase(storeId), {
      query: {
        status: query.status ?? '',
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),

  get: (storeId: string, poId: string, signal?: AbortSignal): Promise<PurchaseOrderRow> =>
    api.get<PurchaseOrderRow>(`${poBase(storeId)}/${poId}`, { signal }),

  create: (storeId: string, input: CreatePurchaseOrderInput): Promise<PurchaseOrderRow> =>
    api.post<PurchaseOrderRow>(poBase(storeId), input),

  submit: (storeId: string, poId: string): Promise<PurchaseOrderRow> =>
    api.post<PurchaseOrderRow>(`${poBase(storeId)}/${poId}/submit`),

  cancel: (storeId: string, poId: string, reason?: string): Promise<PurchaseOrderRow> =>
    api.post<PurchaseOrderRow>(`${poBase(storeId)}/${poId}/cancel`, undefined, {
      query: { reason: reason ?? '' },
    }),

  close: (storeId: string, poId: string): Promise<PurchaseOrderRow> =>
    api.post<PurchaseOrderRow>(`${poBase(storeId)}/${poId}/close`),

  receive: (storeId: string, poId: string, input: ReceiveGoodsInput): Promise<GoodsReceiptRow> =>
    api.post<GoodsReceiptRow>(`${poBase(storeId)}/${poId}/receipts`, input),
};
