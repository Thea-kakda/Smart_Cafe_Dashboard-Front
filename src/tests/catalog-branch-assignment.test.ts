import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../lib/i18n';
import { unassignedProducts, buildAddStoreProductInput } from '../lib/storeProducts';

/**
 * Product-visibility regression guard.
 *
 * Verified root cause: creating a product in the Dashboard writes catalog
 * master data only, while both the customer menu and the Staff POS read the
 * store-scoped catalog that INNER JOINs catalog.store_products. The add-to-branch
 * client (storeProductsApi.add) and its endpoint existed but were never wired to
 * any UI, so a newly created product could never become visible. These tests pin
 * the pure building blocks of the assignment surface so the wiring cannot be
 * silently broken again (a renamed helper or a missing i18n key).
 */
const en = translations.en as Record<string, string>;
const km = translations.km as Record<string, string>;

const ADD_KEYS = [
  'catalog.add', 'catalog.addTitle', 'catalog.addDescription',
  'catalog.selectProduct', 'catalog.selectStation', 'catalog.fieldAvailable',
  'catalog.fieldOverridePrice', 'catalog.overrideHint', 'catalog.noAssignable',
  'catalog.productsLoadError', 'catalog.stationLoadError', 'catalog.addedMsg',
  'catalog.errProductRequired', 'catalog.errStationRequired', 'catalog.errPriceInvalid',
  'catalog.errDuplicate', 'catalog.errCurrencyMismatch', 'catalog.errStationNotFound',
  'catalog.errProductNotFound', 'catalog.errAddValidation', 'catalog.errAddNetwork',
];

describe('Add-to-branch assignment surface', () => {
  it('every referenced add-to-branch key exists and is non-empty in English', () => {
    for (const key of ADD_KEYS) {
      assert.ok(key in en, `English dictionary missing add-to-branch key: ${key}`);
      assert.ok(en[key].trim().length > 0, `English add-to-branch key is blank: ${key}`);
    }
  });

  it('every referenced add-to-branch key exists and is non-empty in Khmer', () => {
    for (const key of ADD_KEYS) {
      assert.ok(key in km, `Khmer dictionary missing add-to-branch key: ${key}`);
      assert.ok(km[key].trim().length > 0, `Khmer add-to-branch key is blank: ${key}`);
    }
  });

  it('unassignedProducts excludes only rows already configured for the branch', () => {
    const master = [
      { productId: 'a' }, { productId: 'b' }, { productId: 'c' },
    ];
    const result = unassignedProducts(master, new Set(['b']));
    assert.deepStrictEqual(result.map((p) => p.productId), ['a', 'c']);
    // Nothing already assigned is offered back (prevents doomed CONFIGURATION_EXISTS).
    assert.ok(!result.some((p) => p.productId === 'b'));
  });

  it('unassignedProducts with no assignments returns every master product', () => {
    const master = [{ productId: 'a' }, { productId: 'b' }];
    assert.strictEqual(unassignedProducts(master, []).length, 2);
  });

  it('buildAddStoreProductInput maps a blank override price to "inherit base" (null)', () => {
    const input = buildAddStoreProductInput({
      productId: 'p1', stationCode: 'BARISTA', available: true, overridePrice: '  ',
    });
    assert.deepStrictEqual(input, {
      productId: 'p1', stationCode: 'BARISTA', available: true, overridePrice: null, soldOutUntil: null,
    });
  });

  it('buildAddStoreProductInput keeps a valid override price and trims identifiers', () => {
    const input = buildAddStoreProductInput({
      productId: ' p1 ', stationCode: ' BAKERY ', available: false, overridePrice: '3.5000',
    });
    assert.deepStrictEqual(input, {
      productId: 'p1', stationCode: 'BAKERY', available: false, overridePrice: 3.5, soldOutUntil: null,
    });
  });

  it('buildAddStoreProductInput rejects missing product or station (mirrors backend @NotNull)', () => {
    assert.strictEqual(buildAddStoreProductInput({ productId: '', stationCode: 'BARISTA', available: true, overridePrice: '' }), null);
    assert.strictEqual(buildAddStoreProductInput({ productId: 'p1', stationCode: '  ', available: true, overridePrice: '' }), null);
  });

  it('buildAddStoreProductInput rejects a negative or non-numeric override price', () => {
    assert.strictEqual(buildAddStoreProductInput({ productId: 'p1', stationCode: 'BARISTA', available: true, overridePrice: '-1' }), null);
    assert.strictEqual(buildAddStoreProductInput({ productId: 'p1', stationCode: 'BARISTA', available: true, overridePrice: 'abc' }), null);
  });
});
