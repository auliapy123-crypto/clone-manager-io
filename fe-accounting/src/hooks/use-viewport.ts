import { useEffect, useState } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

// Guide §10.1/§10.2: breakpoint default Tailwind (md 768px, lg 1024px) --
// JANGAN custom breakpoint per-komponen.
const TABLET_QUERY = "(min-width: 768px)";
const DESKTOP_QUERY = "(min-width: 1024px)";

function resolveBreakpoint(tabletMatches: boolean, desktopMatches: boolean): Breakpoint {
  if (desktopMatches) return "desktop";
  if (tabletMatches) return "tablet";
  return "mobile";
}

/** Guide §10.2: dipakai BusinessSidebar/MobileNavDrawer untuk deteksi mobile/tablet/desktop. */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    if (typeof window === "undefined") return "desktop";
    return resolveBreakpoint(
      window.matchMedia(TABLET_QUERY).matches,
      window.matchMedia(DESKTOP_QUERY).matches,
    );
  });

  useEffect(() => {
    const tabletMql = window.matchMedia(TABLET_QUERY);
    const desktopMql = window.matchMedia(DESKTOP_QUERY);

    const update = () => {
      setBreakpoint(resolveBreakpoint(tabletMql.matches, desktopMql.matches));
    };

    update();
    tabletMql.addEventListener("change", update);
    desktopMql.addEventListener("change", update);
    return () => {
      tabletMql.removeEventListener("change", update);
      desktopMql.removeEventListener("change", update);
    };
  }, []);

  return breakpoint;
}
