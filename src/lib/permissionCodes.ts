/**
 * Backend permission codes (mirrors com.smartcoffee.common.security.PermissionCodes).
 * Must match identity.permissions exactly; tests/permission-codes.test.ts enforces it.
 */
export const PERMISSIONS = {
  REPORT_SALES_READ: 'report:sales-read',
  INVENTORY_READ: 'inventory:read',
  AUDIT_READ: 'audit:read',
  PRODUCTION_QUEUE_READ: 'production:queue-read',
} as const;
