/**
 * Typed client for the protected exchange-rate management API
 * (/api/v1/management/exchange-rates/**) and the read-only currency-conversion
 * preview (/api/v1/currency-conversions/preview).
 *
 * Financial-integrity note (Checkpoint 10): every monetary value here is shown
 * exactly as the backend produced it. The dashboard NEVER multiplies, divides or
 * rounds a rate/amount locally — a conversion result is whatever
 * currencyConversionsApi.preview returns. Decimal inputs (rate, amount) travel
 * to the server as strings so no IEEE-754 rounding can occur before the backend
 * BigDecimal parses them.
 */
import { api } from './api';
import { PaginationMeta } from './storeProducts';

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

/* ------------------------------------------------- exchange-rate management */

export interface ExchangeRateRow {
  exchangeRateId: string;
  storeId: string | null;
  scope: 'GLOBAL' | 'BRANCH';
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  source: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type RateScope = 'ALL' | 'GLOBAL' | 'BRANCH';

export interface ExchangeRateQuery {
  base?: string;
  quote?: string;
  scope?: RateScope;
  storeId?: string;
  active?: boolean;
  page?: number;
  size?: number;
}

/** Rate travels as a decimal string to preserve precision for the server. */
export interface CreateExchangeRateInput {
  storeId: string | null;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  source?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

const RATES_BASE = '/api/v1/management/exchange-rates';

export const exchangeRatesApi = {
  list: (query: ExchangeRateQuery = {}, signal?: AbortSignal): Promise<Paginated<ExchangeRateRow>> =>
    api.get<Paginated<ExchangeRateRow>>(RATES_BASE, {
      query: {
        base: query.base ?? '',
        quote: query.quote ?? '',
        scope: query.scope ?? 'ALL',
        storeId: query.storeId ?? '',
        active: query.active,
        page: query.page ?? 0,
        size: query.size ?? 20,
      },
      signal,
    }),

  get: (rateId: string, signal?: AbortSignal): Promise<ExchangeRateRow> =>
    api.get<ExchangeRateRow>(`${RATES_BASE}/${rateId}`, { signal }),

  create: (input: CreateExchangeRateInput): Promise<ExchangeRateRow> =>
    api.post<ExchangeRateRow>(RATES_BASE, input),

  deactivate: (rateId: string, version: number): Promise<ExchangeRateRow> =>
    api.post<ExchangeRateRow>(`${RATES_BASE}/${rateId}/deactivate`, { version }),
};

/* ------------------------------------------------ currency conversion API */

/** Body of POST /api/v1/currency-conversions/preview. */
export interface ConversionPreviewInput {
  storeId: string;
  sourceCurrency: string;
  targetCurrency: string;
  /** Decimal string; the server parses to BigDecimal, never a JS number. */
  amount: string;
}

/** Full authoritative decision trail returned by the backend (5B contract). */
export interface ConversionPreviewResult {
  sourceAmount: number;
  sourceCurrency: string;
  targetAmount: number;
  targetCurrency: string;
  exchangeRateId: string | null;
  appliedRate: number;
  baseCurrency: string;
  quoteCurrency: string;
  inversionUsed: boolean;
  rateSource: string;
  effectiveAt: string | null;
  validUntil: string | null;
  roundingMode: string;
  targetScale: number;
  serverTimestamp: string;
}

export const currencyConversionsApi = {
  preview: (input: ConversionPreviewInput): Promise<ConversionPreviewResult> =>
    api.post<ConversionPreviewResult>('/api/v1/currency-conversions/preview', input),
};

/* --------------------------------------------------------------- helpers */

export const SUPPORTED_CURRENCIES = ['USD', 'KHR'] as const;
