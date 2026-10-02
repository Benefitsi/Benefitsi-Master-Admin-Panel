"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
/** Refresh rights and aggregates on return without discarding an edited form. */
export function PartnerRefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    let dirty = false,
      last = Date.now();
    const edited = (event: Event) => {
      if (event.target instanceof HTMLElement && event.target.closest("form"))
        dirty = true;
    };
    const returned = () => {
      if (
        !dirty &&
        document.visibilityState === "visible" &&
        Date.now() - last > 45000
      ) {
        last = Date.now();
        router.refresh();
      }
    };
    document.addEventListener("input", edited);
    document.addEventListener("change", edited);
    document.addEventListener("visibilitychange", returned);
    window.addEventListener("focus", returned);
    return () => {
      document.removeEventListener("input", edited);
      document.removeEventListener("change", edited);
      document.removeEventListener("visibilitychange", returned);
      window.removeEventListener("focus", returned);
    };
  }, [router]);
  return null;
}
