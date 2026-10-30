# MCI Platform — Prototype

This repository contains a minimal prototype of the Market & Competitive Intelligence (MCI) Platform described in the sitemap.

It includes:
- An Express backend (`server.js`) with endpoints to analyze a company and run a 5-company insurance sample.
- A simple AI client (`aiClient.js`) which runs in mock mode by default (no API keys required).
- A static frontend (`public/index.html`) with a search bar and demo tiles to run samples and view stored results.
- Sample output stored at `data/insurance_samples.json` (mocked results for five insurance companies).

Quick start (Windows PowerShell):

1. Install dependencies

```powershell
cd C:/Projects/AI_Factory/MCI
npm install
```

2. Run the server (mock mode by default)

```powershell
npm start
```

3. Open http://localhost:3000 in your browser.

Switching to real AI providers

- The `aiClient.js` file is the integration point. It currently returns mocked results when `MOCK=true` or when no `OPENAI_API_KEY`/`GROK_API_KEY` is present.
- To implement real calls, add code into `aiClient.generateAnalysis` to call the OpenAI or Grok APIs. Keep the same output shape to avoid breaking the frontend.

Environment variables

- `MOCK=true` forces mock mode even if API keys are present.
- `OPENAI_API_KEY` and/or `GROK_API_KEY` can be used later for real integrations.

Next steps (recommended)

- Wire up a real OpenAI / Grok integration and map the responses into the structured shape used by `aiClient`.
- Expand the frontend with the full pages in the sitemap (Platform tour, Products, Solutions by Role & Industry, Resources, Company pages, Pricing, etc.).
- Add authentication, storage in a DB (Postgres/Firestore), and background workers for long-running analysis jobs.

