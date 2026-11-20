import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, XCircle, X, Lock, RefreshCw, Loader2,
  Pencil, ImageOff, FolderTree,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  categoriesAdminApi, ManagementCategory, CreateCategoryInput, UpdateCategoryInput,
} from '../../lib/catalogAdmin';
import { ImageUploadField } from '../catalog/ImageUploadField';

interface FormState {
  parentCategoryId: string;
  code: string;
  name: string;
  description: string;
  displayOrder: string;
  active: boolean;
  imageObjectKey: string | null;
  imageUrl: string | null;
  version: number;
}

const EMPTY_FORM: FormState = {
  parentCategoryId: '', code: '', name: '', description: '', displayOrder: '0',
  active: true, imageObjectKey: null, imageUrl: null, version: 0,
};

/**
 * Master-data category editor. Lists every category (active or not) from the
 * protected management read and creates/updates them, including an image chosen
 * through the File API. The version is echoed on save for optimistic locking; a
 * stale value reloads the list. No hard delete — inactive is the safe path.
 */
export const CategoryAdminView: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const canManage = hasPermission('category:manage');

  const [rows, setRows] = useState<ManagementCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);

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
      const result = await categoriesAdminApi.list(ctrl.signal);
      setRows(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) setLoadError(t('catAdmin.forbidden'));
      else setLoadError(t('catAdmin.loadError'));
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

  const openEdit = (c: ManagementCategory) => {
    setForm({
      parentCategoryId: c.parentCategoryId ?? '', code: c.code, name: c.name,
      description: c.description ?? '', displayOrder: String(c.displayOrder), active: c.active,
      imageObjectKey: c.imageObjectKey, imageUrl: c.imageUrl, version: c.version,
    });
    setEditingId(c.categoryId);
    setFormError(null);
    setEditing(true);
  };

  const onImageChange = (objectKey: string | null, url: string | null) =>
    setForm((f) => ({ ...f, imageObjectKey: objectKey, imageUrl: url }));

  const validate = (): string | null => {
    if (!form.code.trim()) return t('catAdmin.errCodeRequired');
    if (!form.name.trim()) return t('catAdmin.errNameRequired');
    if (!/^\d+$/.test(form.displayOrder.trim())) return t('catAdmin.errOrderInvalid');
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setFormError(v); return; }
    setIsSubmitting(true);
    setFormError(null);
    const base: CreateCategoryInput = {
      parentCategoryId: form.parentCategoryId || null,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      displayOrder: Number(form.displayOrder.trim()),
      active: form.active,
      imageObjectKey: form.imageObjectKey,
    };
    try {
      if (editingId) {
        const payload: UpdateCategoryInput = { ...base, version: form.version };
        await categoriesAdminApi.update(editingId, payload);
        setFeedback({ kind: 'success', text: t('catAdmin.updatedMsg') });
      } else {
        await categoriesAdminApi.create(base);
        setFeedback({ kind: 'success', text: t('catAdmin.createdMsg') });
      }
      setEditing(false);
      void loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_CODE') setFormError(t('catAdmin.errDuplicate'));
        else if (err.code === 'VERSION_CONFLICT') { setFormError(t('catAdmin.errConflict')); setEditing(false); void loadData(); }
        else if (err.code === 'PARENT_NOT_FOUND') setFormError(t('catAdmin.errParentNotFound'));
        else if (err.code === 'INVALID_PARENT') setFormError(t('catAdmin.errSelfParent'));
        else if (err.code === 'INVALID_OBJECT_KEY') setFormError(t('catAdmin.errImageKey'));
        else if (err.status === 403) setFormError(t('catAdmin.forbidden'));
        else if (err.status === 404) setFormError(t('catAdmin.errNotFound'));
        else if (err.status === 400) setFormError(err.message || t('catAdmin.errValidation'));
        else if (err.isNetworkError) setFormError(t('catAdmin.errNetwork'));
        else setFormError(t('catAdmin.errNetwork'));
      } else setFormError(t('catAdmin.errNetwork'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Parent options: every category except the one being edited (no self-parent).
  const parentOptions = rows.filter((c) => c.categoryId !== editingId);

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('catAdmin.title')}</h2>
        <div className="rounded-xl border p-6 text-center text-sm text-[#6E5E4F] flex items-center gap-2 justify-center">
          <Lock className="w-4 h-4 text-[#C48A56]" /> {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('catAdmin.title')}</h2>
        <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-4 text-xs font-medium text-[#B45309]">
          {t('catAdmin.forbidden')}
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
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('catAdmin.title')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('catAdmin.description')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={openCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors">
            <Plus className="w-4 h-4" /> {t('catAdmin.create')}
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
            : feedback.kind === 'warning' ? 'border-[#B45309]/30 bg-[#B45309]/10 text-[#B45309]'
              : 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]'}`}>
          <span className="flex items-center gap-2">
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : feedback.kind === 'warning' ? <AlertCircle className="w-4 h-4 shrink-0" />
                : <XCircle className="w-4 h-4 shrink-0" />}
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
            <FolderTree className="w-6 h-6 text-[#8C7C6B] mx-auto" />
            <p className="text-sm font-semibold text-[#6E5E4F]">{t('catAdmin.empty')}</p>
          </div>
        )}
        {!loadError && !showSkeleton && !showEmpty && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] dark:text-[#A89D94] uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="py-3 px-4">{t('catAdmin.colImage')}</th>
                  <th className="py-3 px-4">{t('catAdmin.colOrder')}</th>
                  <th className="py-3 px-4">{t('catAdmin.colName')}</th>
                  <th className="py-3 px-4">{t('catAdmin.colCode')}</th>
                  <th className="py-3 px-4">{t('catAdmin.colParent')}</th>
                  <th className="py-3 px-4">{t('catAdmin.colStatus')}</th>
                  <th className="py-3 px-4 text-center">v</th>
                  <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                {rows.map((c) => (
                  <tr key={c.categoryId} className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F] transition-colors">
                    <td className="py-3 px-4">
                      <div className="h-9 w-9 rounded-lg overflow-hidden border border-[#E5E3DF] dark:border-[#2B2522] bg-[#F7F5F2] dark:bg-[#26221F] flex items-center justify-center">
                        {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImageOff className="w-4 h-4 text-[#8C7C6B]" />}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#C48A56]">{c.displayOrder}</td>
                    <td className="py-3 px-4 font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{c.name}</td>
                    <td className="py-3 px-4 font-mono text-[#8C7C6B]">{c.code}</td>
                    <td className="py-3 px-4 text-[#6E5E4F] dark:text-[#A89D94]">{c.parentName ?? '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${c.active ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                        {c.active ? t('badge.active') : t('badge.inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[#8C7C6B]">{c.version}</td>
                    <td className="py-3 px-4 text-right">
                      <button type="button" onClick={() => openEdit(c)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-[#A36C3D] dark:text-[#D4A87A] hover:bg-[#C48A56]/10 transition-colors">
                        <Pencil className="w-3.5 h-3.5" /> {t('catAdmin.edit')}
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
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{editingId ? t('catAdmin.editTitle') : t('catAdmin.createTitle')}</h3>
              <button type="button" onClick={() => setEditing(false)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('catAdmin.fieldCode') + ' *'}>
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={50} className={inputCls} />
              </Field>
              <Field label={t('catAdmin.fieldOrder')}>
                <input type="text" inputMode="numeric" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} className={inputCls} />
              </Field>
            </div>

            <Field label={t('catAdmin.fieldName') + ' *'}>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} className={inputCls} />
            </Field>

            <Field label={t('catAdmin.fieldParent')}>
              <select value={form.parentCategoryId} onChange={(e) => setForm({ ...form, parentCategoryId: e.target.value })} className={inputCls}>
                <option value="">— {t('catAdmin.noParent')} —</option>
                {parentOptions.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
              </select>
            </Field>

            <Field label={t('catAdmin.fieldDescription')}>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={5000} className={inputCls} />
            </Field>

            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[#C48A56]" />
              {t('catAdmin.fieldActive')}
            </label>

            <Field label={t('catAdmin.fieldImage')}>
              <ImageUploadField kind="category" objectKey={form.imageObjectKey} initialUrl={form.imageUrl} onChange={onImageChange} disabled={isSubmitting} />
            </Field>

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
