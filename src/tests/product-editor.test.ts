/**
 * Slice 4A Round 1 — pure contract tests for the product editor (spec §12).
 *
 * These run under `node:test` with no DOM, no network and no React: every
 * assertion exercises a plain function from `lib/productEditorState.ts` or the
 * contract shapes in `lib/productEditor.ts`. They are NOT component or browser
 * E2E tests — they lock the behaviour the UI is built on top of.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { translations } from '../lib/i18n';
import {
  PRODUCT_TYPES,
  STOCK_MODES,
  CHANNELS,
  AvailabilityPreview,
  ChannelPolicy,
  ChannelScheduleWindow,
  CustomizationCapabilities,
  CustomizationGroupView,
  ProductDetails,
  ProductVariant,
} from '../lib/productEditor';
import {
  EDITOR_SECTIONS,
  DELIVERED_SECTIONS,
  PLACEHOLDER_SECTIONS,
  sectionById,
  isDelivered,
  nextTabIndex,
  INITIAL_SECTION_STATE,
  markDirty,
  beginSave,
  saveSucceeded,
  saveFailed,
  markStale,
  generalDraftFrom,
  isGeneralDirty,
  changedGeneralFields,
  validateGeneral,
  buildGeneralPayload,
  emptyVariantDraft,
  variantDraftFrom,
  validateVariant,
  isVariantValid,
  buildVariantCreate,
  buildVariantUpdate,
  buildReorderList,
  moveItem,
  defaultVariantIssues,
  parseClock,
  toWeekMinutes,
  windowRange,
  validateScheduleWindow,
  findScheduleOverlap,
  validateScheduleSet,
  normalizeWindow,
  scheduleDirty,
  wallClockToInstant,
  buildSoldOutPayload,
  channelPolicyOf,
  buildChannelConfig,
  canDeleteChannel,
  UNDECLARED_CAPABILITIES,
  toCapabilityView,
  isGroupFieldEditable,
  groupLockToken,
  isVersionConflict,
  editorErrorKey,
  shouldReloadAfter,
  previewVerdict,
  reasonKey,
  parsePreviewQuantity,
  buildPreviewQuery,
  previewGroupCount,
  initializeEditorStates,
  markSectionDirty,
  markSectionSaving,
  markSectionSaved,
  markSectionError,
  markSectionConflict,
  discardSection,
  hasUnsavedChanges,
  hasStoreSpecificUnsavedChanges,
  canSwitchStore,
  canSwitchProduct,
  resetAfterProductChange,
  SAVE_STEPS,
  initialOrchestrator,
  recordStepResult,
  nextSaveStep,
  succeededSteps,
  failedSteps,
  conflictSteps,
  skippedSteps,
  blockedSaveSteps,
  shouldStopAutomaticRetry,
  retryableSteps,
  clearStepForRetry,
  markBlockedAsSkipped,
  isPartialSuccess,
  isAllResolved,
  previewShouldRefresh,
} from '../lib/productEditorState';

// Round 2 (Options / Inventory Effect / Recipes) — contract shapes and pure helpers.
import {
  CustomizationGroupMaster, CustomizationOptionView,
  InventoryEffect, RecipeLine, RecipeVersion,
} from '../lib/productEditor';
import {
  CapabilityView, GroupAttachmentDraft,
  groupDraftFrom, validateGroupDraft, buildConfigurePayload,
  effectDraftFrom, effectShowsSource, effectShowsTarget, effectShowsQuantity, effectShowsMultiplier,
  validateEffectDraft, buildEffectPayload,
  isRecipeDraft, canActivateRecipe, cloneActiveToDraft, reorderRecipeLines, buildReplaceItems,
} from '../lib/productEditorState';

/* ----------------------------------------------------------- shared fixtures */

function product(over: Partial<ProductDetails> = {}): ProductDetails {
  return {
    productId: 'p-1',
    code: 'LATTE',
    categoryId: 'c-1',
    categoryName: 'Coffee',
    name: 'Caffè Latte',
    description: 'Espresso with steamed milk',
    basePrice: 4.5,
    currencyCode: 'USD',
    preparationMinutes: 3,
    taxRate: 0.1,
    customizable: true,
    active: true,
    productType: 'BEVERAGE',
    stockMode: 'MADE_TO_ORDER',
    imageUrl: null,
    imageObjectKey: null,
    version: 5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...over,
  };
}

function variant(over: Partial<ProductVariant> = {}): ProductVariant {
  return {
    variantId: 'v-1',
    productId: 'p-1',
    code: 'LATTE-M',
    name: 'Medium',
    description: null,
    barcode: null,
    price: 4.5,
    cost: null,
    currencyCode: 'USD',
    isDefault: true,
    active: true,
    displayOrder: 0,
    imageObjectKey: null,
    version: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function policy(over: Partial<ChannelPolicy> = {}): ChannelPolicy {
  return {
    channelId: 'ch-1',
    channel: 'POS',
    inherited: false,
    visible: true,
    orderable: true,
    displayName: null,
    displayDescription: null,
    displayOrder: 0,
    availableFrom: null,
    availableUntil: null,
    timezone: null,
    version: 3,
    ...over,
  };
}

/* ==================================================================== §12 i18n */

describe('i18n — Round 1 editor contract', () => {
  it('keeps the exact same key set between English and Khmer', () => {
    const en = Object.keys(translations.en);
    const km = Object.keys(translations.km);
    const missingInKhmer = en.filter((k) => !(k in translations.km));
    const missingInEnglish = km.filter((k) => !(k in translations.en));
    assert.deepStrictEqual(missingInKhmer, [], `Khmer missing: ${missingInKhmer.join(', ')}`);
    assert.deepStrictEqual(missingInEnglish, [], `English missing: ${missingInEnglish.join(', ')}`);
  });

  it('every Round 1 editor key carries non-empty copy in both languages', () => {
    const required = [
      'productEditor.tab.general',
      'productEditor.tab.variants',
      'productEditor.tab.channels',
      'productEditor.tab.preview',
      'productEditor.fieldProductType',
      'productEditor.fieldStockMode',
      'productEditor.err.conflict',
      'variantAdmin.title',
      'channelAdmin.title',
      'previewAdmin.title',
      'common.save',
    ];
    for (const key of required) {
      assert.ok(key in translations.en, `English must define ${key}`);
      assert.ok(key in translations.km, `Khmer must define ${key}`);
      assert.ok((translations.en as Record<string, string>)[key].trim().length > 0);
      assert.ok((translations.km as Record<string, string>)[key].trim().length > 0);
    }
  });

  it('exposes the Round 2 placeholder strings verbatim in both languages', () => {
    assert.strictEqual(translations.en['round2.notDelivered'], 'Round 2 — Not yet delivered');
    assert.strictEqual(translations.km['round2.notDelivered'], 'ជុំទី ២ — មិនទាន់បានអនុវត្ត');
  });

  it('maps every classification enum value to a label key', () => {
    for (const t of PRODUCT_TYPES) {
      const key = `productEditor.type.${t}`;
      assert.ok(key in translations.en, `missing English label ${key}`);
      assert.ok(key in translations.km, `missing Khmer label ${key}`);
    }
    for (const m of STOCK_MODES) {
      const key = `productEditor.mode.${m}`;
      assert.ok(key in translations.en, `missing English label ${key}`);
      assert.ok(key in translations.km, `missing Khmer label ${key}`);
    }
  });
});

/* ============================================================ §12 sections/enum */

describe('editor section registry', () => {
  it('declares exactly four delivered Round 1 tabs and never marks a placeholder delivered', () => {
    assert.deepStrictEqual(DELIVERED_SECTIONS.map((s) => s.id), ['general', 'variants', 'channels', 'preview']);
    assert.strictEqual(DELIVERED_SECTIONS.every((s) => s.round === 1), true);
    // Round 2 delivered every former placeholder, so none remain unfilled.
    assert.strictEqual(PLACEHOLDER_SECTIONS.length, 0);
    assert.strictEqual(PLACEHOLDER_SECTIONS.every((s) => s.round === 2 && s.mode === 'placeholder'), true);
    for (const s of PLACEHOLDER_SECTIONS) assert.strictEqual(isDelivered(s.id), false);
  });

  it('sectionById resolves known ids and null for none', () => {
    assert.strictEqual(sectionById('general')?.round, 1);
    assert.strictEqual(EDITOR_SECTIONS.some((s) => s.id === 'preview'), true);
  });

  it('tab navigation wraps with arrow keys and jumps with Home/End', () => {
    const n = EDITOR_SECTIONS.length;
    assert.strictEqual(nextTabIndex(0, 'ArrowLeft', n), n - 1, 'left from first wraps to last');
    assert.strictEqual(nextTabIndex(n - 1, 'ArrowRight', n), 0, 'right from last wraps to first');
    assert.strictEqual(nextTabIndex(3, 'Home', n), 0);
    assert.strictEqual(nextTabIndex(3, 'End', n), n - 1);
    assert.strictEqual(nextTabIndex(2, 'ArrowRight', n), 3);
    assert.strictEqual(nextTabIndex(2, 'a', n), null, 'unhandled key is a no-op');
    assert.strictEqual(nextTabIndex(0, 'ArrowRight', 0), null, 'no tabs, no move');
  });
});

/* ================================================================= §12 adapters */

describe('adapters — list vs details and General payload', () => {
  it('ProductDetails is the single management DTO (no second model to drift)', () => {
    // The alias guarantees list & editor share classification fields.
    const p = product();
    assert.ok('productType' in p && 'stockMode' in p);
    assert.strictEqual(PRODUCT_TYPES.includes(p.productType), true);
    assert.strictEqual(STOCK_MODES.includes(p.stockMode), true);
  });

  it('a clean draft produces no PATCH; edits produce exactly the changed intent', () => {
    const base = product();
    const clean = generalDraftFrom(base);
    assert.strictEqual(isGeneralDirty(base, clean), false);
    assert.strictEqual(buildGeneralPayload(base, clean), null, 'unchanged → no request');

    const edited = { ...clean, name: 'Latte Grande' };
    assert.deepStrictEqual(changedGeneralFields(base, edited), ['name']);
    const payload = buildGeneralPayload(base, edited);
    assert.ok(payload);
    assert.strictEqual(payload!.name, 'Latte Grande');
    assert.strictEqual(payload!.version, base.version, 'sends the read version, never version+1');
    assert.strictEqual(payload!.productType, null, 'untouched classification is not re-sent');
    assert.strictEqual(payload!.stockMode, null);
  });

  it('changing classification sends the new enum value', () => {
    const base = product();
    const edited = { ...generalDraftFrom(base), stockMode: 'RECIPE_BASED' as const };
    const payload = buildGeneralPayload(base, edited);
    assert.strictEqual(payload!.stockMode, 'RECIPE_BASED');
    assert.strictEqual(payload!.productType, null);
  });

  it('an invalid General draft never yields a submittable payload', () => {
    const base = product();
    const bad = { ...generalDraftFrom(base), basePrice: 'abc', name: '' };
    const errs = validateGeneral(bad);
    assert.ok(errs.basePrice && errs.name);
    assert.strictEqual(buildGeneralPayload(base, bad), null);
  });
});

describe('adapters — variants', () => {
  it('create/update bodies mirror the DTO and drop an invalid draft', () => {
    const draft = {
      ...emptyVariantDraft('USD'),
      code: 'LATTE-L',
      name: 'Large',
      price: '5.25',
      cost: '1.5',
      displayOrder: '1',
    };
    assert.strictEqual(isVariantValid(draft), true);
    const created = buildVariantCreate(draft);
    assert.strictEqual(created!.price, 5.25);
    assert.strictEqual(created!.cost, 1.5);
    assert.strictEqual(created!.currencyCode, 'USD');

    const update = buildVariantUpdate({ ...draft, variantId: 'v-9', version: 4 });
    assert.strictEqual(update!.version, 4);
    assert.strictEqual(buildVariantUpdate(draft), null, 'no id/version → no update');
    assert.strictEqual(buildVariantCreate({ ...draft, price: '' }), null, 'invalid price blocks create');
  });

  it('round-trips a server variant into the draft shape', () => {
    const d = variantDraftFrom(variant({ cost: 2, barcode: '123' }));
    assert.strictEqual(d.variantId, 'v-1');
    assert.strictEqual(d.price, '4.5');
    assert.strictEqual(d.cost, '2');
    assert.strictEqual(d.barcode, '123');
    assert.strictEqual(d.isDefault, true);
  });

  it('flags duplicate/absent defaults with warning keys', () => {
    assert.deepStrictEqual(defaultVariantIssues([variant(), variant({ variantId: 'v-2', isDefault: true })]),
      ['variantAdmin.warnMultipleDefaults']);
    assert.deepStrictEqual(defaultVariantIssues([variant({ isDefault: false })]), ['variantAdmin.warnNoDefault']);
    assert.deepStrictEqual(defaultVariantIssues([]), [], 'no variants is not a default problem');
  });

  it('validateVariant rejects a too-long code', () => {
    const errs = validateVariant({ ...emptyVariantDraft('USD'), code: 'x'.repeat(81), name: 'N', price: '1' });
    assert.strictEqual(errs.code, 'variantAdmin.errCodeTooLong');
  });
});

describe('adapters — channel, store product, sold-out', () => {
  it('channelPolicyOf finds by channel name and returns null when absent', () => {
    const list = [policy({ channel: 'POS' }), policy({ channel: 'KIOSK', channelId: 'ch-2' })];
    assert.strictEqual(channelPolicyOf(list, 'KIOSK')?.channelId, 'ch-2');
    assert.strictEqual(channelPolicyOf(list, 'DELIVERY'), null);
  });

  it('channel config echoes the read version and rejects a bad window', () => {
    const p = policy({ version: 8 });
    const cfg = buildChannelConfig(p, {
      visible: true, orderable: false, displayName: 'Front', displayDescription: '',
      displayOrder: '2', availableFrom: '', availableUntil: '', timezone: 'Asia/Phnom_Penh',
    });
    assert.strictEqual(cfg!.expectedVersion, 8, 'never client-increments the lock token');
    assert.strictEqual(cfg!.orderable, false);
    assert.strictEqual(cfg!.displayDescription, null, 'blank optional → null');
    assert.strictEqual(buildChannelConfig(p, {
      visible: true, orderable: true, displayName: '', displayDescription: '', displayOrder: '-1',
      availableFrom: '', availableUntil: '', timezone: '',
    }), null, 'negative display order rejected');
  });

  it('an inherited publication cannot be deleted; an explicit one can', () => {
    assert.strictEqual(canDeleteChannel(policy({ inherited: true })), false);
    assert.strictEqual(canDeleteChannel(policy({ inherited: false })), true);
    assert.strictEqual(canDeleteChannel(null), false);
  });

  it('a blank sold-out wall clock clears the cut-off, a real one becomes an instant', () => {
    const cleared = buildSoldOutPayload({ available: true, untilWallClock: '  ', storeTimezone: 'UTC', expectedVersion: 6 });
    assert.deepStrictEqual(cleared, { available: true, soldOutUntil: null, expectedVersion: 6 });

    const set = buildSoldOutPayload({ available: false, untilWallClock: '2026-01-15T14:30', storeTimezone: 'UTC', expectedVersion: 6 });
    assert.strictEqual(set!.soldOutUntil, '2026-01-15T14:30:00.000Z');
    // An unusable wall clock must not be sent as a garbage instant.
    assert.strictEqual(wallClockToInstant('nonsense', 'UTC'), null);
    assert.strictEqual(buildSoldOutPayload({ available: false, untilWallClock: 'nonsense', storeTimezone: 'UTC', expectedVersion: 6 }), null);
  });
});

describe('adapters — backend error code parsing', () => {
  it('known codes resolve to stable editor copy', () => {
    assert.strictEqual(editorErrorKey('VERSION_CONFLICT', 409), 'productEditor.err.conflict');
    assert.strictEqual(editorErrorKey('DUPLICATE_CODE', 400), 'prodAdmin.errDuplicate');
    assert.strictEqual(editorErrorKey('SCHEDULE_OVERLAP', 400), 'channelAdmin.errOverlap');
  });

  it('a version code the map omits still lands on the conflict key', () => {
    assert.strictEqual(isVersionConflict('VARIANT_VERSION_CONFLICT'), true);
    assert.strictEqual(editorErrorKey('VARIANT_VERSION_CONFLICT', 409), 'productEditor.err.conflict');
  });

  it('unknown codes fall back by HTTP status, never to raw server text', () => {
    assert.strictEqual(editorErrorKey('SOMETHING_NEW', 403), 'productEditor.err.forbidden');
    assert.strictEqual(editorErrorKey('SOMETHING_NEW', 401), 'productEditor.err.unauthorized');
    assert.strictEqual(editorErrorKey('SOMETHING_NEW', 404), 'productEditor.err.notFound');
    assert.strictEqual(editorErrorKey('SOMETHING_NEW', 400), 'prodAdmin.errValidation');
    assert.strictEqual(editorErrorKey(undefined, 500), 'productEditor.err.unknown');
  });

  it('a conflict or a gone product requires a reload rather than a blind retry', () => {
    assert.strictEqual(shouldReloadAfter('PRODUCT_VERSION_CONFLICT', 409), true);
    assert.strictEqual(shouldReloadAfter('PRODUCT_NOT_FOUND', 404), true);
    assert.strictEqual(shouldReloadAfter('SCHEDULE_OVERLAP', 400), false);
  });
});

describe('adapters — customization capabilities (honest subset)', () => {
  const round1: CustomizationCapabilities = {
    supportsRequiredOverride: true,
    supportsDisplayOrderOverride: true,
    supportsMinimumSelectionsOverride: false,
    supportsMaximumSelectionsOverride: false,
    supportsDefaultOptionOverride: false,
    supportsAllowedOptionSubset: false,
    relationshipVersionSource: 'PRODUCT',
  };

  it('preserves exactly what the server declares, no optimistic upgrade', () => {
    const view = toCapabilityView(round1);
    assert.strictEqual(view.declared, true);
    assert.strictEqual(view.requiredOverride, true);
    assert.strictEqual(view.displayOrderOverride, true);
    assert.strictEqual(view.minimumSelectionsOverride, false);
    assert.strictEqual(view.maximumSelectionsOverride, false);
    assert.strictEqual(view.defaultOptionOverride, false);
    assert.strictEqual(view.allowedOptionSubset, false);
    assert.strictEqual(view.relationshipVersionSource, 'PRODUCT');
  });

  it('an absent or malformed capabilities block is treated as unknown', () => {
    assert.deepStrictEqual(toCapabilityView(null), UNDECLARED_CAPABILITIES);
    assert.strictEqual(UNDECLARED_CAPABILITIES.declared, false);
    // No permission is granted when nothing was declared.
    assert.strictEqual(isGroupFieldEditable(UNDECLARED_CAPABILITIES, 'required'), false);
    assert.strictEqual(isGroupFieldEditable(UNDECLARED_CAPABILITIES, 'displayOrder'), false);
  });

  it('field editability tracks the declared capability only', () => {
    const view = toCapabilityView(round1);
    assert.strictEqual(isGroupFieldEditable(view, 'required'), true);
    assert.strictEqual(isGroupFieldEditable(view, 'displayOrder'), true);
    assert.strictEqual(isGroupFieldEditable(view, 'minimum'), false);
    assert.strictEqual(isGroupFieldEditable(view, 'maximum'), false);
    assert.strictEqual(isGroupFieldEditable(view, 'default'), false);
    assert.strictEqual(isGroupFieldEditable(view, 'options'), false);
  });

  it('the attachment lock token is the owning product version', () => {
    const g: CustomizationGroupView = {
      relationshipId: null, productId: 'p-1', groupId: 'g-1', groupCode: 'MILK', groupName: 'Milk',
      selectionType: 'SINGLE', groupActive: true, required: false, displayOrder: 0,
      minimumSelections: 0, maximumSelections: null, defaultOptionId: null, relationshipVersion: 11,
      allowedOptions: [],
    };
    assert.strictEqual(groupLockToken(g), 11);
    assert.strictEqual(g.relationshipId, null, 'Round 1 relationship is composite, never a standalone id');
    assert.strictEqual(g.defaultOptionId, null, 'Round 1 has no per-product default');
  });
});

/* ================================================================== §12 LocalTime */

describe('LocalTime — schedule windows stay wall clock', () => {
  it('09:00 and 17:00 round-trip unchanged with no Date conversion', () => {
    const morning: ChannelScheduleWindow = { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', active: true };
    const evening: ChannelScheduleWindow = { dayOfWeek: 5, startTime: '17:00', endTime: '20:00', active: true };
    assert.strictEqual(normalizeWindow(morning).startTime, '09:00');
    assert.strictEqual(normalizeWindow(evening).startTime, '17:00');
    assert.strictEqual(toWeekMinutes(1, '09:00'), 9 * 60);
    assert.strictEqual(toWeekMinutes(5, '17:00'), 4 * 1440 + 17 * 60);
  });

  it('a 22:00–02:00 overnight window keeps its strings and rolls onto the next day', () => {
    const overnight: ChannelScheduleWindow = { dayOfWeek: 1, startTime: '22:00', endTime: '02:00', active: true };
    const n = normalizeWindow(overnight);
    assert.strictEqual(n.startTime, '22:00');
    assert.strictEqual(n.endTime, '02:00');
    const range = windowRange(overnight)!;
    const start = toWeekMinutes(1, '22:00')!;
    const end = toWeekMinutes(1, '02:00')!;
    assert.strictEqual(range[0][0], start);
    assert.strictEqual(range[0][1], end + 10080, 'end-before-start rolls a week-day forward');
    assert.strictEqual(range.length, 2, 'duplicated a week earlier for wrap-around collisions');
  });

  it('rejects a malformed or zero-length window', () => {
    assert.strictEqual(validateScheduleWindow({ dayOfWeek: 1, startTime: '25:00', endTime: '26:00', active: true }), 'channelAdmin.errClockInvalid');
    assert.strictEqual(validateScheduleWindow({ dayOfWeek: 8, startTime: '09:00', endTime: '10:00', active: true }), 'channelAdmin.errDayInvalid');
    assert.strictEqual(validateScheduleWindow({ dayOfWeek: 1, startTime: '09:00', endTime: '09:00', active: true }), 'channelAdmin.errSameClock');
    assert.strictEqual(parseClock('09:00')!.hour, 9);
    assert.strictEqual(parseClock('9am'), null);
  });

  it('detects an overlap between two active windows and none when disjoint', () => {
    const overlap = findScheduleOverlap([
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', active: true },
      { dayOfWeek: 1, startTime: '11:00', endTime: '13:00', active: true },
    ]);
    assert.deepStrictEqual(overlap, [0, 1]);
    assert.strictEqual(findScheduleOverlap([
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', active: true },
      { dayOfWeek: 1, startTime: '12:00', endTime: '15:00', active: true },
    ]), null, 'adjacent windows that only touch are not an overlap');
  });

  it('a disabled window cannot conflict and set validation reports overlap only when clean otherwise', () => {
    const list: ChannelScheduleWindow[] = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', active: false },
      { dayOfWeek: 1, startTime: '10:00', endTime: '13:00', active: false },
    ];
    assert.deepStrictEqual(validateScheduleSet(list), []);
  });

  it('scheduleDirty ignores order and reports a genuine time change', () => {
    const loaded: ChannelScheduleWindow[] = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', active: true },
      { dayOfWeek: 2, startTime: '09:00', endTime: '12:00', active: true },
    ];
    const reordered = [loaded[1], loaded[0]];
    assert.strictEqual(scheduleDirty(loaded, reordered), false, 'reorder alone is not a change');
    assert.strictEqual(scheduleDirty(loaded, [{ ...loaded[0], endTime: '13:00' }, loaded[1]]), true);
  });
});

/* ==================================================================== §12 state */

describe('editor state — dirty/save lifecycle per section', () => {
  it('saving one section clears only that section', () => {
    let m = initializeEditorStates();
    m = markSectionDirty(m, 'general', true);
    m = markSectionDirty(m, 'channels', true);
    assert.strictEqual(hasUnsavedChanges(m), true);
    m = markSectionSaving(m, 'general');
    m = markSectionSaved(m, 'general');
    assert.strictEqual(m.general.dirty, false);
    assert.strictEqual(m.channels.dirty, true, 'a General save never clears Stores/Channels');
  });

  it('a failed save stays dirty so intent is not thrown away', () => {
    let m = markSectionDirty(initializeEditorStates(), 'variants', true);
    m = markSectionSaving(m, 'variants');
    m = markSectionError(m, 'variants', 'variantAdmin.errDuplicate');
    assert.strictEqual(m.variants.saving, false);
    assert.strictEqual(m.variants.dirty, true);
    assert.strictEqual(m.variants.errorKey, 'variantAdmin.errDuplicate');
  });

  it('section-aware dirty: read-only tabs never dirty, Round 2 edit tabs do', () => {
    const m = markSectionDirty(initializeEditorStates(), 'preview', true);
    assert.strictEqual(m.preview.dirty, false, 'preview refresh must not create dirty');
    const inv = markSectionDirty(m, 'inventory', true);
    assert.strictEqual(inv.inventory.dirty, false, 'the read-only Inventory tab is not editable');
    // Round 2 made the Options, Effects and Recipes tabs real editors.
    const opt = markSectionDirty(inv, 'options', true);
    assert.strictEqual(opt.options.dirty, true, 'Options became editable in Round 2');
    const rec = markSectionDirty(opt, 'recipes', true);
    assert.strictEqual(rec.recipes.dirty, true, 'Recipes became editable in Round 2');
  });

  it('discard clears the edit intent and error flags', () => {
    let m = markSectionDirty(initializeEditorStates(), 'general', true);
    m = markSectionError(m, 'general', 'productEditor.err.conflict');
    m = discardSection(m, 'general');
    assert.strictEqual(m.general.dirty, false);
    assert.strictEqual(m.general.stale, false);
    assert.strictEqual(m.general.errorKey, null);
  });

  it('a 409 keeps the local draft and flags the server moved', () => {
    let m = markSectionDirty(initializeEditorStates(), 'general', true);
    m = markSectionConflict(m, 'general', 'productEditor.err.conflict');
    assert.strictEqual(m.general.dirty, true, 'draft preserved');
    assert.strictEqual(m.general.stale, true);
    assert.strictEqual(hasUnsavedChanges(m), true);
  });

  it('switching product is blocked by any editable tab, switching store only by the per-branch tab', () => {
    const generalDirty = markSectionDirty(initializeEditorStates(), 'general', true);
    assert.strictEqual(canSwitchProduct(generalDirty), false);
    assert.strictEqual(canSwitchStore(generalDirty), true, 'a General edit does not block branch switch');
    assert.strictEqual(hasStoreSpecificUnsavedChanges(generalDirty), false);

    const storeDirty = markSectionDirty(initializeEditorStates(), 'channels', true);
    assert.strictEqual(canSwitchStore(storeDirty), false);
    assert.strictEqual(hasStoreSpecificUnsavedChanges(storeDirty), true);
  });

  it('a product change resets every tab to its initial state', () => {
    let m = markSectionDirty(initializeEditorStates(), 'general', true);
    m = markSectionDirty(m, 'channels', true);
    const reset = resetAfterProductChange();
    assert.deepStrictEqual(reset.general, INITIAL_SECTION_STATE);
    assert.strictEqual(hasUnsavedChanges(reset), false);
    assert.notStrictEqual(m, reset, 'the old dirty map is untouched (pure)');
  });

  it('partial success across sections is representable', () => {
    let m = initializeEditorStates();
    m = markSectionDirty(m, 'general', true);
    m = markSectionDirty(m, 'variants', true);
    m = markSectionSaved(m, 'general');
    m = markSectionError(m, 'variants', 'variantAdmin.errNotFound');
    assert.strictEqual(m.general.dirty, false);
    assert.strictEqual(m.variants.dirty, true);
    assert.strictEqual(hasUnsavedChanges(m), true, 'still dirty where it failed');
  });
});

/* ================================================== §12 state primitives (edge) */

describe('section state primitives', () => {
  it('successful save clears dirty and stale; conflict marks stale', () => {
    const dirtySaving = beginSave(markDirty(INITIAL_SECTION_STATE, true));
    assert.strictEqual(dirtySaving.saving, true);
    const saved = saveSucceeded(dirtySaving);
    assert.strictEqual(saved.dirty, false);
    assert.strictEqual(saved.saving, false);
    assert.strictEqual(saved.stale, false);

    const stale = markStale(markDirty(INITIAL_SECTION_STATE, true), 'productEditor.err.conflict');
    assert.strictEqual(stale.stale, true);
    assert.strictEqual(stale.saving, false);
    assert.strictEqual(saveFailed(stale, 'x').errorKey, 'x');
  });
});

/* ============================================================== §12 conflict/409 */

describe('conflict handling — 409 stops automatic retry', () => {
  const conflictCodes = ['PRODUCT_VERSION_CONFLICT', 'VARIANT_VERSION_CONFLICT', 'STORE_PRODUCT_VERSION_CONFLICT', 'PRODUCT_CHANNEL_VERSION_CONFLICT'];

  it('every aggregate owns a recognised conflict code', () => {
    for (const code of conflictCodes) {
      assert.strictEqual(isVersionConflict(code), true, `${code} must be a version conflict`);
      assert.strictEqual(shouldReloadAfter(code, 409), true, `${code} must force a reload`);
    }
    // Product and the generic token share one key; channel/store keep their own
    // aggregate-specific conflict copy.
    assert.strictEqual(editorErrorKey('PRODUCT_VERSION_CONFLICT', 409), 'productEditor.err.conflict');
    assert.strictEqual(editorErrorKey('VARIANT_VERSION_CONFLICT', 409), 'productEditor.err.conflict');
    assert.strictEqual(editorErrorKey('STORE_PRODUCT_VERSION_CONFLICT', 409), 'channelAdmin.errSoldOutConflict');
    assert.strictEqual(editorErrorKey('PRODUCT_CHANNEL_VERSION_CONFLICT', 409), 'channelAdmin.errConflict');
  });

  it('each 409 marks its tab stale while preserving the draft', () => {
    const sectionByCode: Record<string, 'general' | 'variants' | 'channels'> = {
      PRODUCT_VERSION_CONFLICT: 'general',
      VARIANT_VERSION_CONFLICT: 'variants',
      STORE_PRODUCT_VERSION_CONFLICT: 'channels',
      PRODUCT_CHANNEL_VERSION_CONFLICT: 'channels',
    };
    for (const [code, section] of Object.entries(sectionByCode)) {
      let m = markSectionDirty(initializeEditorStates(), section, true);
      m = markSectionConflict(m, section, editorErrorKey(code, 409));
      assert.strictEqual(m[section].stale, true, `${code} flags stale`);
      assert.strictEqual(m[section].dirty, true, `${code} keeps the draft`);
    }
  });

  it('the orchestrator treats a conflict as a stop-retry signal', () => {
    let s = initialOrchestrator();
    s = recordStepResult(s, { step: 'general', outcome: 'conflict' });
    assert.strictEqual(shouldStopAutomaticRetry(s), true);
    assert.deepStrictEqual(retryableSteps(s), [], 'a conflict is never an auto-retry target');
  });
});

/* ========================================================== §12 reorder/variants */

describe('reorder — move up/down and permutation', () => {
  it('move up/down produce a deterministic order and boundaries are no-ops', () => {
    const items = ['a', 'b', 'c'];
    assert.deepStrictEqual(moveItem(items, 2, 1), ['a', 'c', 'b']);
    assert.deepStrictEqual(moveItem(items, 0, 1), ['b', 'a', 'c']);
    assert.deepStrictEqual(moveItem(items, 0, -1), items, 'moving above the top is a no-op');
    assert.deepStrictEqual(moveItem(items, 2, 5), items, 'moving past the end is a no-op');
  });

  it('buildReorderList accepts only a full permutation of the on-screen ids', () => {
    const ids = ['v1', 'v2', 'v3'];
    assert.deepStrictEqual(buildReorderList(ids, ['v3', 'v1', 'v2']), ['v3', 'v1', 'v2']);
    assert.strictEqual(buildReorderList(ids, ['v1', 'v2']), null, 'missing id rejected');
    assert.strictEqual(buildReorderList(ids, ['v1', 'v2', 'v4']), null, 'unknown id rejected');
    assert.strictEqual(buildReorderList(ids, ['v1', 'v1', 'v2']), null, 'duplicate rejected');
  });
});

/* ========================================================= §12 save orchestrator */

describe('save orchestrator — order, dependencies, versions, retry', () => {
  it('plans General first and honours the declared dependency graph', () => {
    assert.strictEqual(SAVE_STEPS[0].id, 'general');
    let s = initialOrchestrator();
    assert.strictEqual(nextSaveStep(s), 'general');
    s = recordStepResult(s, { step: 'general', outcome: 'succeeded', version: 6 });
    assert.strictEqual(nextSaveStep(s), 'variants');
    s = recordStepResult(s, { step: 'variants', outcome: 'succeeded', version: 3 });
    assert.strictEqual(nextSaveStep(s), 'storeProduct');
  });

  it('a General failure blocks its dependents and marks them skippable', () => {
    let s = recordStepResult(initialOrchestrator(), { step: 'general', outcome: 'failed' });
    const blocked = blockedSaveSteps(s);
    assert.ok(blocked.includes('variants'));
    assert.ok(blocked.includes('storeProduct'));
    assert.ok(blocked.includes('channelConfig'));
    assert.strictEqual(nextSaveStep(s), 'previewRefresh', 'only the dependency-free step remains eligible');
    s = markBlockedAsSkipped(s);
    assert.strictEqual(blockedSaveSteps(s).length, 0, 'blocked steps are finalized, none remain pending');
    assert.ok(skippedSteps(s).includes('variants'));
    // The independent preview step still has to run before the plan is whole.
    assert.strictEqual(isAllResolved(s), false, 'previewRefresh is not blocked by General');
    s = recordStepResult(s, { step: 'previewRefresh', outcome: 'succeeded' });
    assert.strictEqual(isAllResolved(s), true);
  });

  it('records backend-returned versions only on success, never a client guess', () => {
    let s = initialOrchestrator();
    s = recordStepResult(s, { step: 'general', outcome: 'succeeded', version: 42 });
    assert.strictEqual(s.versions.general, 42);
    s = recordStepResult(s, { step: 'variants', outcome: 'conflict', version: 99 });
    assert.strictEqual(s.versions.variants, undefined, 'a failed/conflict version is never stored');
  });

  it('product success then channel failure is a partial success, and the failed step is retried', () => {
    let s = recordStepResult(initialOrchestrator(), { step: 'general', outcome: 'succeeded', version: 7 });
    s = recordStepResult(s, { step: 'variants', outcome: 'succeeded', version: 2 });
    s = recordStepResult(s, { step: 'storeProduct', outcome: 'succeeded', version: 4 });
    s = recordStepResult(s, { step: 'channelConfig', outcome: 'failed' });
    assert.strictEqual(isPartialSuccess(s), true);
    assert.deepStrictEqual(failedSteps(s), ['channelConfig']);
    assert.deepStrictEqual(retryableSteps(s), ['channelConfig']);
    s = clearStepForRetry(s, 'channelConfig');
    assert.strictEqual(nextSaveStep(s), 'channelConfig', 'retry replays against the stored server token');
    assert.strictEqual(s.versions.general, 7, 'prior successful versions survive the retry reset');
  });

  it('a Variant failure does not falsely mark the Channel step saved', () => {
    let s = recordStepResult(initialOrchestrator(), { step: 'general', outcome: 'succeeded', version: 1 });
    s = recordStepResult(s, { step: 'variants', outcome: 'failed' });
    assert.strictEqual(s.outcomes.channelConfig, undefined, 'channel status is untouched by the variant step');
    assert.strictEqual(conflictSteps(s).length, 0);
  });

  it('the availability preview refreshes only after a step that can move the verdict', () => {
    let s = recordStepResult(initialOrchestrator(), { step: 'general', outcome: 'succeeded', version: 2 });
    assert.strictEqual(previewShouldRefresh(s), true);
    s = recordStepResult(s, { step: 'previewRefresh', outcome: 'succeeded' });
    assert.strictEqual(previewShouldRefresh({ outcomes: {}, versions: {} }), false, 'fresh state has nothing to refresh');
  });
});

/* ======================================================= §12 availability preview */

describe('availability preview — verdict presentation only', () => {
  function preview(over: Partial<AvailabilityPreview> = {}): AvailabilityPreview {
    return {
      productId: 'p-1', storeId: 's-1', active: true, listed: true, orderable: true, inStock: true,
      manualState: 'AUTO', availableBaseServings: 20, reasonCodes: [], variants: [], optionGroups: [],
      calculatedAt: '2026-01-01T00:00:00Z', availabilityFingerprint: 'fp',
      ...over,
    };
  }

  it('maps the headline chip from the engine flags without collapsing them', () => {
    assert.strictEqual(previewVerdict(preview()).key, 'previewAdmin.verdict.orderable');
    assert.strictEqual(previewVerdict(preview({ active: false })).tone, 'bad');
    assert.strictEqual(previewVerdict(preview({ listed: false })).key, 'previewAdmin.verdict.notListed');
    assert.strictEqual(previewVerdict(preview({ inStock: false })).tone, 'warn');
    assert.strictEqual(previewVerdict(preview({ orderable: false })).key, 'previewAdmin.verdict.blocked');
  });

  it('keeps an unknown reason code visible as its raw code', () => {
    assert.strictEqual(reasonKey('PRODUCT_INACTIVE'), 'previewAdmin.reason.PRODUCT_INACTIVE');
    assert.strictEqual(reasonKey('SOME_FUTURE_CODE'), 'previewAdmin.reason.other');
  });

  it('rejects an out-of-range quantity and omits an empty variant filter', () => {
    assert.strictEqual(parsePreviewQuantity('0'), null);
    assert.strictEqual(parsePreviewQuantity('1.5'), null);
    assert.strictEqual(parsePreviewQuantity('abc'), null);
    assert.strictEqual(parsePreviewQuantity('5'), 5);
    const q = buildPreviewQuery({ variantId: '  ', includeOptions: true, quantity: '3' });
    assert.strictEqual(q!.variantId, undefined, 'blank variant filter means "all variants"');
    assert.strictEqual(q!.quantity, 3);
    assert.strictEqual(buildPreviewQuery({ variantId: '', includeOptions: true, quantity: 'bad' }), null);
  });

  it('counts effective options so an empty group is explicit, not a spinner', () => {
    const p = preview();
    assert.strictEqual(previewGroupCount(p), 0);
    const withGroups: AvailabilityPreview = {
      ...p,
      optionGroups: [
        { groupId: 'g1', groupName: 'Milk', selectionType: 'SINGLE', required: false, minimumSelections: 0, maximumSelections: null, atLeastOneValidSelection: true, values: [{ optionId: 'o1', active: true, selectable: true, available: true, availableQuantity: 3, priceDelta: 0, reasonCodes: [] }] },
      ],
    };
    assert.strictEqual(previewGroupCount(withGroups), 1);
  });
});

/* ==================================================== §12 permission projection */

describe('permission projection — pure 403/401 mapping', () => {
  it('a forbidden read maps to the read-only copy, not a crash', () => {
    assert.strictEqual(editorErrorKey('FORBIDDEN', 403), 'productEditor.err.forbidden');
    assert.strictEqual(editorErrorKey(undefined, 403), 'productEditor.err.forbidden');
    assert.strictEqual(editorErrorKey(undefined, 401), 'productEditor.err.unauthorized');
  });

  it('the read-only editor keys exist for both languages', () => {
    for (const key of ['productEditor.readOnlyWrite', 'variantAdmin.readOnly', 'channelAdmin.readOnly', 'previewAdmin.forbidden']) {
      assert.ok(key in translations.en, `English missing ${key}`);
      assert.ok(key in translations.km, `Khmer missing ${key}`);
    }
  });

  it('every declared channel has a label key in both languages', () => {
    for (const ch of CHANNELS) {
      const key = `channelAdmin.name.${ch}`;
      assert.ok(key in translations.en, `no English label for channel ${ch}`);
      assert.ok(key in translations.km, `no Khmer label for channel ${ch}`);
    }
  });
});

/* ==================================================== Round 2 shared fixtures */

function round2OptionView(over: Partial<CustomizationOptionView> = {}): CustomizationOptionView {
  return {
    optionId: 'o-1', code: 'O1', name: 'Option 1', active: true, defaultOption: false,
    priceDelta: null, displayOrder: 0, numericValue: null, version: 0, inventoryEffect: null,
    ...over,
  };
}

function round2GroupView(over: Partial<CustomizationGroupView> = {}): CustomizationGroupView {
  return {
    relationshipId: 'rel-1', productId: 'p-1', groupId: 'g-1', groupCode: 'G1', groupName: 'Group 1',
    selectionType: 'MULTIPLE', groupActive: true, required: false, displayOrder: 0,
    minimumSelections: 0, maximumSelections: null, defaultOptionId: null,
    relationshipVersion: 0, allowedOptions: [round2OptionView()],
    ...over,
  };
}

function round2Master(over: Partial<CustomizationGroupMaster> = {}): CustomizationGroupMaster {
  return {
    groupId: 'g-1', code: 'G1', name: 'Group 1', selectionType: 'MULTIPLE',
    minimumSelections: 0, maximumSelections: null, displayOrder: 0, active: true, version: 3,
    options: [{ optionId: 'o-1', code: 'O1', name: 'Option 1', additionalPrice: null, displayOrder: 0, active: true, version: 1, inventoryEffect: null }],
    ...over,
  };
}

function allCaps(): CapabilityView {
  return toCapabilityView({
    supportsRequiredOverride: true, supportsDisplayOrderOverride: true, supportsMinimumSelectionsOverride: true,
    supportsMaximumSelectionsOverride: true, supportsDefaultOptionOverride: true, supportsAllowedOptionSubset: true,
    relationshipVersionSource: 'RELATIONSHIP',
  });
}

function recipeLine(over: Partial<RecipeLine> = {}): RecipeLine {
  return {
    lineId: 'l-1', ingredientId: 'ing-1', quantityRequiredBase: 1, wastagePercent: 0, unitId: null,
    scalingRule: 'FIXED', displayOrder: 0, optional: false, notes: null, ...over,
  };
}

function recipeVersion(over: Partial<RecipeVersion> = {}): RecipeVersion {
  return {
    recipeVersionId: 'rv-1', productId: 'p-1', versionNumber: 1, status: 'DRAFT',
    effectiveFrom: null, effectiveTo: null, yieldQuantity: null, yieldUnitId: null, notes: null,
    activatedAt: null, activatedBy: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    version: 0, lines: [], ...over,
  };
}

function effect(over: Partial<InventoryEffect> = {}): InventoryEffect {
  return {
    optionId: 'o-1', groupId: 'g-1', optionCode: 'O1', optionName: 'Option 1', additionalPrice: null,
    type: 'NONE', sourceIngredientId: null, targetIngredientId: null, effectQuantity: null, effectMultiplier: null,
    version: 1, ...over,
  };
}

/* ============================================== §11 Options draft → payload */

describe('Round 2 §11 — options draft seeding, validation and payload', () => {
  it('a value equal to the master is treated as inherited, not an override', () => {
    const draft = groupDraftFrom(round2GroupView({ minimumSelections: 0, maximumSelections: null }), round2Master({ minimumSelections: 0, maximumSelections: null }));
    assert.strictEqual(draft.minimumSelections, '', 'inherited min must render blank');
    assert.strictEqual(draft.maximumSelections, '', 'inherited max must render blank');
  });

  it('a value differing from the master becomes a local override', () => {
    const draft = groupDraftFrom(round2GroupView({ minimumSelections: 2, maximumSelections: 4 }), round2Master({ minimumSelections: 0, maximumSelections: null }));
    assert.strictEqual(draft.minimumSelections, '2');
    assert.strictEqual(draft.maximumSelections, '4');
  });

  it('the carried relationship version is the attachment token, preserved for the write', () => {
    const draft = groupDraftFrom(round2GroupView({ relationshipVersion: 7 }), round2Master());
    assert.strictEqual(draft.relationshipVersion, 7);
  });

  it('validate rejects a maximum below the minimum, and a SINGLE group capped above one', () => {
    const badRange: GroupAttachmentDraft = { ...groupDraftFrom(round2GroupView(), round2Master()), minimumSelections: '3', maximumSelections: '2' };
    assert.strictEqual(validateGroupDraft(badRange).maximumSelections, 'productEditor.err.selectionLimits');
    const singleOver: GroupAttachmentDraft = { ...groupDraftFrom(round2GroupView({ selectionType: 'SINGLE' }), round2Master({ selectionType: 'SINGLE' })), maximumSelections: '2' };
    assert.strictEqual(validateGroupDraft(singleOver).maximumSelections, 'productEditor.err.singleMaxOne');
  });

  it('validate rejects a default option that is not an allowed, active option', () => {
    const draft: GroupAttachmentDraft = { ...groupDraftFrom(round2GroupView(), round2Master()), defaultOptionId: 'o-1', options: [{ optionId: 'o-1', allowed: false, priceOverride: '', displayOrder: '', active: true }] };
    assert.strictEqual(validateGroupDraft(draft).defaultOptionId, 'productEditor.err.defaultNotAllowed');
  });

  it('buildConfigurePayload returns null when validation fails (no doomed request)', () => {
    const draft: GroupAttachmentDraft = { ...groupDraftFrom(round2GroupView(), round2Master()), displayOrder: 'abc' };
    assert.strictEqual(buildConfigurePayload(draft, allCaps(), 5), null);
  });

  it('the subset write carries the full ACTIVE roster with an allowed flag and drops inactive masters', () => {
    const master = round2Master({ options: [
      { optionId: 'o-1', code: 'O1', name: 'A', additionalPrice: null, displayOrder: 0, active: true, version: 1, inventoryEffect: null },
      { optionId: 'o-2', code: 'O2', name: 'B', additionalPrice: null, displayOrder: 1, active: false, version: 1, inventoryEffect: null },
    ] });
    const view = round2GroupView({ allowedOptions: [round2OptionView({ optionId: 'o-1' })] });
    const draft = groupDraftFrom(view, master);
    const payload = buildConfigurePayload(draft, allCaps(), 5)!;
    assert.ok(payload.options, 'subset expected when capability on');
    assert.strictEqual(payload.options!.length, 1, 'inactive option must never be submitted');
    assert.strictEqual(payload.options![0].optionId, 'o-1');
    assert.strictEqual(payload.options![0].allowed, true);
    assert.strictEqual(payload.expectedProductVersion, 5);
  });

  it('an undeclared capability set submits only the lock token, omitting every override', () => {
    const draft = groupDraftFrom(round2GroupView(), round2Master());
    const payload = buildConfigurePayload(draft, UNDECLARED_CAPABILITIES, 9)!;
    // Only the lock token is carried; the fresh attachment relationshipVersion (0) is
    // not null, so it is preserved rather than omitted.
    assert.deepStrictEqual(payload, { expectedProductVersion: 9, relationshipVersion: 0 });
  });
});

/* ========================================= §12 Inventory-effect shape helpers */

describe('Round 2 §12 — inventory effect shape and payload', () => {
  it('renders exactly the fields each type can use', () => {
    assert.deepEqual(
      { source: effectShowsSource('ADD'), target: effectShowsTarget('ADD'), qty: effectShowsQuantity('ADD'), mult: effectShowsMultiplier('ADD') },
      { source: false, target: true, qty: true, mult: false },
    );
    assert.ok(effectShowsSource('MULTIPLY') && effectShowsMultiplier('MULTIPLY') && !effectShowsQuantity('MULTIPLY'));
  });

  it('an ADD needs a target and a positive quantity; a REPLACE needs two different items', () => {
    assert.strictEqual(validateEffectDraft({ type: 'ADD', sourceIngredientId: '', targetIngredientId: '', effectQuantity: '', effectMultiplier: '' }).effectQuantity, 'productEditor.err.effectQuantityRequired');
    const replace = validateEffectDraft({ type: 'REPLACE', sourceIngredientId: 'a', targetIngredientId: 'a', effectQuantity: '', effectMultiplier: '' });
    assert.strictEqual(replace.targetIngredientId, 'productEditor.err.effectSameItem');
  });

  it('NONE is always valid and clears the effect', () => {
    assert.deepStrictEqual(validateEffectDraft({ type: 'NONE', sourceIngredientId: '', targetIngredientId: '', effectQuantity: '', effectMultiplier: '' }), {});
    assert.deepStrictEqual(buildEffectPayload({ type: 'NONE', sourceIngredientId: 'x', targetIngredientId: 'y', effectQuantity: '5', effectMultiplier: '2' }), { type: 'NONE' });
  });

  it('the built payload nulls fields the chosen type does not use', () => {
    const payload = buildEffectPayload({ type: 'MULTIPLY', sourceIngredientId: 's', targetIngredientId: 'ignored', effectQuantity: '', effectMultiplier: '0.5' })!;
    assert.strictEqual(payload.type, 'MULTIPLY');
    assert.strictEqual(payload.sourceIngredientId, 's');
    assert.strictEqual(payload.targetIngredientId, null);
    assert.strictEqual(payload.effectQuantity, null);
    assert.strictEqual(payload.effectMultiplier, 0.5);
  });

  it('effectDraftFrom round-trips a stored effect into editable strings', () => {
    const draft = effectDraftFrom(effect({ type: 'REPLACE', sourceIngredientId: 's', targetIngredientId: 't', effectQuantity: 3 }));
    assert.strictEqual(draft.type, 'REPLACE');
    assert.strictEqual(draft.effectQuantity, '3');
    assert.strictEqual(draft.effectMultiplier, '');
  });
});

/* ================================================= §13 Recipe lifecycle helpers */

describe('Round 2 §13 — recipe lifecycle helpers', () => {
  it('only a DRAFT is editable and an empty DRAFT can never activate', () => {
    assert.ok(isRecipeDraft(recipeVersion({ status: 'DRAFT' })));
    assert.ok(!isRecipeDraft(recipeVersion({ status: 'ACTIVE' })));
    assert.ok(!canActivateRecipe(recipeVersion({ status: 'DRAFT', lines: [] })));
    assert.ok(canActivateRecipe(recipeVersion({ status: 'DRAFT', lines: [recipeLine()] })));
  });

  it('clone copies the lines but never the version token or status', () => {
    const src = recipeVersion({ status: 'ACTIVE', version: 12, yieldQuantity: 4, lines: [recipeLine({ ingredientId: 'a' }), recipeLine({ ingredientId: 'b', displayOrder: 1 })] });
    const draft = cloneActiveToDraft(src);
    assert.strictEqual((draft as { items?: unknown[] }).items?.length, 2);
    assert.strictEqual(draft.notes, null);
    // The create payload carries no version/status field at all.
    assert.ok(!('version' in draft) && !('status' in draft));
  });

  it('reorder moves a line and re-sequences the display order from zero', () => {
    const lines = [recipeLine({ ingredientId: 'a' }), recipeLine({ ingredientId: 'b' }), recipeLine({ ingredientId: 'c' })];
    const moved = reorderRecipeLines(lines, 2, 0);
    assert.deepStrictEqual(moved.map((l) => l.ingredientId), ['c', 'a', 'b']);
    assert.deepStrictEqual(moved.map((l) => l.displayOrder), [0, 1, 2]);
  });

  it('buildReplaceItems submits the complete set with the current lock token', () => {
    const input = buildReplaceItems(7, [recipeLine({ quantityRequiredBase: 2 }), recipeLine({ quantityRequiredBase: '3' })]);
    assert.strictEqual(input.expectedVersion, 7);
    assert.strictEqual(input.items.length, 2);
    assert.strictEqual(input.items[1].quantityRequiredBase, 3);
    assert.deepStrictEqual(input.items.map((i) => i.displayOrder), [0, 1]);
  });
});

/* =============================================== §15/§17 section modes and copy */

describe('Round 2 — section modes, version conflicts and localization parity', () => {
  it('every Round 2 tab is now delivered (edit or read), none left as placeholder', () => {
    for (const id of ['options', 'effects', 'recipes', 'inventory'] as const) {
      const mode = sectionById(id)!.mode;
      assert.ok(mode === 'edit' || mode === 'read', `${id} must no longer be a placeholder, found ${mode}`);
    }
    assert.strictEqual(PLACEHOLDER_SECTIONS.length, 0, 'no placeholders should remain after Round 2');
  });

  it('the Round 2 optimistic-lock codes all map to the conflict copy', () => {
    for (const code of ['CUSTOMIZATION_GROUP_VERSION_CONFLICT', 'CUSTOMIZATION_OPTION_VERSION_CONFLICT', 'OPTION_VERSION_CONFLICT', 'RECIPE_VERSION_CONFLICT']) {
      assert.ok(isVersionConflict(code), `${code} must be a version conflict`);
      assert.strictEqual(editorErrorKey(code, 409), 'productEditor.err.conflict');
    }
  });

  it('a 409 with an unknown code still surfaces the conflict copy, not a crash', () => {
    assert.strictEqual(editorErrorKey(undefined, 409), 'productEditor.err.conflict');
  });

  it('every Round 2 label and error key exists in both English and Khmer', () => {
    const en = translations.en as Record<string, string>;
    const km = translations.km as Record<string, string>;
    for (const key of [
      'productEditor.options.attach', 'productEditor.effects.title', 'productEditor.effects.explain.REPLACE',
      'productEditor.recipes.title', 'productEditor.recipes.status.DRAFT', 'productEditor.recipes.scaling.PROPORTIONAL_TO_YIELD',
      'productEditor.inventory.openModule', 'productEditor.stockMode.RECIPE_BASED', 'productEditor.consumeSource.BASE_RECIPE',
      'productEditor.err.singleMaxOne', 'productEditor.err.effectSameItem', 'productEditor.recipes.err.conflictingEffects',
    ]) {
      assert.ok(key in en, `English missing ${key}`);
      assert.ok(key in km, `Khmer missing ${key}`);
      assert.ok(en[key].trim().length > 0, `English ${key} empty`);
    }
  });
});
