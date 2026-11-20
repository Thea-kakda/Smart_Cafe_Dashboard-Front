/**
 * Typed client for the protected Roles & Permissions administration API
 * (/api/v1/management/roles and /api/v1/management/permissions). Role creation
 * is intentionally not exposed here because the backend does not expose it:
 * roles are system-defined; the only mutation is a permission-set replacement.
 */
import { api } from './api';

/** identity.api.RoleResponse */
export interface AdminRole {
  roleId: string;
  roleCode: string;
  roleName: string;
  permissionCodes: string[];
}

/** identity.api.PermissionResponse (category is persisted; no invented descriptions). */
export interface AdminPermission {
  permissionId: string;
  permissionCode: string;
  category?: string | null;
}

const BASE = '/api/v1/management';

export const rolesAdminApi = {
  listRoles: (signal?: AbortSignal) => api.get<AdminRole[]>(`${BASE}/roles`, { signal }),

  roleDetail: (roleId: string, signal?: AbortSignal) =>
    api.get<AdminRole>(`${BASE}/roles/${roleId}`, { signal }),

  listPermissions: (signal?: AbortSignal) => api.get<AdminPermission[]>(`${BASE}/permissions`, { signal }),

  /** Full replacement of the role's permission set (transactional server-side). */
  replacePermissions: (roleId: string, permissionCodes: string[]) =>
    api.put<AdminRole>(`${BASE}/roles/${roleId}/permissions`, { permissionCodes }),
};
