import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ApiError } from '../lib/api';
import { metricState, productionState, summarizeStationQueues } from '../lib/dashboardWidgetState';

const STATIONS = ['BARISTA', 'BAKERY', 'KITCHEN'] as const;
const ok = <T>(value: T[]): PromiseSettledResult<T[]> => ({ status: 'fulfilled', value });
const fail = (reason: unknown): PromiseSettledResult<never[]> => ({ status: 'rejected', reason });
const notFound = () => new ApiError(404, 'RESOURCE_NOT_FOUND', 'Production station not found');
const forbidden = () => new ApiError(403, 'AUTH_FORBIDDEN', 'Forbidden');
const serverError = () => new ApiError(500, 'INTERNAL_ERROR', 'boom');

describe('Dashboard metric state (Net Sales / Inventory cards)', () => {
  it('200 with no rows is empty, not forbidden', () => {
    assert.strictEqual(metricState({ permitted: true, loading: false, error: null, hasData: false }), 'empty');
  });

  it('rows present is a value', () => {
    assert.strictEqual(metricState({ permitted: true, loading: false, error: null, hasData: true }), 'value');
  });

  it('missing permission is forbidden', () => {
    assert.strictEqual(metricState({ permitted: false, loading: false, error: null, hasData: false }), 'forbidden');
  });

  it('backend 403 is forbidden even when the frontend holds the code', () => {
    assert.strictEqual(metricState({ permitted: true, loading: false, error: forbidden(), hasData: false }), 'forbidden');
  });

  it('500 and network failures are errors, not forbidden', () => {
    assert.strictEqual(metricState({ permitted: true, loading: false, error: serverError(), hasData: false }), 'error');
    assert.strictEqual(metricState({ permitted: true, loading: false, error: new ApiError(0, 'NETWORK_ERROR', 'x'), hasData: false }), 'error');
  });

  it('first load in flight is loading', () => {
    assert.strictEqual(metricState({ permitted: true, loading: true, error: null, hasData: false }), 'loading');
  });
});

describe('Production queue aggregation across stations', () => {
  it('a branch with no stations (all 404) is unconfigured, not an error or forbidden', () => {
    const s = summarizeStationQueues(STATIONS, [fail(notFound()), fail(notFound()), fail(notFound())]);
    assert.deepStrictEqual(s, { rows: [], forbidden: false, error: null, unconfiguredStations: ['BARISTA', 'BAKERY', 'KITCHEN'] });
    assert.strictEqual(
      productionState({ permitted: true, forbidden: s.forbidden, error: s.error, loaded: true, allStationsUnconfigured: true }),
      'empty',
    );
  });

  it('one missing station keeps tickets from the others', () => {
    const s = summarizeStationQueues<string>(STATIONS, [ok(['t1', 't2']), fail(notFound()), ok(['t3'])]);
    assert.deepStrictEqual(s.rows, ['t1', 't2', 't3']);
    assert.deepStrictEqual(s.unconfiguredStations, ['BAKERY']);
    assert.strictEqual(s.error, null);
    assert.strictEqual(
      productionState({ permitted: true, forbidden: false, error: null, loaded: true, allStationsUnconfigured: false }),
      'value',
    );
  });

  it('a 403 from any station is forbidden', () => {
    const s = summarizeStationQueues(STATIONS, [fail(forbidden()), ok([]), ok([])]);
    assert.strictEqual(s.forbidden, true);
    assert.strictEqual(
      productionState({ permitted: true, forbidden: s.forbidden, error: s.error, loaded: true, allStationsUnconfigured: false }),
      'forbidden',
    );
  });

  it('a 500 is an error, not forbidden', () => {
    const s = summarizeStationQueues(STATIONS, [fail(serverError()), ok([]), ok([])]);
    assert.strictEqual(s.forbidden, false);
    assert.strictEqual(s.error?.status, 500);
    assert.strictEqual(
      productionState({ permitted: true, forbidden: false, error: s.error, loaded: true, allStationsUnconfigured: false }),
      'error',
    );
  });

  it('without production:queue-read the state is forbidden (no elevation)', () => {
    assert.strictEqual(
      productionState({ permitted: false, forbidden: false, error: null, loaded: false, allStationsUnconfigured: false }),
      'forbidden',
    );
  });
});
