import { createFileRoute, redirect } from "@tanstack/react-router";
import { Header } from "@/components/header";
import { getAccessToken } from "@/lib/auth/cookies";

// TODO(fase berikutnya): konten profil user & form ganti password (Guide §9)
// -- header (link "Users", dropdown Ganti Password/Logout) sudah aktif.
export const Route = createFileRoute("/user")({
  beforeLoad: () => {
    if (!getAccessToken()) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <>
      <Header />
      <div className="p-6">Profil user -- segera hadir.</div>
    </>
  ),
});
