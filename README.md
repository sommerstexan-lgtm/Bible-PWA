# NASB Study PWA – v4.3.0

**Password:** `NASB-Study-1995-Private`

## Fix: update takes effect on first reload
Previously the service worker used cache-first, so you often had to hard-close twice.
v4.3.0 uses network-first for app files and auto-reloads once when a new worker activates.

## Upload
Replace all 12 files on GitHub. After deploy, one hard-refresh / reopen should be enough.
