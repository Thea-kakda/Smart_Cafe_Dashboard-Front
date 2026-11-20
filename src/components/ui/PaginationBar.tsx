import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import {
  PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, clampPage, pageRange, pageWindow,
} from '../../lib/pagination';

interface PaginationBarProps {
  /** Zero-based current page (matches the backend PaginationMeta convention). */
  page: number;
  size: number;
  totalElements: number;
  /** Prefer passing the server's totalPages; when omitted it is derived from totalElements/size. */
  totalPages?: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  /** Disable all controls while a fetch is in flight to avoid stale overwrites. */
  disabled?: boolean;
  sizeOptions?: number[];
  /** Render "No items found." when the result set is empty. Leave false if the host view shows its own empty state. */
  showEmpty?: boolean;
}

const controlBtn =
  'inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-[#F0EFED] dark:hover:enabled:bg-[#2B2522]';

/**
 * Shared, accessible pagination bar for Dashboard collection views. Provides a
 * consistent "Rows per page" selector (10/25/50/100/150), a "Showing a–b of c"
 * range, and windowed page navigation (first/prev/numbers/ellipsis/next/last)
 * built on the pure helpers in lib/pagination. Replaces the per-view duplicated
 * ‹ › footers so every list behaves identically while keeping the existing theme.
 */
export const PaginationBar: React.FC<PaginationBarProps> = ({
  page, size, totalElements, totalPages, onPageChange, onSizeChange,
  disabled = false, sizeOptions = PAGE_SIZE_OPTIONS as readonly number[] as number[], showEmpty = false,
}) => {
  const { t } = useTranslation();

  const effSize = size > 0 ? size : DEFAULT_PAGE_SIZE;
  const derivedTotalPages = Math.max(totalPages ?? Math.ceil(totalElements / effSize), 1);
  const current = clampPage(page, derivedTotalPages);
  const { from, to, total } = pageRange(current, effSize, totalElements);
  const items = pageWindow(current, derivedTotalPages);

  const go = (target: number) => {
    const p = clampPage(target, derivedTotalPages);
    if (p !== current) onPageChange(p);
  };

  const changeSize = (next: number) => {
    onSizeChange(next);
    // Changing the page size re-seeks from the first page (standard behaviour and
    // the safest reconciliation when total page count changes).
    onPageChange(0);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-2.5 border-t border-[#EFECE8] dark:border-[#2B2522] text-[11px] text-[#8C7C6B] dark:text-[#A89D94]">
      {/* Range + size selector */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-1.5">
          <span>{t('common.rowsPerPage')}</span>
          <select
            value={effSize}
            disabled={disabled}
            onChange={(e) => changeSize(Number(e.target.value))}
            aria-label={t('common.rowsPerPage')}
            className="rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-1.5 py-1 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40 disabled:opacity-50"
          >
            {sizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {total === 0 && showEmpty ? (
          <span className="font-semibold">{t('common.noItemsFound')}</span>
        ) : (
          <span aria-live="polite">
            {t('common.showing')} <span className="font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{from}–{to}</span>{' '}
            {t('common.of')} <span className="font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{total}</span> {t('common.items')}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex items-center gap-1.5" aria-label={t('common.page')}>
        <button type="button" className={controlBtn} disabled={disabled || current === 0}
          onClick={() => go(0)} aria-label={t('common.first')}>«</button>
        <button type="button" className={controlBtn} disabled={disabled || current === 0}
          onClick={() => go(current - 1)} aria-label={t('common.previous')}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {items.map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e${idx}`} className="px-0.5 select-none">…</span>
          ) : (
            <button key={item} type="button"
              className={`${controlBtn} ${item - 1 === current ? 'bg-[#C48A56] text-white border-[#C48A56] hover:enabled:bg-[#C48A56]' : ''}`}
              disabled={disabled}
              aria-current={item - 1 === current ? 'page' : undefined}
              onClick={() => go(item - 1)}>
              {item}
            </button>
          ),
        )}

        <button type="button" className={controlBtn} disabled={disabled || current >= derivedTotalPages - 1}
          onClick={() => go(current + 1)} aria-label={t('common.next')}>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={controlBtn} disabled={disabled || current >= derivedTotalPages - 1}
          onClick={() => go(derivedTotalPages - 1)} aria-label={t('common.last')}>»</button>
      </nav>
    </div>
  );
};
