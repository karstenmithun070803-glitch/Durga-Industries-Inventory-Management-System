"use client";

import { useEffect } from "react";

export function KeepAliveHeartbeat() {
  useEffect(() => {
    const ping = () =>
      fetch("/api/ping")
        .then((r) => {
          if (r.redirected && r.url.includes("/login")) {
            window.location.href = r.url;
          }
        })
        .catch(() => {});

    // Keep function warm and session fresh every 25 s
    const intervalId = setInterval(ping, 25_000);

    // On tab return: check session is still alive — redirect to login if expired, do nothing otherwise
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (debounceId) clearTimeout(debounceId);
        debounceId = setTimeout(ping, 100);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      if (debounceId) clearTimeout(debounceId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
