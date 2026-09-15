import { createClient } from "@hey-api/client-fetch";
import env from "@/env";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/lib/auth/cookies";
import { getTokenExpiryMs } from "@/lib/auth/jwt";

/**
 * Client fetch bersama yang dipakai seluruh hooks data layer (Guide §4-5).
 * Belum diarahkan ke generated-clients — generate-clients dijalankan
 * terpisah setelah backend jalan, client ini tidak bergantung padanya.
 */
export const apiClient = createClient({ baseUrl: env.VITE_API_URL });

const REFRESH_THRESHOLD_MS = 60_000;
const AUTH_ENDPOINTS = ["/auth/login", "/auth/refresh"];

let refreshPromise: Promise<string | null> | null = null;

/**
 * Clone request disimpan SEBELUM body-nya dipakai fetch (di request
 * interceptor), supaya response interceptor bisa retry sekali tanpa kena
 * error "body already used" pada request yang sudah terkirim.
 */
const retryableRequests = new WeakMap<Request, Request>();

function isAuthEndpoint(url: string): boolean {
  return AUTH_ENDPOINTS.some((path) => url.includes(path));
}

async function performRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${env.VITE_API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const body = (await response.json()) as {
    data: { accessToken: string; refreshToken: string };
  };
  setTokens(body.data);
  return body.data.accessToken;
}

/** Single-flight: 1 eksekusi refresh meski dipicu banyak request bersamaan. */
function refreshOnce(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Dipanggil sekali di main.tsx sebelum render (Guide §5). */
export function setupApiClient(): void {
  apiClient.interceptors.request.use(async (request) => {
    if (isAuthEndpoint(request.url)) return request;

    retryableRequests.set(request, request.clone());

    let accessToken = getAccessToken();
    if (accessToken) {
      const expiryMs = getTokenExpiryMs(accessToken);
      if (expiryMs !== null && expiryMs - Date.now() < REFRESH_THRESHOLD_MS) {
        accessToken = await refreshOnce();
      }
    }

    if (accessToken) {
      request.headers.set("Authorization", `Bearer ${accessToken}`);
    }

    return request;
  });

  apiClient.interceptors.response.use(async (response, request) => {
    if (response.status !== 401 || isAuthEndpoint(request.url)) {
      return response;
    }

    const accessToken = await refreshOnce();
    const retryRequest = retryableRequests.get(request);

    if (!accessToken || !retryRequest) {
      clearTokens();
      window.location.assign("/login");
      return response;
    }

    retryRequest.headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(retryRequest);
  });
}
