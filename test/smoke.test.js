// test/smoke.test.js
// Optionaler Smoke-Test gegen die ECHTE adesso AI Hub API.
// Läuft nur wenn ADESSO_AI_HUB_KEY gesetzt ist – ansonsten übersprungen.
// Zweck: verifiziert dass Endpunkt, Auth und Response-Format noch stimmen.
//
// Ausführung lokal:  ADESSO_AI_HUB_KEY=sk-... node --test test/smoke.test.js
// In CI:             automatisch wenn Repository-Secret gesetzt ist

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { callAiHub } = require("../scripts/update-docs.js");

const apiKey = process.env.ADESSO_AI_HUB_KEY;
const skip = !apiKey;

test(
  "Smoke: echter API-Call gibt Text zurück",
  { skip: skip && "ADESSO_AI_HUB_KEY nicht gesetzt" },
  async () => {
    const result = await callAiHub(
      {
        apiKey,
        model: "claude-sonnet-4-6",
        maxDiffChars: 60000,
      },
      "# Test-Doku",
      "diff --git a/hello.js b/hello.js\n" +
        "+console.log('hi');\n",
      fetch
    );
    assert.equal(typeof result, "string");
    assert.ok(result.length > 0, "Antwort darf nicht leer sein");
  }
);
