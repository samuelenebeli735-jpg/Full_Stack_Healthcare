import { API_URL } from '@/config';
import type { FieldError } from '@/api/types';

/** An API failure carrying the server's own message and field errors. */
export class ApiError extends Error {
  status: number;
  fieldErrors: FieldError[];

  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Set by the auth context: the token sent with every request. */
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Called when the server rejects the session (401), so the app signs out. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const TIMEOUT_MS = 20000;

/**
 * Call the SHMS API and return the `data` of its `{ success, message, data }`
 * envelope. Throws ApiError with the server's message on any failure.
 */
export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, 'The app is not configured: EXPO_PUBLIC_API_URL is missing.');
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the SHMS server. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // empty or non-JSON body
  }

  if (!res.ok || (json && json.success === false)) {
    // A rejected login is also a 401, but it is not an expired session.
    if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
    const message = (json && json.message) || `Request failed (HTTP ${res.status}).`;
    throw new ApiError(res.status, message, Array.isArray(json?.errors) ? json.errors : []);
  }

  return (json ? json.data : null) as T;
}

/** Build "?a=1&b=2" from defined, non-empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
