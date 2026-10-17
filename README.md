# Bonsai

A React app for exploring and pruning JSON in a bottom-rooted tree or list, with separate expansion and inclusion controls, a live preview, and export. Supports multiple files independently. Imported data stays in your browser.

Live: **https://martinhundrup.com/bonsai/**

From macOS, Linux, or Windows with Node.js **22.12 or newer**:

```sh
cd web
npm ci
npm run dev
```

Open **http://localhost:3000**. `npm test` runs regression tests; `npm run build` produces the static website in `web/dist`. On Windows, `./start.ps1` is also available after installing dependencies.

The primary deployment uses Wrangler to publish only `martinhundrup.com/bonsai` and `martinhundrup.com/bonsai/*`, leaving the root for a future main website. From `web`, use `npm run cf:login`, `npm run cf:check`, then `npm run deploy`. Run `npm run cf:preview` to test the deployment locally at `http://localhost:8787/bonsai/`.

The static build also works on Cloudflare Pages, Hostinger, or any static host. A ready-to-upload archive is in `web/artifacts/bonsai-static.zip`. See the [app README](web/README.md) for deployment steps, DNS requirements, controls, and data limits.
