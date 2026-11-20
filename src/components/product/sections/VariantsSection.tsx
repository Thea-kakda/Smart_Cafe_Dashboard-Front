/**
 * Round 1 "Variants" tab (Slice 4A §11). Reads and writes
 * `/api/v1/management/catalog/**` variant routes, which are guarded by
 * `product:manage` for reads and `variant:manage` for writes — a different pair
 * from the surrounding product editor, so authority is resolved here rather
 * than inherited from the shell.
 *
 * Ordering uses the authoritative reorder route (the complete id list is sent,
 * never a partial one) and the default flag uses `set-default`, because the
 * server owns the "exactly one default" invariant; the client only warns.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Star, Trash2, X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useAuth } from '../../../context/AuthContext';
import { ApiError } from '../../../lib/api';
import { ProductVariant, productVariantsApi } from '../../../lib/productEditor';
import {
  VariantDraft, buildReorderList, buildVariantCreate, buildVariantUpdate,
  defaultVariantIssues, editorErrorKey, emptyVariantDraft, moveItem, validateVariant, variantDraftFrom,
} from '../../../lib/productEditorState';
import { Banner, CONTROL_CLASS, Field, SectionCard, Toggle } from '../EditorPrimitives';

export interface VariantsSectionProps {
  productId: string;
  currencyCode: string;
  /** Notifies the shell so a closed editor can refresh the product row. */
  onChanged: () => void;
}

export const VariantsSection: React.FC<VariantsSectionProps> = ({ productId, currencyCode, onChanged }) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canRead = hasPermission('product:manage');
  const canWrite = hasPermission('variant:manage');

  const [rows, setRows] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(!canRead);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editing, setEditing] = useState<VariantDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setErrorKey(null);
    try {
      setRows(await productVariantsApi.list(productId));
    } catch (err) {
      setErrorKey(editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1));
    } finally {
      setLoading(false);
    }
  }, [productId, canRead]);

  useEffect(() => { void load(); }, [load]);

  const issues = useMemo(() => defaultVariantIssues(rows), [rows]);
  const errors = editing ? validateVariant(editing) : {};

  const fail = (err: unknown): string =>
    editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setFormError(null);
    try {
      await fn();
      setNotice(label);
      await load();
      onChanged();
      return true;
    } catch (err) {
      setFormError(fail(err));
      return false;
    }
  };

  const submit = async () => {
    if (!editing) return;
    setSubmitting(true);
    try {
      const variantId = editing.variantId;
      if (variantId === null) {
        const input = buildVariantCreate(editing);
        if (!input) { setFormError(t('variantAdmin.errValidation')); return; }
        if (await run(t('variantAdmin.createdMsg'), () => productVariantsApi.create(productId, input))) setEditing(null);
      } else {
        const input = buildVariantUpdate(editing);
        if (!input) { setFormError(t('variantAdmin.errValidation')); return; }
        if (await run(t('variantAdmin.updatedMsg'), () => productVariantsApi.update(variantId, input))) setEditing(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reorder = async (from: number, to: number) => {
    const next = moveItem(rows, from, to);
    const ids = buildReorderList(rows.map((r) => r.variantId), next.map((r) => r.variantId));
    if (!ids) return;
    setBusyId(next[to].variantId);
    try {
      await productVariantsApi.reorder(productId, ids);
      await load();
    } catch (err) {
      setFormError(fail(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (v: ProductVariant) => {
    setBusyId(v.variantId);
    await run(v.active ? t('variantAdmin.deactivatedMsg') : t('variantAdmin.activatedMsg'),
      () => (v.active ? productVariantsApi.deactivate(v.variantId) : productVariantsApi.activate(v.variantId)));
    setBusyId(null);
  };

  const makeDefault = async (v: ProductVariant) => {
    setBusyId(v.variantId);
    await run(t('variantAdmin.defaultMsg'), () => productVariantsApi.setDefault(v.variantId));
    setBusyId(null);
  };

  const remove = async (v: ProductVariant) => {
    setBusyId(v.variantId);
    const ok = await run(t('variantAdmin.deletedMsg'), () => productVariantsApi.remove(v.variantId));
    if (ok && editing?.variantId === v.variantId) setEditing(null);
    setBusyId(null);
  };

  if (!canRead) {
    return <Banner tone="info" text={t('variantAdmin.forbidden')} />;
  }

  return (
    <SectionCard
      title={t('variantAdmin.title')}
      description={t('variantAdmin.description')}
      actions={
        <>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('common.refresh')}
          </button>
          {canWrite && rows.length > 0 && (
            <button type="button" onClick={() => { setEditing(emptyVariantDraft(currencyCode, rows.length)); setFormError(null); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors">
              <Plus className="w-4 h-4" aria-hidden="true" /> {t('variantAdmin.create')}
            </button>
          )}
        </>
      }
    >
      {!canWrite && <Banner tone="info" text={t('variantAdmin.readOnly')} />}
      {loading && rows.length === 0 && <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>}
      {errorKey && <Banner tone="bad" role="alert" text={t(errorKey)} dismissLabel={t('common.close')} onDismiss={() => setErrorKey(null)} />}
      {notice && <Banner tone="ok" role="status" text={notice} dismissLabel={t('common.close')} onDismiss={() => setNotice(null)} />}
      {formError && <Banner tone="bad" role="alert" text={formError} dismissLabel={t('common.close')} onDismiss={() => setFormError(null)} />}
      {issues.map((key) => <Banner key={key} tone="warn" text={t(key)} />)}

      {rows.length === 0 && !loading && (
        <p className="rounded-xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-6 text-center text-xs text-[#6E5E4F]">
          {t('variantAdmin.empty')}
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522]">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{t('variantAdmin.tableCaption')}</caption>
            <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] uppercase text-[10px] tracking-wide">
              <tr>
                <th scope="col" className="py-3 px-3">{t('variantAdmin.colOrder')}</th>
                <th scope="col" className="py-3 px-3">{t('variantAdmin.colCode')}</th>
                <th scope="col" className="py-3 px-3">{t('variantAdmin.colName')}</th>
                <th scope="col" className="py-3 px-3 text-right">{t('variantAdmin.colPrice')}</th>
                <th scope="col" className="py-3 px-3">{t('variantAdmin.colStatus')}</th>
                <th scope="col" className="py-3 px-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
              {rows.map((v, index) => (
                <tr key={v.variantId} className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F]">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={!canWrite || index === 0 || busyId === v.variantId}
                        onClick={() => void reorder(index, index - 1)}
                        aria-label={t('variantAdmin.moveUp')} className="p-1 rounded hover:bg-[#C48A56]/10 disabled:opacity-30">
                        <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" disabled={!canWrite || index === rows.length - 1 || busyId === v.variantId}
                        onClick={() => void reorder(index, index + 1)}
                        aria-label={t('variantAdmin.moveDown')} className="p-1 rounded hover:bg-[#C48A56]/10 disabled:opacity-30">
                        <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                  <td className="py-2 px-3 font-mono text-[#8C7C6B]">{v.code}</td>
                  <td className="py-2 px-3 font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
                    {v.name}
                    {v.isDefault && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-[#C48A56]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#8A5A2B] dark:text-[#D4A87A]">
                        <Star className="w-3 h-3" aria-hidden="true" /> {t('variantAdmin.defaultBadge')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">{v.price} {v.currencyCode}</td>
                  <td className="py-2 px-3">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${v.active ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                      {v.active ? t('badge.active') : t('badge.inactive')}
                    </span>
                    <span className="ml-2 font-mono text-[10px] text-[#8C7C6B]">v{v.version}</span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" disabled={!canWrite || busyId === v.variantId} onClick={() => setEditing(variantDraftFrom(v))}
                        aria-label={`${t('variantAdmin.editAria')}: ${v.name}`} className="p-1.5 rounded hover:bg-[#C48A56]/10 disabled:opacity-30">
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" disabled={!canWrite || v.isDefault || busyId === v.variantId} onClick={() => void makeDefault(v)}
                        aria-label={`${t('variantAdmin.makeDefaultAria')}: ${v.name}`} className="p-1.5 rounded hover:bg-[#C48A56]/10 disabled:opacity-30">
                        <Star className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" disabled={!canWrite || busyId === v.variantId} onClick={() => void toggleActive(v)}
                        aria-label={`${v.active ? t('variantAdmin.deactivateAria') : t('variantAdmin.activateAria')}: ${v.name}`}
                        className="p-1.5 rounded hover:bg-[#C48A56]/10 disabled:opacity-30">
                        {v.active ? <X className="w-3.5 h-3.5" aria-hidden="true" /> : <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                      <button type="button" disabled={!canWrite || busyId === v.variantId} onClick={() => void remove(v)}
                        aria-label={`${t('variantAdmin.deleteAria')}: ${v.name}`} className="p-1.5 rounded text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-30">
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FAF8F5] dark:bg-[#26221F] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
              {editing.variantId === null ? t('variantAdmin.createTitle') : t('variantAdmin.editTitle')}
            </h5>
            <button type="button" onClick={() => setEditing(null)} aria-label={t('common.close')} className="p-1">
              <X className="w-4 h-4 text-[#8C7C6B]" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('variantAdmin.fieldCode')} required error={errors.code ? t(errors.code) : undefined}>
              {({ id, describedBy }) => (
                <input id={id} value={editing.code} maxLength={80} aria-invalid={!!errors.code} aria-describedby={describedBy}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })} className={CONTROL_CLASS} />
              )}
            </Field>
            <Field label={t('variantAdmin.fieldName')} required error={errors.name ? t(errors.name) : undefined}>
              {({ id, describedBy }) => (
                <input id={id} value={editing.name} maxLength={150} aria-invalid={!!errors.name} aria-describedby={describedBy}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={CONTROL_CLASS} />
              )}
            </Field>
            <Field label={t('variantAdmin.fieldPrice')} required error={errors.price ? t(errors.price) : undefined}>
              {({ id, describedBy }) => (
                <input id={id} type="text" inputMode="decimal" value={editing.price} aria-invalid={!!errors.price} aria-describedby={describedBy}
                  onChange={(e) => setEditing({ ...editing, price: e.target.value })} className={CONTROL_CLASS} />
              )}
            </Field>
            <Field label={t('variantAdmin.fieldCost')} hint={t('variantAdmin.costHint')} error={errors.cost ? t(errors.cost) : undefined}>
              {({ id, describedBy }) => (
                <input id={id} type="text" inputMode="decimal" value={editing.cost} aria-invalid={!!errors.cost} aria-describedby={describedBy}
                  onChange={(e) => setEditing({ ...editing, cost: e.target.value })} className={CONTROL_CLASS} />
              )}
            </Field>
            <Field label={t('variantAdmin.fieldCurrency')} required error={errors.currencyCode ? t(errors.currencyCode) : undefined}>
              {({ id }) => (
                <select id={id} value={editing.currencyCode}
                  onChange={(e) => setEditing({ ...editing, currencyCode: e.target.value })} className={CONTROL_CLASS}>
                  <option value="USD">USD</option>
                  <option value="KHR">KHR</option>
                </select>
              )}
            </Field>
            <Field label={t('variantAdmin.fieldBarcode')} hint={t('variantAdmin.barcodeHint')} error={errors.barcode ? t(errors.barcode) : undefined}>
              {({ id, describedBy }) => (
                <input id={id} value={editing.barcode} maxLength={64} aria-describedby={describedBy}
                  onChange={(e) => setEditing({ ...editing, barcode: e.target.value })} className={CONTROL_CLASS} />
              )}
            </Field>
            <Field label={t('variantAdmin.fieldOrder')} error={errors.displayOrder ? t(errors.displayOrder) : undefined}>
              {({ id, describedBy }) => (
                <input id={id} type="text" inputMode="numeric" value={editing.displayOrder} aria-describedby={describedBy}
                  onChange={(e) => setEditing({ ...editing, displayOrder: e.target.value })} className={CONTROL_CLASS} />
              )}
            </Field>
          </div>

          <Field label={t('variantAdmin.fieldDescription')}>
            {({ id }) => (
              <textarea id={id} value={editing.description} rows={2} maxLength={5000}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={CONTROL_CLASS} />
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-6">
            <Toggle label={t('variantAdmin.fieldActive')} checked={editing.active}
              onChange={(v) => setEditing({ ...editing, active: v })} />
            <Toggle label={t('variantAdmin.fieldDefault')} checked={editing.isDefault} hint={t('variantAdmin.defaultHint')}
              onChange={(v) => setEditing({ ...editing, isDefault: v })} />
          </div>

          {editing.variantId !== null && (
            <p className="flex items-center gap-1.5 text-[11px] text-[#6E5E4F]">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {t('variantAdmin.lockEchoHint')} <span className="font-mono">v{editing.version}</span>
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => void submit()} disabled={submitting || Object.keys(errors).length > 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
};
