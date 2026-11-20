import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildAuditCsv } from '../lib/auditExport';
import { AuditLog } from '../types';

describe('AuditLog CSV Export Tests', () => {
  // Local fixture standing in for a page of audit rows sourced from the API.
  const SEED_AUDIT_LOGS: AuditLog[] = [
    {
      id: '1001',
      actor: 'manager@smartcoffee.kh',
      action: 'INVENTORY_STOCK_ADJUSTED',
      aggregate: 'Ingredient#ING-MILK-OAT',
      category: 'INVENTORY',
      outcome: 'SUCCESS',
      requestId: 'req-a1b2c3',
      timestamp: '2026-09-25T08:04:12Z',
      storeId: 'store-001',
    },
    {
      id: '1002',
      actor: 'system',
      action: 'AUTH_LOGIN_FAILURE',
      aggregate: 'User#usr-42',
      category: 'AUTH',
      outcome: 'FAILURE',
      reason: 'Bad credentials',
      requestId: 'req-d4e5f6',
      timestamp: '2026-09-25T07:30:00Z',
    },
  ];

  it('formats audit logs into compliant RFC 4180 CSV with correct headers', () => {
    const csv = buildAuditCsv(SEED_AUDIT_LOGS);
    const lines = csv.split('\r\n');

    assert.ok(lines.length >= SEED_AUDIT_LOGS.length + 1, 'Should contain header line plus data rows');
    const headerLine = lines[0];
    assert.ok(headerLine.includes('Correlation Request ID'));
    assert.ok(headerLine.includes('User / Actor'));
    assert.ok(headerLine.includes('Action Event'));
    assert.ok(headerLine.includes('Outcome'));
    assert.ok(headerLine.includes('Branch ID'));
  });

  it('escapes quotes and special characters properly in CSV cells', () => {
    const customLog: AuditLog = {
      id: 'test-log-01',
      timestamp: '2026-09-25 10:00:00',
      requestId: 'req-"quoted"-123',
      actor: 'Admin, Lead "Super"',
      action: 'UPDATE_PRICE',
      aggregate: 'Product "Croissant, Butter"',
      outcome: 'SUCCESS',
      storeId: 'store-001',
    };

    const csv = buildAuditCsv([customLog]);
    const lines = csv.split('\r\n');
    const dataRow = lines[1];

    assert.ok(dataRow.includes('""quoted""'), 'Quotes must be doubled');
    assert.ok(dataRow.includes('"Admin, Lead ""Super"""'), 'Cells with commas must be enclosed in quotes');
  });

  it('handles empty log sets cleanly', () => {
    const csv = buildAuditCsv([]);
    const lines = csv.split('\r\n');
    assert.strictEqual(lines.length, 1, 'Empty logs list should only output header row');
  });
});
