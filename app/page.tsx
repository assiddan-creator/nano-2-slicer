/*
"use client";

import { useState } from "react";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type CategoryKey = "objects" | "lighting" | "camera" | "text";

const CATEGORY_DEFINITIONS: {
  key: CategoryKey;
  title: string;
  keywords: string[];
}[] = [
  {
    key: "objects",
    title: "Objects/Furniture",
    keywords: ["object", "objects", "furniture", "item", "asset", "props", "room", "scene"],
  },
  {
    key: "lighting",
    title: "Lighting & Weather",
    keywords: ["light", "lighting", "weather", "sun", "shadow", "exposure", "rain", "fog"],
  },
  {
    key: "camera",
    title: "Camera/Perspective",
    keywords: ["camera", "perspective", "focal", "lens", "angle", "framing"],
  },
  {
    key: "text",
    title: "Text/Logos",
    keywords: ["text", "logo", "caption", "title", "typography", "font", "label"],
  },
];

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
*/

"use client";

import { useState, useCallback } from "react";

// ─── Robust JSON Parser ───────────────────────────────────────────────────────

function sanitizeAndParse(raw: string): { data: unknown; error: string | null } {
  try {
    // Step 1: Strip ALL invisible / directional / zero-width characters
    const stripped = raw
      .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u2028\u2029\u00AD\u180E\u2060\uFFF9-\uFFFB]/g, "")
      .replace(/\u00A0/g, " ") // non-breaking space → regular space
      .replace(/\u202A-\u202E/g, "") // LTR/RTL embedding & override marks
      .replace(/\r\n/g, "\n")
      .trim();

    // Step 2: Find the outermost valid JSON container
    const firstBrace = stripped.indexOf("{");
    const firstBrack = stripped.indexOf("[");
    const lastBrace = stripped.lastIndexOf("}");
    const lastBrack = stripped.lastIndexOf("]");

    let start = -1;
    let end = -1;
    let openChar = "";
    let closeChar = "";

    if (firstBrace !== -1 && (firstBrack === -1 || firstBrace < firstBrack)) {
      start = firstBrace;
      openChar = "{";
      closeChar = "}";
      end = lastBrace;
    } else if (firstBrack !== -1) {
      start = firstBrack;
      openChar = "[";
      closeChar = "]";
      end = lastBrack;
    }

    if (start === -1 || end === -1 || end < start) {
      return { data: null, error: "לא נמצא JSON תקני (סוגריים { } או [ ])" };
    }

    void openChar;
    void closeChar; // used for detection only
    const candidate = stripped.slice(start, end + 1);

    const data = JSON.parse(candidate);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];

// ─── Flat editor helper ──────────────────────────────────────────────────────

function flattenJson(
  obj: JsonValue,
  prefix: string[] = []
): { path: string[]; label: string; value: JsonPrimitive }[] {
  const results: { path: string[]; label: string; value: JsonPrimitive }[] = [];
  if (obj === null || typeof obj !== "object") {
    results.push({
      path: prefix,
      label: prefix.join(" › "),
      value: obj as JsonPrimitive,
    });
    return results;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      results.push(...flattenJson(item, [...prefix, String(i)]));
    });
  } else {
    Object.entries(obj as JsonObject).forEach(([k, v]) => {
      if (v === null || typeof v !== "object") {
        results.push({
          path: [...prefix, k],
          label: [...prefix, k].join(" › "),
          value: v as JsonPrimitive,
        });
      } else {
        results.push(...flattenJson(v as JsonValue, [...prefix, k]));
      }
    });
  }
  return results;
}

// ─── Deep helpers ─────────────────────────────────────────────────────────────

function deepSet(obj: JsonValue, path: string[], newVal: JsonValue): JsonValue {
  if (path.length === 0) return newVal;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const idx = Number(head);
    const copy = [...obj];
    copy[idx] = deepSet(copy[idx], rest, newVal);
    return copy;
  }
  if (obj !== null && typeof obj === "object") {
    return { ...(obj as JsonObject), [head]: deepSet((obj as JsonObject)[head], rest, newVal) };
  }
  return obj;
}

function deepDelete(obj: JsonValue, path: string[]): JsonValue {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const idx = Number(head);
    if (rest.length === 0) return obj.filter((_, i) => i !== idx);
    const copy = [...obj];
    copy[idx] = deepDelete(copy[idx], rest);
    return copy;
  }
  if (obj !== null && typeof obj === "object") {
    if (rest.length === 0) {
      const copy = { ...(obj as JsonObject) };
      delete copy[head];
      return copy;
    }
    return { ...(obj as JsonObject), [head]: deepDelete((obj as JsonObject)[head], rest) };
  }
  return obj;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  const [raw, setRaw] = useState("");
  const [data, setData] = useState<JsonValue>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    try {
      return (
        localStorage.getItem("nb2_gemini_key") || process.env.NEXT_PUBLIC_GEMINI_API_KEY || ""
      );
    } catch {
      return process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
    }
  });
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number>(0);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [changeInstructions, setChangeInstructions] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"create" | "edit">("create");
  const [createPrompt, setCreatePrompt] = useState<string>("A photorealistic image. No blurred faces. 16:9 format.");
  const [createdImageUrl, setCreatedImageUrl] = useState<string | null>(null);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [angle, setAngle] = useState("");
  const [environment, setEnvironment] = useState("");
  const [mood, setMood] = useState("");
  const [cameraBody, setCameraBody] = useState("");
  const [focalLength, setFocalLength] = useState("");
  const [lensType, setLensType] = useState("");
  const [filmStock, setFilmStock] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [photographerStyle, setPhotographerStyle] = useState("");
  const [movieLook, setMovieLook] = useState("");
  const [filterEffect, setFilterEffect] = useState("");
  const [faceRef, setFaceRef] = useState<string | null>(null);
  const [outfitRef, setOutfitRef] = useState<string | null>(null);
  const [globalRef, setGlobalRef] = useState<string | null>(null);
  const [faceBase64, setFaceBase64] = useState<string | null>(null);
  const [outfitBase64, setOutfitBase64] = useState<string | null>(null);
  const [globalBase64, setGlobalBase64] = useState<string | null>(null);

  const handleParse = useCallback(() => {
    const { data: parsed, error } = sanitizeAndParse(raw);
    if (error) {
      setParseError(error);
      setData(null);
    } else {
      setParseError(null);
      setData(parsed as JsonValue);
    }
  }, [raw]);

  const handleCopy = useCallback(async () => {
    if (data === null) return;
    const text = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const promptLibrary = [
    {
      label: "🔍 חילוץ JSON כללי",
      description: "מחלץ כל מידע מובנה מהתמונה",
      prompt:
        "Look at this image carefully. Identify all structured data visible — text, labels, numbers, tables, forms, UI elements, or any data that can be represented as key-value pairs. Extract everything into a single valid JSON object with descriptive English keys. Be thorough and capture every piece of information visible. Return ONLY valid JSON, no markdown, no explanation, no code fences.",
    },
    {
      label: "📋 טבלה / רשימה",
      description: "ממיר טבלאות ורשימות ל-JSON",
      prompt:
        "This image contains a table, list, or structured form. Extract all rows and columns into a JSON object. If it is a table, return an array of objects where each object represents a row and keys are the column headers. If it is a list, return an array of strings or objects. Preserve all values exactly as they appear. Return ONLY valid JSON, no markdown, no explanation, no code fences.",
    },
    {
      label: "🖼️ תיאור תמונה",
      description: "מתאר את התמונה כ-JSON מפורט",
      prompt:
        "Analyze this image in detail and return a JSON object with these keys: subject (main subject or scene description), objects (array of all identifiable objects), colors (array of dominant colors as hex strings), mood (the overall mood or atmosphere), text (any visible text as a string, or null), composition (portrait/landscape/square and any notable framing), quality (estimated image quality: low/medium/high), tags (array of 5-10 descriptive tags). Return ONLY valid JSON, no markdown, no explanation, no code fences.",
    },
    {
      label: "⚙️ הגדרות / קונפיגורציה",
      description: "מחלץ פרמטרים טכניים וערכים",
      prompt:
        "This image shows settings, configuration, parameters, a dashboard, or technical data. Extract all visible settings, values, toggles, fields, and parameters into a JSON object. Use the exact label names as keys (translated to camelCase English if in another language) and the current values as values. Booleans for toggles, numbers for numeric fields, strings for text fields. Return ONLY valid JSON, no markdown, no explanation, no code fences.",
    },
  ];

  const appPromptLibrary = [
    {
      label: "💄 איפור / Beauty AI",
      description: "גוון עור, עיניים, שפתיים, סטייל איפור",
      prompt:
        `Analyze the face in this image and return a JSON object with these exact keys: skinTone (object with fitzpatrick: number 1-6 and name: string), undertone ("warm"/"cool"/"neutral"), eyeColor (string), eyeshadowColors (array of hex strings, empty array if none), eyeliner (true/false), mascara (true/false), lipColor (hex string), lipFinish ("matte"/"glossy"/"natural"/"none"), blush (hex string or null), contour (true/false), makeupStyle ("no-makeup"/"natural"/"everyday"/"glam"/"editorial"/"avant-garde"), overallLook (short description string). Return ONLY valid JSON, no markdown, no explanation, no code fences.`,
    },
    {
      label: "💈 תסרוקת / BarBerBe",
      description: "צבע, אורך, סגנון, מרקם שיער",
      prompt:
        `Look at the hair in this image and return a JSON object with these exact keys: hairColor (object with hex: string and name: string), isColorTreated (true/false), colorTreatmentType ("highlights"/"balayage"/"ombre"/"full-color"/"bleached"/null), hairLength ("buzz"/"short"/"ear-length"/"chin-length"/"shoulder"/"long"/"very-long"), hairTexture ("straight"/"wavy"/"curly"/"coily"), hairThickness ("fine"/"medium"/"thick"), hairstyleType (string describing the style), facialHair (true/false), facialHairStyle (string or null), scalpVisible (true/false), recommendedProductTypes (array of 2-4 product type strings based on the hair type). Return ONLY valid JSON, no markdown, no explanation, no code fences.`,
    },
    {
      label: "👗 סטיילינג אופנה",
      description: "בגדים, צבעים, סגנון, אביזרים",
      prompt:
        `Analyze the outfit and styling in this image and return a JSON object with these exact keys: topGarment (object with type: string, color: hex, pattern: string or "solid"), bottomGarment (object with type: string, color: hex, pattern: string or "solid", or null if not visible), outerwear (object with type and color, or null), footwear (string or null), accessories (array of strings), colorPalette (array of up to 5 hex strings), fashionStyle ("casual"/"streetwear"/"business-casual"/"formal"/"bohemian"/"sporty"/"vintage"/"minimalist"/"maximalist"), season ("spring"/"summer"/"autumn"/"winter"/"all-season"), occasion ("everyday"/"work"/"evening"/"party"/"sport"/"beach"/"special-event"). Return ONLY valid JSON, no markdown, no explanation, no code fences.`,
    },
    {
      label: "🏠 ריל אסטייט / עיצוב פנים",
      description: "חדר, סגנון, חומרים, צבעים, ריהוט",
      prompt:
        `Analyze this interior image and return a JSON object with these exact keys: roomType ("bedroom"/"living-room"/"kitchen"/"bathroom"/"dining-room"/"office"/"hallway"/"other"), approximateSqm (estimated size as number or null), designStyle ("modern"/"minimalist"/"industrial"/"scandinavian"/"mediterranean"/"bohemian"/"classical"/"rustic"/"art-deco"), dominantColors (array of up to 5 hex strings), wallColor (hex string), floorMaterial ("hardwood"/"tile"/"marble"/"carpet"/"concrete"/"laminate"/"other"), lightingType ("natural"/"artificial"/"mixed"), lightingMood ("bright"/"warm"/"dim"/"dramatic"), furnitureItems (array of strings), condition ("needs-renovation"/"fair"/"good"/"excellent"), estimatedStyle (one-line description string). Return ONLY valid JSON, no markdown, no explanation, no code fences.`,
    },
    {
      label: "🍕 צילומי אוכל",
      description: "מנה, מרכיבים, צבעים, סגנון צילום",
      prompt:
        `Analyze this food image and return a JSON object with these exact keys: dishName (string), cuisineType (string), mainIngredients (array of up to 8 strings), cookingMethod ("fried"/"grilled"/"baked"/"raw"/"steamed"/"boiled"/"mixed"/"unknown"), dominantColors (array of up to 4 hex strings), platingStyle ("rustic"/"fine-dining"/"homestyle"/"street-food"/"minimalist"/"abundant"), servingVessel (string), portionSize ("small"/"medium"/"large"/"sharing"), appetizingScore (number 1-10), dietaryTags (array from: "vegetarian","vegan","gluten-free","dairy-free","meat","seafood","spicy"), photographyQuality ("amateur"/"good"/"professional"), shootingAngle ("top-down"/"45-degree"/"eye-level"/"close-up"). Return ONLY valid JSON, no markdown, no explanation, no code fences.`,
    },
  ];

  const [editorOpen, setEditorOpen] = useState(false);
  const [editablePrompts, setEditablePrompts] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nb2_prompts");
      if (saved) return JSON.parse(saved);
    }
    return { general: promptLibrary, apps: appPromptLibrary };
  });

  const savePrompts = (updated: typeof editablePrompts) => {
    setEditablePrompts(updated);
    localStorage.setItem("nb2_prompts", JSON.stringify(updated));
  };

  const handleImageUpload = (file: File) => {
    setImageFile(file);
    setGeneratedImageUrl(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImagePreview(result);
      setImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleExtractJson = async () => {
    if (!imageBase64 || !geminiKey) return;
    setLoadingExtract(true);
    setExtractError(null);
    try {
      const allPromptsFlat = [...editablePrompts.general, ...editablePrompts.apps];
      const selectedPrompt = allPromptsFlat[selectedPromptIndex];
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: selectedPrompt.prompt },
                  { inline_data: { mime_type: imageFile!.type, data: imageBase64 } },
                ],
              },
            ],
          }),
        },
      );
      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      setRaw(text);
      const { data: parsed, error } = sanitizeAndParse(text);
      if (error) {
        setExtractError(error);
      } else {
        setData(parsed as JsonValue);
        setExtractError(null);
      }
    } catch (e) {
      setExtractError((e as Error).message);
    } finally {
      setLoadingExtract(false);
    }
  };

  const rebuildPrompt = (fields: {
    subject?: string; angle?: string; environment?: string; mood?: string;
    cameraBody?: string; focalLength?: string; lensType?: string; filmStock?: string;
    aspectRatio?: string; photographerStyle?: string; movieLook?: string; filterEffect?: string;
  }) => {
    const parts: string[] = ["A photorealistic image."];
    if (fields.subject) parts.push(`Subject: ${fields.subject}.`);
    if (fields.angle) parts.push(`Shot angle: ${fields.angle}.`);
    if (fields.environment) parts.push(`Environment: ${fields.environment}.`);
    if (fields.mood) parts.push(`Mood and atmosphere: ${fields.mood}.`);
    if (fields.cameraBody || fields.focalLength || fields.lensType || fields.filmStock) {
      const gear = [fields.cameraBody, fields.focalLength && `${fields.focalLength} lens`, fields.lensType, fields.filmStock && `${fields.filmStock} film`].filter(Boolean).join(", ");
      parts.push(`Shot on ${gear}.`);
    }
    if (fields.photographerStyle) parts.push(`Photography style inspired by ${fields.photographerStyle}.`);
    if (fields.movieLook) parts.push(`Cinematic look: ${fields.movieLook}.`);
    if (fields.filterEffect) parts.push(`Filter/effect: ${fields.filterEffect}.`);
    if (fields.aspectRatio) parts.push(`Aspect ratio: ${fields.aspectRatio}. No blurred faces.`);
    return parts.join(" ");
  };

  const handleRefUpload = (file: File, setPreview: (s: string) => void, setBase64: (s: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreview(result);
      setBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateImage = async () => {
    if (!geminiKey) return;
    setLoadingCreate(true);
    setCreateError(null);
    setCreatedImageUrl(null);
    try {
      const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] = [
        { text: createPrompt }
      ];
      if (faceBase64) parts.push({ inline_data: { mime_type: "image/jpeg", data: faceBase64 } });
      if (outfitBase64) parts.push({ inline_data: { mime_type: "image/jpeg", data: outfitBase64 } });
      if (globalBase64) parts.push({ inline_data: { mime_type: "image/jpeg", data: globalBase64 } });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
          })
        }
      );
      const result = await response.json();
      const resParts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = resParts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"));
      if (imagePart) {
        setCreatedImageUrl(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
      } else {
        setCreateError("ג'מיני לא החזיר תמונה — נסה שוב.");
      }
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setLoadingCreate(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imageBase64 || !geminiKey || !data) return;
    setLoadingGenerate(true);
    setGenerateError(null);
    setGeneratedImageUrl(null);
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are an expert image editor. Modify this image according to the instructions below.\n\nUSER INSTRUCTIONS (highest priority):\n${changeInstructions || "Apply the changes described in the JSON below"}\n\nJSON REFERENCE (base structure of the image):\n${jsonString}\n\nIMPORTANT RULES:\n- Follow the user instructions precisely\n- Keep everything NOT mentioned completely identical\n- Same camera angle, same perspective, same lighting, same composition\n- Do not add or remove objects unless explicitly asked`,
                  },
                  { inline_data: { mime_type: imageFile!.type, data: imageBase64 } },
                ],
              },
            ],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
          }),
        },
      );
      const result = await response.json();
      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(
        (p: { inlineData?: { mimeType: string; data: string } }) =>
          p.inlineData?.mimeType?.startsWith("image/"),
      );
      if (imagePart && imagePart.inlineData) {
        setGeneratedImageUrl(
          `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
        );
      } else {
        setGenerateError("ג'מיני לא החזיר תמונה — נסה שוב או החלף מודל.");
      }
    } catch (e) {
      setGenerateError((e as Error).message);
    } finally {
      setLoadingGenerate(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* ── Header ── */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍌</span>
          <div>
            <h1 className="text-base font-bold text-yellow-300 tracking-tight leading-none">
              Nano Banana 2
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Visual JSON Image Editor</p>
          </div>
        </div>
        <button
          onClick={() => setEditorOpen(true)}
          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-yellow-500 hover:text-yellow-300 transition-all focus:outline-none"
        >
          ✏️ ערוך פרומפטים
        </button>
      </header>

      {/* ── Tab Switcher ── */}
      <div className="flex gap-0 border-b border-zinc-800 px-6">
        <button
          onClick={() => setActiveTab("create")}
          className={`px-6 py-3 text-sm font-bold transition-all focus:outline-none border-b-2 ${activeTab === "create" ? "border-yellow-400 text-yellow-300" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
        >
          🎬 צור תמונה חדשה
        </button>
        <button
          onClick={() => setActiveTab("edit")}
          className={`px-6 py-3 text-sm font-bold transition-all focus:outline-none border-b-2 ${activeTab === "edit" ? "border-yellow-400 text-yellow-300" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
        >
          ✏️ ערוך תמונה קיימת
        </button>
      </div>

      {/* ── TAB 1: Create ── */}
      {activeTab === "create" && (
        <div className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT — all form fields */}
          <div className="space-y-6">

            {/* Section 1 — Subject */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-yellow-300 uppercase tracking-widest">01. נושא וסצנה</h3>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">תיאור הנושא</label>
                <textarea rows={3} value={subject} onChange={e => { setSubject(e.target.value); setCreatePrompt(rebuildPrompt({subject: e.target.value, angle, environment, mood, cameraBody, focalLength, lensType, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect})); }} placeholder="לדוגמה: אישה בגשם בתחנת אוטובוס בלונדון" dir="rtl" className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">זווית צילום</label>
                  <select value={angle} onChange={e => { setAngle(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle: e.target.value, environment, mood, cameraBody, focalLength, lensType, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>Eye level</option><option>Low angle</option><option>High angle</option>
                    <option>Bird&apos;s eye view</option><option>Dutch angle</option><option>Over the shoulder</option>
                    <option>Close-up</option><option>Extreme close-up</option><option>Wide shot</option>
                    <option>Medium shot</option><option>Full body</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">סביבה</label>
                  <input type="text" value={environment} onChange={e => { setEnvironment(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment: e.target.value, mood, cameraBody, focalLength, lensType, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect})); }} placeholder="רחוב, סטודיו, יער..." dir="rtl" className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none h-10" />
                </div>
              </div>
            </div>

            {/* Section 2 — Lighting */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-yellow-300 uppercase tracking-widest">02. תאורה ואווירה</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">מקור תאורה</label>
                  <select value={mood} onChange={e => { setMood(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood: e.target.value, cameraBody, focalLength, lensType, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>Golden hour sunlight</option><option>Blue hour</option><option>Overcast soft light</option>
                    <option>Neon lights</option><option>Candlelight</option><option>Studio softbox</option>
                    <option>Hard rim lighting</option><option>Chiaroscuro</option><option>Practical lights only</option>
                    <option>Moonlight</option><option>Harsh midday sun</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">אווירה</label>
                  <input type="text" value={mood} onChange={e => { setMood(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood: e.target.value, cameraBody, focalLength, lensType, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect})); }} placeholder="moody, cinematic, dreamy..." className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none h-10" />
                </div>
              </div>
            </div>

            {/* Section 3 — Camera */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-yellow-300 uppercase tracking-widest">03. ציוד צילום</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">גוף מצלמה</label>
                  <select value={cameraBody} onChange={e => { setCameraBody(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood, cameraBody: e.target.value, focalLength, lensType, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>Canon EOS 5D Mark IV</option><option>Nikon Z9</option><option>Sony A7R V</option>
                    <option>Hasselblad X2D</option><option>Leica M11</option><option>Fujifilm GFX 100S</option>
                    <option>Phase One IQ4</option><option>Canon R5</option><option>Nikon D850</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">מרחק מוקד</label>
                  <select value={focalLength} onChange={e => { setFocalLength(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood, cameraBody, focalLength: e.target.value, lensType, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>14mm</option><option>24mm</option><option>35mm</option><option>50mm</option>
                    <option>85mm</option><option>100mm</option><option>135mm</option><option>200mm</option>
                    <option>400mm</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">סוג עדשה</label>
                  <select value={lensType} onChange={e => { setLensType(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood, cameraBody, focalLength, lensType: e.target.value, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>Prime lens</option><option>Zoom lens</option><option>Fisheye</option>
                    <option>Macro</option><option>Tilt-shift</option><option>Anamorphic</option>
                    <option>Portrait lens</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">פילם / סנסור</label>
                  <select value={filmStock} onChange={e => { setFilmStock(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood, cameraBody, focalLength, lensType, filmStock: e.target.value, aspectRatio, photographerStyle, movieLook, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>Kodak Portra 400</option><option>Kodak Ektar 100</option><option>Fuji Velvia 50</option>
                    <option>Ilford HP5</option><option>Kodak Tri-X 400</option><option>CineStill 800T</option>
                    <option>Fuji Provia 100F</option><option>Lomochrome Purple</option>
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-zinc-500">יחס תמונה</label>
                  <select value={aspectRatio} onChange={e => { setAspectRatio(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood, cameraBody, focalLength, lensType, filmStock, aspectRatio: e.target.value, photographerStyle, movieLook, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option>16:9</option><option>4:3</option><option>1:1</option><option>9:16</option>
                    <option>2.39:1 (Cinemascope)</option><option>2.35:1</option><option>1.85:1</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 4 — Style */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-yellow-300 uppercase tracking-widest">04. סגנון ואסתטיקה</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">סגנון צלם</label>
                  <select value={photographerStyle} onChange={e => { setPhotographerStyle(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood, cameraBody, focalLength, lensType, filmStock, aspectRatio, photographerStyle: e.target.value, movieLook, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>Annie Leibovitz</option><option>Ansel Adams</option><option>Henri Cartier-Bresson</option>
                    <option>Steve McCurry</option><option>Helmut Newton</option><option>Richard Avedon</option>
                    <option>Cindy Sherman</option><option>Gregory Crewdson</option><option>Martin Schoeller</option>
                    <option>David LaChapelle</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">סגנון סרט</label>
                  <select value={movieLook} onChange={e => { setMovieLook(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood, cameraBody, focalLength, lensType, filmStock, aspectRatio, photographerStyle, movieLook: e.target.value, filterEffect})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>Blade Runner 2049</option><option>The Grand Budapest Hotel</option>
                    <option>Parasite</option><option>Mad Max: Fury Road</option><option>Her</option>
                    <option>Interstellar</option><option>La La Land</option><option>No Country for Old Men</option>
                    <option>Drive</option><option>Amélie</option>
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-zinc-500">פילטר / אפקט</label>
                  <select value={filterEffect} onChange={e => { setFilterEffect(e.target.value); setCreatePrompt(rebuildPrompt({subject, angle, environment, mood, cameraBody, focalLength, lensType, filmStock, aspectRatio, photographerStyle, movieLook, filterEffect: e.target.value})); }} className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none">
                    <option value="">בחר...</option>
                    <option>Film grain</option><option>Light leak</option><option>Lens flare</option>
                    <option>Bokeh background</option><option>Motion blur</option><option>Double exposure</option>
                    <option>Infrared</option><option>Cross-process</option><option>Vignette</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 5 — Reference images */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-yellow-300 uppercase tracking-widest">05. תמונות רפרנס</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Face ref */}
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500">פנים של הדמות</label>
                  <div onClick={() => document.getElementById("ref-face")?.click()} className={`cursor-pointer rounded-xl border-2 border-dashed border-zinc-700 hover:border-yellow-500 transition-all flex items-center justify-center overflow-hidden ${faceRef ? "p-0 h-32" : "p-6"}`}>
                    {faceRef ? <img src={faceRef} className="w-full h-full object-cover rounded-xl" alt="face ref" /> : <div className="text-center"><div className="text-2xl">👤</div><p className="text-xs text-zinc-600 mt-1">העלה תמונה</p></div>}
                  </div>
                  <input id="ref-face" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleRefUpload(f, setFaceRef, setFaceBase64); }} />
                  {faceRef && <button onClick={() => { setFaceRef(null); setFaceBase64(null); }} className="text-xs text-zinc-600 hover:text-rose-400 transition-colors">✕ הסר</button>}
                </div>
                {/* Outfit ref */}
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500">בגדים של הדמות</label>
                  <div onClick={() => document.getElementById("ref-outfit")?.click()} className={`cursor-pointer rounded-xl border-2 border-dashed border-zinc-700 hover:border-yellow-500 transition-all flex items-center justify-center overflow-hidden ${outfitRef ? "p-0 h-32" : "p-6"}`}>
                    {outfitRef ? <img src={outfitRef} className="w-full h-full object-cover rounded-xl" alt="outfit ref" /> : <div className="text-center"><div className="text-2xl">👗</div><p className="text-xs text-zinc-600 mt-1">העלה תמונה</p></div>}
                  </div>
                  <input id="ref-outfit" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleRefUpload(f, setOutfitRef, setOutfitBase64); }} />
                  {outfitRef && <button onClick={() => { setOutfitRef(null); setOutfitBase64(null); }} className="text-xs text-zinc-600 hover:text-rose-400 transition-colors">✕ הסר</button>}
                </div>
              </div>
              {/* Global ref */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-500">רפרנס גלובלי לסגנון</label>
                <div onClick={() => document.getElementById("ref-global")?.click()} className={`cursor-pointer rounded-xl border-2 border-dashed border-zinc-700 hover:border-yellow-500 transition-all flex items-center justify-center overflow-hidden ${globalRef ? "p-0 h-40" : "p-8"}`}>
                  {globalRef ? <img src={globalRef} className="w-full h-full object-contain rounded-xl" alt="global ref" /> : <div className="text-center"><div className="text-2xl">🌐</div><p className="text-xs text-zinc-600 mt-1">תמונת סגנון כללי</p></div>}
                </div>
                <input id="ref-global" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleRefUpload(f, setGlobalRef, setGlobalBase64); }} />
                {globalRef && <button onClick={() => { setGlobalRef(null); setGlobalBase64(null); }} className="text-xs text-zinc-600 hover:text-rose-400 transition-colors">✕ הסר</button>}
              </div>
            </div>
          </div>

          {/* RIGHT — prompt preview + generate + result */}
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 sticky top-6">
              <h3 className="text-sm font-bold text-yellow-300 uppercase tracking-widest">פרומפט מובנה</h3>
              <textarea
                value={createPrompt}
                onChange={e => setCreatePrompt(e.target.value)}
                rows={8}
                dir="ltr"
                className="w-full bg-zinc-800 text-zinc-200 text-sm font-mono rounded-lg px-4 py-3 border border-zinc-700 focus:border-yellow-500 focus:outline-none resize-y leading-relaxed"
              />
              <button
                onClick={handleCreateImage}
                disabled={!geminiKey || loadingCreate}
                className="w-full py-4 bg-yellow-400 text-black text-base font-bold rounded-xl hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none flex items-center justify-center gap-2"
                type="button"
              >
                {loadingCreate ? <><span className="animate-spin inline-block w-5 h-5 border-2 border-black border-t-transparent rounded-full" />מייצר תמונה...</> : "✨ צור תמונה"}
              </button>
              {createError && <p className="text-xs text-rose-400 bg-rose-950 border border-rose-800 px-3 py-2 rounded-lg">{createError}</p>}
              {createdImageUrl && (
                <div className="space-y-3">
                  <p className="text-xs text-emerald-400 font-semibold">✓ התמונה מוכנה!</p>
                  <img src={createdImageUrl} alt="generated" className="w-full rounded-xl border border-zinc-700" />
                  <div className="flex gap-2">
                    <a href={createdImageUrl} download="nano-banana-create.png" className="flex-1 text-center py-2 border border-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg hover:border-yellow-500 hover:text-yellow-300 transition-all">⬇ הורד</a>
                    <button
                      type="button"
                      onClick={() => {
                        if (createdImageUrl) {
                          fetch(createdImageUrl).then(r => r.blob()).then(blob => {
                            const file = new File([blob], "created.png", { type: "image/png" });
                            handleImageUpload(file);
                            setActiveTab("edit");
                          });
                        }
                      }}
                      className="flex-1 text-center py-2 border border-yellow-600 text-yellow-300 text-xs font-semibold rounded-lg hover:bg-yellow-950 transition-all"
                    >
                      ✏️ שלח לעריכה
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Edit ── */}
      {activeTab === "edit" && (
      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-6">
          {/* ── COLUMN 1: Upload + Extract ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 min-h-screen">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-bold">
                1
              </span>
              העלה תמונה וחלץ JSON
            </h2>

            {/* API Key */}
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">מפתח Gemini API</label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  try {
                    localStorage.setItem("nb2_gemini_key", e.target.value);
                  } catch {}
                }}
                placeholder="AIza..."
                className="w-full bg-zinc-800 text-zinc-100 text-xs font-mono rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none"
                dir="ltr"
              />
            </div>

            {/* Image Upload */}
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">תמונה</label>
              <div
                onClick={() => document.getElementById("nb2-file-input")?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleImageUpload(f);
                }}
                onDragOver={(e) => e.preventDefault()}
                className={`cursor-pointer rounded-xl border-2 border-dashed transition-all flex items-center justify-center overflow-hidden
                  ${imagePreview ? "border-zinc-700 p-0" : "border-zinc-700 hover:border-yellow-500 p-8 text-center"}`}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="preview"
                    className="w-full max-h-52 object-contain rounded-xl"
                  />
                ) : (
                  <div className="space-y-1">
                    <div className="text-3xl">📁</div>
                    <p className="text-xs text-zinc-500">גרור תמונה לכאן או לחץ לבחירה</p>
                  </div>
                )}
              </div>
              <input
                id="nb2-file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f);
                }}
              />
              {imagePreview && (
                <button
                  onClick={() => document.getElementById("nb2-file-input")?.click()}
                  className="text-xs text-zinc-500 hover:text-yellow-300 transition-colors focus:outline-none"
                  type="button"
                >
                  🔄 החלף תמונה
                </button>
              )}
            </div>

            {/* Prompt selector */}
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">פרומפט לחילוץ</label>
              <select
                value={selectedPromptIndex}
                onChange={(e) => setSelectedPromptIndex(Number(e.target.value))}
                className="w-full bg-zinc-800 text-zinc-100 text-xs rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none"
              >
                <optgroup label="כלליים">
                  {editablePrompts.general.map((p: { label: string }, i: number) => (
                    <option key={i} value={i}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="האפליקציות שלי">
                  {editablePrompts.apps.map((p: { label: string }, i: number) => (
                    <option key={i + editablePrompts.general.length} value={i + editablePrompts.general.length}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Extract button */}
            <button
              onClick={handleExtractJson}
              disabled={!imageBase64 || !geminiKey || loadingExtract}
              className="w-full py-3 bg-yellow-400 text-black text-sm font-bold rounded-xl hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none flex items-center justify-center gap-2"
              type="button"
            >
              {loadingExtract ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full" />
                  מחלץ JSON...
                </>
              ) : (
                "🔍 חלץ JSON מהתמונה"
              )}
            </button>

            {extractError && (
              <p className="text-xs text-rose-400 bg-rose-950 border border-rose-800 px-3 py-2 rounded-lg">
                {extractError}
              </p>
            )}
          </div>

          {/* ── COLUMN 2: JSON Editor ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-bold">
                2
              </span>
              ערוך את ה-JSON
            </h2>

            {/* Raw textarea */}
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={'{\n  "key": "value"\n}'}
              rows={5}
              dir="ltr"
              spellCheck={false}
              className="w-full bg-zinc-800 text-zinc-100 text-xs font-mono rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none resize-none"
            />

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleParse}
                className="px-3 py-1.5 bg-yellow-400 text-black text-xs font-bold rounded-lg hover:bg-yellow-300 transition-colors focus:outline-none"
                type="button"
              >
                ⟳ פרסר JSON
              </button>
              {raw && (
                <button
                  onClick={() => {
                    setRaw("");
                    setData(null);
                    setParseError(null);
                  }}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-200 border border-zinc-700 rounded-lg transition-colors focus:outline-none"
                  type="button"
                >
                  נקה
                </button>
              )}
              {parseError && <span className="text-xs text-rose-400">{parseError}</span>}
            </div>

            {/* Flat JSON Editor + Copy */}
            {data !== null && (
              <>
                <div className="flex items-center justify-end">
                  <button
                    onClick={handleCopy}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all focus:outline-none ${
                      copied
                        ? "border-emerald-500 text-emerald-300"
                        : "border-zinc-700 text-zinc-300 hover:border-yellow-500"
                    }`}
                    type="button"
                  >
                    {copied ? "✓ הועתק!" : "⎘ העתק JSON"}
                  </button>
                </div>

                {data !== null &&
                  (() => {
                    const flat = flattenJson(data);
                    return (
                      <div className="space-y-2">
                        {flat.map((entry, i) => {
                          const isColor =
                            typeof entry.value === "string" &&
                            /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(entry.value);
                          const isLong =
                            typeof entry.value === "string" && entry.value.length > 40;
                          return (
                            <div key={i} className="flex items-start gap-3 group">
                              <span className="text-xs text-zinc-400 font-mono pt-2 min-w-[140px] max-w-[180px] break-words leading-tight flex-shrink-0">
                                {entry.label}
                              </span>
                              <div className="flex-1 flex items-center gap-2">
                                {isColor && (
                                  <input
                                    type="color"
                                    defaultValue={entry.value as string}
                                    onChange={(e) => {
                                      setData((prev) => deepSet(prev, entry.path, e.target.value));
                                    }}
                                    className="w-10 h-9 rounded-lg cursor-pointer border-2 border-zinc-600 bg-transparent p-0.5 focus:outline-none hover:border-yellow-500 transition-colors flex-shrink-0"
                                  />
                                )}
                                {isLong ? (
                                  <textarea
                                    defaultValue={
                                      entry.value === null ? "null" : String(entry.value)
                                    }
                                    onBlur={(e) => {
                                      let v: JsonValue = e.target.value;
                                      if (v === "true") v = true;
                                      else if (v === "false") v = false;
                                      else if (v === "null") v = null;
                                      else if (
                                        !isNaN(Number(v)) &&
                                        v.trim() !== ""
                                      ) {
                                        v = Number(v);
                                      }
                                      setData((prev) => deepSet(prev, entry.path, v));
                                    }}
                                    rows={2}
                                    dir="auto"
                                    className="flex-1 bg-zinc-800 text-zinc-100 text-sm font-mono rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-400 focus:outline-none resize-none"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    defaultValue={
                                      entry.value === null ? "null" : String(entry.value)
                                    }
                                    onBlur={(e) => {
                                      let v: JsonValue = e.target.value;
                                      if (v === "true") v = true;
                                      else if (v === "false") v = false;
                                      else if (v === "null") v = null;
                                      else if (
                                        !isNaN(Number(v)) &&
                                        v.trim() !== ""
                                      ) {
                                        v = Number(v);
                                      }
                                      setData((prev) => deepSet(prev, entry.path, v));
                                    }}
                                    dir="auto"
                                    className="flex-1 bg-zinc-800 text-zinc-100 text-sm font-mono rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-400 focus:outline-none h-9"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
              </>
            )}
          </div>

          {/* ── COLUMN 3: Generate Image ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-bold">
                3
              </span>
              צור תמונה חדשה
            </h2>

            {imagePreview && (
              <div className="space-y-1">
                <p className="text-xs text-zinc-500">תמונה מקורית</p>
                <img
                  src={imagePreview}
                  alt="original"
                  className="w-full max-h-36 object-contain rounded-lg border border-zinc-700"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-zinc-500">מה לשנות בתמונה? (כתוב בחופשיות)</label>
              <textarea
                value={changeInstructions}
                onChange={e => setChangeInstructions(e.target.value)}
                placeholder={"לדוגמה: שנה את צבע הספה לכחול כהה, הוסף שטיח פרסי, שנה את התאורה לערבית חמה"}
                rows={3}
                dir="rtl"
                className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none resize-none placeholder-zinc-600"
              />
              <p className="text-xs text-zinc-600">הג&apos;ייסון ישמש כבסיס — ההוראות שלך יגברו עליו</p>
            </div>

            <button
              onClick={handleGenerateImage}
              disabled={!data || !imageBase64 || !geminiKey || loadingGenerate}
              className="w-full py-4 bg-yellow-400 text-black text-sm font-bold rounded-xl hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none flex items-center justify-center gap-2"
              type="button"
            >
              {loadingGenerate ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full" />
                  מייצר תמונה...
                </>
              ) : (
                "✨ צור תמונה חדשה"
              )}
            </button>

            {generateError && (
              <p className="text-xs text-rose-400 bg-rose-950 border border-rose-800 px-3 py-2 rounded-lg">
                {generateError}
              </p>
            )}

            {generatedImageUrl && (
              <div className="space-y-3">
                <p className="text-xs text-emerald-400 font-semibold">✓ התמונה מוכנה!</p>
                <img
                  src={generatedImageUrl}
                  alt="generated"
                  className="w-full rounded-xl border border-zinc-700"
                />
                <a
                  href={generatedImageUrl}
                  download="nano-banana-result.png"
                  className="block w-full text-center py-2 border border-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg hover:border-yellow-500 hover:text-yellow-300 transition-all"
                >
                  ⬇ הורד תמונה
                </a>
              </div>
            )}

            {!generatedImageUrl && !loadingGenerate && (
              <div className="text-center py-8 text-zinc-700 text-xs">
                השלם שלבים 1 ו-2 כדי לייצר תמונה
              </div>
            )}
          </div>
        </div>
      </main>
      )}

      {editorOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-base font-bold text-yellow-300">✏️ עורך פרומפטים</h2>
              <button
                onClick={() => setEditorOpen(false)}
                className="text-zinc-500 hover:text-white text-xl focus:outline-none"
                type="button"
              >
                ✕
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
              {/* General section */}
              <div>
                <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">📋 פרומפטים כלליים</p>
                <div className="space-y-4">
                  {editablePrompts.general.map(
                    (p: { label: string; description: string; prompt: string }, i: number) => (
                      <div key={i} className="space-y-1">
                        <label className="text-sm font-semibold text-zinc-100">{p.label}</label>
                        <textarea
                          value={p.prompt}
                          rows={4}
                          onChange={(e) => {
                            const updated = { ...editablePrompts };
                            updated.general = [...updated.general];
                            updated.general[i] = { ...updated.general[i], prompt: e.target.value };
                            savePrompts(updated);
                          }}
                          className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none resize-y"
                          dir="ltr"
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>

              {/* Apps section */}
              <div>
                <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">🚀 פרומפטים לאפליקציות שלי</p>
                <div className="space-y-4">
                  {editablePrompts.apps.map(
                    (p: { label: string; description: string; prompt: string }, i: number) => (
                      <div key={i} className="space-y-1">
                        <label className="text-sm font-semibold text-zinc-100">{p.label}</label>
                        <textarea
                          value={p.prompt}
                          rows={4}
                          onChange={(e) => {
                            const updated = { ...editablePrompts };
                            updated.apps = [...updated.apps];
                            updated.apps[i] = { ...updated.apps[i], prompt: e.target.value };
                            savePrompts(updated);
                          }}
                          className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded-lg px-3 py-2 border border-zinc-700 focus:border-yellow-500 focus:outline-none resize-y"
                          dir="ltr"
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
              <button
                onClick={() => {
                  localStorage.removeItem("nb2_prompts");
                  setEditablePrompts({ general: promptLibrary, apps: appPromptLibrary });
                }}
                className="text-xs text-zinc-500 hover:text-rose-400 transition-colors focus:outline-none"
                type="button"
              >
                ↺ איפוס לברירת מחדל
              </button>
              <button
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 bg-yellow-400 text-black text-sm font-bold rounded-lg hover:bg-yellow-300 transition-colors focus:outline-none"
                type="button"
              >
                ✓ סגור ושמור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/*
function formatKeyLabel(label: string): string {
  return label
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function labelFromPath(path: string[]): string {
  const lastPart = path[path.length - 1];
  return formatKeyLabel(lastPart || "Value");
}

function isNumericString(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function updateValueAtPath(root: JsonValue, path: string[], nextValue: JsonValue): JsonValue {
  if (path.length === 0) {
    return nextValue;
  }

  const [head, ...tail] = path;

  if (Array.isArray(root)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= root.length) {
      return root;
    }
    const cloned = [...root];
    cloned[index] = updateValueAtPath(cloned[index], tail, nextValue);
    return cloned;
  }

  if (isJsonObject(root)) {
    const currentChild = root[head];
    if (typeof currentChild === "undefined") {
      return root;
    }
    return {
      ...root,
      [head]: updateValueAtPath(currentChild, tail, nextValue),
    };
  }

  return root;
}

function inferCategoryForKey(key: string): CategoryKey | null {
  const lowerKey = key.toLowerCase();
  for (const category of CATEGORY_DEFINITIONS) {
    if (category.keywords.some((keyword) => lowerKey.includes(keyword))) {
      return category.key;
    }
  }
  return null;
}

export default function Home() {
  const [workflowData, setWorkflowData] = useState<JsonValue | null>(null);
  const [jsonText, setJsonText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [promptCopiedIndex, setPromptCopiedIndex] = useState<number | null>(null);

  const handleLoadJson = (text: string) => {
    const rawInput = text
      // Common invisible characters from copy/paste and chat tools.
      .replace(/[\u00A0\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\uFEFF\u00AD\u061C]/g, " ");

    setErrorMessage(null);
    setWorkflowData(null);

    try {
      const parsed = JSON.parse(rawInput.trim()) as JsonValue;
      setWorkflowData(parsed);
      return;
    } catch (directErr) {
      const directMessage =
        directErr instanceof Error ? directErr.message : String(directErr ?? "Unknown parse error");
      console.error("JSON.parse (direct) error:", directMessage);
    }

    try {
      // Extract the first JSON object/array block from messy strings.
      // Regex is intentionally broad and greedy to capture from the first token to the last closing token.
      const objMatch = rawInput.match(/{[\s\S]*}/);
      const arrMatch = rawInput.match(/\[[\s\S]*]/);

      const extracted = objMatch?.[0] ?? arrMatch?.[0];
      if (!extracted) {
        throw new Error("No JSON block found");
      }

      const parsed = JSON.parse(extracted) as JsonValue;
      setWorkflowData(parsed);
    } catch (extractedErr) {
      const extractedMessage =
        extractedErr instanceof Error ? extractedErr.message : String(extractedErr ?? "Unknown parse error");
      console.error("JSON.parse (extracted) error:", extractedMessage);

      setWorkflowData(null);
      setErrorMessage("Invalid JSON. Paste a valid workflow JSON, then press Load JSON.");
    }
  };

  const copyTextToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const copyTextToClipboardWithFallback = async (text: string) => {
    try {
      await copyTextToClipboard(text);
    } catch {
      // Fallback for environments where the Clipboard API is blocked.
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const handleValueChange = (path: string[], nextValue: JsonValue) => {
    setWorkflowData((previousValue) => {
      if (previousValue === null) {
        return previousValue;
      }
      return updateValueAtPath(previousValue, path, nextValue);
    });
  };

  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const copyUpdatedJsonToClipboard = async () => {
    if (workflowData === null) {
      return;
    }

    const updatedText = JSON.stringify(workflowData, null, 2);
    try {
      await copyTextToClipboardWithFallback(updatedText);
      setCopyStatus("Copied!");
      window.setTimeout(() => setCopyStatus(null), 1500);
    } catch {
      setCopyStatus("Copy failed");
      window.setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  const promptButtons: Array<{ label: string; promptText: string }> = [
    {
      label: "Prompt: Objects & Materials",
      promptText:
        "Analyze this image and output a precise JSON structure for Nano Banana 2. Focus ONLY on objects, furniture, and clothing. List each main item with its 'type', 'material', 'color', and 'position'. Output ONLY valid JSON code without backticks or markdown.",
    },
    {
      label: "Prompt: Lighting & Weather",
      promptText:
        "Analyze this image and output a precise JSON structure for Nano Banana 2. Focus ONLY on lighting and environment. Include 'time_of_day', 'weather_conditions', 'key_light_direction', 'shadow_style', and 'ambient_color'. Output ONLY valid JSON code without backticks or markdown.",
    },
    {
      label: "Prompt: Camera & Perspective",
      promptText:
        "Analyze this image and output a precise JSON structure for Nano Banana 2. Focus ONLY on the camera setup. Include 'focal_length', 'camera_angle', 'depth_of_field', 'perspective', and 'framing'. Output ONLY valid JSON code without backticks or markdown.",
    },
    {
      label: "Prompt: Text & Logos",
      promptText:
        "Analyze this image and output a precise JSON structure for Nano Banana 2. Focus ONLY on typography and logos. Include 'text_content', 'font_style', 'color', 'background_material', and 'placement_coordinates'. Output ONLY valid JSON code without backticks or markdown.",
    },
  ];

  const renderEditor = (
    value: JsonValue,
    path: string[] = [],
    forcedLabel?: string,
  ): React.ReactNode => {
    const fieldLabel = forcedLabel ?? labelFromPath(path);

    if (typeof value === "string") {
      return (
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-zinc-700">{fieldLabel}</span>
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm outline-none ring-indigo-500 focus:ring-2"
            type="text"
            value={value}
            onChange={(event) => handleValueChange(path, event.target.value)}
          />
        </label>
      );
    }

    if (typeof value === "number") {
      return (
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-zinc-700">{fieldLabel}</span>
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm outline-none ring-indigo-500 focus:ring-2"
            type="number"
            value={Number.isNaN(value) ? "" : value}
            onChange={(event) => {
              const next = event.target.value === "" ? 0 : Number(event.target.value);
              handleValueChange(path, Number.isNaN(next) ? value : next);
            }}
          />
        </label>
      );
    }

    if (typeof value === "boolean") {
      return (
        <label className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2">
          <span className="text-sm font-semibold text-zinc-700">{fieldLabel}</span>
          <button
            type="button"
            role="switch"
            aria-checked={value}
            onClick={() => handleValueChange(path, !value)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
              value ? "bg-indigo-600" : "bg-zinc-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                value ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </label>
      );
    }

    if (Array.isArray(value)) {
      return (
        <fieldset className="grid gap-3 rounded-lg border border-zinc-300 p-4">
          <legend className="px-1 text-sm font-semibold text-zinc-600">{fieldLabel}</legend>
          {value.map((item, index) => (
            <div key={`${path.join(".")}.${index}`}>
              {renderEditor(item, [...path, String(index)], `Item ${index + 1}`)}
            </div>
          ))}
        </fieldset>
      );
    }

    if (isJsonObject(value)) {
      return (
        <fieldset className="grid gap-3 rounded-lg border border-zinc-300 p-4">
          <legend className="px-1 text-sm font-semibold text-zinc-600">{fieldLabel}</legend>
          {Object.entries(value).map(([key, nestedValue]) => (
            <div key={`${path.join(".")}.${key}`}>{renderEditor(nestedValue, [...path, key])}</div>
          ))}
        </fieldset>
      );
    }

    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {fieldLabel} is null and is not editable in this view.
      </div>
    );
  };

  const renderCategorizedSections = () => {
    if (workflowData === null) {
      return null;
    }

    if (!isJsonObject(workflowData)) {
      return (
        <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-900">Workflow Fields</h2>
          {renderEditor(workflowData, [], "Root")}
        </section>
      );
    }

    const categorizedEntries: Record<CategoryKey, Array<[string, JsonValue]>> = {
      objects: [],
      lighting: [],
      camera: [],
      text: [],
    };
    const uncategorizedEntries: Array<[string, JsonValue]> = [];

    for (const [key, value] of Object.entries(workflowData)) {
      const category = inferCategoryForKey(key);
      if (category) {
        categorizedEntries[category].push([key, value]);
      } else {
        uncategorizedEntries.push([key, value]);
      }
    }

    return (
      <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900">Editable Workflow Fields</h2>
        <p className="text-sm text-zinc-600">
          Complex nested objects and arrays are fully editable. Expand sections to edit each category.
        </p>

        <div className="grid gap-3">
          {CATEGORY_DEFINITIONS.map((categoryDefinition) => {
            const entries = categorizedEntries[categoryDefinition.key];
            return (
              <details
                key={categoryDefinition.key}
                className="rounded-lg border border-zinc-300 bg-zinc-50 p-4"
                open={entries.length > 0}
              >
                <summary className="cursor-pointer text-base font-semibold text-zinc-800">
                  {categoryDefinition.title} ({entries.length})
                </summary>
                <div className="mt-4 grid gap-3">
                  {entries.length === 0 ? (
                    <p className="text-sm text-zinc-500">No matching fields in uploaded JSON.</p>
                  ) : (
                    entries.map(([key, value]) => (
                      <div key={key}>{renderEditor(value, [key], formatKeyLabel(key))}</div>
                    ))
                  )}
                </div>
              </details>
            );
          })}

          <details className="rounded-lg border border-zinc-300 bg-zinc-50 p-4" open>
            <summary className="cursor-pointer text-base font-semibold text-zinc-800">
              Other Properties ({uncategorizedEntries.length})
            </summary>
            <div className="mt-4 grid gap-3">
              {uncategorizedEntries.length === 0 ? (
                <p className="text-sm text-zinc-500">No uncategorized fields.</p>
              ) : (
                uncategorizedEntries.map(([key, value]) => {
                  const path = isNumericString(key) ? [String(Number(key))] : [key];
                  return <div key={key}>{renderEditor(value, path, formatKeyLabel(key))}</div>;
                })
              )}
            </div>
          </details>
        </div>
      </section>
    );
  };

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10">
      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-900">Generate JSON Prompts</h2>
          <p className="text-sm text-zinc-600">
            Click a prompt to copy it to your clipboard, then paste it into your AI tool.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {promptButtons.map((button, idx) => {
              const isCopied = promptCopiedIndex === idx;
              return (
                <button
                  key={button.label}
                  type="button"
                  onClick={async () => {
                    await copyTextToClipboardWithFallback(button.promptText);
                    setPromptCopiedIndex(idx);
                    window.setTimeout(() => setPromptCopiedIndex(null), 1500);
                  }}
                  className="rounded-lg bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>{isCopied ? "Copied!" : button.label}</span>
                    <span aria-hidden="true" className="text-zinc-400">
                      ↵
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <header className="grid gap-2">
          <h1 className="text-3xl font-bold text-zinc-900">Nano Banana 2 Visual JSON Editor</h1>
          <p className="text-zinc-600">
            Paste your workflow JSON, edit values in a form view, then copy the updated JSON.
          </p>
        </header>

        <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="grid gap-2">
            <label htmlFor="workflowJsonInput" className="text-sm font-semibold text-zinc-700">
              Paste workflow JSON
            </label>
            <textarea
              id="workflowJsonInput"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData("text") ?? "";
                if (!pasted.trim()) return;
                // Keyboard-only UX: parse immediately after paste.
                setJsonText(pasted);
                handleLoadJson(pasted);
              }}
              rows={14}
              className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm outline-none ring-indigo-500 focus:ring-2"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-300"
                onClick={() => handleLoadJson(jsonText)}
              >
                Load JSON
              </button>
              {errorMessage && (
                <div
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {errorMessage}
                </div>
              )}
            </div>
          </div>

        </section>

        {workflowData !== null && (
          <>
            {renderCategorizedSections()}

            <div className="grid gap-3">
              <button
                type="button"
                onClick={copyUpdatedJsonToClipboard}
                className="rounded-lg bg-indigo-600 px-6 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-300"
              >
                Copy to Clipboard
              </button>
              <div aria-live="polite" className="min-h-[1.25rem] text-sm text-zinc-600">
                {copyStatus ? copyStatus : "\u00A0"}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

*/
