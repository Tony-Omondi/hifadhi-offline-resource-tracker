# Zetech Forge 2026: submission notes

Software Development track · Challenge B: Offline-First Resource Tracker (Intermediate)

> Fill in every line marked **TODO** before submitting. Remove this note when done.

## Links

| Item | Link |
|---|---|
| GitHub repository | **TODO** |
| Live demo (HTTPS) | **TODO** |
| Health check | **TODO**`/health` |
| Demo video (2–3 min) | **TODO** (script: [DEMO_SCRIPT.md](DEMO_SCRIPT.md)) |
| Test and deploy evidence | [docs/evidence/](evidence/) plus a screenshot of the PrimeCloud dashboard and `curl https://<url>/health` (**TODO** after deploy) |

## Team

| Name | Role | Alumni/Finalist Collaborator? |
|---|---|---|
| **TODO** | | |
| **TODO** | | |
| **TODO** | | |
| **TODO** (optional 4th) | | |

### Alumni contribution note

**TODO.** Describe concretely what your alumni/finalist member did. For example: reviewed the conflict-resolution design, chose per-field LWW over whole-record LWW, ran the two-device conflict test, tested the app on a phone with flight mode, recorded the demo.

## SDG impact statement

**SDG 3 (Good Health and Well-being) and SDG 2 (Zero Hunger).**

Rural health centres and food-aid distribution points often run with weak or no mobile data. Paper stock cards get lost, and online-only tools stop working exactly when connectivity drops. The result is stock-outs of essentials such as antimalarials, ORS and zinc, therapeutic food and water purification tablets, plus expired stock that nobody noticed.

Hifadhi lets a nurse, pharmacist or aid worker record every receipt and dispense on a phone or tablet with no connection. The data is safe on the device and syncs exactly once when any signal returns, even if the connection drops halfway. When two people at different points update the same item offline, both updates are kept or reconciled automatically. Low-stock and expiry warnings surface on the device itself, without waiting for a sync. Accurate, timely stock data supports SDG target 3.8 (access to essential medicines) and target 2.1 (access to safe, nutritious food), and gives district stores a reliable picture for resupply.

## Technology stack

React 19 + Vite + Tailwind CSS 4 with IndexedDB and a service worker (frontend) · Django 5.2 + Django REST Framework (sync API) · SQLite or Postgres · Docker (one container) · pytest, Vitest, Playwright for tests.

## AI-tool disclosure

**TODO: review and adjust to what actually happened.**

- **Tool:** Claude Code (Anthropic, model Claude Opus 5.5), used as a coding assistant in the terminal.
- **What it did:** generated most of the code: the Django sync backend, the conflict-resolution module, the IndexedDB queue and sync engine, the React UI, the service worker, the test suites (backend, frontend, end-to-end), the sample data and the first draft of this documentation. It also picked the icon set from Icons8 through Icons8's MCP tool.
- **Roughly how much:** an estimated **TODO %** of the code was AI-generated.
- **What the team did:** **TODO.** For example: set the requirements and build order, chose the stack, reviewed and ran the code, tested it on phones, wrote or edited the SDG statement, recorded the demo, deployed to PrimeCloud.
- **Pretrained models or external AI APIs in the product itself:** none. The app makes no AI calls.

## Known limitations

See the [Known limitations](../README.md#known-limitations) section of the README.

## Dependencies and licences

See [Third-party licences](../README.md#third-party-licences) in the README. No sponsor APIs or external datasets are used.
