// Single outreach_prospects row — fetch (for the compose page) and update
// (for "Mark as Contacted"). See app/admin/prospects/[id]/page.tsx.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const supabase = createServerClient();
  const { data, error } = await supabase.from("outreach_prospects").select("*").eq("id", id).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load prospect" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }
  return NextResponse.json({ prospect: data });
}

interface PatchBody {
  status?: string;
  dmVariationUsed?: string;
}

/** Used by "Mark as Contacted" — sets status=contacted, records which DM
 * variation was actually sent, and stamps contacted_at. Not a general-purpose
 * field editor; only these two inputs are accepted. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: PatchBody = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status) {
    updates.status = body.status;
    if (body.status === "contacted") updates.contacted_at = new Date().toISOString();
  }
  if (body.dmVariationUsed) updates.dm_variation_used = body.dmVariationUsed;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("outreach_prospects")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to update prospect" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }
  return NextResponse.json({ prospect: data });
}
