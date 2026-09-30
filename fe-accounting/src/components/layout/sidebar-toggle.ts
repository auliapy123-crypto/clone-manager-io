import { createContext, useContext, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * Wiring tombol hamburger (Guide §10.1): Header global menerima handler
 * drawer dari route layout bisnis lewat context ini alih-alih merender
 * <Header/> lagi.
 *
 * PENTING -- context ini HARUS tinggal di module sendiri, JANGAN di
 * businesses.tsx: plugin TanStack Router meng-code-split component route
 * (`?tsr-split=component`), sehingga file route bisa termuat sebagai DUA
 * module instance (buat modal dan import biasa). Context yang hidup di
 * file route jadi punya dua salinan -- provider dari salinan router,
 * useContext dari salinan import -- dan tidak pernah tersambung (bug
 * hamburger yang tidak pernah muncul di mobile sejak Fase 1.3).
 */
export type SidebarOpenHandler = (() => void) | undefined;

const SidebarToggleContext = createContext<
  Dispatch<SetStateAction<SidebarOpenHandler>> | null
>(null);

export const SidebarToggleProvider = SidebarToggleContext.Provider;

/**
 * Dipanggil route layout bisnis buat mendaftarkan handler hamburger ke
 * Header global. Return true kalau context tersambung (diagnostik).
 */
export function useRegisterSidebarToggle(onOpenSidebar?: () => void) {
  const setter = useContext(SidebarToggleContext);

  useEffect(() => {
    if (!setter) return;
    setter(() => onOpenSidebar);
    return () => setter(undefined);
  }, [setter, onOpenSidebar]);

  return setter !== null;
}
