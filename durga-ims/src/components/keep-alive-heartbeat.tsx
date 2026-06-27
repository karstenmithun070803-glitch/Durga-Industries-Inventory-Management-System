"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function KeepAliveHeartbeat() {
  const router = useRouter();

  useEffect(() => {
    const ping = () =>
      fetch("/api/ping")
        .then((r) => {
          if (r.redirected && r.url.includes("/login")) {
            window.location.href = r.url;
          }
        })
        .catch(() => {});

    const pingThenRefresh = () =>
      fetch("/api/ping")
        .then((r) => {
          if (r.redirected && r.url.includes("/login")) {
            window.location.href = r.url;
          } else if (r.ok) {
            router.refresh();
          }
        })
        .catch(() => {});

    // Keep function warm and session fresh every 25 s
    const intervalId = setInterval(ping, 25_000);

    // On tab return: warm the function first, then refresh data
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (debounceId) clearTimeout(debounceId);
        debounceId = setTimeout(pingThenRefresh, 100);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      if (debounceId) clearTimeout(debounceId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

  return null;
}
