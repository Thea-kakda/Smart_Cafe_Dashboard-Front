/**
 * Typed client for the store production queue API
 * (/api/v1/stores/{storeId}/production/{station} + ticket-item start/ready).
 * The queue is read per station; start/ready are the ONLY item mutations the
 * backend exposes (Idempotency-Key header required — the workflow is driven by
 * real orders, so tickets are never created/edited/deleted from the dashboard).
 * station is a StationType token (BARISTA|BAKERY|KITCHEN); the backend maps an
 * unknown token to a safe 400. Permissions: production:queue-read,
 * production:item-start, production:item-ready, plus the store scope.
 */
import { api } from './api';
import { Station, ProductionTicketItem } from '../types';

/** production.api.ProductionItemResponse */
export interface ProductionItemRow {
  ticketItemId: string;
  orderItemId: string;
  productName: string;
  quantity: number;
  customizationSummary?: string | null;
  status: string;
  startedAt?: string | null;
  readyAt?: string | null;
  version: number;
}

/** production.api.ProductionTicketResponse */
export interface ProductionTicketRow {
  ticketId: string;
  ticketNumber: string;
  orderId: string;
  storeId: string;
  stationId?: string | null;
  stationType: string;
  status: string;
  priority: string;
  queuedAt: string;
  items: ProductionItemRow[];
  version: number;
}

const BASE = (storeId: string) => `/api/v1/stores/${storeId}/production`;

function uuidV4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC-4122 v4 fallback for non-secure contexts.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const productionApi = {
  queue: (storeId: string, station: Station, signal?: AbortSignal) =>
    api.get<ProductionTicketRow[]>(`${BASE(storeId)}/${station}`, { signal }),

  startItem: (itemId: string) => {
    const key = uuidV4();
    return api
      .post<ProductionTicketRow>(`/api/v1/production/ticket-items/${itemId}/start`, undefined, {
        headers: { 'Idempotency-Key': key },
      })
      .then((ticket) => ({ ticket, idempotencyKey: key }));
  },

  readyItem: (itemId: string) => {
    const key = uuidV4();
    return api
      .post<ProductionTicketRow>(`/api/v1/production/ticket-items/${itemId}/ready`, undefined, {
        headers: { 'Idempotency-Key': key },
      })
      .then((ticket) => ({ ticket, idempotencyKey: key }));
  },
};

function mapStationType(code: string): Station {
  const u = (code || '').toUpperCase();
  if (u.includes('BARISTA')) return 'BARISTA';
  if (u.includes('BAKERY')) return 'BAKERY';
  return 'KITCHEN';
}

function mapItemStatus(status: string): ProductionTicketItem['status'] {
  const u = (status || '').toUpperCase();
  if (u === 'READY' || u === 'COMPLETED' || u === 'DONE') return 'READY';
  if (u === 'IN_PROGRESS' || u === 'PREPARING' || u === 'STARTED') return 'IN_PROGRESS';
  return 'QUEUED';
}

function mapPriority(priority: string): ProductionTicketItem['priority'] {
  const u = (priority || '').toUpperCase();
  if (u === 'RUSH') return 'RUSH';
  if (u === 'HIGH') return 'HIGH';
  return 'NORMAL';
}

/** Compact relative age from a real ISO timestamp (no fabricated strings). */
function ageLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

/** Flatten one ticket's item lines into the dashboard board's per-item shape. */
export function toTicketItems(ticket: ProductionTicketRow): ProductionTicketItem[] {
  const station = mapStationType(ticket.stationType);
  const priority = mapPriority(ticket.priority);
  return (ticket.items ?? []).map((item) => ({
    id: item.ticketItemId,
    ticketId: ticket.ticketNumber,
    orderNumber: ticket.ticketNumber,
    productName: item.productName,
    quantity: item.quantity,
    station,
    status: mapItemStatus(item.status),
    customizations: item.customizationSummary ? [item.customizationSummary] : [],
    queueTime: ageLabel(ticket.queuedAt),
    priority,
    orderId: ticket.orderId,
    itemStatus: item.status,
    version: item.version,
  }));
}
