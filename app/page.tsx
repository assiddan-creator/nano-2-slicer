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

import { useState, useCallback, useRef } from "react";

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

// ─── Field Editor ─────────────────────────────────────────────────────────────

interface FieldProps {
  path: string[];
  keyName: string;
  value: JsonValue;
  onChange: (path: string[], newVal: JsonValue) => void;
  onDelete: (path: string[]) => void;
  depth: number;
}

function FieldEditor({
  path,
  keyName,
  value,
  onChange,
  onDelete,
  depth,
}: FieldProps) {
  const [collapsed, setCollapsed] = useState(false);
  const indent = depth * 16;

  const handlePrimitive = (raw: string) => {
    if (raw === "true") return onChange(path, true);
    if (raw === "false") return onChange(path, false);
    if (raw === "null") return onChange(path, null);
    const num = Number(raw);
    if (!isNaN(num) && raw.trim() !== "") return onChange(path, num);
    onChange(path, raw);
  };

  const labelCls =
    "text-xs font-mono font-semibold tracking-wide truncate max-w-[140px]";

  const keyLabel = (
    <span
      className={`${labelCls} ${
        depth === 0
          ? "text-yellow-300"
          : depth === 1
            ? "text-emerald-300"
            : "text-sky-300"
      }`}
    >
      {keyName}
    </span>
  );

  const deleteBtn = (
    <button
      onClick={() => onDelete(path)}
      title="מחק שדה"
      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity
                 text-rose-400 hover:text-rose-200 text-xs font-bold leading-none
                 focus:outline-none focus:opacity-100"
      aria-label={`מחק ${keyName}`}
    >
      ✕
    </button>
  );

  // ── Object ──
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as JsonObject;
    return (
      <div style={{ marginLeft: indent }} className="my-1">
        <div className="flex items-center gap-1 group">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-zinc-400 hover:text-white focus:outline-none text-xs w-4 text-center"
            aria-expanded={!collapsed}
          >
            {collapsed ? "▶" : "▼"}
          </button>
          {keyLabel}
          <span className="text-zinc-500 text-xs ml-1">
            {"{"}
            {Object.keys(obj).length}
            {"}"}
          </span>
          {deleteBtn}
        </div>
        {!collapsed && (
          <div className="border-l border-zinc-700 ml-2 pl-2 mt-1">
            {Object.entries(obj).map(([k, v]) => (
              <FieldEditor
                key={k}
                path={[...path, k]}
                keyName={k}
                value={v}
                onChange={onChange}
                onDelete={onDelete}
                depth={depth + 1}
              />
            ))}
            <AddFieldRow path={path} value={obj} onChange={onChange} />
          </div>
        )}
      </div>
    );
  }

  // ── Array ──
  if (Array.isArray(value)) {
    return (
      <div style={{ marginLeft: indent }} className="my-1">
        <div className="flex items-center gap-1 group">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-zinc-400 hover:text-white focus:outline-none text-xs w-4 text-center"
            aria-expanded={!collapsed}
          >
            {collapsed ? "▶" : "▼"}
          </button>
          {keyLabel}
          <span className="text-zinc-500 text-xs ml-1">[{value.length}]</span>
          {deleteBtn}
        </div>
        {!collapsed && (
          <div className="border-l border-zinc-700 ml-2 pl-2 mt-1">
            {value.map((item, i) => (
              <FieldEditor
                key={i}
                path={[...path, String(i)]}
                keyName={String(i)}
                value={item}
                onChange={onChange}
                onDelete={onDelete}
                depth={depth + 1}
              />
            ))}
            <button
              onClick={() => {
                const newArr = [...value, ""];
                onChange(path, newArr);
              }}
              className="mt-1 text-xs text-zinc-400 hover:text-yellow-300
                         focus:outline-none focus:text-yellow-300 transition-colors"
            >
              + הוסף פריט
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Primitive ──
  const strVal = value === null ? "null" : String(value);
  const isLong = typeof value === "string" && value.length > 60;
  const isColorHexString =
    typeof value === "string" && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value as string);

  return (
    <div style={{ marginLeft: indent }} className="my-0.5 flex items-center gap-2 group">
      <span className="w-4" />
      {keyLabel}
      <span className="text-zinc-600 text-xs">:</span>
      {isColorHexString ? (
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-shrink-0">
            <input
              type="color"
              defaultValue={value as string}
              onBlur={(e) => onChange(path, e.target.value)}
              onChange={(e) => onChange(path, e.target.value)}
              className="w-8 h-7 rounded cursor-pointer border border-zinc-600 bg-transparent p-0.5 focus:outline-none focus:border-yellow-400"
              title="בחר צבע"
            />
          </div>
          <input
            type="text"
            defaultValue={value as string}
            onBlur={(e) => onChange(path, e.target.value)}
            className="flex-1 bg-zinc-800 text-zinc-100 text-xs font-mono rounded px-2 py-1 border border-zinc-700 focus:border-yellow-400 focus:outline-none h-7"
            dir="ltr"
          />
          <div
            className="w-7 h-7 rounded border border-zinc-600 flex-shrink-0"
            style={{ backgroundColor: value as string }}
            title={value as string}
          />
        </div>
      ) : isLong ? (
        <textarea
          defaultValue={strVal}
          onBlur={(e) => handlePrimitive(e.target.value)}
          rows={2}
          className="flex-1 bg-zinc-800 text-zinc-100 text-xs font-mono rounded
                     px-2 py-1 border border-zinc-700 focus:border-yellow-400
                     focus:outline-none resize-y min-h-[40px]"
          dir="auto"
        />
      ) : (
        <input
          type="text"
          defaultValue={strVal}
          onBlur={(e) => handlePrimitive(e.target.value)}
          className="flex-1 bg-zinc-800 text-zinc-100 text-xs font-mono rounded
                     px-2 py-1 border border-zinc-700 focus:border-yellow-400
                     focus:outline-none h-7"
          dir="auto"
        />
      )}
      {typeof value === "boolean" && (
        <button
          onClick={() => onChange(path, !value)}
          className={`text-xs px-2 py-0.5 rounded font-mono font-bold border
            transition-colors focus:outline-none
            ${
              value
                ? "border-emerald-500 text-emerald-300 hover:bg-emerald-900"
                : "border-zinc-600 text-zinc-400 hover:bg-zinc-700"
            }`}
        >
          {value ? "true" : "false"}
        </button>
      )}
      {deleteBtn}
    </div>
  );
}

// ─── Add Field Row ─────────────────────────────────────────────────────────────

function AddFieldRow({
  path,
  value,
  onChange,
}: {
  path: string[];
  value: JsonObject;
  onChange: (path: string[], newVal: JsonValue) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const k = newKey.trim();
    if (!k) return;
    let parsed: JsonValue = newVal;
    if (newVal === "true") parsed = true;
    else if (newVal === "false") parsed = false;
    else if (newVal === "null") parsed = null;
    else if (!isNaN(Number(newVal)) && newVal.trim() !== "") parsed = Number(newVal);
    onChange(path, { ...value, [k]: parsed });
    setNewKey("");
    setNewVal("");
    setAdding(false);
  };

  if (!adding) {
    return (
      <button
        onClick={() => {
          setAdding(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="mt-1 text-xs text-zinc-500 hover:text-yellow-300
                   focus:outline-none focus:text-yellow-300 transition-colors"
      >
        + הוסף שדה
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1 flex-wrap">
      <input
        ref={inputRef}
        value={newKey}
        onChange={(e) => setNewKey(e.target.value)}
        placeholder="מפתח"
        className="bg-zinc-800 text-zinc-100 text-xs font-mono rounded
                   px-2 py-1 border border-yellow-600 focus:outline-none w-28 h-7"
        dir="ltr"
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <span className="text-zinc-500 text-xs">:</span>
      <input
        value={newVal}
        onChange={(e) => setNewVal(e.target.value)}
        placeholder="ערך"
        className="bg-zinc-800 text-zinc-100 text-xs font-mono rounded
                   px-2 py-1 border border-yellow-600 focus:outline-none w-32 h-7"
        dir="auto"
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <button
        onClick={commit}
        className="text-xs px-2 py-1 bg-yellow-500 text-black font-bold rounded
                   hover:bg-yellow-400 focus:outline-none"
      >
        ✓
      </button>
      <button
        onClick={() => setAdding(false)}
        className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-200
                   focus:outline-none"
      >
        ביטול
      </button>
    </div>
  );
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
  const [copiedPrompt, setCopiedPrompt] = useState<number | null>(null);
  // kept for backward compatibility with earlier prompt-copy UX
  void copiedPrompt;
  void setCopiedPrompt;
  const [view, setView] = useState<"form" | "raw">("form");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("nb2_gemini_key") || "";
    } catch {
      return "";
    }
  });
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number>(0);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

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

  const handleChange = useCallback((path: string[], newVal: JsonValue) => {
    setData((prev) => deepSet(prev, path, newVal));
  }, []);

  const handleDelete = useCallback((path: string[]) => {
    setData((prev) => deepDelete(prev, path));
  }, []);

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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
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

  const handleGenerateImage = async () => {
    if (!imageBase64 || !geminiKey || !data) return;
    setLoadingGenerate(true);
    setGenerateError(null);
    setGeneratedImageUrl(null);
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Modify this image based on the following JSON. Change ONLY what is specified in the JSON values that differ from the original. Keep everything else 100% identical — same camera angle, same perspective, same lighting direction, same shadows, same room layout, same proportions.\n\nJSON:\n${jsonString}`,
                  },
                  { inline_data: { mime_type: imageFile!.type, data: imageBase64 } },
                ],
              },
            ],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
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

      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── COLUMN 1: Upload + Extract ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
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

            {/* Form/Raw toggle + Copy */}
            {data !== null && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg p-0.5 gap-0.5">
                    <button
                      onClick={() => setView("form")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors focus:outline-none ${
                        view === "form"
                          ? "bg-yellow-400 text-black"
                          : "text-zinc-400 hover:text-zinc-100"
                      }`}
                      type="button"
                    >
                      📋 טופס
                    </button>
                    <button
                      onClick={() => setView("raw")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors focus:outline-none ${
                        view === "raw"
                          ? "bg-yellow-400 text-black"
                          : "text-zinc-400 hover:text-zinc-100"
                      }`}
                      type="button"
                    >
                      {"{ }"} גולמי
                    </button>
                  </div>
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

                {view === "form" && (
                  <div className="bg-zinc-800 rounded-xl px-3 py-3 max-h-96 overflow-y-auto">
                    {Array.isArray(data) ? (
                      (data as JsonArray).map((item, i) => (
                        <FieldEditor
                          key={i}
                          path={[String(i)]}
                          keyName={String(i)}
                          value={item}
                          onChange={handleChange}
                          onDelete={handleDelete}
                          depth={0}
                        />
                      ))
                    ) : (
                      Object.entries(data as JsonObject).map(([k, v]) => (
                        <FieldEditor
                          key={k}
                          path={[k]}
                          keyName={k}
                          value={v}
                          onChange={handleChange}
                          onDelete={handleDelete}
                          depth={0}
                        />
                      ))
                    )}
                  </div>
                )}

                {view === "raw" && (
                  <pre
                    className="bg-zinc-800 rounded-xl px-3 py-3 text-xs text-zinc-300 overflow-auto max-h-96"
                    dir="ltr"
                  >
                    {JSON.stringify(data, null, 2)}
                  </pre>
                )}
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
