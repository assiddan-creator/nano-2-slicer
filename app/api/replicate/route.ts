import { NextRequest, NextResponse } from "next/server";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || "";

// Internal keys match the UI/engine selector in `app/page.tsx`.
const modelMap: Record<string, string> = {
  "flux-2-pro": "black-forest-labs/flux-2-pro",
  "seedream-5-lite": "bytedance/seedream-5-lite",
  "nano-banana-2": "google/nano-banana-2",
  "gemini-2-5-flash": "google/gemini-2.5-flash",
};

const versionIdCache = new Map<string, string>();

function splitModelSlug(
  slug: string,
): { owner: string; model: string } | null {
  const parts = slug.split("/");
  if (parts.length !== 2) return null;
  const [owner, model] = parts;
  if (!owner || !model) return null;
  return { owner, model };
}

function normalizeOutput(output: unknown) {
  // Replicate sometimes wraps URLs in a callable `url()` helper.
  if (output && typeof output === "object") {
    const urlVal = (output as { url?: unknown }).url;
    if (typeof urlVal === "function") {
      try {
        return urlVal();
      } catch {
        return output;
      }
    }
    if (typeof urlVal === "string") return urlVal;
  }
  return output;
}

async function getLatestVersionId(modelSlug: string) {
  const cached = versionIdCache.get(modelSlug);
  if (cached) return cached;

  const parsed = splitModelSlug(modelSlug);
  if (!parsed) return null;

  const { owner, model } = parsed;

  // Some models do not expose a versions-list; instead, use `latest_version.id`
  // from the model details endpoint.
  const modelRes = await fetch(
    `https://api.replicate.com/v1/models/${encodeURIComponent(
      owner,
    )}/${encodeURIComponent(model)}`,
    {
      headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
    },
  );

  const modelData = await modelRes.json();
  const versionId =
    modelData?.latest_version?.id ??
    modelData?.latest_version ??
    (typeof modelData?.latest_version === "string"
      ? modelData.latest_version
      : null);

  if (typeof versionId !== "string" || !versionId) return null;
  versionIdCache.set(modelSlug, versionId);
  return versionId;
}

export async function POST(req: NextRequest) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Missing REPLICATE_API_TOKEN" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { modelId, input } = (body ?? {}) as {
    modelId?: string;
    input?: unknown;
  };

  if (!modelId || typeof modelId !== "string") {
    return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
  }

  const modelSlug = modelMap[modelId];
  if (!modelSlug) {
    return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  }

  const versionId = await getLatestVersionId(modelSlug);
  if (!versionId) {
    return NextResponse.json(
      { error: "Could not resolve latest model version" },
      { status: 500 },
    );
  }

  // IMPORTANT: do not poll/wait; Replicate will return immediately with a prediction id.
  const startRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait=0",
    },
    body: JSON.stringify({ version: versionId, input }),
  });

  const prediction = await startRes.json();
  if (prediction?.error) {
    return NextResponse.json({ error: prediction.error }, { status: 500 });
  }
  if (!prediction?.id) {
    return NextResponse.json(
      { error: "No prediction id returned", detail: prediction },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: prediction.id, status: prediction.status });
}

export async function GET(req: NextRequest) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Missing REPLICATE_API_TOKEN" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Missing prediction id" },
      { status: 400 },
    );
  }

  const res = await fetch(
    `https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
    },
  );

  const data = await res.json();
  return NextResponse.json({
    status: data.status,
    output: normalizeOutput(data.output),
    error: data.error,
  });
}
