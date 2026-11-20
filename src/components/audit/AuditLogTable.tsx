/**
 * Audit ledger table backed by the protected Audit Log API
 * (GET /api/v1/audit-logs, permission audit:read). All filtering (category,
 * branch) and pagination are executed server-side; the browser only renders the
 * authoritative rows. The contract carries no actor role, human description,
 * branch name or client IP columns, so those are never fabricated here — the
 * table and CSV export expose only the fields the backend actually returns.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  Copy,
  Check,
  Eye,
  X,
  Lock,
  Download,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { ApiError } from '../../lib/api';
import { AuditLogRow, auditAdminApi, toAuditLog } from '../../lib/auditAdmin';
import { buildAuditCsv } from '../../lib/auditExport';
import { Paginated } from '../../lib/management';
import { AuditLog } from '../../types';
import { PaginationBar } from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

interface AuditLogTableProps {
  showStoreFilter?: boolean;
}

const CATEGORIES = ['AUTH', 'PRODUCTION', 'INVENTORY', 'STORE', 'CATALOG', 'SECURITY'];

export const AuditLogTable: React.FC<AuditLogTableProps> = ({ showStoreFilter = true }) => {
  const { t, locale } = useTranslation();
  const { isAuthenticated, hasPermission } = useAuth();
  const { stores } = useStore();

  const canRead = hasPermission('audit:read');

  const [page, setPage] = useState<Paginated<AuditLogRow> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [category, setCategory] = useState('');
  const [storeId, setStoreId] = useState('');
  const [pageNum, setPageNum] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [inspectedLog, setInspectedLog] = useState<AuditLog | null>(null);
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null);
  const [exportFeedbackMsg, setExportFeedbackMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !canRead) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    try {
      setPage(await auditAdminApi.search({ category: category || undefined, storeId: storeId || undefined, page: pageNum, size: pageSize }, controller.signal));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Audit logs could not be loaded.'));
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [isAuthenticated, canRead, category, storeId, pageNum, pageSize]);

  useEffect(() => {
    void load();
    return () => {};
  }, [load]);

  // Reset to first page whenever a server filter changes.
  useEffect(() => {
    setPageNum(0);
  }, [category, storeId, pageSize]);

  const logs: AuditLog[] = (page?.items ?? []).map(toAuditLog);
  const pagination = page?.pagination;

  const handleCopyRequestId = (reqId: string) => {
    navigator.clipboard.writeText(reqId);
    setCopiedRequestId(reqId);
    window.setTimeout(() => setCopiedRequestId(null), 2000);
  };

  const handleExportToCsv = () => {
    if (logs.length === 0) return;
    const csvContent = buildAuditCsv(logs);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `audit-compliance-report-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportFeedbackMsg(
      locale === 'km'
        ? `បានទាញយក ${logs.length} កំណត់ហេតុ (ទំព័របច្ចុប្បន្ន) ជា CSV។`
        : `Exported the ${logs.length} loaded audit events (current page) to CSV.`,
    );
    window.setTimeout(() => setExportFeedbackMsg(null), 3500);
  };

  const getCategoryIcon = (log: AuditLog) => {
    switch (log.category) {
      case 'AUTH': return <Lock className="w-3 h-3 text-[#C48A56]" />;
      case 'PRODUCTION': return <ShieldCheck className="w-3 h-3 text-[#D97706]" />;
      case 'INVENTORY': return <CheckCircle2 className="w-3 h-3 text-[#2E7D32]" />;
      case 'SECURITY': return <AlertTriangle className="w-3 h-3 text-[#DC2626]" />;
      default: return <FileText className="w-3 h-3 text-[#8C7C6B]" />;
    }
  };

  const selectCls =
    'rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] px-3 py-2 text-xs text-[#1C1A19] dark:text-[#F5F3F0] focus:border-[#C48A56] focus:outline-none';

  if (!isAuthenticated || !canRead) {
    return (
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-6 text-xs text-[#6E5E4F] dark:text-[#A89D94] flex items-center gap-2">
        <Lock className="w-4 h-4 text-[#C48A56]" />
        <span>{isAuthenticated ? t('audit.readForbidden') : t('audit.signInPrompt')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter / search bar — all server-side */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#6E5E4F] dark:text-[#A89D94]">
          <Filter className="w-4 h-4 text-[#C48A56]" />
          <span>{t('audit.filterServer')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
            <option value="">{t('audit.allCategories')}</option>
            {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>

          {showStoreFilter && (
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={selectCls}>
              <option value="">{t('audit.allBranches')}</option>
              {stores.map((s) => (<option key={s.id} value={s.id}>{s.code} — {s.name}</option>))}
            </select>
          )}

          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            title={t('common.refresh')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C48A56] ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </button>

          <button
            type="button"
            onClick={handleExportToCsv}
            disabled={logs.length === 0}
            title={t('audit.exportHint')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C48A56] hover:bg-[#B37947] disabled:opacity-40 text-xs font-semibold text-white transition-all shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('common.exportCsv')} ({logs.length})</span>
          </button>
        </div>
      </div>

      {exportFeedbackMsg && (
        <div className="rounded-xl border border-[#2E7D32]/30 bg-[#2E7D32]/10 p-3 text-xs text-[#2E7D32] font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{exportFeedbackMsg}</span></div>
          <button type="button" onClick={() => setExportFeedbackMsg(null)} className="hover:opacity-75"><X className="w-4 h-4" /></button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{error.isNetworkError ? t('audit.networkError') : t('audit.loadError')} ({error.code})</span></div>
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold hover:bg-[#B91C1C]">{t('common.retry')}</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">{t('audit.colTimestamp')}</th>
                <th className="py-3 px-4">{t('audit.colActor')}</th>
                <th className="py-3 px-4">{t('audit.colAction')}</th>
                <th className="py-3 px-4">{t('audit.colAggregate')}</th>
                <th className="py-3 px-4 text-center">{t('audit.colOutcome')}</th>
                <th className="py-3 px-4">{t('audit.colRequestId')}</th>
                <th className="py-3 px-4 text-center">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
              {isLoading ? (
                <tr><td colSpan={7} className="py-12 text-center text-[#8C7C6B]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-6 h-6 text-[#C48A56] animate-spin" />
                    <p className="font-semibold text-xs">{t('common.loading')}</p>
                  </div>
                </td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-[#8C7C6B]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText className="w-6 h-6 text-[#8C7C6B]" />
                    <p className="font-semibold text-xs">{t('audit.empty')}</p>
                  </div>
                </td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
                        <Clock className="w-3.5 h-3.5 text-[#8C7C6B] shrink-0" />
                        <span>{new Date(log.timestamp).toLocaleString(locale === 'km' ? 'km-KH' : 'en-US')}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#C48A56]/20 text-[#C48A56] flex items-center justify-center font-bold text-[10px] shrink-0">
                          {log.actor.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate max-w-[160px] font-semibold text-xs">{log.actor}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {getCategoryIcon(log)}
                        <span className="font-mono font-bold text-[11px] text-[#C48A56]">{log.action}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#8C7C6B] max-w-xs truncate">{log.aggregate || '—'}</td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        log.outcome === 'SUCCESS' ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : log.outcome === 'WARNING' ? 'bg-[#D97706]/10 text-[#D97706]' : 'bg-[#DC2626]/10 text-[#DC2626]'
                      }`}>
                        {log.outcome === 'SUCCESS' ? <CheckCircle2 className="w-3 h-3" /> : log.outcome === 'WARNING' ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {log.outcome}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px]">
                      <div className="flex items-center gap-1.5 text-[#8C7C6B]">
                        <span className="truncate max-w-[100px]">{log.requestId}</span>
                        <button type="button" onClick={() => handleCopyRequestId(log.requestId)} className="hover:text-[#C48A56] p-0.5 rounded transition-colors" title={t('audit.copyId')}>
                          {copiedRequestId === log.requestId ? <Check className="w-3 h-3 text-[#2E7D32]" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button type="button" onClick={() => setInspectedLog(log)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] hover:border-[#C48A56] text-[#C48A56] hover:bg-[#C48A56]/10 transition-colors text-[11px] font-semibold">
                        <Eye className="w-3 h-3" /><span>{t('common.view')}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server pagination footer */}
        {pagination && (
          <PaginationBar
            page={pagination.page}
            size={pageSize}
            totalElements={pagination.totalElements}
            totalPages={pagination.totalPages}
            onPageChange={setPageNum}
            onSizeChange={setPageSize}
            disabled={isLoading}
          />
        )}
      </div>

      {/* Detail modal — only fields the contract returns */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DF] dark:border-[#2B2522]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#C48A56]/15 text-[#C48A56]"><FileText className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('audit.detailTitle')}</h3>
                  <p className="font-mono text-[10px] text-[#8C7C6B]">{t('audit.colEventId')}: {inspectedLog.id}</p>
                </div>
              </div>
              <button type="button" onClick={() => setInspectedLog(null)} className="text-[#8C7C6B] hover:text-[#1C1A19] dark:hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-xs">
              <div className="py-2 flex justify-between gap-3"><span className="text-[#8C7C6B]">{t('audit.colAction')}</span><span className="font-mono font-bold text-[#C48A56] text-right">{inspectedLog.action}</span></div>
              <div className="py-2 flex justify-between gap-3"><span className="text-[#8C7C6B]">{t('audit.colActor')}</span><span className="font-medium text-right break-all">{inspectedLog.actor}</span></div>
              {inspectedLog.category && (<div className="py-2 flex justify-between gap-3"><span className="text-[#8C7C6B]">{t('audit.colCategory')}</span><span>{inspectedLog.category}</span></div>)}
              <div className="py-2 flex justify-between gap-3"><span className="text-[#8C7C6B]">{t('audit.colAggregate')}</span><span className="font-mono font-semibold text-right break-all">{inspectedLog.aggregate || '—'}</span></div>
              <div className="py-2 flex justify-between gap-3"><span className="text-[#8C7C6B]">{t('audit.colOutcome')}</span><span className={`font-bold ${inspectedLog.outcome === 'SUCCESS' ? 'text-[#2E7D32]' : 'text-[#DC2626]'}`}>{inspectedLog.outcome}{inspectedLog.reason ? ` — ${inspectedLog.reason}` : ''}</span></div>
              <div className="py-2 flex justify-between items-center gap-3"><span className="text-[#8C7C6B]">{t('audit.colRequestId')}</span>
                <div className="flex items-center gap-1 font-mono text-[11px]"><span>{inspectedLog.requestId}</span><button type="button" onClick={() => handleCopyRequestId(inspectedLog.requestId)} className="p-1 hover:text-[#C48A56]">{copiedRequestId === inspectedLog.requestId ? <Check className="w-3.5 h-3.5 text-[#2E7D32]" /> : <Copy className="w-3.5 h-3.5" />}</button></div>
              </div>
              <div className="py-2 flex justify-between gap-3"><span className="text-[#8C7C6B]">{t('audit.colTimestamp')}</span><span className="font-mono">{new Date(inspectedLog.timestamp).toLocaleString(locale === 'km' ? 'km-KH' : 'en-US')}</span></div>
              {inspectedLog.storeId && (<div className="py-2 flex justify-between gap-3"><span className="text-[#8C7C6B]">{t('audit.colBranchId')}</span><span className="font-mono break-all">{inspectedLog.storeId}</span></div>)}
            </div>

            <p className="text-[10px] text-[#8C7C6B]">{t('audit.noExtraFieldsNotice')}</p>

            <button type="button" onClick={() => setInspectedLog(null)} className="w-full rounded-xl bg-[#C48A56] py-2 text-xs font-bold text-white hover:bg-[#B37947]">{t('common.close')}</button>
          </div>
        </div>
      )}
    </div>
  );
};
