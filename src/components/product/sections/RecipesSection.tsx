/**
 * Round 2 "Recipes" tab (Slice 4A §13). A recipe is an immutable-versioned
 * production plan owned by the recipe module (Slice 2A/2B); this editor is a thin
 * Dashboard surface over those routes and never re-implements the aggregate.
 *
 * Lifecycle rules rendered straight from the backend contract:
 *  - only a DRAFT is editable — ACTIVE / SUPERSEDED / ARCHIVED are read-only, and
 *    a write against one is refused with RECIPE_VERSION_IMMUTABLE;
 *  - an empty DRAFT cannot be activated (the guard exists server-side; the button
 *    is disabled locally too, so the operator sees why before clicking);
 *  - cloning is composed client-side (GET the source lines → POST a new draft):
 *    there is deliberately no clone endpoint and no invented "duplicate" call;
 *  - activate / archive echo the version token as a query parameter, and any
 *    successful write REPLACES the local token with the one the server returned.
 *
 * Consumption is never computed here; quantities are entered and validated by the
 * service, and the Inventory tab shows the server's read-only plan.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { ApiError } from '../../../lib/api';
import {
  ProductVariant, RecipeItemInput, RecipeLine, RecipeVersion, productVariantsApi, recipeApi,
} from '../../../lib/productEditor';
import { IngredientRow, ingredientsAdminApi } from '../../../lib/inventoryMgmtAdmin';
import {
  buildReplaceItems, canActivateRecipe, cloneActiveToDraft, editorErrorKey, isRecipeDraft, reorderRecipeLines,
} from '../../../lib/productEditorState';
import { Banner, CONTROL_CLASS, Field, SectionCard, StaticValue, Toggle } from '../EditorPrimitives';

export interface RecipesSectionProps {
  productId: string;
  productVersion: number;
  canWrite: boolean;
}

const errOf = (err: unknown): { code?: string; status: number } =>
  err instanceof ApiError ? { code: err.code, status: err.status } : { status: -1 };

export const RecipesSection: React.FC<RecipesSectionProps> = ({ productId, productVersion, canWrite }) => {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [fallbackId, setFallbackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The version currently open for editing (only ever a DRAFT) plus its lines.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<RecipeLine[]>([]);
  const [editYield, setEditYield] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const ingredientName = useCallback(
    (id: string) => ingredients.find((i) => i.ingredientId === id)?.name ?? id.slice(0, 8),
    [ingredients],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, vs, ing, resolved] = await Promise.all([
        recipeApi.listForProduct(productId),
        productVariantsApi.list(productId).catch(() => [] as ProductVariant[]),
        ingredientsAdminApi.list({ size: 200 }).then((p) => p.items).catch(() => [] as IngredientRow[]),
        recipeApi.resolveProduct(productId).catch(() => null),
      ]);
      setVersions(list);
      setVariants(vs);
      setIngredients(ing);
      setFallbackId(resolved?.recipeVersion?.recipeVersionId ?? null);
    } catch (err) {
      const e = errOf(err);
      setLoadError(editorErrorKey(e.code, e.status));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const activeVersions = useMemo(() => versions.filter((v) => v.status === 'ACTIVE'), [versions]);
  const editing = useMemo(() => versions.find((v) => v.recipeVersionId === editingId) ?? null, [versions, editingId]);

  const notify = (key: string) => setNotice(t(key));

  const guard = useCallback(async (fn: () => Promise<unknown>, okKey: string): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      notify(okKey);
      await load();
      return true;
    } catch (err) {
      const e = errOf(err);
      setNotice(t(editorErrorKey(e.code, e.status)));
      return false;
    } finally {
      setBusy(false);
    }
  }, [load, t]);

  const openDraft = (v: RecipeVersion) => {
    setEditingId(v.recipeVersionId);
    setEditLines(v.lines);
    setEditYield(v.yieldQuantity === null || v.yieldQuantity === undefined ? '' : String(v.yieldQuantity));
    setEditNotes(v.notes ?? '');
  };

  const createDraft = () => void guard(() => recipeApi.createDraft(productId, { items: [] }), 'productEditor.recipes.createdMsg');

  const cloneToDraft = (v: RecipeVersion) => void guard(
    () => recipeApi.createDraft(productId, cloneActiveToDraft(v)),
    'productEditor.recipes.clonedMsg',
  );

  const saveDraft = () => {
    if (!editing) return;
    const items: RecipeItemInput[] = editLines.map((l, i) => ({
      ingredientId: l.ingredientId,
      quantityRequiredBase: Number(l.quantityRequiredBase) || 0,
      wastagePercent: l.wastagePercent === null || l.wastagePercent === undefined ? null : Number(l.wastagePercent),
      unitId: l.unitId,
      scalingRule: l.scalingRule,
      displayOrder: i,
      optional: l.optional,
      notes: l.notes,
    }));
    void guard(async () => {
      // Header first (its version token advances), then the lines against the
      // fresh token the header write returned.
      const header = await recipeApi.updateDraft(editing.recipeVersionId, {
        expectedVersion: editing.version,
        yieldQuantity: editYield.trim() === '' ? null : Number(editYield),
        yieldUnitId: editing.yieldUnitId,
        notes: editNotes.trim() || null,
      });
      return recipeApi.replaceItems(editing.recipeVersionId, buildReplaceItems(header.version, editLines));
    }, 'productEditor.recipes.savedMsg');
  };

  const activate = (v: RecipeVersion) => void guard(() => recipeApi.activate(v.recipeVersionId, v.version), 'productEditor.recipes.activatedMsg');
  const archive = (v: RecipeVersion) => void guard(() => recipeApi.archive(v.recipeVersionId, v.version), 'productEditor.recipes.archivedMsg');

  const assignProduct = (v: RecipeVersion) => void guard(
    () => recipeApi.assignProduct(productId, { recipeVersionId: v.recipeVersionId, expectedProductVersion: productVersion }),
    'productEditor.recipes.assignedMsg',
  );
  const clearProduct = () => void guard(
    () => recipeApi.assignProduct(productId, { recipeVersionId: null, expectedProductVersion: productVersion }),
    'productEditor.recipes.clearedMsg',
  );

  const addLine = () => setEditLines((ls) => [
    ...ls,
    { lineId: '', ingredientId: '', quantityRequiredBase: 1, wastagePercent: 0, unitId: null, scalingRule: 'FIXED', displayOrder: ls.length, optional: false, notes: null },
  ]);
  const patchLine = (i: number, next: Partial<RecipeLine>) =>
    setEditLines((ls) => ls.map((l, li) => (li === i ? { ...l, ...next } : l)));
  const removeLine = (i: number) => setEditLines((ls) => ls.filter((_, li) => li !== i));
  const moveLine = (from: number, to: number) => setEditLines((ls) => reorderRecipeLines(ls, from, to));

  if (loading && versions.length === 0) {
    return (
      <SectionCard title={t('productEditor.recipes.title')} description={t('productEditor.recipes.description')}>
        <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t('productEditor.recipes.title')}
      description={t('productEditor.recipes.description')}
      actions={
        <>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('common.refresh')}
          </button>
          {canWrite && (
            <button type="button" onClick={createDraft} disabled={busy}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
              <Plus className="w-4 h-4" aria-hidden="true" /> {t('productEditor.recipes.create')}
            </button>
          )}
        </>
      }
    >
      {!canWrite && <Banner tone="info" text={t('productEditor.recipes.readOnly')} />}
      {loadError && <Banner tone="bad" role="alert" text={t(loadError)} dismissLabel={t('common.close')} onDismiss={() => setLoadError(null)} />}
      {notice && <Banner tone="info" role="status" text={notice} dismissLabel={t('common.close')} onDismiss={() => setNotice(null)} />}

      <StaticValue label={t('productEditor.recipes.fallback')}
        value={(() => {
          const fb = fallbackId ? versions.find((v) => v.recipeVersionId === fallbackId) : null;
          return fb ? `v${fb.versionNumber}` : t('productEditor.recipes.noFallback');
        })()}
        hint={t('productEditor.recipes.fallbackHint')} />

      {versions.length === 0 && !loading && (
        <p className="rounded-xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-6 text-center text-xs text-[#6E5E4F]">
          {t('productEditor.recipes.empty')}
        </p>
      )}

      {versions.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522]">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{t('productEditor.recipes.caption')}</caption>
            <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] uppercase text-[10px] tracking-wide">
              <tr>
                <th scope="col" className="py-3 px-3">{t('productEditor.recipes.colVersion')}</th>
                <th scope="col" className="py-3 px-3">{t('productEditor.recipes.colStatus')}</th>
                <th scope="col" className="py-3 px-3 text-right">{t('productEditor.recipes.colYield')}</th>
                <th scope="col" className="py-3 px-3 text-right">{t('productEditor.recipes.colLines')}</th>
                <th scope="col" className="py-3 px-3">{t('productEditor.recipes.colUpdated')}</th>
                <th scope="col" className="py-3 px-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
              {versions.map((v) => (
                <tr key={v.recipeVersionId}>
                  <td className="py-2 px-3 font-mono text-[#1C1A19] dark:text-[#F5F3F0]">v{v.versionNumber}</td>
                  <td className="py-2 px-3">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${v.status === 'ACTIVE' ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : v.status === 'DRAFT' ? 'bg-[#C48A56]/15 text-[#8A5A2B] dark:text-[#D4A87A]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                      {t(`productEditor.recipes.status.${v.status}`)}
                    </span>
                    {fallbackId === v.recipeVersionId && <span className="ml-2 text-[10px] text-[#6E5E4F]">{t('productEditor.recipes.fallbackTag')}</span>}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">{v.yieldQuantity ?? '—'}</td>
                  <td className="py-2 px-3 text-right font-mono">{v.lines.length}</td>
                  <td className="py-2 px-3 text-[#6E5E4F]">{v.updatedAt}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-end flex-wrap gap-1">
                      {isRecipeDraft(v) ? (
                        <button type="button" disabled={busy} onClick={() => openDraft(v)}
                          className="px-2 py-1 rounded-lg bg-[#C48A56]/10 text-[#8A5A2B] dark:text-[#D4A87A] text-[11px] font-bold disabled:opacity-50">{t('productEditor.recipes.edit')}</button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => openDraft(v)}
                          className="px-2 py-1 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] text-[11px] font-semibold disabled:opacity-50">{t('productEditor.recipes.view')}</button>
                      )}
                      {canWrite && isRecipeDraft(v) && (
                        <button type="button" disabled={busy || !canActivateRecipe(v)} title={!canActivateRecipe(v) ? t('productEditor.recipes.needsLines') : undefined}
                          onClick={() => activate(v)}
                          className="px-2 py-1 rounded-lg bg-[#2E7D32]/15 text-[#2E7D32] text-[11px] font-bold disabled:opacity-50">{t('productEditor.recipes.activate')}</button>
                      )}
                      {canWrite && v.status !== 'DRAFT' && (
                        <button type="button" disabled={busy} onClick={() => cloneToDraft(v)} title={t('productEditor.recipes.cloneHint')}
                          className="p-1.5 rounded-lg hover:bg-[#C48A56]/10 disabled:opacity-50" aria-label={t('productEditor.recipes.clone')}>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {canWrite && v.status === 'ACTIVE' && fallbackId !== v.recipeVersionId && (
                        <button type="button" disabled={busy} onClick={() => assignProduct(v)}
                          className="px-2 py-1 rounded-lg bg-[#C48A56]/10 text-[#8A5A2B] dark:text-[#D4A87A] text-[11px] font-bold disabled:opacity-50">{t('productEditor.recipes.assignProduct')}</button>
                      )}
                      {canWrite && v.status === 'DRAFT' && (
                        <button type="button" disabled={busy} onClick={() => archive(v)}
                          className="px-2 py-1 rounded-lg text-[#DC2626] hover:bg-[#DC2626]/10 text-[11px] font-bold disabled:opacity-50">{t('productEditor.recipes.archive')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && activeVersions.length > 0 && variants.length > 0 && (
        <VariantOverrides variants={variants} activeVersions={activeVersions} busy={busy} guard={guard} ingredientlessName={(id) => ingredientName(id)} />
      )}

      {editing && (
        <RecipeEditor
          version={editing} canWrite={canWrite && isRecipeDraft(editing)} busy={busy}
          lines={editLines} yieldValue={editYield} notes={editNotes} ingredients={ingredients}
          onYield={setEditYield} onNotes={setEditNotes}
          onAddLine={addLine} onPatchLine={patchLine} onRemoveLine={removeLine} onMoveLine={moveLine}
          onSave={editing.status === 'DRAFT' ? saveDraft : undefined}
          onClose={() => setEditingId(null)}
          ingredientName={ingredientName}
        />
      )}
    </SectionCard>
  );
};

/* --------------------------------------------------------------- variant overrides */

const VariantOverrides: React.FC<{
  variants: ProductVariant[];
  activeVersions: RecipeVersion[];
  busy: boolean;
  guard: (fn: () => Promise<unknown>, okKey: string) => Promise<boolean>;
  ingredientlessName: (id: string) => string;
}> = ({ variants, activeVersions, busy, guard }) => {
  const { t } = useTranslation();
  const [variantId, setVariantId] = useState('');
  const [recipeId, setRecipeId] = useState(activeVersions[0]?.recipeVersionId ?? '');
  const selected = variants.find((v) => v.variantId === variantId) ?? null;

  if (activeVersions.length === 0) return null;
  return (
    <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] p-4 space-y-3">
      <h5 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('productEditor.recipes.overridesTitle')}</h5>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('productEditor.recipes.variant')}>
          {({ id }) => (
            <select id={id} value={variantId} onChange={(e) => setVariantId(e.target.value)} className={CONTROL_CLASS}>
              <option value="">{t('productEditor.recipes.variantNone')}</option>
              {variants.map((v) => <option key={v.variantId} value={v.variantId}>{v.name}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('productEditor.recipes.activeVersion')}>
          {({ id }) => (
            <select id={id} value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={CONTROL_CLASS}>
              {activeVersions.map((v) => <option key={v.recipeVersionId} value={v.recipeVersionId}>v{v.versionNumber}</option>)}
            </select>
          )}
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" disabled={busy || !selected}
          onClick={() => selected && void guard(() => recipeApi.assignVariant(selected.variantId, { recipeVersionId: null, expectedVariantVersion: selected.version }), 'productEditor.recipes.overrideCleared')}
          className="px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold disabled:opacity-50">{t('productEditor.recipes.removeOverride')}</button>
        <button type="button" disabled={busy || !selected || !recipeId}
          onClick={() => selected && void guard(() => recipeApi.assignVariant(selected.variantId, { recipeVersionId: recipeId, expectedVariantVersion: selected.version }), 'productEditor.recipes.overrideAssigned')}
          className="px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50">{t('productEditor.recipes.assignVariant')}</button>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- draft editor */

interface RecipeEditorProps {
  version: RecipeVersion;
  canWrite: boolean;
  busy: boolean;
  lines: RecipeLine[];
  yieldValue: string;
  notes: string;
  ingredients: IngredientRow[];
  onYield: (v: string) => void;
  onNotes: (v: string) => void;
  onAddLine: () => void;
  onPatchLine: (i: number, next: Partial<RecipeLine>) => void;
  onRemoveLine: (i: number) => void;
  onMoveLine: (from: number, to: number) => void;
  onSave?: () => void;
  onClose: () => void;
  ingredientName: (id: string) => string;
}

const RecipeEditor: React.FC<RecipeEditorProps> = ({
  version, canWrite, busy, lines, yieldValue, notes, ingredients,
  onYield, onNotes, onAddLine, onPatchLine, onRemoveLine, onMoveLine, onSave, onClose,
}) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FAF8F5] dark:bg-[#26221F] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
          {canWrite ? t('productEditor.recipes.editTitle') : t('productEditor.recipes.readOnlyTitle')} · v{version.versionNumber}
        </h5>
        <button type="button" onClick={onClose} className="text-[11px] font-bold text-[#8C7C6B] hover:underline">{t('common.close')}</button>
      </div>

      {!canWrite && <Banner tone="info" text={t('productEditor.recipes.immutableNote')} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('productEditor.recipes.yieldQty')} error={undefined}>
          {({ id }) => (
            <input id={id} type="text" inputMode="decimal" value={yieldValue} disabled={!canWrite || busy}
              onChange={(e) => onYield(e.target.value)} className={CONTROL_CLASS} />
          )}
        </Field>
        <Field label={t('productEditor.recipes.notes')}>
          {({ id }) => (
            <textarea id={id} rows={2} value={notes} disabled={!canWrite || busy}
              onChange={(e) => onNotes(e.target.value)} className={CONTROL_CLASS} />
          )}
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('productEditor.recipes.lines')}</span>
          {canWrite && (
            <button type="button" onClick={onAddLine} disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-[#C48A56]/10 px-2 py-1 text-[11px] font-bold text-[#8A5A2B] dark:text-[#D4A87A] disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t('productEditor.recipes.addLine')}
            </button>
          )}
        </div>

        {lines.length === 0 && <p className="text-[11px] text-[#6E5E4F]">{t('productEditor.recipes.noLines')}</p>}

        <ul className="space-y-2">
          {lines.map((l, i) => (
            <li key={`${l.ingredientId}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
              {canWrite && (
                <span className="flex items-center gap-0.5">
                  <button type="button" disabled={i === 0 || busy} onClick={() => onMoveLine(i, i - 1)} aria-label={t('productEditor.recipes.moveUp')} className="p-1 rounded hover:bg-[#C48A56]/10 disabled:opacity-30"><ArrowUp className="w-3 h-3" aria-hidden="true" /></button>
                  <button type="button" disabled={i === lines.length - 1 || busy} onClick={() => onMoveLine(i, i + 1)} aria-label={t('productEditor.recipes.moveDown')} className="p-1 rounded hover:bg-[#C48A56]/10 disabled:opacity-30"><ArrowDown className="w-3 h-3" aria-hidden="true" /></button>
                </span>
              )}
              {canWrite ? (
                <select value={l.ingredientId} disabled={busy} onChange={(e) => onPatchLine(i, { ingredientId: e.target.value })}
                  className="w-44 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2 py-1 text-xs">
                  <option value="">{t('productEditor.recipes.pickIngredient')}</option>
                  {ingredients.map((ing) => <option key={ing.ingredientId} value={ing.ingredientId}>{ing.name}</option>)}
                </select>
              ) : (
                <span className="w-44 font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{l.ingredientId ? l.ingredientId.slice(0, 8) : '—'}</span>
              )}
              <label className="flex items-center gap-1">
                <span className="text-[10px] text-[#8C7C6B]">{t('productEditor.recipes.colYield')}</span>
                <input type="text" inputMode="decimal" disabled={!canWrite || busy} value={String(l.quantityRequiredBase)}
                  onChange={(e) => onPatchLine(i, { quantityRequiredBase: Number(e.target.value) || 0 })}
                  className="w-20 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] px-2 py-1 text-xs" />
              </label>
              <select value={l.scalingRule} disabled={!canWrite || busy} onChange={(e) => onPatchLine(i, { scalingRule: e.target.value as RecipeLine['scalingRule'] })}
                className="rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2 py-1 text-xs">
                <option value="FIXED">{t('productEditor.recipes.scaling.FIXED')}</option>
                <option value="PROPORTIONAL_TO_YIELD">{t('productEditor.recipes.scaling.PROPORTIONAL_TO_YIELD')}</option>
              </select>
              {canWrite && (
                <button type="button" disabled={busy} onClick={() => onRemoveLine(i)} aria-label={t('productEditor.recipes.removeLine')} className="p-1 rounded text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-30">
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {onSave && (
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
          <button type="button" onClick={onSave} disabled={busy || lines.some((l) => !l.ingredientId)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />} {t('common.save')}
          </button>
        </div>
      )}
    </div>
  );
};
