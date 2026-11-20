import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, clampPage, safePageSize, pageRange, pageWindow,
} from '../lib/pagination';

describe('Pagination helpers', () => {
  it('exposes the required selectable page sizes and a valid default', () => {
    assert.deepStrictEqual([...PAGE_SIZE_OPTIONS], [10, 25, 50, 100, 150]);
    assert.ok((PAGE_SIZE_OPTIONS as readonly number[]).includes(DEFAULT_PAGE_SIZE),
      'default size must itself be selectable');
  });

  it('clampPage keeps the index within range and never negative', () => {
    assert.strictEqual(clampPage(0, 10), 0);
    assert.strictEqual(clampPage(9, 10), 9);
    assert.strictEqual(clampPage(50, 10), 9, 'page past the last page clamps to last');
    assert.strictEqual(clampPage(-3, 10), 0);
    assert.strictEqual(clampPage(4, 0), 0, 'empty result set resolves to page 0');
    assert.strictEqual(clampPage(NaN, 5), 0);
  });

  it('safePageSize normalizes a non-selectable size to the default', () => {
    assert.strictEqual(safePageSize(50), 50);
    assert.strictEqual(safePageSize(20), DEFAULT_PAGE_SIZE, 'legacy backend size 20 falls back to default');
    assert.strictEqual(safePageSize(undefined), DEFAULT_PAGE_SIZE);
    assert.strictEqual(safePageSize(null), DEFAULT_PAGE_SIZE);
  });

  it('pageRange reports the correct 1-based displayed range and total', () => {
    assert.deepStrictEqual(pageRange(0, 25, 238), { from: 1, to: 25, total: 238 });
    assert.deepStrictEqual(pageRange(1, 25, 238), { from: 26, to: 50, total: 238 });
    assert.deepStrictEqual(pageRange(9, 25, 238), { from: 226, to: 238, total: 238 }, 'last partial page');
    // Fewer items than one page.
    assert.deepStrictEqual(pageRange(0, 25, 12), { from: 1, to: 12, total: 12 });
    // Empty result set yields no invalid range.
    assert.deepStrictEqual(pageRange(0, 25, 0), { from: 0, to: 0, total: 0 });
    // Out-of-range page is clamped, not shown as empty.
    assert.deepStrictEqual(pageRange(6, 25, 12), { from: 1, to: 12, total: 12 });
  });

  it('pageWindow lists all pages when the set is small', () => {
    assert.deepStrictEqual(pageWindow(0, 5), [1, 2, 3, 4, 5]);
    assert.deepStrictEqual(pageWindow(0, 1), [1]);
  });

  it('pageWindow windows with ellipsis for large sets and always includes first, last and current', () => {
    const win = pageWindow(5, 10); // current zero-based 5 => page 6 of 10
    assert.ok(win.includes(1), 'includes first');
    assert.ok(win.includes(10), 'includes last');
    assert.ok(win.includes(6), 'includes current page');
    assert.ok(win.includes('ellipsis'), 'uses ellipsis for gaps');
    assert.ok(win.length <= 7, 'never renders hundreds of buttons');
  });

  it('pageWindow near the start and end does not emit an ellipsis adjacent to the edge page', () => {
    const start = pageWindow(0, 20); // page 1 of 20
    assert.strictEqual(start[0], 1);
    // After first page then a single gap then neighbourhood.
    assert.deepStrictEqual(start.slice(0, 2), [1, 2]);
    const end = pageWindow(19, 20); // page 20 of 20
    assert.strictEqual(end[end.length - 1], 20);
  });

  it('pageWindow clamps an out-of-range current page before building the window', () => {
    const win = pageWindow(100, 10); // requested page far past the end
    assert.ok(win.includes(10), 'clamped to the last page neighbourhood');
  });
});
