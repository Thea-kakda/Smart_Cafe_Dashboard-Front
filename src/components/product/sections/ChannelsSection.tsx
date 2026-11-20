/**
 * Round 1 "Stores & Channels" tab (Slice 4A §12). Configures, for ONE chosen
 * branch: the per-channel publication policy, that channel's weekly schedule
 * windows, and the manual sold-out control.
 *
 * Three separate aggregates are involved and each has its own lock token, which
 * is why nothing here shares a version:
 *   - the channel publication (`ChannelPolicyResponse.version`), advanced by a
 *     publication write AND by a schedule replacement, because schedules belong
 *     to that aggregate;
 *   - the store-product row (`storeProductVersion`), the token for sold-out;
 *   - the product itself, untouched by this tab.
 *
 * Schedule windows are wall-clock `HH:mm` strings end to end: `<input type="time">`
 * yields that shape, the draft keeps it, and the payload sends it. There is no
 * `Date`, no `toISOString()` and no timezone math anywhere in this path, so a
 * "09:00" window cannot silently become "02:00" on another machine. The store
 * timezone is only ever used for the sold-out cut-off, which really is an
 * absolute instant.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useAuth } from '../../../context/AuthContext';
import { useStore } from '../../../context/StoreContext';
import { ApiError } from '../../../lib/api';
import { ChannelName, ChannelPolicy, ChannelScheduleWindow, productChannelsApi } from '../../../lib/productEditor';
import { storeProductsApi } from '../../../lib/storeProducts';
import {
  buildChannelConfig, buildSoldOutPayload, canDeleteChannel, ChannelConfigDraft, editorErrorKey,
  normalizeWindow, scheduleDirty, validateScheduleSet, validateScheduleWindow,
} from '../../../lib/productEditorState';
import { Banner, CONTROL_CLASS, Field, GroupLabel, SectionCard, Toggle } from '../EditorPrimitives';

export interface ChannelsSectionProps {
  productId: string;
}

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const ChannelsSection: React.FC<ChannelsSectionProps> = ({ productId }) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { stores, rawStores, selectedStoreId, setSelectedStoreId } = useStore();

  const canRead = hasPermission('product-channel:read');
  const canWrite = hasPermission('product-channel:manage');
  const canReadOffer = hasPermission('branch-product:read');

  const [policies, setPolicies] = useState<ChannelPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const storeId = selectedStoreId || stores[0]?.id || '';
  /**
   * Only ever used to turn the sold-out cut-off into an absolute instant. When
   * the branch row carries no timezone the control is refused rather than
   * guessed, because a wrong zone silently shifts the moment by hours.
   */
  const storeTimezone = useMemo(
    () => rawStores.find((s) => s.storeId === storeId)?.timezone ?? null,
    [rawStores, storeId],
  );

  const load = useCallback(async () => {
    if (!canRead || !storeId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      setPolicies(await productChannelsApi.list(storeId, productId));
    } catch (err) {
      setErrorKey(editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1));
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, [canRead, storeId, productId]);

  useEffect(() => { void load(); }, [load]);

  const fail = (err: unknown) => {
    setNotice(null);
    setErrorKey(editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1));
  };

  const saveChannel = async (channel: ChannelName, draft: ChannelConfigDraft, policy: ChannelPolicy) => {
    const input = buildChannelConfig(policy, draft);
    if (!input) { setErrorKey('channelAdmin.errConfigInvalid'); return; }
    setBusy(channel);
    try {
      await productChannelsApi.upsert(storeId, productId, channel, input);
      setNotice(t('channelAdmin.savedMsg'));
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const revertChannel = async (channel: ChannelName) => {
    setBusy(channel);
    try {
      await productChannelsApi.remove(storeId, productId, channel);
      setNotice(t('channelAdmin.revertedMsg'));
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  if (!canRead) return <Banner tone="info" text={t('channelAdmin.forbidden')} />;
  if (stores.length === 0) return <Banner tone="info" text={t('channelAdmin.noBranch')} />;

  return (
    <SectionCard
      title={t('channelAdmin.title')}
      description={t('channelAdmin.description')}
      actions={
        <>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <span>{t('channelAdmin.branch')}</span>
            <select value={storeId} onChange={(e) => setSelectedStoreId(e.target.value)}
              className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2 py-1.5 text-xs font-semibold">
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('common.refresh')}
          </button>
        </>
      }
    >
      {!canWrite && <Banner tone="info" text={t('channelAdmin.readOnly')} />}
      {loading && policies.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>
      )}
      {errorKey && <Banner tone="bad" role="alert" text={t(errorKey)} dismissLabel={t('common.close')} onDismiss={() => setErrorKey(null)} />}
      {notice && <Banner tone="ok" role="status" text={notice} dismissLabel={t('common.close')} onDismiss={() => setNotice(null)} />}

      <ul className="space-y-2">
        {policies.map((policy) => {
          const expanded = open === policy.channel;
          return (
            <li key={policy.channel} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setOpen(expanded ? null : policy.channel)} aria-expanded={expanded}
                  className="flex flex-1 items-center gap-3 text-left">
                  {expanded ? <ChevronDown className="w-4 h-4 text-[#8C7C6B]" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-[#8C7C6B]" aria-hidden="true" />}
                  <span className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t(`channelAdmin.name.${policy.channel}`)}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${policy.inherited ? 'bg-[#8C7C6B]/15 text-[#8C7C6B]' : 'bg-[#C48A56]/15 text-[#8A5A2B] dark:text-[#D4A87A]'}`}>
                    {policy.inherited ? t('channelAdmin.inherited') : t('channelAdmin.explicit')}
                  </span>
                  <span className="text-[11px] text-[#6E5E4F]">
                    {policy.visible ? t('channelAdmin.visible') : t('channelAdmin.hidden')}
                    {' · '}
                    {policy.orderable ? t('channelAdmin.orderable') : t('channelAdmin.notOrderable')}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-[#8C7C6B]">v{policy.version}</span>
                </button>
              </div>
              {expanded && (
                <div className="border-t border-[#EFECE8] dark:border-[#2B2522] p-4 space-y-4">
                  <ChannelEditor
                    policy={policy}
                    canWrite={canWrite}
                    busy={busy === policy.channel}
                    onSave={(draft) => void saveChannel(policy.channel, draft, policy)}
                    onRevert={() => void revertChannel(policy.channel)}
                    canDelete={canDeleteChannel(policy)}
                  />
                  {!policy.inherited && (
                    <ScheduleEditor
                      storeId={storeId} productId={productId} channel={policy.channel}
                      channelVersion={policy.version} canWrite={canWrite} onReloaded={() => void load()}
                    />
                  )}
                  {policy.inherited && <p className="text-[11px] text-[#6E5E4F]">{t('channelAdmin.scheduleNeedsPublication')}</p>}
                  {canReadOffer && storeTimezone !== null && (
                    <SoldOutPanel
                      storeId={storeId} productId={productId} timezone={storeTimezone} canWrite={canWrite}
                      onSaved={() => setNotice(t('channelAdmin.soldOutSaved'))} onError={fail}
                    />
                  )}
                  {canReadOffer && storeTimezone === null && (
                    <Banner tone="warn" text={t('channelAdmin.errNoTimezone')} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
};

/* ---------------------------------------------------------------- sub-editors */

interface ChannelEditorProps {
  policy: ChannelPolicy;
  canWrite: boolean;
  busy: boolean;
  canDelete: boolean;
  onSave: (draft: ChannelConfigDraft) => void;
  onRevert: () => void;
}

const ChannelEditor: React.FC<ChannelEditorProps> = ({ policy, canWrite, busy, canDelete, onSave, onRevert }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ChannelConfigDraft>({
    visible: policy.visible,
    orderable: policy.orderable,
    displayName: policy.displayName ?? '',
    displayDescription: policy.displayDescription ?? '',
    displayOrder: String(policy.displayOrder ?? 0),
    availableFrom: policy.availableFrom ? policy.availableFrom.slice(0, 16) : '',
    availableUntil: policy.availableUntil ? policy.availableUntil.slice(0, 16) : '',
    timezone: policy.timezone ?? '',
  });

  // The authoritative policy is the only owner of these values: a re-read (for
  // instance after a sibling write) must reset the draft, not merge into it.
  useEffect(() => {
    setDraft({
      visible: policy.visible,
      orderable: policy.orderable,
      displayName: policy.displayName ?? '',
      displayDescription: policy.displayDescription ?? '',
      displayOrder: String(policy.displayOrder ?? 0),
      availableFrom: policy.availableFrom ? policy.availableFrom.slice(0, 16) : '',
      availableUntil: policy.availableUntil ? policy.availableUntil.slice(0, 16) : '',
      timezone: policy.timezone ?? '',
    });
  }, [policy]);

  const invalid = buildChannelConfig(policy, draft) === null;
  const dirty = draft.visible !== policy.visible
    || draft.orderable !== policy.orderable
    || draft.displayName !== (policy.displayName ?? '')
    || draft.displayDescription !== (policy.displayDescription ?? '')
    || draft.displayOrder !== String(policy.displayOrder ?? 0)
    || draft.timezone !== (policy.timezone ?? '')
    || draft.availableFrom !== (policy.availableFrom ? policy.availableFrom.slice(0, 16) : '')
    || draft.availableUntil !== (policy.availableUntil ? policy.availableUntil.slice(0, 16) : '');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-6">
        <Toggle label={t('channelAdmin.visible')} checked={draft.visible} disabled={!canWrite} onChange={(v) => setDraft({ ...draft, visible: v })} />
        <Toggle label={t('channelAdmin.orderable')} checked={draft.orderable} disabled={!canWrite}
          onChange={(v) => setDraft({ ...draft, orderable: v })} hint={t('channelAdmin.orderableHint')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('channelAdmin.fieldDisplayName')}>
          {({ id }) => <input id={id} value={draft.displayName} maxLength={150} disabled={!canWrite}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} className={CONTROL_CLASS} />}
        </Field>
        <Field label={t('channelAdmin.fieldDisplayOrder')}>
          {({ id }) => <input id={id} type="text" inputMode="numeric" value={draft.displayOrder} disabled={!canWrite}
            onChange={(e) => setDraft({ ...draft, displayOrder: e.target.value })} className={CONTROL_CLASS} />}
        </Field>
      </div>
      <Field label={t('channelAdmin.fieldDisplayDescription')}>
        {({ id }) => <textarea id={id} rows={2} maxLength={500} value={draft.displayDescription} disabled={!canWrite}
          onChange={(e) => setDraft({ ...draft, displayDescription: e.target.value })} className={CONTROL_CLASS} />}
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('channelAdmin.fieldAvailableFrom')} hint={t('channelAdmin.absoluteHint')}>
          {({ id }) => <input id={id} type="datetime-local" value={draft.availableFrom} disabled={!canWrite}
            onChange={(e) => setDraft({ ...draft, availableFrom: e.target.value })} className={CONTROL_CLASS} />}
        </Field>
        <Field label={t('channelAdmin.fieldAvailableUntil')}>
          {({ id }) => <input id={id} type="datetime-local" value={draft.availableUntil} disabled={!canWrite}
            onChange={(e) => setDraft({ ...draft, availableUntil: e.target.value })} className={CONTROL_CLASS} />}
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        {canDelete && (
          <button type="button" onClick={onRevert} disabled={!canWrite || busy}
            className="px-3 py-2 rounded-xl border border-[#DC2626]/30 text-xs font-bold text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-50 transition-colors">
            {t('channelAdmin.revert')}
          </button>
        )}
        <button type="button" onClick={() => onSave(draft)} disabled={!canWrite || busy || !dirty || invalid}
          title={invalid ? t('channelAdmin.errConfigInvalid') : undefined}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
          {t('common.save')}
        </button>
      </div>
    </div>
  );
};

interface ScheduleEditorProps {
  storeId: string;
  productId: string;
  channel: ChannelName;
  channelVersion: number;
  canWrite: boolean;
  onReloaded: () => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ storeId, productId, channel, channelVersion, canWrite, onReloaded }) => {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<ChannelScheduleWindow[]>([]);
  const [draft, setDraft] = useState<ChannelScheduleWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const read = useCallback(async () => {
    setLoading(true);
    setErrorKey(null);
    try {
      const rows = await productChannelsApi.schedules(storeId, productId, channel);
      const normalized = rows.map(normalizeWindow);
      setLoaded(normalized);
      setDraft(normalized);
    } catch (err) {
      setErrorKey(editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1));
    } finally {
      setLoading(false);
    }
  }, [storeId, productId, channel]);

  useEffect(() => { void read(); }, [read]);

  const problems = useMemo(() => validateScheduleSet(draft), [draft]);
  const dirty = useMemo(() => scheduleDirty(loaded, draft), [loaded, draft]);

  const setWindow = (index: number, patch: Partial<ChannelScheduleWindow>) =>
    setDraft((rows) => rows.map((r, i) => (i === index ? normalizeWindow({ ...r, ...patch }) : r)));

  const addWindow = () =>
    setDraft((rows) => [...rows, normalizeWindow({ dayOfWeek: rows.length % 7 + 1, startTime: '09:00', endTime: '17:00', active: true })]);

  const save = async () => {
    setSaving(true);
    setErrorKey(null);
    try {
      await productChannelsApi.replaceSchedules(storeId, productId, channel, draft.map(normalizeWindow), channelVersion);
      await read();
      // Replacing windows advances the channel aggregate, so the parent re-reads
      // the policy list instead of keeping a now-stale version chip.
      onReloaded();
    } catch (err) {
      setErrorKey(editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GroupLabel text={t('channelAdmin.scheduleTitle')}>
      <div className="space-y-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] p-3">
        <p className="text-[11px] text-[#6E5E4F]">{t('channelAdmin.scheduleHint')}</p>
        {loading && <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>}
        {errorKey && <Banner tone="bad" role="alert" text={t(errorKey)} dismissLabel={t('common.close')} onDismiss={() => setErrorKey(null)} />}
        {problems.map((key) => <Banner key={key} tone="warn" role="alert" text={t(key)} />)}

        {!loading && draft.length === 0 && <p className="text-xs text-[#6E5E4F]">{t('channelAdmin.scheduleEmpty')}</p>}

        <table className="w-full text-left text-xs">
          <caption className="sr-only">{t('channelAdmin.scheduleCaption')}</caption>
          <thead className="text-[10px] uppercase tracking-wide text-[#6E5E4F]">
            <tr>
              <th scope="col">{t('channelAdmin.colDay')}</th>
              <th scope="col">{t('channelAdmin.colStart')}</th>
              <th scope="col">{t('channelAdmin.colEnd')}</th>
              <th scope="col">{t('channelAdmin.colActive')}</th>
              <th scope="col" className="text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((w, index) => {
              const rowProblem = validateScheduleWindow(w);
              return (
                <tr key={`${w.dayOfWeek}-${w.startTime}-${w.endTime}-${index}`}>
                  <td className="py-1">
                    <label className="sr-only" htmlFor={`day-${index}`}>{t('channelAdmin.colDay')}</label>
                    <select id={`day-${index}`} value={w.dayOfWeek} disabled={!canWrite}
                      onChange={(e) => setWindow(index, { dayOfWeek: Number(e.target.value) })}
                      className="rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2 py-1 text-xs">
                      {DAYS.map((d) => <option key={d} value={d}>{t(`channelAdmin.day.${d}`)}</option>)}
                    </select>
                  </td>
                  <td className="py-1">
                    <label className="sr-only" htmlFor={`start-${index}`}>{t('channelAdmin.colStart')}</label>
                    <input id={`start-${index}`} type="time" step={60} value={w.startTime} disabled={!canWrite}
                      aria-invalid={!!rowProblem} onChange={(e) => setWindow(index, { startTime: e.target.value })}
                      className="rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2 py-1 text-xs font-mono" />
                  </td>
                  <td className="py-1">
                    <label className="sr-only" htmlFor={`end-${index}`}>{t('channelAdmin.colEnd')}</label>
                    <input id={`end-${index}`} type="time" step={60} value={w.endTime} disabled={!canWrite}
                      aria-invalid={!!rowProblem} onChange={(e) => setWindow(index, { endTime: e.target.value })}
                      className="rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-2 py-1 text-xs font-mono" />
                  </td>
                  <td className="py-1">
                    <input id={`active-${index}`} type="checkbox" checked={w.active} disabled={!canWrite}
                      aria-label={t('channelAdmin.colActive')} onChange={(e) => setWindow(index, { active: e.target.checked })}
                      className="accent-[#C48A56] h-4 w-4" />
                  </td>
                  <td className="py-1 text-right">
                    <button type="button" disabled={!canWrite} onClick={() => setDraft((rows) => rows.filter((_, i) => i !== index))}
                      aria-label={t('channelAdmin.removeWindow')} className="p-1 rounded text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-30">
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    {rowProblem && <span className="ml-2 text-[10px] font-semibold text-[#DC2626]">{t(rowProblem)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex items-center justify-between">
          <button type="button" onClick={addWindow} disabled={!canWrite}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t('channelAdmin.addWindow')}
          </button>
          <button type="button" onClick={() => void save()} disabled={!canWrite || saving || !dirty || problems.length > 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CalendarClock className="w-4 h-4" aria-hidden="true" />}
            {t('channelAdmin.saveSchedule')}
          </button>
        </div>
      </div>
    </GroupLabel>
  );
};

interface SoldOutPanelProps {
  storeId: string;
  productId: string;
  timezone: string;
  canWrite: boolean;
  onSaved: () => void;
  onError: (err: unknown) => void;
}

const SoldOutPanel: React.FC<SoldOutPanelProps> = ({ storeId, productId, timezone, canWrite, onSaved, onError }) => {
  const { t } = useTranslation();
  const [version, setVersion] = useState<number | null>(null);
  const [available, setAvailable] = useState(true);
  const [untilWallClock, setUntilWallClock] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const read = useCallback(async () => {
    setLoading(true);
    setErrorKey(null);
    try {
      // The store-product row owns the sold-out fields and its own version, so
      // this panel reads it directly instead of assuming the product version.
      const row = await storeProductsApi.get(storeId, productId);
      setVersion(row.storeProductVersion);
      setAvailable(row.branchAvailable);
      setUntilWallClock('');
    } catch (err) {
      setErrorKey(editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1));
      setVersion(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, productId]);

  useEffect(() => { void read(); }, [read]);

  const payload = buildSoldOutPayload({ available, untilWallClock, storeTimezone: timezone, expectedVersion: version ?? 0 });
  const invalidWhenSoldOut = !available && untilWallClock.trim() !== '' && payload === null;

  const save = async () => {
    if (!payload || version === null) return;
    setSaving(true);
    try {
      await productChannelsApi.setSoldOut(storeId, productId, payload);
      onSaved();
      await read();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GroupLabel text={t('channelAdmin.soldOutTitle')}>
      <div className="space-y-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] p-3">
        {loading && <p className="flex items-center gap-2 text-xs text-[#6E5E4F]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>}
        {errorKey && <Banner tone="bad" role="alert" text={t(errorKey)} dismissLabel={t('common.close')} onDismiss={() => setErrorKey(null)} />}
        {!loading && version === null && <Banner tone="warn" text={t('channelAdmin.errNotOffered')} />}
        {version !== null && (
          <>
            <Toggle label={t('channelAdmin.availableForSale')} checked={available} disabled={!canWrite} onChange={setAvailable}
              hint={t('channelAdmin.soldOutHint')} />
            <Field label={t('channelAdmin.soldOutUntil')} hint={t('channelAdmin.soldOutTzHint')}
              error={invalidWhenSoldOut ? t('channelAdmin.errInstant') : undefined}>
              {({ id, describedBy }) => (
                <input id={id} type="datetime-local" value={untilWallClock} disabled={!canWrite || available} aria-describedby={describedBy}
                  onChange={(e) => setUntilWallClock(e.target.value)} className={CONTROL_CLASS} />
              )}
            </Field>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[#8C7C6B]">{t('channelAdmin.storeProductVersion')} <span className="font-mono">v{version}</span></p>
              <button type="button" onClick={() => void save()} disabled={!canWrite || saving || payload === null || invalidWhenSoldOut}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
                {t('channelAdmin.applySoldOut')}
              </button>
            </div>
          </>
        )}
      </div>
    </GroupLabel>
  );
};
