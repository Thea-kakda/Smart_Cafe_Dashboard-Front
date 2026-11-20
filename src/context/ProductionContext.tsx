import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ProductionTicketItem, Station } from '../types';
import { ApiError } from '../lib/api';
import { productionApi, toTicketItems, ProductionTicketRow } from '../lib/productionAdmin';
import { PERMISSIONS } from '../lib/permissionCodes';
import { summarizeStationQueues } from '../lib/dashboardWidgetState';
import { useStore } from './StoreContext';
import { useAuth } from './AuthContext';

export type ConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'POLLING_FALLBACK';

export const STATIONS: Station[] = ['BARISTA', 'BAKERY', 'KITCHEN'];
const POLL_INTERVAL_MS = 12_000;

interface ProductionContextType {
  tickets: ProductionTicketItem[];
  connectionStatus: ConnectionStatus;
  isPollingFallback: boolean;
  isLoading: boolean;
  error: ApiError | null;
  /** Missing production:queue-read, or the backend answered 403. */
  forbidden: boolean;
  /** True once a queue load for the selected store has completed. */
  loaded: boolean;
  unconfiguredStations: Station[];
  startTicket: (itemId: string) => Promise<{ success: boolean; idempotencyKey: string }>;
  readyTicket: (itemId: string) => Promise<{ success: boolean; idempotencyKey: string }>;
  refreshQueues: () => Promise<void>;
  getStationTickets: (station: Station) => ProductionTicketItem[];
}

const ProductionContext = createContext<ProductionContextType>({
  tickets: [],
  connectionStatus: 'POLLING_FALLBACK',
  isPollingFallback: true,
  isLoading: false,
  error: null,
  forbidden: true,
  loaded: false,
  unconfiguredStations: [],
  startTicket: async () => ({ success: false, idempotencyKey: '' }),
  readyTicket: async () => ({ success: false, idempotencyKey: '' }),
  refreshQueues: async () => {},
  getStationTickets: () => [],
});

/**
 * Production board backed by the real per-station queue API. The dashboard has
 * no WebSocket, so this honestly reports POLLING_FALLBACK and re-polls while the
 * tree is mounted — there is no fabricated "Real-Time Sync". Tickets come only
 * from the server (started by real orders); the dashboard never creates, edits
 * or deletes tickets because the backend exposes only start/ready item commands.
 */
export const ProductionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedStoreId } = useStore();
  const { isAuthenticated, hasPermission } = useAuth();
  const canRead = hasPermission(PERMISSIONS.PRODUCTION_QUEUE_READ);

  const [tickets, setTickets] = useState<ProductionTicketItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('POLLING_FALLBACK');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [serverForbidden, setServerForbidden] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unconfiguredStations, setUnconfiguredStations] = useState<Station[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (manual: boolean) => {
      if (!isAuthenticated || !canRead || !selectedStoreId) {
        setTickets([]);
        setLoaded(false);
        setServerForbidden(false);
        setUnconfiguredStations([]);
        setError(null);
        return;
      }
      if (manual) setConnectionStatus('RECONNECTING');
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (manual) setIsLoading(true);
      try {
        const results = await Promise.allSettled(
          STATIONS.map((station) => productionApi.queue(selectedStoreId, station, controller.signal)),
        );
        if (controller.signal.aborted) return;
        const summary = summarizeStationQueues<ProductionTicketRow>(STATIONS, results);
        const flat: ProductionTicketItem[] = [];
        summary.rows.forEach((t) => flat.push(...toTicketItems(t)));
        // Keep only open tickets (READY lines linger briefly server-side; drop them
        // from the working board like the POS ready queue does).
        setTickets(flat.filter((t) => t.status !== 'READY'));
        setServerForbidden(summary.forbidden);
        setError(summary.error);
        setUnconfiguredStations(summary.unconfiguredStations as Station[]);
        setLoaded(true);
        setConnectionStatus('POLLING_FALLBACK');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    },
    [isAuthenticated, canRead, selectedStoreId],
  );

  // Initial + store-change load.
  useEffect(() => {
    void load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  // Polling fallback cadence (no WS available in the dashboard).
  useEffect(() => {
    if (!isAuthenticated || !canRead || !selectedStoreId) return;
    const id = window.setInterval(() => void load(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isAuthenticated, canRead, selectedStoreId, load]);

  const applyTicket = useCallback((ticket: ProductionTicketRow) => {
    const next = toTicketItems(ticket);
    setTickets((prev) => {
      const withoutThisTicket = prev.filter((t) => t.ticketId !== ticket.ticketNumber);
      return [...withoutThisTicket, ...next.filter((t) => t.status !== 'READY')];
    });
  }, []);

  const startTicket = useCallback(
    async (itemId: string) => {
      const { ticket, idempotencyKey } = await productionApi.startItem(itemId);
      applyTicket(ticket);
      return { success: true, idempotencyKey };
    },
    [applyTicket],
  );

  const readyTicket = useCallback(
    async (itemId: string) => {
      const { ticket, idempotencyKey } = await productionApi.readyItem(itemId);
      applyTicket(ticket);
      return { success: true, idempotencyKey };
    },
    [applyTicket],
  );

  const refreshQueues = useCallback(async () => {
    await load(true);
  }, [load]);

  const getStationTickets = useCallback(
    (station: Station) => tickets.filter((t) => t.station === station),
    [tickets],
  );

  return (
    <ProductionContext.Provider
      value={{
        tickets,
        connectionStatus,
        isPollingFallback: connectionStatus === 'POLLING_FALLBACK',
        isLoading,
        error,
        forbidden: !canRead || serverForbidden,
        loaded,
        unconfiguredStations,
        startTicket,
        readyTicket,
        refreshQueues,
        getStationTickets,
      }}
    >
      {children}
    </ProductionContext.Provider>
  );
};

export const useProduction = () => useContext(ProductionContext);
