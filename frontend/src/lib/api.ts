export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 80002);

const SESSION_KEY = "zikkaron_session_token";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(SESSION_KEY, token);
  else window.localStorage.removeItem(SESSION_KEY);
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; wallet?: string | null; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const token = opts.token !== undefined ? opts.token : getSessionToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Demo fallback when ALLOW_HEADER_AUTH=true on API (tests / local only)
      ...(!token && opts.wallet ? { "x-wallet-address": opts.wallet } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || (data as { message?: string }).message || `Request failed (${res.status})`);
  }
  return data as T;
}
