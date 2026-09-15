/**
 * Decode payload JWT tanpa verifikasi signature — dipakai di client HANYA
 * untuk membaca `exp` demi keputusan proactive refresh (Guide §5).
 * Verifikasi signature tetap tanggung jawab backend.
 */
export function getTokenExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64)) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}
