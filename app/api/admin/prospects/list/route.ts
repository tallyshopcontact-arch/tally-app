// Lists saved outreach_prospects rows (see app/admin/prospects/page.tsx's
// "Saved Prospects" section) — status pending or responded only, so a
// prospect already contacted or rejected drops out of the actionable list.
// Not to be confused with /api/admin/prospects (the older, separate
// `prospects` table's list/update endpoint backing the Producer Finder tab
// in /admin).
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("outreach_prospects")
    .select("*")
    .in("status", ["pending", "responded"])
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load saved prospects" }, { status: 500 });
  }

  return NextResponse.json({ prospects: data ?? [] });
}
