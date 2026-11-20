/**
 * Round 1 + Round 2 product-editor contracts and API clients (Slice 4A §7, §11–§14).
 *
 * Every interface here mirrors one backend DTO of the management catalog/recipe
 * surface, field for field, so the editor deals in server contracts rather than
 * URLs or hand-rolled shapes. Two rules govern the whole module:
 *
 *  1. **Nothing is invented.** A field that the backend does not return is
 *     typed as absent, not defaulted. Round 2 (post-V049) flips the
 *     customization contract from inherited-facts-only to real per-product
 *     storage: `relationshipVersion` is now the attachment row's own token
 *     (`capabilities.relationshipVersionSource = "RELATIONSHIP"`), min/max
 *     overrides and `defaultOptionId` persist, and the option allow-list is a
 *     controlled diff — never delete-and-reinsert. The capability helpers in
 *     lib/productEditorState.ts still refuse to render a control the server has
 *     not declared writable, so a stale or downgraded backend cannot leak an
 *     unsupported write.
 *  2. **Versions are opaque lock tokens.** They are read from a response and
 *     echoed back unchanged; the client never increments, guesses or reuses a
 *     token across resources (product, variant, channel publication and
 *     store-product each carry their own).
 *
 * Time handling is deliberately split, matching the backend:
 *  - weekly schedule windows are wall-clock `HH:mm` strings (a `LocalTime` on
 *    the server) and are never converted through `Date`, `toISOString()` or UTC;
 *  - channel availability bounds and the manual sold-out cut-off are real
 *    instants, so they travel as RFC-3339 strings the server parses into an
 *    `Instant`.
 */
import { api } from './api';
import { ManagementProduct } from './catalogAdmin';

// ─── Classification (backend enums; the wire form is the enum name) ─────────

/** `com.smartcoffee.modules.catalog.domain.ProductType`. */
export const PRODUCT_TYPES = [
  'STANDARD',
  'BEVERAGE',
  'BAKERY',
  'CAKE',
  'FOOD',
  'COMBO',
  'SERVICE',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** `com.smartcoffee.modules.catalog.domain.StockMode`. */
export const STOCK_MODES = [
  'MADE_TO_ORDER',
  'RECIPE_BASED',
  'FINISHED_GOOD',
  'BATCH_PRODUCTION',
  'NOT_TRACKED',
] as const;
export type StockMode = (typeof STOCK_MODES)[number];

/**
 * The authoritative product read for the editor. It is the same management DTO
 * the product list already uses — a type alias, not a second model, so the list
 * and the editor can never drift apart on the classification fields.
 */
export type ProductDetails = ManagementProduct;

// ─── Customization groups (READ + WRITE from Round 2 / V049) ────────────────

/**
 * `ProductCustomizationCapabilitiesResponse`. Server-declared, never derived
 * on the client: it states which per-product fields the backend can actually
 * persist. The Dashboard renders an input only when the corresponding flag is
 * true, so an unsupported override cannot even be submitted by accident.
 * After V049 all six flags report true and the version source is
 * `"RELATIONSHIP"` — but the editor still trusts the declared values, not the
 * migration's existence, because a rolled-back read model must degrade safely.
 */
export interface CustomizationCapabilities {
  supportsRequiredOverride: boolean;
  supportsDisplayOrderOverride: boolean;
  supportsMinimumSelectionsOverride: boolean;
  supportsMaximumSelectionsOverride: boolean;
  supportsDefaultOptionOverride: boolean;
  supportsAllowedOptionSubset: boolean;
  /** `"PRODUCT"` or `"RELATIONSHIP"`: which row the lock token comes from. */
  relationshipVersionSource: string;
}

/** `InventoryEffectResponse` — the option's inventory side effect, if any. */
export interface InventoryEffect {
  optionId: string;
  groupId: string;
  optionCode: string;
  optionName: string;
  additionalPrice: number | string | null;
  type: 'NONE' | 'ADD' | 'REMOVE' | 'REPLACE' | 'MULTIPLY';
  sourceIngredientId: string | null;
  targetIngredientId: string | null;
  effectQuantity: number | string | null;
  effectMultiplier: number | string | null;
  /** Deprecated on the server; kept so the contract does not silently lose a field. */
  replacesOptionId?: string | null;
  version: number;
}

/** `ProductCustomizationOptionView` — one option inside the effective allow-list. */
export interface CustomizationOptionView {
  optionId: string;
  code: string;
  name: string;
  active: boolean;
  /** True when this option is the attachment's per-product default (Round 2). */
  defaultOption: boolean;
  /** Effective price delta: per-product override when set, else master price. */
  priceDelta: number | string | null;
  displayOrder: number;
  /** Reserved for numeric groups; still null — V049 gave no column to it. */
  numericValue: number | string | null;
  version: number;
  inventoryEffect: InventoryEffect | null;
}

/** `ProductCustomizationGroupView` — one attachment plus its effective configuration. */
export interface CustomizationGroupView {
  /** The attachment row id after V049; null only on pre-V049 payloads. */
  relationshipId: string | null;
  productId: string;
  groupId: string;
  groupCode: string;
  groupName: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  groupActive: boolean;
  /** Per-product, writable when `supportsRequiredOverride`. */
  required: boolean;
  /** Per-product, writable when `supportsDisplayOrderOverride`. */
  displayOrder: number;
  /** Effective minimum: per-product override when stored, else the master group's. */
  minimumSelections: number;
  /** Effective maximum; null means unbounded (or inherited unbounded). */
  maximumSelections: number | null;
  /** Per-product default option, writable when `supportsDefaultOptionOverride`. */
  defaultOptionId: string | null;
  /**
   * From V049 this is the attachment row's OWN optimistic-lock version
   * (`relationshipVersionSource = "RELATIONSHIP"`); a fresh attach reports 0.
   */
  relationshipVersion: number;
  /**
   * The effective allow-list: allowed ∧ master-active options. The view DTO
   * does not expose dropped (allowed=false) rows — the editor reconstructs the
   * full roster from the master group (§7 list) when the subset is editable.
   */
  allowedOptions: CustomizationOptionView[];
}

/** `ProductCustomizationGroupsResponse`. */
export interface ProductCustomizationGroupsResponse {
  productId: string;
  productVersion: number;
  capabilities: CustomizationCapabilities;
  groups: CustomizationGroupView[];
}

/**
 * `ConfigureProductCustomizationGroupRequest.OptionOverride` — one option's
 * per-product row in the allow-list diff. `allowed=false` drops the option
 * (the server keeps the row flagged, preserving history and any future price
 * override); a null price override inherits the master add-on price.
 */
export interface OptionOverrideInput {
  optionId: string;
  allowed?: boolean | null;
  priceOverride?: number | null;
  displayOrder?: number | null;
}

/**
 * `ConfigureProductCustomizationGroupRequest` — the attach-or-update payload
 * (`PUT .../products/{productId}/customization-groups/{groupId}`). Round 2
 * writes every field for real; a null min/max means "inherit the master", and
 * a null defaultOptionId clears the default (PUT is full-replace semantics).
 * Sending neither `options` nor `allowedOptionIds` leaves the stored subset
 * untouched.
 */
export interface ConfigureCustomizationGroupInput {
  required?: boolean | null;
  displayOrder?: number | null;
  /** Per-product minimum override; null inherits the master group. */
  minimumSelections?: number | null;
  /** Per-product maximum override; null inherits the master group. */
  maximumSelections?: number | null;
  /** Membership-only shortcut; superseded by `options` when both are sent. */
  allowedOptionIds?: string[] | null;
  /** Full per-option configuration rows (allow flag, price, order). */
  options?: OptionOverrideInput[] | null;
  /** Must be an allowed, active option; null clears the per-product default. */
  defaultOptionId?: string | null;
  /** Owning product version — collection-level token, echoed from the read. */
  expectedProductVersion: number;
  /** Attachment row version from the last read; null only on a fresh attach. */
  relationshipVersion?: number | null;
}

// ─── Customization masters (Round 2 §7 management surface) ──────────────────

/** `CustomizationGroupMasterResponse`. */
export interface CustomizationGroupMaster {
  groupId: string;
  code: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  minimumSelections: number;
  maximumSelections: number | null;
  displayOrder: number;
  active: boolean;
  version: number;
  options: CustomizationOptionMaster[];
}

/** `CustomizationOptionMasterResponse`. */
export interface CustomizationOptionMaster {
  optionId: string;
  code: string;
  name: string;
  additionalPrice: number | string | null;
  displayOrder: number;
  active: boolean;
  version: number;
  inventoryEffect: InventoryEffect | null;
}

/** `CreateCustomizationGroupRequest`. Selection type is immutable after creation. */
export interface CreateCustomizationGroupInput {
  code: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  minimumSelections: number;
  maximumSelections: number | null;
  displayOrder: number;
}

/** `UpdateCustomizationGroupRequest` — name/limits/order; `version` echoes the lock. */
export interface UpdateCustomizationGroupInput {
  version: number;
  name: string;
  minimumSelections: number;
  maximumSelections: number | null;
  displayOrder: number;
}

/** `CreateCustomizationOptionRequest`. */
export interface CreateCustomizationOptionInput {
  code: string;
  name: string;
  additionalPrice: number;
  displayOrder: number;
}

/** `UpdateCustomizationOptionRequest` — code and group are immutable. */
export interface UpdateCustomizationOptionInput {
  version: number;
  name: string;
  additionalPrice: number;
  displayOrder: number;
}

/** `SetInventoryEffectRequest`. Per-type shape is enforced server-side. */
export interface SetInventoryEffectInput {
  type: 'NONE' | 'ADD' | 'REMOVE' | 'REPLACE' | 'MULTIPLY';
  sourceIngredientId?: string | null;
  targetIngredientId?: string | null;
  effectQuantity?: number | null;
  effectMultiplier?: number | null;
}

// ─── Variants ───────────────────────────────────────────────────────────────

/** `ProductVariantResponse`. */
export interface ProductVariant {
  variantId: string;
  productId: string;
  code: string;
  name: string;
  description: string | null;
  barcode: string | null;
  price: number;
  cost: number | null;
  currencyCode: string;
  isDefault: boolean;
  active: boolean;
  displayOrder: number;
  imageObjectKey: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** `CreateProductVariantRequest`. */
export interface CreateVariantInput {
  code: string;
  name: string;
  description?: string | null;
  barcode?: string | null;
  price: number;
  cost?: number | null;
  currencyCode: string;
  isDefault?: boolean | null;
  active?: boolean | null;
  displayOrder: number;
  imageObjectKey?: string | null;
}

/** `UpdateProductVariantRequest` — the whole row plus its lock token. */
export interface UpdateVariantInput extends CreateVariantInput {
  version: number;
}

// ─── Channels, schedules and manual sold-out ────────────────────────────────

/** `com.smartcoffee.modules.catalog.domain.Channel`. */
export const CHANNELS = [
  'POS',
  'CUSTOMER_WEB',
  'CUSTOMER_APP',
  'QR_MENU',
  'KIOSK',
  'DELIVERY',
] as const;
export type ChannelName = (typeof CHANNELS)[number];

/** `ChannelPolicyResponse`. `inherited` true means no explicit row exists yet. */
export interface ChannelPolicy {
  channelId: string | null;
  channel: ChannelName;
  inherited: boolean;
  visible: boolean;
  orderable: boolean;
  displayName: string | null;
  displayDescription: string | null;
  displayOrder: number;
  availableFrom: string | null;
  availableUntil: string | null;
  timezone: string | null;
  version: number;
}

/** `ChannelConfigurationRequest`. */
export interface ChannelConfigInput {
  visible: boolean;
  orderable: boolean;
  displayName?: string | null;
  displayDescription?: string | null;
  displayOrder?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  timezone?: string | null;
  expectedVersion?: number | null;
}

/**
 * `ChannelScheduleView` / `ReplaceSchedulesRequest.Window`. `startTime` and
 * `endTime` are wall-clock `HH:mm` strings; `dayOfWeek` is ISO 1 (Monday) to
 * 7 (Sunday). A window whose end is at or before its start finishes on the next
 * calendar day (server-side roll), which is how an overnight shift is stored.
 */
export interface ChannelScheduleWindow {
  scheduleId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
  version?: number;
}

/** `ManualSoldOutRequest`. `expectedVersion` is the STORE-PRODUCT version. */
export interface ManualSoldOutInput {
  available: boolean;
  soldOutUntil: string | null;
  expectedVersion: number;
}

// ─── Availability preview ───────────────────────────────────────────────────

/** `AvailabilityReason.code()` — stable wire strings, never reworded client-side. */
export const AVAILABILITY_REASONS = [
  'PRODUCT_NOT_FOUND',
  'PRODUCT_INACTIVE',
  'PRODUCT_NOT_LISTED',
  'PRODUCT_MANUALLY_SOLD_OUT',
  'PRODUCT_OUTSIDE_SCHEDULE',
  'PRODUCT_CONFIGURATION_UNAVAILABLE',
  'PRODUCT_OUT_OF_STOCK',
  'ACTIVE_RECIPE_REQUIRED',
  'INVENTORY_DATA_INCONSISTENT',
  'VARIANT_INACTIVE',
  'VARIANT_NOT_OFFERED',
  'VARIANT_RECIPE_UNAVAILABLE',
  'VARIANT_OUT_OF_STOCK',
  'REQUIRED_PACKAGING_UNAVAILABLE',
  'OPTION_INACTIVE',
  'OPTION_NOT_ALLOWED',
  'OPTION_OUT_OF_STOCK',
  'OPTION_SOURCE_INGREDIENT_UNAVAILABLE',
  'OPTION_TARGET_INGREDIENT_UNAVAILABLE',
  'OPTION_EFFECT_CONFLICT',
  'REQUIRED_OPTION_GROUP_UNAVAILABLE',
  'REQUIRED_OPTION_SELECTION',
  'AVAILABILITY_CALCULATION_FAILED',
  'RECONCILIATION_CRITICAL',
  'UNIT_CONVERSION_ERROR',
  'AVAILABILITY_COMPLEXITY_LIMIT',
] as const;
export type AvailabilityReason = (typeof AVAILABILITY_REASONS)[number];

/** `VariantAvailabilityResult`. */
export interface VariantAvailability {
  variantId: string;
  variantName: string;
  active: boolean;
  orderable: boolean;
  inStock: boolean;
  availableServings: number | null;
  resolutionSource: string | null;
  recipeVersionId: string | null;
  reasonCodes: string[];
}

/** `OptionAvailabilityResult`. */
export interface OptionAvailability {
  optionId: string;
  active: boolean;
  selectable: boolean;
  available: boolean;
  availableQuantity: number | null;
  priceDelta: number | string | null;
  reasonCodes: string[];
}

/** `OptionGroupAvailabilityResult`. */
export interface OptionGroupAvailability {
  groupId: string;
  groupName: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  required: boolean;
  minimumSelections: number;
  maximumSelections: number | null;
  atLeastOneValidSelection: boolean;
  values: OptionAvailability[];
}

/** `ProductAvailabilityResult`. A verdict, not a boolean — never collapse it. */
export interface AvailabilityPreview {
  productId: string;
  storeId: string;
  active: boolean;
  listed: boolean;
  orderable: boolean;
  inStock: boolean;
  manualState: 'AUTO' | 'MANUAL_AVAILABLE' | 'MANUAL_SOLD_OUT';
  availableBaseServings: number | null;
  reasonCodes: string[];
  variants: VariantAvailability[];
  optionGroups: OptionGroupAvailability[];
  calculatedAt: string;
  availabilityFingerprint: string;
}

export interface AvailabilityQuery {
  variantId?: string;
  includeOptions?: boolean;
  quantity?: number;
}

// ─── Recipes (Round 2 §13; mirrors the Slice 2A/2B recipe module) ───────────

/**
 * `RecipeStatus`. RETIRED is gone from the enum (V042 normalized it to
 * ARCHIVED), so the editor has exactly these four lifecycle states.
 */
export const RECIPE_STATUSES = ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED'] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

/** `RecipeScalingRule` — per produced unit, or whole-batch divided by yield. */
export const RECIPE_SCALING_RULES = ['FIXED', 'PROPORTIONAL_TO_YIELD'] as const;
export type RecipeScalingRule = (typeof RECIPE_SCALING_RULES)[number];

/** `RecipeLineResponse`. `quantityRequiredBase` is in the ingredient base unit. */
export interface RecipeLine {
  lineId: string;
  ingredientId: string;
  quantityRequiredBase: number | string;
  wastagePercent: number | string;
  unitId: string | null;
  scalingRule: RecipeScalingRule;
  displayOrder: number;
  optional: boolean;
  notes: string | null;
}

/** `RecipeVersionResponse` — one version header plus its ordered lines. */
export interface RecipeVersion {
  recipeVersionId: string;
  productId: string;
  versionNumber: number;
  status: RecipeStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  yieldQuantity: number | string | null;
  yieldUnitId: string | null;
  notes: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  lines: RecipeLine[];
}

/** `ResolvedRecipeResponse` — which rule fired and the version behind it. */
export interface ResolvedRecipe {
  productId: string;
  variantId: string | null;
  source: 'VARIANT' | 'PRODUCT' | 'NONE';
  recipeVersion: RecipeVersion | null;
}

/** `ProductRecipeResponse` — product fallback assignment state after a write. */
export interface ProductRecipeAssignment {
  productId: string;
  activeRecipeVersionId: string | null;
  version: number;
}

/** `VariantRecipeResponse` — variant override state after a write. */
export interface VariantRecipeAssignment {
  variantId: string;
  productId: string;
  activeRecipeVersionId: string | null;
  version: number;
}

/** `RecipeItemRequest` — one complete line in a replace-items payload. */
export interface RecipeItemInput {
  ingredientId: string;
  quantityRequiredBase: number;
  wastagePercent?: number | null;
  unitId?: string | null;
  scalingRule?: RecipeScalingRule | null;
  displayOrder: number;
  optional?: boolean;
  notes?: string | null;
}

/** `CreateRecipeDraftRequest` — the version number is reserved server-side. */
export interface CreateRecipeDraftInput {
  yieldQuantity?: number | null;
  yieldUnitId?: string | null;
  notes?: string | null;
  items?: RecipeItemInput[];
}

/** `UpdateRecipeDraftRequest` — DRAFT header only; immutable versions refuse. */
export interface UpdateRecipeDraftInput {
  expectedVersion: number;
  yieldQuantity?: number | null;
  yieldUnitId?: string | null;
  notes?: string | null;
}

/** `ReplaceRecipeItemsRequest` — the list is authoritative (clone-on-modify). */
export interface ReplaceRecipeItemsInput {
  expectedVersion: number;
  items: RecipeItemInput[];
}

/** `AssignProductRecipeRequest` — null id clears the product fallback. */
export interface AssignProductRecipeInput {
  recipeVersionId: string | null;
  expectedProductVersion: number;
}

/** `AssignVariantRecipeRequest` — must reference an ACTIVE version of the same product. */
export interface AssignVariantRecipeInput {
  recipeVersionId: string | null;
  expectedVariantVersion: number;
}

// ─── Consumption-plan preview (Round 2 §14; read-only, server-computed) ─────

/**
 * `SelectedCustomizationRequest` — the cart's selection shape, reused so
 * planning and checkout agree on what a customization means.
 */
export interface SelectedCustomizationInput {
  groupId: string;
  optionId: string;
  quantity: number;
}

/** `ConsumptionPlanPreviewRequest` — never carries ingredient ids or effects. */
export interface ConsumptionPlanPreviewInput {
  productId: string;
  variantId?: string | null;
  productQuantity: number;
  selectedOptions?: SelectedCustomizationInput[];
}

/** `ConsumptionPlanLineResponse`. */
export interface ConsumptionPlanLine {
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  quantity: number | string;
  baseUnitCode: string;
  /** ConsumptionLineSource: BASE_RECIPE | OPTION_* | MERGED provenance tag. */
  source: string;
  appliedOptionIds: string[];
  displayOrder: number;
  optional: boolean;
}

/** `ConsumptionPlanPreviewResponse`. */
export interface ConsumptionPlanPreview {
  productId: string;
  variantId: string | null;
  recipeVersionId: string | null;
  recipeVersionNumber: number | null;
  resolutionSource: 'VARIANT' | 'PRODUCT' | 'NONE';
  requestedProductQuantity: number | string;
  resolvedAt: string;
  lines: ConsumptionPlanLine[];
  warnings: string[];
}

// ─── API clients ────────────────────────────────────────────────────────────

const MGMT = '/api/v1/management/catalog';

/**
 * Product/customization-group attachment (§5/§6, Round 2). `configure` is a
 * full-replace PUT: it attaches when the pair is new and reconfigures the
 * existing attachment otherwise, and the server diffs the option allow-list
 * instead of delete-reinsert. `detach` removes only the relationship — master
 * group, options and historical snapshots survive.
 */
export const productCustomizationApi = {
  groups: (productId: string, signal?: AbortSignal) =>
    api.get<ProductCustomizationGroupsResponse>(`${MGMT}/products/${productId}/customization-groups`, { signal }),

  configure: (productId: string, groupId: string, input: ConfigureCustomizationGroupInput) =>
    api.put<ProductCustomizationGroupsResponse>(
      `${MGMT}/products/${productId}/customization-groups/${groupId}`,
      input,
    ),

  /** Query-param token, matching the DELETE contract exactly. */
  detach: (productId: string, groupId: string, expectedProductVersion: number) =>
    api.delete<ProductCustomizationGroupsResponse>(
      `${MGMT}/products/${productId}/customization-groups/${groupId}`,
      { query: { expectedProductVersion } },
    ),
};

/**
 * Master customization group/option management (Round 2 §7). Same
 * `product:manage` gate as the attachment surface; version tokens live in the
 * request BODY for updates and activate/deactivate flips are idempotent
 * version-less PUTs, mirroring the variant surface conventions.
 */
export const customizationMasterApi = {
  list: (signal?: AbortSignal) =>
    api.get<CustomizationGroupMaster[]>(`${MGMT}/customization-groups`, { signal }),

  createGroup: (input: CreateCustomizationGroupInput) =>
    api.post<CustomizationGroupMaster>(`${MGMT}/customization-groups`, input),

  updateGroup: (groupId: string, input: UpdateCustomizationGroupInput) =>
    api.patch<CustomizationGroupMaster>(`${MGMT}/customization-groups/${groupId}`, input),

  activateGroup: (groupId: string) =>
    api.put<CustomizationGroupMaster>(`${MGMT}/customization-groups/${groupId}/activate`),

  deactivateGroup: (groupId: string) =>
    api.put<CustomizationGroupMaster>(`${MGMT}/customization-groups/${groupId}/deactivate`),

  createOption: (groupId: string, input: CreateCustomizationOptionInput) =>
    api.post<CustomizationOptionMaster>(`${MGMT}/customization-groups/${groupId}/options`, input),

  /** Complete id list, displayOrder = index — same contract as variant reorder. */
  reorderOptions: (groupId: string, optionIds: string[]) =>
    api.post<CustomizationOptionMaster[]>(`${MGMT}/customization-groups/${groupId}/options/reorder`, { optionIds }),

  updateOption: (optionId: string, input: UpdateCustomizationOptionInput) =>
    api.patch<CustomizationOptionMaster>(`${MGMT}/customization-options/${optionId}`, input),

  activateOption: (optionId: string) =>
    api.put<CustomizationOptionMaster>(`${MGMT}/customization-options/${optionId}/activate`),

  deactivateOption: (optionId: string) =>
    api.put<CustomizationOptionMaster>(`${MGMT}/customization-options/${optionId}/deactivate`),
};

/**
 * Option inventory effect upsert/clear (§8's existing route). The lock token
 * is the OPTION's own version, passed as a query parameter; omitting it skips
 * the optimistic check but never the shape guard, which the server enforces
 * per effect type — the client mirrors those rules only as advisory copy.
 */
export const optionEffectApi = {
  set: (optionId: string, input: SetInventoryEffectInput, version?: number | null) =>
    api.put<InventoryEffect>(`${MGMT}/customization-options/${optionId}/inventory-effect`, input, {
      query: { version: version ?? '' },
    }),

  clear: (optionId: string, version?: number | null) =>
    api.delete<InventoryEffect>(`${MGMT}/customization-options/${optionId}/inventory-effect`, {
      query: { version: version ?? '' },
    }),
};

/**
 * Recipe version lifecycle and assignments (Round 2 §13). Cloning an ACTIVE
 * version into a draft is composed client-side from GET + create (the backend
 * deliberately offers no clone endpoint), and activate/archive echo the
 * version token as a query parameter.
 */
export const recipeApi = {
  listForProduct: (productId: string, signal?: AbortSignal) =>
    api.get<RecipeVersion[]>(`${MGMT}/products/${productId}/recipes`, { signal }),

  createDraft: (productId: string, input: CreateRecipeDraftInput) =>
    api.post<RecipeVersion>(`${MGMT}/products/${productId}/recipes`, input),

  resolveProduct: (productId: string, signal?: AbortSignal) =>
    api.get<ResolvedRecipe>(`${MGMT}/products/${productId}/recipes/resolve`, { signal }),

  resolveVariant: (productId: string, variantId: string, signal?: AbortSignal) =>
    api.get<ResolvedRecipe>(`${MGMT}/products/${productId}/variants/${variantId}/recipe/resolve`, { signal }),

  get: (recipeVersionId: string, signal?: AbortSignal) =>
    api.get<RecipeVersion>(`${MGMT}/recipes/${recipeVersionId}`, { signal }),

  updateDraft: (recipeVersionId: string, input: UpdateRecipeDraftInput) =>
    api.patch<RecipeVersion>(`${MGMT}/recipes/${recipeVersionId}`, input),

  replaceItems: (recipeVersionId: string, input: ReplaceRecipeItemsInput) =>
    api.put<RecipeVersion>(`${MGMT}/recipes/${recipeVersionId}/items`, input),

  activate: (recipeVersionId: string, expectedVersion: number) =>
    api.post<RecipeVersion>(`${MGMT}/recipes/${recipeVersionId}/activate`, undefined, {
      query: { expectedVersion },
    }),

  archive: (recipeVersionId: string, expectedVersion: number) =>
    api.post<RecipeVersion>(`${MGMT}/recipes/${recipeVersionId}/archive`, undefined, {
      query: { expectedVersion },
    }),

  assignProduct: (productId: string, input: AssignProductRecipeInput) =>
    api.put<ProductRecipeAssignment>(`${MGMT}/products/${productId}/recipe`, input),

  assignVariant: (variantId: string, input: AssignVariantRecipeInput) =>
    api.put<VariantRecipeAssignment>(`${MGMT}/variants/${variantId}/recipe`, input),
};

/**
 * Read-only consumption-plan preview (§14). Deterministic server computation;
 * the frontend never derives authoritative consumption from it — this response
 * is display, never a write model.
 */
export const consumptionPlanApi = {
  preview: (input: ConsumptionPlanPreviewInput) =>
    api.post<ConsumptionPlanPreview>(`${MGMT}/consumption-plans/preview`, input),
};

export const productVariantsApi = {
  list: (productId: string, signal?: AbortSignal) =>
    api.get<ProductVariant[]>(`${MGMT}/products/${productId}/variants`, { signal }),

  get: (variantId: string, signal?: AbortSignal) =>
    api.get<ProductVariant>(`${MGMT}/variants/${variantId}`, { signal }),

  create: (productId: string, input: CreateVariantInput) =>
    api.post<ProductVariant>(`${MGMT}/products/${productId}/variants`, input),

  update: (variantId: string, input: UpdateVariantInput) =>
    api.patch<ProductVariant>(`${MGMT}/variants/${variantId}`, input),

  /** No lock token on this route; the command is idempotent per variant id. */
  remove: (variantId: string) => api.delete<void>(`${MGMT}/variants/${variantId}`),

  reorder: (productId: string, variantIds: string[]) =>
    api.post<ProductVariant[]>(`${MGMT}/products/${productId}/variants/reorder`, { variantIds }),

  activate: (variantId: string) => api.put<ProductVariant>(`${MGMT}/variants/${variantId}/activate`),

  deactivate: (variantId: string) => api.put<ProductVariant>(`${MGMT}/variants/${variantId}/deactivate`),

  setDefault: (variantId: string) => api.put<ProductVariant>(`${MGMT}/variants/${variantId}/set-default`),
};

export const productChannelsApi = {
  list: (storeId: string, productId: string, signal?: AbortSignal) =>
    api.get<ChannelPolicy[]>(`${MGMT}/stores/${storeId}/products/${productId}/channels`, { signal }),

  upsert: (storeId: string, productId: string, channel: ChannelName, input: ChannelConfigInput) =>
    api.put<ChannelPolicy>(`${MGMT}/stores/${storeId}/products/${productId}/channels/${channel}`, input),

  /** Reverts the channel to the inherited default; no body, no version token. */
  remove: (storeId: string, productId: string, channel: ChannelName) =>
    api.delete<void>(`${MGMT}/stores/${storeId}/products/${productId}/channels/${channel}`),

  schedules: (storeId: string, productId: string, channel: ChannelName, signal?: AbortSignal) =>
    api.get<ChannelScheduleWindow[]>(
      `${MGMT}/stores/${storeId}/products/${productId}/channels/${channel}/schedules`,
      { signal },
    ),

  /** The list is authoritative: omitted windows are deleted. */
  replaceSchedules: (
    storeId: string,
    productId: string,
    channel: ChannelName,
    schedules: ChannelScheduleWindow[],
    expectedVersion: number | null,
  ) =>
    api.put<ChannelScheduleWindow[]>(
      `${MGMT}/stores/${storeId}/products/${productId}/channels/${channel}/schedules`,
      { schedules, expectedVersion },
    ),

  preview: (storeId: string, productId: string, channel: ChannelName, signal?: AbortSignal) =>
    api.get<Record<string, unknown>>(
      `${MGMT}/stores/${storeId}/products/${productId}/channels/${channel}/preview`,
      { signal },
    ),

  setSoldOut: (storeId: string, productId: string, input: ManualSoldOutInput) =>
    api.patch<void>(`${MGMT}/stores/${storeId}/products/${productId}/sold-out`, input),
};

export const availabilityApi = {
  preview: (storeId: string, productId: string, query: AvailabilityQuery = {}, signal?: AbortSignal) =>
    api.get<AvailabilityPreview>(`${MGMT}/stores/${storeId}/products/${productId}/availability`, {
      query: {
        variantId: query.variantId ?? '',
        includeOptions: query.includeOptions ?? true,
        quantity: query.quantity ?? 1,
      },
      signal,
    }),
};
