# auto-docs

Zentrale Auto-Dokumentations-Pipeline für adesso-Projekte.
Aktualisiert bei jedem Pull Request automatisch die Projektdoku, indem
der PR-Diff durch den **adesso AI Hub** (Claude) geschickt wird.

## Einbindung in ein eigenes Projekt

### 1. Secret einrichten

Im Ziel-Repo unter **Settings → Secrets and variables → Actions → New
repository secret**:

| Name | Wert |
|---|---|
| `ADESSO_AI_HUB_KEY` | Dein API Key aus https://adesso-ai-hub.3asabc.de (Menü *My Keys*) |

Jeder Entwickler kann sich seinen eigenen Free-Key generieren –
der Workflow läuft aber immer nur mit einem Key pro Repo.

### 2. Workflow-Datei anlegen

Erstelle im Ziel-Repo die Datei `.github/workflows/update-docs.yml` mit
folgendem Inhalt:

```yaml
name: Update Documentation

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

jobs:
  docs:
    uses: Ibraakin/auto-docs/.github/workflows/update-docs.yml@main
    secrets:
      ADESSO_AI_HUB_KEY: ${{ secrets.ADESSO_AI_HUB_KEY }}
```

Das war's. Ab dem nächsten PR gegen `main` wird die Doku automatisch in
`docs/DOCUMENTATION.md` aktualisiert und in den PR-Branch committed.

### 3. (Optional) Andere Doku-Datei oder anderes Modell

Alle Parameter haben Defaults. Falls du sie überschreiben willst:

```yaml
jobs:
  docs:
    uses: Ibraakin/auto-docs/.github/workflows/update-docs.yml@main
    with:
      docs_path: "docs/PROJEKT_DOKU.md"     # Default: docs/DOCUMENTATION.md
      model: "claude-opus-4-6"              # Default: claude-sonnet-4-6
      max_diff_chars: 80000                 # Default: 60000
    secrets:
      ADESSO_AI_HUB_KEY: ${{ secrets.ADESSO_AI_HUB_KEY }}
```

## Was passiert bei jedem PR

1. Der Workflow checkt den PR-Branch aus
2. Ermittelt den Diff gegen den Base-Branch (`main`)
3. Lädt die aktuelle Doku (falls vorhanden)
4. Schickt beides an den adesso AI Hub (`claude-sonnet-4-6` per Default)
5. Bekommt die aktualisierte Markdown-Doku zurück
6. Committed sie in den PR-Branch (Author: `docs-bot`)

Wenn sich nichts an der Doku ändert, wird auch nichts committed.

## Wartung

- **Änderung an der Prompt/Logik**: nur eine Änderung in `scripts/update-docs.js`
  in diesem Repo – wirkt sofort für alle Projekte beim nächsten PR-Lauf
- **Neue Version des Workflows**: alle Ziel-Repos verweisen auf `@main`, ziehen
  also automatisch die aktuelle Version
- **Rollback**: einzelnes Repo kann per `@v1.0.0` auf eine getaggte Version
  fixiert werden

## Modelle im adesso AI Hub

Empfehlungen (Stand 2026):

| Modell | Kosten | Wann verwenden |
|---|---|---|
| `claude-sonnet-4-6` | ~$3.30 pro 1M Input-Token | **Standard** – schnell, gut, günstig |
| `claude-opus-4-6` | ~$5.50 pro 1M Input-Token | Sehr große / komplexe Diffs |
| `qwen-3.6-35b-sovereign` | kostenlos | Wenn du Free-Budget schonen willst |

Alle verfügbaren Modelle: https://adesso-ai-hub.3asabc.de → *Available Models*
