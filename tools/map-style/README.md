# Map styles

The two basemaps in `apps/web/src/map/light-style.ts` and `dark-style.ts` are
generated. **This is where to change them.** Editing the generated files works
and nothing will overwrite them behind your back — but the next person to run
`emit.mjs` will lose your edit, so put it here instead.

## What is where

| | |
|---|---|
| `build.mjs` | The palettes, the per-layer overrides, the rail expressions. Everything you would actually want to change is in the top third of this file. |
| `headers/*.ts.txt` | The doc comment that opens each generated file — prose only. The `PALETTE` block under it is generated from `build.mjs`, so a colour has exactly one home. |
| `emit.mjs` | Writes the two TypeScript modules into `apps/web/src/map/`. |
| `upstream/` | OpenFreeMap's own styles, unmodified, as fetched. The base everything is derived from. |
| `preview.html`, `serve.mjs` | Side-by-side preview, ours against upstream. |

## Changing a style

```bash
node tools/map-style/emit.mjs && npx biome check --write apps/web/src/map
```

The dev server picks the new style up on save: the module's export is the style
object, so a changed file rebuilds the map in place.

## Looking at it first

```bash
node tools/map-style/build.mjs && node tools/map-style/serve.mjs
```

Then <http://localhost:8099/preview.html>. Both maps pan and zoom together;
`?style=light|dark&z=&lat=&lng=` opens somewhere specific. Note that a
screenshot of the dark style looks considerably brighter than the phone does —
judge it on a real screen before pulling a value down.

## Re-deriving against a newer upstream

```bash
curl -s https://tiles.openfreemap.org/styles/dark     -o tools/map-style/upstream/dark.json
curl -s https://tiles.openfreemap.org/styles/positron -o tools/map-style/upstream/positron.json
```

Then diff, and check `build.mjs` still names layers that exist — an override for
a layer upstream has renamed is silently dropped, which shows up as a colour
quietly reverting rather than as an error.

## What the tiles will and will not give you

Zoom floors are the data's, not a preference. In OpenMapTiles:

- heavy rail (`class: rail`) exists from **z8**
- `light_rail` — Berlin's S-Bahn — from **z11**
- `subway` and `tram` only from **z14**

So a tram cannot be drawn at z12 by any style. The layer floors in `build.mjs`
are set to those numbers; lowering them further buys nothing.
