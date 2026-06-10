import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getServiceClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("found_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospects: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { error, count } = await supabase
    .from("prospects")
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: count ?? 0 });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id, grant_beta, ...updates } = body;

  if (!id)
    return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = getServiceClient();

  // Update the prospect row
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("prospects")
      .update(updates)
      .eq("id", id as string);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optionally grant beta access to the profile matching prospect email
  if (grant_beta && updates.email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", updates.email as string)
      .single();

    if (profile) {
      await supabase
        .from("profiles")
        .update({ beta_access: true, subscription_status: "beta" })
        .eq("id", profile.id as string);
      console.log(`[prospects] granted beta to profile with email ${updates.email}`);
    } else {
      console.log(`[prospects] grant_beta: no profile found for email ${updates.email}`);
    }
  }

  return NextResponse.json({ ok: true });
}
