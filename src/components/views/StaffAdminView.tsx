/**
 * Staff Administration view (Master Prompt Phase 8 / §6). Talks exclusively to
 * the real /api/v1/management/staff contract: server-side search, status/role/
 * branch filters and pagination; create, profile update, activate/disable and
 * role assignment / revocation all go through the API. Every mutation is gated
 * by the exact permission code the backend enforces. No employeeCode or
 * shiftSchedule fields exist behind the contract, so none are rendered.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Plus,
  Search,
  Eye,
  Edit3,
  Power,
  ShieldCheck,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Lock,
  Ban,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError, ValidationDetail } from '../../lib/api';
import {
  StaffMember,
  StaffAssignment,
  staffAdminApi,
  StaffListQuery,
} from '../../lib/staffAdmin';
import { Paginated } from '../../lib/management';
import { AdminRole, rolesAdminApi } from '../../lib/rolesAdmin';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

export const StaffAdminView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission, accessibleBranches } = useAuth();

  const canRead = hasPermission('staff:read');
  const canCreate = hasPermission('staff:create');
  const canUpdate = hasPermission('staff:update');
  const canStatus = hasPermission('staff:status-manage');
  const canAssign = hasPermission('staff:role-assign');

  const [data, setData] = useState<Paginated<StaffMember> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState<StaffListQuery>({ search: '', sort: 'createdAt', page: 0, size: DEFAULT_PAGE_SIZE });
  const [searchInput, setSearchInput] = useState('');
  const [roles, setRoles] = useState<AdminRole[]>([]);

  const [detail, setDetail] = useState<StaffMember | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ staff: StaffMember; activate: boolean } | null>(null);
  const [assignTarget, setAssignTarget] = useState<StaffMember | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ staff: StaffMember; assignment: StaffAssignment } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create/edit forms
  const [createForm, setCreateForm] = useState({ fullName: '', email: '', password: '', phone: '', language: 'km', roleCode: '', storeId: '', expiresAt: '' });
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', language: '' });

  useEffect(() => {
    if (!feedback) return;
    const h = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(h);
  }, [feedback]);

  // Debounced server-side search; the backend owns filtering.
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (searchInput !== (query.search ?? '')) setQuery((q) => ({ ...q, search: searchInput, page: 0 }));
    }, 400);
    return () => window.clearTimeout(h);
  }, [searchInput, query.search]);

  // Role catalogue powers the filter/assignment selects when readable.
  useEffect(() => {
    if (!hasPermission('role:read')) return;
    const ctrl = new AbortController();
    rolesAdminApi.listRoles(ctrl.signal).then(setRoles).catch(() => setRoles([]));
    return () => ctrl.abort();
  }, [hasPermission]);

  const load = useCallback(async () => {
    if (!canRead) return;
    setIsLoading(true);
    setError(null);
    try {
      setData(await staffAdminApi.list(query));
    } catch (err) {
      setError(err instanceof ApiError ? err : null);
    } finally {
      setIsLoading(false);
    }
  }, [canRead, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const localizedError = (err: unknown): { kind: 'warning' | 'error'; text: string; details: ValidationDetail[] } => {
    if (!(err instanceof ApiError)) return { kind: 'error', text: t('staff.networkError'), details: [] };
    if (err.status === 401) return { kind: 'error', text: t('branches.sessionExpired'), details: [] };
    if (err.status === 403) return { kind: 'error', text: t('staff.forbidden'), details: [] };
    if (err.status === 404) return { kind: 'error', text: t('staff.notFound'), details: [] };
    if (err.code === 'VERSION_CONFLICT') return { kind: 'warning', text: t('staff.conflict'), details: [] };
    if (err.code === 'EMAIL_ALREADY_REGISTERED') return { kind: 'error', text: t('staff.emailTaken'), details: [] };
    if (err.isNetworkError) return { kind: 'error', text: t('staff.networkError'), details: [] };
    return { kind: 'error', text: err.message || t('common.error'), details: err.details };
  };

  const applyFieldDetails = (details: ValidationDetail[]) => {
    const map: Record<string, string> = {};
    details.forEach((d) => { if (d.field) map[d.field] = d.message || d.issue || 'invalid'; });
    setFieldErrors(map);
  };

  const refreshDetail = async (userId: string) => {
    try {
      setDetail(await staffAdminApi.detail(userId));
      void load();
    } catch {
      setDetail(null);
      void load();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.fullName || !createForm.email || !createForm.password || !createForm.roleCode) {
      setFeedback({ kind: 'error', text: t('staff.required') });
      return;
    }
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      await staffAdminApi.create({
        fullName: createForm.fullName,
        email: createForm.email,
        password: createForm.password,
        phone: createForm.phone || null,
        preferredLanguage: createForm.language,
        roleCode: createForm.roleCode,
        storeId: createForm.storeId || null,
        expiresAt: createForm.expiresAt ? new Date(createForm.expiresAt).toISOString() : null,
      });
      setCreateOpen(false);
      setCreateForm({ fullName: '', email: '', password: '', phone: '', language: 'km', roleCode: '', storeId: '', expiresAt: '' });
      setFeedback({ kind: 'success', text: t('staff.createdSuccess') });
      void load();
    } catch (err) {
      const mapped = localizedError(err);
      applyFieldDetails(mapped.details);
      setFeedback({ kind: mapped.kind, text: mapped.text });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (s: StaffMember) => {
    setEditTarget(s);
    setEditForm({ fullName: s.fullName, phone: s.phone ?? '', language: s.preferredLanguage });
    setFieldErrors({});
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const updated = await staffAdminApi.update(editTarget.userId, {
        fullName: editForm.fullName || undefined,
        phone: editForm.phone || null,
        preferredLanguage: editForm.language || undefined,
        version: editTarget.version,
      });
      setEditTarget(null);
      setFeedback({ kind: 'success', text: t('staff.updatedSuccess') });
      if (detail?.userId === updated.userId) setDetail(updated);
      void load();
    } catch (err) {
      const mapped = localizedError(err);
      applyFieldDetails(mapped.details);
      setFeedback({ kind: mapped.kind, text: mapped.text });
      void load();
      setEditTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTarget) return;
    setIsSubmitting(true);
    try {
      const updated = await staffAdminApi.changeStatus(statusTarget.staff.userId, {
        active: statusTarget.activate,
        reason: statusReason || (statusTarget.activate ? t('staff.defaultActivateReason') : t('staff.defaultDisableReason')),
        version: statusTarget.staff.version,
      });
      setDetail(updated);
      setStatusTarget(null);
      setStatusReason('');
      setFeedback({ kind: 'success', text: t('staff.statusChangedSuccess') });
      void load();
    } catch (err) {
      const mapped = localizedError(err);
      setFeedback({ kind: mapped.kind, text: mapped.text });
      void load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const [statusReason, setStatusReason] = useState('');

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget || !assignForm.roleCode) {
      setFeedback({ kind: 'error', text: t('staff.required') });
      return;
    }
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const updated = await staffAdminApi.assignRole(assignTarget.userId, {
        roleCode: assignForm.roleCode,
        storeId: assignForm.storeId || null,
        expiresAt: assignForm.expiresAt ? new Date(assignForm.expiresAt).toISOString() : null,
      });
      setDetail(updated);
      setAssignTarget(null);
      setAssignForm({ roleCode: '', storeId: '', expiresAt: '' });
      setFeedback({ kind: 'success', text: t('staff.roleAssignedSuccess') });
      void load();
    } catch (err) {
      const mapped = localizedError(err);
      applyFieldDetails(mapped.details);
      setFeedback({ kind: mapped.kind, text: mapped.text });
    } finally {
      setIsSubmitting(false);
    }
  };

  const [assignForm, setAssignForm] = useState({ roleCode: '', storeId: '', expiresAt: '' });
  const [revokeReason, setRevokeReason] = useState('');

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget) return;
    setIsSubmitting(true);
    try {
      const updated = await staffAdminApi.revokeAssignment(
        revokeTarget.staff.userId,
        revokeTarget.assignment.assignmentId,
        revokeReason || t('staff.defaultRevokeReason'),
      );
      setDetail(updated);
      setRevokeTarget(null);
      setRevokeReason('');
      setFeedback({ kind: 'success', text: t('staff.assignmentRevokedSuccess') });
      void load();
    } catch (err) {
      const mapped = localizedError(err);
      setFeedback({ kind: mapped.kind, text: mapped.text });
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusFilterValue = query.status ?? '';
  const roleFilterValue = query.roleCode ?? '';
  const branchFilterValue = query.storeId ?? '';
  const rows = data?.items ?? [];
  const pagination = data?.pagination;
  const initialLoading = isLoading && !data;

  const inputCls =
    'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:outline-none focus:ring-2 focus:ring-[#C48A56]/30';
  const labelCls = 'block text-[11px] font-semibold text-[#8C7C6B] uppercase tracking-wider mb-1';

  const roleSelect = useMemo(() => {
    if (roles.length === 0) return null;
    return (
      <select value={roleFilterValue} onChange={(e) => setQuery((q) => ({ ...q, roleCode: e.target.value || undefined, page: 0 }))} className={inputCls}>
        <option value="">{t('staff.allRoles')}</option>
        {roles.map((r) => (
          <option key={r.roleId} value={r.roleCode}>{r.roleName}</option>
        ))}
      </select>
    );
  }, [roles, roleFilterValue, inputCls, t]);

  if (!isAuthenticated || !canRead) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.staff')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('staff.readForbidden') : t('staff.signInPrompt')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.staff')}</h2>
            {pagination && (
              <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">
                {pagination.totalElements} {t('staff.totalCount')}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('staff.description')}</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => { setCreateOpen(true); setFieldErrors({}); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{t('staff.create')}</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between animate-in fade-in ${
            feedback.kind === 'success'
              ? 'border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]'
              : feedback.kind === 'warning'
                ? 'border-[#B45309]/30 bg-[#B45309]/10 text-[#B45309]'
                : 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filter bar (all filtering is server-side) */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-3.5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] px-3">
            <Search className="w-4 h-4 text-[#8C7C6B] shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('staff.searchPlaceholder')}
              className="w-full bg-transparent py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] placeholder-[#8C7C6B] focus:outline-none"
            />
          </div>
          <select value={statusFilterValue} onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value || undefined, page: 0 }))} className={inputCls}>
            <option value="">{t('staff.statusAll')}</option>
            <option value="ACTIVE">{t('badge.active')}</option>
            <option value="DISABLED">{t('staff.statusDisabled')}</option>
          </select>
          {roleSelect ?? <div className={inputCls + ' opacity-60'}>{t('staff.allRoles')}</div>}
          <select value={branchFilterValue} onChange={(e) => setQuery((q) => ({ ...q, storeId: e.target.value || undefined, page: 0 }))} className={inputCls}>
            <option value="">{t('staff.allBranches')}</option>
            {accessibleBranches.map((b) => (
              <option key={b.storeId} value={b.storeId}>{b.storeName}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <select value={query.sort ?? 'createdAt'} onChange={(e) => setQuery((q) => ({ ...q, sort: e.target.value }))} className={inputCls}>
              <option value="createdAt">{t('staff.sortCreated')}</option>
              <option value="fullName">{t('staff.sortName')}</option>
              <option value="email">{t('staff.sortEmail')}</option>
              <option value="status">{t('staff.sortStatus')}</option>
              <option value="updatedAt">{t('staff.sortUpdated')}</option>
            </select>
            <button type="button" onClick={() => void load()} disabled={isLoading} title={t('common.refresh')} className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error.isNetworkError ? t('staff.networkError') : t('staff.loadError')} ({error.code})</span>
          </div>
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold hover:bg-[#B91C1C] transition-colors">{t('common.retry')}</button>
        </div>
      )}

      {initialLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 animate-pulse space-y-3">
              <div className="h-4 w-2/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-1/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
            </div>
          ))}
        </div>
      )}

      {!initialLoading && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('staff.empty')}</div>
      )}

      {!initialLoading && rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rows.map((s) => (
              <div key={s.userId} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] shrink-0">
                        <Users className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0] truncate">{s.fullName}</h3>
                        <span className="text-[11px] text-[#8C7C6B] truncate block">{s.email}</span>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold shrink-0 ${
                        s.status === 'ACTIVE' ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#DC2626]/10 text-[#DC2626]'
                      }`}
                    >
                      {s.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                      {s.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {s.roles.map((r) => (
                      <span key={r} className="rounded-md bg-[#C48A56]/10 px-2 py-0.5 text-[10px] font-semibold text-[#A36C3D]">{r}</span>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#8C7C6B] mt-2">
                    {t('staff.assignmentCount')}: {s.assignments.filter((a) => a.active).length}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#F0EFED] dark:border-[#2B2522]">
                  <button type="button" onClick={() => void refreshDetail(s.userId)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">
                    <Eye className="w-3.5 h-3.5" /> {t('common.view')}
                  </button>
                  {canUpdate && (
                    <button type="button" onClick={() => openEdit(s)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#C48A56] hover:bg-[#C48A56]/10 transition-colors">
                      <Edit3 className="w-3.5 h-3.5" /> {t('staff.edit')}
                    </button>
                  )}
                  {canStatus && (
                    <button
                      type="button"
                      onClick={() => { setStatusTarget({ staff: s, activate: s.status !== 'ACTIVE' }); setStatusReason(''); }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                        s.status === 'ACTIVE' ? 'text-[#DC2626] hover:bg-[#DC2626]/10' : 'text-[#2E7D32] hover:bg-[#2E7D32]/10'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" /> {s.status === 'ACTIVE' ? t('staff.deactivate') : t('staff.activate')}
                    </button>
                  )}
                  {canAssign && (
                    <button type="button" onClick={() => { setAssignTarget(s); setAssignForm({ roleCode: '', storeId: '', expiresAt: '' }); setFieldErrors({}); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#C48A56] hover:bg-[#C48A56]/10 transition-colors">
                      <ShieldCheck className="w-3.5 h-3.5" /> {t('staff.assignRole')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination (server-side) */}
          {pagination && (
            <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19]">
              <PaginationBar
                page={pagination.page}
                size={query.size ?? DEFAULT_PAGE_SIZE}
                totalElements={pagination.totalElements}
                totalPages={pagination.totalPages}
                onPageChange={(p) => setQuery((q) => ({ ...q, page: p }))}
                onSizeChange={(s) => setQuery((q) => ({ ...q, size: s }))}
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
                <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{detail.fullName}</h3>
                <p className="text-[11px] text-[#8C7C6B]">{detail.email} · {detail.status}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
              <div><span className="font-semibold">{t('staff.fieldPhone')}:</span> {detail.phone ?? '—'}</div>
              <div><span className="font-semibold">{t('staff.fieldLanguage')}:</span> {detail.preferredLanguage}</div>
              <div><span className="font-semibold">{t('staff.fieldCreated')}:</span> {new Date(detail.createdAt).toLocaleString(locale === 'km' ? 'km-KH' : 'en-US')}</div>
              <div><span className="font-semibold">{t('staff.fieldVersion')}:</span> {detail.version}</div>
            </div>
            <h4 className="text-[11px] font-semibold text-[#8C7C6B] uppercase tracking-wider mt-5 mb-2">{t('staff.assignmentsTitle')}</h4>
            <div className="space-y-2">
              {detail.assignments.length === 0 && <p className="text-[11px] text-[#8C7C6B]">{t('staff.noAssignments')}</p>}
              {detail.assignments.map((a) => (
                <div key={a.assignmentId} className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{a.roleName}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${a.active ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#8C7C6B]/10 text-[#8C7C6B]'}`}>
                        {a.active ? t('badge.active') : t('staff.assignmentInactive')}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#8C7C6B] truncate">
                      {a.storeName ?? t('staff.globalScope')} · {new Date(a.assignedAt).toLocaleDateString()}
                      {a.expiresAt ? ` → ${new Date(a.expiresAt).toLocaleDateString()}` : ''}
                      {a.revokedAt ? ` · ${t('staff.revokedAt')} ${new Date(a.revokedAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  {a.active && canAssign && (
                    <button type="button" onClick={() => { setRevokeTarget({ staff: detail, assignment: a }); setRevokeReason(''); }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#DC2626] hover:bg-[#DC2626]/10 transition-colors shrink-0">
                      {t('staff.revoke')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setCreateOpen(false)}>
          <form onSubmit={handleCreate} className="w-full max-w-lg rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('staff.createTitle')}</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className={labelCls}>{t('staff.fieldName')} *</label>
              <input className={inputCls} value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} />
              {fieldErrors.fullName && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.fullName}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('staff.fieldEmail')} *</label>
                <input type="email" className={inputCls} value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                {fieldErrors.email && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.email}</p>}
              </div>
              <div>
                <label className={labelCls}>{t('staff.fieldPassword')} *</label>
                <input type="password" className={inputCls} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                {fieldErrors.password && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.password}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('staff.fieldPhone')}</label>
                <input className={inputCls} placeholder="+85512345678" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
                {fieldErrors.phone && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.phone}</p>}
              </div>
              <div>
                <label className={labelCls}>{t('staff.fieldLanguage')}</label>
                <select className={inputCls} value={createForm.language} onChange={(e) => setCreateForm({ ...createForm, language: e.target.value })}>
                  <option value="km">{t('staff.langKm')}</option>
                  <option value="en">{t('staff.langEn')}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('staff.fieldInitialRole')} *</label>
                {roles.length > 0 ? (
                  <select className={inputCls} value={createForm.roleCode} onChange={(e) => setCreateForm({ ...createForm, roleCode: e.target.value, storeId: '' })}>
                    <option value="">{t('staff.selectRole')}</option>
                    {roles.map((r) => <option key={r.roleId} value={r.roleCode}>{r.roleName}</option>)}
                  </select>
                ) : (
                  <input className={inputCls} value={createForm.roleCode} onChange={(e) => setCreateForm({ ...createForm, roleCode: e.target.value })} />
                )}
                {fieldErrors.roleCode && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.roleCode}</p>}
              </div>
              <div>
                <label className={labelCls}>{t('staff.fieldBranchOptional')}</label>
                <select className={inputCls} value={createForm.storeId} onChange={(e) => setCreateForm({ ...createForm, storeId: e.target.value })} disabled={roles.some((r) => r.roleCode === createForm.roleCode && (r.roleCode === 'SUPER_ADMIN' || r.roleCode === 'ADMIN'))}>
                  <option value="">{t('staff.globalScope')}</option>
                  {accessibleBranches.map((b) => <option key={b.storeId} value={b.storeId}>{b.storeName}</option>)}
                </select>
                {fieldErrors.storeId && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.storeId}</p>}
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('staff.fieldExpiresAt')}</label>
              <input type="datetime-local" className={inputCls} value={createForm.expiresAt} onChange={(e) => setCreateForm({ ...createForm, expiresAt: e.target.value })} />
            </div>
            <p className="text-[10px] text-[#8C7C6B]">{t('staff.noExtraFieldsNotice')}</p>
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
          <form onSubmit={handleUpdate} className="w-full max-w-md rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('staff.editTitle')}</h3>
              <button type="button" onClick={() => setEditTarget(null)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[10px] text-[#8C7C6B]">{t('staff.emailImmutableNotice')}</p>
            <div>
              <label className={labelCls}>{t('staff.fieldName')}</label>
              <input className={inputCls} value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('staff.fieldPhone')}</label>
                <input className={inputCls} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                {fieldErrors.phone && <p className="text-[10px] text-[#DC2626] mt-1">{fieldErrors.phone}</p>}
              </div>
              <div>
                <label className={labelCls}>{t('staff.fieldLanguage')}</label>
                <select className={inputCls} value={editForm.language} onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}>
                  <option value="km">{t('staff.langKm')}</option>
                  <option value="en">{t('staff.langEn')}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditTarget(null)} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting} className="px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] disabled:opacity-60">{isSubmitting ? t('common.loading') : t('common.save')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Status modal */}
      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setStatusTarget(null)}>
          <form onSubmit={handleStatus} className="w-full max-w-md rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
              {statusTarget.activate ? t('staff.activateTitle') : t('staff.deactivateTitle')} — {statusTarget.staff.fullName}
            </h3>
            <div>
              <label className={labelCls}>{t('staff.fieldReason')}</label>
              <textarea className={inputCls} rows={3} maxLength={300} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder={t('staff.fieldReason')} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setStatusTarget(null)} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting} className={`px-3.5 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-60 ${statusTarget.activate ? 'bg-[#2E7D32] hover:bg-[#266429]' : 'bg-[#DC2626] hover:bg-[#B91C1C]'}`}>{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Assign role modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setAssignTarget(null)}>
          <form onSubmit={handleAssign} className="w-full max-w-md rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('staff.assignTitle')} — {assignTarget.fullName}</h3>
              <button type="button" onClick={() => setAssignTarget(null)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className={labelCls}>{t('staff.fieldRole')} *</label>
              {roles.length > 0 ? (
                <select className={inputCls} value={assignForm.roleCode} onChange={(e) => setAssignForm({ ...assignForm, roleCode: e.target.value })}>
                  <option value="">{t('staff.selectRole')}</option>
                  {roles.map((r) => <option key={r.roleId} value={r.roleCode}>{r.roleName}</option>)}
                </select>
              ) : (
                <input className={inputCls} value={assignForm.roleCode} onChange={(e) => setAssignForm({ ...assignForm, roleCode: e.target.value })} />
              )}
            </div>
            <div>
              <label className={labelCls}>{t('staff.fieldBranchOptional')}</label>
              <select className={inputCls} value={assignForm.storeId} onChange={(e) => setAssignForm({ ...assignForm, storeId: e.target.value })}>
                <option value="">{t('staff.globalScope')}</option>
                {accessibleBranches.map((b) => <option key={b.storeId} value={b.storeId}>{b.storeName}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('staff.fieldExpiresAt')}</label>
              <input type="datetime-local" className={inputCls} value={assignForm.expiresAt} onChange={(e) => setAssignForm({ ...assignForm, expiresAt: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAssignTarget(null)} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting} className="px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] disabled:opacity-60">{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Revoke modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setRevokeTarget(null)}>
          <form onSubmit={handleRevoke} className="w-full max-w-md rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
              {t('staff.revokeTitle')} — {revokeTarget.assignment.roleName}
            </h3>
            <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">{t('staff.revokeNotice')}</p>
            <div>
              <label className={labelCls}>{t('staff.fieldReason')}</label>
              <textarea className={inputCls} rows={2} maxLength={300} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setRevokeTarget(null)} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
              <button type="submit" disabled={isSubmitting} className="px-3.5 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-bold hover:bg-[#B91C1C] disabled:opacity-60">{t('staff.revoke')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
