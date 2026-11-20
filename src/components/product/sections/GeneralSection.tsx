/**
 * Round 1 "General" tab (Slice 4A §10). One draft over the authoritative
 * management read, saved through the existing product PATCH route.
 *
 * The two Slice 4A classification selects are the point of this tab:
 * `productType` and `stockMode` are genuinely writable now, so they render as
 * real controls. Everything the server owns stays as text — the version, the
 * timestamps — because a lock token is not an input.
 *
 * Changing `stockMode` to RECIPE_BASED does NOT create, require or activate a
 * recipe in this release. That is stated in the hint rather than discovered by
 * the operator: recipe management is a Round 2 surface, and the backend
 * explicitly reclassifies without any recipe side effect.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { ApiError } from '../../../lib/api';
import { productsAdminApi } from '../../../lib/catalogAdmin';
import { PRODUCT_TYPES, STOCK_MODES, ProductDetails, ProductType, StockMode } from '../../../lib/productEditor';
import {
  GeneralDraft, SectionState, INITIAL_SECTION_STATE, beginLoad, beginSave, editorErrorKey,
  generalDraftFrom, isGeneralDirty, loadFailed, loadReady, markDirty, markStale, saveFailed, saveSucceeded,
  shouldReloadAfter, validateGeneral, buildGeneralPayload, isVersionConflict,
} from '../../../lib/productEditorState';
import { CONTROL_CLASS, Banner, Field, GroupLabel, SectionCard, StaticValue, Toggle } from '../EditorPrimitives';
import { ImageUploadField } from '../../catalog/ImageUploadField';
import { CategoryRow } from '../../../lib/storeProducts';

export interface GeneralSectionProps {
  product: ProductDetails;
  categories: CategoryRow[];
  canWrite: boolean;
  onDirtyChange: (dirty: boolean) => void;
  /** The PATCH response is authoritative: it carries the new product version. */
  onProductChange: (product: ProductDetails) => void;
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  product, categories, canWrite, onDirtyChange, onProductChange,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<GeneralDraft>(() => generalDraftFrom(product));
  const [state, setState] = useState<SectionState>(INITIAL_SECTION_STATE);
  const [reloadToken, setReloadToken] = useState(0);

  // A fresh authoritative read replaces the draft: the server version wins over
  // whatever the form was showing, including after another tab's save.
  useEffect(() => {
    setDraft(generalDraftFrom(product));
    setState((s) => loadReady(s));
  }, [product]);

  const errors = useMemo(() => validateGeneral(draft), [draft]);
  const dirty = useMemo(() => isGeneralDirty(product, draft), [product, draft]);

  useEffect(() => {
    onDirtyChange(dirty);
    setState((s) => markDirty(s, dirty));
  }, [dirty, onDirtyChange]);

  const patch = <K extends keyof GeneralDraft>(key: K, value: GeneralDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const payload = buildGeneralPayload(product, draft);
    if (!payload) return;
    setState((s) => beginSave(s));
    try {
      const updated = await productsAdminApi.update(product.productId, payload);
      onProductChange(updated);
      setState((s) => saveSucceeded(s));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const status = err instanceof ApiError ? err.status : -1;
      const key = editorErrorKey(code, status);
      // A version conflict keeps the draft: the operator's edits are still the
      // intent, they just need to be replayed onto the freshly read row.
      setState((s) => (isVersionConflict(code) ? markStale(s, key) : saveFailed(s, key)));
      if (shouldReloadAfter(code, status)) setReloadToken((n) => n + 1);
    }
  };

  const refetch = async () => {
    setState((s) => beginLoad(s));
    try {
      onProductChange(await productsAdminApi.get(product.productId));
      setState((s) => loadReady(s));
    } catch (err) {
      setState((s) => loadFailed(s, editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1)));
    }
  };

  // The token only exists so "discard my stale copy" re-reads on demand.
  useEffect(() => {
    if (reloadToken > 0) void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const fieldError = (key: keyof GeneralDraft) => (errors[key] ? t(errors[key]) : undefined);

  return (
    <SectionCard
      title={t('productEditor.general.title')}
      description={t('productEditor.general.description')}
      actions={
        <>
          <button type="button" onClick={() => void refetch()} disabled={state.load === 'loading' || state.saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${state.load === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('common.refresh')}
          </button>
          <button type="button" onClick={() => void save()}
            disabled={!canWrite || !dirty || state.saving || Object.keys(errors).length > 0}
            title={canWrite ? undefined : t('productEditor.readOnlyWrite')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
            {state.saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </>
      }
    >
      {!canWrite && <Banner tone="info" text={t('productEditor.readOnlyWrite')} />}
      {state.errorKey && (
        <Banner tone="bad" role="alert" text={t(state.errorKey)} dismissLabel={t('common.close')} onDismiss={() => setState((s) => ({ ...s, errorKey: null }))} />
      )}
      {Object.keys(errors).length > 0 && (
        <Banner tone="warn" role="status" text={t('prodAdmin.errValidation')} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('prodAdmin.fieldCode')} required error={fieldError('code')}>
          {({ id, describedBy }) => (
            <input id={id} type="text" value={draft.code} aria-invalid={!!errors.code} aria-describedby={describedBy}
              maxLength={50} disabled={!canWrite} onChange={(e) => patch('code', e.target.value)} className={CONTROL_CLASS} />
          )}
        </Field>
        <Field label={t('prodAdmin.fieldCategory')} required error={fieldError('categoryId')}>
          {({ id, describedBy }) => (
            <select id={id} value={draft.categoryId} aria-invalid={!!errors.categoryId} aria-describedby={describedBy}
              disabled={!canWrite} onChange={(e) => patch('categoryId', e.target.value)} className={CONTROL_CLASS}>
              <option value="">— {t('prodAdmin.selectCategory')} —</option>
              {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
            </select>
          )}
        </Field>
      </div>

      <Field label={t('prodAdmin.fieldName')} required error={fieldError('name')}>
        {({ id, describedBy }) => (
          <input id={id} type="text" value={draft.name} aria-invalid={!!errors.name} aria-describedby={describedBy}
            maxLength={150} disabled={!canWrite} onChange={(e) => patch('name', e.target.value)} className={CONTROL_CLASS} />
        )}
      </Field>

      <Field label={t('prodAdmin.fieldDescription')} hint={t('productEditor.general.descriptionHint')}>
        {({ id, describedBy }) => (
          <textarea id={id} value={draft.description} rows={2} maxLength={5000} aria-describedby={describedBy}
            disabled={!canWrite} onChange={(e) => patch('description', e.target.value)} className={CONTROL_CLASS} />
        )}
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('prodAdmin.fieldPrice')} required error={fieldError('basePrice')}>
          {({ id, describedBy }) => (
            <input id={id} type="text" inputMode="decimal" value={draft.basePrice} aria-invalid={!!errors.basePrice}
              aria-describedby={describedBy} disabled={!canWrite} onChange={(e) => patch('basePrice', e.target.value)}
              className={CONTROL_CLASS} />
          )}
        </Field>
        <Field label={t('prodAdmin.fieldCurrency')} required error={fieldError('currencyCode')}>
          {({ id, describedBy }) => (
            <select id={id} value={draft.currencyCode} aria-describedby={describedBy} disabled={!canWrite}
              onChange={(e) => patch('currencyCode', e.target.value)} className={CONTROL_CLASS}>
              <option value="USD">USD</option>
              <option value="KHR">KHR</option>
            </select>
          )}
        </Field>
        <Field label={t('prodAdmin.fieldPrep')} error={fieldError('preparationMinutes')}>
          {({ id, describedBy }) => (
            <input id={id} type="text" inputMode="numeric" value={draft.preparationMinutes} aria-invalid={!!errors.preparationMinutes}
              aria-describedby={describedBy} disabled={!canWrite} onChange={(e) => patch('preparationMinutes', e.target.value)}
              className={CONTROL_CLASS} />
          )}
        </Field>
        <Field label={t('prodAdmin.fieldTax')} required error={fieldError('taxRate')}>
          {({ id, describedBy }) => (
            <input id={id} type="text" inputMode="decimal" value={draft.taxRate} aria-invalid={!!errors.taxRate}
              aria-describedby={describedBy} disabled={!canWrite} onChange={(e) => patch('taxRate', e.target.value)}
              className={CONTROL_CLASS} />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('productEditor.fieldProductType')} hint={t('productEditor.hintProductType')}>
          {({ id, describedBy }) => (
            <select id={id} value={draft.productType} aria-describedby={describedBy} disabled={!canWrite}
              onChange={(e) => patch('productType', e.target.value as ProductType)} className={CONTROL_CLASS}>
              {PRODUCT_TYPES.map((v) => <option key={v} value={v}>{t(`productEditor.type.${v}`)}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('productEditor.fieldStockMode')} hint={t('productEditor.hintStockMode')}>
          {({ id, describedBy }) => (
            <select id={id} value={draft.stockMode} aria-describedby={describedBy} disabled={!canWrite}
              onChange={(e) => patch('stockMode', e.target.value as StockMode)} className={CONTROL_CLASS}>
              {STOCK_MODES.map((v) => <option key={v} value={v}>{t(`productEditor.mode.${v}`)}</option>)}
            </select>
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <Toggle label={t('prodAdmin.fieldActive')} checked={draft.active} disabled={!canWrite} onChange={(v) => patch('active', v)} />
        <Toggle label={t('prodAdmin.fieldCustomizable')} checked={draft.customizable} disabled={!canWrite}
          onChange={(v) => patch('customizable', v)} hint={t('productEditor.hintCustomizable')} />
      </div>

      <GroupLabel text={t('prodAdmin.fieldImage')}>
        <ImageUploadField kind="product" objectKey={draft.imageObjectKey} initialUrl={draft.imageUrl}
          disabled={!canWrite || state.saving}
          onChange={(objectKey, url) => setDraft((d) => ({ ...d, imageObjectKey: objectKey, imageUrl: url }))} />
      </GroupLabel>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StaticValue label={t('productEditor.lockVersion')} value={String(product.version)} hint={t('productEditor.lockVersionHint')} />
        <StaticValue label={t('productEditor.colCode')} value={product.code} />
        <StaticValue label={t('common.created')} value={formatInstant(product.createdAt, t('common.na'))} />
        <StaticValue label={t('common.updated')} value={formatInstant(product.updatedAt, t('common.na'))} />
      </div>
    </SectionCard>
  );
};

/**
 * Timestamps are absolute instants, so rendering them in the browser's zone is
 * correct here — unlike the weekly schedule windows, which are store-local wall
 * clock and must never be shifted.
 */
function formatInstant(iso: string, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
