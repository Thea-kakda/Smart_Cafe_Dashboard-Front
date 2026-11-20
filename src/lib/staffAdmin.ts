/**
 * Typed client for the protected Staff Administration API
 * (GET/POST/PUT /api/v1/management/staff/**). Mirrors the backend DTO contracts
 * exactly: no invented fields (there is no employeeCode or shiftSchedule column
 * behind StaffResponse, so none appear here). View code deals in these shapes,
 * never raw URLs.
 */
import { api } from './api';
import { Paginated } from './management';

/** identity.api.StaffResponse */
export interface StaffMember {
  userId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  preferredLanguage: string;
  status: string;
  roles: string[];
  assignments: StaffAssignment[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** identity.api.StaffAssignmentView */
export interface StaffAssignment {
  assignmentId: string;
  roleCode: string;
  roleName: string;
  storeId?: string | null;
  storeName?: string | null;
  assignedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  active: boolean;
}

export interface StaffListQuery {
  search?: string;
  status?: string;
  roleCode?: string;
  storeId?: string;
  sort?: string;
  page?: number;
  size?: number;
}

/** POST body. Password is enrollment-only; it is never returned by the API. */
export interface CreateStaffInput {
  fullName: string;
  email: string;
  password: string;
  phone?: string | null;
  preferredLanguage: string;
  roleCode: string;
  storeId?: string | null;
  expiresAt?: string | null;
}

/** PUT body: full replacement of the editable profile fields + optimistic lock. */
export interface UpdateStaffInput {
  fullName?: string;
  phone?: string | null;
  preferredLanguage?: string;
  version: number;
}

export interface StaffStatusInput {
  active: boolean;
  reason: string;
  version: number;
}

export interface RoleAssignmentInput {
  roleCode: string;
  storeId?: string | null;
  expiresAt?: string | null;
}

const BASE = '/api/v1/management/staff';

export const staffAdminApi = {
  list: (query: StaffListQuery = {}, signal?: AbortSignal) =>
    api.get<Paginated<StaffMember>>(BASE, {
      query: {
        search: query.search ?? '',
        status: query.status || undefined,
        roleCode: query.roleCode || undefined,
        storeId: query.storeId || undefined,
        sort: query.sort ?? 'createdAt',
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),

  detail: (userId: string, signal?: AbortSignal) =>
    api.get<StaffMember>(`${BASE}/${userId}`, { signal }),

  create: (input: CreateStaffInput) => api.post<StaffMember>(BASE, input),

  update: (userId: string, input: UpdateStaffInput) =>
    api.put<StaffMember>(`${BASE}/${userId}`, input),

  changeStatus: (userId: string, input: StaffStatusInput) =>
    api.post<StaffMember>(`${BASE}/${userId}/status`, input),

  assignRole: (userId: string, input: RoleAssignmentInput) =>
    api.post<StaffMember>(`${BASE}/${userId}/role-assignments`, input),

  revokeAssignment: (userId: string, assignmentId: string, reason: string) =>
    api.post<StaffMember>(`${BASE}/${userId}/role-assignments/${assignmentId}/revoke`, { reason }),
};
