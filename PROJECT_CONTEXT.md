# Project Context

## Purpose

This repository publishes a customized version of UXUX11's Funbox LINE draw page for personal mobile use. It keeps the original store and draw-link data while adding an iPhone-oriented continuous draw flow.

## Source and deployment

- Upstream: <https://github.com/UXUX11/funbox-line>
- Repository: <https://github.com/lockgipo/funbox-line-private>
- Production: <https://lockgipo.github.io/funbox-line-private/>
- Hosting: GitHub Pages from the repository's `main` branch

## Custom behavior

- `custom/continuous-draw.js`: continuous LINE handoff, automatic return handling, 0.7-second stop overlay, completed-item tracking, skip/restore store, undo, city/product/time filtering, and store start-time protection
- `custom/continuous-draw-ui.html`: custom controls and usage guide
- `custom/continuous-draw.css`: custom presentation

Browser progress is stored in `localStorage`; clearing Safari or LINE browser site data removes it.

## Upstream synchronization

- `tools/sync-upstream.mjs` downloads the upstream `index.html`, validates its structure and scripts, injects the custom module, and verifies link identity and order.
- `tools/upstream-baseline.json` records the last manually reviewed upstream script hashes.
- `.github/workflows/check-upstream.yml` checks upstream approximately hourly and commits only validated `index.html` changes.
- If upstream scripts or required structure change, synchronization must stop. Review the upstream change, adapt the custom module when needed, then update the baseline hashes.

## Current reviewed upstream

- Reviewed: 2026-09-11
- Campaign heading: `9/11 9/12抽陀螺`
- 42 stores and 198 unique draw links
- Upstream time filters and store-level start times are supported

## Validation before deployment

1. Run `node --check custom/continuous-draw.js` and `node --check tools/sync-upstream.mjs`.
2. Run `node tools/sync-upstream.mjs --check-only`.
3. Run `node tools/sync-upstream.mjs --apply` and confirm the generated page preserves all upstream draw links.
4. Browser-test city, product and time filters, pre-start lockout, automatic return flow, stop overlay, skip store and undo.
5. Commit and push to `origin/main`; verify GitHub Actions and GitHub Pages complete successfully.

