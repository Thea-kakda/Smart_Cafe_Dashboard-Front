import React from 'react';
import { useTranslation } from '../../lib/i18n';
import { AuditLogTable } from '../audit/AuditLogTable';

export const AuditLogsView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
              {t('nav.auditLogs')}
            </h2>
            <span className="rounded-md bg-[#8C7C6B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8C7C6B] uppercase">
              {t('badge.readOnly')}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1 max-w-2xl">
            {t('audit.description')}
          </p>
        </div>
      </div>

      {/* Audit Log Table — self-fetches from the audit API (server-side filters + pagination) */}
      <AuditLogTable showStoreFilter={true} />
    </div>
  );
};
