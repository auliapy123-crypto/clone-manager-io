import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BusinessRole } from "@/config/menuConfig";
import { useBusinesses } from "@/hooks/use-businesses";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/")({
  component: BusinessesListPage,
});

const ROLE_LABEL: Record<BusinessRole, string> = {
  admin: "Admin",
  accountant: "Akuntan",
  viewer: "Viewer",
};

// Guide §3, §6, §7: daftar bisnis milik user aktif (GET /auth/me/businesses).
function BusinessesListPage() {
  const { data: businesses, isPending, isError, error } = useBusinesses();

  if (isPending) {
    return <div className="p-6 text-sm text-gray-500">Memuat daftar bisnis...</div>;
  }

  if (isError) {
    return (
      <div className="p-6">
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {getApiErrorMessage(error)}
        </p>
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-12 text-center text-gray-500">
        <Building2 className="h-8 w-8" />
        <p className="text-sm">Belum ada bisnis yang bisa Anda akses.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Businesses</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {businesses.map((business) => (
          <Link
            key={business.id}
            to="/businesses/$businessId"
            params={{ businessId: business.id }}
          >
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{business.name}</CardTitle>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {ROLE_LABEL[business.role]}
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">{business.baseCurrencyCode}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
