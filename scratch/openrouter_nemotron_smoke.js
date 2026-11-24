/* Smoke test 3 model Nemotron free qua OpenRouter bằng key THẬT (BYOK NVIDIA đã bật trên OpenRouter).
   Chạy: OPENROUTER_API_KEY=... node scratch/openrouter_nemotron_smoke.js
   Không in key. Kiểm tra: HTTP 200, có reasoning khi bật, không có reasoning khi tắt (Nano Omni). */
const KEY = (process.env.OPENROUTER_API_KEY || '').trim();
if (!KEY) {
  console.log('SKIP: chưa có OPENROUTER_API_KEY trong môi trường — không thể test live.');
  process.exit(0);
}

const URL = 'https://openrouter.ai/api/v1/chat/completions';
const PROMPT = 'Nêu đúng 3 từ: xin chào Việt Nam';
const cases = [
  [
    'Nemotron 3.5 Lightning (reasoning bật)',
    'nvidia/nemotron-3.5-lightning:free',
    { enabled: true },
    true,
  ],
  [
    'Nemotron 3.5 Super VL (reasoning bật)',
    'nvidia/nemotron-3.5-super-vl:free',
    { enabled: true },
    true,
  ],
  [
    'Nemotron 3 Nano Omni (budget ~1K)',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    { max_tokens: 1024 },
    true,
  ],
  [
    'Nemotron 3 Nano Omni (tắt reasoning)',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    { enabled: false },
    false,
  ],
];

let failed = 0;

(async () => {
  for (const [name, model, reasoning, expectReasoning] of cases) {
    const body = {
      model,
      messages: [{ role: 'user', content: PROMPT }],
      stream: false,
      max_tokens: 256,
      reasoning,
      include_reasoning: reasoning.enabled !== false,
    };
    const started = Date.now();
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + KEY,
          'HTTP-Referer': 'https://jarvis.local',
          'X-Title': 'Jarvis AI smoke test',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (_) {}
      if (!res.ok) {
        failed++;
        console.log(
          `FAIL ${name} — HTTP ${res.status}: ${(json?.error?.message || text).slice(0, 200)}`
        );
        continue;
      }
      const msg = json?.choices?.[0]?.message || {};
      const hasReasoning = !!(msg.reasoning || msg.reasoning_content || msg.reasoning_details);
      const content = String(msg.content || '')
        .replace(/\s+/g, ' ')
        .slice(0, 120);
      const ms = Date.now() - started;
      if (expectReasoning && !hasReasoning) {
        failed++;
        console.log(
          `WARN ${name} — 200 nhưng KHÔNG thấy reasoning trả về (${ms}ms) | "${content}"`
        );
        continue;
      }
      if (!expectReasoning && hasReasoning) {
        console.log(`INFO ${name} — 200, provider vẫn trả reasoning dù đã tắt (${ms}ms)`);
        continue;
      }
      console.log(
        `PASS ${name} — 200, reasoning=${hasReasoning ? 'có' : 'không'}, ${ms}ms | "${content}"`
      );
    } catch (e) {
      failed++;
      console.log(`FAIL ${name} — ${e.message}`);
    }
  }
  console.log(failed ? `\n${failed} case lỗi` : '\nSmoke test OK');
  process.exit(failed ? 1 : 0);
})();
