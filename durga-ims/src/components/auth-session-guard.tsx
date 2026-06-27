"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function AuthSessionGuard() {
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        // Verify via HTTP before redirecting — SIGNED_OUT can be a transient
        // WebSocket disconnect event even when the JWT is still valid.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) return;
        toast.error("Your session has expired. Redirecting to sign in…", {
          duration: 3000,
        });
        setTimeout(() => {
          window.location.href = "/login?reason=session_expired";
        }, 3000);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
