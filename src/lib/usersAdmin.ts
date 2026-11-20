/**
 * Typed client for the protected User Directory API (§1.1, GET
 * /api/v1/management/users/**). This is the global-administrative view over ALL
 * identity users — staff AND customers — and is intentionally distinct from
 * staffAdmin.ts (branch-scoped staff roster). Read-only: the directory never
 * mutates; role assignment/revocation stays on the staff contract. Mirrors the
 * backend DTOs exactly (no invented fields, never any credential material).
 * Guarded by the `user:admin-read` permission code the backend enforces.
 */
import { api } from './api';
import { Paginated } from './management';
import { StaffAssignment } from './staffAdmin';

/** identity.api.ManagementUserSummary */
export interface ManagementUserSummary {
  userId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  preferredLanguage: string;
  status: string;
  roles: string[];
  customer: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** identity.api.ManagementUserDetail.CustomerProfileView */
export interface CustomerProfileView {
  customerId: string;
  loyaltyNumber?: string | null;
  preferredStoreId?: string | null;
  preferredStoreName?: string | null;
  birthDate?: string | null;
  marketingOptIn: boolean;
  customerSince: string;
}

/** identity.api.ManagementUserDetail */
export interface ManagementUserDetail {
  user: ManagementUserSummary;
  assignments: StaffAssignment[];
  customerProfile: CustomerProfileView | null;
}

export type AccountType = 'ALL' | 'STAFF' | 'CUSTOMER';

export interface UserListQuery {
  search?: string;
  status?: string;
  roleCode?: string;
  storeId?: string;
  accountType?: AccountType;
  page?: number;
  size?: number;
}

const BASE = '/api/v1/management/users';

export const usersAdminApi = {
  list: (query: UserListQuery = {}, signal?: AbortSignal) =>
    api.get<Paginated<ManagementUserSummary>>(BASE, {
      query: {
        search: query.search ?? '',
        status: query.status || undefined,
        roleCode: query.roleCode || undefined,
        storeId: query.storeId || undefined,
        accountType: query.accountType ?? 'ALL',
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),

  detail: (userId: string, signal?: AbortSignal) =>
    api.get<ManagementUserDetail>(`${BASE}/${userId}`, { signal }),
};
