/**
 * ERP Settings view (Master Prompt Phase 7/8 outcome). Branch-level settings
 * are real and already persisted (organization.stores columns: timezone,
 * default currency, default language, active flag) — they are exposed through
 * the branch management API and edited in the Branches view, so this view
 * summarizes them per branch instead of duplicating a second edit form.
 * Organization-wide settings (global defaults, tax configuration, opening
 * hours) have NO backing table or endpoint: that section is reported honestly
 * as a BACKEND API GAP with no simulated toggles and no fake Save button.
 */
import React from 'react';
import {
  Settings as SettingsIcon,
  Globe,
  Coins,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Store as StoreIcon,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';

interface SettingsViewProps {
  onNavigate: (tab: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { accessibleBranches, hasPermission } = useAuth();
  const canReadBranches = hasPermission('branch:read');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('nav.settings')}</h2>
        <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('settings.description')}</p>
      </div>

      {/* Real, persisted branch settings (read from the authoritative branch API) */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-[#C48A56]" />
            <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('settings.branchSectionTitle')}</h3>
            <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[9px] font-bold text-[#2E7D32] uppercase">{t('settings.liveFromBackend')}</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('stores')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#C48A56] text-white text-[11px] font-bold hover:bg-[#B37947] transition-colors"
          >
            {t('settings.manageBranches')} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-[#8C7C6B]">{t('settings.branchSectionHint')}</p>

        {canReadBranches && accessibleBranches.length === 0 && (
          <p className="text-xs text-[#8C7C6B]">{t('branches.noBranchScope')}</p>
        )}
        {!canReadBranches && (
          <p className="text-xs text-[#8C7C6B]">{t('settings.branchSectionLocked')}</p>
        )}

        {accessibleBranches.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {accessibleBranches.map((b) => (
              <div key={b.storeId} className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#1C1A19] dark:text-[#F5F3F0] truncate">{b.storeName}</h4>
                    <span className="text-[10px] font-mono text-[#8C7C6B]">{b.storeCode}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${b.active ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#DC2626]/10 text-[#DC2626]'}`}>
                    {b.active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {b.active ? t('badge.active') : t('badge.inactive')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[10px] text-[#6E5E4F] dark:text-[#A89D94]">
                  <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3 text-[#8C7C6B]" />{b.timezone}</span>
                  <span className="inline-flex items-center gap-1"><Coins className="w-3 h-3 text-[#8C7C6B]" />{b.defaultCurrency}</span>
                  <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3 text-[#8C7C6B]" />{b.defaultLanguage}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Honest gap section: nothing here is persisted anywhere in the backend */}
      <div className="rounded-2xl border border-[#B45309]/40 bg-[#B45309]/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#B45309]" />
          <h3 className="text-sm font-bold text-[#B45309]">{t('gap.title')}</h3>
          <span className="rounded bg-[#D97706]/15 px-2 py-0.5 text-[9px] font-bold text-[#B45309] uppercase">{t('badge.backendGap')}</span>
        </div>
        <p className="text-xs text-[#6E5E4F] dark:text-[#A89D94]">{t('settings.orgGapTitle')}</p>
        <ul className="text-[11px] text-[#8C7C6B] space-y-1 list-disc pl-4">
          <li>{t('settings.orgGapItem1')}</li>
          <li>{t('settings.orgGapItem2')}</li>
          <li>{t('settings.orgGapItem3')}</li>
        </ul>
        <p className="text-[11px] font-medium text-[#B45309]">{t('gap.nonInventive')}</p>
      </div>

      {/* Existing per-store operating data that is NOT a settings table */}
      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] p-5 space-y-2">
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-[#C48A56]" />
          <h3 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{t('settings.alreadyRealNoteTitle')}</h3>
        </div>
        <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">{t('settings.alreadyRealNoteBody')}</p>
      </div>
    </div>
  );
};
