"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

// Chromium fires `beforeinstallprompt` when the app is installable (it does fire without a
// service worker on modern Chromium). We capture it and expose a real Install button. When
// the event never fires (iOS Safari, or criteria not yet met) we fall back to short manual
// steps. The button hides itself once running as an installed app — the §6 standalone
// detection doing functional work (no separate analytics sink exists to report to).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag for home-screen apps
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep our own affordance instead of the mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already installed — nothing to prompt.
  if (standalone) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setDeferred(null);
      return;
    }
    // No native prompt available → tell the user how to install manually.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast.info(
      isIOS
        ? "Tap the Share icon, then “Add to Home Screen” to install DVN IMS."
        : "Open your browser menu and choose “Install DVN IMS” / “Install app”.",
      { duration: 8000 }
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 text-slate-400 hover:text-white text-xs transition-colors w-full"
    >
      <Download className="w-3.5 h-3.5" />
      Install app
    </button>
  );
}
