import type { InputHTMLAttributes, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  /** Value terpilih (sama dgn <select>). */
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Class untuk INPUT (tinggi dsb., karena cn tanpa tailwind-merge). */
  className?: string;
  /** Nama field untuk aksesibilitas (aria-label input). */
  ariaLabel?: string;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;
}

interface PanelPos {
  left: number;
  width: number;
  /** fixed top (panel ke bawah) atau fixed bottom (panel ke atas). */
  top: number | null;
  bottom: number | null;
}

// Tinggi maksimum panel: sekitar 5 opsi, sisanya scroll (max-h-48).
const PANEL_MAX = 192;
const PANEL_GAP = 4;

/**
 * Combobox yang bisa dicari (searchable dropdown) -- PENGECUALIAN dari
 * aturan "pakai <select> native": khusus dropdown yang opsinya banyak
 * (Account/COA 20+ pilihan) supaya bisa diketik untuk menyaring.
 *
 * Perilaku: kotak input menampilkan label value terpilih (atau
 * placeholder); fokus/klik membuka panel opsi; klik ulang pada kotak
 * MENUTUP panel (toggle); ketikan memfilter opsi case-insensitive
 * terhadap label; klik opsi memilihnya; klik di luar menutup TANPA
 * mengubah value; panah atas/bawah menggerakkan highlight, Enter
 * memilih, Escape menutup.
 *
 * Panel dirender via portal ke document.body dengan position:fixed --
 * supaya TIDAK terpotong container overflow (tabel/dialog) di mana pun
 * combobox dipakai, dan arah bukanya (ke bawah/ke atas) dipilih sesuai
 * ruang yang tersedia di viewport.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "-- Pilih --",
  disabled = false,
  className,
  ariaLabel,
  inputProps,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Open state yang tercatat SAAT pointer ditekan di input -- dipakai
  // untuk toggle: klik ulang pada kotak yang sudah terbuka harus MENUTUP,
  // bukan membuka lagi (event click datang setelah onFocus).
  const wasOpenOnPointerDownRef = useRef(false);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  // Filter case-insensitive ke label (label berbentuk "1000 - Kas"
  // sehingga mengetik kode maupun nama sama-sama cocok).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function computePanelPos(): PanelPos | null {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // Buka ke atas kalau ruang bawah tidak cukup DAN atasnya lebih lega.
    const dropUp = spaceBelow < PANEL_MAX + PANEL_GAP && spaceAbove > spaceBelow;
    return {
      left: rect.left,
      width: rect.width,
      top: dropUp ? null : rect.bottom + PANEL_GAP,
      bottom: dropUp ? window.innerHeight - rect.top + PANEL_GAP : null,
    };
  }

  // Klik di luar komponen: tutup panel tanpa mengubah value. Panel ada
  // di luar rootRef (portal) -- jadi kotak DAN panel harus dikecualikan
  // (pola yang sama dengan dropdown-menu.tsx).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Panel terbuka: mulai cari dari awal daftar (atau tepat di opsi
  // terpilih), teks filter dikosongkan.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const idx = options.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Selagi panel terbuka, ikuti scroll (dialog/container mana pun) dan
  // resize supaya posisi fixed tetap nempel di kotaknya.
  useEffect(() => {
    if (!open) return;
    const update = () => setPanelPos(computePanelPos());
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Highlight dijaga tetap terlihat saat navigasi keyboard.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelectorAll("li")
      [highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const openPanel = () => {
    if (disabled) return;
    setPanelPos(computePanelPos());
    setOpen(true);
  };

  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlight];
      if (option) choose(option);
    } else if (e.key === "Escape") {
      // Tutup tanpa mengubah value.
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? "combobox-listbox" : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        // Saat panel terbuka input dipakai mengetik filter; saat tertutup
        // ia hanya menampilkan label terpilih (read-only secara perilaku).
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        disabled={disabled}
        onPointerDown={() => {
          wasOpenOnPointerDownRef.current = open;
        }}
        onFocus={() => {
          // Klik pertama (kotak belum fokus): buka panel. Kalau pointer
          // ditahan saat panel sudah terbuka, event click berikutnya
          // yang menutup (toggle) -- jangan dibuka dua kali.
          if (!wasOpenOnPointerDownRef.current) openPanel();
        }}
        onClick={() => {
          if (wasOpenOnPointerDownRef.current) {
            // Klik ulang pada kotak yang terbuka: tutup panel.
            setOpen(false);
          } else {
            openPanel();
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        {...inputProps}
        className={cn(
          "w-full rounded-md border border-gray-300 bg-white px-3 pr-8 text-sm text-gray-900 placeholder:text-gray-400",
          "focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Tinggi TIDAK di-hardcode (cn tanpa tailwind-merge) -- dikontrol
          // pemanggil lewat className (h-9 default, h-8 di tabel rapat).
          className ?? "h-9",
          inputProps?.className,
        )}
      />
      {/* Indikator chevron (dekoratif, panel juga terbuka via klik) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400"
      >
        ▾
      </span>

      {open &&
        panelPos &&
        createPortal(
          <ul
            id="combobox-listbox"
            role="listbox"
            ref={listRef}
            style={{
              position: "fixed",
              left: panelPos.left,
              width: panelPos.width,
              top: panelPos.top ?? undefined,
              bottom: panelPos.bottom ?? undefined,
            }}
            className="z-50 max-h-48 overflow-y-auto rounded-md border bg-white py-1 shadow-md"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500" aria-live="polite">
                Tidak ada hasil.
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      // mousedown bukan click: supaya blur/klik-luar handler
                      // tidak menutup panel sebelum pilihan diproses.
                      e.preventDefault();
                      choose(option);
                    }}
                    onMouseEnter={() => setHighlight(index)}
                    className={cn(
                      "cursor-pointer px-3 py-2 text-sm",
                      index === highlight ? "bg-gray-100" : "",
                      isSelected ? "font-semibold text-gray-900" : "text-gray-700",
                    )}
                  >
                    {option.label}
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
