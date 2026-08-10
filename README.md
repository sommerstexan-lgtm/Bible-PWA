# NASB Study PWA – v4.4.0

**Password:** `NASB-Study-1995-Private`

## Version update fix
- Service worker registered with `?v=4.4.0` and `updateViaCache: 'none'` so iOS re-fetches it
- Menu → **Force refresh app** unregisters the worker, clears caches, and reloads

## After uploading
1. Replace all 12 files on GitHub
2. Open the site
3. If the version bar is still old: Menu → **Force refresh app**
4. Version bar should show **v4.4.0**
