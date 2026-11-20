/**
 * Typed client for the notification inbox API (/api/v1/notifications/**).
 * Reads are always the authenticated recipient's own rows (the backend resolves
 * the actor → recipient); there is no cross-user read. Marking read uses the
 * RECIPIENT row id (notificationRecipientId), which is what the backend matches
 * on in NotificationQueryService.read(). Mirrors NotificationResponse exactly —
 * the contract carries one messageKey plus a JSON templateArguments blob and no
 * separate title column, so the mapper derives display text from real fields
 * only (nothing is invented).
 */
import { api } from './api';
import { Paginated } from './management';
import { NotificationItem } from '../types';

/** notification.api.NotificationResponse */
export interface NotificationRow {
  notificationRecipientId: string;
  notificationId: string;
  type: string;
  category: string;
  messageKey: string;
  templateArguments?: string | null;
  actionUrl?: string | null;
  priority: string;
  createdAt: string;
  readAt?: string | null;
}

/** notification.api.UnreadCountResponse */
export interface UnreadCountResult {
  unreadCount: number;
}

const BASE = '/api/v1/notifications';

export const notificationsApi = {
  list: (page = 0, size = 20, signal?: AbortSignal) =>
    api.get<Paginated<NotificationRow>>(BASE, { query: { page, size }, signal }),

  unreadCount: (signal?: AbortSignal) =>
    api.get<UnreadCountResult>(`${BASE}/unread-count`, { signal }),

  markRead: (recipientId: string) => api.patch<void>(`${BASE}/${recipientId}/read`),

  markAllRead: () => api.patch<void>(`${BASE}/read-all`),
};

function parseArgs(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Render the messageKey's template arguments into a compact, real detail line. */
function renderDetail(args: Record<string, unknown> | null): string {
  if (!args) return '';
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

function mapType(type: string): NotificationItem['type'] {
  const u = (type || '').toUpperCase();
  if (u === 'ALERT' || u === 'CRITICAL' || u === 'ERROR') return 'ALERT';
  if (u === 'WARNING') return 'WARNING';
  if (u === 'SUCCESS') return 'SUCCESS';
  return 'INFO';
}

function mapCategory(category: string): NotificationItem['category'] {
  const u = (category || '').toUpperCase();
  if (u === 'INVENTORY') return 'INVENTORY';
  if (u === 'PRODUCTION') return 'PRODUCTION';
  return 'SYSTEM';
}

function mapPriority(priority: string): NotificationItem['priority'] {
  const u = (priority || '').toUpperCase();
  if (u === 'CRITICAL') return 'CRITICAL';
  if (u === 'HIGH') return 'HIGH';
  return 'NORMAL';
}

/** Best-effort in-app navigation target derived from the action URL, if any. */
function deriveActionTarget(actionUrl?: string | null): NotificationItem['actionTarget'] {
  const u = (actionUrl || '').toLowerCase();
  if (u.includes('inventory')) return 'inventory';
  if (u.includes('production')) return 'production';
  if (u.includes('store')) return 'stores';
  return undefined;
}

export function toNotificationItem(r: NotificationRow): NotificationItem {
  const args = parseArgs(r.templateArguments);
  const detail = renderDetail(args);
  return {
    id: r.notificationRecipientId,
    titleKey: r.messageKey,
    messageKey: detail || r.messageKey,
    createdAt: r.createdAt,
    isRead: Boolean(r.readAt),
    type: mapType(r.type),
    category: mapCategory(r.category),
    priority: mapPriority(r.priority),
    actionTarget: deriveActionTarget(r.actionUrl),
    targetId: r.notificationId,
    link: r.actionUrl ?? undefined,
  };
}
