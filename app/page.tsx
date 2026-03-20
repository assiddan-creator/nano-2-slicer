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
    const sanitizedText = text
      // Common invisible characters from copy/paste and chat tools.
      .replace(/[\u00A0\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\uFEFF\u00AD\u061C]/g, " ");
    setErrorMessage(null);
    try {
      // Users often paste surrounding text (e.g. explanations, code fences).
      // Extract the first JSON object/array and parse only that block.
      const openObjIndex = sanitizedText.indexOf("{");
      const closeObjIndex = sanitizedText.lastIndexOf("}");
      const openArrIndex = sanitizedText.indexOf("[");
      const closeArrIndex = sanitizedText.lastIndexOf("]");

      const hasObject = openObjIndex !== -1 && closeObjIndex !== -1 && closeObjIndex >= openObjIndex;
      const hasArray = openArrIndex !== -1 && closeArrIndex !== -1 && closeArrIndex >= openArrIndex;

      if (!hasObject && !hasArray) {
        throw new Error("No JSON block found");
      }

      // If both exist in the messy string, parse the one that starts first.
      let extracted: string;
      if (hasObject && (!hasArray || openObjIndex <= openArrIndex)) {
        extracted = sanitizedText.slice(openObjIndex, closeObjIndex + 1);
      } else {
        extracted = sanitizedText.slice(openArrIndex, closeArrIndex + 1);
      }

      const parsed = JSON.parse(extracted) as JsonValue;
      setWorkflowData(parsed);
    } catch {
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
