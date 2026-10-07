import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route induk Reports — WAJIB me-render <Outlet/> supaya route anak
// (/reports/$type daftar definisi dan /reports/$type/$id hasil) tampil.
// Kartu indeks 8 grup ada di reports.index.tsx.
export const Route = createFileRoute("/businesses/$businessId/reports")({
  component: () => <Outlet />,
});
