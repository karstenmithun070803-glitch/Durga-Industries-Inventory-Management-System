import { useEffect, useState } from "react";

// Mobile = below the `lg` (1024px) breakpoint — the single mobile/desktop boundary.
// SSR-safe: returns `false` (desktop) on the server and first client render so markup
// matches and never hydrates wrong, then updates after mount.
//
// IMPORTANT: use this ONLY for genuine behavioral branches CSS cannot express (e.g.
// mounting one of two entry forms). All layout show/hide decisions must use CSS
// visibility (`hidden lg:block` / `lg:hidden`), never this hook.
const MOBILE_QUERY = "(max-width: 1023px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
