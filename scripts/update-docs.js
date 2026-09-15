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
// Erwartete Input-Dateien:
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

async function main() {
  const apiKey = process.env.ADESSO_AI_HUB_KEY;
  if (!apiKey) {
    throw new Error(
      "ADESSO_AI_HUB_KEY ist nicht gesetzt. Bitte im Ziel-Repo unter " +
      "Settings → Secrets and variables → Actions als Repository " +
      "Secret anlegen."
    );
  }

  const docsPath = process.env.DOCS_PATH || DEFAULTS.docsPath;
  const model = process.env.MODEL || DEFAULTS.model;
  const maxDiffChars =
    Number(process.env.MAX_DIFF_CHARS) || DEFAULTS.maxDiffChars;

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

  const systemPrompt =
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
    "Dokument zurück, ohne Erklärungen, ohne Code-Fences.";

  const userPrompt =
    "AKTUELLE DOKUMENTATION:\n" +
    (existingDocs ||
      "(noch keine Dokumentation vorhanden – bitte aus dem Diff eine " +
      "sinnvolle Grundstruktur ableiten)") +
    "\n\nPULL-REQUEST-DIFF:\n" +
    diff.slice(0, maxDiffChars);

  console.log(`Rufe adesso AI Hub auf (Modell: ${model})...`);

  const response = await fetch(DEFAULTS.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: DEFAULTS.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `adesso AI Hub Fehler: ${response.status} ${errText}`
    );
  }

  const data = await response.json();
  const text =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (!text) {
    throw new Error("Keine Textantwort vom adesso AI Hub erhalten.");
  }

  fs.mkdirSync(path.dirname(docsPath), { recursive: true });
  fs.writeFileSync(docsPath, text.trim() + "\n");
  console.log(`${docsPath} erfolgreich aktualisiert.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
