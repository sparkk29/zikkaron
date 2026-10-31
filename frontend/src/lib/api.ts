export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 80002);

// Spoofable x-wallet-address auth; only for local demos against an API with ALLOW_HEADER_AUTH=true.
const ALLOW_HEADER_AUTH = process.env.NEXT_PUBLIC_ALLOW_HEADER_AUTH === "true";

const LEGACY_SESSION_KEY = "zikkaron_session_token";

/** Sessions now live in an httpOnly cookie; drop any token persisted by older builds. */
export function clearLegacySessionToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_SESSION_KEY);
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; wallet?: string | null; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(ALLOW_HEADER_AUTH && opts.wallet ? { "x-wallet-address": opts.wallet } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || (data as { message?: string }).message || `Request failed (${res.status})`);
  }
  return data as T;
}
