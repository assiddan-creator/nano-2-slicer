"use client";

import { ChangeEvent, useState } from "react";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

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

function updateValueAtPath(root: JsonValue, path: string[], nextValue: JsonValue): JsonValue {
  if (path.length === 0) {
    return nextValue;
  }

  const [head, ...tail] = path;

  if (Array.isArray(root)) {
    const index = Number(head);
    const cloned = [...root];
    cloned[index] = updateValueAtPath(cloned[index], tail, nextValue);
    return cloned;
  }

  if (isJsonObject(root)) {
    return {
      ...root,
      [head]: updateValueAtPath(root[head], tail, nextValue),
    };
  }

  return root;
}

export default function Home() {
  const [workflowData, setWorkflowData] = useState<JsonValue | null>(null);
  const [sourceFileName, setSourceFileName] = useState("workflow.json");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setErrorMessage(null);

    if (!selectedFile.name.toLowerCase().endsWith(".json")) {
      setWorkflowData(null);
      setErrorMessage("Only .json files are supported.");
      return;
    }

    try {
      const fileText = await selectedFile.text();
      const parsed = JSON.parse(fileText) as JsonValue;
      setWorkflowData(parsed);
      setSourceFileName(selectedFile.name);
    } catch {
      setWorkflowData(null);
      setErrorMessage("Invalid JSON file. Please upload a valid workflow file.");
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

  const downloadUpdatedJson = () => {
    if (workflowData === null) {
      return;
    }

    const jsonString = JSON.stringify(workflowData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = url;
    const baseName = sourceFileName.toLowerCase().endsWith(".json")
      ? sourceFileName.slice(0, -5)
      : sourceFileName;
    downloadAnchor.download = `${baseName || "workflow"}.updated.json`;
    downloadAnchor.click();
    URL.revokeObjectURL(url);
  };

  const renderEditor = (value: JsonValue, path: string[] = []): React.ReactNode => {
    if (typeof value === "string") {
      return (
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-zinc-700">{labelFromPath(path)}</span>
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
          <span className="text-sm font-semibold text-zinc-700">{labelFromPath(path)}</span>
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
          <span className="text-sm font-semibold text-zinc-700">{labelFromPath(path)}</span>
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
          <legend className="px-1 text-sm font-semibold text-zinc-600">{labelFromPath(path)}</legend>
          {value.map((item, index) => (
            <div key={`${path.join(".")}.${index}`}>{renderEditor(item, [...path, String(index)])}</div>
          ))}
        </fieldset>
      );
    }

    if (isJsonObject(value)) {
      return (
        <fieldset className="grid gap-3 rounded-lg border border-zinc-300 p-4">
          <legend className="px-1 text-sm font-semibold text-zinc-600">{labelFromPath(path)}</legend>
          {Object.entries(value).map(([key, nestedValue]) => (
            <div key={`${path.join(".")}.${key}`}>{renderEditor(nestedValue, [...path, key])}</div>
          ))}
        </fieldset>
      );
    }

    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {labelFromPath(path)} is null and is not editable in this view.
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10">
      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <header className="grid gap-2">
          <h1 className="text-3xl font-bold text-zinc-900">Nano Banana 2 Visual JSON Editor</h1>
          <p className="text-zinc-600">
            Upload a workflow JSON file, edit values in a form view, then download the updated file.
          </p>
        </header>

        <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-zinc-700">Upload workflow file (.json)</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white hover:file:bg-indigo-500"
            />
          </label>

          {errorMessage && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
        </section>

        {workflowData !== null && (
          <>
            <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-zinc-900">Editable Workflow Fields</h2>
              <div className="grid gap-4">{renderEditor(workflowData)}</div>
            </section>

            <button
              type="button"
              onClick={downloadUpdatedJson}
              className="rounded-lg bg-indigo-600 px-6 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-300"
            >
              Download Updated JSON
            </button>
          </>
        )}
      </div>
    </main>
  );
}
