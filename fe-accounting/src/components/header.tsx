import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { headerMenuItems } from "@/config/menuConfig";
import {
  APP_LANGUAGES,
  persistLanguage,
  type AppLanguage,
} from "@/i18n";
import { useLogout, useMe } from "@/hooks/use-auth";
import { useObscure } from "@/lib/format";

export interface HeaderProps {
  /**
   * Guide §10.1: hamburger tombol drawer BusinessSidebar di mobile.
   * Hanya di-render kalau halaman punya konteks bisnis (diisi oleh
   * BusinessSidebar di fase berikutnya) -- tidak tampil di /businesses & /user.
   */
  onOpenSidebar?: () => void;
}

function userInitial(name: string | undefined): string {
  return name?.trim().charAt(0).toUpperCase() || "?";
}

/** Switcher ID|EN (Localization Fase 1) — ganti bahasa langsung + persist. */
function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const active = (i18n.language === "en" ? "en" : "id") as AppLanguage;

  const switchTo = (language: AppLanguage) => {
    if (language === active) return;
    persistLanguage(language);
    void i18n.changeLanguage(language);
  };

  return (
    <div
      role="group"
      aria-label={i18n.t("header.language")}
      className="flex items-center overflow-hidden rounded border border-gray-300"
    >
      {APP_LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          onClick={() => switchTo(language)}
          aria-pressed={active === language}
          aria-label={i18n.t("header.language") + " " + language.toUpperCase()}
          title={i18n.t("header.language") + ": " + language.toUpperCase()}
          className={`px-2 py-1 text-xs font-semibold transition-colors ${
            active === language
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 hover:bg-gray-100"
          }`}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// Guide §7, §9: Header Global -- selalu aktif di area terautentikasi.
export function Header({ onOpenSidebar }: HeaderProps) {
  const { data: user } = useMe();
  const logout = useLogout();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { obscure, toggle } = useObscure();
  const { t } = useTranslation();

  const handleLogout = async () => {
    await logout.mutateAsync();
    window.location.assign("/login");
  };

  return (
    // z-60 (di atas dialog z-50) supaya switcher bahasa tetap bisa dipakai
    // saat dialog terbuka (Localization.md §8).
    <header className="sticky top-0 z-60 flex h-14 items-center gap-4 border-b bg-white px-4">
      {onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t("header.openSidebar")}
          className="-ml-1 rounded p-2 text-gray-600 hover:bg-gray-100 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <Link to="/businesses" className="text-base font-semibold text-gray-900">
        Accounting
      </Link>

      <nav className="flex items-center gap-1">
        {headerMenuItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            activeProps={{ className: "bg-gray-100 text-gray-900" }}
          >
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* Switcher bahasa (Localization Fase 1) */}
        <LanguageSwitcher />

        {/* Obscure Mode toggle */}
        <button
          type="button"
          onClick={toggle}
          title={obscure ? t("header.showAmounts") : t("header.hideAmounts")}
          aria-label={obscure ? t("header.obscureOn") : t("header.obscureOff")}
          className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          {obscure ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-gray-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
              {userInitial(user?.name)}
            </span>
            <span className="max-w-[10rem] truncate text-sm font-medium text-gray-700">
              {user?.name ?? "..."}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
              <KeyRound className="h-4 w-4" />
              {t("header.changePassword")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()} className="text-red-600">
              <LogOut className="h-4 w-4" />
              {t("header.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </header>
  );
}
