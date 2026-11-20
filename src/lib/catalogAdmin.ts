/**
 * Typed client for the master-data catalog management surface used by the
 * Dashboard editor.
 *
 * Two halves:
 *  - protected reads under /api/v1/management/catalog/** (require
 *    product:manage / category:manage) that return the raw imageObjectKey and
 *    the optimistic-lock version alongside a short-lived presigned imageUrl;
 *  - writes on the resource paths (POST /api/v1/products,
 *    PATCH /api/v1/products/{id}, and the category equivalents). The version
 *    must be echoed back on update; a stale value maps to 409 VERSION_CONFLICT.
 *
 * The editor never fabricates storage URLs or buckets: it stores the objectKey
 * returned by the File API (see lib/files.ts) and renders the backend-resolved
 * imageUrl. Reuses the shared Paginated/PaginationMeta envelope shape.
 */
import { api } from './api';
import { Paginated, PaginationMeta } from './storeProducts';
import { ProductType, StockMode } from './productEditor';

// ─── Backend response shapes (mirror the management DTOs) ───────────────────

export interface ManagementProduct {
  productId: string;
  code: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  basePrice: number;
  currencyCode: string;
  preparationMinutes: number;
  taxRate: number;
  customizable: boolean;
  active: boolean;
  /**
   * Slice 4A classification pair. The management DTO always carries both, so
   * they are required here rather than optional-but-guessed: a product that
   * predates V039 still reports the column defaults (STANDARD / MADE_TO_ORDER).
   */
  productType: ProductType;
  stockMode: StockMode;
  /** Short-lived presigned GET URL resolved by the backend; null when no image. */
  imageUrl: string | null;
  /** Raw storage key to persist and echo back; null when no image. */
  imageObjectKey: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ManagementCategory {
  categoryId: string;
  parentCategoryId: string | null;
  parentName: string | null;
  code: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageObjectKey: string | null;
  displayOrder: number;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Write input shapes (mirror the request DTOs) ───────────────────────────

export interface CreateProductInput {
  code: string;
  categoryId: string;
  name: string;
  description?: string | null;
  basePrice: number;
  currencyCode: string;
  preparationMinutes: number;
  taxRate: number;
  customizable?: boolean;
  active?: boolean;
  imageObjectKey?: string | null;
  /**
   * Omitted means "leave the stored classification alone" — the service only
   * parses a non-blank value, so the editor must send null rather than a
   * default when the operator did not touch these two selects.
   */
  productType?: ProductType | null;
  stockMode?: StockMode | null;
}

export interface UpdateProductInput extends CreateProductInput {
  /** Must echo the version from the last management read. */
  version: number;
}

export interface CreateCategoryInput {
  parentCategoryId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  displayOrder: number;
  active?: boolean;
  imageObjectKey?: string | null;
}

export interface UpdateCategoryInput extends CreateCategoryInput {
  version: number;
}

export interface ProductListQuery {
  search?: string;
  categoryId?: string;
  sort?: 'code' | 'name' | 'basePrice' | 'updatedAt';
  direction?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

// ─── API objects ────────────────────────────────────────────────────────────

const PRODUCTS_READ = '/api/v1/management/catalog/products';
const CATEGORIES_READ = '/api/v1/management/catalog/categories';
const PRODUCTS_WRITE = '/api/v1/products';
const CATEGORIES_WRITE = '/api/v1/categories';

export const productsAdminApi = {
  list: (query: ProductListQuery = {}, signal?: AbortSignal): Promise<Paginated<ManagementProduct>> =>
    api.get<Paginated<ManagementProduct>>(PRODUCTS_READ, {
      query: {
        search: query.search ?? '',
        categoryId: query.categoryId ?? '',
        sort: query.sort ?? 'name',
        direction: query.direction ?? 'asc',
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),

  get: (productId: string, signal?: AbortSignal): Promise<ManagementProduct> =>
    api.get<ManagementProduct>(`${PRODUCTS_READ}/${productId}`, { signal }),

  create: (input: CreateProductInput): Promise<ManagementProduct> =>
    api.post<ManagementProduct>(PRODUCTS_WRITE, input),

  update: (productId: string, input: UpdateProductInput): Promise<ManagementProduct> =>
    api.patch<ManagementProduct>(`${PRODUCTS_WRITE}/${productId}`, input),
};

export const categoriesAdminApi = {
  /** Category management list is unpaginated (returns every category for editing). */
  list: (signal?: AbortSignal): Promise<ManagementCategory[]> =>
    api.get<ManagementCategory[]>(CATEGORIES_READ, { signal }),

  get: (categoryId: string, signal?: AbortSignal): Promise<ManagementCategory> =>
    api.get<ManagementCategory>(`${CATEGORIES_READ}/${categoryId}`, { signal }),

  create: (input: CreateCategoryInput): Promise<ManagementCategory> =>
    api.post<ManagementCategory>(CATEGORIES_WRITE, input),

  update: (categoryId: string, input: UpdateCategoryInput): Promise<ManagementCategory> =>
    api.patch<ManagementCategory>(`${CATEGORIES_WRITE}/${categoryId}`, input),
};

export type { Paginated, PaginationMeta };
