import { ApiError } from './api';

/**
 * Display state of a dashboard metric. Only `forbidden` means "Permission
 * required"; a 200 with no data is `empty` and any other failure is `error`.
 */
export type WidgetState = 'loading' | 'forbidden' | 'error' | 'empty' | 'value';

export const isForbiddenError = (err: unknown): boolean => err instanceof ApiError && err.isForbidden;

const isNotFoundError = (err: unknown): boolean => err instanceof ApiError && err.status === 404;

export interface MetricInput {
  permitted: boolean;
  loading: boolean;
  error: unknown;
  hasData: boolean;
}

export function metricState({ permitted, loading, error, hasData }: MetricInput): WidgetState {
  if (!permitted || isForbiddenError(error)) return 'forbidden';
  if (error) return 'error';
  if (loading && !hasData) return 'loading';
  return hasData ? 'value' : 'empty';
}

export interface StationQueueSummary<T> {
  rows: T[];
  forbidden: boolean;
  error: ApiError | null;
  unconfiguredStations: string[];
}

/**
 * Folds per-station queue results. A 404 means that station is not
 * configured for the branch (ProductionQueueQueryService), not a failure.
 */
export function summarizeStationQueues<T>(
  stations: readonly string[],
  results: PromiseSettledResult<T[]>[],
): StationQueueSummary<T> {
  const rows: T[] = [];
  const unconfiguredStations: string[] = [];
  let forbidden = false;
  let error: ApiError | null = null;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      rows.push(...result.value);
      return;
    }
    const reason = result.reason;
    if (isForbiddenError(reason)) forbidden = true;
    else if (isNotFoundError(reason)) unconfiguredStations.push(stations[i]);
    else if (!error) {
      error = reason instanceof ApiError ? reason : new ApiError(0, 'NETWORK_ERROR', 'Production queue could not be loaded.');
    }
  });

  return { rows, forbidden, error, unconfiguredStations };
}

export function productionState(input: {
  permitted: boolean;
  forbidden: boolean;
  error: unknown;
  loaded: boolean;
  allStationsUnconfigured: boolean;
}): WidgetState {
  if (!input.permitted || input.forbidden) return 'forbidden';
  if (input.error) return 'error';
  if (!input.loaded) return 'loading';
  return input.allStationsUnconfigured ? 'empty' : 'value';
}
