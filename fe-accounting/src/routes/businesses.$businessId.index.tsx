import { createFileRoute } from "@tanstack/react-router";

// TODO(fase berikutnya): overview bisnis.
export const Route = createFileRoute("/businesses/$businessId/")({
  component: () => <div className="p-6">Overview bisnis -- segera hadir.</div>,
});
