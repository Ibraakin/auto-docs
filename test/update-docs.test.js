// test/update-docs.test.js
// Unit-Tests für scripts/update-docs.js – nutzt Node's eingebauten
// Test-Runner (node --test), keine externen Dependencies nötig.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULTS,
  buildSystemPrompt,
  buildUserPrompt,
  resolveConfig,
  extractContent,
  callAiHub,
} = require("../scripts/update-docs.js");

// --- resolveConfig ---------------------------------------------------

test("resolveConfig: übernimmt alle Env-Variablen", () => {
  const cfg = resolveConfig({
    ADESSO_AI_HUB_KEY: "sk-test",
    DOCS_PATH: "custom/DOCS.md",
    MODEL: "claude-opus-4-6",
    MAX_DIFF_CHARS: "30000",
  });
  assert.equal(cfg.apiKey, "sk-test");
  assert.equal(cfg.docsPath, "custom/DOCS.md");
  assert.equal(cfg.model, "claude-opus-4-6");
  assert.equal(cfg.maxDiffChars, 30000);
});

test("resolveConfig: nutzt Defaults wenn Env leer ist", () => {
  const cfg = resolveConfig({ ADESSO_AI_HUB_KEY: "sk-test" });
  assert.equal(cfg.docsPath, DEFAULTS.docsPath);
  assert.equal(cfg.model, DEFAULTS.model);
  assert.equal(cfg.maxDiffChars, DEFAULTS.maxDiffChars);
});

test("resolveConfig: apiKey darf leer bleiben (Fehlerfall)", () => {
  const cfg = resolveConfig({});
  assert.equal(cfg.apiKey, undefined);
});

test("resolveConfig: ungültige MAX_DIFF_CHARS fällt auf Default", () => {
  const cfg = resolveConfig({
    ADESSO_AI_HUB_KEY: "sk-test",
    MAX_DIFF_CHARS: "keine-zahl",
  });
  assert.equal(cfg.maxDiffChars, DEFAULTS.maxDiffChars);
});

// --- buildSystemPrompt -----------------------------------------------

test("buildSystemPrompt: enthält deutsche Anweisungen", () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /technischer Redakteur/);
  assert.match(prompt, /Sprache \(Deutsch\)/);
  assert.match(prompt, /ohne Code-Fences/);
});

test("buildSystemPrompt: ist deterministisch", () => {
  assert.equal(buildSystemPrompt(), buildSystemPrompt());
});

// --- buildUserPrompt -------------------------------------------------

test("buildUserPrompt: enthält bestehende Doku und Diff", () => {
  const prompt = buildUserPrompt(
    "# Meine Doku",
    "diff --git a/x b/x",
    60000
  );
  assert.match(prompt, /AKTUELLE DOKUMENTATION:/);
  assert.match(prompt, /# Meine Doku/);
  assert.match(prompt, /PULL-REQUEST-DIFF:/);
  assert.match(prompt, /diff --git a\/x b\/x/);
});

test("buildUserPrompt: leere Doku zeigt Platzhalter-Hinweis", () => {
  const prompt = buildUserPrompt("", "diff x", 60000);
  assert.match(prompt, /noch keine Dokumentation vorhanden/);
});

test("buildUserPrompt: kürzt zu lange Diffs auf maxDiffChars", () => {
  const bigDiff = "x".repeat(100000);
  const prompt = buildUserPrompt("docs", bigDiff, 5000);
  // Der Diff-Teil im Prompt darf max maxDiffChars Zeichen sein
  const diffPart = prompt.split("PULL-REQUEST-DIFF:\n")[1];
  assert.equal(diffPart.length, 5000);
});

test("buildUserPrompt: kürzt nicht wenn Diff kleiner als Limit", () => {
  const prompt = buildUserPrompt("d", "kurzer diff", 60000);
  const diffPart = prompt.split("PULL-REQUEST-DIFF:\n")[1];
  assert.equal(diffPart, "kurzer diff");
});

// --- extractContent --------------------------------------------------

test("extractContent: liest gültige API-Antwort und trimmt", () => {
  const response = {
    choices: [
      { message: { content: "  # Neue Doku\n\ninhalt\n\n" } },
    ],
  };
  assert.equal(extractContent(response), "# Neue Doku\n\ninhalt\n");
});

test("extractContent: wirft bei leerem Content", () => {
  assert.throws(
    () => extractContent({ choices: [{ message: { content: "" } }] }),
    /Keine Textantwort/
  );
});

test("extractContent: wirft bei fehlender choices-Struktur", () => {
  assert.throws(() => extractContent({}), /Keine Textantwort/);
  assert.throws(
    () => extractContent({ choices: [] }),
    /Keine Textantwort/
  );
  assert.throws(
    () => extractContent({ choices: [{}] }),
    /Keine Textantwort/
  );
});

test("extractContent: wirft bei null/undefined", () => {
  assert.throws(() => extractContent(null), /Keine Textantwort/);
  assert.throws(() => extractContent(undefined), /Keine Textantwort/);
});

// --- callAiHub mit Mock-fetch ----------------------------------------

function makeMockFetch(responseData, ok = true, status = 200) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok,
      status,
      async json() {
        return responseData;
      },
      async text() {
        return typeof responseData === "string"
          ? responseData
          : JSON.stringify(responseData);
      },
    };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

test("callAiHub: sendet Request mit korrekten Headern", async () => {
  const mock = makeMockFetch({
    choices: [{ message: { content: "# Doku\n" } }],
  });
  await callAiHub(
    {
      apiKey: "sk-test123",
      model: "claude-sonnet-4-6",
      maxDiffChars: 60000,
    },
    "alte doku",
    "diff",
    mock
  );

  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0];
  assert.equal(call.url, DEFAULTS.endpoint);
  assert.equal(call.opts.method, "POST");
  assert.equal(
    call.opts.headers.Authorization,
    "Bearer sk-test123"
  );
  assert.equal(call.opts.headers["Content-Type"], "application/json");
});

test("callAiHub: sendet Modell und Prompts im Body", async () => {
  const mock = makeMockFetch({
    choices: [{ message: { content: "docs" } }],
  });
  await callAiHub(
    {
      apiKey: "sk",
      model: "claude-opus-4-6",
      maxDiffChars: 60000,
    },
    "bestehende",
    "diff-x",
    mock
  );

  const body = JSON.parse(mock.calls[0].opts.body);
  assert.equal(body.model, "claude-opus-4-6");
  assert.equal(body.max_tokens, DEFAULTS.maxTokens);
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].role, "user");
  assert.match(body.messages[1].content, /bestehende/);
  assert.match(body.messages[1].content, /diff-x/);
});

test("callAiHub: gibt bereinigte Antwort zurück", async () => {
  const mock = makeMockFetch({
    choices: [{ message: { content: "  aktualisierte doku  \n\n" } }],
  });
  const result = await callAiHub(
    { apiKey: "sk", model: "m", maxDiffChars: 60000 },
    "old",
    "diff",
    mock
  );
  assert.equal(result, "aktualisierte doku\n");
});

test("callAiHub: wirft bei HTTP-Fehler mit Status", async () => {
  const mock = makeMockFetch("Rate limit exceeded", false, 429);
  await assert.rejects(
    () =>
      callAiHub(
        { apiKey: "sk", model: "m", maxDiffChars: 60000 },
        "",
        "diff",
        mock
      ),
    /adesso AI Hub Fehler: 429/
  );
});

test("callAiHub: wirft bei HTTP 401 (falscher Key)", async () => {
  const mock = makeMockFetch("Unauthorized", false, 401);
  await assert.rejects(
    () =>
      callAiHub(
        { apiKey: "invalid", model: "m", maxDiffChars: 60000 },
        "",
        "diff",
        mock
      ),
    /adesso AI Hub Fehler: 401/
  );
});
