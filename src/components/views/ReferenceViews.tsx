import React, { useEffect, useState } from 'react';
import { FolderTree, CreditCard, Scale, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { ApiError } from '../../lib/api';
import { CategoryRow, fetchCategories } from '../../lib/storeProducts';

export const CategoriesView: React.FC = () => {
  const { t } = useTranslation();

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setIsLoading(true);
    setError(null);
    fetchCategories(ctrl.signal)
      .then(setCategories)
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'ABORTED') return;
        setError(err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Categories could not be loaded.'));
      })
      .finally(() => { if (!ctrl.signal.aborted) setIsLoading(false); });
    return () => ctrl.abort();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
          {t('nav.categories')}
        </h2>
        <span className="rounded-md bg-[#8C7C6B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8C7C6B] uppercase">
          {t('badge.readOnly')}
        </span>
      </div>
      <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] -mt-3">{t('categories.description')}</p>

      {error && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3.5 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error.isNetworkError ? t('pricing.networkError') : t('pricing.loadError')} ({error.code})</span></div>
          <button type="button" onClick={() => { setIsLoading(true); setError(null); fetchCategories().then(setCategories).catch((e) => setError(e instanceof ApiError ? e : null)).finally(() => setIsLoading(false)); }} className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-bold hover:bg-[#B91C1C]">{t('common.retry')}</button>
        </div>
      )}

      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 flex items-center justify-center gap-2 text-xs text-[#8C7C6B]"><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</div>
        ) : categories.length === 0 && !error ? (
          <div className="p-10 text-center text-xs text-[#8C7C6B] flex flex-col items-center gap-2"><FolderTree className="w-6 h-6" /> {t('categories.empty')}</div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">{t('categories.colOrder')}</th>
                <th className="py-3 px-4">{t('categories.colName')}</th>
                <th className="py-3 px-4">{t('categories.colCode')}</th>
                <th className="py-3 px-4">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
              {categories.map((c) => (
                <tr key={c.categoryId} className="hover:bg-[#FBFBF9] dark:hover:bg-[#2B2522]/40">
                  <td className="py-3.5 px-4 font-mono font-bold text-[#C48A56]">{c.displayOrder}</td>
                  <td className="py-3.5 px-4 font-semibold">{c.name}</td>
                  <td className="py-3.5 px-4 font-mono text-[#8C7C6B]">{c.code}</td>
                  <td className="py-3.5 px-4 text-[#8C7C6B]">{c.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export const PaymentMethodsView: React.FC = () => {
  const { t } = useTranslation();

  const methods = [
    { id: 'CASH', name: 'Cash on Counter (USD / KHR)', type: 'OFFLINE', enabled: true },
    { id: 'KHQR', name: 'Bakong KHQR (National QR Standard)', type: 'DIGITAL', enabled: true },
    { id: 'CARD', name: 'Visa / MasterCard / UnionPay POS', type: 'TERMINAL', enabled: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
          {t('nav.paymentMethods')}
        </h2>
        <span className="rounded-md bg-[#8C7C6B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8C7C6B] uppercase">
          {t('badge.readOnly')}
        </span>
      </div>

      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
              <th className="py-3 px-4">Method ID</th>
              <th className="py-3 px-4">Display Name</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-center">Gateway Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
            {methods.map((m) => (
              <tr key={m.id}>
                <td className="py-3.5 px-4 font-mono font-bold text-[#C48A56]">{m.id}</td>
                <td className="py-3.5 px-4 font-semibold">{m.name}</td>
                <td className="py-3.5 px-4 font-mono text-[11px] text-[#8C7C6B]">{m.type}</td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#2E7D32]/10 text-[#2E7D32]">
                    Operational
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const UnitsOfMeasureView: React.FC = () => {
  const { t } = useTranslation();

  const units = [
    { code: 'KG', name: 'Kilogram', domain: 'WEIGHT', precision: 2 },
    { code: 'G', name: 'Gram', domain: 'WEIGHT', precision: 0 },
    { code: 'L', name: 'Liter', domain: 'VOLUME', precision: 2 },
    { code: 'ML', name: 'Milliliter', domain: 'VOLUME', precision: 0 },
    { code: 'CARTON', name: 'Carton (12x Pack)', domain: 'UNIT', precision: 0 },
    { code: 'PCS', name: 'Pieces', domain: 'UNIT', precision: 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">
          {t('nav.unitsOfMeasure')}
        </h2>
        <span className="rounded-md bg-[#8C7C6B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8C7C6B] uppercase">
          {t('badge.readOnly')}
        </span>
      </div>

      <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FFFFFF] dark:bg-[#201D19] shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFBF9] dark:bg-[#151310] text-[#6E5E4F] dark:text-[#A89D94] uppercase tracking-wider font-semibold">
              <th className="py-3 px-4">Unit Code</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Domain</th>
              <th className="py-3 px-4 text-center">Decimal Precision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E3DF] dark:divide-[#2B2522] text-[#1C1A19] dark:text-[#F5F3F0]">
            {units.map((u) => (
              <tr key={u.code}>
                <td className="py-3.5 px-4 font-mono font-bold text-[#C48A56]">{u.code}</td>
                <td className="py-3.5 px-4 font-semibold">{u.name}</td>
                <td className="py-3.5 px-4 text-[#8C7C6B]">{u.domain}</td>
                <td className="py-3.5 px-4 text-center font-mono">{u.precision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
