/**
 * Typed client for the Promotions & Campaigns administration API
 * (GET/POST/PUT /api/v1/management/promotions/**) plus the real catalog
 * endpoints the assignment pickers read from (categories, per-store catalog).
 * Codes are immutable identity and usage_count is redemption history — neither
 * is accepted in any mutation body, exactly as the backend enforces.
 */
import { api } from './api';
import { Paginated } from './management';

/** promotion.api.PromotionAdminResponse */
export interface PromotionAdmin {
  promotionId: string;
  promotionCode: string;
  promotionName: string;
  discountType: string;
  discountValue: number;
  minimumOrderAmount?: number | null;
  maximumDiscountAmount?: number | null;
  currencyCode?: string | null;
  startsAt: string;
  endsAt?: string | null;
  status: string;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  usageCount: number;
  stackable: boolean;
  automatic: boolean;
  priority: number;
  version: number;
  /** Null in list rows; detail and mutation responses always include them. */
  productIds?: string[] | null;
  categoryIds?: string[] | null;
  storeIds?: string[] | null;
}

/** promotion.api.CreatePromotionRequest — absent assignment lists mean "global". */
export interface CreatePromotionInput {
  promotionCode: string;
  promotionName: string;
  discountType: string;
  discountValue: number;
  minimumOrderAmount?: number | null;
  maximumDiscountAmount?: number | null;
  currencyCode?: string | null;
  startsAt: string;
  endsAt?: string | null;
  status: string;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  stackable?: boolean | null;
  automatic?: boolean | null;
  priority?: number | null;
  productIds?: string[] | null;
  categoryIds?: string[] | null;
  storeIds?: string[] | null;
}

/** Full-replacement PUT: nullable columns clear when sent null; code/status/usage_count absent. */
export interface UpdatePromotionInput {
  promotionName: string;
  discountType: string;
  discountValue: number;
  minimumOrderAmount?: number | null;
  maximumDiscountAmount?: number | null;
  currencyCode?: string | null;
  startsAt: string;
  endsAt?: string | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  stackable?: boolean | null;
  automatic?: boolean | null;
  priority?: number | null;
  productIds?: string[] | null;
  categoryIds?: string[] | null;
  storeIds?: string[] | null;
  version: number;
}

export interface PromotionStatusInput {
  status: string;
  version: number;
  reason?: string | null;
}

const BASE = '/api/v1/management/promotions';

export const promotionsAdminApi = {
  list: (status?: string, page = 0, size = 20, signal?: AbortSignal) =>
    api.get<Paginated<PromotionAdmin>>(BASE, {
      query: { status: status || undefined, page, size },
      signal,
    }),

  detail: (promotionId: string, signal?: AbortSignal) =>
    api.get<PromotionAdmin>(`${BASE}/${promotionId}`, { signal }),

  create: (input: CreatePromotionInput) => api.post<PromotionAdmin>(BASE, input),

  update: (promotionId: string, input: UpdatePromotionInput) =>
    api.put<PromotionAdmin>(`${BASE}/${promotionId}`, input),

  changeStatus: (promotionId: string, input: PromotionStatusInput) =>
    api.post<PromotionAdmin>(`${BASE}/${promotionId}/status`, input),
};

/** catalog.api.CategoryResponse — real reference data for the category picker. */
export interface CatalogCategory {
  categoryId: string;
  parentCategoryId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder: number;
}

/** catalog.api.ProductSummaryResponse — one row of a branch catalog page. */
export interface CatalogProductRow {
  productId: string;
  productCode: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  currencyCode: string;
  available: boolean;
  preparationMinutes: number;
  customizable: boolean;
}

export const catalogPickersApi = {
  categories: (signal?: AbortSignal) => api.get<CatalogCategory[]>('/api/v1/categories', { signal }),

  /** Per-store catalog page; product ids are global catalog ids, so this is a real id source. */
  products: (storeId: string, search = '', page = 0, size = 50, signal?: AbortSignal) =>
    api.get<Paginated<CatalogProductRow>>(`/api/v1/stores/${storeId}/catalog`, {
      query: { search, page, size },
      signal,
    }),
};
