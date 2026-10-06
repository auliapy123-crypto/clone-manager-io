import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setupApiClient } from "@/integrations/setup";
import { queryClient } from "@/lib/query-client";
import { ObscureProvider } from "@/lib/format";
// Init i18n SEBELUM render pertama (side-effect import, init sinkron —
// tidak ada flash bahasa salah).
import "@/i18n";
import { routeTree } from "./routeTree.gen";
import "./index.css";

setupApiClient();

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemen #root tidak ditemukan di index.html.");
}

if (!rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <ObscureProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ObscureProvider>
    </StrictMode>,
  );
}
