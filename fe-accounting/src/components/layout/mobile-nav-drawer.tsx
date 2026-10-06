import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { type BusinessRole, businessMenuItems, canAccessMenuItem } from "@/config/menuConfig";
import { useTranslation } from "react-i18next";

export interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  businessId: string;
  role: BusinessRole | null | undefined;
}

// Guide §10.1/§10.2: drawer overlay mobile (< 768px), reuse menuConfig yang
// sama dengan BusinessSidebar desktop -- tidak ada daftar menu dobel.
export function MobileNavDrawer({ open, onClose, businessId, role }: MobileNavDrawerProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Rail ikon sempit (w-16) -- permintaan manager: di layar sempit menu
          HANYA ikon, tanpa label teks supaya tidak makan tempat. Lebar &
          pola menyamai BusinessSidebar dalam mode md (md:w-16). */}
      <nav className="relative flex h-full w-16 flex-col gap-1 bg-white p-2 shadow-lg">
        <div className="mb-2 flex items-center justify-end">
          <span className="sr-only">Menu</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu navigasi"
            className="rounded p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {businessMenuItems
          .filter((item) => canAccessMenuItem(item, role))
          .map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ businessId }}
              onClick={onClose}
              // Label disembunyikan visual (sr-only = tetap dibaca screen
              // reader); title memberi tooltip nama menu penuh saat
              // hover/tekan lama.
              title={t(item.labelKey)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              activeProps={{ className: "bg-gray-100 text-gray-900" }}
              activeOptions={{ exact: item.to === "/businesses/$businessId" }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="sr-only">{t(item.labelKey)}</span>
            </Link>
          ))}
      </nav>
    </div>,
    document.body,
  );
}
