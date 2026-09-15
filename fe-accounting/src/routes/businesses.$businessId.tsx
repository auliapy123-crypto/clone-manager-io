import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BusinessSidebar } from "@/components/layout/business-sidebar";
import { useBusinesses } from "@/hooks/use-businesses";
import { useBreakpoint } from "@/hooks/use-viewport";
import { useRegisterSidebarToggle } from "@/routes/businesses";

export const Route = createFileRoute("/businesses/$businessId")({
  component: BusinessLayout,
});

function BusinessLayout() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const business = businesses?.find((b) => b.id === businessId);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const breakpoint = useBreakpoint();
  const location = useLocation();

  // Guide §10.2: tutup drawer otomatis saat user berpindah rute di mobile.
  useEffect(() => {
    if (breakpoint === "mobile") setIsSidebarOpen(false);
  }, [location.pathname, breakpoint]);

  // Guide §10.1: daftarkan hamburger ke Header global (dirender di businesses.tsx)
  // supaya Header tidak dirender dua kali.
  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  useRegisterSidebarToggle(openSidebar);

  return (
    <>
      <div className="flex">
        <BusinessSidebar
          businessId={businessId}
          businessName={business?.name}
          role={business?.role}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </>
  );
}
