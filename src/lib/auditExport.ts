/**
 * Pure RFC-4180 CSV builder over the audit columns the backend contract
 * actually returns. Kept in its own module (with no dependency on the API
 * client or React) so the unit test can import the real production code path
 * under plain `node --test`, and the table component shares the exact same
 * builder. Never invents actor-role, description, branch-name or IP columns.
 */
import { AuditLog } from '../types';

export function buildAuditCsv(logsToExport: AuditLog[]): string {
  const headers = [
    'Timestamp',
    'Correlation Request ID',
    'User / Actor',
    'Action Event',
    'Category',
    'Aggregate / Entity',
    'Outcome',
    'Branch ID',
    'Failure / Warning Reason',
  ];

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = logsToExport.map((log) => [
    escapeCsv(log.timestamp),
    escapeCsv(log.requestId),
    escapeCsv(log.actor),
    escapeCsv(log.action),
    escapeCsv(log.category || ''),
    escapeCsv(log.aggregate),
    escapeCsv(log.outcome),
    escapeCsv(log.storeId || ''),
    escapeCsv(log.reason || ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}
