"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function AuthSessionGuard() {
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
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
