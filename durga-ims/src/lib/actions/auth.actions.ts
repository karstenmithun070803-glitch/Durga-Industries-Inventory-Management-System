"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const username = (formData.get("username") as string | null)?.trim().toLowerCase();
  const password = formData.get("password") as string | null;

  if (!username || !password) {
    redirect("/login?error=required");
  }

  // Map username → internal technical email (never shown to users)
  const internalEmail = `${username}@durgaindustries.internal`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password,
  });

  if (error) {
    redirect("/login?error=invalid");
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
