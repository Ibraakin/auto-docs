// scripts/update-docs.js
// Ruft den adesso AI Hub (OpenAI-kompatible API) auf und aktualisiert
// die Projektdokumentation anhand des Pull-Request-Diffs.
//
// Erwartete Umgebungsvariablen (werden vom Reusable Workflow gesetzt):
//   ADESSO_AI_HUB_KEY   - API Key
//   DOCS_PATH           - Zielpfad, z.B. "docs/DOCUMENTATION.md"
//   MODEL               - z.B. "claude-sonnet-4-6"
//   MAX_DIFF_CHARS      - z.B. 60000
//
// Erwartete Input-Dateien (im Working Directory):
//   pr.diff             - Diff des PRs gegen den Base-Branch
//   existing_docs.md    - aktuelle Doku (leer wenn noch keine existiert)

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  docsPath: "docs/DOCUMENTATION.md",
  model: "claude-sonnet-4-6",
  maxDiffChars: 60000,
  endpoint: "https://adesso-ai-hub.3asabc.de/v1/chat/completions",
  maxTokens: 8000,
};

// --- Pure Funktionen (testbar ohne IO / Netzwerk) --------------------

function buildSystemPrompt() {
  return (
    "Du bist ein technischer Redakteur. Du bekommst die aktuelle " +
    "Projektdokumentation (Markdown, auf Deutsch) und den Diff eines " +
    "Pull Requests.\n" +
    "Aktualisiere die Dokumentation so, dass sie den neuen Code-Stand " +
    "korrekt beschreibt:\n" +
    "- Ergänze neue Abschnitte für neue Features/Module/Endpunkte\n" +
    "- Passe veraltete Beschreibungen an\n" +
    "- Entferne Beschreibungen für entfernten Code\n" +
    "- Behalte Struktur, Ton und Sprache (Deutsch) bei\n" +
    "- Gib AUSSCHLIESSLICH das vollständige, aktualisierte Markdown-" +
    "Dokument zurück, ohne Erklärungen, ohne Code-Fences."
  );
}

function buildUserPrompt(existingDocs, diff, maxDiffChars) {
  return (
    "AKTUELLE DOKUMENTATION:\n" +
    (existingDocs ||
      "(noch keine Dokumentation vorhanden – bitte aus dem Diff eine " +
      "sinnvolle Grundstruktur ableiten)") +
    "\n\nPULL-REQUEST-DIFF:\n" +
    diff.slice(0, maxDiffChars)
  );
}

function resolveConfig(env) {
  return {
    apiKey: env.ADESSO_AI_HUB_KEY,
    docsPath: env.DOCS_PATH || DEFAULTS.docsPath,
    model: env.MODEL || DEFAULTS.model,
    maxDiffChars:
      Number(env.MAX_DIFF_CHARS) || DEFAULTS.maxDiffChars,
  };
}

function extractContent(apiResponse) {
  const text =
    apiResponse &&
    apiResponse.choices &&
    apiResponse.choices[0] &&
    apiResponse.choices[0].message &&
    apiResponse.choices[0].message.content;

  if (!text) {
    throw new Error("Keine Textantwort vom adesso AI Hub erhalten.");
  }
  return text.trim() + "\n";
}

async function callAiHub(config, existingDocs, diff, fetchFn) {
  const body = {
    model: config.model,
    max_tokens: DEFAULTS.maxTokens,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserPrompt(
          existingDocs,
          diff,
          config.maxDiffChars
        ),
      },
    ],
  };

  const response = await fetchFn(DEFAULTS.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `adesso AI Hub Fehler: ${response.status} ${errText}`
    );
  }

  const data = await response.json();
  return extractContent(data);
}

// --- IO-Wrapper (nur beim direkten Ausführen) ------------------------

async function main() {
  const config = resolveConfig(process.env);

  if (!config.apiKey) {
    throw new Error(
      "ADESSO_AI_HUB_KEY ist nicht gesetzt. Bitte im Ziel-Repo unter " +
      "Settings → Secrets and variables → Actions als Repository " +
      "Secret anlegen."
    );
  }

  const diff = fs.existsSync("pr.diff")
    ? fs.readFileSync("pr.diff", "utf8")
    : "";
  const existingDocs = fs.existsSync("existing_docs.md")
    ? fs.readFileSync("existing_docs.md", "utf8")
    : "";

  if (!diff.trim()) {
    console.log("Kein Diff vorhanden – überspringe.");
    return;
  }

  console.log(`Rufe adesso AI Hub auf (Modell: ${config.model})...`);

  const updatedDocs = await callAiHub(
    config,
    existingDocs,
    diff,
    fetch
  );

  fs.mkdirSync(path.dirname(config.docsPath), { recursive: true });
  fs.writeFileSync(config.docsPath, updatedDocs);
  console.log(`${config.docsPath} erfolgreich aktualisiert.`);
}

module.exports = {
  DEFAULTS,
  buildSystemPrompt,
  buildUserPrompt,
  resolveConfig,
  extractContent,
  callAiHub,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
