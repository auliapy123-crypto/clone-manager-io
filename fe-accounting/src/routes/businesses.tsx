import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/header";
import {
  SidebarToggleProvider,
  type SidebarOpenHandler,
} from "@/components/layout/sidebar-toggle";
import { getAccessToken } from "@/lib/auth/cookies";

// Guide §10.1: Header di-render sekali di sini untuk semua /businesses/*.
// Route anak (misal businesses.$businessId) mendaftarkan handler hamburger
// lewat context di components/layout/sidebar-toggle.ts -- context-nya
// sengaja TIDAK hidup di file route ini (lihat komentar di file itu).

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
    <SidebarToggleProvider value={setOnOpenSidebar}>
      <Header onOpenSidebar={onOpenSidebar} />
      <Outlet />
    </SidebarToggleProvider>
  );
}
