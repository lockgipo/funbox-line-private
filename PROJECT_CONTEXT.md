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

- `tools/sync-upstream.mjs` downloads the upstream `index.html`, validates its structure and scripts, injects the custom module, and verifies link identity and order. It accepts both legacy `.draw-link[href]` links and the current row-level `data-draw-href` format.
- `tools/upstream-baseline.json` records the last manually reviewed upstream script hashes.
- `.github/workflows/check-upstream.yml` checks upstream approximately hourly and commits only validated `index.html` changes.
- If upstream scripts or required structure change, synchronization must stop. Review the upstream change, adapt the custom module when needed, then update the baseline hashes.

## Current reviewed upstream

- Reviewed: 2026-09-12
- Campaign heading: `9/11 9/12抽陀螺`
- 71 stores and 378 draw links
- Upstream time filters and store-level start times are supported
- Upstream's new manual/automatic row mode was reviewed. The upstream mode panel is replaced by this project's controls, and `window.funboxDrawMode` remains manual so a list-row tap opens only that item; this project's 0.7-second automatic chain remains independent.

## Validation before deployment

The owner does not require a manual preview or approval round for future updates to this project. After the automated checks below pass, publish directly to production and verify the deployed result. Automated safety checks must still run.

1. Run `node --check custom/continuous-draw.js` and `node --check tools/sync-upstream.mjs`.
2. Run `node tools/sync-upstream.mjs --check-only`.
3. Run `node tools/sync-upstream.mjs --apply` and confirm the generated page preserves all upstream draw links.
4. Browser-test city, product and time filters, pre-start lockout, automatic return flow, stop overlay, skip store and undo.
5. Commit and push to `origin/main`; verify GitHub Actions and GitHub Pages complete successfully.

