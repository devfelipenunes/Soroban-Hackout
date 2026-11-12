import { useEffect, useState } from "react";

export const MOBILE_GAMEPLAY_QUERY = "(max-width: 1100px) and (any-pointer: coarse)";

export function isMobileGameplayDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_GAMEPLAY_QUERY).matches
  );
}

export function useMobileGameplay(): boolean {
  const [mobile, setMobile] = useState(isMobileGameplayDevice);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_GAMEPLAY_QUERY);
    const update = (): void => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return mobile;
}
