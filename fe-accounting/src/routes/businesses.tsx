import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { Header } from "@/components/header";
import { getAccessToken } from "@/lib/auth/cookies";

type SidebarOpenHandler = (() => void) | undefined;

// Guide §10.1: Header di-render sekali di sini untuk semua /businesses/*.
// Route anak (misal businesses.$businessId) mendaftarkan handler hamburger
// lewat context ini alih-alih merender <Header/> lagi.
const SidebarToggleContext = createContext<Dispatch<SetStateAction<SidebarOpenHandler>> | null>(
  null,
);

export function useRegisterSidebarToggle(onOpenSidebar?: () => void) {
  const setter = useContext(SidebarToggleContext);

  useEffect(() => {
    if (!setter) return;
    setter(() => onOpenSidebar);
    return () => setter(undefined);
  }, [setter, onOpenSidebar]);
}

export const Route = createFileRoute("/businesses")({
  beforeLoad: () => {
    if (!getAccessToken()) {
      throw redirect({ to: "/login" });
    }
  },
  component: BusinessesLayout,
});

function BusinessesLayout() {
  const [onOpenSidebar, setOnOpenSidebar] = useState<SidebarOpenHandler>();

  return (
    <SidebarToggleContext.Provider value={setOnOpenSidebar}>
      <Header onOpenSidebar={onOpenSidebar} />
      <Outlet />
    </SidebarToggleContext.Provider>
  );
}
