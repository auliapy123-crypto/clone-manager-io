import { QueryClient } from "@tanstack/react-query";

/**
 * Instansiasi QueryClient TanStack (Guide §3, §6).
 * retry: 1 karena error 401 sudah ditangani single-flight interceptor
 * di integrations/setup.ts -- tidak perlu retry berkali-kali di layer ini.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
