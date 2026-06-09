import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { url } = await req.json() as { url: string };
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  if (!url.startsWith("https://oaidalleapiprodscus.blob.core.windows.net") &&
      !url.startsWith("https://") ) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const imageRes = await fetch(url);
  if (!imageRes.ok) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }

  const blob = await imageRes.blob();
  return new NextResponse(blob, {
    headers: {
      "Content-Type": imageRes.headers.get("Content-Type") ?? "image/png",
      "Content-Disposition": "attachment",
    },
  });
}
