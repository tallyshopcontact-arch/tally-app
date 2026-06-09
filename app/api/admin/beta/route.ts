import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";

function checkAdminAuth(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAuthClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, subscription_status, beta_access")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ producers: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { producer_id, beta_access } = await req.json() as {
    producer_id: string;
    beta_access: boolean;
  };

  if (!producer_id) {
    return NextResponse.json({ error: "producer_id required" }, { status: 400 });
  }

  const supabase = await createAuthClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      beta_access,
      ...(beta_access ? { subscription_status: "beta" } : {}),
    })
    .eq("id", producer_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
