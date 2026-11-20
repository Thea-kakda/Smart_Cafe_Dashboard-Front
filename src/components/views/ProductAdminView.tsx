import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, XCircle, X, Lock, RefreshCw, Loader2,
  Pencil, ImageOff, Package, Columns3,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import { PaginationMeta } from '../../lib/storeProducts';
import { fetchCategories, CategoryRow } from '../../lib/storeProducts';
import {
  productsAdminApi, ManagementProduct, CreateProductInput, UpdateProductInput,
} from '../../lib/catalogAdmin';
import { ImageUploadField } from '../catalog/ImageUploadField';
import { ProductEditor } from '../product/ProductEditor';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

interface FormState {
  code: string;
  categoryId: string;
  name: string;
  description: string;
  basePrice: string;
  currencyCode: string;
  preparationMinutes: string;
  taxRate: string;
  customizable: boolean;
  active: boolean;
  imageObjectKey: string | null;
  imageUrl: string | null;
  version: number;
}

const EMPTY_FORM: FormState = {
  code: '', categoryId: '', name: '', description: '', basePrice: '', currencyCode: 'USD',
  preparationMinutes: '0', taxRate: '0', customizable: false, active: true,
  imageObjectKey: null, imageUrl: null, version: 0,
};

const CURRENCIES = ['USD', 'KHR'];

/**
 * Master-data product editor (catalog write path). Lists products, and creates
 * or updates them with an image chosen through the File API. The raw
 * imageObjectKey and optimistic-lock version come from the protected management
 * read and are echoed back on save; the browser never builds a storage URL.
 */
export interface ProductAdminViewProps {
  /** Optional module jump, forwarded to the product editor's Inventory tab. */
  onNavigate?: (tab: string) => void;
}

export const ProductAdminView: React.FC<ProductAdminViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const canManage = hasPermission('product:manage');

  const [rows, setRows] = useState<ManagementProduct[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 0, size: DEFAULT_PAGE_SIZE, totalElements: 0, totalPages: 0, first: true, last: true });
  const [size, setSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Non-null opens the tabbed Round 1 editor overlay for that product. */
  const [editorId, setEditorId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setPage(0); }, [search]);
  useEffect(() => {
    if (!feedback) return;
    const h = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(h);
  }, [feedback]);

  useEffect(() => {
    if (!canManage) return;
    const ctrl = new AbortController();
    fetchCategories(ctrl.signal).then(setCategories).catch(() => setCategories([]));
    return () => ctrl.abort();
  }, [canManage]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !canManage) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await productsAdminApi.list({ search: search || undefined, page, size }, ctrl.signal);
      setRows(result.items);
      setPagination(result.pagination);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      if (err instanceof ApiError && err.status === 403) setLoadError(t('prodAdmin.forbidden'));
      else setLoadError(t('prodAdmin.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, canManage, search, page, size, t]);

  useEffect(() => { void loadData(); }, [loadData]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.categoryId ?? '' });
    setEditingId(null);
    setFormError(null);
    setEditing(true);
  };

  const openEdit = (p: ManagementProduct) => {
    setForm({
      code: p.code, categoryId: p.categoryId, name: p.name, description: p.description ?? '',
      basePrice: String(p.basePrice), currencyCode: p.currencyCode,
      preparationMinutes: String(p.preparationMinutes), taxRate: String(p.taxRate),
      customizable: p.customizable, active: p.active,
      imageObjectKey: p.imageObjectKey, imageUrl: p.imageUrl, version: p.version,
    });
    setEditingId(p.productId);
    setFormError(null);
    setEditing(true);
  };

  const onImageChange = (objectKey: string | null, url: string | null) =>
    setForm((f) => ({ ...f, imageObjectKey: objectKey, imageUrl: url }));

  const validate = (): string | null => {
    if (!form.code.trim()) return t('prodAdmin.errCodeRequired');
    if (!form.categoryId) return t('prodAdmin.errCategoryRequired');
    if (!form.name.trim()) return t('prodAdmin.errNameRequired');
    if (form.basePrice === '' || !/^\d{1,10}(\.\d{1,4})?$/.test(form.basePrice.trim())) return t('prodAdmin.errPriceInvalid');
    if (!/^[A-Za-z]{3}$/.test(form.currencyCode.trim())) return t('prodAdmin.errCurrencyInvalid');
    if (!/^\d{1,9}(\.\d{1,6})?$/.test(form.taxRate.trim())) return t('prodAdmin.errTaxInvalid');
    if (!/^\d+$/.test(form.preparationMinutes.trim())) return t('prodAdmin.errPrepInvalid');
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setFormError(v); return; }
    setIsSubmitting(true);
    setFormError(null);
    const base: CreateProductInput = {
      code: form.code.trim(),
      categoryId: form.categoryId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      basePrice: Number(form.basePrice.trim()),
      currencyCode: form.currencyCode.trim().toUpperCase(),
      preparationMinutes: Number(form.preparationMinutes.trim()),
      taxRate: Number(form.taxRate.trim()),
      customizable: form.customizable,
      active: form.active,
      imageObjectKey: form.imageObjectKey,
    };
    try {
      if (editingId) {
        const payload: UpdateProductInput = { ...base, version: form.version };
        await productsAdminApi.update(editingId, payload);
        setFeedback({ kind: 'success', text: t('prodAdmin.updatedMsg') });
      } else {
        await productsAdminApi.create(base);
        setFeedback({ kind: 'success', text: t('prodAdmin.createdMsg') });
      }
      setEditing(false);
      void loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_CODE') setFormError(t('prodAdmin.errDuplicate'));
        else if (err.code === 'VERSION_CONFLICT') { setFormError(t('prodAdmin.errConflict')); setEditing(false); void loadData(); }
        else if (err.code === 'CATEGORY_NOT_FOUND') setFormError(t('prodAdmin.errCategoryNotFound'));
        else if (err.code === 'PRICE_SCALE_EXCEEDED') setFormError(t('prodAdmin.errPriceScale'));
        else if (err.code === 'NEGATIVE_PRICE') setFormError(t('prodAdmin.errNegativePrice'));
        else if (err.code === 'TAX_SCALE_EXCEEDED') setFormError(t('prodAdmin.errTaxScale'));
        else if (err.code === 'INVALID_CURRENCY') setFormError(t('prodAdmin.errCurrencyInvalid'));
        else if (err.code === 'INVALID_OBJECT_KEY') setFormError(t('prodAdmin.errImageKey'));
        else if (err.status === 403) setFormError(t('prodAdmin.forbidden'));
        else if (err.status === 404) setFormError(t('prodAdmin.errNotFound'));
        else if (err.status === 400) setFormError(err.message || t('prodAdmin.errValidation'));
        else if (err.isNetworkError) setFormError(t('prodAdmin.errNetwork'));
        else setFormError(t('prodAdmin.errNetwork'));
      } else setFormError(t('prodAdmin.errNetwork'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const imgUrl = (p: ManagementProduct) => p.imageUrl;

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('prodAdmin.title')}</h2>
        <div className="rounded-xl border p-6 text-center text-sm text-[#6E5E4F] flex items-center gap-2 justify-center">
          <Lock className="w-4 h-4 text-[#C48A56]" /> {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('prodAdmin.title')}</h2>
        <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-4 text-xs font-medium text-[#B45309]">
          {t('prodAdmin.forbidden')}
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
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('prodAdmin.title')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('prodAdmin.description')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={openCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-xs font-bold transition-colors">
            <Plus className="w-4 h-4" /> {t('prodAdmin.create')}
          </button>
          <button type="button" onClick={() => void loadData()} disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] text-xs font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 text-[#C48A56] ${isLoading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Feedback banner */}
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

      {/* Search */}
      <div className="flex items-center gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')}
          className="w-full sm:max-w-xs rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40" />
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
            <Package className="w-6 h-6 text-[#8C7C6B] mx-auto" />
            <p className="text-sm font-semibold text-[#6E5E4F]">{t('prodAdmin.empty')}</p>
          </div>
        )}
        {!loadError && !showSkeleton && !showEmpty && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F5F2] dark:bg-[#26221F] text-[#6E5E4F] dark:text-[#A89D94] uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="py-3 px-4">{t('prodAdmin.colImage')}</th>
                  <th className="py-3 px-4">{t('prodAdmin.colCode')}</th>
                  <th className="py-3 px-4">{t('prodAdmin.colName')}</th>
                  <th className="py-3 px-4">{t('prodAdmin.colCategory')}</th>
                  <th className="py-3 px-4 text-right">{t('prodAdmin.colPrice')}</th>
                  <th className="py-3 px-4">{t('prodAdmin.colStatus')}</th>
                  <th className="py-3 px-4 text-center">v</th>
                  <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                {rows.map((p) => (
                  <tr key={p.productId} className="hover:bg-[#FAF8F5] dark:hover:bg-[#26221F] transition-colors">
                    <td className="py-3 px-4">
                      <div className="h-9 w-9 rounded-lg overflow-hidden border border-[#E5E3DF] dark:border-[#2B2522] bg-[#F7F5F2] dark:bg-[#26221F] flex items-center justify-center">
                        {imgUrl(p) ? <img src={imgUrl(p) ?? undefined} alt="" className="h-full w-full object-cover" /> : <ImageOff className="w-4 h-4 text-[#8C7C6B]" />}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#8C7C6B]">{p.code}</td>
                    <td className="py-3 px-4 font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{p.name}</td>
                    <td className="py-3 px-4 text-[#6E5E4F] dark:text-[#A89D94]">{p.categoryName}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{p.basePrice} {p.currencyCode}</td>
                    <td className="py-3 px-4">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${p.active ? 'bg-[#2E7D32]/15 text-[#2E7D32]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'}`}>
                        {p.active ? t('badge.active') : t('badge.inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[#8C7C6B]">{p.version}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-[#A36C3D] dark:text-[#D4A87A] hover:bg-[#C48A56]/10 transition-colors">
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> {t('prodAdmin.edit')}
                        </button>
                        <button type="button" onClick={() => setEditorId(p.productId)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-[#A36C3D] dark:text-[#D4A87A] hover:bg-[#C48A56]/10 transition-colors">
                          <Columns3 className="w-3.5 h-3.5" aria-hidden="true" /> {t('prodAdmin.openEditor')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loadError && !showEmpty && (
          <PaginationBar
            page={pagination.page}
            size={size}
            totalElements={pagination.totalElements}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            onSizeChange={setSize}
            disabled={isLoading}
          />
        )}
      </div>

      {/* Create/Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setEditing(false)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{editingId ? t('prodAdmin.editTitle') : t('prodAdmin.createTitle')}</h3>
              <button type="button" onClick={() => setEditing(false)} aria-label={t('common.close')}><X className="w-4 h-4 text-[#8C7C6B]" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('prodAdmin.fieldCode') + ' *'}>
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={50}
                  className={inputCls} />
              </Field>
              <Field label={t('prodAdmin.fieldCategory') + ' *'}>
                <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={inputCls}>
                  <option value="">— {t('prodAdmin.selectCategory')} —</option>
                  {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
                </select>
              </Field>
            </div>

            <Field label={t('prodAdmin.fieldName') + ' *'}>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} className={inputCls} />
            </Field>

            <Field label={t('prodAdmin.fieldDescription')}>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={5000} className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('prodAdmin.fieldPrice') + ' *'}>
                <input type="text" inputMode="decimal" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} placeholder="0.0000" className={inputCls} />
              </Field>
              <Field label={t('prodAdmin.fieldCurrency') + ' *'}>
                <select value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value })} className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('prodAdmin.fieldPrep')}>
                <input type="text" inputMode="numeric" value={form.preparationMinutes} onChange={(e) => setForm({ ...form, preparationMinutes: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t('prodAdmin.fieldTax') + ' *'}>
                <input type="text" inputMode="decimal" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} placeholder="0.000000" className={inputCls} />
              </Field>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[#C48A56]" />
                {t('prodAdmin.fieldActive')}
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={form.customizable} onChange={(e) => setForm({ ...form, customizable: e.target.checked })} className="accent-[#C48A56]" />
                {t('prodAdmin.fieldCustomizable')}
              </label>
            </div>

            <Field label={t('prodAdmin.fieldImage')}>
              <ImageUploadField kind="product" objectKey={form.imageObjectKey} initialUrl={form.imageUrl} onChange={onImageChange} disabled={isSubmitting} />
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
                {isSubmitting ? t('common.save') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabbed Round 1 editor: General / Variants / Stores & Channels /
          Availability Preview, plus the Round 2 Options / Effects / Recipes / Inventory tabs. */}
      {editorId && (
        <ProductEditor
          productId={editorId}
          categories={categories}
          onClose={() => setEditorId(null)}
          onChanged={() => void loadData()}
          onNavigate={onNavigate}
        />
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
