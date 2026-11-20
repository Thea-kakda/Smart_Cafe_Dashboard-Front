/**
 * Pure state, validation and save-planning logic for the Round 1 product
 * editor (Slice 4A §8). Nothing here imports React, reads `window`, or touches
 * the network: each section's behaviour is expressed as small functions over
 * plain data so the whole contract — including the parts the UI does not
 * exercise yet — is covered by `node:test` (see src/tests/product-editor.test.ts).
 *
 * Three invariants hold across the file:
 *
 *  1. **A value the server owns stays with the server.** Lock tokens
 *     (product, variant, channel publication, store product) are echoed back
 *     exactly as read; nothing is ever incremented or reused client-side.
 *  2. **An unchanged field is not sent as a change.** Payload builders return
 *     `null` (meaning "no request needed") when nothing differs, and send
 *     `null` for a classification the operator did not touch, which the backend
 *     reads as "leave the stored value alone" rather than "reset to default".
 *  3. **The client never upgrades a server fact.** Per-product customization
 *     writability comes from the server-declared capabilities block; an
 *     undeclared block is treated as unknown, never optimistically upgraded into
 *     a set of writable fields. Round 2 (V049) makes those overrides real on the
 *     backend, but the editor still renders a control only when its flag is
 *     true — so a rolled-back or downgraded read model degrades safely instead
 *     of offering a write the server would reject.
 */
import {
  AvailabilityPreview,
  AvailabilityQuery,
  ChannelConfigInput,
  ChannelPolicy,
  ChannelScheduleWindow,
  ConfigureCustomizationGroupInput,
  CreateRecipeDraftInput,
  CreateVariantInput,
  CustomizationCapabilities,
  CustomizationGroupMaster,
  CustomizationGroupView,
  CustomizationOptionMaster,
  CustomizationOptionView,
  InventoryEffect,
  OptionOverrideInput,
  ProductDetails,
  ProductType,
  ProductVariant,
  RecipeLine,
  RecipeVersion,
  ReplaceRecipeItemsInput,
  SetInventoryEffectInput,
  StockMode,
  UpdateVariantInput,
} from './productEditor';
import { UpdateProductInput } from './catalogAdmin';

/* ================================================================ A. Sections */

export type SectionId =
  | 'general'
  | 'variants'
  | 'channels'
  | 'preview'
  | 'options'
  | 'effects'
  | 'recipes'
  | 'inventory';

/** `edit` saves, `read` only displays, `placeholder` is a Round 2 promise. */
export type SectionMode = 'edit' | 'read' | 'placeholder';

export interface EditorSection {
  id: SectionId;
  round: 1 | 2;
  mode: SectionMode;
  labelKey: string;
  hintKey: string;
}

/**
 * Tab order for the editor shell. The four Round 1 sections come first; the four
 * Round 2 sections follow. Round 2 delivered the Options, Effects and Recipes
 * editors as real (write) surfaces and the Inventory tab as a read-only
 * operational view — the `round: 2` tag now records provenance, not a promise,
 * so the shell stops labelling them "coming soon".
 */
export const EDITOR_SECTIONS: readonly EditorSection[] = [
  { id: 'general', round: 1, mode: 'edit', labelKey: 'productEditor.tab.general', hintKey: 'productEditor.hint.general' },
  { id: 'variants', round: 1, mode: 'edit', labelKey: 'productEditor.tab.variants', hintKey: 'productEditor.hint.variants' },
  { id: 'channels', round: 1, mode: 'edit', labelKey: 'productEditor.tab.channels', hintKey: 'productEditor.hint.channels' },
  { id: 'preview', round: 1, mode: 'read', labelKey: 'productEditor.tab.preview', hintKey: 'productEditor.hint.preview' },
  { id: 'options', round: 2, mode: 'edit', labelKey: 'productEditor.tab.options', hintKey: 'productEditor.hint.options' },
  { id: 'effects', round: 2, mode: 'edit', labelKey: 'productEditor.tab.effects', hintKey: 'productEditor.hint.effects' },
  { id: 'recipes', round: 2, mode: 'edit', labelKey: 'productEditor.tab.recipes', hintKey: 'productEditor.hint.recipes' },
  { id: 'inventory', round: 2, mode: 'read', labelKey: 'productEditor.tab.inventory', hintKey: 'productEditor.hint.inventory' },
];

export const DELIVERED_SECTIONS: readonly EditorSection[] = EDITOR_SECTIONS.filter((s) => s.round === 1);
export const PLACEHOLDER_SECTIONS: readonly EditorSection[] = EDITOR_SECTIONS.filter((s) => s.mode === 'placeholder');

export function sectionById(id: SectionId): EditorSection | null {
  return EDITOR_SECTIONS.find((s) => s.id === id) ?? null;
}

export function isDelivered(id: SectionId): boolean {
  return sectionById(id)?.round === 1;
}

/**
 * Roving-tabindex navigation for the editor tab list: ArrowLeft/Right move by
 * one and wrap, Home/First and End/Last jump to the ends. Kept as a pure index
 * calculation so the wrapping behaviour is testable without a DOM — a tab list
 * that fails to wrap strands keyboard users at the first or last tab.
 */
export function nextTabIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  const safe = current >= 0 && current < count ? current : 0;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (safe + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (safe - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/* ============================================================ B. Section state */

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/** Per-tab lifecycle. `stale` means a newer save landed after this load. */
export interface SectionState {
  load: LoadState;
  saving: boolean;
  dirty: boolean;
  stale: boolean;
  /** An i18n key, never a raw server message. */
  errorKey: string | null;
}

export const INITIAL_SECTION_STATE: SectionState = {
  load: 'idle',
  saving: false,
  dirty: false,
  stale: false,
  errorKey: null,
};

export function beginLoad(s: SectionState): SectionState {
  return { ...s, load: 'loading', errorKey: null };
}

export function loadReady(s: SectionState): SectionState {
  return { ...s, load: 'ready', errorKey: null, stale: false };
}

export function loadFailed(s: SectionState, errorKey: string): SectionState {
  return { ...s, load: 'error', errorKey, saving: false };
}

export function markDirty(s: SectionState, dirty: boolean): SectionState {
  return { ...s, dirty };
}

export function beginSave(s: SectionState): SectionState {
  return { ...s, saving: true, errorKey: null };
}

/** A successful save clears dirty; the caller reloads and so clears stale too. */
export function saveSucceeded(s: SectionState): SectionState {
  return { ...s, saving: false, dirty: false, stale: false, errorKey: null };
}

export function saveFailed(s: SectionState, errorKey: string): SectionState {
  return { ...s, saving: false, errorKey };
}

/** Someone else advanced the aggregate: keep the draft, flag it, force a re-read. */
export function markStale(s: SectionState, errorKey: string): SectionState {
  return { ...s, saving: false, stale: true, errorKey };
}

/* ================================================================= C. General */

/**
 * Editable General fields. Numeric and money inputs stay strings so a
 * half-typed value ("3.", "") is representable instead of silently coerced to
 * 0 — the same reason the existing product form keeps them as text.
 */
export interface GeneralDraft {
  code: string;
  categoryId: string;
  name: string;
  description: string;
  basePrice: string;
  currencyCode: string;
  preparationMinutes: string;
  taxRate: string;
  customizable: boolean;
  active: boolean;
  productType: ProductType;
  stockMode: StockMode;
  imageObjectKey: string | null;
  imageUrl: string | null;
}

export function generalDraftFrom(p: ProductDetails): GeneralDraft {
  return {
    code: p.code,
    categoryId: p.categoryId,
    name: p.name,
    description: p.description ?? '',
    basePrice: String(p.basePrice),
    currencyCode: p.currencyCode,
    preparationMinutes: String(p.preparationMinutes),
    taxRate: String(p.taxRate),
    customizable: p.customizable,
    active: p.active,
    productType: p.productType,
    stockMode: p.stockMode,
    imageObjectKey: p.imageObjectKey,
    imageUrl: p.imageUrl,
  };
}

const GENERAL_SCALARS: (keyof GeneralDraft)[] = [
  'code', 'categoryId', 'name', 'description', 'basePrice', 'currencyCode',
  'preparationMinutes', 'taxRate', 'customizable', 'active', 'productType',
  'stockMode', 'imageObjectKey',
];

export function changedGeneralFields(base: ProductDetails, draft: GeneralDraft): string[] {
  const current = generalDraftFrom(base);
  return GENERAL_SCALARS.filter((k) => String(current[k]) !== String(draft[k]));
}

export function isGeneralDirty(base: ProductDetails, draft: GeneralDraft): boolean {
  return changedGeneralFields(base, draft).length > 0;
}

/** Same shapes the master-data form already accepts, so both paths agree. */
const MONEY_RE = /^\d{1,10}(\.\d{1,4})?$/;
const TAX_RE = /^\d{1,9}(\.\d{1,6})?$/;
const INT_RE = /^\d+$/;
const CURRENCY_RE = /^[A-Za-z]{3}$/;

/** Field → i18n error key. Empty map means the draft is submittable. */
export function validateGeneral(draft: GeneralDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.code.trim()) errors.code = 'prodAdmin.errCodeRequired';
  if (!draft.categoryId) errors.categoryId = 'prodAdmin.errCategoryRequired';
  if (!draft.name.trim()) errors.name = 'prodAdmin.errNameRequired';
  if (!MONEY_RE.test(draft.basePrice.trim())) errors.basePrice = 'prodAdmin.errPriceInvalid';
  if (!CURRENCY_RE.test(draft.currencyCode.trim())) errors.currencyCode = 'prodAdmin.errCurrencyInvalid';
  if (!TAX_RE.test(draft.taxRate.trim())) errors.taxRate = 'prodAdmin.errTaxInvalid';
  if (!INT_RE.test(draft.preparationMinutes.trim())) errors.preparationMinutes = 'prodAdmin.errPrepInvalid';
  return errors;
}

/**
 * PATCH body for the Round 1 General tab. Returns `null` when the draft equals
 * the authoritative read, so the shell can skip a pointless request that would
 * still bump the product version.
 *
 * Classification is only sent when it actually changed: the backend treats a
 * blank/omitted value as "preserve", so sending the unchanged value would be
 * harmless but sending nothing at all is the honest expression of "untouched".
 */
export function buildGeneralPayload(
  base: ProductDetails,
  draft: GeneralDraft,
): (UpdateProductInput & { productType: ProductType | null; stockMode: StockMode | null }) | null {
  const errors = validateGeneral(draft);
  if (Object.keys(errors).length > 0) return null;
  if (!isGeneralDirty(base, draft)) return null;
  return {
    code: draft.code.trim(),
    categoryId: draft.categoryId,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    basePrice: Number(draft.basePrice.trim()),
    currencyCode: draft.currencyCode.trim().toUpperCase(),
    preparationMinutes: Number(draft.preparationMinutes.trim()),
    taxRate: Number(draft.taxRate.trim()),
    customizable: draft.customizable,
    active: draft.active,
    imageObjectKey: draft.imageObjectKey,
    version: base.version,
    productType: draft.productType === base.productType ? null : draft.productType,
    stockMode: draft.stockMode === base.stockMode ? null : draft.stockMode,
  };
}

/* ================================================================ D. Variants */

export interface VariantDraft {
  variantId: string | null;
  code: string;
  name: string;
  description: string;
  barcode: string;
  price: string;
  cost: string;
  currencyCode: string;
  displayOrder: string;
  isDefault: boolean;
  active: boolean;
  imageObjectKey: string | null;
  version: number | null;
}

export function emptyVariantDraft(currencyCode: string, displayOrder = 0): VariantDraft {
  return {
    variantId: null, code: '', name: '', description: '', barcode: '', price: '', cost: '',
    currencyCode, displayOrder: String(displayOrder), isDefault: false, active: true,
    imageObjectKey: null, version: null,
  };
}

export function variantDraftFrom(v: ProductVariant): VariantDraft {
  return {
    variantId: v.variantId,
    code: v.code,
    name: v.name,
    description: v.description ?? '',
    barcode: v.barcode ?? '',
    price: String(v.price),
    cost: v.cost === null || v.cost === undefined ? '' : String(v.cost),
    currencyCode: v.currencyCode,
    displayOrder: String(v.displayOrder),
    isDefault: v.isDefault,
    active: v.active,
    imageObjectKey: v.imageObjectKey,
    version: v.version,
  };
}

const MAX_CODE = 80;
const MAX_NAME = 150;
const MAX_DESCRIPTION = 5000;
const MAX_BARCODE = 64;

/** Mirrors Create/UpdateProductVariantRequest bean validation, field for field. */
export function validateVariant(draft: VariantDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const code = draft.code.trim();
  if (!code) errors.code = 'variantAdmin.errCodeRequired';
  else if (code.length > MAX_CODE) errors.code = 'variantAdmin.errCodeTooLong';
  const name = draft.name.trim();
  if (!name) errors.name = 'variantAdmin.errNameRequired';
  else if (name.length > MAX_NAME) errors.name = 'variantAdmin.errNameTooLong';
  if (draft.description.trim().length > MAX_DESCRIPTION) errors.description = 'variantAdmin.errDescriptionTooLong';
  if (draft.barcode.trim().length > MAX_BARCODE) errors.barcode = 'variantAdmin.errBarcodeTooLong';
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(draft.price.trim())) errors.price = 'variantAdmin.errPriceInvalid';
  const cost = draft.cost.trim();
  if (cost !== '' && !/^\d{1,10}(\.\d{1,4})?$/.test(cost)) errors.cost = 'variantAdmin.errCostInvalid';
  if (!CURRENCY_RE.test(draft.currencyCode.trim())) errors.currencyCode = 'variantAdmin.errCurrencyInvalid';
  if (!INT_RE.test(draft.displayOrder.trim()) || Number(draft.displayOrder) < 0) {
    errors.displayOrder = 'variantAdmin.errOrderInvalid';
  }
  return errors;
}

export function isVariantValid(draft: VariantDraft): boolean {
  return Object.keys(validateVariant(draft)).length === 0;
}

function variantCore(draft: VariantDraft): CreateVariantInput {
  const cost = draft.cost.trim();
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    barcode: draft.barcode.trim() || null,
    price: Number(draft.price.trim()),
    cost: cost === '' ? null : Number(cost),
    currencyCode: draft.currencyCode.trim().toUpperCase(),
    displayOrder: Number(draft.displayOrder.trim()),
    imageObjectKey: draft.imageObjectKey,
  };
}

/** POST body. `isDefault`/`active` are sent explicitly instead of relying on defaults. */
export function buildVariantCreate(draft: VariantDraft): CreateVariantInput | null {
  if (!isVariantValid(draft)) return null;
  return { ...variantCore(draft), isDefault: draft.isDefault, active: draft.active };
}

/** PATCH body: the full row plus the version read from the last response. */
export function buildVariantUpdate(draft: VariantDraft): UpdateVariantInput | null {
  if (!isVariantValid(draft) || draft.variantId === null || draft.version === null) return null;
  return { ...variantCore(draft), version: draft.version };
}

/**
 * The reorder route replaces the whole ordering, so the list must be exactly
 * the variants currently on screen — a missing id fails with
 * REORDER_LIST_MISMATCH server-side, which is the correct outcome rather than a
 * silent partial reorder. Returns null when the draft order is not a
 * permutation of the given ids.
 */
export function buildReorderList(ids: readonly string[], orderedIds: readonly string[]): string[] | null {
  if (ids.length !== orderedIds.length) return null;
  const expected = new Set(ids);
  const seen = new Set(orderedIds);
  if (seen.size !== orderedIds.length) return null;
  for (const id of orderedIds) if (!expected.has(id)) return null;
  return [...orderedIds];
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Client-side mirror of the default-variant invariant the command service
 * enforces (MULTIPLE_DEFAULT_VARIANTS / DEFAULT_VARIANT_REQUIRED). It exists to
 * warn before a doomed write, not to replace the server check.
 */
export function defaultVariantIssues(variants: readonly ProductVariant[]): string[] {
  const defaults = variants.filter((v) => v.isDefault);
  const issues: string[] = [];
  if (defaults.length > 1) issues.push('variantAdmin.warnMultipleDefaults');
  if (variants.length > 0 && defaults.length === 0) issues.push('variantAdmin.warnNoDefault');
  return issues;
}

/* ================================================= E. Schedules (wall clock) */

/** Strict `HH:mm` 24-hour clock. Deliberately not a `Date` parse. */
const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DAY_RE = /^[1-7]$/;

export function parseClock(value: string): { hour: number; minute: number } | null {
  const m = CLOCK_RE.exec((value ?? '').trim());
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function toWeekMinutes(dayOfWeek: number, clock: string): number | null {
  if (!ISO_DAY_RE.test(String(dayOfWeek))) return null;
  const parsed = parseClock(clock);
  if (!parsed) return null;
  return (dayOfWeek - 1) * 1440 + parsed.hour * 60 + parsed.minute;
}

/**
 * Absolute week interval for one window, reproducing the server rule exactly:
 * an end at or before the start rolls onto the next calendar day, and the
 * whole span is duplicated a week earlier so a Sunday-evening tail collides
 * with an early-Monday window. Returns null for a malformed window.
 */
export function windowRange(w: ChannelScheduleWindow): readonly (readonly [number, number])[] | null {
  const start = toWeekMinutes(w.dayOfWeek, w.startTime);
  const end = toWeekMinutes(w.dayOfWeek, w.endTime);
  if (start === null || end === null) return null;
  const realEnd = end <= start ? end + 10080 : end;
  return [[start, realEnd], [start - 10080, realEnd - 10080]];
}

export function validateScheduleWindow(w: ChannelScheduleWindow): string | null {
  if (!ISO_DAY_RE.test(String(w.dayOfWeek))) return 'channelAdmin.errDayInvalid';
  if (!parseClock(w.startTime) || !parseClock(w.endTime)) return 'channelAdmin.errClockInvalid';
  if (w.startTime.trim() === w.endTime.trim()) return 'channelAdmin.errSameClock';
  return null;
}

/**
 * Pairwise overlap check over ACTIVE windows only — a disabled window cannot
 * conflict, matching the backend. Returns the 0-based indexes of the first
 * collision, or null. The two copies of one window never conflict with each
 * other, which is what the `sameWindowCopy` exclusion encodes.
 */
export function findScheduleOverlap(
  windows: readonly ChannelScheduleWindow[],
): readonly [number, number] | null {
  const ranges: { start: number; end: number; owner: number }[] = [];
  windows.forEach((w, index) => {
    if (!w.active) return;
    const range = windowRange(w);
    if (!range) return;
    for (const [start, end] of range) ranges.push({ start, end, owner: index });
  });
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i];
      const b = ranges[j];
      if (a.owner === b.owner) continue; // the two copies of the same window
      if (a.start < b.end && b.start < a.end) return [a.owner, b.owner];
    }
  }
  return null;
}

/** Ordered, deduplicated error keys for a whole schedule draft. */
export function validateScheduleSet(windows: readonly ChannelScheduleWindow[]): string[] {
  const errors = new Set<string>();
  for (const w of windows) {
    const e = validateScheduleWindow(w);
    if (e) errors.add(e);
  }
  if (errors.size === 0 && findScheduleOverlap(windows)) errors.add('channelAdmin.errOverlap');
  return [...errors];
}

/** Keeps the string form the server expects: trimmed `HH:mm`, no Date round-trip. */
export function normalizeWindow(w: ChannelScheduleWindow): ChannelScheduleWindow {
  return {
    scheduleId: w.scheduleId,
    dayOfWeek: w.dayOfWeek,
    startTime: (w.startTime ?? '').trim(),
    endTime: (w.endTime ?? '').trim(),
    active: w.active,
  };
}

export function scheduleDirty(
  loaded: readonly ChannelScheduleWindow[],
  draft: readonly ChannelScheduleWindow[],
): boolean {
  const key = (list: readonly ChannelScheduleWindow[]) =>
    list
      .map((w) => `${w.dayOfWeek}|${w.startTime}|${w.endTime}|${w.active ? 1 : 0}`)
      .sort()
      .join(';');
  return key(loaded.map(normalizeWindow)) !== key(draft.map(normalizeWindow));
}

/* ============================================== F. Manual sold-out (instant) */

/**
 * UTC offset of a named IANA zone at an absolute instant, in minutes. Uses
 * `Intl` rather than a hard-coded table so the answer stays correct for zones
 * with daylight saving.
 */
export function zoneOffsetMinutes(timeZone: string, epochMs: number): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(new Date(epochMs))) parts[p.type] = p.value;
    const asUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second),
    );
    return Math.round((asUtc - epochMs) / 60000);
  } catch {
    return null;
  }
}

/**
 * Converts a store-local wall clock (`YYYY-MM-DDTHH:mm`, what a datetime-local
 * input yields) into the absolute instant the API expects, using the STORE's
 * timezone — never the browser's, which may be somewhere else entirely.
 *
 * This is the one place the editor produces an ISO string, and it is allowed
 * because `soldOutUntil` really is an instant. Weekly schedule windows keep
 * their `HH:mm` wall clock and never pass through here.
 */
export function wallClockToInstant(wall: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec((wall ?? '').trim());
  if (!m) return null;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? '0'));
  if (Number.isNaN(naive)) return null;
  // Two passes: the first offset is taken at the naive instant, the second
  // corrects it at the real one, which is enough for a single DST boundary.
  const first = zoneOffsetMinutes(timeZone, naive);
  if (first === null) return null;
  const guess = naive - first * 60000;
  const second = zoneOffsetMinutes(timeZone, guess);
  const epoch = second === null ? guess : naive - second * 60000;
  return new Date(epoch).toISOString();
}

/** An empty/blank input means "no cut-off", which is what clears a sold-out. */
export function buildSoldOutPayload(
  form: { available: boolean; untilWallClock: string; storeTimezone: string; expectedVersion: number },
): { available: boolean; soldOutUntil: string | null; expectedVersion: number } | null {
  const raw = (form.untilWallClock ?? '').trim();
  let soldOutUntil: string | null = null;
  if (raw !== '') {
    soldOutUntil = wallClockToInstant(raw, form.storeTimezone);
    if (soldOutUntil === null) return null;
  }
  return { available: form.available, soldOutUntil, expectedVersion: form.expectedVersion };
}

/* ============================================================= G. Channels */

export function channelPolicyOf(
  list: readonly ChannelPolicy[],
  channel: string,
): ChannelPolicy | null {
  return list.find((p) => p.channel === channel) ?? null;
}

/**
 * Draft shape for one channel publication. Numbers and optional values are kept
 * as strings/empties because an `<input>` needs a controlled string: "" means
 * "not set" and is turned back into `null` when the payload is built.
 */
export interface ChannelConfigDraft {
  visible: boolean;
  orderable: boolean;
  displayName: string;
  displayDescription: string;
  displayOrder: string;
  availableFrom: string;
  availableUntil: string;
  timezone: string;
}

/**
 * PUT body for one channel publication. `expectedVersion` echoes the version
 * from the effective read: 0 for an inherited default (no row yet) and the
 * stored value otherwise, which is exactly what the service compares against.
 */
export function buildChannelConfig(
  policy: ChannelPolicy,
  draft: ChannelConfigDraft,
): ChannelConfigInput | null {
  const displayOrder = draft.displayOrder.trim();
  if (displayOrder !== '' && (!INT_RE.test(displayOrder) || Number(displayOrder) < 0)) return null;
  const from = draft.availableFrom.trim();
  const until = draft.availableUntil.trim();
  if (from !== '' && until !== '' && from >= until) return null;
  return {
    visible: draft.visible,
    orderable: draft.orderable,
    displayName: draft.displayName.trim() || null,
    displayDescription: draft.displayDescription.trim() || null,
    displayOrder: displayOrder === '' ? 0 : Number(displayOrder),
    availableFrom: from || null,
    availableUntil: until || null,
    timezone: draft.timezone.trim() || null,
    expectedVersion: policy.version,
  };
}

/** An inherited row is editable only as a first publication; deleting reverts. */
export function canDeleteChannel(policy: ChannelPolicy | null): boolean {
  return policy !== null && !policy.inherited;
}

/* ============================================================ H. Capabilities */

/**
 * What the Options tab may eventually offer, taken from the server. `declared`
 * is false when the response carried no capabilities block at all; every
 * permission is then false, because an absent declaration is not a licence to
 * send overrides.
 */
export interface CapabilityView {
  declared: boolean;
  requiredOverride: boolean;
  displayOrderOverride: boolean;
  minimumSelectionsOverride: boolean;
  maximumSelectionsOverride: boolean;
  defaultOptionOverride: boolean;
  allowedOptionSubset: boolean;
  relationshipVersionSource: string | null;
}

export const UNDECLARED_CAPABILITIES: CapabilityView = {
  declared: false,
  requiredOverride: false,
  displayOrderOverride: false,
  minimumSelectionsOverride: false,
  maximumSelectionsOverride: false,
  defaultOptionOverride: false,
  allowedOptionSubset: false,
  relationshipVersionSource: null,
};

export function toCapabilityView(c: CustomizationCapabilities | null | undefined): CapabilityView {
  if (!c || typeof c.relationshipVersionSource !== 'string') return UNDECLARED_CAPABILITIES;
  return {
    declared: true,
    requiredOverride: c.supportsRequiredOverride === true,
    displayOrderOverride: c.supportsDisplayOrderOverride === true,
    minimumSelectionsOverride: c.supportsMinimumSelectionsOverride === true,
    maximumSelectionsOverride: c.supportsMaximumSelectionsOverride === true,
    defaultOptionOverride: c.supportsDefaultOptionOverride === true,
    allowedOptionSubset: c.supportsAllowedOptionSubset === true,
    relationshipVersionSource: c.relationshipVersionSource,
  };
}

/**
 * Round 1 renders inherited master limits as read-only text. The helper exists
 * so the check is stated once and can be tested: a field is editable only when
 * the server says so, never because a value arrived in the payload.
 */
export function isGroupFieldEditable(cap: CapabilityView, field: 'required' | 'displayOrder' | 'minimum' | 'maximum' | 'default' | 'options'): boolean {
  switch (field) {
    case 'required':
      return cap.requiredOverride;
    case 'displayOrder':
      return cap.displayOrderOverride;
    case 'minimum':
      return cap.minimumSelectionsOverride;
    case 'maximum':
      return cap.maximumSelectionsOverride;
    case 'default':
      return cap.defaultOptionOverride;
    case 'options':
      return cap.allowedOptionSubset;
    default:
      return false;
  }
}

/**
 * The lock token for an attachment. After V049 the relationship carries its own
 * optimistic-lock version (`capabilities.relationshipVersionSource =
 * "RELATIONSHIP"`), so this is the attachment row token — not the owning product
 * version. A fresh attach reports 0. `expectedProductVersion` is still sent
 * alongside as the collection-level secondary token.
 */
export function groupLockToken(g: CustomizationGroupView): number {
  return g.relationshipVersion;
}

/* ============================================ I. Error mapping and conflicts */

/** Stable product-level version codes the management surface returns as 409. */
const VERSION_CONFLICT_CODES = new Set([
  'VERSION_CONFLICT',
  'PRODUCT_VERSION_CONFLICT',
  'PRODUCT_CUSTOMIZATION_GROUP_VERSION_CONFLICT',
  'VARIANT_VERSION_CONFLICT',
  'PRODUCT_CHANNEL_VERSION_CONFLICT',
  'STORE_PRODUCT_VERSION_CONFLICT',
  // Round 2 surfaces: master group/option, option effect, recipe version.
  'CUSTOMIZATION_GROUP_VERSION_CONFLICT',
  'CUSTOMIZATION_OPTION_VERSION_CONFLICT',
  'OPTION_VERSION_CONFLICT',
  'RECIPE_VERSION_CONFLICT',
]);

export function isVersionConflict(code: string | undefined): boolean {
  return !!code && VERSION_CONFLICT_CODES.has(code);
}

/**
 * Server error code → i18n key for this editor. Codes are the frozen strings
 * from the catalog/availability services; anything unmapped falls back by HTTP
 * status, and only then to the generic validation copy. Raw server text is
 * never rendered, because it can carry implementation detail the operator has
 * no use for.
 */
export const ERROR_KEY_BY_CODE: Record<string, string> = {
  // product (General)
  PRODUCT_NOT_FOUND: 'productEditor.err.productGone',
  VERSION_CONFLICT: 'productEditor.err.conflict',
  PRODUCT_VERSION_CONFLICT: 'productEditor.err.conflict',
  DUPLICATE_CODE: 'prodAdmin.errDuplicate',
  CATEGORY_NOT_FOUND: 'prodAdmin.errCategoryNotFound',
  PRICE_SCALE_EXCEEDED: 'prodAdmin.errPriceScale',
  NEGATIVE_PRICE: 'prodAdmin.errNegativePrice',
  PRICE_REQUIRED: 'prodAdmin.errPriceInvalid',
  TAX_SCALE_EXCEEDED: 'prodAdmin.errTaxScale',
  TAX_REQUIRED: 'prodAdmin.errTaxInvalid',
  NEGATIVE_TAX: 'prodAdmin.errTaxInvalid',
  INVALID_CURRENCY: 'prodAdmin.errCurrencyInvalid',
  INVALID_OBJECT_KEY: 'prodAdmin.errImageKey',
  INVALID_PRODUCT_TYPE: 'productEditor.err.productTypeInvalid',
  INVALID_STOCK_MODE: 'productEditor.err.stockModeInvalid',
  // variants
  VARIANT_NOT_FOUND: 'variantAdmin.errNotFound',
  DUPLICATE_VARIANT_SKU: 'variantAdmin.errDuplicate',
  MULTIPLE_DEFAULT_VARIANTS: 'variantAdmin.errMultipleDefaults',
  DEFAULT_VARIANT_REQUIRED: 'variantAdmin.errDefaultRequired',
  INVALID_VARIANT_PRICE: 'variantAdmin.errPriceInvalid',
  INVALID_VARIANT_STATE: 'variantAdmin.errState',
  REORDER_LIST_MISMATCH: 'variantAdmin.errReorderMismatch',
  CURRENCY_MISMATCH: 'variantAdmin.errCurrencyMismatch',
  // channels, schedules, sold-out
  INVALID_CHANNEL: 'channelAdmin.errChannelInvalid',
  CHANNEL_CONFIGURATION_NOT_FOUND: 'channelAdmin.errNotPublished',
  PRODUCT_CHANNEL_VERSION_CONFLICT: 'channelAdmin.errConflict',
  SCHEDULE_OVERLAP: 'channelAdmin.errOverlap',
  INVALID_SCHEDULE: 'channelAdmin.errScheduleInvalid',
  STORE_PRODUCT_NOT_FOUND: 'channelAdmin.errNotOffered',
  STORE_PRODUCT_VERSION_CONFLICT: 'channelAdmin.errSoldOutConflict',
  // availability preview
  INVALID_AVAILABILITY_QUANTITY: 'previewAdmin.errQuantity',
  VARIANT_PRODUCT_MISMATCH: 'previewAdmin.errVariantMismatch',
  // Round 1 customization contract — the editor never sends these overrides,
  // but a stale tab or a Round 2 client build must still land on real copy.
  CUSTOMIZATION_GROUP_NOT_FOUND: 'productEditor.err.groupGone',
  CUSTOMIZATION_GROUP_INACTIVE: 'productEditor.err.groupInactive',
  PRODUCT_CUSTOMIZATION_GROUP_NOT_FOUND: 'productEditor.err.attachmentGone',
  PRODUCT_CUSTOMIZATION_GROUP_VERSION_CONFLICT: 'productEditor.err.conflict',
  PRODUCT_SELECTION_LIMIT_OVERRIDE_NOT_SUPPORTED: 'productEditor.err.limitOverrideUnsupported',
  PRODUCT_DEFAULT_OPTION_NOT_SUPPORTED: 'productEditor.err.defaultUnsupported',
  PRODUCT_ALLOWED_OPTION_SUBSET_NOT_SUPPORTED: 'productEditor.err.subsetUnsupported',
  INVALID_SELECTION_LIMITS: 'productEditor.err.selectionLimits',
  OPTION_NOT_FOUND: 'productEditor.err.optionNotFound',
  OPTION_NOT_ALLOWED: 'productEditor.err.optionNotAllowed',
  DUPLICATE_PRODUCT_CUSTOMIZATION_GROUP: 'productEditor.err.duplicateAttachment',
  // Round 2 §6 — the writes the Options tab now makes can fail on these.
  DEFAULT_OPTION_NOT_ALLOWED: 'productEditor.err.defaultNotAllowed',
  DUPLICATE_OPTION_SELECTION: 'productEditor.err.duplicateOption',
  INVALID_OPTION_PRICE_OVERRIDE: 'productEditor.err.invalidPriceOverride',
  // Round 2 §7 — master group/option management.
  CUSTOMIZATION_OPTION_NOT_FOUND: 'productEditor.err.optionNotFound',
  CUSTOMIZATION_GROUP_VERSION_CONFLICT: 'productEditor.err.conflict',
  CUSTOMIZATION_OPTION_VERSION_CONFLICT: 'productEditor.err.conflict',
  OPTION_VERSION_CONFLICT: 'productEditor.err.conflict',
  DUPLICATE_CUSTOMIZATION_GROUP: 'productEditor.err.duplicateGroupMaster',
  DUPLICATE_CUSTOMIZATION_OPTION: 'productEditor.err.duplicateOptionMaster',
  INVALID_CUSTOMIZATION_OPTION: 'productEditor.err.invalidOptionMaster',
  MASTER_LIMITS_BREAK_PRODUCT_OVERRIDES: 'productEditor.err.masterBreaksOverrides',
  INVALID_REORDER_SET: 'productEditor.err.invalidReorderSet',
  // Round 2 §8/§12 — inventory-effect shape guards.
  SOURCE_INVENTORY_ITEM_REQUIRED: 'productEditor.err.effectSourceRequired',
  TARGET_INVENTORY_ITEM_REQUIRED: 'productEditor.err.effectTargetRequired',
  MULTIPLIER_REQUIRED: 'productEditor.err.effectMultiplierRequired',
  SOURCE_AND_TARGET_ITEM_SAME: 'productEditor.err.effectSameItem',
  INVALID_INVENTORY_EFFECT: 'productEditor.err.effectInvalid',
  // Round 2 §13 — recipe version lifecycle and assignment.
  RECIPE_VERSION_NOT_FOUND: 'productEditor.recipes.err.notFound',
  RECIPE_VERSION_IMMUTABLE: 'productEditor.recipes.err.immutable',
  RECIPE_VERSION_IN_USE: 'productEditor.recipes.err.inUse',
  RECIPE_VERSION_INVALID: 'productEditor.recipes.err.emptyDraft',
  RECIPE_VERSION_NOT_ACTIVE: 'productEditor.recipes.err.notActive',
  RECIPE_VERSION_CONFLICT: 'productEditor.err.conflict',
  RECIPE_ITEM_INVALID: 'productEditor.recipes.err.itemInvalid',
  INVALID_RECIPE_YIELD: 'productEditor.recipes.err.yieldInvalid',
  INGREDIENT_NOT_FOUND: 'productEditor.recipes.err.ingredientNotFound',
  PRODUCT_RECIPE_REQUIRED: 'productEditor.recipes.err.productRecipeRequired',
  ACTIVE_RECIPE_REQUIRED: 'productEditor.recipes.err.activeRecipeRequired',
  INVALID_PRODUCT_QUANTITY: 'productEditor.recipes.err.quantityInvalid',
  INVALID_CUSTOMIZATION_SELECTION: 'productEditor.recipes.err.selectionInvalid',
  CONFLICTING_INVENTORY_EFFECTS: 'productEditor.recipes.err.conflictingEffects',
};

const STATUS_FALLBACK: Record<number, string> = {
  400: 'prodAdmin.errValidation',
  401: 'productEditor.err.unauthorized',
  403: 'productEditor.err.forbidden',
  404: 'productEditor.err.notFound',
  409: 'productEditor.err.conflict',
  0: 'productEditor.err.network',
};

export const GENERIC_ERROR_KEY = 'productEditor.err.unknown';

/**
 * Maps a failure to an i18n key. `code` is the server's stable string and
 * `status` the HTTP code; the code always wins when known, so a 400 with an
 * actionable code never degrades into generic validation copy.
 */
export function editorErrorKey(code: string | undefined, status: number): string {
  if (code && ERROR_KEY_BY_CODE[code]) return ERROR_KEY_BY_CODE[code];
  if (isVersionConflict(code)) return ERROR_KEY_BY_CODE.VERSION_CONFLICT;
  return STATUS_FALLBACK[status] ?? GENERIC_ERROR_KEY;
}

/** True when the editor should re-read after a failure instead of retrying. */
export function shouldReloadAfter(code: string | undefined, status: number): boolean {
  if (isVersionConflict(code)) return true;
  return editorErrorKey(code, status) === 'productEditor.err.productGone';
}

/* ================================================= J. Preview presentation aid */

/**
 * The verdict is kept as separate concepts, exactly as the engine emits them;
 * this only picks the label for the headline chip. `orderable` is the single
 * "can a customer order this right now" answer, so the others are shown as the
 * reasons behind it rather than merged into it.
 */
export function previewVerdict(p: Pick<AvailabilityPreview, 'orderable' | 'active' | 'listed' | 'inStock'>): {
  key: string;
  tone: 'ok' | 'warn' | 'bad';
} {
  if (!p.active) return { key: 'previewAdmin.verdict.inactive', tone: 'bad' };
  if (!p.listed) return { key: 'previewAdmin.verdict.notListed', tone: 'bad' };
  if (!p.inStock) return { key: 'previewAdmin.verdict.outOfStock', tone: 'warn' };
  if (p.orderable) return { key: 'previewAdmin.verdict.orderable', tone: 'ok' };
  return { key: 'previewAdmin.verdict.blocked', tone: 'warn' };
}

/** Reason codes are frozen contract strings; only known ones get operator copy. */
export const REASON_KEY_BY_CODE: Record<string, string> = {
  PRODUCT_INACTIVE: 'previewAdmin.reason.PRODUCT_INACTIVE',
  PRODUCT_NOT_LISTED: 'previewAdmin.reason.PRODUCT_NOT_LISTED',
  PRODUCT_MANUALLY_SOLD_OUT: 'previewAdmin.reason.PRODUCT_MANUALLY_SOLD_OUT',
  PRODUCT_OUTSIDE_SCHEDULE: 'previewAdmin.reason.PRODUCT_OUTSIDE_SCHEDULE',
  PRODUCT_CONFIGURATION_UNAVAILABLE: 'previewAdmin.reason.PRODUCT_CONFIGURATION_UNAVAILABLE',
  PRODUCT_OUT_OF_STOCK: 'previewAdmin.reason.PRODUCT_OUT_OF_STOCK',
  ACTIVE_RECIPE_REQUIRED: 'previewAdmin.reason.ACTIVE_RECIPE_REQUIRED',
  INVENTORY_DATA_INCONSISTENT: 'previewAdmin.reason.INVENTORY_DATA_INCONSISTENT',
  VARIANT_INACTIVE: 'previewAdmin.reason.VARIANT_INACTIVE',
  VARIANT_NOT_OFFERED: 'previewAdmin.reason.VARIANT_NOT_OFFERED',
  VARIANT_RECIPE_UNAVAILABLE: 'previewAdmin.reason.VARIANT_RECIPE_UNAVAILABLE',
  VARIANT_OUT_OF_STOCK: 'previewAdmin.reason.VARIANT_OUT_OF_STOCK',
  REQUIRED_PACKAGING_UNAVAILABLE: 'previewAdmin.reason.REQUIRED_PACKAGING_UNAVAILABLE',
  OPTION_INACTIVE: 'previewAdmin.reason.OPTION_INACTIVE',
  OPTION_NOT_ALLOWED: 'previewAdmin.reason.OPTION_NOT_ALLOWED',
  OPTION_OUT_OF_STOCK: 'previewAdmin.reason.OPTION_OUT_OF_STOCK',
  OPTION_SOURCE_INGREDIENT_UNAVAILABLE: 'previewAdmin.reason.OPTION_SOURCE_INGREDIENT_UNAVAILABLE',
  OPTION_TARGET_INGREDIENT_UNAVAILABLE: 'previewAdmin.reason.OPTION_TARGET_INGREDIENT_UNAVAILABLE',
  OPTION_EFFECT_CONFLICT: 'previewAdmin.reason.OPTION_EFFECT_CONFLICT',
  REQUIRED_OPTION_GROUP_UNAVAILABLE: 'previewAdmin.reason.REQUIRED_OPTION_GROUP_UNAVAILABLE',
  REQUIRED_OPTION_SELECTION: 'previewAdmin.reason.REQUIRED_OPTION_SELECTION',
  AVAILABILITY_CALCULATION_FAILED: 'previewAdmin.reason.AVAILABILITY_CALCULATION_FAILED',
  RECONCILIATION_CRITICAL: 'previewAdmin.reason.RECONCILIATION_CRITICAL',
  UNIT_CONVERSION_ERROR: 'previewAdmin.reason.UNIT_CONVERSION_ERROR',
  AVAILABILITY_COMPLEXITY_LIMIT: 'previewAdmin.reason.AVAILABILITY_COMPLEXITY_LIMIT',
};

/** Unknown codes render as the code itself, never as a invented sentence. */
export function reasonKey(code: string): string {
  return REASON_KEY_BY_CODE[code] ?? 'previewAdmin.reason.other';
}

/**
 * Preview quantity bound mirrored from the engine's abuse guard
 * (`AvailabilityService.MAX_QUANTITY`). Declared here so the input can state the
 * real limit instead of letting the server reject a value the UI allowed.
 */
export const PREVIEW_MAX_QUANTITY = 10_000;

/**
 * Parses the quantity input against the same rule the server applies: an
 * integer in `1..PREVIEW_MAX_QUANTITY`. Returns null when unusable, so the
 * request is never sent with a garbage parameter.
 */
export function parsePreviewQuantity(raw: string): number | null {
  const text = raw.trim();
  if (!INT_RE.test(text)) return null;
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1 || n > PREVIEW_MAX_QUANTITY) return null;
  return n;
}

/**
 * Query parameters for one preview call. An empty variant selection is omitted
 * rather than sent as `''`, so the server keeps its "all variants" default.
 */
export function buildPreviewQuery(form: {
  variantId: string;
  includeOptions: boolean;
  quantity: string;
}): AvailabilityQuery | null {
  const quantity = parsePreviewQuantity(form.quantity);
  if (quantity === null) return null;
  return {
    variantId: form.variantId.trim() === '' ? undefined : form.variantId.trim(),
    includeOptions: form.includeOptions,
    quantity,
  };
}

/**
 * Effective option-group count from a preview, so the tab can say "none" rather
 * than rendering an empty container that looks like a loading failure.
 */
export function previewGroupCount(p: Pick<AvailabilityPreview, 'optionGroups'>): number {
  return p.optionGroups.reduce((sum, g) => sum + g.values.length, 0);
}

/* ========================= K. Whole-editor state, guards and discard (spec §4) */

/** One SectionState per editor tab, keyed by SectionId. */
export type EditorStates = Record<SectionId, SectionState>;

/**
 * Sections that can hold an uncommitted edit. The preview and inventory tabs are
 * read-only, so neither can make the editor dirty: refreshing a read must never
 * look like unsaved work. Round 2 adds the Options, Effects and Recipes editors
 * to the writable set (spec §11–§13); Inventory stays read (spec §14).
 */
export const EDITABLE_SECTIONS: readonly SectionId[] = [
  'general',
  'variants',
  'channels',
  'options',
  'effects',
  'recipes',
];

/** The tab that owns per-branch state; switching branch is guarded by this one. */
export const STORE_SPECIFIC_SECTION: SectionId = 'channels';

export function initializeEditorStates(): EditorStates {
  return {
    general: INITIAL_SECTION_STATE,
    variants: INITIAL_SECTION_STATE,
    channels: INITIAL_SECTION_STATE,
    preview: INITIAL_SECTION_STATE,
    options: INITIAL_SECTION_STATE,
    effects: INITIAL_SECTION_STATE,
    recipes: INITIAL_SECTION_STATE,
    inventory: INITIAL_SECTION_STATE,
  };
}

function withSection(map: EditorStates, id: SectionId, next: SectionState): EditorStates {
  return { ...map, [id]: next };
}

/** A read-only or placeholder section never becomes dirty; the request is dropped. */
export function markSectionDirty(map: EditorStates, id: SectionId, dirty: boolean): EditorStates {
  if (!EDITABLE_SECTIONS.includes(id)) return map;
  return withSection(map, id, markDirty(map[id], dirty));
}

export function markSectionSaving(map: EditorStates, id: SectionId): EditorStates {
  return withSection(map, id, beginSave(map[id]));
}

/** Clears only the named section — saving General never clears Stores/Channels. */
export function markSectionSaved(map: EditorStates, id: SectionId): EditorStates {
  return withSection(map, id, saveSucceeded(map[id]));
}

/** A failed save stays dirty: the operator's intent is not thrown away. */
export function markSectionError(map: EditorStates, id: SectionId, errorKey: string): EditorStates {
  return withSection(map, id, saveFailed(map[id], errorKey));
}

/** A 409 keeps the local draft (still dirty) and flags that the server moved. */
export function markSectionConflict(map: EditorStates, id: SectionId, errorKey: string): EditorStates {
  return withSection(map, id, markStale(map[id], errorKey));
}

/** Discard clears the edit intent; the caller restores the draft from the snapshot. */
export function discardSection(map: EditorStates, id: SectionId): EditorStates {
  const s = map[id];
  return withSection(map, id, { ...s, dirty: false, stale: false, errorKey: null });
}

/** True when any editable tab holds a change the server has not accepted. */
export function hasUnsavedChanges(map: EditorStates): boolean {
  return EDITABLE_SECTIONS.some((id) => map[id].dirty || map[id].stale);
}

export function hasStoreSpecificUnsavedChanges(map: EditorStates): boolean {
  const s = map[STORE_SPECIFIC_SECTION];
  return s.dirty || s.stale;
}

/** Branch switching is blocked only by the per-branch tab, not by General edits. */
export function canSwitchStore(map: EditorStates): boolean {
  return !hasStoreSpecificUnsavedChanges(map);
}

/** Product switching is blocked by any editable tab. */
export function canSwitchProduct(map: EditorStates): boolean {
  return !hasUnsavedChanges(map);
}

/** A new product is a new set of aggregates: every tab returns to its initial state. */
export function resetAfterProductChange(): EditorStates {
  return initializeEditorStates();
}

/* ===================================== L. Round 1 save orchestrator (spec §5) */

export type SaveStepId =
  | 'general'
  | 'variants'
  | 'storeProduct'
  | 'channelConfig'
  | 'channelSchedules'
  | 'soldOutRefresh'
  | 'previewRefresh';

export interface SaveStep {
  id: SaveStepId;
  dependsOn: readonly SaveStepId[];
}

/**
 * The order Round 1 would save in, and what each step depends on. A dependency
 * is satisfied only when it SUCCEEDED; a failed or conflicted dependency blocks
 * its dependents, because their lock tokens were read from state the server no
 * longer agrees to. This is a plan, not a transaction: there is no cross-backend
 * atomicity and this code never pretends there is.
 */
export const SAVE_STEPS: readonly SaveStep[] = [
  { id: 'general', dependsOn: [] },
  { id: 'variants', dependsOn: ['general'] },
  { id: 'storeProduct', dependsOn: ['general'] },
  { id: 'channelConfig', dependsOn: ['storeProduct'] },
  { id: 'channelSchedules', dependsOn: ['channelConfig'] },
  { id: 'soldOutRefresh', dependsOn: ['storeProduct'] },
  { id: 'previewRefresh', dependsOn: [] },
];

export type StepOutcome = 'succeeded' | 'failed' | 'conflict' | 'skipped';

export interface SaveStepResult {
  step: SaveStepId;
  outcome: StepOutcome;
  /** Authoritative version from the response; never a client-side guess. */
  version?: number | null;
}

export interface OrchestratorState {
  outcomes: Partial<Record<SaveStepId, StepOutcome>>;
  versions: Partial<Record<SaveStepId, number>>;
}

export function initialOrchestrator(): OrchestratorState {
  return { outcomes: {}, versions: {} };
}

/**
 * Records one step result. A version is stored ONLY when the server actually
 * returned one on success — the orchestrator never advances a version itself,
 * so a retry always replays against the token the backend handed back.
 */
export function recordStepResult(state: OrchestratorState, result: SaveStepResult): OrchestratorState {
  const versions = { ...state.versions };
  if (result.outcome === 'succeeded' && typeof result.version === 'number') {
    versions[result.step] = result.version;
  }
  return { outcomes: { ...state.outcomes, [result.step]: result.outcome }, versions };
}

function dependenciesMet(state: OrchestratorState, step: SaveStep): boolean {
  return step.dependsOn.every((d) => state.outcomes[d] === 'succeeded');
}

/** First not-yet-resolved step whose dependencies all succeeded, else null. */
export function nextSaveStep(state: OrchestratorState): SaveStepId | null {
  for (const step of SAVE_STEPS) {
    if (state.outcomes[step.id]) continue;
    if (dependenciesMet(state, step)) return step.id;
  }
  return null;
}

function stepsWhere(state: OrchestratorState, outcome: StepOutcome): SaveStepId[] {
  return SAVE_STEPS.filter((s) => state.outcomes[s.id] === outcome).map((s) => s.id);
}

export const succeededSteps = (s: OrchestratorState): SaveStepId[] => stepsWhere(s, 'succeeded');
export const failedSteps = (s: OrchestratorState): SaveStepId[] => stepsWhere(s, 'failed');
export const conflictSteps = (s: OrchestratorState): SaveStepId[] => stepsWhere(s, 'conflict');
export const skippedSteps = (s: OrchestratorState): SaveStepId[] => stepsWhere(s, 'skipped');

/** Not-yet-resolved steps that cannot run because a dependency did not succeed. */
export function blockedSaveSteps(state: OrchestratorState): SaveStepId[] {
  return SAVE_STEPS.filter((s) => !state.outcomes[s.id] && !dependenciesMet(state, s)).map((s) => s.id);
}

/** A 409 stops automatic retry: the token moved under us, the operator must reload. */
export function shouldStopAutomaticRetry(state: OrchestratorState): boolean {
  return conflictSteps(state).length > 0;
}

/** Plain failures are the safe retry targets; a conflict is never auto-retried. */
export function retryableSteps(state: OrchestratorState): SaveStepId[] {
  return failedSteps(state);
}

/** Clears a step back to unresolved so `nextSaveStep` can reconsider it on retry. */
export function clearStepForRetry(state: OrchestratorState, id: SaveStepId): OrchestratorState {
  const outcomes = { ...state.outcomes };
  delete outcomes[id];
  return { outcomes, versions: state.versions };
}

/** Once dependencies are known to have failed, blocked steps are finalized as skipped. */
export function markBlockedAsSkipped(state: OrchestratorState): OrchestratorState {
  let next = state;
  for (const id of blockedSaveSteps(state)) {
    next = recordStepResult(next, { step: id, outcome: 'skipped' });
  }
  return next;
}

/** Some work landed and some did not — reported as partial, never as total. */
export function isPartialSuccess(state: OrchestratorState): boolean {
  return succeededSteps(state).length > 0
    && (failedSteps(state).length + conflictSteps(state).length + skippedSteps(state).length) > 0;
}

export function isAllResolved(state: OrchestratorState): boolean {
  return SAVE_STEPS.every((s) => state.outcomes[s.id]);
}

const AVAILABILITY_AFFECTING: readonly SaveStepId[] = [
  'general', 'variants', 'storeProduct', 'channelConfig', 'channelSchedules', 'soldOutRefresh',
];

/** Preview refresh only follows a change that can actually move the verdict. */
export function previewShouldRefresh(state: OrchestratorState): boolean {
  return AVAILABILITY_AFFECTING.some((id) => state.outcomes[id] === 'succeeded');
}

/* ============ M. Round 2 Options / Effects / Recipes helpers (spec §11–§13) */

/**
 * These helpers turn the Round 2 read model into lossless drafts and diffs, and
 * back into request payloads — all as pure functions so the whole contract is
 * covered by `node:test`. Two rules carry the Round 2 semantics:
 *
 *  1. **Inherit is empty, not zero.** A per-product override of null means
 *     "inherit the master value", so a draft input that should inherit is the
 *     empty string, and the payload builder maps it back to `null`. A stored
 *     override is only re-sent when it actually differs from the master value
 *     (otherwise the seed would invent an override that never existed).
 *  2. **The subset write is authoritative.** `options` replaces the effective
 *     allow-list by full roster, so a dropped ACTIVE option is sent as
 *     `allowed = false` (a controlled diff, never a delete) and INACTIVE master
 *     options are never sent at all — the backend rejects an inactive option in
 *     the subset with a stable 400.
 */

const DEC_RE = /^\d+(\.\d+)?$/;

/** '' or a bad value → null (inherit / unset); otherwise a finite number. */
function toDraftNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === '' || !DEC_RE.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Effective-vs-master compare: returns the override text only where they differ. */
function overrideText(effective: number | string | null, master: number | string | null): string {
  const e = effective === null || effective === undefined ? null : Number(effective);
  const m = master === null || master === undefined ? null : Number(master);
  if (e === null || m === null) return e === m ? '' : e === null ? '' : String(e);
  return e === m ? '' : String(e);
}

export interface OptionConfigDraft {
  optionId: string;
  allowed: boolean;
  /** '' inherits the master add-on price. */
  priceOverride: string;
  /** '' keeps the master (or stored) display order. */
  displayOrder: string;
  active: boolean;
}

export interface GroupAttachmentDraft {
  groupId: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  required: boolean;
  displayOrder: string;
  /** '' inherits the master minimum. */
  minimumSelections: string;
  /** '' inherits the master maximum. */
  maximumSelections: string;
  defaultOptionId: string | null;
  options: OptionConfigDraft[];
  /** Collection-level lock token, echoed from the authoritative read. */
  expectedProductVersion: number;
  /** Attachment row token, echoed; null only before the first save attaches. */
  relationshipVersion: number | null;
}

/**
 * Seeds an editable draft from the effective view plus the master group (so we
 * can tell an override from an inherited value — the view only reports the
 * effective `override ?? master` result, never which fired). A group with no
 * stored overrides seeds to pure-inherit drafts (every override field empty),
 * which round-trips to an identical payload.
 */
export function groupDraftFrom(view: CustomizationGroupView, master: CustomizationGroupMaster | null): GroupAttachmentDraft {
  const masterOptions = master?.options ?? [];
  const allowedIds = new Set(view.allowedOptions.map((o) => o.optionId));
  const masterById = new Map(masterOptions.map((o) => [o.optionId, o]));
  const options: OptionConfigDraft[] = masterOptions.map((m) => {
    const eff = view.allowedOptions.find((o) => o.optionId === m.optionId) ?? null;
    return {
      optionId: m.optionId,
      allowed: allowedIds.has(m.optionId),
      priceOverride: eff ? overrideText(eff.priceDelta, m.additionalPrice) : '',
      displayOrder: eff ? overrideText(eff.displayOrder, m.displayOrder) : '',
      active: m.active,
    };
  });
  // Options present in the view but missing from the master roster (defensive:
  // should not happen) are still preserved so a save cannot silently drop them.
  for (const o of view.allowedOptions) {
    if (!masterById.has(o.optionId)) {
      options.push({ optionId: o.optionId, allowed: true, priceOverride: '', displayOrder: '', active: o.active });
    }
  }
  // A per-product limit is an override only when it differs from the master; the
  // view carries just the effective value, so the master supplies the comparison.
  const minOverride = master !== null && view.minimumSelections !== master.minimumSelections;
  const maxOverride = master !== null && view.maximumSelections !== master.maximumSelections;
  return {
    groupId: view.groupId,
    selectionType: view.selectionType,
    required: view.required,
    displayOrder: String(view.displayOrder),
    minimumSelections: minOverride ? String(view.minimumSelections) : '',
    maximumSelections: maxOverride ? (view.maximumSelections === null ? '' : String(view.maximumSelections)) : '',
    defaultOptionId: view.defaultOptionId,
    options,
    expectedProductVersion: 0,
    relationshipVersion: view.relationshipVersion,
  };
}


/**
 * Field → i18n error key, checked against the SAME limits the server enforces
 * (advisory, spec §11 "validation shown before submit"). An empty map means the
 * draft is submittable; the server remains the authority and can still refuse.
 */
export function validateGroupDraft(draft: GroupAttachmentDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.displayOrder.trim() !== '' && !INT_RE.test(draft.displayOrder.trim())) {
    errors.displayOrder = 'productEditor.err.orderInvalid';
  }
  const min = draft.minimumSelections.trim();
  const max = draft.maximumSelections.trim();
  if (min !== '' && !INT_RE.test(min)) errors.minimumSelections = 'productEditor.err.selectionLimits';
  if (max !== '' && !INT_RE.test(max)) errors.maximumSelections = 'productEditor.err.selectionLimits';
  const minN = min === '' ? null : Number(min);
  const maxN = max === '' ? null : Number(max);
  if (minN !== null && maxN !== null && maxN < minN) errors.maximumSelections = 'productEditor.err.selectionLimits';
  // A SINGLE group caps at exactly one; the domain, service and DB all refuse more.
  if (draft.selectionType === 'SINGLE' && maxN !== null && maxN !== 1) {
    errors.maximumSelections = 'productEditor.err.singleMaxOne';
  }
  if (draft.defaultOptionId !== null) {
    const chosen = draft.options.find((o) => o.optionId === draft.defaultOptionId);
    if (!chosen || !chosen.allowed || !chosen.active) {
      errors.defaultOptionId = 'productEditor.err.defaultNotAllowed';
    }
  }
  draft.options.forEach((o, i) => {
    if (o.priceOverride.trim() !== '' && !DEC_RE.test(o.priceOverride.trim())) {
      errors[`option.${i}.price`] = 'productEditor.err.invalidPriceOverride';
    }
    if (o.displayOrder.trim() !== '' && !INT_RE.test(o.displayOrder.trim())) {
      errors[`option.${i}.order`] = 'productEditor.err.orderInvalid';
    }
  });
  return errors;
}

/**
 * Builds the PUT payload, honouring the server-declared capabilities: a control
 * the backend did not declare writable is omitted, so a downgraded read model
 * never submits an unsupported override. Returns null when advisory validation
 * failed, so the caller shows field errors instead of a doomed 400.
 */
export function buildConfigurePayload(
  draft: GroupAttachmentDraft,
  caps: CapabilityView,
  expectedProductVersion: number,
): ConfigureCustomizationGroupInput | null {
  if (Object.keys(validateGroupDraft(draft)).length > 0) return null;
  const input: ConfigureCustomizationGroupInput = { expectedProductVersion };
  if (caps.requiredOverride) input.required = draft.required;
  if (caps.displayOrderOverride) input.displayOrder = Number(draft.displayOrder) || 0;
  if (caps.minimumSelectionsOverride) input.minimumSelections = toDraftNumber(draft.minimumSelections);
  if (caps.maximumSelectionsOverride) input.maximumSelections = toDraftNumber(draft.maximumSelections);
  if (caps.defaultOptionOverride) input.defaultOptionId = draft.defaultOptionId;
  if (caps.allowedOptionSubset) {
    input.options = draft.options
      // Inactive master options are never part of a subset write.
      .filter((o) => o.active)
      .map((o): OptionOverrideInput => ({
        optionId: o.optionId,
        allowed: o.allowed,
        priceOverride: toDraftNumber(o.priceOverride),
        displayOrder: o.displayOrder.trim() === '' ? null : Number(o.displayOrder),
      }));
  }
  if (draft.relationshipVersion !== null) input.relationshipVersion = draft.relationshipVersion;
  return input;
}

/* ------------------------------------------------------ Inventory effect draft */

export interface EffectDraft {
  type: 'NONE' | 'ADD' | 'REMOVE' | 'REPLACE' | 'MULTIPLY';
  sourceIngredientId: string;
  targetIngredientId: string;
  effectQuantity: string;
  effectMultiplier: string;
}

export function effectDraftFrom(effect: InventoryEffect | null): EffectDraft {
  const blank: EffectDraft = { type: 'NONE', sourceIngredientId: '', targetIngredientId: '', effectQuantity: '', effectMultiplier: '' };
  if (!effect || effect.type === 'NONE') return blank;
  return {
    type: effect.type,
    sourceIngredientId: effect.sourceIngredientId ?? '',
    targetIngredientId: effect.targetIngredientId ?? '',
    effectQuantity: effect.effectQuantity === null || effect.effectQuantity === undefined ? '' : String(effect.effectQuantity),
    effectMultiplier: effect.effectMultiplier === null || effect.effectMultiplier === undefined ? '' : String(effect.effectMultiplier),
  };
}

/** Shape predicates so the editor renders only the fields a type can use. */
export const effectShowsSource = (t: EffectDraft['type']): boolean => t === 'REMOVE' || t === 'REPLACE' || t === 'MULTIPLY';
export const effectShowsTarget = (t: EffectDraft['type']): boolean => t === 'ADD' || t === 'REPLACE';
export const effectShowsQuantity = (t: EffectDraft['type']): boolean => t === 'ADD' || t === 'REMOVE' || t === 'REPLACE';
export const effectShowsMultiplier = (t: EffectDraft['type']): boolean => t === 'MULTIPLY';

/**
 * Advisory mirror of the server's per-type shape guard (ck_option_effect_shape)
 * so the operator sees the problem before a 400. The backend stays authoritative.
 */
export function validateEffectDraft(draft: EffectDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.type === 'NONE') return errors;
  const qty = draft.effectQuantity.trim();
  const mult = draft.effectMultiplier.trim();
  if (qty !== '' && !DEC_RE.test(qty)) errors.effectQuantity = 'productEditor.err.effectQuantityInvalid';
  if (mult !== '' && !DEC_RE.test(mult)) errors.effectMultiplier = 'productEditor.err.effectMultiplierInvalid';
  switch (draft.type) {
    case 'ADD':
      if (!draft.targetIngredientId) errors.targetIngredientId = 'productEditor.err.effectTargetRequired';
      if (qty === '') errors.effectQuantity = 'productEditor.err.effectQuantityRequired';
      break;
    case 'REMOVE':
      if (!draft.sourceIngredientId) errors.sourceIngredientId = 'productEditor.err.effectSourceRequired';
      break;
    case 'REPLACE':
      if (!draft.sourceIngredientId) errors.sourceIngredientId = 'productEditor.err.effectSourceRequired';
      if (!draft.targetIngredientId) errors.targetIngredientId = 'productEditor.err.effectTargetRequired';
      if (draft.sourceIngredientId && draft.sourceIngredientId === draft.targetIngredientId) {
        errors.targetIngredientId = 'productEditor.err.effectSameItem';
      }
      break;
    case 'MULTIPLY':
      if (!draft.sourceIngredientId) errors.sourceIngredientId = 'productEditor.err.effectSourceRequired';
      if (mult === '') errors.effectMultiplier = 'productEditor.err.effectMultiplierRequired';
      break;
  }
  return errors;
}

/** Builds the PUT body, or null when invalid. Inactive fields are cleared to null. */
export function buildEffectPayload(draft: EffectDraft): SetInventoryEffectInput | null {
  if (Object.keys(validateEffectDraft(draft)).length > 0) return null;
  if (draft.type === 'NONE') return { type: 'NONE' };
  return {
    type: draft.type,
    sourceIngredientId: effectShowsSource(draft.type) && draft.sourceIngredientId ? draft.sourceIngredientId : null,
    targetIngredientId: effectShowsTarget(draft.type) && draft.targetIngredientId ? draft.targetIngredientId : null,
    effectQuantity: effectShowsQuantity(draft.type) ? toDraftNumber(draft.effectQuantity) : null,
    effectMultiplier: effectShowsMultiplier(draft.type) ? toDraftNumber(draft.effectMultiplier) : null,
  };
}

/* --------------------------------------------------------------- Recipe draft */

export const isRecipeDraft = (v: Pick<RecipeVersion, 'status'>): boolean => v.status === 'DRAFT';

/** An empty DRAFT can never activate — the backend refuses it, so do we. */
export const canActivateRecipe = (v: RecipeVersion): boolean => isRecipeDraft(v) && v.lines.length > 0;

/**
 * Clones a version's lines into a fresh draft payload (client-side clone: the
 * backend exposes no clone endpoint). Never copies the version token or status —
 * the create call reserves a new DRAFT version number server-side.
 */
export function cloneActiveToDraft(v: RecipeVersion): CreateRecipeDraftInput {
  return {
    yieldQuantity: v.yieldQuantity === null || v.yieldQuantity === undefined ? null : Number(v.yieldQuantity),
    yieldUnitId: v.yieldUnitId,
    notes: v.notes,
    items: v.lines.map((l, i) => ({
      ingredientId: l.ingredientId,
      quantityRequiredBase: Number(l.quantityRequiredBase),
      wastagePercent: l.wastagePercent === null || l.wastagePercent === undefined ? null : Number(l.wastagePercent),
      unitId: l.unitId,
      scalingRule: l.scalingRule,
      displayOrder: i,
      optional: l.optional,
      notes: l.notes,
    })),
  };
}

/**
 * Reorders draft lines by moving one index to another, then re-sequences
 * displayOrder to the new position. Reuses the same move primitive as variants,
 * and the replace-items call always submits the complete list (clone-on-modify).
 */
export function reorderRecipeLines(lines: readonly RecipeLine[], from: number, to: number): RecipeLine[] {
  return moveItem(lines, from, to).map((l, i) => ({ ...l, displayOrder: i }));
}

/** Submits the full desired line set with the DRAFT's current lock token. */
export function buildReplaceItems(version: number, lines: readonly RecipeLine[]): ReplaceRecipeItemsInput {
  return {
    expectedVersion: version,
    items: lines.map((l, i) => ({
      ingredientId: l.ingredientId,
      quantityRequiredBase: Number(l.quantityRequiredBase),
      wastagePercent: l.wastagePercent === null || l.wastagePercent === undefined ? null : Number(l.wastagePercent),
      unitId: l.unitId,
      scalingRule: l.scalingRule,
      displayOrder: i,
      optional: l.optional,
      notes: l.notes,
    })),
  };
}

