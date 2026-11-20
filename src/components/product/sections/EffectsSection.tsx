/**
 * Round 2 "Inventory Effect" editor (Slice 4A §12). Its own tab so an operator
 * can focus on how a chosen option moves stock, without the attachment editing
 * of the Options tab crowding it in.
 *
 * What the frontend owns here is SHAPE and explanation only. The per-type rules
 * (which fields apply, that a MULTIPLY needs a non-negative multiplier, that a
 * REPLACE needs two different ingredients) are mirrored client-side purely as
 * ADVISORY copy so the operator sees the problem before a 400; the management
 * service and the `ck_option_effect_shape` constraint remain the authority. The
 * consumption a preview would report is computed by the server — this component
 * never multiplies or sums ingredient quantities itself (spec §12: "Do not
 * calculate authoritative consumption in the frontend").
 *
 * A customization option is a MASTER row shared by every product, so editing its
 * effect is a master-level change; that is stated to the operator, and the option
 *'s own optimistic-lock version is echoed back on the write.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { ApiError } from '../../../lib/api';
import {
  CustomizationOptionView, InventoryEffect, optionEffectApi, productCustomizationApi,
} from '../../../lib/productEditor';
import { IngredientRow, ingredientsAdminApi } from '../../../lib/inventoryMgmtAdmin';
import {
  EffectDraft, buildEffectPayload, editorErrorKey, effectDraftFrom, effectShowsMultiplier,
  effectShowsQuantity, effectShowsSource, effectShowsTarget, validateEffectDraft,
} from '../../../lib/productEditorState';
import { Banner, CONTROL_CLASS, Field, SectionCard } from '../EditorPrimitives';

export interface EffectsSectionProps {
  productId: string;
  canWrite: boolean;
}

const errOf = (err: unknown): { code?: string; status: number } =>
  err instanceof ApiError ? { code: err.code, status: err.status } : { status: -1 };

export const EffectsSection: React.FC<EffectsSectionProps> = ({ productId, canWrite }) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<CustomizationOptionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<EffectDraft>(effectDraftFrom(null));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await productCustomizationApi.groups(productId);
      const flat = res.groups.flatMap((g) => g.allowedOptions.map((o) => ({ ...o, groupName: g.groupName })));
      setOptions(flat);
    } catch (err) {
      const e = errOf(err);
      setLoadError(editorErrorKey(e.code, e.status));
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => options.find((o) => o.optionId === selectedId) ?? null, [options, selectedId]);

  // (Re)seed the draft whenever the chosen option changes, from its stored effect.
  useEffect(() => {
    setDraft(effectDraftFrom(selected ? (selected.inventoryEffect as InventoryEffect | null) : null));
    setNotice(null);
  }, [selectedId, selected]);

  const errors = validateEffectDraft(draft);

  const save = useCallback(async () => {
    if (!selected) return;
    const payload = buildEffectPayload(draft);
    if (!payload) return;
    setBusy(true);
    setNotice(null);
    try {
      await optionEffectApi.set(selected.optionId, payload, selected.version);
      setNotice(t('productEditor.effects.savedMsg'));
      await load();
    } catch (err) {
      const e = errOf(err);
      setNotice(t(editorErrorKey(e.code, e.status)));
    } finally {
      setBusy(false);
    }
  }, [draft, load, notice, selected, t]);

  const clear = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      await optionEffectApi.clear(selected.optionId, selected.version);
      setNotice(t('productEditor.effects.clearedMsg'));
      await load();
    } catch (err) {
      const e = errOf(err);
      setNotice(t(editorErrorKey(e.code, e.status)));
    } finally {
      setBusy(false);
    }
  }, [load, notice, selected, t]);

  if (loading && options.length === 0) {
    return (
      <SectionCard title={t('productEditor.effects.title')} description={t('productEditor.effects.description')}>
        <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t('productEditor.effects.title')}
      description={t('productEditor.effects.description')}
      actions={
        <button type="button" onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('common.refresh')}
        </button>
      }
    >
      {!canWrite && <Banner tone="info" text={t('productEditor.effects.readOnly')} />}
      {loadError && <Banner tone="bad" role="alert" text={t(loadError)} dismissLabel={t('common.close')} onDismiss={() => setLoadError(null)} />}
      {notice && <Banner tone="info" role="status" text={notice} dismissLabel={t('common.close')} onDismiss={() => setNotice(null)} />}

      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-6 text-center text-xs text-[#6E5E4F]">
          {t('productEditor.effects.noOptions')}
        </p>
      ) : (
        <>
          <Field label={t('productEditor.effects.chooseOption')}>
            {({ id }) => (
              <select id={id} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={CONTROL_CLASS}>
                <option value="">{t('productEditor.effects.chooseOptionNone')}</option>
                {options.map((o) => (
                  <option key={o.optionId} value={o.optionId}>
                    {o.name} — {(o as CustomizationOptionView & { groupName?: string }).groupName ?? ''}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {selected && (
            <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FAF8F5] dark:bg-[#26221F] p-4 space-y-4">
              <p className="text-[11px] text-[#6E5E4F]">
                {t('productEditor.effects.masterSharedHint')} <span className="font-mono">v{selected.version}</span>
              </p>

              <Field label={t('productEditor.effects.type')}>
                {({ id }) => (
                  <select id={id} value={draft.type} disabled={!canWrite || busy}
                    onChange={(e) => setDraft({ ...draft, type: e.target.value as EffectDraft['type'] })} className={CONTROL_CLASS}>
                    {(['NONE', 'ADD', 'REMOVE', 'REPLACE', 'MULTIPLY'] as const).map((ty) => (
                      <option key={ty} value={ty}>{t(`productEditor.effect.${ty}`)}</option>
                    ))}
                  </select>
                )}
              </Field>

              {draft.type !== 'NONE' && (
                <>
                  {effectShowsSource(draft.type) && (
                    <IngredientField label={t('productEditor.effects.source')} value={draft.sourceIngredientId}
                      disabled={!canWrite || busy} error={errors.sourceIngredientId ? t(errors.sourceIngredientId) : undefined}
                      onChange={(id) => setDraft({ ...draft, sourceIngredientId: id })} />
                  )}
                  {effectShowsTarget(draft.type) && (
                    <IngredientField label={t('productEditor.effects.target')} value={draft.targetIngredientId}
                      disabled={!canWrite || busy} error={errors.targetIngredientId ? t(errors.targetIngredientId) : undefined}
                      onChange={(id) => setDraft({ ...draft, targetIngredientId: id })} />
                  )}
                  {effectShowsQuantity(draft.type) && (
                    <Field label={t('productEditor.effects.quantity')} hint={t('productEditor.effects.quantityHint')}
                      required={draft.type === 'ADD'} error={errors.effectQuantity ? t(errors.effectQuantity) : undefined}>
                      {({ id, describedBy }) => (
                        <input id={id} type="text" inputMode="decimal" value={draft.effectQuantity} disabled={!canWrite || busy}
                          aria-describedby={describedBy} aria-invalid={!!errors.effectQuantity}
                          onChange={(e) => setDraft({ ...draft, effectQuantity: e.target.value })} className={CONTROL_CLASS} />
                      )}
                    </Field>
                  )}
                  {effectShowsMultiplier(draft.type) && (
                    <Field label={t('productEditor.effects.multiplier')} hint={t('productEditor.effects.multiplierHint')}
                      required error={errors.effectMultiplier ? t(errors.effectMultiplier) : undefined}>
                      {({ id, describedBy }) => (
                        <input id={id} type="text" inputMode="decimal" value={draft.effectMultiplier} disabled={!canWrite || busy}
                          aria-describedby={describedBy} aria-invalid={!!errors.effectMultiplier}
                          onChange={(e) => setDraft({ ...draft, effectMultiplier: e.target.value })} className={CONTROL_CLASS} />
                      )}
                    </Field>
                  )}

                  {/* Read-only explanation of the shape; no quantity is computed here. */}
                  <EffectExplanation draft={draft} />

                  <div className="flex items-center justify-end gap-2">
                    <button type="button" disabled={busy} onClick={() => void clear()}
                      className="px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
                      {t('productEditor.effects.clear')}
                    </button>
                    <button type="button" disabled={!canWrite || busy || Object.keys(errors).length > 0} onClick={() => void save()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null} {t('common.save')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
};

/* ------------------------------------------------- read-only shape explanation */

const EffectExplanation: React.FC<{ draft: EffectDraft }> = ({ draft }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-3 space-y-1">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#8C7C6B]">{t('productEditor.effects.preview')}</p>
      <p className="text-xs text-[#6E5E4F]">{t(`productEditor.effects.explain.${draft.type}`)}</p>
      <p className="text-[11px] text-[#8C7C6B]">{t('productEditor.effects.baseUnitNote')}</p>
    </div>
  );
};

/* ------------------------------------------------------------ ingredient field */

/**
 * A search-then-pick ingredient control. The catalog keeps ingredient identity
 * server-side, so this reads the master ingredient list by query and stores only
 * the chosen id; the base-unit label comes from the row the server returned.
 */
const IngredientField: React.FC<{
  label: string;
  value: string;
  disabled?: boolean;
  error?: string;
  onChange: (id: string) => void;
}> = ({ label, value, disabled, error, onChange }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IngredientRow[]>([]);
  const [picked, setPicked] = useState<IngredientRow | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Restore the readable label for a stored id (e.g. an existing effect).
    if (!value) { setPicked(null); return; }
    if (picked && picked.ingredientId === value) return;
    let cancelled = false;
    ingredientsAdminApi.get(value).then((row) => { if (!cancelled) setPicked(row); }).catch(() => { if (!cancelled) setPicked(null); });
    return () => { cancelled = true; };
  }, [value, picked]);

  const runSearch = useCallback(async () => {
    setSearching(true);
    try {
      const page = await ingredientsAdminApi.list({ q: query, size: 20 });
      setResults(page.items);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  return (
    <div className="space-y-1">
      <span className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{label}</span>
      {picked && picked.ingredientId === value ? (
        <div className="flex items-center justify-between rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-xs">
          <span className="font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{picked.name} <code className="ml-1 text-[10px] text-[#8C7C6B]">{picked.code}</code></span>
          <span className="flex items-center gap-2">
            <span className="rounded bg-[#8C7C6B]/10 px-1.5 py-0.5 text-[10px] text-[#6E5E4F]">{picked.baseUnitCode}</span>
            {!disabled && <button type="button" onClick={() => { onChange(''); setPicked(null); }} className="text-[11px] font-bold text-[#8C7C6B] hover:underline">{t('common.clear')}</button>}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input value={query} disabled={disabled} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }}
            placeholder={t('productEditor.effects.searchIngredient')} className={CONTROL_CLASS} />
          <button type="button" disabled={disabled || searching} onClick={() => void runSearch()}
            className="flex items-center gap-1.5 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] px-3 py-2 text-xs font-semibold disabled:opacity-50">
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5" aria-hidden="true" />} {t('common.search')}
          </button>
        </div>
      )}
      {results.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
          {results.map((r) => (
            <li key={r.ingredientId}>
              <button type="button" onClick={() => { onChange(r.ingredientId); setPicked(r); setResults([]); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">
                <span className="font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{r.name} <code className="text-[10px] text-[#8C7C6B]">{r.code}</code></span>
                <span className="rounded bg-[#8C7C6B]/10 px-1.5 py-0.5 text-[10px] text-[#6E5E4F]">{r.baseUnitCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[11px] font-semibold text-[#DC2626]">{error}</p>}
    </div>
  );
};
