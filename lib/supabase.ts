import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// Service-role admin client for server-side operations (waitlist, etc.)
// Uses SUPABASE_SECRET_KEY — never expose on the client.
export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment variables."
    );
  }
  return createClient(url, key);
}

// Browser client for use in client components ("use client").
// Uses NEXT_PUBLIC_ keys so it is safe to call in the browser.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
