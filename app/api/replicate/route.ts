import { NextRequest, NextResponse } from "next/server";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || "";

const MODEL_CONFIGS: Record<
  string,
  { version?: string; usePolling: boolean }
> = {
  "flux-2-pro": { usePolling: true },
  "seedream-5-lite": { usePolling: true },
  "nano-banana-2": { usePolling: true },
};

export async function POST(req: NextRequest) {
  const { modelId, input } = await req.json();

  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Missing REPLICATE_API_TOKEN" },
      { status: 500 },
    );
  }

  const config = MODEL_CONFIGS[modelId];
  if (!config) {
    return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  }

  const modelMap: Record<string, string> = {
    "flux-2-pro": "black-forest-labs/flux-2-pro",
    "seedream-5-lite": "bytedance/seedream-5-lite",
    "nano-banana-2": "google/nano-banana-2",
  };

  const fullModelId = modelMap[modelId];

  // Start prediction
  const startRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      model: fullModelId,
      input,
    }),
  });

  const prediction = await startRes.json();

  if (prediction.error) {
    return NextResponse.json({ error: prediction.error }, { status: 500 });
  }

  // If already completed (sync response)
  if (prediction.status === "succeeded") {
    return NextResponse.json({ output: prediction.output });
  }

  // Poll until done
  const predictionId = prediction.id;
  let attempts = 0;
  while (attempts < 60) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      },
    );
    const pollData = await pollRes.json();
    if (pollData.status === "succeeded") {
      return NextResponse.json({ output: pollData.output });
    }
    if (pollData.status === "failed" || pollData.status === "canceled") {
      return NextResponse.json(
        { error: pollData.error || "Prediction failed" },
        { status: 500 },
      );
    }
    attempts++;
  }

  return NextResponse.json(
    { error: "Timeout after 3 minutes" },
    { status: 504 },
  );
}

