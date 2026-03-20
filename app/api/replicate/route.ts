import { NextRequest, NextResponse } from "next/server";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || "";

const modelMap: Record<string, string> = {
  "flux-2-pro": "black-forest-labs/flux-2-pro",
  "seedream-5-lite": "bytedance/seedream-5-lite",
  "nano-banana-2": "google/nano-banana-2",
};

export async function POST(req: NextRequest) {
  const { modelId, input } = await req.json();

  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Missing REPLICATE_API_TOKEN" },
      { status: 500 },
    );
  }

  const fullModelId = modelMap[modelId];
  if (!fullModelId) {
    return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  }

  const startRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: fullModelId, input }),
  });

  const prediction = await startRes.json();
  return NextResponse.json({
    debug_status: startRes.status,
    debug_full_response: prediction,
    id: prediction.id,
    status: prediction.status,
    error: prediction.error || null,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing prediction id" }, { status: 400 });
  }

  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
  }

  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
  });

  const data = await res.json();
  return NextResponse.json({ status: data.status, output: data.output, error: data.error });
}
