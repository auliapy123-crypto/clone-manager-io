import Cookies from "js-cookie";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

const isHttps = () => typeof location !== "undefined" && location.protocol === "https:";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function getAccessToken(): string | null {
  return Cookies.get(ACCESS_TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return Cookies.get(REFRESH_TOKEN_KEY) ?? null;
}

export function setTokens({ accessToken, refreshToken }: TokenPair): void {
  // Access token sengaja tanpa `expires` -> session cookie, umur sebenarnya
  // ditentukan JWT exp yang dibaca lewat getTokenExpiryMs.
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, { sameSite: "lax", secure: isHttps() });
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, {
    sameSite: "lax",
    secure: isHttps(),
    expires: 7,
  });
}

export function clearTokens(): void {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
}
