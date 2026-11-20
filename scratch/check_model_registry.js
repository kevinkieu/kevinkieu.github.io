/* Kiểm tra registry model gateway (OpenRouter, NVIDIA...) khớp giữa 3 nguồn:
   index.html (optgroup tương ứng) <-> COMPAT_PROVIDERS.models <-> COMPAT_MODEL_OPTS
   Chạy: npm run check-models  (hoặc node scratch/check_model_registry.js) */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let failed = 0;
const fail = msg => { failed++; console.log('FAIL ' + msg); };
const pass = msg => console.log('PASS ' + msg);

function extractObject(src, marker) {
  const s = src.indexOf(marker);
  if (s < 0) throw new Error('Không tìm thấy ' + marker);
  const start = src.indexOf('{', s);
  const end = src.indexOf('\n    };', start);
  if (end < 0) throw new Error('Không tìm thấy điểm kết thúc của ' + marker);
  return new Function('location', 'return (' + src.slice(start, end + 6) + ')')({ origin: '' });
}

const indexHtml = read('index.html');
// Registry model đã tách khỏi js/app.js sang js/model-registry.js
const registryJs = read('js/model-registry.js');

const providers = extractObject(registryJs, 'const COMPAT_PROVIDERS = {');
const opts = extractObject(registryJs, 'const COMPAT_MODEL_OPTS = {');
const registryModels = Object.values(providers).flatMap(p => p.models || []);

for (const provider of Object.values(providers)) {
  const groupRe = new RegExp('<optgroup label="[^"]*' + provider.label + '">([\\s\\S]*?)<\\/optgroup>');
  const group = indexHtml.match(groupRe);
  if (!group) { fail(`Không tìm thấy optgroup ${provider.label} trong index.html`); continue; }
  const uiModels = [...group[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
  let groupFailed = false;

  // 1. index.html <-> COMPAT_PROVIDERS.models
  for (const m of provider.models) {
    if (!uiModels.includes(m)) { fail(`[${provider.label}] Model có trong registry nhưng thiếu option UI: ${m}`); groupFailed = true; }
  }
  for (const m of uiModels) {
    if (!provider.models.includes(m)) { fail(`[${provider.label}] Option UI không có trong registry (sẽ không gọi được gateway): ${m}`); groupFailed = true; }
  }
  if (!groupFailed) pass(`index.html khớp COMPAT_PROVIDERS (${provider.models.length} model ${provider.label})`);

  // 2. Nhãn hiển thị không được rơi về slug thô
  for (const m of provider.models) {
    const label = provider.modelLabel(m);
    if (!label || label === m) fail(`[${provider.label}] modelLabel chưa xử lý slug: ${m}`);
  }
  pass(`modelLabel phủ đủ mọi model ${provider.label}`);
}

// 3. COMPAT_MODEL_OPTS hợp lệ
const EFFORT_LEVELS = ['minimal', 'low', 'medium', 'high'];
for (const [id, o] of Object.entries(opts)) {
  if (!registryModels.includes(id)) fail(`COMPAT_MODEL_OPTS có model không nằm trong registry: ${id}`);
  if (!Number.isFinite(o.maxTokens) || o.maxTokens <= 0) fail(`${id}: maxTokens không hợp lệ`);
  if (Number.isFinite(o.maxOutputTokens) && o.maxTokens > o.maxOutputTokens) {
    fail(`${id}: maxTokens (${o.maxTokens}) vượt maxOutputTokens (${o.maxOutputTokens})`);
  }
  if (o.reasoningBudgets) {
    for (const [lvl, budget] of Object.entries(o.reasoningBudgets)) {
      if (!Number.isFinite(budget) || budget < 1024) fail(`${id}: ngân sách '${lvl}' < 1024 (mức tối thiểu của API)`);
      if (budget >= o.maxTokens) fail(`${id}: ngân sách '${lvl}' (${budget}) phải nhỏ hơn maxTokens (${o.maxTokens})`);
    }
  }
  if (o.levels) {
    for (const [value, label] of o.levels) {
      const valid = value === 'none' || EFFORT_LEVELS.includes(value)
        || (o.reasoningBudgets && Object.keys(o.reasoningBudgets).includes(value));
      if (!valid) fail(`${id}: mức Think Depth '${value}' không ánh xạ được sang tham số gửi đi`);
      if (!label) fail(`${id}: mức '${value}' thiếu nhãn`);
    }
    if (!o.noReasoning && !o.levels.some(([v]) => v === o.defaultEffort)) fail(`${id}: defaultEffort không nằm trong levels`);
    if (new Set(o.levels.map(([v]) => v)).size !== o.levels.length) fail(`${id}: levels bị trùng giá trị`);
  }
}
pass(`COMPAT_MODEL_OPTS hợp lệ (${Object.keys(opts).length} entry)`);

// 4. Model chưa có entry opts sẽ dùng mặc định 8192 token / reasoning effort thường
const missingOpts = registryModels.filter(m => !opts[m]);
if (missingOpts.length) console.log('INFO dùng mặc định (chưa có COMPAT_MODEL_OPTS): ' + missingOpts.join(', '));

console.log(failed ? `\n${failed} lỗi registry` : '\nRegistry OK');
process.exit(failed ? 1 : 0);
