import type { Config } from "tailwindcss";

// Breakpoint sengaja TIDAK di-custom — pakai default Tailwind
// (md: 768px, lg: 1024px) sesuai §10.2 panduan, supaya konsisten
// di seluruh komponen tanpa breakpoint custom per-komponen.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;