/* ==========================================================================
   Jarvis AI - Ollama Local LLM (js/local-llm.js)
   Chat với LLM chạy trên chính máy của bạn (Ollama) và tự chuyển sang local khi
   nhà cung cấp cloud lỗi / hết quota.

   - Cấu hình: jarvis_ollama_host (mặc định http://127.0.0.1:11434),
     jarvis_ollama_model (mặc định llama3.2),
     jarvis_ollama_auto_fallback ('false' để tắt tự chuyển).
   - Model local hiện trong #model-select dưới optgroup "💻 Ollama (máy local)"
     với id dạng `ollama:<tên model>`.
   - API Ollama: GET /api/tags (danh sách model), POST /api/chat (NDJSON stream).

   Nạp TRƯỚC js/app.js trong index.html. Không cần API key.
   ========================================================================== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;

  const HOST_KEY = 'jarvis_ollama_host';
  const MODEL_KEY = 'jarvis_ollama_model';
  const FALLBACK_KEY = 'jarvis_ollama_auto_fallback';
  const DEFAULT_HOST = 'http://127.0.0.1:11434';
  const DEFAULT_MODEL = 'llama3.2';
  const ID_PREFIX = 'ollama:';
  const OPTGROUP_ID = 'ollama-model-group';

  const escapeHtml = s =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  // --- CẤU HÌNH ---

  function getHost() {
    const v = (ls.getItem(HOST_KEY) || '').trim() || DEFAULT_HOST;
    return v.replace(/\/+$/, '');
  }

  function setHost(v) {
    const clean = String(v || '')
      .trim()
      .replace(/\/+$/, '');
    if (clean) ls.setItem(HOST_KEY, clean);
    else ls.removeItem(HOST_KEY);
    return getHost();
  }

  function getModel() {
    return (ls.getItem(MODEL_KEY) || '').trim() || DEFAULT_MODEL;
  }

  function setModel(v) {
    const clean = String(v || '').trim();
    if (clean) ls.setItem(MODEL_KEY, clean);
    else ls.removeItem(MODEL_KEY);
    return getModel();
  }

  // Mặc định BẬT: lỗi/hết quota thì tự chạy tiếp bằng Ollama local
  function isAutoFallbackEnabled() {
    return ls.getItem(FALLBACK_KEY) !== 'false';
  }

  function setAutoFallback(on) {
    ls.setItem(FALLBACK_KEY, on ? 'true' : 'false');
    return isAutoFallbackEnabled();
  }

  // --- NHẬN DIỆN MODEL LOCAL ---

  function isLocalModel(modelId) {
    return String(modelId || '')
      .trim()
      .startsWith(ID_PREFIX);
  }

  function toModelId(name) {
    return ID_PREFIX + String(name || getModel()).trim();
  }

  function modelFromId(modelId) {
    const s = String(modelId || '').trim();
    return s.startsWith(ID_PREFIX) ? s.slice(ID_PREFIX.length) : s;
  }

  // --- DÒ SERVER OLLAMA ---

  async function probe(timeoutMs = 4000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const host = getHost();
    try {
      const r = await fetch(host + '/api/tags', { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const models = (d.models || [])
        .map(m => String(m.name || m.model || '').trim())
        .filter(Boolean);
      return { ok: true, host, models };
    } catch (e) {
      return {
        ok: false,
        host,
        models: [],
        error:
          e && e.name === 'AbortError'
            ? `Không phản hồi sau ${Math.round(timeoutMs / 1000)}s`
            : (e && e.message) || String(e),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // --- ĐỒNG BỘ OPTGROUP MODEL LOCAL TRONG #model-select ---

  let lastModels = [];

  // Nếu model mặc định chưa được tải trên máy, tự chọn model chat đầu tiên đang có
  // (bỏ qua model embedding) để lần gửi đầu không bị lỗi 404.
  function ensureUsableDefault(models) {
    const list = Array.isArray(models) ? models : [];
    if (!list.length) return;
    if (list.includes(getModel())) return;
    const candidate = list.find(m => !/embed/i.test(m));
    if (candidate) setModel(candidate);
  }

  function renderModelOptions(models) {
    const sel = $('model-select');
    if (!sel) return;
    const uniq = [];
    [getModel()].concat(Array.isArray(models) ? models : []).forEach(m => {
      const name = String(m || '').trim();
      if (name && !uniq.includes(name)) uniq.push(name);
    });
    const current = sel.value;
    let group = $(OPTGROUP_ID);
    if (!group) {
      group = document.createElement('optgroup');
      group.id = OPTGROUP_ID;
      group.label = '💻 Ollama (máy local)';
      sel.appendChild(group);
    }
    group.innerHTML = uniq
      .map(
        name =>
          `<option value="${escapeHtml(toModelId(name))}">💻 Ollama · ${escapeHtml(name)}</option>`
      )
      .join('');
    // Giữ nguyên lựa chọn hiện tại (nếu vẫn còn trong danh sách)
    if (current) sel.value = current;
  }

  async function refreshModelOptions(force = false) {
    renderModelOptions(lastModels);
    if (!force && lastModels.length) return { ok: true, models: lastModels };
    const res = await probe();
    if (res.ok && res.models.length) {
      ensureUsableDefault(res.models);
      lastModels = res.models;
      renderModelOptions(lastModels);
    }
    return res;
  }

  // --- STREAM CHAT QUA OLLAMA ---

  function buildMessages({ si, history, prompt, maxTurns = 10 }) {
    const messages = [];
    const sys = String(si || '').trim();
    if (sys) messages.push({ role: 'system', content: sys });
    const turns = Number(ls.getItem('jarvis_ollama_context_turns') || maxTurns) || maxTurns;
    (Array.isArray(history) ? history : []).slice(-Math.max(2, turns * 2)).forEach(m => {
      const text = String((m && m.text) || '').trim();
      if (!text) return;
      messages.push({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: (m.pinned ? '[GHIM] ' : '') + text,
      });
    });
    const p = String(prompt || '').trim();
    if (p) messages.push({ role: 'user', content: p });
    return messages;
  }

  // Trả về toàn bộ text; onDelta(piece, fullText) được gọi theo từng chunk.
  async function streamChat({ si, history, prompt, model, signal, onDelta, temperature }) {
    const target = String(model || getModel()).trim();
    const body = {
      model: target,
      messages: buildMessages({ si, history, prompt }),
      stream: true,
      options: { temperature: typeof temperature === 'number' ? temperature : 0.7 },
    };

    const r = await fetch(getHost() + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      let detail = '';
      try {
        const j = await r.json();
        detail = j.error || '';
      } catch (_) {}
      if (r.status === 404)
        detail = detail || `Chưa tải model "${target}" (chạy: ollama pull ${target})`;
      throw new Error(`Ollama HTTP ${r.status}${detail ? ': ' + detail : ''}`);
    }

    let full = '';
    if (!r.body || typeof r.body.getReader !== 'function') {
      // Trình duyệt cũ không hỗ trợ stream
      const d = await r.json();
      full = String((d && d.message && d.message.content) || '').trim();
      if (full && onDelta) onDelta(full, full);
      return full;
    }

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let j;
        try {
          j = JSON.parse(line);
        } catch (_) {
          continue;
        }
        if (j.error) throw new Error('Ollama: ' + j.error);
        const piece = (j.message && j.message.content) || '';
        if (piece) {
          full += piece;
          if (onDelta) onDelta(piece, full);
        }
      }
    }
    // Dòng cuối không có '\n'
    const tail = buf.trim();
    if (tail) {
      try {
        const j = JSON.parse(tail);
        const piece = (j.message && j.message.content) || '';
        if (piece) {
          full += piece;
          if (onDelta) onDelta(piece, full);
        }
      } catch (_) {}
    }
    return full;
  }

  // Lỗi có nên chuyển sang local? (bỏ qua khi người dùng bấm Dừng)
  function shouldFallback(err) {
    if (!err) return true;
    if (err.name === 'AbortError') return false;
    const msg = String(err.message || err || '');
    if (/aborted|abort/i.test(msg) && err.name === 'AbortError') return false;
    // 401/403 vẫn nên thử: key sai/hết hạn thì local vẫn trả lời được
    return true;
  }

  // --- UI TRONG SETTINGS ---

  function setProbeStatus(text, color) {
    const el = $('ollama-probe-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = color || 'var(--text-muted)';
  }

  function refreshUI() {
    const hostEl = $('ollama-host-input');
    if (hostEl) hostEl.value = getHost();
    const modelEl = $('ollama-model-input');
    if (modelEl) modelEl.value = getModel();
    const fbEl = $('ollama-auto-fallback');
    if (fbEl) fbEl.checked = isAutoFallbackEnabled();
    const listEl = $('ollama-model-datalist');
    if (listEl && lastModels.length) {
      listEl.innerHTML = lastModels.map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
    }
  }

  async function runProbeAndReport() {
    setProbeStatus('⏳ Đang kiểm tra ' + getHost() + ' …', 'var(--text-muted)');
    const res = await probe();
    if (res.ok) {
      ensureUsableDefault(res.models);
      lastModels = res.models;
      renderModelOptions(lastModels);
      refreshUI();
      setProbeStatus(
        res.models.length
          ? `✅ Đã kết nối · ${res.models.length} model: ${res.models.slice(0, 4).join(', ')}${res.models.length > 4 ? '…' : ''}`
          : '✅ Đã kết nối nhưng chưa có model nào (chạy: ollama pull ' + getModel() + ')',
        '#10b981'
      );
    } else {
      setProbeStatus(
        `❌ Không kết nối được Ollama (${res.error}). Kiểm tra app Ollama đã chạy chưa và OLLAMA_ORIGINS.`,
        '#ef4444'
      );
    }
    return res;
  }

  function initUI() {
    refreshUI();

    const hostEl = $('ollama-host-input');
    if (hostEl) {
      hostEl.onchange = () => {
        setHost(hostEl.value);
        hostEl.value = getHost();
        setProbeStatus('Đã lưu địa chỉ. Bấm "Kiểm tra kết nối" để dò model.', 'var(--text-muted)');
      };
    }

    const modelEl = $('ollama-model-input');
    if (modelEl) {
      modelEl.onchange = () => {
        setModel(modelEl.value);
        modelEl.value = getModel();
        renderModelOptions(lastModels);
      };
    }

    const fbEl = $('ollama-auto-fallback');
    if (fbEl) {
      fbEl.onchange = () => {
        setAutoFallback(fbEl.checked);
        if (typeof window.showToast === 'function') {
          window.showToast(
            fbEl.checked
              ? '💻 Đã bật: lỗi/hết quota sẽ tự chuyển sang Ollama local'
              : '💻 Đã tắt tự chuyển sang Ollama local',
            'info'
          );
        }
      };
    }

    const probeBtn = $('btn-ollama-probe');
    if (probeBtn) {
      probeBtn.onclick = async () => {
        probeBtn.disabled = true;
        try {
          await runProbeAndReport();
        } finally {
          probeBtn.disabled = false;
        }
      };
    }

    // Dò nền một lần lúc mở app: có Ollama thì model local hiện trong dropdown
    setTimeout(() => {
      probe(2500).then(res => {
        if (res.ok && res.models.length) {
          ensureUsableDefault(res.models);
          lastModels = res.models;
          renderModelOptions(lastModels);
          refreshUI();
        }
      });
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  window.LocalLLM = {
    ID_PREFIX,
    DEFAULT_HOST,
    DEFAULT_MODEL,
    getHost,
    setHost,
    getModel,
    setModel,
    isAutoFallbackEnabled,
    setAutoFallback,
    isLocalModel,
    toModelId,
    modelFromId,
    probe,
    refreshModelOptions,
    buildMessages,
    streamChat,
    shouldFallback,
    refreshUI,
    runProbeAndReport,
  };
})();
