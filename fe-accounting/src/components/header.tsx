import { Link } from "@tanstack/react-router";
import { KeyRound, LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { headerMenuItems } from "@/config/menuConfig";
import { useLogout, useMe } from "@/hooks/use-auth";

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

// Guide §7, §9: Header Global -- selalu aktif di area terautentikasi.
export function Header({ onOpenSidebar }: HeaderProps) {
  const { data: user } = useMe();
  const logout = useLogout();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const handleLogout = async () => {
    await logout.mutateAsync();
    window.location.assign("/login");
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-white px-4">
      {onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Buka menu navigasi"
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
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto">
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
              Ganti Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()} className="text-red-600">
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </header>
  );
}
