import { createFileRoute } from "@tanstack/react-router";

// TODO(fase berikutnya): daftar & kelola anggota bisnis (Guide §7 RBAC:
// admin, accountant). Route ini sengaja dibuat sekarang supaya link
// "Members" di menuConfig.ts sudah menunjuk ke route yang valid & typed.
export const Route = createFileRoute("/businesses/$businessId/members")({
  component: () => <div className="p-6">Anggota bisnis -- segera hadir.</div>,
});
