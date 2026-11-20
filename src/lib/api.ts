/**
 * Single application API layer for the Management Dashboard.
 *
 * Responsibilities (Checkpoint 7 contract):
 * - base URL resolution (VITE_API_BASE_URL, empty = same-origin behind the Vite proxy);
 * - Authorization header injection (access token kept in memory only);
 * - credentials for the httpOnly refresh_token cookie (/api/v1/auth/*);
 * - silent refresh with single-flight de-duplication;
 * - ApiResponse<T> envelope unwrapping and request-ID propagation;
 * - ApiErrorResponse -> ApiError conversion (code, message, requestId, field details);
 * - safe per-request timeout with caller abort support;
 * - retry only for safe reads (GET on network failure/timeout, exactly once).
 *
 * The access token is never persisted to localStorage. Session continuity
 * across reloads comes from the backend refresh cookie, not client storage.
 */

const RAW_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').toString();
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 15_000;
const AUTH_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/logout-all',
]);

/* ------------------------------------------------------------------ types */

export interface ValidationDetail {
  field?: string;
  issue?: string;
  message?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  requestId?: string;
  timestamp?: string;
  error?: { code?: string; message?: string; details?: ValidationDetail[] };
}

export interface RequestMeta {
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details: ValidationDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Set false for pre-auth calls so no Authorization header / 401 refresh is used. */
  auth?: boolean;
}

/* ------------------------------------------------------------ token store */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

type UnauthenticatedListener = () => void;
let unauthenticatedHandler: UnauthenticatedListener | null = null;

/** Register a callback fired when the session can no longer be refreshed. */
export function setUnauthenticatedHandler(fn: UnauthenticatedListener | null): void {
  unauthenticatedHandler = fn;
}

/* -------------------------------------------------------- refresh handling */

export interface AuthSession {
  userId: string;
  fullName: string;
  email: string;
  preferredLanguage: string;
  accessToken: string;
}

let refreshInFlight: Promise<AuthSession | null> | null = null;

async function performRefresh(): Promise<AuthSession | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      setAccessToken(null);
      return null;
    }
    const body = (await res.json()) as ApiEnvelope<AuthSession>;
    if (!body.success || !body.data?.accessToken) {
      setAccessToken(null);
      return null;
    }
    setAccessToken(body.data.accessToken);
    return body.data;
  } catch {
    // Network failure during refresh: keep existing token state, caller
    // will surface the eventual request error.
    return null;
  }
}

/** Single-flight session refresh; concurrent callers share one request. */
export function refreshSession(): Promise<AuthSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/* ------------------------------------------------------------- primitives */

function withTimeout(timeoutMs: number, callerSignal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), timeoutMs);
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => {
      window.clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function toNetworkError(err: unknown, path: string): ApiError {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new ApiError(0, 'TIMEOUT_ERROR', `The request to ${path} timed out. Please try again.`);
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new ApiError(0, 'ABORTED', `The request to ${path} was cancelled.`);
  }
  const message = err instanceof Error ? err.message : 'Network request failed';
  return new ApiError(0, 'NETWORK_ERROR', message);
}

async function parseEnvelope<T>(res: Response, path: string): Promise<{ data: T; meta: RequestMeta }> {
  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }
  const requestId = body?.requestId ?? res.headers.get('X-Request-Id') ?? undefined;

  if (!res.ok || !body || body.success === false) {
    const code = body?.error?.code ?? (res.status === 404 ? 'NOT_FOUND' : `HTTP_${res.status}`);
    const message = body?.error?.message ?? `Request to ${path} failed with status ${res.status}.`;
    throw new ApiError(res.status, code, message, requestId, body?.error?.details ?? []);
  }
  return { data: body.data as T, meta: { requestId } };
}

/* ----------------------------------------------------------- core request */

async function execute<T>(path: string, options: RequestOptions = {}, retried = false): Promise<{ data: T; meta: RequestMeta }> {
  const method = options.method ?? 'GET';
  const useAuth = options.auth !== false && !AUTH_PATHS.has(path);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (useAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const { signal, clear } = withTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.signal);
  let res: Response;
  try {
    res = await fetchWithTimeout(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body),
      credentials: 'include',
      signal,
    });
  } catch (err) {
    clear();
    // Retry only safe reads, once, and only for transient transport failures.
    const safeRead = method === 'GET';
    const transient = !(err instanceof DOMException && err.name === 'AbortError') || (err as DOMException).message === 'Request timeout';
    if (safeRead && !retried && transient && !options.signal?.aborted) {
      await new Promise((r) => setTimeout(r, 300));
      return execute<T>(path, options, true);
    }
    throw toNetworkError(err, path);
  }
  clear();

  // Expired access token: attempt one silent refresh and replay the request.
  if (res.status === 401 && useAuth && !retried) {
    const session = await refreshSession();
    if (session) {
      return execute<T>(path, options, true);
    }
    unauthenticatedHandler?.();
  }

  return parseEnvelope<T>(res, path);
}

/** Perform a request and return the unwrapped ApiResponse.data payload. */
export async function apiRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  const { data } = await execute<T>(path, options);
  return data;
}

/** Perform a request and return both the payload and server request metadata. */
export async function apiRequestWithMeta<T>(
  path: string,
  options?: RequestOptions,
): Promise<{ data: T; requestId?: string }> {
  const { data, meta } = await execute<T>(path, options);
  return { data, requestId: meta.requestId };
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  getWithMeta: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequestWithMeta<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  postWithMeta: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequestWithMeta<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

/* ---------------------------------------------------------- auth endpoints */

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  preferredLanguage: string;
}

export async function authLogin(payload: LoginPayload): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/api/v1/auth/login', {
    method: 'POST',
    body: payload,
    auth: false,
  });
  setAccessToken(session.accessToken);
  return session;
}

export async function authRegister(payload: RegisterPayload): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/api/v1/auth/register', {
    method: 'POST',
    body: payload,
    auth: false,
  });
  setAccessToken(session.accessToken);
  return session;
}

export async function authLogout(): Promise<void> {
  try {
    await apiRequest<void>('/api/v1/auth/logout', { method: 'POST', auth: false });
  } finally {
    setAccessToken(null);
  }
}
