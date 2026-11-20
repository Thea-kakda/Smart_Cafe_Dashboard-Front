import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Calculator, AlertCircle, Loader2, Lock, RefreshCw, Info } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  currencyConversionsApi, SUPPORTED_CURRENCIES, ConversionPreviewResult,
} from '../../lib/exchangeRates';

/**
 * Currency Converter (Checkpoint 10). A pure preview surface: it collects intent
 * (branch, pair, decimal amount as a string) and displays exactly what the
 * backend conversion engine (5B) returns. No amount, rate or rounding is ever
 * computed here — that authority lives only on the server, and the same engine
 * is what a real cash payment will re-run at payment time. The estimate notice
 * states this explicitly to the operator.
 */
export const CurrencyConverterView: React.FC = () => {
  const { t } = useTranslation();
  const { stores, selectedStore, setSelectedStoreId } = useStore();
  const { isAuthenticated, hasPermission } = useAuth();

  const canPreview = hasPermission('currency-conversion:preview');

  const [sourceCurrency, setSourceCurrency] = useState<string>('USD');
  const [targetCurrency, setTargetCurrency] = useState<string>('KHR');
  const [amount, setAmount] = useState<string>('');
  const [result, setResult] = useState<ConversionPreviewResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setError(null); setResult(null); }, [selectedStore?.id]);

  const swap = () => {
    setSourceCurrency(targetCurrency);
    setTargetCurrency(sourceCurrency);
    setResult(null);
    setError(null);
  };

  const runPreview = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setError(null);
    if (!selectedStore?.id) { setError(t('conv.noBranch')); return; }
    if (!amount.trim()) { setError(t('conv.amountRequired')); return; }
    // Decimal-shape guard only. The value is sent as a string and the backend
    // performs the authoritative parse, validation and conversion.
    if (!/^\d{1,14}(\.\d{1,4})?$/.test(amount.trim())) { setError(t('conv.amountInvalid')); return; }

    setIsSubmitting(true);
    try {
      const preview = await currencyConversionsApi.preview({
        storeId: selectedStore.id,
        sourceCurrency,
        targetCurrency,
        amount: amount.trim(),
      });
      setResult(preview);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'RATE_UNAVAILABLE') setError(t('conv.rateUnavailable'));
        else if (err.status === 403) setError(t('conv.forbidden'));
        else if (err.status === 400) setError(t('conv.amountInvalid'));
        else setError(t('conv.networkError'));
      } else {
        setError(t('conv.networkError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedStore?.id, sourceCurrency, targetCurrency, amount, t]);

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('conv.title')}</h2>
        <div className="rounded-xl border p-6 text-center text-sm text-[#6E5E4F] flex items-center gap-2 justify-center">
          <Lock className="w-4 h-4 text-[#C48A56]" /> {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!canPreview) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t('conv.title')}</h2>
        <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-4 text-xs font-medium text-[#B45309]">
          {t('conv.forbidden')}
        </div>
      </div>
    );
  }

  const fmt = (value: number | null | undefined, scale?: number) => {
    if (value === null || value === undefined) return '—';
    if (scale !== undefined) return value.toFixed(scale);
    return String(value);
  };
  const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1A19] dark:text-[#F5F3F0]">{t('conv.title')}</h2>
          <span className="rounded-md bg-[#2E7D32]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32] uppercase">{t('conv.backendBadge')}</span>
        </div>
        <p className="text-xs sm:text-sm text-[#6E5E4F] dark:text-[#A89D94] mt-1">{t('conv.description')}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Input card */}
        <form onSubmit={runPreview} className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
            <Calculator className="w-4 h-4 text-[#C48A56]" /> {t('conv.inputs')}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('conv.branch')}</label>
            <select
              value={selectedStore?.id ?? ''}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id} className="dark:bg-[#201D19]">{s.name} ({s.code}) · {s.defaultCurrency}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('conv.sourceCurrency')}</label>
              <select value={sourceCurrency} onChange={(e) => setSourceCurrency(e.target.value)}
                className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40">
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button type="button" onClick={swap} title={t('conv.swap')}
              className="mb-0.5 flex items-center justify-center w-9 h-9 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">
              <ArrowLeftRight className="w-4 h-4 text-[#C48A56]" />
            </button>
            <div>
              <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('conv.targetCurrency')}</label>
              <select value={targetCurrency} onChange={(e) => setTargetCurrency(e.target.value)}
                className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40">
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0] mb-1">{t('conv.amount')} ({sourceCurrency})</label>
            <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40" />
          </div>

          {error && (
            <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 p-3 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <button type="submit" disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#C48A56] hover:bg-[#A36C3D] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-60 transition-colors">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {isSubmitting ? t('conv.previewing') : t('conv.preview')}
          </button>
        </form>

        {/* Result card */}
        <div className="rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">
              <Info className="w-4 h-4 text-[#C48A56]" /> {t('conv.result')}
            </div>
            {result && (
              <button type="button" onClick={() => void runPreview(new Event('submit') as unknown as React.FormEvent)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-[#C48A56] hover:underline">
                <RefreshCw className="w-3 h-3" /> {t('conv.recompute')}
              </button>
            )}
          </div>

          {!result && !error && (
            <div className="py-10 text-center text-xs text-[#8C7C6B]">{t('conv.awaiting')}</div>
          )}

          {result && (
            <>
              <div className="rounded-xl bg-[#F7F5F2] dark:bg-[#26221F] p-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#8C7C6B]">{t('conv.sourceAmount')}</div>
                  <div className="text-lg font-bold font-mono text-[#1C1A19] dark:text-[#F5F3F0]">{fmt(result.sourceAmount)} {result.sourceCurrency}</div>
                </div>
                <ArrowLeftRight className="w-5 h-5 text-[#C48A56] mb-1.5" />
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-[#8C7C6B]">{t('conv.targetAmount')}</div>
                  <div className="text-lg font-bold font-mono text-[#2E7D32]">{fmt(result.targetAmount, result.targetScale)} {result.targetCurrency}</div>
                </div>
              </div>

              <dl className="text-xs divide-y divide-[#EFECE8] dark:divide-[#2B2522]">
                <Row label={t('conv.appliedRate')} value={`${fmt(result.appliedRate)} · ${result.baseCurrency}→${result.quoteCurrency}`} mono />
                <Row label={t('conv.direction')}
                  value={result.exchangeRateId === null
                    ? t('conv.identity')
                    : (result.inversionUsed ? t('conv.inverse') : t('conv.direct'))} />
                <Row label={t('conv.rateSource')} value={result.rateSource || '—'} />
                <Row label={t('conv.effectiveAt')} value={result.exchangeRateId === null ? '—' : fmtTime(result.effectiveAt)} />
                <Row label={t('conv.validUntil')} value={result.exchangeRateId === null ? '—' : (result.validUntil ? fmtTime(result.validUntil) : t('conv.openEnded'))} />
                <Row label={t('conv.rounding')} value={`${result.roundingMode} · ${result.targetScale} ${t('conv.dp')}`} />
                <Row label={t('conv.serverTime')} value={fmtTime(result.serverTimestamp)} />
              </dl>

              <div className="rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-3 text-[11px] font-medium leading-relaxed text-[#B45309]">
                {t('conv.estimateNotice')}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <dt className="text-[#8C7C6B] shrink-0">{label}</dt>
    <dd className={`font-semibold text-right text-[#1C1A19] dark:text-[#F5F3F0] break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
  </div>
);
