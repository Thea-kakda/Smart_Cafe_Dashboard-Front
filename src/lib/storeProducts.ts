/**
 * Typed client for the protected branch-product management API
 * (/api/v1/management/stores/{storeId}/store-products/**). Provides server-
 * side list/search/filter, single-row detail, add-to-branch, and configuration
 * update (optimistic-lock). Also fetches reference data for category and station
 * filter selectors.
 */
import { api } from './api';
import { ProductSummary, PricingMode, Station } from '../types';

// ─── Backend response shape ────────────────────────────────────────────────

export interface StoreProductRow {
  productId: string;
  productCode: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  basePrice: number;
  overridePrice: number | null;
  inheritedPrice: boolean;
  effectivePrice: number;
  currencyCode: string;
  productActive: boolean;
  branchAvailable: boolean;
  effectiveAvailable: boolean;
  soldOutUntil: string | null;
  stationCode: string;
  preparationMinutes: number;
  customizable: boolean;
  productVersion: number;
  storeProductVersion: number;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface StoreProductQuery {
  search?: string;
  categoryId?: string;
  availability?: string; // 'AVAILABLE' | 'UNAVAILABLE' | undefined
  overrideState?: string; // 'INHERITED' | 'OVERRIDE' | undefined
  stationCode?: string;
  page?: number;
  size?: number;
}

export interface UpdateStoreProductInput {
  overridePrice: number | null;
  available: boolean;
  soldOutUntil: string | null;
  stationCode: string;
  storeProductVersion: number;
}

export interface AddStoreProductInput {
  productId: string;
  overridePrice: number | null;
  available: boolean;
  soldOutUntil: string | null;
  stationCode: string;
}

// ─── Reference shapes ───────────────────────────────────────────────────────

export interface CategoryRow {
  categoryId: string;
  parentCategoryId: string | null;
  code: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
}

export interface StationRow {
  stationId: string;
  storeId: string;
  stationCode: string;
  stationName: string;
  stationType: string;
  displayOrder: number;
  active: boolean;
  version: number;
}

// ─── API functions ──────────────────────────────────────────────────────────

const BASE = (storeId: string) => `/api/v1/management/stores/${storeId}/store-products`;

export const storeProductsApi = {
  list: (storeId: string, query: StoreProductQuery = {}, signal?: AbortSignal) =>
    api.get<Paginated<StoreProductRow>>(BASE(storeId), {
      query: {
        search: query.search ?? '',
        categoryId: query.categoryId ?? '',
        availability: query.availability ?? '',
        overrideState: query.overrideState ?? '',
        stationCode: query.stationCode ?? '',
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),

  get: (storeId: string, productId: string, signal?: AbortSignal) =>
    api.get<StoreProductRow>(`${BASE(storeId)}/${productId}`, { signal }),

  add: (storeId: string, input: AddStoreProductInput) =>
    api.post<StoreProductRow>(BASE(storeId), input),

  update: (storeId: string, productId: string, input: UpdateStoreProductInput) =>
    api.put<StoreProductRow>(`${BASE(storeId)}/${productId}/configuration`, input),
};

/** Public categories endpoint (no auth needed) for the category filter. */
export async function fetchCategories(signal?: AbortSignal): Promise<CategoryRow[]> {
  const data = await api.get<CategoryRow[]>('/api/v1/categories', { signal });
  return data;
}

/** Station list for the branch (protected: requires station:read or branch-product:read). */
export async function fetchStations(storeId: string, signal?: AbortSignal): Promise<StationRow[]> {
  const data = await api.get<StationRow[]>(
    `/api/v1/management/stores/${storeId}/production/stations`,
    { signal },
  );
  return data;
}

// ─── Assignment helpers (pure, unit-testable) ───────────────────────────────

/**
 * Master products that are not yet configured for the branch. "Already
 * assigned" is decided purely by the store_products rows the caller already
 * loaded — this never fabricates visibility or re-derives backend state. Any
 * id present in {@code assignedProductIds} is excluded so the picker cannot
 * offer a product that would fail the add call with CONFIGURATION_EXISTS.
 */
export function unassignedProducts<T extends { productId: string }>(
  masterProducts: readonly T[],
  assignedProductIds: Iterable<string>,
): T[] {
  const assigned = new Set(assignedProductIds);
  return masterProducts.filter((p) => !assigned.has(p.productId));
}

/**
 * Minimal client-side guard for the add-to-branch form. It mirrors the backend
 * contract (productId + station are mandatory) so the operator gets a clear
 * message before a doomed request, but it is NOT authoritative — the service
 * still validates station existence/activeness, currency alignment and price
 * precision server-side. Returns the built input, or null when required fields
 * are missing (empty string / null). Empty overridePrice means "inherit base".
 */
export function buildAddStoreProductInput(form: {
  productId: string;
  stationCode: string;
  available: boolean;
  overridePrice: string;
}): AddStoreProductInput | null {
  const productId = form.productId.trim();
  const stationCode = form.stationCode.trim();
  if (!productId || !stationCode) return null;
  const raw = form.overridePrice.trim();
  const overridePrice = raw === '' ? null : Number(raw);
  if (overridePrice !== null && (!Number.isFinite(overridePrice) || overridePrice < 0)) return null;
  return { productId, stationCode, available: form.available, overridePrice, soldOutUntil: null };
}

// ─── Mapper ─────────────────────────────────────────────────────────────────

function mapStation(code: string): Station {
  const upper = (code || '').toUpperCase();
  if (upper.includes('BARISTA') || upper.includes('COFFEE') || upper.includes('DRINK')) return 'BARISTA';
  if (upper.includes('BAKERY') || upper.includes('BREAD') || upper.includes('OVEN')) return 'BAKERY';
  return 'KITCHEN';
}

export function toProductSummary(r: StoreProductRow): ProductSummary & { storeProductVersion: number; stationCode: string } {
  const pricingMode: PricingMode = r.inheritedPrice ? 'Inherited' : 'Branch Override';
  return {
    id: r.productId,
    code: r.productCode,
    name: r.productName,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    basePrice: r.basePrice,
    branchPrice: r.overridePrice ?? undefined,
    pricingMode,
    effectivePrice: r.effectivePrice,
    currencyCode: r.currencyCode,
    isAvailable: r.effectiveAvailable,
    soldOutUntil: r.soldOutUntil ?? undefined,
    station: mapStation(r.stationCode),
    stationCode: r.stationCode,
    preparationTimeMinutes: r.preparationMinutes,
    isCustomizable: r.customizable,
    updatedAt: r.updatedAt,
    storeProductVersion: r.storeProductVersion,
  };
}
