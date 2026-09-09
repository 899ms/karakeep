# Local Customizations for 899ms/Karakeep

This document records user-owned integrations deployed alongside Karakeep.
They are intentionally kept outside the upstream application source tree so
that upstream updates can be adopted with minimal merge work.

## Upstream Relationship

- Fork: [`899ms/karakeep`](https://github.com/899ms/karakeep)
- Upstream: [`karakeep-app/karakeep`](https://github.com/karakeep-app/karakeep)
- Local Git remotes: `origin` is upstream; `fork` is this repository.

## Deployment Inventory

| Component | Location | Purpose |
| --- | --- | --- |
| Karakeep service | `/opt/karakeep` | Official release image and persistent application data. |
| Forked browser extension | `apps/browser-extension/` | Official Karakeep extension behavior on ordinary pages, plus a local, user-loaded X post capture mode on X status pages. |
| Legacy X Quick Clipper | local `karakeep-x-quick-clipper/` | Earlier standalone prototype; keep only as a recovery/reference copy after the forked extension is installed. |
| Title translator | `/opt/karakeep-title-translator/title_translator.py` | Translates saved bookmark titles into Chinese using the configured Gemini-compatible endpoint. |
| Prompt extractor | `/opt/karakeep-title-translator/prompt_worker.py` | Extracts prompt-like text from newly saved bookmarks. |
| Upgrade guard | `/opt/karakeep-customizations` | Snapshots custom state, reapplies non-secret environment overrides, upgrades the official containers, and verifies health. |

## Upgrade Procedure

Do not modify the Karakeep container image or vendor source files for these
features. On the server, run only:

```bash
/opt/karakeep-customizations/upgrade.sh
```

The guard snapshots configuration before upgrading and verifies container
health, environment overrides, and the two external worker timers afterwards.
Secrets remain only in `/opt/karakeep/.env` and are deliberately not recorded
in this repository.

## Browser Extension Behavior

Build the extension from this Fork with:

```bash
pnpm --filter @karakeep/browser-extension build
```

Load `apps/browser-extension/dist/` through Chrome's **Load unpacked** flow.
It is named **Karakeep with X Loaded Capture** (currently version `1.2.14`) to
distinguish it from the Chrome Web Store extension.

- On ordinary HTTP/HTTPS pages it uses the unchanged upstream extension flow:
  link, selection, image and context-menu saves; the `Ctrl+Shift+E` shortcut;
  auto-save; badge lookup; optional SingleFile client-side crawling; and the
  standard settings page.
- On `x.com/.../status/<id>` and `twitter.com/.../status/<id>` it presents the
  X-specific mode. The user expands desired replies first; the extension then
  saves only already-rendered content and same-author replies as a lightweight
  archive. This avoids server-side X crawling and does not send browser cookies
  to Karakeep.
- X Articles render their long-form body in a separate X DOM tree. The Fork
  keeps that body as sanitized, ordered HTML, so headings, paragraphs, lists,
  links and images remain interleaved as rendered in X. Saving an existing X
  URL uses `ifexists=overwrite`, replacing an earlier incomplete archive rather
  than retaining it through link de-duplication.
- The X mode keeps image URLs in its archive. Downloading X media into separate
  Karakeep assets remains a future enhancement; do not assume video blobs are
  directly downloadable.

## Fork Maintenance

1. Fetch upstream: `git fetch origin`.
2. Review upstream release notes and compare this file against the new API or
   configuration surface.
3. Merge or rebase the fork's `main` branch onto the chosen upstream revision.
4. Run the server upgrade guard instead of manually editing the compose stack.
5. Keep custom code in external services or extensions. Add a source patch to
   this fork only when an upstream extension point cannot support the feature.

## Current Scope

- No production Karakeep application source files have been changed.
- Browser-extension source changes live in this Fork and are isolated to the
  X status-page route plus its content script; upstream behavior remains the
  default for every other page.
- No upstream secrets, browser cookies, or bookmark data are stored here.
- This Fork primarily documents the deployment boundary and can accept small,
  reviewed integration changes when needed.
