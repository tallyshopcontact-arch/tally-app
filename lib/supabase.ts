import { createClient } from "@supabase/supabase-js";

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
