import React, { useMemo, useState } from 'react';
import {
  Flame,
  Play,
  CheckCheck,
  Clock,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { useProduction, ConnectionStatus } from '../../context/ProductionContext';
import { PRODUCTION_STATIONS } from '../../lib/constants';
import { Station } from '../../types';

interface ProductionViewProps {
  mode?: 'KDS' | 'BDS';
  lockedStation?: Station;
}

/**
 * Kitchen / Bakery Display board. Tickets come only from the real per-station
 * production queue (via ProductionContext, which polls). The backend drives the
 * workflow from real orders and exposes exactly two item commands — start and
 * ready — so there is no "create / edit / delete ticket" affordance here: those
 * were mock-era fake mutations and have been removed rather than reimplemented.
 */
export const ProductionView: React.FC<ProductionViewProps> = ({ mode = 'KDS', lockedStation }) => {
  const { t, locale } = useTranslation();
  const { selectedStore } = useStore();
  const { tickets, connectionStatus, startTicket, readyTicket, refreshQueues, isLoading, error } = useProduction();

  const [activeStation, setActiveStation] = useState<Station>(
    lockedStation || (mode === 'BDS' ? 'BAKERY' : 'BARISTA'),
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; idempotencyKey?: string } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success', idempotencyKey?: string) => {
    setFeedback({ type, message, idempotencyKey });
    window.setTimeout(() => setFeedback(null), 4000);
  };

  const handleStart = async (itemId: string, orderRef: string) => {
    setIsProcessingId(itemId);
    try {
      const res = await startTicket(itemId);
      showNotification(`Ticket ${orderRef} preparation started.`, 'success', res.idempotencyKey.slice(0, 8));
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Could not start preparation.', 'error');
    } finally {
      setIsProcessingId(null);
    }
  };

  const handleReady = async (itemId: string, orderRef: string) => {
    setIsProcessingId(itemId);
    try {
      const res = await readyTicket(itemId);
      showNotification(`Ticket ${orderRef} marked READY for collection.`, 'success', res.idempotencyKey.slice(0, 8));
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Could not mark ready.', 'error');
    } finally {
      setIsProcessingId(null);
    }
  };

  const stationTickets = useMemo(() => tickets.filter((t) => t.station === activeStation), [tickets, activeStation]);
  const filteredTickets = useMemo(
    () =>
      stationTickets.filter((t) => {
        const matchSearch =
          t.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.productName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
        const matchPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
        return matchSearch && matchStatus && matchPriority;
      }),
    [stationTickets, searchTerm, statusFilter, priorityFilter],
  );

  const queuedCount = stationTickets.filter((t) => t.status === 'QUEUED').length;
  const inProgressCount = stationTickets.filter((t) => t.status === 'IN_PROGRESS').length;
  const rushCount = stationTickets.filter((t) => t.priority === 'RUSH').length;

  const statusPill = (s: ConnectionStatus) =>
    s === 'CONNECTED' ? 'bg-[#2E7D32]' : s === 'RECONNECTING' ? 'bg-[#D97706] animate-spin' : 'bg-[#C48A56]';
  const statusText = (s: ConnectionStatus) =>
    s === 'CONNECTED' ? 'Real-Time Sync' : s === 'RECONNECTING' ? 'Refreshing…' : 'Polling (no live channel)';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
              {mode === 'BDS'
                ? locale === 'km'
                  ? 'ជួរផលិតកម្មនំប៉័ង (BDS)'
                  : 'Bakery Display System (BDS)'
                : locale === 'km'
                  ? 'ប្រព័ន្ធបញ្ជូនផលិតកម្មផ្ទះបាយ (KDS)'
                  : 'Kitchen Display System (KDS)'}
            </h2>
            <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">
              Live Queue
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">
            Real-time branch dispatch queue for <span className="font-semibold text-[#C48A56]">{selectedStore?.name}</span>
            {selectedStore ? ` (${selectedStore.code})` : ''}.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] text-xs font-semibold">
            <span className={`w-2 h-2 rounded-full ${statusPill(connectionStatus)}`} />
            <span className="text-[#1C1A19] dark:text-[#F5F3F0]">{statusText(connectionStatus)}</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshQueues()}
            disabled={isLoading}
            className="p-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] text-[#8C7C6B] hover:text-[#C48A56] transition-colors disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl p-3 text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-[#2E7D32]/15 text-[#2E7D32] border border-[#2E7D32]/30'
              : 'bg-[#DC2626]/15 text-[#DC2626] border border-[#DC2626]/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{feedback.message}</span>
            {feedback.idempotencyKey && (
              <span className="font-mono text-[10px] bg-black/10 px-1.5 py-0.5 rounded">Key: {feedback.idempotencyKey}</span>
            )}
          </div>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && !feedback && (
        <div className="rounded-xl p-3 text-xs font-semibold flex items-center gap-2 bg-[#DC2626]/10 text-[#DC2626] border border-[#DC2626]/20">
          <AlertTriangle className="w-4 h-4" />
          <span>{error.message}</span>
        </div>
      )}

      {/* Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider block">Queued for Prep</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-[#1C1A19] dark:text-[#F5F3F0] font-mono">{queuedCount}</span>
            <span className="text-[10px] text-[#8C7C6B]">orders pending</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider block">Active in Preparation</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-[#C48A56] font-mono">{inProgressCount}</span>
            <span className="text-[10px] text-[#C48A56] font-semibold">station active</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-[#8C7C6B] uppercase tracking-wider block">Rush Orders</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-[#DC2626] font-mono">{rushCount}</span>
            <span className="text-[10px] text-[#DC2626] font-bold">priority</span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E3DF] dark:border-[#2B2522] pb-3">
        {!lockedStation ? (
          <div className="flex flex-wrap gap-2">
            {PRODUCTION_STATIONS.map((station) => {
              const isActive = activeStation === station.id;
              const count = tickets.filter((t) => t.station === station.id).length;
              return (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => setActiveStation(station.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#C48A56] text-white shadow-xs'
                      : 'bg-[#FFFFFF] dark:bg-[#201D19] border border-[#E5E3DF] dark:border-[#2B2522] text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]'
                  }`}
                >
                  <Flame className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#C48A56]'}`} />
                  <span>{station.labelKey}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-black/20 text-white' : 'bg-[#F0EFED] dark:bg-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#C48A56]/15 text-[#C48A56] font-bold text-xs">
            <Flame className="w-4 h-4" />
            <span>Station: {lockedStation}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-44">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#8C7C6B]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tickets..."
              className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] pl-8 pr-3 py-1.5 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-2.5 py-1.5 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="QUEUED">Queued</option>
            <option value="IN_PROGRESS">In Progress</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-2.5 py-1.5 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="RUSH">Rush</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
          </select>
        </div>
      </div>

      {/* Tickets grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTickets.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-[#E5E3DF] dark:border-[#2B2522] p-12 text-center text-[#8C7C6B]">
            <CheckCircle2 className="w-8 h-8 mx-auto text-[#2E7D32]/50" />
            <p className="font-semibold text-sm mt-2">Station queue is currently clear.</p>
            <p className="text-xs mt-1">No open tickets for {activeStation} matching the active filters.</p>
          </div>
        ) : (
          filteredTickets.map((ticket) => {
            const isProcessing = isProcessingId === ticket.id;
            return (
              <div
                key={ticket.id}
                className={`rounded-2xl border p-5 bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs flex flex-col justify-between transition-all ${
                  ticket.priority === 'RUSH'
                    ? 'border-[#DC2626] ring-2 ring-[#DC2626]/20'
                    : 'border-[#E5E3DF] dark:border-[#2B2522]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-[#8C7C6B]">{ticket.ticketId}</span>
                      <h3 className="text-base font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{ticket.productName}</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {ticket.priority === 'RUSH' && (
                        <span className="rounded bg-[#DC2626] px-1.5 py-0.5 text-[9px] font-bold text-white uppercase animate-pulse">
                          RUSH
                        </span>
                      )}
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          ticket.status === 'IN_PROGRESS' ? 'bg-[#C48A56]/15 text-[#C48A56]' : 'bg-[#8C7C6B]/15 text-[#8C7C6B]'
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-xl bg-[#FBFBF9] dark:bg-[#151310] border border-[#E5E3DF] dark:border-[#2B2522]">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-extrabold text-[#C48A56]">{ticket.quantity}x</span>
                      <span className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{ticket.productName}</span>
                    </div>
                    {ticket.customizations && ticket.customizations.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] text-[#6E5E4F] dark:text-[#A89D94] border-t border-[#E5E3DF] dark:border-[#2B2522] pt-2">
                        {ticket.customizations.map((c, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C48A56]" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-[#8C7C6B]">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5 text-[#C48A56]" />
                      {ticket.queueTime}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E5E3DF] dark:border-[#2B2522] flex items-center gap-2">
                  {ticket.status === 'QUEUED' && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleStart(ticket.id, ticket.ticketId)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#C48A56] py-2 text-xs font-bold text-white hover:bg-[#B37947] disabled:opacity-50 transition-colors shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{isProcessing ? 'Starting...' : 'Start Prep'}</span>
                    </button>
                  )}
                  {ticket.status === 'IN_PROGRESS' && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleReady(ticket.id, ticket.ticketId)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#2E7D32] py-2 text-xs font-bold text-white hover:bg-[#256629] disabled:opacity-50 transition-colors shadow-xs"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>{isProcessing ? 'Updating...' : 'Mark Ready'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
