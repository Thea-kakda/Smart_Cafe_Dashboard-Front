import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../lib/i18n';

/**
 * The catalog write path ships three new Dashboard surfaces whose copy is
 * entirely i18n-driven: the image upload field (image.*), the product editor
 * (prodAdmin.*) and the category editor (catAdmin.*), plus two nav labels. The
 * localization suite already enforces full en↔km parity, so these tests pin the
 * specific keys the views and components reference, so a rename cannot silently
 * leave a screen showing a raw key.
 */
const en = translations.en as Record<string, string>;
const km = translations.km as Record<string, string>;

const REQUIRED_KEYS: string[] = [
  'nav.productAdmin',
  'nav.categoryAdmin',
  // image upload field
  'image.select', 'image.replace', 'image.remove', 'image.retry', 'image.uploaded',
  'image.none', 'image.storedKey', 'image.hint', 'image.tooLarge', 'image.wrongType',
  'image.forbidden', 'image.unauthorized', 'image.rejected', 'image.networkError', 'image.uploadFailed',
  // product editor — chrome + fields
  'prodAdmin.title', 'prodAdmin.description', 'prodAdmin.create', 'prodAdmin.createTitle',
  'prodAdmin.editTitle', 'prodAdmin.edit', 'prodAdmin.forbidden', 'prodAdmin.loadError',
  'prodAdmin.empty', 'prodAdmin.total', 'prodAdmin.fieldCode', 'prodAdmin.fieldCategory',
  'prodAdmin.fieldName', 'prodAdmin.fieldDescription', 'prodAdmin.fieldPrice',
  'prodAdmin.fieldCurrency', 'prodAdmin.fieldPrep', 'prodAdmin.fieldTax', 'prodAdmin.fieldActive',
  'prodAdmin.fieldCustomizable', 'prodAdmin.fieldImage', 'prodAdmin.selectCategory',
  'prodAdmin.createdMsg', 'prodAdmin.updatedMsg',
  // product editor — mapped server/validation errors
  'prodAdmin.errCodeRequired', 'prodAdmin.errCategoryRequired', 'prodAdmin.errNameRequired',
  'prodAdmin.errPriceInvalid', 'prodAdmin.errCurrencyInvalid', 'prodAdmin.errTaxInvalid',
  'prodAdmin.errPrepInvalid', 'prodAdmin.errDuplicate', 'prodAdmin.errConflict',
  'prodAdmin.errCategoryNotFound', 'prodAdmin.errPriceScale', 'prodAdmin.errNegativePrice',
  'prodAdmin.errTaxScale', 'prodAdmin.errImageKey', 'prodAdmin.errNotFound',
  'prodAdmin.errValidation', 'prodAdmin.errNetwork',
  // category editor
  'catAdmin.title', 'catAdmin.description', 'catAdmin.create', 'catAdmin.createTitle',
  'catAdmin.editTitle', 'catAdmin.edit', 'catAdmin.forbidden', 'catAdmin.loadError', 'catAdmin.empty',
  'catAdmin.fieldCode', 'catAdmin.fieldName', 'catAdmin.fieldOrder', 'catAdmin.fieldParent',
  'catAdmin.fieldDescription', 'catAdmin.fieldActive', 'catAdmin.fieldImage', 'catAdmin.noParent',
  'catAdmin.createdMsg', 'catAdmin.updatedMsg',
  'catAdmin.errCodeRequired', 'catAdmin.errNameRequired', 'catAdmin.errOrderInvalid',
  'catAdmin.errDuplicate', 'catAdmin.errConflict', 'catAdmin.errParentNotFound',
  'catAdmin.errSelfParent', 'catAdmin.errImageKey', 'catAdmin.errNotFound',
  'catAdmin.errValidation', 'catAdmin.errNetwork',
];

describe('Catalog management i18n surface', () => {
  it('every referenced key exists and is non-empty in English', () => {
    for (const key of REQUIRED_KEYS) {
      assert.ok(key in en, `English dictionary missing catalog key: ${key}`);
      assert.ok(en[key].trim().length > 0, `English catalog key must not be blank: ${key}`);
    }
  });

  it('every referenced key exists and is non-empty in Khmer', () => {
    for (const key of REQUIRED_KEYS) {
      assert.ok(key in km, `Khmer dictionary missing catalog key: ${key}`);
      assert.ok(km[key].trim().length > 0, `Khmer catalog key must not be blank: ${key}`);
    }
  });

  it('permission names shown to operators match the backend codes', () => {
    assert.ok(en['prodAdmin.forbidden'].includes('product:manage'));
    assert.ok(en['catAdmin.forbidden'].includes('category:manage'));
  });

  it('the two editor surfaces stay independently prefixed (no key collisions)', () => {
    const prodKeys = Object.keys(en).filter((k) => k.startsWith('prodAdmin.'));
    const catKeys = Object.keys(en).filter((k) => k.startsWith('catAdmin.'));
    assert.ok(prodKeys.length > 0 && catKeys.length > 0);
    assert.deepStrictEqual(prodKeys.filter((k) => catKeys.includes(k)), []);
  });
});
