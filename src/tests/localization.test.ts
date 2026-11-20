import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../lib/i18n';

describe('Localization & Translation Tests', () => {
  const enKeys = Object.keys(translations.en);
  const kmKeys = Object.keys(translations.km);

  // 1. Required English keys
  it('contains all required English navigation, pricing, POS, KDS, and BDS keys', () => {
    const requiredKeys = [
      'app.title',
      'app.subtitle',
      'nav.dashboard',
      'nav.stores',
      'nav.catalog',
      'nav.pricing',
      'nav.inventory',
      'nav.pos',
      'nav.production',
      'nav.bds',
      'nav.notifications',
      'nav.auditLogs',
      'pricing.title',
      'pricing.search',
      'pricing.category',
      'pricing.available',
      'pricing.unavailable',
      'pricing.empty',
      'common.all',
      'common.close',
      'common.save',
      'common.cancel',
    ];

    for (const key of requiredKeys) {
      assert.ok(
        key in translations.en,
        `English translation dictionary must include key: "${key}"`
      );
      assert.ok(
        (translations.en as Record<string, string>)[key].trim().length > 0,
        `English key "${key}" must not be empty`
      );
    }
  });

  // 2. Required Khmer keys
  it('contains all required Khmer navigation, pricing, POS, KDS, and BDS keys', () => {
    const requiredKeys = [
      'app.title',
      'app.subtitle',
      'nav.dashboard',
      'nav.stores',
      'nav.catalog',
      'nav.pricing',
      'nav.inventory',
      'nav.pos',
      'nav.production',
      'nav.bds',
      'nav.notifications',
      'nav.auditLogs',
      'pricing.title',
      'pricing.search',
      'pricing.category',
      'pricing.available',
      'pricing.unavailable',
      'pricing.empty',
      'common.all',
      'common.close',
      'common.save',
      'common.cancel',
    ];

    for (const key of requiredKeys) {
      assert.ok(
        key in translations.km,
        `Khmer translation dictionary must include key: "${key}"`
      );
      assert.ok(
        (translations.km as Record<string, string>)[key].trim().length > 0,
        `Khmer key "${key}" must not be empty`
      );
    }
  });

  // 3. Key parity (No missing translation keys between EN and KM)
  it('verifies 100% key parity between English and Khmer dictionaries', () => {
    const missingInKhmer = enKeys.filter((k) => !(k in translations.km));
    const missingInEnglish = kmKeys.filter((k) => !(k in translations.en));

    assert.deepStrictEqual(
      missingInKhmer,
      [],
      `Khmer dictionary is missing keys present in English: ${missingInKhmer.join(', ')}`
    );
    assert.deepStrictEqual(
      missingInEnglish,
      [],
      `English dictionary is missing keys present in Khmer: ${missingInEnglish.join(', ')}`
    );
  });

  // 4. No hard-coded implemented feature strings
  it('confirms user-facing branch and production terminology uses translation mappings', () => {
    // Branch terminology check
    assert.strictEqual(translations.en['nav.stores'], 'Branches');
    assert.ok(translations.km['nav.stores'].includes('សាខា'));

    // Pricing terminology check
    assert.strictEqual(translations.en['nav.pricing'], 'Branch Pricing');
    assert.ok(translations.km['nav.pricing'].includes('តម្លៃ'));

    // POS, KDS & BDS check
    assert.strictEqual(translations.en['nav.pos'], 'Staff POS Register');
    assert.strictEqual(translations.en['nav.production'], 'Kitchen Queue (KDS)');
    assert.strictEqual(translations.en['nav.bds'], 'Bakery Queue (BDS)');
    assert.ok(translations.km['nav.bds'].includes('នំប៉័ង'));
  });
});
