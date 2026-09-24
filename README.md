# UK SHARE PICKS

Mobile-first PWA for displaying short-term UK share research.

## Updating recommendations
Edit only `picks.json`. The interface reads it fresh whenever the app opens.

## GitHub Pages
In the repository go to Settings → Pages → Deploy from a branch → `main` / root.

The included data is deliberately labelled DEMO DATA. Replace it with the latest researched scan before trading.

## iPhone Shortcut updater

The Cloudflare Worker accepts POST JSON without a custom header.

Use:
- `secret` = the Cloudflare `UPDATE_SECRET`
- `payload` = the full share-picks object

The payload must contain a `picks` array. `watchlist` is optional.
The Worker automatically adds an update timestamp when one is omitted and
removes the authentication secret before writing `picks.json`.

A ready-made example is included in `shortcut-payload-example.json`.
