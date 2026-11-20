/**
 * Pure, dependency-free pagination helpers shared by the Dashboard collection
 * views. These operate on the backend's server-side pagination contract
 * (`PaginationMeta`: zero-based `page`, `size`, `totalElements`, `totalPages`,
 * `first`, `last`) so every list renders identical page-size options, ranges and
 * windowed page buttons without duplicating (and diverging) the math inline.
 *
 * Kept as plain functions so they are unit-testable with node:test (no React or
 * DOM required), matching the Dashboard's existing logic-only test style.
 */

/** Standard selectable page sizes required across the application. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 150] as const;

/**
 * Default page size. The backend defaults several list endpoints to 20, which is
 * not one of the selectable options; 25 is used so the selector's default is a
 * valid, consistently offered choice.
 */
export const DEFAULT_PAGE_SIZE = 25;

/** Minimum allowed page index (backend is zero-based). */
export const FIRST_PAGE = 0;

/**
 * Clamp a page index into the valid range for a given total page count.
 * Empty datasets (totalPages <= 0) resolve to page 0. Prevents the UI from being
 * stranded on an out-of-range page after a filter/search/size change shrinks the
 * result set (e.g. user on page 6, new filter leaves 1 page).
 */
export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page) || page <= FIRST_PAGE) return FIRST_PAGE;
  const max = Math.max(totalPages, 1) - 1;
  return Math.min(page, max);
}

/** Normalize a requested size to one of the allowed options (fallback to default). */
export function safePageSize(size: number | undefined | null): number {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(size ?? NaN)
    ? (size as number)
    : DEFAULT_PAGE_SIZE;
}

/**
 * The 1-based inclusive range shown to the user for the current page, e.g.
 * "Showing 26–50 of 238". For an empty result set both bounds are 0 so callers
 * can render "Showing 0–0 of 0" or an empty state without invalid ranges.
 */
export function pageRange(
  page: number,
  size: number,
  totalElements: number,
): { from: number; to: number; total: number } {
  const total = Math.max(totalElements, 0);
  if (total === 0) return { from: 0, to: 0, total: 0 };
  const p = clampPage(page, Math.ceil(total / Math.max(size, 1)));
  const from = p * size + 1;
  const to = Math.min(from + size - 1, total);
  return { from, to, total };
}

export type PageItem = number | 'ellipsis';

/**
 * Build a compact, windowed list of 1-based page numbers with ellipsis markers,
 * so a 238-page table never renders hundreds of buttons. Always includes the
 * first and last page and the neighbourhood of the current page.
 *
 * Example (current 0-based page 5 of 10 total pages):
 *   [1, 'ellipsis', 5, 6, 7, 'ellipsis', 10]
 */
export function pageWindow(currentPage: number, totalPages: number, sibling = 1): PageItem[] {
  const total = Math.max(totalPages, 1);
  const current = clampPage(currentPage, total) + 1; // to 1-based
  const count = total;

  if (count <= 2 * sibling + 5) {
    // Small enough to list every page without ellipsis.
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  const pages: PageItem[] = [];
  const left = Math.max(2, current - sibling);
  const right = Math.min(count - 1, current + sibling);

  pages.push(1);
  if (left > 2) pages.push('ellipsis');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < count - 1) pages.push('ellipsis');
  if (count > 1) pages.push(count);

  return pages;
}
