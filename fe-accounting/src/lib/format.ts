/**
 * format.ts — Obscure Mode + nominal uang terpusat.
 *
 * ATURAN: Semua nominal uang di seluruh UI WAJIB lewat formatAmount() ini.
 * JANGAN buat copy lokal formatAmount di file routes manapun.
 *
 * Mode normal : output IDENTIK dengan Intl.NumberFormat("id-ID", 2 desimal).
 * Mode obscure: output "••••••" (masker tetap, layout tidak goyang).
 */
import { createContext, createElement, useCallback, useContext, useState, type ReactNode } from "react";

// ─── Obscure Context ─────────────────────────────────────────────────────────

const STORAGE_KEY = "obscure-mode";

export interface ObscureContextValue {
  obscure: boolean;
  toggle: () => void;
}

export const ObscureContext = createContext<ObscureContextValue>({
  obscure: false,
  toggle: () => {},
});

export function useObscure(): ObscureContextValue {
  return useContext(ObscureContext);
}

// ─── Provider (pasang di main.tsx) ───────────────────────────────────────────

export function ObscureProvider({ children }: { children: ReactNode }) {
  const [obscure, setObscure] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setObscure((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  return createElement(ObscureContext.Provider, { value: { obscure, toggle } }, children);
}

// ─── formatAmount terpusat ────────────────────────────────────────────────────

const _formatter = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format nominal uang. Saat Obscure Mode aktif kembalikan "••••••".
 * Signature: formatAmount(value: number): string — identik dengan versi lokal lama.
 *
 * Cara pakai:
 *   const { formatAmount } = useFormatAmount();
 *   // lalu pakai formatAmount(angka) di JSX.
 *
 * Untuk kasus di luar komponen React, gunakan formatAmountRaw(value) yang
 * selalu mengembalikan format normal (tanpa obscure) — HANYA untuk string
 * yang tidak ditampilkan langsung (mis. nilai awal input).
 */
export function useFormatAmount(): { formatAmount: (value: number) => string } {
  const { obscure } = useObscure();
  const formatAmount = useCallback(
    (value: number) => (obscure ? "••••••" : _formatter.format(value)),
    [obscure],
  );
  return { formatAmount };
}

/**
 * Format nominal TANPA obscure — HANYA untuk nilai awal di form/input,
 * bukan untuk display di tabel/list.
 */
export function formatAmountRaw(value: number): string {
  return _formatter.format(value);
}
