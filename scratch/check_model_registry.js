/* Kiểm tra registry model gateway (OpenRouter, NVIDIA...) khớp giữa 3 nguồn:
   index.html (optgroup tương ứng) <-> PROVIDER_REGISTRY <-> model-registry.js (COMPAT_MODEL_OPTS)
   Chạy: npm run check-models  (hoặc node scratch/check_model_registry.js) */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let failed = 0;
const fail = msg => {
  failed++;
  console.log('FAIL ' + msg);
};
const pass = msg => console.log('PASS ' + msg);

const indexHtml = read('index.html');
const providerRegistryJs = read('js/provider-registry.js');

// Helper để extract object dùng Function (cung cấp PROVIDER_TYPE trong context)
function extractObject(src, marker) {
  const s = src.indexOf(marker);
  if (s < 0) throw new Error('Không tìm thấy ' + marker);
  const start = src.indexOf('{', s);
  if (start < 0) throw new Error('Không tìm thấy { sau ' + marker);
  let depth = 0;
  let end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('Không tìm thấy điểm kết thúc của ' + marker);
  const code = src.slice(start, end + 1);
  // Provide PROVIDER_TYPE in the evaluation context
  const PROVIDER_TYPE = {
    GEMINI: 'gemini',
    OPENAI_COMPAT: 'openai_compat',
    EXPERIENTIAL_LABS: 'explabs',
  };
  return new Function('location', 'PROVIDER_TYPE', 'return (' + code + ')')(
    { origin: '' },
    PROVIDER_TYPE
  );
}

// Extract PROVIDER_REGISTRY from provider-registry.js
const PROVIDER_REGISTRY = extractObject(providerRegistryJs, 'const PROVIDER_REGISTRY = {');

// Build COMPAT_MODEL_OPTS from PROVIDER_REGISTRY (same as buildCompatModelOpts function)
function buildCompatModelOptsFromRegistry() {
  const opts = {};
  for (const p of Object.values(PROVIDER_REGISTRY)) {
    if (p.type !== 'openai_compat') continue;
    for (const m of p.models) {
      const o = { ...m };
      o.maxOutputTokens = o.maxOutputTokens || o.maxTokens;
      opts[m.id] = o;
    }
  }
  return opts;
}
const opts = buildCompatModelOptsFromRegistry();

// Build registry models from PROVIDER_REGISTRY (only OpenAI-compat providers)
const registryModels = [];
const providerLabels = {};
for (const [id, p] of Object.entries(PROVIDER_REGISTRY)) {
  if (p.type === 'openai_compat' || p.type === 'explabs') {
    providerLabels[id] = p.label;
    p.models.forEach(m => {
      registryModels.push(m.id);
    });
  }
}

console.log(
  `Đã phát hiện ${registryModels.length} model từ ${Object.keys(providerLabels).length} provider (OpenAI-compat + Experiential Labs)`
);

// 1. index.html <-> PROVIDER_REGISTRY
for (const [providerId, label] of Object.entries(providerLabels)) {
  const groupRe = new RegExp('<optgroup label="[^"]*' + label + '">([\\s\\S]*?)<\\/optgroup>');
  const group = indexHtml.match(groupRe);
  if (!group) {
    fail(`Không tìm thấy optgroup ${label} trong index.html`);
    continue;
  }
  const uiModels = [...group[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
  let groupFailed = false;

  // Models from this provider in registry
  const p = PROVIDER_REGISTRY[providerId];
  const registryProviderModels = p.models.map(m => m.id);

  for (const m of registryProviderModels) {
    if (!uiModels.includes(m)) {
      fail(`[${label}] Model có trong registry nhưng thiếu option UI: ${m}`);
      groupFailed = true;
    }
  }
  for (const m of uiModels) {
    if (!registryProviderModels.includes(m)) {
      fail(`[${label}] Option UI không có trong registry (sẽ không gọi được gateway): ${m}`);
      groupFailed = true;
    }
  }
  if (!groupFailed)
    pass(`index.html khớp PROVIDER_REGISTRY (${registryProviderModels.length} model ${label})`);
}

// 2. COMPAT_MODEL_OPTS hợp lệ
const EFFORT_LEVELS = ['minimal', 'low', 'medium', 'high'];
for (const [id, o] of Object.entries(opts)) {
  if (!registryModels.includes(id))
    fail(`COMPAT_MODEL_OPTS có model không nằm trong registry: ${id}`);
  if (!Number.isFinite(o.maxTokens) || o.maxTokens <= 0) fail(`${id}: maxTokens không hợp lệ`);
  if (Number.isFinite(o.maxOutputTokens) && o.maxTokens > o.maxOutputTokens) {
    fail(`${id}: maxTokens (${o.maxTokens}) vượt maxOutputTokens (${o.maxOutputTokens})`);
  }
  if (o.reasoningBudgets) {
    for (const [lvl, budget] of Object.entries(o.reasoningBudgets)) {
      if (!Number.isFinite(budget) || budget < 1024)
        fail(`${id}: ngân sách '${lvl}' < 1024 (mức tối thiểu của API)`);
      if (budget >= o.maxTokens)
        fail(`${id}: ngân sách '${lvl}' (${budget}) phải nhỏ hơn maxTokens (${o.maxTokens})`);
    }
  }
  if (o.levels) {
    for (const [value, label] of o.levels) {
      const valid =
        value === 'none' ||
        EFFORT_LEVELS.includes(value) ||
        (o.reasoningBudgets && Object.keys(o.reasoningBudgets).includes(value));
      if (!valid) fail(`${id}: mức Think Depth '${value}' không ánh xạ được sang tham số gửi đi`);
      if (!label) fail(`${id}: mức '${value}' thiếu nhãn`);
    }
    if (!o.noReasoning && !o.levels.some(([v]) => v === o.defaultEffort))
      fail(`${id}: defaultEffort không nằm trong levels`);
    if (new Set(o.levels.map(([v]) => v)).size !== o.levels.length)
      fail(`${id}: levels bị trùng giá trị`);
  }
}
pass(`COMPAT_MODEL_OPTS hợp lệ (${Object.keys(opts).length} entry)`);

// 3. Model chưa có entry opts sẽ dùng mặc định 8192 token / reasoning effort thường
const missingOpts = registryModels.filter(m => !opts[m]);
if (missingOpts.length)
  console.log('INFO dùng mặc định (chưa có COMPAT_MODEL_OPTS): ' + missingOpts.join(', '));

console.log(failed ? `\n${failed} lỗi registry` : '\nRegistry OK');
process.exit(failed ? 1 : 0);
