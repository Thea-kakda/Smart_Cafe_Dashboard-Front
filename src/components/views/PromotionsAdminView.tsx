/**
 * Promotions & Campaigns administration view (Master Prompt Phase 8 / §9).
 * Talks to /api/v1/management/promotions: list/detail (promotion:read),
 * create/update/status (promotion:manage). Codes are immutable, usage_count is
 * redemption history, and status moves only through the dedicated transition
 * endpoint — the form mirrors those backend rules instead of restating them.
 * Assignment pickers read from the real catalog endpoints (categories,
 * per-store catalog) and the branch API; no invented target lists.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Plus,
  Eye,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Lock,
  Edit3,
  Search,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError, ValidationDetail } from '../../lib/api';
import {
  CreatePromotionInput,
  PromotionAdmin,
  UpdatePromotionInput,
  catalogPickersApi,
  promotionsAdminApi,
} from '../../lib/promotionsAdmin';
import { Paginated, branchesApi, ManagementStore } from '../../lib/management';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';
import { datetimeLocalToIso, isoToDatetimeLocal } from '../../lib/datetimeLocal';

const STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED'];
// Client mirror of the authoritative transition table (UX only; the backend
// rejects anything else with INVALID_STATUS_TRANSITION).
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  EXPIRED: [],
  CANCELLED: [],
};
const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'];

interface PromoFormState {
  promotionCode: string;
  promotionName: string;
  discountType: string;
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscountAmount: string;
  currencyCode: string;
  startsAt: string;
  endsAt: string;
  status: string;
  usageLimit: string;
  perCustomerLimit: string;
  stackable: boolean;
  automatic: boolean;
  priority: string;
}

const EMPTY_FORM: PromoFormState = {
  promotionCode: '',
  promotionName: '',
  discountType: 'PERCENTAGE',
  discountValue: '',
  minimumOrderAmount: '',
  maximumDiscountAmount: '',
  currencyCode: '',
  startsAt: '',
  endsAt: '',
  status: 'DRAFT',
  usageLimit: '',
  perCustomerLimit: '',
  stackable: false,
  automatic: true,
  priority: '0',
};

export const PromotionsAdminView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const canRead = hasPermission('promotion:read');
  const canManage = hasPermission('promotion:manage');
  const canReadBranches = hasPermission('branch:read');

  const [data, setData] = useState<Paginated<PromotionAdmin> | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const [detail, setDetail] = useState<PromotionAdmin | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PromotionAdmin | null>(null);
  const [statusDialog, setStatusDialog] = useState<{ promo: PromotionAdmin; to: string } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [form, setForm] = useState<PromoFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Assignment picker sources (all real endpoints).
  const [storeChoices, setStoreChoices] = useState<ManagementStore[]>([]);
  const [categoryChoices, setCategoryChoices] = useState<{ categoryId: string; name: string }[]>([]);
  const [productStore, setProductStore] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productChoices, setProductChoices] = useState<{ productId: string; name: string; productCode: string }[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!feedback) return;
    const h = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(h);
  }, [feedback]);

  useEffect(() => {
    if (!canReadBranches) return;
    const ctrl = new AbortController();
    branchesApi.list({ page: 0, size: 100 }, ctrl.signal).then((p) => setStoreChoices(p.items)).catch(() => setStoreChoices([]));
    return () => ctrl.abort();
  }, [canReadBranches]);

  useEffect(() => {
    if (!canManage) return;
    const ctrl = new AbortController();
    catalogPickersApi.categories(ctrl.signal).then((cs) => setCategoryChoices(cs.map((c) => ({ categoryId: c.categoryId, name: c.name })))).catch(() => setCategoryChoices([]));
    return () => ctrl.abort();
  }, [canManage]);

  useEffect(() => {
    if (!canManage || !productStore) {
      setProductChoices([]);
      return;
    }
    const ctrl = new AbortController();
    catalogPickersApi.products(productStore, productSearch, 0, 50, ctrl.signal)
      .then((p) => setProductChoices(p.items.map((r) => ({ productId: r.productId, name: r.name, productCode: r.productCode }))))
      .catch(() => setProductChoices([]));
    return () => ctrl.abort();
  }, [canManage, productStore, productSearch]);

  const load = useCallback(async () => {
    if (!canRead) return;
    setIsLoading(true);
    setError(null);
    try {
      setData(await promotionsAdminApi.list(statusFilter || undefined, page, size));
    } catch (err) {
      setError(err instanceof ApiError ? err : null);
    } finally {
      setIsLoading(false);
    }
  }, [canRead, statusFilter, page, size]);

  useEffect(() => {
    void load();
  }, [load]);

  const localizedError = (err: unknown): { kind: 'warning' | 'error'; text: string; details: ValidationDetail[] } => {
    if (!(err instanceof ApiError)) return { kind: 'error', text: t('promos.networkError'), details: [] };
    if (err.status === 401) return { kind: 'error', text: t('branches.sessionExpired'), details: [] };
    if (err.status === 403) return { kind: 'error', text: t('promos.forbidden'), details: [] };
    if (err.status === 404) return { kind: 'error', text: t('promos.notFound'), details: [] };
    if (err.code === 'VERSION_CONFLICT') return { kind: 'warning', text: t('promos.conflict'), details: [] };
    if (err.code === 'PROMOTION_CODE_TAKEN') return { kind: 'error', text: t('promos.codeTaken'), details: [] };
    if (err.code === 'TARGET_NOT_FOUND') return { kind: 'error', text: t('promos.targetNotFound'), details: [] };
    if (err.code === 'INVALID_STATUS_TRANSITION') return { kind: 'error', text: t('promos.badTransition'), details: [] };
    if (err.code === 'PROMOTION_EXHAUSTED') return { kind: 'error', text: t('promos.exhausted'), details: [] };
    if (err.isNetworkError) return { kind: 'error', text: t('promos.networkError'), details: [] };
    return { kind: 'error', text: err.message || t('common.error'), details: err.details };
  };

  const applyFieldDetails = (details: ValidationDetail[]) => {
    const map: Record<string, string> = {};
    details.forEach((d) => { if (d.field) map[d.field] = d.message || d.issue || 'invalid'; });
    setFieldErrors(map);
  };

  const openDetail = async (promotionId: string) => {
    try {
      const full = await promotionsAdminApi.detail(promotionId);
      setDetail(full);
      // Seed the assignment editors from the authoritative detail response.
      setSelectedProducts(new Set(full.productIds ?? []));
      setSelectedCategories(new Set(full.categoryIds ?? []));
      setSelectedStores(new Set(full.storeIds ?? []));
    } catch (err) {
      const mapped = localizedError(err);
      setFeedback({ kind: mapped.kind, text: mapped.text });
    }
  };

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setSelectedProducts(new Set());
    setSelectedCategories(new Set());
    setSelectedStores(new Set());
    setProductStore('');
    setFieldErrors({});
    setCreateOpen(true);
  };

  const startEdit = (p: PromotionAdmin) => {
    setForm({
      promotionCode: p.promotionCode,
      promotionName: p.promotionName,
      discountType: p.discountType,
      discountValue: String(p.discountValue),
      minimumOrderAmount: p.minimumOrderAmount != null ? String(p.minimumOrderAmount) : '',
      maximumDiscountAmount: p.maximumDiscountAmount != null ? String(p.maximumDiscountAmount) : '',
      currencyCode: p.currencyCode ?? '',
      startsAt: isoToDatetimeLocal(p.startsAt),
      endsAt: isoToDatetimeLocal(p.endsAt),
      status: p.status,
      usageLimit: p.usageLimit != null ? String(p.usageLimit) : '',
      perCustomerLimit: p.perCustomerLimit != null ? String(p.perCustomerLimit) : '',
      stackable: p.stackable,
      automatic: p.automatic,
      priority: String(p.priority),
    });
    setSelectedProducts(new Set(p.productIds ?? []));
    setSelectedCategories(new Set(p.categoryIds ?? []));
    setSelectedStores(new Set(p.storeIds ?? []));
    setFieldErrors({});
    setEditTarget(p);
  };

  const buildDefinition = () => ({
    promotionName: form.promotionName,
    discountType: form.discountType,
    discountValue: Number(form.discountValue),
    minimumOrderAmount: form.minimumOrderAmount === '' ? null : Number(form.minimumOrderAmount),
    maximumDiscountAmount: form.maximumDiscountAmount === '' ? null : Number(form.maximumDiscountAmount),
    currencyCode: form.currencyCode || null,
    startsAt: datetimeLocalToIso(form.startsAt) ?? '',
    endsAt: datetimeLocalToIso(form.endsAt),
    usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
    perCustomerLimit: form.perCustomerLimit === '' ? null : Number(form.perCustomerLimit),
    stackable: form.stackable,
    automatic: form.automatic,
    priority: Number(form.priority || 0),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.promotionCode || !form.promotionName || !form.discountValue || !form.startsAt || !form.endsAt) {
      setFeedback({ kind: 'error', text: t('staff.required') });
      return;
    }
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const body: CreatePromotionInput = {
        promotionCode: form.promotionCode.trim().toUpperCase(),
        status: form.status,
        ...buildDefinition(),
        productIds: Array.from(selectedProducts),
        categoryIds: Array.from(selectedCategories),
        storeIds: Array.from(selectedStores),
      };
      const created = await promotionsAdminApi.create(body);
      setCreateOpen(false);
      setFeedback({ kind: 'success', text: t('promos.createdSuccess') });
      setDetail(created);
      void load();
    } catch (err) {
      const mapped = localizedError(err);
      applyFieldDetails(mapped.details);
      setFeedback({ kind: mapped.kind, text: mapped.text });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!form.promotionName || !form.discountValue || !form.startsAt || !form.endsAt) {
      setFeedback({ kind: 'error', text: t('staff.required') });
      return;
    }
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const body: UpdatePromotionInput = {
        ...buildDefinition(),
        productIds: Array.from(selectedProducts),
        categoryIds: Array.from(selectedCategories),
        storeIds: Array.from(selectedStores),
        version: editTarget.version,
      };
      const updated = await promotionsAdminApi.update(editTarget.promotionId, body);
      setEditTarget(null);
      setFeedback({ kind: 'success', text: t('promos.updatedSuccess') });
      setDetail(updated);
      void load();
    } catch (err) {
      const mapped = localizedError(err);
      applyFieldDetails(mapped.details);
      setFeedback({ kind: mapped.kind, text: mapped.text });
      void load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusDialog) return;
    setIsSubmitting(true);
    try {
      const updated = await promotionsAdminApi.changeStatus(statusDialog.promo.promotionId, {
        status: statusDialog.to,
        version: statusDialog.promo.version,
        reason: statusReason || null,
      });
      setStatusDialog(null);
      setStatusReason('');
      setDetail(updated);
      setFeedback({ kind: 'success', text: t('promos.statusChangedSuccess') });
      void load();
    } catch (err) {
      const mapped = localizedError(err);
      setFeedback({ kind: mapped.kind, text: mapped.text });
      void load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:outline-none focus:ring-2 focus:ring-[#C48A56]/30';
  const labelCls = 'block text-[11px] font-semibold text-[#8C7C6B] uppercase tracking-wider mb-1';

  if (!isAuthenticated || !canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.promotions')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('promos.readForbidden') : t('promos.signInPrompt')}</span>
        </div>
      </div>
    );
  }

  const rows = data?.items ?? [];
  const pagination = data?.pagination;
  const initialLoading = isLoading && !data;

  const renderFormFields = (isEdit: boolean) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('promos.fieldCode')} *</label>
          <input
            className={inputCls + (isEdit ? ' opacity-60' : '')}
            value={form.promotionCode}
            disabled={isEdit}
            onChange={(e) => setForm({ ...form, promotionCode: e.target.value })}
          />
          {fieldErrors.promotionCode && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.promotionCode}</p>}
          {isEdit && <p className="text-[10px] text-[#8C7C6B] mt-1">{t('promos.codeImmutableNotice')}</p>}
        </div>
        <div>
          <label className={labelCls}>{t('promos.fieldName')} *</label>
          <input className={inputCls} value={form.promotionName} onChange={(e) => setForm({ ...form, promotionName: e.target.value })} />
          {fieldErrors.promotionName && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.promotionName}</p>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>{t('promos.fieldType')}</label>
          <select className={inputCls} value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
            {DISCOUNT_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('promos.fieldValue')} *</label>
          <input type="number" step="0.01" min="0" className={inputCls} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
          {fieldErrors.discountValue && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.discountValue}</p>}
        </div>
        <div>
          <label className={labelCls}>{t('promos.fieldCurrency')}</label>
          <input className={inputCls} placeholder="USD / KHR" value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })} />
          {fieldErrors.currencyCode && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.currencyCode}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('promos.fieldMinAmount')}</label>
          <input type="number" step="0.01" min="0" className={inputCls} value={form.minimumOrderAmount} onChange={(e) => setForm({ ...form, minimumOrderAmount: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>{t('promos.fieldMaxDiscount')}</label>
          <input type="number" step="0.01" min="0" className={inputCls} value={form.maximumDiscountAmount} onChange={(e) => setForm({ ...form, maximumDiscountAmount: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('promos.fieldStarts')} *</label>
          <input type="datetime-local" required className={inputCls} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>{t('promos.fieldEnds')} *</label>
          <input type="datetime-local" required min={form.startsAt || undefined} className={inputCls} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          {fieldErrors.endsAt && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.endsAt}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>{t('promos.fieldUsageLimit')}</label>
          <input type="number" min="1" className={inputCls} value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>{t('promos.fieldPerCustomer')}</label>
          <input type="number" min="1" className={inputCls} value={form.perCustomerLimit} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>{t('promos.fieldPriority')}</label>
          <input type="number" className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5 justify-end">
          <label className="flex items-center gap-2 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
            <input type="checkbox" className="accent-[#C48A56]" checked={form.stackable} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} />
            {t('promos.fieldStackable')}
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
            <input type="checkbox" className="accent-[#C48A56]" checked={form.automatic} onChange={(e) => setForm({ ...form, automatic: e.target.checked })} />
            {t('promos.fieldAutomatic')}
          </label>
        </div>
      </div>
      {isEdit && <p className="text-[10px] text-[#8C7C6B]">{t('promos.usageCountNotice')}</p>}
      {canManage && (
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] p-3 space-y-3">
          <h4 className="text-[11px] font-semibold text-[#8C7C6B] uppercase tracking-wider">{t('promos.assignmentsTitle')}</h4>
          <p className="text-[10px] text-[#8C7C6B]">{t('promos.assignmentEmptyNotice')}</p>

          {/* Store targets */}
          <div>
            <label className={labelCls}>{t('promos.targetStores')}</label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {storeChoices.length === 0 && <span className="text-[10px] text-[#8C7C6B]">{t('promos.noStoreSource')}</span>}
              {storeChoices.map((s) => (
                <button
                  key={s.storeId}
                  type="button"
                  onClick={() => setSelectedStores((prev) => { const n = new Set(prev); if (n.has(s.storeId)) n.delete(s.storeId); else n.add(s.storeId); return n; })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                    selectedStores.has(s.storeId) ? 'bg-[#C48A56] text-white border-[#C48A56]' : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:border-[#C48A56]/60'
                  }`}
                >
                  {s.storeName}
                </button>
              ))}
            </div>
          </div>

          {/* Category targets */}
          <div>
            <label className={labelCls}>{t('promos.targetCategories')}</label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {categoryChoices.length === 0 && <span className="text-[10px] text-[#8C7C6B]">{t('promos.noCategorySource')}</span>}
              {categoryChoices.map((c) => (
                <button
                  key={c.categoryId}
                  type="button"
                  onClick={() => setSelectedCategories((prev) => { const n = new Set(prev); if (n.has(c.categoryId)) n.delete(c.categoryId); else n.add(c.categoryId); return n; })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                    selectedCategories.has(c.categoryId) ? 'bg-[#C48A56] text-white border-[#C48A56]' : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:border-[#C48A56]/60'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product targets (search a branch catalog; ids are global) */}
          <div>
            <label className={labelCls}>{t('promos.targetProducts')}</label>
            <div className="flex gap-2 mb-2">
              <select className={inputCls} value={productStore} onChange={(e) => setProductStore(e.target.value)}>
                <option value="">{t('promos.pickStoreFirst')}</option>
                {storeChoices.map((s) => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
              </select>
              <div className="flex items-center gap-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] px-3 flex-1">
                <Search className="w-4 h-4 text-[#8C7C6B] shrink-0" />
                <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder={t('common.search')} className="w-full bg-transparent py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] placeholder-[#8C7C6B] focus:outline-none" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {productChoices.length === 0 && <span className="text-[10px] text-[#8C7C6B]">{t('promos.noProductSource')}</span>}
              {productChoices.map((p) => (
                <button
                  key={p.productId}
                  type="button"
                  onClick={() => setSelectedProducts((prev) => { const n = new Set(prev); if (n.has(p.productId)) n.delete(p.productId); else n.add(p.productId); return n; })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                    selectedProducts.has(p.productId)
                      ? 'bg-[#C48A56] text-white border-[#C48A56]'
                      : 'border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:border-[#C48A56]/60'
                  }`}
                  title={p.productId}
                >
                  {p.name}
                </button>
              ))}
              {/* Already-selected ids outside the current page stay visible */}
              {Array.from(selectedProducts)
                .filter((id) => !productChoices.some((p) => p.productId === id))
                .map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedProducts((prev) => { const n = new Set(prev); n.delete(id); return n; })}
                    className="px-2 py-1 rounded-lg text-[10px] font-mono bg-[#C48A56] text-white flex items-center gap-1"
                    title={t('common.close')}
                  >
                    {id.slice(0, 8)} <X className="w-3 h-3" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.promotions')}</h2>
            {pagination && (
              <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">
                {pagination.totalElements} {t('promos.totalCount')}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('promos.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={inputCls + ' w-auto'} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <option value="">{t('promos.statusAll')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => void load()} disabled={isLoading} title={t('common.refresh')} className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button type="button" onClick={startCreate} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] transition-all shadow-xs">
              <Plus className="w-4 h-4" /> {t('promos.create')}
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between ${
          feedback.kind === 'success' ? 'border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]'
            : feedback.kind === 'warning' ? 'border-[#B45309]/30 bg-[#B45309]/10 text-[#B45309]'
              : 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error.isNetworkError ? t('promos.networkError') : t('promos.loadError')} ({error.code})</span>
          </div>
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold">{t('common.retry')}</button>
        </div>
      )}

      {initialLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 animate-pulse space-y-3">
              <div className="h-4 w-2/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-1/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
            </div>
          ))}
        </div>
      )}

      {!initialLoading && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('promos.empty')}</div>
      )}

      {!initialLoading && rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rows.map((p) => (
              <div key={p.promotionId} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] shrink-0">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0] truncate">{p.promotionName}</h3>
                        <span className="text-[11px] font-mono font-semibold text-[#8C7C6B]">{p.promotionCode}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                      p.status === 'ACTIVE' ? 'bg-[#2E7D32]/10 text-[#2E7D32]'
                        : p.status === 'CANCELLED' || p.status === 'EXPIRED' ? 'bg-[#DC2626]/10 text-[#DC2626]'
                          : 'bg-[#B45309]/10 text-[#B45309]'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#6E5E4F] dark:text-[#A89D94] mt-3">
                    {p.discountType === 'PERCENTAGE' ? `${p.discountValue}%` : `${p.discountValue} ${p.currencyCode ?? ''}`}
                    {p.minimumOrderAmount != null && <span className="text-[11px] text-[#8C7C6B]"> · {t('promos.minOrderPrefix')} {p.minimumOrderAmount}</span>}
                  </p>
                  <p className="text-[10px] text-[#8C7C6B] mt-1">
                    {new Date(p.startsAt).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US')}
                    {p.endsAt ? ` → ${new Date(p.endsAt).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US')}` : ` → ${t('promos.openEnded')}`}
                  </p>
                  <p className="text-[10px] text-[#8C7C6B] mt-1">{t('promos.usedCount')}: {p.usageCount}{p.usageLimit != null ? ` / ${p.usageLimit}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#F0EFED] dark:border-[#2B2522]">
                  <button type="button" onClick={() => void openDetail(p.promotionId)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">
                    <Eye className="w-3.5 h-3.5" /> {t('common.view')}
                  </button>
                  {canManage && (
                    <>
                      <button type="button" onClick={() => { void promotionsAdminApi.detail(p.promotionId).then((full) => startEdit(full)).catch(() => setFeedback({ kind: 'error', text: t('promos.loadError') })); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#C48A56] hover:bg-[#C48A56]/10">
                        <Edit3 className="w-3.5 h-3.5" /> {t('promos.edit')}
                      </button>
                      {(ALLOWED_TRANSITIONS[p.status] ?? []).map((to) => (
                        <button
                          key={to}
                          type="button"
                          onClick={() => { setStatusDialog({ promo: p, to }); setStatusReason(''); }}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                            to === 'CANCELLED' ? 'text-[#DC2626] hover:bg-[#DC2626]/10' : 'text-[#2E7D32] hover:bg-[#2E7D32]/10'
                          }`}
                        >
                          {to === 'ACTIVE' ? t('promos.act') : to === 'PAUSED' ? t('promos.pause') : t('promos.cancel')}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pagination && (
            <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19]">
              <PaginationBar
                page={pagination.page}
                size={size}
                totalElements={pagination.totalElements}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
                onSizeChange={setSize}
                disabled={isLoading}
              />
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{detail.promotionName}</h3>
                <p className="text-[11px] font-mono text-[#8C7C6B]">{detail.promotionCode} · {detail.status} · v{detail.version}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
              <div><span className="font-semibold">{t('promos.fieldType')}:</span> {detail.discountType} {detail.discountValue}</div>
              <div><span className="font-semibold">{t('promos.fieldCurrency')}:</span> {detail.currencyCode ?? '—'}</div>
              <div><span className="font-semibold">{t('promos.usedCount')}:</span> {detail.usageCount}{detail.usageLimit != null ? ` / ${detail.usageLimit}` : ''}</div>
              <div><span className="font-semibold">{t('promos.fieldPerCustomer')}:</span> {detail.perCustomerLimit ?? '—'}</div>
              <div><span className="font-semibold">{t('promos.fieldStackable')}:</span> {detail.stackable ? t('pricing.yes') : t('pricing.no')}</div>
              <div><span className="font-semibold">{t('promos.fieldAutomatic')}:</span> {detail.automatic ? t('pricing.yes') : t('pricing.no')}</div>
            </div>
            <div className="mt-4 space-y-2 text-[11px]">
              <div><span className="font-semibold text-[#8C7C6B]">{t('promos.targetProducts')}:</span> {detail.productIds?.length ?? 0}</div>
              <div><span className="font-semibold text-[#8C7C6B]">{t('promos.targetCategories')}:</span> {detail.categoryIds?.length ?? 0}</div>
              <div><span className="font-semibold text-[#8C7C6B]">{t('promos.targetStores')}:</span> {detail.storeIds?.length ?? 0}</div>
              {((detail.productIds?.length ?? 0) === 0) && ((detail.categoryIds?.length ?? 0) === 0) && ((detail.storeIds?.length ?? 0) === 0) && (
                <p className="text-[10px] text-[#8C7C6B]">{t('promos.assignmentEmptyNotice')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setCreateOpen(false)}>
          <form onSubmit={handleCreate} className="w-full max-w-2xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('promos.createTitle')}</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>
            {renderFormFields(false)}
            <div>
              <label className={labelCls}>{t('promos.fieldInitialStatus')}</label>
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
              </select>
              <p className="text-[10px] text-[#8C7C6B] mt-1">{t('promos.initialStatusNotice')}</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting} className="px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] disabled:opacity-60">{isSubmitting ? t('common.loading') : t('common.save')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setEditTarget(null)}>
          <form onSubmit={handleUpdate} className="w-full max-w-2xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('promos.editTitle')}</h3>
              <button type="button" onClick={() => setEditTarget(null)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>
            {renderFormFields(true)}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditTarget(null)} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting} className="px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] disabled:opacity-60">{isSubmitting ? t('common.loading') : t('common.save')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Status transition modal */}
      {statusDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setStatusDialog(null)}>
          <form onSubmit={handleStatus} className="w-full max-w-md rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
              {statusDialog.promo.promotionCode}: {statusDialog.promo.status} → {statusDialog.to}
            </h3>
            <p className="text-[11px] text-[#8C7C6B]">{t('promos.transitionNotice')}</p>
            <div>
              <label className={labelCls}>{t('staff.fieldReason')}</label>
              <textarea className={inputCls} rows={2} maxLength={300} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setStatusDialog(null)} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting} className="px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] disabled:opacity-60">{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
