import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, X, Lock, RefreshCw, Loader2, Pencil, Leaf,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  ingredientsAdminApi, unitsAdminApi,
  IngredientRow, ActiveUnitRow, CreateIngredientInput, UpdateIngredientInput,
} from '../../lib/inventoryMgmtAdmin';

interface FormState {
  code: string;
  name: string;
  baseUnitId: string;
  standardCost: string;
  trackInventory: boolean;
  trackBatches: boolean;
  shelfLifeDays: string;
  active: boolean;
  version: number;
}

const EMPTY_FORM: FormState = {
  code: '', name: '', baseUnitId: '', standardCost: '',
  trackInventory: true, trackBatches: false, shelfLifeDays: '', active: true, version: 0,
};

/**
 * Ingredient master editor. Raw-material (ingredient) records were previously a
 * documented BACKEND API GAP in the dashboard — this view closes it against the
 * real M2 endpoints: GET /api/v1/ingredients (inventory:read) for the roster and
 * POST/PATCH (ingredient:manage) for writes. Updates echo the optimistic-lock
 * version; a stale value reloads the list. There is no hard delete — deactivating
 * is the safe path. The base-unit picker reads the unauthenticated active roster.
 */
export const IngredientMasterView: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const canRead = hasPermission('inventory:read');
  const canManage = hasPermission('ingredient:manage');

  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [units, setUnits] = useState<ActiveUnitRow[]>([]);
  const [search, setSearch] = useState('');
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
    if (!isAuthenticated || !canRead) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await ingredientsAdminApi.list({ q: search.trim(), size: 100 }, ctrl.signal);
      setRows(result.items);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) setLoadError(t('ingredientAdmin.forbidden'));
      else setLoadError(t('ingredientAdmin.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, canRead, search, t]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Base-unit roster for the picker loads once (unauthenticated POS-facing list).
  useEffect(() => {
    if (!isAuthenticated || !canRead) return;
    const ctrl = new AbortController();
    unitsAdminApi.listActive(ctrl.signal)
      .then(setUnits)
      .catch(() => setUnits([]));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, canRead]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setEditing(true);
  };

  const openEdit = (i: IngredientRow) => {
    setForm({
      code: i.code, name: i.name, baseUnitId: i.baseUnitId,
      standardCost: String(i.standardCost), trackInventory: i.trackInventory,
      trackBatches: i.trackBatches, shelfLifeDays: i.shelfLifeDays != null ? String(i.shelfLifeDays) : '',
      active: i.active, version: i.version,
    });
    setEditingId(i.ingredientId);
    setFormError(null);
    setEditing(true);
  };

  const validate = (): string | null => {
    if (!form.code.trim()) return t('ingredientAdmin.errCodeRequired');
    if (!form.name.trim()) return t('ingredientAdmin.errNameRequired');
    if (!form.baseUnitId) return t('ingredientAdmin.errUnitRequired');
    const cost = Number(form.standardCost || '0');
    if (!Number.isFinite(cost) || cost < 0) return t('ingredientAdmin.errCostInvalid');
    if (form.shelfLifeDays.trim()) {
      const d = Number(form.shelfLifeDays);
      if (!Number.isInteger(d) || d <= 0) return t('ingredientAdmin.errShelfLifeInvalid');
    }
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setFormError(v); return; }
    setIsSubmitting(true);
    setFormError(null);
    const base: CreateIngredientInput = {
      code: form.code.trim(),
      name: form.name.trim(),
      baseUnitId: form.baseUnitId,
      standardCost: Number(form.standardCost || '0'),
      trackInventory: form.trackInventory,
      trackBatches: form.trackBatches,
      shelfLifeDays: form.shelfLifeDays.trim() ? Number(form.shelfLifeDays) : null,
      active: form.active,
    };
    try {
      if (editingId) {
        const payload: UpdateIngredientInput = { ...base, version: form.version };
        await ingredientsAdminApi.update(editingId, payload);
        setFeedback({ kind: 'success', text: t('ingredientAdmin.updatedMsg') });
      } else {
        await ingredientsAdminApi.create(base);
        setFeedback({ kind: 'success', text: t('ingredientAdmin.createdMsg') });
      }
      setEditing(false);
      void loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_CODE') setFormError(t('ingredientAdmin.errDuplicate'));
        else if (err.code === 'UNIT_NOT_FOUND') setFormError(t('ingredientAdmin.errUnitNotFound'));
        else if (err.code === 'VERSION_CONFLICT') { setFormError(t('ingredientAdmin.errConflict')); setEditing(false); void loadData(); }
        else if (err.status === 403) setFormError(t('ingredientAdmin.forbidden'));
        else if (err.status === 404) setFormError(t('ingredientAdmin.errNotFound'));
        else if (err.status === 400) setFormError(err.message || t('ingredientAdmin.errValidation'));
        else setFormError(t('ingredientAdmin.errNetwork'));
      } else setFormError(t('ingredientAdmin.errNetwork'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated || !canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('ingredientAdmin.title')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('ingredientAdmin.forbidden') : t('inv.signInPrompt')}</span>
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
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('ingredientAdmin.title')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('ingredientAdmin.description')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          {canManage && (
            <button type="button" onClick={openCreate}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors">
              <Plus className="w-4 h-4" /> {t('ingredientAdmin.create')}
            </button>
          )}
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

      {/* Search */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void loadData(); } }}
          placeholder={t('ingredientAdmin.searchPlaceholder')}
          className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs focus:border-[#C48A56] focus:outline-none"
        />
        <button type="button" onClick={() => void loadData()}
          className="shrink-0 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-xs font-semibold hover:border-[#C48A56] transition-colors">{t('common.search')}</button>
      </div>

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
            <Leaf className="w-6 h-6 text-[#8C7C6B] mx-auto" />
            <p className="text-sm font-semibold text-[#6E5E4F]">{t('ingredientAdmin.empty')}</p>
          </div>
        )}
        {!loadError && !showSkeleton && !showEmpty && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] dark:text-[#A89D94] uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="py-3 px-4">{t('ingredientAdmin.colCode')}</th>
                  <th className="py-3 px-4">{t('ingredientAdmin.colName')}</th>
                  <th className="py-3 px-4 text-center">{t('ingredientAdmin.colUnit')}</th>
                  <th className="py-3 px-4 text-right">{t('ingredientAdmin.colCost')}</th>
                  <th className="py-3 px-4 text-center">{t('ingredientAdmin.colBatches')}</th>
                  <th className="py-3 px-4 text-center">{t('ingredientAdmin.colStatus')}</th>
                  <th className="py-3 px-4 text-center">v</th>
                  <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                {rows.map((i) => (
                  <tr key={i.ingredientId} className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F] transition-colors">
                    <td className="py-3 px-4 font-mono text-[#8C7C6B]">{i.code}</td>
                    <td className="py-3 px-4 font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{i.name}</td>
                    <td className="py-3 px-4 text-center text-[#6E5E4F] dark:text-[#A89D94]">{i.baseUnitCode}</td>
                    <td className="py-3 px-4 text-right font-mono text-[#6E5E4F] dark:text-[#A89D94]">{`$${Number(i.standardCost).toFixed(2)}`}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${i.trackBatches ? 'bg-[#2563EB]/15 text-[#2563EB]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                        {i.trackBatches ? t('badge.yes') : t('badge.no')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${i.active ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                        {i.active ? t('badge.active') : t('badge.inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[#8C7C6B]">{i.version}</td>
                    <td className="py-3 px-4 text-right">
                      {canManage ? (
                        <button type="button" onClick={() => openEdit(i)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-[#A36C3D] dark:text-[#D4A87A] hover:bg-[#C48A56]/10 transition-colors">
                          <Pencil className="w-3.5 h-3.5" /> {t('ingredientAdmin.edit')}
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#8C7C6B]">—</span>
                      )}
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
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{editingId ? t('ingredientAdmin.editTitle') : t('ingredientAdmin.createTitle')}</h3>
              <button type="button" onClick={() => setEditing(false)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('ingredientAdmin.fieldCode') + ' *'}>
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={50} className={inputCls} />
              </Field>
              <Field label={t('ingredientAdmin.fieldUnit') + ' *'}>
                <select value={form.baseUnitId} onChange={(e) => setForm({ ...form, baseUnitId: e.target.value })} className={inputCls}>
                  <option value="">— {t('ingredientAdmin.selectUnit')} —</option>
                  {units.map((u) => <option key={u.unitId} value={u.unitId}>{u.name} ({u.code})</option>)}
                </select>
              </Field>
            </div>

            <Field label={t('ingredientAdmin.fieldName') + ' *'}>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('ingredientAdmin.fieldCost')}>
                <input type="number" step="0.0001" min="0" value={form.standardCost} onChange={(e) => setForm({ ...form, standardCost: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t('ingredientAdmin.fieldShelfLife')}>
                <input type="number" step="1" min="1" value={form.shelfLifeDays} onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })} className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={form.trackInventory} onChange={(e) => setForm({ ...form, trackInventory: e.target.checked })} className="accent-[#C48A56]" />
                {t('ingredientAdmin.fieldTrackInventory')}
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={form.trackBatches} onChange={(e) => setForm({ ...form, trackBatches: e.target.checked })} className="accent-[#C48A56]" />
                {t('ingredientAdmin.fieldTrackBatches')}
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[#C48A56]" />
              {t('ingredientAdmin.fieldActive')}
            </label>

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
