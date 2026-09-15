import { Link } from "@tanstack/react-router";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { type BusinessRole, businessMenuItems, canAccessMenuItem } from "@/config/menuConfig";

export interface BusinessSidebarProps {
  businessId: string;
  businessName: string | undefined;
  role: BusinessRole | null | undefined;
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_LABEL: Record<BusinessRole, string> = {
  admin: "Admin",
  accountant: "Akuntan",
  viewer: "Viewer",
};

/**
 * Sidebar konteks bisnis (Guide §7, §10). Hamburger mobile ada di AppHeader
 * (lihat prop `onOpenSidebar` header.tsx) -- komponen ini cuma render drawer
 * mobile-nya, bukan tombolnya. Desktop/tablet murni CSS responsive (tanpa
 * cek breakpoint di JS) supaya konsisten dgn §10.2.
 */
export function BusinessSidebar({
  businessId,
  businessName,
  role,
  isOpen,
  onClose,
}: BusinessSidebarProps) {
  const visibleItems = businessMenuItems.filter((item) => canAccessMenuItem(item, role));

  return (
    <>
      <aside className="hidden shrink-0 border-r bg-white md:flex md:w-16 md:flex-col lg:w-64">
        <div className="flex flex-col gap-2 border-b p-4">
          <span className="hidden truncate text-sm font-semibold text-gray-900 lg:block">
            {businessName ?? "..."}
          </span>
          {role && (
            <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              <span className="lg:hidden">{ROLE_LABEL[role].charAt(0)}</span>
              <span className="hidden lg:inline">{ROLE_LABEL[role]}</span>
            </span>
          )}
        </div>

        <nav className="flex flex-col gap-1 p-2">
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ businessId }}
              title={item.label}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              activeProps={{ className: "bg-gray-100 text-gray-900" }}
              activeOptions={{ exact: item.to === "/businesses/$businessId" }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <MobileNavDrawer open={isOpen} onClose={onClose} businessId={businessId} role={role} />
    </>
  );
}
