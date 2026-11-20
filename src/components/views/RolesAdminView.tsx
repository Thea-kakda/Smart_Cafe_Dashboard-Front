/**
 * Roles & Permissions administration view (Master Prompt Phase 8 / §7).
 * Reads the real /api/v1/management/roles and /api/v1/management/permissions
 * contracts. Role creation is intentionally absent because the backend does
 * not expose it — roles are system-defined; the only mutation is a
 * permission-set replacement (PUT). SUPER_ADMIN is presented as a protected
 * baseline: the view blocks the edit affordance and the backend independently
 * rejects any attempt to rewrite it (409/403 PROTECTED_ROLE).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Lock,
  Edit3,
  KeyRound,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import { AdminPermission, AdminRole, rolesAdminApi } from '../../lib/rolesAdmin';

export const RolesAdminView: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();

  const canReadRoles = hasPermission('role:read');
  const canReadPermissions = hasPermission('permission:read');
  const canManage = hasPermission('role:permission-manage');

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<AdminRole | null>(null);
  const [draftCodes, setDraftCodes] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!feedback) return;
    const h = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(h);
  }, [feedback]);

  const load = async () => {
    if (!canReadRoles) return;
    setIsLoading(true);
    setError(null);
    try {
      const [rs, ps] = await Promise.all([
        rolesAdminApi.listRoles(),
        canReadPermissions ? rolesAdminApi.listPermissions() : Promise.resolve([]),
      ]);
      setRoles(rs);
      setPermissions(ps);
      // Keep the open editor in sync with authoritative data after reload.
      setSelected((prev) => (prev ? rs.find((r) => r.roleId === prev.roleId) ?? null : null));
    } catch (err) {
      setError(err instanceof ApiError ? err : null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReadRoles, canReadPermissions]);

  const openEditor = (role: AdminRole) => {
    setSelected(role);
    setDraftCodes(new Set(role.permissionCodes));
  };

  const grouped = useMemo(() => {
    const map = new Map<string, AdminPermission[]>();
    permissions.forEach((p) => {
      const key = p.category ?? 'general';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  // Permission codes held by the role but not present in the catalog (defensive:
  // render them anyway so a replacement PUT never silently drops real grants).
  const orphanCodes = useMemo(() => {
    if (!selected) return [];
    const known = new Set(permissions.map((p) => p.permissionCode));
    return Array.from(draftCodes).filter((c) => !known.has(c));
  }, [selected, draftCodes, permissions]);

  const isProtected = (role: AdminRole) => role.roleCode === 'SUPER_ADMIN';

  const handleSave = async () => {
    if (!selected || isProtected(selected)) return;
    setIsSaving(true);
    try {
      const updated = await rolesAdminApi.replacePermissions(selected.roleId, Array.from(draftCodes));
      setRoles((prev) => prev.map((r) => (r.roleId === updated.roleId ? updated : r)));
      setSelected(updated);
      setDraftCodes(new Set(updated.permissionCodes));
      setFeedback({ kind: 'success', text: t('roles.updatedSuccess') });
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'PROTECTED_ROLE' || err.status === 403 || err.status === 409)) {
        setFeedback({ kind: 'warning', text: t('roles.protectedBlocked') });
      } else if (err instanceof ApiError && err.code === 'PERMISSION_UNKNOWN') {
        setFeedback({ kind: 'error', text: t('roles.unknownPermission') });
      } else {
        setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message || t('common.error') : t('roles.networkError') });
      }
      void load();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated || !canReadRoles) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.roles')}</h2>
        <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#C48A56]" />
          <span>{isAuthenticated ? t('roles.readForbidden') : t('roles.signInPrompt')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.roles')}</h2>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('roles.description')}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={isLoading} title={t('common.refresh')} className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] text-[#8C7C6B] hover:text-[#C48A56] disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-3 text-xs font-semibold flex items-center justify-between ${
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

      <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-3 text-[11px] font-medium text-[#B45309] flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{t('roles.noCreateNotice')}</span>
      </div>

      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error.isNetworkError ? t('roles.networkError') : t('roles.loadError')} ({error.code})</span>
          </div>
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold">{t('common.retry')}</button>
        </div>
      )}

      {isLoading && roles.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 animate-pulse space-y-3">
              <div className="h-4 w-1/2 rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
              <div className="h-3 w-full rounded bg-[#F0EFED] dark:bg-[#2B2522]" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && roles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {roles.map((role) => (
            <div key={role.roleId} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EFED] dark:bg-[#2B2522] text-[#C48A56] shrink-0">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0] truncate">{role.roleName}</h3>
                      <span className="text-[11px] font-mono font-semibold text-[#8C7C6B]">{role.roleCode}</span>
                    </div>
                  </div>
                  {isProtected(role) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#B45309]/10 text-[#B45309] text-[9px] font-bold shrink-0">
                      <Lock className="w-3 h-3" /> {t('roles.protected')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {role.permissionCodes.slice(0, 8).map((code) => (
                    <span key={code} className="rounded bg-[#C48A56]/10 px-1.5 py-0.5 text-[9px] font-mono text-[#A36C3D]">{code}</span>
                  ))}
                  {role.permissionCodes.length > 8 && (
                    <span className="text-[9px] text-[#8C7C6B] font-semibold">+{role.permissionCodes.length - 8}</span>
                  )}
                </div>
                <p className="text-[11px] text-[#8C7C6B] mt-2">{role.permissionCodes.length} {t('roles.permissionCount')}</p>
              </div>
              {canManage && !isProtected(role) && permissions.length > 0 && (
                <button type="button" onClick={() => openEditor(role)} className="mt-4 pt-3 border-t border-[#F0EFED] dark:border-[#2B2522] flex items-center gap-1.5 text-[11px] font-semibold text-[#C48A56] hover:text-[#A36C3D] transition-colors">
                  <Edit3 className="w-3.5 h-3.5" /> {t('roles.editPermissions')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && roles.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-10 text-center text-xs text-[#8C7C6B]">{t('common.noData')}</div>
      )}

      {/* Permission replacement editor */}
      {selected && permissions.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-2xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0] flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#C48A56]" /> {selected.roleName}
                </h3>
                <p className="text-[11px] text-[#8C7C6B]">{selected.roleCode} · {t('roles.replaceHint')}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-1.5 rounded-lg text-[#8C7C6B] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]"><X className="w-4 h-4" /></button>
            </div>

            {grouped.map(([category, codes]) => (
              <div key={category} className="mt-4">
                <h4 className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider mb-2">{category}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {codes.map((p) => (
                    <label key={p.permissionId} className="flex items-center gap-2 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] px-2.5 py-1.5 cursor-pointer hover:border-[#C48A56]/50">
                      <input
                        type="checkbox"
                        checked={draftCodes.has(p.permissionCode)}
                        onChange={(e) => {
                          setDraftCodes((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p.permissionCode);
                            else next.delete(p.permissionCode);
                            return next;
                          });
                        }}
                        className="accent-[#C48A56]"
                      />
                      <span className="text-[11px] font-mono text-[#1C1A19] dark:text-[#F5F3F0] truncate">{p.permissionCode}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {orphanCodes.length > 0 && (
              <div className="mt-4">
                <h4 className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider mb-2">{t('roles.orphanTitle')}</h4>
                {orphanCodes.map((c) => (
                  <label key={c} className="flex items-center gap-2 rounded-lg border border-[#B45309]/30 bg-[#B45309]/5 px-2.5 py-1.5 mb-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftCodes.has(c)}
                      onChange={(e) => {
                        setDraftCodes((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c);
                          else next.delete(c);
                          return next;
                        });
                      }}
                      className="accent-[#C48A56]"
                    />
                    <span className="text-[11px] font-mono text-[#B45309] truncate">{c}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-5 pt-3 border-t border-[#F0EFED] dark:border-[#2B2522]">
              <span className="text-[11px] text-[#8C7C6B]">{draftCodes.size} / {permissions.length}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelected(null)} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]">{t('common.cancel')}</button>
                <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="px-3.5 py-2 rounded-xl bg-[#C48A56] text-white text-xs font-bold hover:bg-[#B37947] disabled:opacity-60">
                  {isSaving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
