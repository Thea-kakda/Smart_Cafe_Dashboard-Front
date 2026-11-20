/**
 * Typed client for the protected Audit Log API
 * (GET /api/v1/audit-logs, permission audit:read). Server-side filters: storeId,
 * category, from/to (ISO instants) and pagination; the backend owns ordering
 * (newest-first). Mirrors AuditLogResponse exactly — note the contract carries
 * no actor email/role, description, IP or store-name columns, so those legacy
 * mock-era fields are simply never fabricated here.
 */
import { api } from './api';
import { Paginated } from './management';
import { AuditLog } from '../types';

/** audit.api.AuditLogResponse */
export interface AuditLogRow {
  auditLogId: number;
  occurredAt: string;
  actorUserId?: string | null;
  storeId?: string | null;
  action: string;
  category?: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  outcome: string;
  reason?: string | null;
  requestId?: string | null;
}

export interface AuditListQuery {
  storeId?: string;
  category?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

const BASE = '/api/v1/audit-logs';

export const auditAdminApi = {
  search: (query: AuditListQuery = {}, signal?: AbortSignal) =>
    api.get<Paginated<AuditLogRow>>(BASE, {
      query: {
        storeId: query.storeId || undefined,
        category: query.category || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),
};

function mapOutcome(outcome: string): AuditLog['outcome'] {
  const u = (outcome || '').toUpperCase();
  if (u === 'FAILURE' || u === 'DENIED' || u === 'ERROR') return 'FAILURE';
  if (u === 'WARNING') return 'WARNING';
  return 'SUCCESS';
}

function mapCategory(category?: string | null): AuditLog['category'] {
  const u = (category || '').toUpperCase();
  switch (u) {
    case 'AUTH':
    case 'PRODUCTION':
    case 'INVENTORY':
    case 'STORE':
    case 'CATALOG':
    case 'SECURITY':
      return u as AuditLog['category'];
    default:
      return undefined;
  }
}

/** Map the authoritative row onto the dashboard AuditLog shape (no invented columns). */
export function toAuditLog(r: AuditLogRow): AuditLog {
  return {
    id: String(r.auditLogId),
    actor: r.actorUserId ?? 'system',
    action: r.action,
    aggregate: r.aggregateId ? `${r.aggregateType ?? 'Aggregate'}#${r.aggregateId}` : (r.aggregateType ?? ''),
    category: mapCategory(r.category),
    outcome: mapOutcome(r.outcome),
    reason: r.reason ?? undefined,
    requestId: r.requestId ?? '',
    timestamp: r.occurredAt,
    storeId: r.storeId ?? undefined,
  };
}
