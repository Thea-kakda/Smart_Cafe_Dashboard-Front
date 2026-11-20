/**
 * Typed client for the inventory-management surface added in M2:
 *  - inter-branch stock transfers (/api/v1/stock-transfers** + the per-store
 *    list, permission inventory:transfer); a transfer spans two stores, so the
 *    request travels source/dest in the body and both are scope-checked in the
 *    service (dispatch debits the source, receive credits the destination).
 *  - low-stock / reorder planning (/api/v1/stores/{storeId}/inventory/{low-
 *    stock,reorder-suggestions,reorder}) — reads require inventory:read + the
 *    store scope; drafting a reorder purchase order requires inventory:reorder.
 *  - ingredient master (/api/v1/ingredients**, closing the Dashboard's
 *    documented ingredient-CRUD gap) — reads under inventory:read, writes under
 *    ingredient:manage.
 *  - unit-of-measure master (/api/v1/units-of-measure/**) — the unauthenticated
 *    POS roster for pickers plus the uom:manage editor surface.
 *
 * Shapes mirror the backend records exactly (inventory.api.*). Quantities are
 * in the ingredient's base unit; money/qty travel as numbers and are validated
 * server-side (BigDecimal HALF_UP). The optimistic-lock `version` is echoed on
 * ingredient/uom PATCH; a stale value maps to 409 VERSION_CONFLICT (catalog
 * convention). No fabricated URLs or storage keys.
 */
import { api } from './api';
import { Paginated } from './management';
import { PurchaseOrderRow } from './purchaseAdmin';

// ─── Stock transfers (StockTransferResponse / CreateStockTransferRequest) ────

export type StockTransferStatus = 'REQUESTED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface StockTransferLineRow {
  stockTransferLineId: string;
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  baseUnitCode: string;
  quantity: number;
  unitCost: number;
}

export interface StockTransferRow {
  stockTransferId: string;
  transferNumber: string;
  sourceStoreId: string;
  sourceStoreName: string;
  destStoreId: string;
  destStoreName: string;
  status: StockTransferStatus;
  notes: string | null;
  requestedByUserId: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  lines: StockTransferLineRow[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateStockTransferLineInput {
  ingredientId: string;
  quantity: number;
  unitCost: number;
}

export interface CreateStockTransferInput {
  sourceStoreId: string;
  destStoreId: string;
  notes?: string | null;
  lines: CreateStockTransferLineInput[];
}

export interface TransferListQuery {
  page?: number;
  size?: number;
}

// ─── Low-stock & reorder (LowStock|ReorderSuggestion|RequestReorder) ─────────

export interface LowStockRow {
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  baseUnitCode: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  reorderPoint: number;
  maxStock: number | null;
  averageUnitCost: number;
}

export interface ReorderSuggestionRow {
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  baseUnitCode: string;
  availableStock: number;
  reorderPoint: number;
  maxStock: number | null;
  suggestedQuantity: number;
}

export interface ReorderLineInput {
  ingredientId: string;
  quantity: number;
  /** Null falls back to the ingredient's standard cost in the service. */
  unitCost?: number | null;
}

export interface ReorderInput {
  supplierId: string;
  /** ISO-8601 instant string, or null when no target delivery date. */
  expectedAt?: string | null;
  notes?: string | null;
  lines: ReorderLineInput[];
}

// ─── Ingredient master (IngredientResponse / Create|UpdateIngredientRequest) ─

export interface IngredientRow {
  ingredientId: string;
  code: string;
  name: string;
  baseUnitId: string;
  baseUnitCode: string;
  baseUnitName: string;
  standardCost: number;
  trackInventory: boolean;
  trackBatches: boolean;
  shelfLifeDays: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateIngredientInput {
  code: string;
  name: string;
  baseUnitId: string;
  standardCost: number;
  trackInventory?: boolean;
  trackBatches?: boolean;
  shelfLifeDays?: number | null;
  active?: boolean;
}

/** Full-replacement update: echoes the version from the last read. */
export interface UpdateIngredientInput extends CreateIngredientInput {
  version: number;
}

export interface IngredientListQuery {
  q?: string;
  page?: number;
  size?: number;
}

// ─── Unit-of-measure master (UnitManagement|Response / Create|UpdateUnit) ────

export type UnitType = 'MASS' | 'VOLUME' | 'COUNT' | 'PACKAGE';

/** The unauthenticated POS/conversion-facing roster (base-unit picker). */
export interface ActiveUnitRow {
  unitId: string;
  code: string;
  name: string;
  type: UnitType;
  decimalScale: number;
  conversionFactorToBase: number;
  baseUnit: boolean;
}

export interface UnitRow {
  unitId: string;
  code: string;
  name: string;
  type: UnitType;
  decimalScale: number;
  conversionFactorToBase: number;
  baseUnit: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateUnitInput {
  code: string;
  name: string;
  type: UnitType;
  decimalScale: number;
  factor: number;
  baseUnit?: boolean;
  active?: boolean;
}

/** Full-replacement update: echoes the version from the last read. */
export interface UpdateUnitInput extends CreateUnitInput {
  version: number;
}

// ─── Batch / lot + expiry (BatchExpiryResponse / WriteOffBatchRequest, M3) ───

export type BatchStatus = 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'ADJUSTED_OUT';

/**
 * One lot on the batch/expiry read surface (inventory.api.BatchExpiryResponse).
 * FEFO-ordered by the service; {@code daysToExpiry} is negative once past the
 * expiry date and null when the lot carries no expiry. A write-off returns the
 * retired row in the same shape.
 */
export interface BatchRow {
  batchId: string;
  storeId: string;
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  baseUnitCode: string;
  lotNumber: string;
  /** ISO date string (yyyy-mm-dd), or null when the lot is undated. */
  expiryDate: string | null;
  quantityBase: number;
  unitCost: number;
  status: BatchStatus;
  daysToExpiry: number | null;
  receivedAt: string;
  version: number;
}

export interface BatchListQuery {
  ingredientId?: string;
  /** Only ACTIVE lots expiring within N days (0 = already past expiry). */
  expiringDays?: number | '';
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

const TRANSFERS = '/api/v1/stock-transfers';
const storeTransfersBase = (storeId: string) => `/api/v1/stores/${storeId}/stock-transfers`;
const invBase = (storeId: string) => `/api/v1/stores/${storeId}/inventory`;
const INGREDIENTS = '/api/v1/ingredients';
const UNITS = '/api/v1/units-of-measure';

export const stockTransfersAdminApi = {
  request: (input: CreateStockTransferInput): Promise<StockTransferRow> =>
    api.post<StockTransferRow>(TRANSFERS, input),

  dispatch: (transferId: string): Promise<StockTransferRow> =>
    api.post<StockTransferRow>(`${TRANSFERS}/${transferId}/dispatch`),

  receive: (transferId: string): Promise<StockTransferRow> =>
    api.post<StockTransferRow>(`${TRANSFERS}/${transferId}/receive`),

  cancel: (transferId: string, reason?: string): Promise<StockTransferRow> =>
    api.post<StockTransferRow>(`${TRANSFERS}/${transferId}/cancel`, undefined, {
      query: { reason: reason ?? '' },
    }),

  get: (transferId: string, signal?: AbortSignal): Promise<StockTransferRow> =>
    api.get<StockTransferRow>(`${TRANSFERS}/${transferId}`, { signal }),

  list: (
    storeId: string,
    query: TransferListQuery = {},
    signal?: AbortSignal,
  ): Promise<Paginated<StockTransferRow>> =>
    api.get<Paginated<StockTransferRow>>(storeTransfersBase(storeId), {
      query: { page: query.page ?? 0, size: query.size ?? 20 },
      signal,
    }),
};

export const reorderAdminApi = {
  lowStock: (storeId: string, signal?: AbortSignal): Promise<LowStockRow[]> =>
    api.get<LowStockRow[]>(`${invBase(storeId)}/low-stock`, { signal }),

  suggestions: (storeId: string, signal?: AbortSignal): Promise<ReorderSuggestionRow[]> =>
    api.get<ReorderSuggestionRow[]>(`${invBase(storeId)}/reorder-suggestions`, { signal }),

  /** Drafts a DRAFT purchase order from chosen reorder lines. */
  reorder: (storeId: string, input: ReorderInput): Promise<PurchaseOrderRow> =>
    api.post<PurchaseOrderRow>(`${invBase(storeId)}/reorder`, input),
};

export const ingredientsAdminApi = {
  list: (query: IngredientListQuery = {}, signal?: AbortSignal): Promise<Paginated<IngredientRow>> =>
    api.get<Paginated<IngredientRow>>(INGREDIENTS, {
      query: { q: query.q ?? '', page: query.page ?? 0, size: query.size ?? 100 },
      signal,
    }),

  get: (ingredientId: string, signal?: AbortSignal): Promise<IngredientRow> =>
    api.get<IngredientRow>(`${INGREDIENTS}/${ingredientId}`, { signal }),

  create: (input: CreateIngredientInput): Promise<IngredientRow> =>
    api.post<IngredientRow>(INGREDIENTS, input),

  update: (ingredientId: string, input: UpdateIngredientInput): Promise<IngredientRow> =>
    api.patch<IngredientRow>(`${INGREDIENTS}/${ingredientId}`, input),
};

export const unitsAdminApi = {
  /** Active roster for pickers — no permission required (POS-facing). */
  listActive: (signal?: AbortSignal): Promise<ActiveUnitRow[]> =>
    api.get<ActiveUnitRow[]>(UNITS, { signal }),

  /** Full editor list incl. inactive + version. Requires uom:manage. */
  list: (signal?: AbortSignal): Promise<UnitRow[]> =>
    api.get<UnitRow[]>(`${UNITS}/management`, { signal }),

  create: (input: CreateUnitInput): Promise<UnitRow> =>
    api.post<UnitRow>(UNITS, input),

  update: (unitId: string, input: UpdateUnitInput): Promise<UnitRow> =>
    api.patch<UnitRow>(`${UNITS}/${unitId}`, input),
};

export const batchesAdminApi = {
  /**
   * A store's lots, FEFO-ordered by the service. Reads require inventory:read
   * + the store scope. Optional filters: a single ingredient and an
   * expiring-within-N-days window (ACTIVE lots only).
   */
  list: (storeId: string, query: BatchListQuery = {}, signal?: AbortSignal): Promise<BatchRow[]> =>
    api.get<BatchRow[]>(`${invBase(storeId)}/batches`, {
      query: {
        ingredientId: query.ingredientId || undefined,
        expiringDays: query.expiringDays === '' || query.expiringDays == null ? undefined : query.expiringDays,
      },
      signal,
    }),

  /** Retire one ACTIVE lot (waste/expiry). Permission inventory:adjust + store scope. */
  writeOff: (storeId: string, batchId: string, reason: string): Promise<BatchRow> =>
    api.post<BatchRow>(`${invBase(storeId)}/batches/${batchId}/write-off`, { reason }),
};
