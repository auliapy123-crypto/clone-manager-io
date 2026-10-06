import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import id from "./locales/id.json";

/**
 * Init i18n (Localization Fase 1 — dokumen: Dokumentasi Modul/Localization.md).
 *
 * - Bahasa default + fallback: "id" (Indonesia) — key yang belum ada di
 *   "en" otomatis tampil Indonesia, tidak ada teks hilang / key mentah.
 * - Persist: localStorage["app-language"] ("id"/"en", default "id").
 * - Katalog ditaruh di namespace default "translation", jadi key dipakai
 *   tanpa prefix namespace (mis. t("taxCodes.title")).
 *
 * ATURAN (Localization.md §5): setiap key baru WAJIB ada di id.json DAN
 * en.json; string berulang WAJIB di common.* (jangan bikin key duplikat
 * per halaman); modul/halaman baru WAJIB pakai t() sejak awal.
 */

export const APP_LANGUAGE_STORAGE_KEY = "app-language";
export const APP_LANGUAGES = ["id", "en"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

function readStoredLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    return stored === "en" ? "en" : "id";
  } catch {
    return "id";
  }
}

export function persistLanguage(language: AppLanguage): void {
  try {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // localStorage bisa tidak tersedia (mode privat) — ganti bahasa tetap
    // berlaku untuk sesi ini saja.
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    id: { translation: id },
    en: { translation: en },
  },
  lng: readStoredLanguage(),
  fallbackLng: "id",
  interpolation: {
    // React sudah meng-escape sendiri — double-escape bikin teks rusak.
    escapeValue: false,
  },
});

export default i18n;
