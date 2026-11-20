/**
 * User Directory view (§1.1, GET /api/v1/management/users/**). This is the
 * global administrative visibility over EVERY identity account — staff AND
 * customers — the core "see users in the UI" ask. It is intentionally READ-
 * ONLY: the directory never mutates. Role assignment / revocation lives on the
 * Staff Administration contract (which enforces staff:* codes), so the account
 * detail here surfaces assignment history but offers no write controls. The
 * backend enforces `user:admin-read`; the view re-checks the same code before
 * rendering rows and never exposes password hashes or refresh tokens (the
 * contract does not return them). All search/filter/pagination is server-side.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Search,
  Eye,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Lock,
  Ban,
  UserCheck,
  ShoppingBag,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  ManagementUserSummary,
  ManagementUserDetail,
  usersAdminApi,
  UserListQuery,
  AccountType,
} from '../../lib/usersAdmin';
import { Paginated } from '../../lib/management';
import { AdminRole, rolesAdminApi } from '../../lib/rolesAdmin';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

export const UsersAdminView: React.FC = () => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission, accessibleBranches } = useAuth();

  const canRead = hasPermission('user:admin-read');

  const [data, setData] = useState<Paginated<ManagementUserSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState<UserListQuery>({ search: '', accountType: 'ALL', page: 0, size: DEFAULT_PAGE_SIZE });
  const [searchInput, setSearchInput] = useState('');
  const [roles, setRoles] = useState<AdminRole[]>([]);

  const [detail, setDetail] = useState<ManagementUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounced server-side search; the backend owns filtering.
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (searchInput !== (query.search ?? '')) setQuery((q) => ({ ...q, search: searchInput, page: 0 }));
    }, 400);
    return () => window.clearTimeout(h);
  }, [searchInput, query.search]);

  // Role catalogue powers the filter select when readable; otherwise the filter
  // is simply not rendered (no fabricated role list).
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
      setData(await usersAdminApi.list(query));
    } catch (err) {
      setError(err instanceof ApiError ? err : null);
    } finally {
      setIsLoading(false);
    }
  }, [canRead, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (userId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      setDetail(await usersAdminApi.detail(userId));
    } catch (err) {
      if (err instanceof ApiError) setError(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const inputCls =
    'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:outline-none focus:ring-2 focus:ring-[#C48A56]/30';

  const accountTypeFilter = (query.accountType ?? 'ALL') as AccountType;
  const statusFilterValue = query.status ?? '';
  const roleFilterValue = query.roleCode ?? '';
  const branchFilterValue = query.storeId ?? '';
  const rows = data?.items ?? [];
  const pagination = data?.pagination;
  const initialLoading = isLoading && !data;

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
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.users')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('users.readForbidden') : t('users.signInPrompt')}</span>
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
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.users')}</h2>
            <span className="rounded-md bg-[#8C7C6B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8C7C6B] uppercase">
              {t('badge.readOnly')}
            </span>
            {pagination && (
              <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">
                {pagination.totalElements} {t('users.totalCount')}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1 max-w-2xl">{t('users.description')}</p>
        </div>
      </div>

      {/* Filter bar (all filtering is server-side) */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-3.5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] px-3">
            <Search className="w-4 h-4 text-[#8C7C6B] shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              className="w-full bg-transparent py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] placeholder-[#8C7C6B] focus:outline-none"
            />
          </div>
          <select
            value={accountTypeFilter}
            onChange={(e) => setQuery((q) => ({ ...q, accountType: (e.target.value || 'ALL') as AccountType, page: 0 }))}
            className={inputCls}
          >
            <option value="ALL">{t('users.accountAll')}</option>
            <option value="STAFF">{t('users.accountStaff')}</option>
            <option value="CUSTOMER">{t('users.accountCustomer')}</option>
          </select>
          <select value={statusFilterValue} onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value || undefined, page: 0 }))} className={inputCls}>
            <option value="">{t('staff.statusAll')}</option>
            <option value="ACTIVE">{t('badge.active')}</option>
            <option value="DISABLED">{t('staff.statusDisabled')}</option>
          </select>
          {roleSelect ?? <div className={inputCls + ' opacity-60'}>{t('staff.allRoles')}</div>}
          <div className="flex items-center gap-2">
            <select value={branchFilterValue} onChange={(e) => setQuery((q) => ({ ...q, storeId: e.target.value || undefined, page: 0 }))} className={inputCls}>
              <option value="">{t('staff.allBranches')}</option>
              {accessibleBranches.map((b) => (
                <option key={b.storeId} value={b.storeId}>{b.storeName}</option>
              ))}
            </select>
            <button type="button" onClick={() => void load()} disabled={isLoading} title={t('common.refresh')} className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] transition-colors disabled:opacity-50 shrink-0">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error.isNetworkError ? t('users.networkError') : t('users.loadError')} ({error.code})</span>
          </div>
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold hover:bg-[#B91C1C] transition-colors">{t('common.retry')}</button>
        </div>
      )}

      {initialLoading && (
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 animate-pulse space-y-3">
          <div className="h-4 w-1/3 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
          <div className="h-3 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
          <div className="h-3 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
        </div>
      )}

      {!initialLoading && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('users.empty')}</div>
      )}

      {!initialLoading && rows.length > 0 && (
        <>
          <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">{t('staff.fieldName')}</th>
                    <th className="py-3 px-4">{t('staff.fieldEmail')}</th>
                    <th className="py-3 px-4 text-center">{t('users.accountType')}</th>
                    <th className="py-3 px-4">{t('staff.fieldRoles')}</th>
                    <th className="py-3 px-4 text-center">{t('staff.fieldStatus')}</th>
                    <th className="py-3 px-4">{t('staff.fieldCreated')}</th>
                    <th className="py-3 px-4 text-center">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
                  {rows.map((u) => (
                    <tr key={u.userId} className="hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] shrink-0">
                            <Users className="h-4 w-4" />
                          </div>
                          <span className="font-semibold truncate">{u.fullName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#6E5E4F] dark:text-[#A89D94]">{u.email}</td>
                      <td className="py-3 px-4 text-center">
                        {u.customer ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#C48A56]/10 px-2 py-0.5 text-[10px] font-semibold text-[#A36C3D]">
                            <ShoppingBag className="w-3 h-3" /> {t('users.customerBadge')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#8C7C6B]/10 px-2 py-0.5 text-[10px] font-semibold text-[#6E5E4F] dark:text-[#A89D94]">
                            <UserCheck className="w-3 h-3" /> {t('users.staffBadge')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 && <span className="text-[#8C7C6B]">—</span>}
                          {u.roles.map((r) => (
                            <span key={r} className="rounded-md bg-[#C48A56]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#A36C3D]">{r}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.status === 'ACTIVE' ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#DC2626]/10 text-[#DC2626]'
                        }`}>
                          {u.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-[#8C7C6B]">
                        {new Date(u.createdAt).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => void openDetail(u.userId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] hover:border-[#C48A56] text-[#C48A56] hover:bg-[#C48A56]/10 transition-colors text-[11px] font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" /> {t('common.view')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* Detail drawer (read-only) */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs p-0 sm:p-4" onClick={() => { setDetail(null); }}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-[#FFFFFF] dark:bg-[#201D19] border-l border-[#E5E3DF] dark:border-[#2B2522] sm:rounded-2xl sm:border p-5" onClick={(e) => e.stopPropagation()}>
            {detailLoading || !detail ? (
              <div className="flex items-center gap-2 text-xs text-[#8C7C6B] py-10 justify-center">
                <RefreshCw className="w-4 h-4 animate-spin" /> {t('common.loading')}
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0] truncate">{detail.user.fullName}</h3>
                    <p className="text-[11px] text-[#8C7C6B] truncate">{detail.user.email}</p>
                  </div>
                  <button type="button" onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
                </div>

                {/* Account */}
                <h4 className="text-[11px] font-semibold text-[#8C7C6B] uppercase tracking-wider mt-5 mb-2">{t('users.profileSection')}</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
                  <div><span className="font-semibold">{t('staff.fieldStatus')}:</span> {detail.user.status}</div>
                  <div><span className="font-semibold">{t('users.accountType')}:</span> {detail.user.customer ? t('users.customerBadge') : t('users.staffBadge')}</div>
                  <div><span className="font-semibold">{t('staff.fieldPhone')}:</span> {detail.user.phone ?? '—'}</div>
                  <div><span className="font-semibold">{t('staff.fieldLanguage')}:</span> {detail.user.preferredLanguage}</div>
                  <div><span className="font-semibold">{t('staff.fieldCreated')}:</span> {new Date(detail.user.createdAt).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-US')}</div>
                  <div><span className="font-semibold">{t('staff.fieldVersion')}:</span> {detail.user.version}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {detail.user.roles.length === 0 && <span className="text-[11px] text-[#8C7C6B]">—</span>}
                  {detail.user.roles.map((r) => (
                    <span key={r} className="rounded-md bg-[#C48A56]/10 px-2 py-0.5 text-[10px] font-semibold text-[#A36C3D]">{r}</span>
                  ))}
                </div>

                {/* Assignments */}
                <h4 className="text-[11px] font-semibold text-[#8C7C6B] uppercase tracking-wider mt-5 mb-2">{t('users.assignmentsSection')}</h4>
                <div className="space-y-2">
                  {detail.assignments.length === 0 && <p className="text-[11px] text-[#8C7C6B]">{t('staff.noAssignments')}</p>}
                  {detail.assignments.map((a) => (
                    <div key={a.assignmentId} className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{a.roleName}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${a.active ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#8C7C6B]/10 text-[#8C7C6B]'}`}>
                          {a.active ? t('badge.active') : t('staff.assignmentInactive')}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#8C7C6B] truncate mt-0.5">
                        {a.storeName ?? t('staff.globalScope')} · {new Date(a.assignedAt).toLocaleDateString()}
                        {a.expiresAt ? ` → ${new Date(a.expiresAt).toLocaleDateString()}` : ''}
                        {a.revokedAt ? ` · ${t('staff.revokedAt')} ${new Date(a.revokedAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Customer profile */}
                <h4 className="text-[11px] font-semibold text-[#8C7C6B] uppercase tracking-wider mt-5 mb-2">{t('users.customerSection')}</h4>
                {detail.customerProfile ? (
                  <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] p-3 grid grid-cols-2 gap-2 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
                    <div><span className="font-semibold">{t('users.loyaltyNumber')}:</span> {detail.customerProfile.loyaltyNumber ?? '—'}</div>
                    <div><span className="font-semibold">{t('users.preferredStore')}:</span> {detail.customerProfile.preferredStoreName ?? '—'}</div>
                    <div><span className="font-semibold">{t('users.birthDate')}:</span> {detail.customerProfile.birthDate ?? '—'}</div>
                    <div><span className="font-semibold">{t('users.customerSince')}:</span> {detail.customerProfile.customerSince ? new Date(detail.customerProfile.customerSince).toLocaleDateString() : '—'}</div>
                    <div className="col-span-2"><span className="font-semibold">{t('users.accountType')}:</span> {detail.customerProfile.marketingOptIn ? t('users.marketingOptIn') : t('users.marketingOptOut')}</div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#8C7C6B]">{t('users.noCustomerProfile')}</p>
                )}

                <p className="text-[10px] text-[#8C7C6B] mt-5">{t('users.description')}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
