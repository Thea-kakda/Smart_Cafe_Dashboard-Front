/**
 * Round 2 "Options" tab (Slice 4A §11). This replaces the Round 1 read-only view
 * with a real attachment editor: after V049 the backend can persist per-product
 * required, display order, selection-limit overrides, the allowed-option subset,
 * a per-product default and per-option price overrides, and the relationship now
 * carries its OWN optimistic-lock version.
 *
 * The rules this component is built around:
 *  - **Capabilities-driven rendering.** A control is rendered as editable only
 *    when the server's capabilities block declares it writable. An undeclared
 *    block means nothing is editable — never a optimistic guess.
 *  - **No data loss on failure.** A save that 409s or errors keeps the local
 *    draft on screen (still dirty) and shows mapped copy; the operator retries
 *    after re-reading, rather than losing typed values.
 *  - **Controlled diff, not delete-reinsert.** The subset is submitted as the
 *    full ACTIVE roster with an `allowed` flag per option, so dropping an option
 *    flags it false (preserving history) and inactive master options are never
 *    sent — the exact contract the management service enforces.
 *  - **Group reorder via the authoritative display order.** There is no group
 *    reorder endpoint; order is a per-attachment field, so up/down swaps the two
 *    adjacent drafts' display orders and saves both.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Link2, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { ApiError } from '../../../lib/api';
import {
  CustomizationGroupMaster, CustomizationGroupView, ProductCustomizationGroupsResponse,
  customizationMasterApi, productCustomizationApi,
} from '../../../lib/productEditor';
import {
  CapabilityView, GroupAttachmentDraft, UNDECLARED_CAPABILITIES,
  buildConfigurePayload, editorErrorKey, groupDraftFrom, isGroupFieldEditable, toCapabilityView, validateGroupDraft,
} from '../../../lib/productEditorState';
import { Banner, CONTROL_CLASS, Field, SectionCard, StaticValue, Toggle } from '../EditorPrimitives';

export interface OptionsSectionProps {
  productId: string;
  /** Authoritative product version; the collection-level lock token for every write. */
  productVersion: number;
  canWrite: boolean;
}

const errOf = (err: unknown): { code?: string; status: number } =>
  err instanceof ApiError ? { code: err.code, status: err.status } : { status: -1 };

export const OptionsSection: React.FC<OptionsSectionProps> = ({ productId, productVersion, canWrite }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<ProductCustomizationGroupsResponse | null>(null);
  const [masters, setMasters] = useState<CustomizationGroupMaster[]>([]);
  const [caps, setCaps] = useState<CapabilityView>(UNDECLARED_CAPABILITIES);
  const [drafts, setDrafts] = useState<Record<string, GroupAttachmentDraft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [attachGroupId, setAttachGroupId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [res, masterList] = await Promise.all([
        productCustomizationApi.groups(productId),
        customizationMasterApi.list().catch(() => [] as CustomizationGroupMaster[]),
      ]);
      setData(res);
      setMasters(masterList);
      setCaps(toCapabilityView(res.capabilities));
      const byId = new Map(masterList.map((m) => [m.groupId, m]));
      const seeded: Record<string, GroupAttachmentDraft> = {};
      for (const g of res.groups) seeded[g.groupId] = groupDraftFrom(g, byId.get(g.groupId) ?? null);
      setDrafts(seeded);
    } catch (err) {
      const e = errOf(err);
      setLoadError(editorErrorKey(e.code, e.status));
      setData(null);
      setCaps(UNDECLARED_CAPABILITIES);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  // Attached group ids, so the attach picker offers only the not-yet-attached ones.
  const attached = useMemo(() => new Set((data?.groups ?? []).map((g) => g.groupId)), [data]);
  const attachable = useMemo(() => masters.filter((m) => m.active && !attached.has(m.groupId)), [masters, attached]);
  const masterById = useMemo(() => new Map(masters.map((m) => [m.groupId, m])), [masters]);

  const patchDraft = (groupId: string, next: GroupAttachmentDraft) =>
    setDrafts((d) => ({ ...d, [groupId]: next }));

  const saveGroup = useCallback(async (groupId: string) => {
    if (!data) return;
    const draft = drafts[groupId];
    if (!draft) return;
    const payload = buildConfigurePayload(draft, caps, productVersion);
    if (!payload) return; // advisory validation blocks the doomed request
    setBusyGroup(groupId);
    setNotice(null);
    try {
      await productCustomizationApi.configure(productId, groupId, payload);
      setNotice(t('productEditor.options.savedMsg'));
      await load();
    } catch (err) {
      const e = errOf(err);
      // The draft is left untouched on screen: a conflict never discards typed work.
      setNotice(t(editorErrorKey(e.code, e.status)));
    } finally {
      setBusyGroup(null);
    }
  }, [caps, data, drafts, load, notice, productId, productVersion, t]);

  const attach = useCallback(async () => {
    if (!attachGroupId || !data) return;
    const master = masterById.get(attachGroupId);
    if (!master) return;
    const fresh: GroupAttachmentDraft = {
      groupId: master.groupId,
      selectionType: master.selectionType,
      required: master.minimumSelections >= 1,
      displayOrder: String(data.groups.length),
      minimumSelections: '',
      maximumSelections: '',
      defaultOptionId: null,
      options: master.options.map((o) => ({ optionId: o.optionId, allowed: o.active, priceOverride: '', displayOrder: '', active: o.active })),
      expectedProductVersion: productVersion,
      relationshipVersion: null,
    };
    setBusyGroup(master.groupId);
    try {
      const payload = buildConfigurePayload(fresh, caps, productVersion) ?? { expectedProductVersion: productVersion };
      await productCustomizationApi.configure(productId, master.groupId, payload);
      setAttachGroupId('');
      setNotice(t('productEditor.options.attachedMsg'));
      await load();
    } catch (err) {
      const e = errOf(err);
      setNotice(t(editorErrorKey(e.code, e.status)));
    } finally {
      setBusyGroup(null);
    }
  }, [attachGroupId, caps, data, masterById, load, notice, productId, productVersion, t]);

  const detach = useCallback(async (groupId: string) => {
    setBusyGroup(groupId);
    try {
      await productCustomizationApi.detach(productId, groupId, productVersion);
      setNotice(t('productEditor.options.detachedMsg'));
      await load();
    } catch (err) {
      const e = errOf(err);
      setNotice(t(editorErrorKey(e.code, e.status)));
    } finally {
      setBusyGroup(null);
    }
  }, [load, notice, productId, productVersion, t]);

  // Group reorder: swap the display orders of two adjacent attachments and save
  // both. Order is a per-attachment field, so this is the authoritative move.
  const reorderGroups = useCallback(async (fromId: string, toId: string) => {
    const a = drafts[fromId];
    const b = drafts[toId];
    if (!a || !b) return;
    const swappedA = { ...a, displayOrder: b.displayOrder };
    const swappedB = { ...b, displayOrder: a.displayOrder };
    setDrafts((d) => ({ ...d, [fromId]: swappedA, [toId]: swappedB }));
    setBusyGroup(fromId);
    try {
      for (const [id, draft] of [[toId, swappedB], [fromId, swappedA]] as const) {
        const payload = buildConfigurePayload(draft, caps, productVersion);
        if (payload) await productCustomizationApi.configure(productId, id, payload);
      }
      await load();
    } catch (err) {
      const e = errOf(err);
      setNotice(t(editorErrorKey(e.code, e.status)));
    } finally {
      setBusyGroup(null);
    }
  }, [caps, drafts, load, notice, productId, productVersion, t]);

  if (loading && !data) {
    return (
      <SectionCard title={t('productEditor.options.title')} description={t('productEditor.options.description')}>
        <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>
      </SectionCard>
    );
  }

  // Display order is authoritative for the group list; sort a copy for rendering.
  const orderedGroups = [...(data?.groups ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <SectionCard
      title={t('productEditor.options.title')}
      description={t('productEditor.options.description')}
      actions={
        <button type="button" onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('common.refresh')}
        </button>
      }
    >
      {!canWrite && <Banner tone="info" text={t('productEditor.options.readOnly')} />}
      {loadError && <Banner tone="bad" role="alert" text={t(loadError)} dismissLabel={t('common.close')} onDismiss={() => setLoadError(null)} />}
      {notice && <Banner tone="info" role="status" text={notice} dismissLabel={t('common.close')} onDismiss={() => setNotice(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <StaticValue label={t('productEditor.options.productLock')} value={String(productVersion)} hint={t('productEditor.options.productLockHint')} />
        <StaticValue label={t('productEditor.options.versionSource')}
          value={caps.declared ? t(`productEditor.versionSource.${caps.relationshipVersionSource === 'RELATIONSHIP' ? 'RELATIONSHIP' : 'PRODUCT'}`) : t('productEditor.options.undeclared')} />
        <StaticValue label={t('productEditor.options.groupCount')} value={String(orderedGroups.length)} />
      </div>

      {canWrite && attachable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#F7F5F2] dark:bg-[#26221F] p-3">
          <Field label={t('productEditor.options.attachLabel')}>
            {({ id }) => (
              <select id={id} value={attachGroupId} onChange={(e) => setAttachGroupId(e.target.value)} className={CONTROL_CLASS}>
                <option value="">{t('productEditor.options.attachNone')}</option>
                {attachable.map((m) => <option key={m.groupId} value={m.groupId}>{m.name} ({m.code})</option>)}
              </select>
            )}
          </Field>
          <button type="button" onClick={() => void attach()} disabled={!attachGroupId || busyGroup !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
            <Link2 className="w-4 h-4" aria-hidden="true" /> {t('productEditor.options.attach')}
          </button>
        </div>
      )}

      {orderedGroups.length === 0 && !loading && (
        <p className="rounded-xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-6 text-center text-xs text-[#6E5E4F]">
          {t('productEditor.options.empty')}
        </p>
      )}

      <ul className="space-y-4">
        {orderedGroups.map((view, index) => (
          <GroupCard
            key={view.groupId}
            view={view}
            draft={drafts[view.groupId]}
            caps={caps}
            canWrite={canWrite}
            busy={busyGroup === view.groupId}
            isFirst={index === 0}
            isLast={index === orderedGroups.length - 1}
            onPatch={(d) => patchDraft(view.groupId, d)}
            onSave={() => void saveGroup(view.groupId)}
            onDetach={() => void detach(view.groupId)}
            onMoveUp={() => void reorderGroups(view.groupId, orderedGroups[index - 1].groupId)}
            onMoveDown={() => void reorderGroups(view.groupId, orderedGroups[index + 1].groupId)}
          />
        ))}
      </ul>
    </SectionCard>
  );
};

/* --------------------------------------------------------------- group card */

interface GroupCardProps {
  view: CustomizationGroupView;
  draft?: GroupAttachmentDraft;
  caps: CapabilityView;
  canWrite: boolean;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (d: GroupAttachmentDraft) => void;
  onSave: () => void;
  onDetach: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const GroupCard: React.FC<GroupCardProps> = ({
  view, draft, caps, canWrite, busy, isFirst, isLast, onPatch, onSave, onDetach, onMoveUp, onMoveDown,
}) => {
  const { t } = useTranslation();
  if (!draft) {
    return (
      <li className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] p-4 text-xs text-[#6E5E4F]">
        {view.groupName} — {t('common.loading')}
      </li>
    );
  }
  const errors = validateGroupDraft(draft);
  const editable = canWrite && caps.declared;
  const activeAllowed = draft.options.filter((o) => o.active && o.allowed);

  return (
    <li className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Keyboard-accessible reorder: real buttons with distinct accessible names. */}
        {editable && (
          <div className="flex items-center gap-1">
            <button type="button" disabled={isFirst || busy} onClick={onMoveUp} aria-label={t('productEditor.options.moveUp')}
              className="p-1 rounded hover:bg-[#C48A56]/10 disabled:opacity-30">
              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button type="button" disabled={isLast || busy} onClick={onMoveDown} aria-label={t('productEditor.options.moveDown')}
              className="p-1 rounded hover:bg-[#C48A56]/10 disabled:opacity-30">
              <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <span className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{view.groupName}</span>
        <code className="rounded bg-[#8C7C6B]/10 px-1.5 py-0.5 text-[10px] text-[#8C7C6B]">{view.groupCode}</code>
        <span className="rounded-md bg-[#8C7C6B]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#6E5E4F]">
          {t(`productEditor.selection.${view.selectionType}`)}
        </span>
        {!view.groupActive && <span className="rounded-md bg-[#DC2626]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#DC2626]">{t('productEditor.groupInactive')}</span>}
        <span className="ml-auto font-mono text-[10px] text-[#8C7C6B]">v{draft.relationshipVersion ?? 0}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Required — only when the server declared it writable. */}
        <div className="flex items-end pb-1">
          {isGroupFieldEditable(caps, 'required') ? (
            <Toggle label={t('productEditor.options.requiredLabel')} checked={draft.required}
              disabled={!editable || busy} onChange={(v) => onPatch({ ...draft, required: v })} />
          ) : (
            <StaticValue label={t('productEditor.options.requiredLabel')} value={draft.required ? t('productEditor.requiredYes') : t('productEditor.requiredNo')} />
          )}
        </div>

        {isGroupFieldEditable(caps, 'displayOrder') ? (
          <Field label={t('productEditor.options.displayOrder')} error={errors.displayOrder ? t(errors.displayOrder) : undefined}>
            {({ id, describedBy }) => (
              <input id={id} type="text" inputMode="numeric" value={draft.displayOrder} disabled={!editable || busy}
                aria-invalid={!!errors.displayOrder} aria-describedby={describedBy}
                onChange={(e) => onPatch({ ...draft, displayOrder: e.target.value })} className={CONTROL_CLASS} />
            )}
          </Field>
        ) : (
          <StaticValue label={t('productEditor.options.displayOrder')} value={String(draft.displayOrder)} />
        )}

        {isGroupFieldEditable(caps, 'minimum') ? (
          <Field label={t('productEditor.options.min')} hint={t('productEditor.options.inheritHint')} error={errors.minimumSelections ? t(errors.minimumSelections) : undefined}>
            {({ id, describedBy }) => (
              <input id={id} type="text" inputMode="numeric" value={draft.minimumSelections} disabled={!editable || busy} placeholder={String(view.minimumSelections)}
                aria-invalid={!!errors.minimumSelections} aria-describedby={describedBy}
                onChange={(e) => onPatch({ ...draft, minimumSelections: e.target.value })} className={CONTROL_CLASS} />
            )}
          </Field>
        ) : (
          <StaticValue label={t('productEditor.options.min')} value={String(view.minimumSelections)} hint={t('productEditor.options.inheritedHint')} />
        )}

        {isGroupFieldEditable(caps, 'maximum') ? (
          <Field label={t('productEditor.options.max')} hint={t('productEditor.options.inheritHint')} error={errors.maximumSelections ? t(errors.maximumSelections) : undefined}>
            {({ id, describedBy }) => (
              <input id={id} type="text" inputMode="numeric" value={draft.maximumSelections} disabled={!editable || busy}
                placeholder={view.maximumSelections === null ? t('productEditor.options.unbounded') : String(view.maximumSelections)}
                aria-invalid={!!errors.maximumSelections} aria-describedby={describedBy}
                onChange={(e) => onPatch({ ...draft, maximumSelections: e.target.value })} className={CONTROL_CLASS} />
            )}
          </Field>
        ) : (
          <StaticValue label={t('productEditor.options.max')} value={view.maximumSelections === null ? t('productEditor.options.unbounded') : String(view.maximumSelections)} hint={t('productEditor.options.inheritedHint')} />
        )}
      </div>

      {isGroupFieldEditable(caps, 'default') && (
        <Field label={t('productEditor.options.defaultOption')} hint={t('productEditor.options.defaultHintR2')} error={errors.defaultOptionId ? t(errors.defaultOptionId) : undefined}>
          {({ id, describedBy }) => (
            <select id={id} value={draft.defaultOptionId ?? ''} disabled={!editable || busy} aria-describedby={describedBy}
              onChange={(e) => onPatch({ ...draft, defaultOptionId: e.target.value === '' ? null : e.target.value })} className={CONTROL_CLASS}>
              <option value="">{t('productEditor.options.none')}</option>
              {activeAllowed.map((o) => <option key={o.optionId} value={o.optionId}>{o.optionId === draft.defaultOptionId ? '★ ' : ''}{labelFor(o.optionId, view)}</option>)}
            </select>
          )}
        </Field>
      )}

      {/* Allowed-option subset: rendered as an editable roster only when declared. */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-[#6E5E4F]">
          {isGroupFieldEditable(caps, 'options') ? t('productEditor.options.subsetEdit') : t('productEditor.options.subsetReadonly')}
        </p>
        {draft.options.length === 0 && <p className="text-[11px] text-[#8C7C6B]">{t('productEditor.options.noActiveOptions')}</p>}
        <ul className="space-y-2">
          {draft.options.map((o, i) => {
            const name = labelFor(o.optionId, view);
            const priceErrKey = errors[`option.${i}.price`];
            const orderErrKey = errors[`option.${i}.order`];
            return (
              <li key={o.optionId} className="flex flex-wrap items-center gap-2 text-xs">
                {isGroupFieldEditable(caps, 'options') ? (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={o.allowed} disabled={!editable || busy || !o.active}
                      onChange={(e) => onPatch({ ...draft, options: draft.options.map((x, xi) => xi === i ? { ...x, allowed: e.target.checked } : x) })} />
                    <span className="font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{name}</span>
                  </label>
                ) : (
                  <span className="font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{name}</span>
                )}
                {!o.active && <span className="rounded bg-[#8C7C6B]/10 px-1.5 py-0.5 text-[10px] text-[#8C7C6B]">{t('badge.inactive')}</span>}
                {draft.defaultOptionId === o.optionId && (
                  <span className="rounded-md bg-[#C48A56]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#8A5A2B] dark:text-[#D4A87A]">{t('productEditor.options.defaultBadge')}</span>
                )}
                {isGroupFieldEditable(caps, 'options') && (
                  <>
                    <input type="text" inputMode="decimal" value={o.priceOverride} disabled={!editable || busy} placeholder={t('productEditor.options.priceInherit')}
                      aria-label={`${t('productEditor.options.priceOverride')}: ${name}`} aria-invalid={!!priceErrKey}
                      onChange={(e) => onPatch({ ...draft, options: draft.options.map((x, xi) => xi === i ? { ...x, priceOverride: e.target.value } : x) })}
                      className="w-28 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] px-2 py-1 text-xs" />
                    <input type="text" inputMode="numeric" value={o.displayOrder} disabled={!editable || busy} placeholder={t('productEditor.options.orderInherit')}
                      aria-label={`${t('productEditor.options.optionOrder')}: ${name}`} aria-invalid={!!orderErrKey}
                      onChange={(e) => onPatch({ ...draft, options: draft.options.map((x, xi) => xi === i ? { ...x, displayOrder: e.target.value } : x) })}
                      className="w-16 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] px-2 py-1 text-xs" />
                  </>
                )}
                {priceErrKey && <span className="text-[11px] font-semibold text-[#DC2626]">{t(priceErrKey)}</span>}
                {orderErrKey && <span className="text-[11px] font-semibold text-[#DC2626]">{t(orderErrKey)}</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {editable && (
        <div className="flex items-center justify-end gap-2">
          <button type="button" disabled={busy} onClick={onDetach}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DC2626]/40 text-[#DC2626] text-xs font-bold hover:bg-[#DC2626]/10 disabled:opacity-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {t('productEditor.options.detach')}
          </button>
          <button type="button" disabled={busy || Object.keys(errors).length > 0} onClick={onSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </div>
      )}
    </li>
  );
};

/** Prefer the effective view's option name (has the ones still allowed); else id fragment. */
function labelFor(optionId: string, view: CustomizationGroupView): string {
  const eff = view.allowedOptions.find((o) => o.optionId === optionId);
  return eff ? eff.name : optionId.slice(0, 8);
}
