import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, X, Lock, RefreshCw, Loader2, Pencil, Scale,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  unitsAdminApi, UnitRow, UnitType, CreateUnitInput, UpdateUnitInput,
} from '../../lib/inventoryMgmtAdmin';

const UNIT_TYPES: UnitType[] = ['MASS', 'VOLUME', 'COUNT', 'PACKAGE'];

interface FormState {
  code: string;
  name: string;
  type: UnitType;
  decimalScale: string;
  factor: string;
  baseUnit: boolean;
  active: boolean;
  version: number;
}

const EMPTY_FORM: FormState = {
  code: '', name: '', type: 'MASS', decimalScale: '2', factor: '1', baseUnit: false, active: true, version: 0,
};

/**
 * Unit-of-measure master editor. Replaces the previously hard-coded reference
 * table with the real M2 surface: GET /units-of-measure/management (uom:manage)
 * for the full roster incl. inactive + version, POST/PATCH for writes. Scale is
 * bounded 0..6 and the conversion factor must be positive (mirrored server-side).
 * Updates echo the optimistic-lock version; a stale value reloads. No hard
 * delete — deactivating is the safe path.
 */
export const UomAdminView: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const canManage = hasPermission('uom:manage');

  const [rows, setRows] = useState<UnitRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const h = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(h);
  }, [feedback]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !canManage) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    setLoadError(null);
    try {
      setRows(await unitsAdminApi.list(ctrl.signal));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) setLoadError(t('uomAdmin.forbidden'));
      else setLoadError(t('uomAdmin.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, canManage, t]);

  useEffect(() => { void loadData(); }, [loadData]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setEditing(true);
  };

  const openEdit = (u: UnitRow) => {
    setForm({
      code: u.code, name: u.name, type: u.type,
      decimalScale: String(u.decimalScale), factor: String(u.conversionFactorToBase),
      baseUnit: u.baseUnit, active: u.active, version: u.version,
    });
    setEditingId(u.unitId);
    setFormError(null);
    setEditing(true);
  };

  const validate = (): string | null => {
    if (!form.code.trim()) return t('uomAdmin.errCodeRequired');
    if (!form.name.trim()) return t('uomAdmin.errNameRequired');
    const scale = Number(form.decimalScale);
    if (!Number.isInteger(scale) || scale < 0 || scale > 6) return t('uomAdmin.errScaleInvalid');
    const factor = Number(form.factor);
    if (!Number.isFinite(factor) || factor <= 0) return t('uomAdmin.errFactorInvalid');
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setFormError(v); return; }
    setIsSubmitting(true);
    setFormError(null);
    const base: CreateUnitInput = {
      code: form.code.trim(),
      name: form.name.trim(),
      type: form.type,
      decimalScale: Number(form.decimalScale),
      factor: Number(form.factor),
      baseUnit: form.baseUnit,
      active: form.active,
    };
    try {
      if (editingId) {
        const payload: UpdateUnitInput = { ...base, version: form.version };
        await unitsAdminApi.update(editingId, payload);
        setFeedback({ kind: 'success', text: t('uomAdmin.updatedMsg') });
      } else {
        await unitsAdminApi.create(base);
        setFeedback({ kind: 'success', text: t('uomAdmin.createdMsg') });
      }
      setEditing(false);
      void loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_CODE') setFormError(t('uomAdmin.errDuplicate'));
        else if (err.code === 'VERSION_CONFLICT') { setFormError(t('uomAdmin.errConflict')); setEditing(false); void loadData(); }
        else if (err.status === 403) setFormError(t('uomAdmin.forbidden'));
        else if (err.status === 404) setFormError(t('uomAdmin.errNotFound'));
        else if (err.status === 400) setFormError(err.message || t('uomAdmin.errValidation'));
        else setFormError(t('uomAdmin.errNetwork'));
      } else setFormError(t('uomAdmin.errNetwork'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('uomAdmin.title')}</h2>
        <div className="rounded-xl border p-6 text-center text-sm text-[#6E5E4F] flex items-center gap-2 justify-center">
          <Lock className="w-4 h-4 text-[#C48A56]" /> {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('uomAdmin.title')}</h2>
        <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-4 text-xs font-medium text-[#B45309]">
          {t('uomAdmin.forbidden')}
        </div>
      </div>
    );
  }

  const showSkeleton = isLoading && rows.length === 0;
  const showEmpty = !isLoading && !loadError && rows.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('uomAdmin.title')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('uomAdmin.description')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={openCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors">
            <Plus className="w-4 h-4" /> {t('uomAdmin.create')}
          </button>
          <button type="button" onClick={() => void loadData()} disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 text-[#C48A56] ${isLoading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between gap-2 ${
          feedback.kind === 'success' ? 'border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]'
            : 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]'}`}>
          <span className="flex items-center gap-2">
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {feedback.text}
          </span>
          <button type="button" onClick={() => setFeedback(null)} aria-label={t('common.close')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] overflow-hidden">
        {loadError && (
          <div className="p-6 text-center space-y-3">
            <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto" />
            <p className="text-xs font-semibold text-[#DC2626]">{loadError}</p>
            <button type="button" onClick={() => void loadData()} className="text-xs font-bold text-[#C48A56] hover:underline">{t('common.retry')}</button>
          </div>
        )}
        {showSkeleton && (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-[#F0EFED] dark:bg-[#26221F] animate-pulse" />)}
          </div>
        )}
        {showEmpty && (
          <div className="p-10 text-center space-y-2">
            <Scale className="w-6 h-6 text-[#8C7C6B] mx-auto" />
            <p className="text-sm font-semibold text-[#6E5E4F]">{t('uomAdmin.empty')}</p>
          </div>
        )}
        {!loadError && !showSkeleton && !showEmpty && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] dark:text-[#A89D94] uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="py-3 px-4">{t('uomAdmin.colCode')}</th>
                  <th className="py-3 px-4">{t('uomAdmin.colName')}</th>
                  <th className="py-3 px-4">{t('uomAdmin.colType')}</th>
                  <th className="py-3 px-4 text-center">{t('uomAdmin.colScale')}</th>
                  <th className="py-3 px-4 text-right">{t('uomAdmin.colFactor')}</th>
                  <th className="py-3 px-4 text-center">{t('uomAdmin.colBase')}</th>
                  <th className="py-3 px-4 text-center">{t('uomAdmin.colStatus')}</th>
                  <th className="py-3 px-4 text-center">v</th>
                  <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                {rows.map((u) => (
                  <tr key={u.unitId} className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F] transition-colors">
                    <td className="py-3 px-4 font-mono text-[#8C7C6B]">{u.code}</td>
                    <td className="py-3 px-4 font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{u.name}</td>
                    <td className="py-3 px-4 text-[#6E5E4F] dark:text-[#A89D94]">{t(`uomAdmin.type.${u.type}`)}</td>
                    <td className="py-3 px-4 text-center font-mono text-[#6E5E4F] dark:text-[#A89D94]">{u.decimalScale}</td>
                    <td className="py-3 px-4 text-right font-mono text-[#6E5E4F] dark:text-[#A89D94]">{Number(u.conversionFactorToBase).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${u.baseUnit ? 'bg-[#C48A56]/15 text-[#A36C3D]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                        {u.baseUnit ? t('badge.yes') : t('badge.no')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${u.active ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                        {u.active ? t('badge.active') : t('badge.inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[#8C7C6B]">{u.version}</td>
                    <td className="py-3 px-4 text-right">
                      <button type="button" onClick={() => openEdit(u)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-[#A36C3D] dark:text-[#D4A87A] hover:bg-[#C48A56]/10 transition-colors">
                        <Pencil className="w-3.5 h-3.5" /> {t('uomAdmin.edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setEditing(false)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{editingId ? t('uomAdmin.editTitle') : t('uomAdmin.createTitle')}</h3>
              <button type="button" onClick={() => setEditing(false)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('uomAdmin.fieldCode') + ' *'}>
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={20} className={inputCls} />
              </Field>
              <Field label={t('uomAdmin.fieldType') + ' *'}>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as UnitType })} className={inputCls}>
                  {UNIT_TYPES.map((ty) => <option key={ty} value={ty}>{t(`uomAdmin.type.${ty}`)}</option>)}
                </select>
              </Field>
            </div>

            <Field label={t('uomAdmin.fieldName') + ' *'}>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('uomAdmin.fieldScale')}>
                <input type="number" step="1" min="0" max="6" value={form.decimalScale} onChange={(e) => setForm({ ...form, decimalScale: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t('uomAdmin.fieldFactor')}>
                <input type="number" step="0.00000001" min="0" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={form.baseUnit} onChange={(e) => setForm({ ...form, baseUnit: e.target.checked })} className="accent-[#C48A56]" />
                {t('uomAdmin.fieldBaseUnit')}
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[#C48A56]" />
                {t('uomAdmin.fieldActive')}
              </label>
            </div>

            {formError && (
              <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold disabled:opacity-60 transition-colors">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const inputCls = 'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{label}</label>
    {children}
  </div>
);
