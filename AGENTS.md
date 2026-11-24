# Project Rules & Context

## Tech Stack

- Frontend: HTML/CSS/Vanilla JS
- Target device: Mobile Android & Desktop browser

## Coding & Execution Rules

- Always inspect existing files before editing; never rewrite an entire file if a targeted edit
  works.
- Keep code modular, clean, and avoid adding unnecessary external libraries.
- Batch related file edits together to minimize tool call rounds.

## Communication

- Think and reason in English, but write all explanations and final summaries in clear, natural
  Vietnamese.
- Never output Chinese characters.

## Adding a model or a provider/platform (mandatory)

These two rules apply to EVERY new model or platform/provider added to Jarvis, without the user
having to ask again.

### 1. New models must accept images

- Images are always attached for every model on every send path: Gemini
  `generateContentStream`/Interactions use `inlineData` / part `type: 'image'`, the
  OpenAI-compatible gateway (OpenRouter/NVIDIA/Cohere) and Experiential Labs use `image_url`.
- `inputModalities` in `COMPAT_MODEL_OPTS` only filters video/audio. NEVER use it (or any other
  static flag) to drop images before sending.
- If the provider/platform rejects the image, show the toast
  `<tên model> does not process images (không xử lý ảnh)` and automatically retry that same turn
  without images, so the user still gets an answer. Reuse the helpers in `js/app.js`:
  `modelLabelOf()`, `isImageRejection()`, `notifyImagesUnsupported()` — keep the same wording and
  the retry-without-image behavior when adding a new send branch.

### 2. New provider API keys must be encrypted and synced to Gist Cloud

- Every provider's keys must behave exactly like the Google keys: obfuscated (`JVENC_`) in Gist
  Cloud and in the backup JSON, restored on another device.
- Storage keys: `jarvis_<provider>_api_1..N` + `jarvis_<provider>_api_name_1..N` and the usage
  counter `jarvis_<provider>_usage`.
- Touch all of these in the same change:
  - `js/api-keys.js`: key pool, slot selects/menus, `cfgMap` (and UI fields in `index.html`).
  - `js/sync.js`: get/set lists, Smart Sync merge, `isLocalAhead`/usage comparison, packaging in
    both push flows, restore in the "Ghi đè Máy" flow.
  - `js/export.js`: keys + names + usage in the backup JSON (the obfuscation check must match
    `_api_` names too).
  - `js/key-config-sync.js`: `externalConfigs` so the keys are obfuscated/synced.
  - `js/quota.js`: per-key usage counter and badge.
- Never store a provider key in plain text on Gist/backup, and never leave a provider out of one of
  those files (that is the bug this rule exists to prevent).

### Checklist when adding a model or provider

- Model: `index.html` optgroup/option → `js/model-registry.js` (`COMPAT_PROVIDERS`,
  `COMPAT_MODEL_OPTS`, `EXPLABS_MODELS`) → `npm run check-models`.
- Provider: `index.html` key fieldset + optgroup → `js/api-keys.js` → `js/app.js` (key
  selection/rotation) → `js/quota.js` → `js/sync.js` → `js/export.js` → `js/key-config-sync.js` →
  `js/model-registry.js`.
- Finish with `node --check` on touched JS, `npm run check-models`, `npm run sync-assets`,
  `npm run check-assets`, and update `CHANGELOG.md` + `boicanhduan.json`.
