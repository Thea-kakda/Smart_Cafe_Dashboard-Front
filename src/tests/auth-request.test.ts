import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  ApiError,
  apiRequest,
  authLogin,
  refreshSession,
  setAccessToken,
  setUnauthenticatedHandler,
} from '../lib/api';

/**
 * Checkpoint 12: Dashboard auth request-loop guards.
 *
 * These exercise the REAL API layer (lib/api.ts), which is where the reported
 * "repeated /auth/refresh and /auth/login" flood was mitigated:
 *   - one login action -> one login request (POST is never auto-retried);
 *   - login/register endpoints are never intercepted for a refresh;
 *   - the refresh endpoint is single-flight (concurrent 401s share one promise);
 *   - a network failure (ECONNREFUSED) is NOT treated as invalid credentials;
 *   - an unrefreshable 401 does not spin into an infinite retry loop.
 *
 * The login form's "disabled while submitting" + onSubmit-preventDefault guards
 * live in AuthModal.tsx (a React component) and are verified by inspection; this
 * file covers the transport layer where duplicate requests would actually occur.
 */

interface FetchCall {
  url: string;
  method: string;
}

let calls: FetchCall[] = [];
let fetchImpl: (input: any, init?: any) => Promise<any>;
const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as any).window;

function json(status: number, body: unknown): any {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

const okEnvelope = (data: unknown) => ({ success: true, data });
const errEnvelope = (code: string, message: string) => ({
  success: false,
  error: { code, message },
});

beforeEach(() => {
  calls = [];
  // api.ts's withTimeout() uses window.setTimeout/clearTimeout; provide a
  // minimal shim so the module runs under plain Node/tsx.
  (globalThis as any).window = {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: any) => clearTimeout(id),
  };
  setAccessToken(null);
  setUnauthenticatedHandler(null);
  globalThis.fetch = async (input: any, init?: any) => {
    const url = String(input);
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
    return fetchImpl(input, init);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as any).window = originalWindow;
});

describe('Checkpoint 12: Dashboard auth request-loop guards', () => {
  it('one login produces exactly one request and is never auto-retried on network failure', async () => {
    let attempts = 0;
    fetchImpl = async () => {
      attempts += 1;
      // Simulate backend unavailable (ECONNREFUSED surfaces as a rejected fetch).
      throw new TypeError('fetch failed');
    };

    await assert.rejects(
      () => authLogin({ email: 'a@b.com', password: 'secret' }),
      (err: unknown) => err instanceof ApiError && err.isNetworkError,
    );

    // POST login must not be retried by the safe-read retry path.
    assert.strictEqual(attempts, 1, 'network-failed login must issue exactly one request');
    const loginCalls = calls.filter((c) => c.url.includes('/api/v1/auth/login'));
    assert.strictEqual(loginCalls.length, 1);
    // A credential failure must not trigger a token refresh.
    assert.strictEqual(calls.filter((c) => c.url.includes('/auth/refresh')).length, 0);
  });

  it('invalid credentials (401 on login) throw without triggering a refresh intercept', async () => {
    fetchImpl = async () => json(401, errEnvelope('INVALID_CREDENTIALS', 'Bad email or password'));

    await assert.rejects(
      () => authLogin({ email: 'a@b.com', password: 'wrong' }),
      (err: unknown) =>
        err instanceof ApiError && err.status === 401 && err.code === 'INVALID_CREDENTIALS',
    );

    assert.strictEqual(calls.filter((c) => c.url.includes('/api/v1/auth/login')).length, 1);
    // The auth endpoint is excluded from the 401 -> refresh interceptor.
    assert.strictEqual(calls.filter((c) => c.url.includes('/auth/refresh')).length, 0);
  });

  it('concurrent refresh calls share a single in-flight request', async () => {
    fetchImpl = async () =>
      json(
        200,
        okEnvelope({
          userId: 'u1',
          fullName: 'Staff',
          email: 's@b.com',
          preferredLanguage: 'en',
          accessToken: 'fresh-token',
        }),
      );

    const [a, b, c] = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    assert.strictEqual(calls.filter((k) => k.url.includes('/auth/refresh')).length, 1, 'single-flight refresh');
    assert.ok(a && b && c);
    assert.strictEqual(a?.accessToken, 'fresh-token');
  });

  it('a protected 401 triggers exactly one refresh then replays the request once', async () => {
    let accessContextSeen = 0;
    fetchImpl = async (input: any) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return json(
          200,
          okEnvelope({ userId: 'u1', fullName: 'S', email: 's@b.com', preferredLanguage: 'en', accessToken: 'tok2' }),
        );
      }
      // /users/me/access-context: 401 on the first attempt, 200 on replay.
      accessContextSeen += 1;
      if (accessContextSeen === 1) return json(401, errEnvelope('TOKEN_EXPIRED', 'expired'));
      return json(200, okEnvelope({ userId: 'u1', roles: [], permissions: [], accessibleBranches: [] }));
    };

    setAccessToken('stale-token');
    const data = await apiRequest<Record<string, unknown>>('/api/v1/users/me/access-context');

    assert.ok(data);
    assert.strictEqual(calls.filter((c) => c.url.includes('/auth/refresh')).length, 1, 'one refresh');
    assert.strictEqual(calls.filter((c) => c.url.includes('access-context')).length, 2, 'original + one replay');
  });

  it('an unrefreshable 401 fires the unauthenticated handler once and does not loop', async () => {
    let fired = 0;
    setUnauthenticatedHandler(() => {
      fired += 1;
    });
    fetchImpl = async (input: any) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) return json(401, errEnvelope('NO_SESSION', 'no session'));
      return json(401, errEnvelope('TOKEN_EXPIRED', 'expired'));
    };

    setAccessToken('stale-token');
    await assert.rejects(
      () => apiRequest('/api/v1/users/me/access-context'),
      (err: unknown) => err instanceof ApiError && err.status === 401,
    );

    assert.strictEqual(fired, 1, 'unauthenticated handler notified exactly once');
    assert.strictEqual(calls.filter((c) => c.url.includes('/auth/refresh')).length, 1, 'no refresh retry storm');
    assert.strictEqual(calls.filter((c) => c.url.includes('access-context')).length, 1, 'no replay loop');
  });

  it('network failure during refresh keeps session null (no credential retry)', async () => {
    fetchImpl = async () => {
      throw new TypeError('fetch failed');
    };

    const session = await refreshSession();
    assert.strictEqual(session, null);
    assert.strictEqual(calls.filter((c) => c.url.includes('/auth/refresh')).length, 1, 'single attempt on network error');
  });
});
