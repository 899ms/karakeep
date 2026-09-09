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
| X Quick Clipper | local `karakeep-x-quick-clipper/` | Chrome extension that saves user-loaded X post content without server-side X crawling. |
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
- No upstream secrets, browser cookies, or bookmark data are stored here.
- This Fork primarily documents the deployment boundary and can accept small,
  reviewed integration changes when needed.
