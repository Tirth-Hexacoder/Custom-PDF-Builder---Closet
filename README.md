# Modular Closet - Custom PDF Proposal Builder (Web Only)

Generated on: 2026-02-22

## Included
- `apps/web`: Word-style restricted proposal editor
  - 3D scene with dummy cube + orbit controls + capture
  - Capture gallery and insert-to-editor flow
  - A4 page editor (Fabric.js) with text formatting, placeholders, BOM block, layers, copy/paste/duplicate, multi-page, undo/redo
  - PDF and image export
  - Autosave/draft recovery
- `packages/core`: shared constants/defaults

## Run
1. `npm install`
2. `npm run dev`

## Integration
Replace adapter implementations in `apps/web/src/integration/adapters.js` to connect auth/storage/export with your host system.
