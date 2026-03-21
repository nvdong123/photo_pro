const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class APIError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = "APIError";
  }
}

// ── Module-level GET cache: TTL + in-flight deduplication ─────────────────────
// Persists across React renders and page navigations within the same session.
interface CacheEntry { data: unknown; expiresAt: number; }
const _cache = new Map<string, CacheEntry>();
const _inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL = 30_000; // 30 s — feels instant for the user, still fresh enough

function getCached<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) return Promise.resolve(hit.data as T);

  // Return the same in-flight promise if this URL is already being fetched
  const flying = _inflight.get(key);
  if (flying) return flying as Promise<T>;

  const p = fetcher()
    .then((data) => {
      _cache.set(key, { data, expiresAt: Date.now() + ttl });
      _inflight.delete(key);
      return data;
    })
    .catch((err) => {
      _inflight.delete(key);
      throw err;
    });
  _inflight.set(key, p);
  return p;
}

/** Call after mutations to ensure next GET fetches fresh data. */
export function invalidateApiCache(pattern?: string) {
  if (!pattern) { _cache.clear(); return; }
  for (const k of [..._cache.keys()]) if (k.includes(pattern)) _cache.delete(k);
}
// ──────────────────────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers, credentials: "include" });

  if (res.status === 401) {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_role");
    localStorage.removeItem("admin_name");
    localStorage.removeItem("photopro_user");
    invalidateApiCache(); // clear stale cache on session expiry
    window.location.href = "/login";
    throw new APIError("UNAUTHORIZED", "Phiên đăng nhập hết hạn", 401);
  }

  const data = await res.json();
  if (!data.success) {
    throw new APIError(
      data.error?.code ?? "UNKNOWN",
      data.error?.message ?? "Lỗi không xác định",
      res.status,
    );
  }
  return data.data as T;
}

/** TTL presets — pass as second arg to apiClient.get() */
export const TTL = {
  SHORT:   15_000,   // 15 s — realtime-ish (cart, download tokens)
  DEFAULT: 30_000,   // 30 s — general dashboard data
  LONG:   300_000,   // 5 min — rarely-changing config (settings, bundles, albums)
} as const;

export const apiClient = {
  /** Cached GET — returns from in-memory cache within TTL, deduplicates in-flight requests. */
  get: <T>(path: string, ttl = DEFAULT_TTL) =>
    getCached<T>(path, () => request<T>(path), ttl),

  /** Force a fresh GET, bypassing and updating the cache. */
  getFresh: <T>(path: string) => {
    invalidateApiCache(path);
    return getCached<T>(path, () => request<T>(path), DEFAULT_TTL);
  },

  // Mutation methods — do NOT auto-invalidate the global cache.
  // Each call-site is responsible for calling invalidateApiCache(path) before refetch().
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
    }),
};

export { API_BASE };
