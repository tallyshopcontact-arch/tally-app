import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Auth-aware server client for Next.js Server Components and Route Handlers.
// Reads and writes session cookies so Supabase knows who is logged in.
export async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components cannot set cookies during render.
            // Cookie mutation should happen in Server Actions or Route Handlers.
          }
        },
      },
    }
  );
}
