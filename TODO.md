# TODO: Remove Experiential Labs Models & All Gemma Models

## Tasks

- [x] 1. Remove GPT-6.2 Astra and Clef from Experiential Labs group in index.html
- [x] 2. Remove Gemma 4 optgroup (Google AI Studio) from index.html
- [x] 3. Remove Gemma 4 31B from NVIDIA optgroup in index.html
- [x] 4. Remove Gemma 4 models from OpenRouter optgroup in index.html
- [x] 5. Remove 'google/gemma-4-31b-it' from NVIDIA models array in js/app.js
- [x] 6. Remove Gemma models from OpenRouter models array in js/app.js
- [x] 7. Remove 'google/gemma-4-31b-it' entry from COMPAT_MODEL_OPTS in js/app.js
- [x] 8. Remove Gemma modelLabel mappings from NVIDIA and OpenRouter providers in js/app.js
- [x] 9. Update EXPLABS_MODELS array in js/app.js (remove gpt-6.2-astra:free, clef)
- [x] 10. Update EXPLABS_MODELS array in js/quota.js (remove gpt-6.2-astra:free, clef)
- [x] 11. Update isExplabsModel check in js/app.js (line ~3803)
- [x] 12. Run `npm run check-models` to verify registry passes
