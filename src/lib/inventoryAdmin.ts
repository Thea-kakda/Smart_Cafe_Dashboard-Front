/**
 * Typed client for the store-scoped Inventory API (§1.5,
 * /api/v1/stores/{storeId}/inventory/**). Balances come back as a plain list
 * (single store, bounded), the movement ledger is paginated newest-first, and
 * manual writes go through the guarded adjustment command (IN/OUT with a
 * mandatory reason, optimistic stock floor → 409 INSUFFICIENT_STOCK). Mirrors
 * backend DTOs exactly; view code deals in these shapes and the mappers below,
 * never raw URLs. Permissions enforced server-side: inventory:read (reads) and
 * inventory:adjust (writes), plus the store scope.
 */
import { api } from './api';
import { Paginated } from './management';
import { InventoryItem } from '../types';

/** inventory.api.InventoryBalanceResponse */
export interface InventoryBalanceRow {
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  baseUnitCode: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  minimumStock: number;
  averageUnitCost: number;
  lowStock: boolean;
  version: number;
}

/** inventory.api.StockMovementResponse (one ledger LINE) */
export interface StockMovementRow {
  transactionId: string;
  transactionNumber: string;
  transactionType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  actorId?: string | null;
  reason?: string | null;
  occurredAt: string;
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  unitCode: string;
  delta: number;
  unitCost?: number | null;
  balanceBefore: number;
  balanceAfter: number;
}

/** inventory.api.InventoryAdjustmentResponse */
export interface InventoryAdjustmentResult {
  transactionId: string;
  transactionNumber: string;
  storeId: string;
  ingredientId: string;
  type: string;
  direction: string;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  averageUnitCost: number;
  reason: string;
  balanceVersion: number;
}

/** POST /adjustments body (AdjustInventoryRequest). */
export interface AdjustInput {
  ingredientId: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  unitCost?: number | null;
  type?: 'ADJUSTMENT' | 'STOCK_IN' | 'RETURN' | 'DAMAGED';
}

export interface MovementQuery {
  type?: string;
  ingredientId?: string;
  page?: number;
  size?: number;
}

const BASE = (storeId: string) => `/api/v1/stores/${storeId}/inventory`;

export const inventoryAdminApi = {
  list: (storeId: string, signal?: AbortSignal) =>
    api.get<InventoryBalanceRow[]>(BASE(storeId), { signal }),

  adjust: (storeId: string, input: AdjustInput) =>
    api.post<InventoryAdjustmentResult>(`${BASE(storeId)}/adjustments`, input),

  movements: (storeId: string, query: MovementQuery = {}, signal?: AbortSignal) =>
    api.get<Paginated<StockMovementRow>>(`${BASE(storeId)}/movements`, {
      query: {
        type: query.type || undefined,
        ingredientId: query.ingredientId || undefined,
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),
};

/** Map the authoritative balance row onto the dashboard InventoryItem shape. */
export function toInventoryItem(r: InventoryBalanceRow): InventoryItem {
  return {
    id: r.ingredientId,
    ingredientCode: r.ingredientCode,
    ingredientName: r.ingredientName,
    baseUnit: r.baseUnitCode,
    currentStock: r.currentStock,
    reservedStock: r.reservedStock,
    availableStock: r.availableStock,
    minimumStock: r.minimumStock,
    isLowStock: r.lowStock,
    unitCost: r.averageUnitCost,
    version: r.version,
  };
}
