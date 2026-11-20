/**
 * Round 1 "Availability Preview" tab (Slice 4A §13). Read-only by contract: the
 * management preview endpoint never reserves, consumes or writes, so this tab
 * has no Save button — the writes that change the answer live on the Stores &
 * Channels tab, and the operator is sent there rather than being given a second
 * place to edit the same facts.
 *
 * The engine returns a verdict, not a boolean: `active`, `listed`, `inStock` and
 * `orderable` are four separate answers and the reason codes explain `orderable`
 * without being collapsed into it. Normal unavailability is HTTP 200 with
 * `orderable=false`, so a red-screen treatment would itself be a lie; it renders
 * as a warning chip with the codes underneath.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Boxes, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useAuth } from '../../../context/AuthContext';
import { useStore } from '../../../context/StoreContext';
import { ApiError } from '../../../lib/api';
import { AvailabilityPreview, ProductVariant, availabilityApi, productVariantsApi } from '../../../lib/productEditor';
import {
  PREVIEW_MAX_QUANTITY, buildPreviewQuery, editorErrorKey, previewGroupCount, previewVerdict, reasonKey,
} from '../../../lib/productEditorState';
import { Banner, CONTROL_CLASS, Field, SectionCard, StaticValue, Toggle } from '../EditorPrimitives';

export interface AvailabilityPreviewSectionProps {
  productId: string;
}

export const AvailabilityPreviewSection: React.FC<AvailabilityPreviewSectionProps> = ({ productId }) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { stores, selectedStoreId, setSelectedStoreId } = useStore();

  // Both view permissions are required by the service; a caller with only one
  // gets an explanation instead of a 403 on every attempt.
  const canPreview = hasPermission('branch-product:read') && hasPermission('inventory:read');
  const canReadVariants = hasPermission('product:manage');

  const storeId = selectedStoreId || stores[0]?.id || '';

  const [variantId, setVariantId] = useState('');
  const [includeOptions, setIncludeOptions] = useState(true);
  const [quantity, setQuantity] = useState('1');
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!canReadVariants) return;
    let cancelled = false;
    productVariantsApi.list(productId)
      .then((rows) => { if (!cancelled) setVariants(rows); })
      .catch(() => { if (!cancelled) setVariants([]); });
    return () => { cancelled = true; };
  }, [productId, canReadVariants]);

  const query = useMemo(() => buildPreviewQuery({ variantId, includeOptions, quantity }), [variantId, includeOptions, quantity]);

  const load = useCallback(async () => {
    if (!canPreview || !storeId || !query) return;
    setLoading(true);
    setErrorKey(null);
    try {
      setPreview(await availabilityApi.preview(storeId, productId, query));
    } catch (err) {
      setErrorKey(editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1));
      setPreview(null);
    } finally {
      setLoading(false);
    }
    // `query` is regenerated on every keystroke; the call stays explicit so a
    // bad quantity cannot fire a request the server would reject.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPreview, storeId, productId, variantId, includeOptions, quantity]);

  // First read for a branch, then only on demand or when the branch changes.
  useEffect(() => {
    if (canPreview && storeId && query) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  if (!canPreview) return <Banner tone="info" text={t('previewAdmin.forbidden')} />;
  if (stores.length === 0) return <Banner tone="info" text={t('channelAdmin.noBranch')} />;

  const verdict = preview ? previewVerdict(preview) : null;

  return (
    <SectionCard
      title={t('previewAdmin.title')}
      description={t('previewAdmin.description')}
      actions={
        <>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <span>{t('channelAdmin.branch')}</span>
            <select value={storeId} onChange={(e) => setSelectedStoreId(e.target.value)}
              className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2 py-1.5 text-xs font-semibold">
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading || query === null}
            title={query === null ? t('previewAdmin.errQuantity') : undefined}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('previewAdmin.recompute')}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label={t('previewAdmin.fieldVariant')}>
          {({ id, describedBy }) => (
            <select id={id} value={variantId} aria-describedby={describedBy} disabled={!canReadVariants}
              onChange={(e) => setVariantId(e.target.value)} className={CONTROL_CLASS}>
              <option value="">{t('previewAdmin.allVariants')}</option>
              {variants.map((v) => <option key={v.variantId} value={v.variantId}>{v.name}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('previewAdmin.fieldQuantity')} error={query === null ? t('previewAdmin.errQuantity') : undefined}
          hint={t('previewAdmin.quantityHint')}>
          {({ id, describedBy }) => (
            <input id={id} type="text" inputMode="numeric" value={quantity} maxLength={6}
              aria-invalid={query === null} aria-describedby={describedBy}
              onChange={(e) => setQuantity(e.target.value)} className={CONTROL_CLASS} />
          )}
        </Field>
        <div className="flex items-end pb-1">
          <Toggle label={t('previewAdmin.includeOptions')} checked={includeOptions} onChange={setIncludeOptions} />
        </div>
      </div>

      {!canReadVariants && <Banner tone="info" text={t('previewAdmin.variantsNotReadable')} />}
      {errorKey && <Banner tone="bad" role="alert" text={t(errorKey)} dismissLabel={t('common.close')} onDismiss={() => setErrorKey(null)} />}
      {loading && !preview && (
        <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>
      )}

      {preview && verdict && (
        <div className="space-y-4">
          <Banner tone={verdict.tone} role="status" text={`${t('previewAdmin.verdictPrefix')}: ${t(verdict.key)}`} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StaticValue label={t('previewAdmin.factActive')} value={preview.active ? t('badge.active') : t('badge.inactive')} />
            <StaticValue label={t('previewAdmin.factListed')} value={preview.listed ? t('previewAdmin.yes') : t('previewAdmin.no')} />
            <StaticValue label={t('previewAdmin.factInStock')} value={preview.inStock ? t('previewAdmin.yes') : t('previewAdmin.no')} />
            <StaticValue label={t('previewAdmin.factOrderable')} value={preview.orderable ? t('previewAdmin.yes') : t('previewAdmin.no')} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <StaticValue label={t('previewAdmin.manualState')} value={t(`previewAdmin.state.${preview.manualState}`)}
              hint={t('previewAdmin.manualStateHint')} />
            <StaticValue label={t('previewAdmin.baseServings')}
              value={preview.availableBaseServings === null ? t('previewAdmin.notTracked') : String(preview.availableBaseServings)} />
            <StaticValue label={t('previewAdmin.calculatedAt')} value={preview.calculatedAt} />
          </div>

          <ReasonList codes={preview.reasonCodes} label={t('previewAdmin.productReasons')} />

          <div className="space-y-2">
            <h5 className="flex items-center gap-2 text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
              <Boxes className="w-4 h-4 text-[#8C7C6B]" aria-hidden="true" /> {t('previewAdmin.variantsHeading')}
            </h5>
            {preview.variants.length === 0
              ? <p className="text-xs text-[#6E5E4F]">{t('previewAdmin.noVariants')}</p>
              : (
                <div className="overflow-x-auto rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522]">
                  <table className="w-full text-left text-xs">
                    <caption className="sr-only">{t('previewAdmin.variantsCaption')}</caption>
                    <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] uppercase text-[10px] tracking-wide">
                      <tr>
                        <th scope="col" className="py-3 px-3">{t('variantAdmin.colName')}</th>
                        <th scope="col" className="py-3 px-3">{t('previewAdmin.colVerdict')}</th>
                        <th scope="col" className="py-3 px-3 text-right">{t('previewAdmin.colServings')}</th>
                        <th scope="col" className="py-3 px-3">{t('previewAdmin.colSource')}</th>
                        <th scope="col" className="py-3 px-3">{t('previewAdmin.colReasons')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                      {preview.variants.map((v) => (
                        <tr key={v.variantId}>
                          <td className="py-2 px-3 font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{v.variantName}</td>
                          <td className="py-2 px-3">
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${v.orderable ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                              {v.orderable ? t('previewAdmin.yes') : t('previewAdmin.no')}
                            </span>
                            {!v.active && <span className="ml-2 text-[10px] text-[#8C7C6B]">{t('badge.inactive')}</span>}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {v.availableServings === null ? t('previewAdmin.notTracked') : v.availableServings}
                          </td>
                          <td className="py-2 px-3 text-[#6E5E4F]">{v.resolutionSource ?? t('previewAdmin.notTracked')}</td>
                          <td className="py-2 px-3"><InlineReasons codes={v.reasonCodes} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          <div className="space-y-2">
            <h5 className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('previewAdmin.optionsHeading')}</h5>
            {!includeOptions && <p className="text-xs text-[#6E5E4F]">{t('previewAdmin.optionsOmitted')}</p>}
            {includeOptions && preview.optionGroups.length === 0 && (
              <p className="text-xs text-[#6E5E4F]">{t('previewAdmin.noOptions')}</p>
            )}
            {includeOptions && preview.optionGroups.length > 0 && (
              <ul className="space-y-2">
                {preview.optionGroups.map((g) => (
                  <li key={g.groupId} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#6E5E4F]">
                      <span className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{g.groupName}</span>
                      <span className="rounded-md bg-[#8C7C6B]/15 px-1.5 py-0.5 text-[10px]">{t(`productEditor.selection.${g.selectionType}`)}</span>
                      {g.required && <span className="rounded-md bg-[#C48A56]/15 px-1.5 py-0.5 text-[10px] text-[#8A5A2B] dark:text-[#D4A87A]">{t('productEditor.requiredYes')}</span>}
                      <span className="ml-auto">{t('previewAdmin.masterLimits')}: {g.minimumSelections}–{g.maximumSelections ?? '∞'}</span>
                      {!g.atLeastOneValidSelection && (
                        <span className="flex items-center gap-1 rounded-md bg-[#DC2626]/15 px-1.5 py-0.5 text-[10px] text-[#DC2626]">
                          <AlertCircle className="w-3 h-3" aria-hidden="true" /> {t('previewAdmin.noValidSelection')}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {g.values.map((o) => (
                        <li key={o.optionId} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${o.selectable && o.available ? 'bg-[#2E7D32]' : 'bg-[#DC2626]'}`} aria-hidden="true" />
                          <span className="font-mono text-[11px] text-[#8C7C6B]">{o.optionId.slice(0, 8)}</span>
                          <span className="rounded-md bg-[#8C7C6B]/10 px-1.5 py-0.5 text-[10px]">
                            {o.available ? t('previewAdmin.yes') : t('previewAdmin.no')}
                          </span>
                          <span className="text-[11px] text-[#6E5E4F]">
                            {t('previewAdmin.optionQty')}: {o.availableQuantity === null ? t('previewAdmin.notTracked') : o.availableQuantity}
                          </span>
                          <InlineReasons codes={o.reasonCodes} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-[#6E5E4F]">
            {t('previewAdmin.footnote')}
            {' · '}
            {previewGroupCount(preview)} {t('previewAdmin.optionCount')}
            {' · '}
            {t('previewAdmin.limit')}: {PREVIEW_MAX_QUANTITY}
          </p>
        </div>
      )}
    </SectionCard>
  );
};

/* --------------------------------------------------------------- sub-renderers */

/** Product-level codes: full sentences, because these explain the headline chip. */
const ReasonList: React.FC<{ codes: string[]; label: string }> = ({ codes, label }) => {
  const { t } = useTranslation();
  if (codes.length === 0) return null;
  return (
    <div className="space-y-1">
      <span className="block text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{label}</span>
      <ul className="space-y-1">
        {codes.map((c) => (
          <li key={c} className="flex items-start gap-2 text-xs text-[#B45309]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {t(reasonKey(c))}
              <code className="ml-1.5 rounded bg-[#8C7C6B]/10 px-1 py-0.5 text-[10px] text-[#8C7C6B]">{c}</code>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Row-level codes stay as the frozen code strings: a table cell cannot hold a
 * sentence per option, and an invented short translation risks disagreeing with
 * the product-level copy of the same code.
 */
const InlineReasons: React.FC<{ codes: string[] }> = ({ codes }) => {
  const { t } = useTranslation();
  if (codes.length === 0) return <span className="text-[11px] text-[#6E5E4F]">{t('previewAdmin.none')}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <code key={c} title={t(reasonKey(c))} className="rounded bg-[#B45309]/10 px-1.5 py-0.5 text-[10px] text-[#B45309]">{c}</code>
      ))}
    </span>
  );
};
