/* ==========================================================================
   Jarvis AI - Persona & Rules Config (js/persona-config.js)
   "Con người" của Jarvis: danh tính mặc định, phong cách xưng hô và các khối
   quy tắc (mốc thời gian, bảo vệ đời tư, buộc trả lời sau khi suy luận).

   Trước đây toàn bộ các khối này viết cứng trong getDynamicSI (js/app.js) nên
   mỗi lần chỉnh tính cách phải sửa code + build lại APK, và thông tin cá nhân
   nằm trong source public. Nay cấu hình lưu ở localStorage (jarvis_persona_config),
   đi kèm backup JSON và đồng bộ Gist.

   Nạp TRƯỚC js/app.js (module classic sau globals.js).
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;

  const STORAGE_KEY = 'jarvis_persona_config';

  const DEFAULTS = {
    identity: 'Bạn là Jarvis AI - trợ lý thông minh, chuẩn xác và thân thiện.',
    tone: '',
    timeRule: true,
    privacyRule: true,
    thinkingRule: true,
    // Tự chèn "thẻ tính cách" ngắn vào đầu System Instruction của MỌI lượt chat
    autoInject: true,
  };

  function readRaw() {
    try {
      const parsed = JSON.parse(ls.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  // Cấu hình hiện tại (luôn đủ field, đã áp mặc định)
  function get() {
    const raw = readRaw();
    return {
      identity: typeof raw.identity === 'string' ? raw.identity : DEFAULTS.identity,
      tone: typeof raw.tone === 'string' ? raw.tone : DEFAULTS.tone,
      timeRule: raw.timeRule !== false,
      privacyRule: raw.privacyRule !== false,
      thinkingRule: raw.thinkingRule !== false,
      autoInject: raw.autoInject !== false,
    };
  }

  function save(partial) {
    const next = Object.assign({}, get(), partial || {});
    ls.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function reset() {
    ls.removeItem(STORAGE_KEY);
    return get();
  }

  // --- CÁC KHỐI QUY TẮC ---

  function buildTimeRule(now = new Date()) {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:${ss}`;
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dateStr = `${days[now.getDay()]}, ngày ${day}/${month}/${year}`;

    return `[MỐC THỜI GIAN THỰC TẾ & NGUYÊN TẮC SUY LUẬN THỜI GIAN BẮT BUỘC]:
- Hôm nay là: ${dateStr}. Bây giờ là: ${timeStr} (Múi giờ Việt Nam GMT+7).
- NĂM HIỆN TẠI BẮT BUỘC LÀ NĂM ${year}. TUYỆT ĐỐI KHÔNG coi năm nay là năm 2024 hay 2025 (đó chỉ là thời điểm dữ liệu huấn luyện cũ).
- NGUYÊN TẮC SUY LUẬN THỜI GIAN & TÍNH TUỔI:
  + Mọi phép tính toán số tuổi, thời gian đã trôi qua kể từ một mốc quá khứ hay tính thời gian đến tương lai ĐỀU BẮT BUỘC PHẢI lấy mốc thời điểm HIỆN TẠI LÀ THÁNG ${month}/${year} (NĂM ${year}).
  + Ví dụ: một mốc bắt đầu từ tháng 01/2024, tính đến tháng ${month}/${year} đã là ${year - 2024} năm ${month - 1} tháng (khoảng ${(year - 2024) * 12 + (month - 1)} tháng), TUYỆT ĐỐI KHÔNG được tính nhầm.`;
  }

  function buildToneRule(tone) {
    const t = String(tone || '').trim();
    if (!t) return '';
    return `[PHONG CÁCH & CÁCH XƯNG HÔ NGƯỜI DÙNG MUỐN]:\n${t}`;
  }

  function buildPrivacyRule() {
    return `[QUY TẮC ỨNG XỬ TẾ NHỊ]: Khi người dùng hỏi các câu hỏi kiến thức khoa học, nấu ăn, công nghệ, học tập hoặc câu hỏi phổ thông (như thịt gà, kỹ thuật, thời tiết...), TUYỆT ĐỐI KHÔNG tự tiện nhắc đến thông tin gia đình, đời tư, con cái hay người thân nếu người dùng không chủ động hỏi hay yêu cầu.`;
  }

  // Thẻ tính cách NGẮN, đặt ngay đầu System Instruction ở mọi lượt chat.
  // Mục đích: model vẫn giữ đúng "con người" của Jarvis kể cả khi
  // System Instruction bị cắt ngắn, bị bỏ qua (model local) hoặc khi
  // phiên chỉ có 1-2 lượt ngắn.
  function buildCard(cfg) {
    const c = cfg || get();
    if (c.autoInject === false) return '';
    const identity =
      String(c.identity || '')
        .trim()
        .slice(0, 600) || DEFAULTS.identity;
    const tone = String(c.tone || '')
      .trim()
      .slice(0, 400);
    const rules = [];
    if (c.timeRule !== false) rules.push('luôn dùng mốc thời gian thực tế');
    if (c.privacyRule !== false) rules.push('không tự nhắc đời tư khi chưa được hỏi');
    if (c.thinkingRule !== false) rules.push('luôn viết câu trả lời hoàn chỉnh sau khi suy luận');

    let out = `[THẺ TÍNH CÁCH NHANH - GIỮ NGUYÊN Ở MỌI LƯỢT TRẢ LỜI]:\n- Danh tính: ${identity}`;
    if (tone) out += `\n- Xưng hô & phong cách: ${tone}`;
    if (rules.length) out += `\n- Quy tắc bắt buộc: ${rules.join('; ')}.`;
    return out;
  }

  function buildThinkingRule() {
    return `[QUY TẮC TRẢ LỜI CỦA MÔ HÌNH SUY LUẬN (THINKING)]: Sau khi hoàn tất quá trình suy luận nội bộ, bạn BẮT BUỘC PHẢI viết toàn bộ nội dung câu trả lời hoàn chỉnh, chi tiết, logic và thân thiện để gửi trực tiếp cho người dùng. TUYỆT ĐỐI KHÔNG kết thúc phản hồi khi chưa viết phần câu trả lời cho người dùng.`;
  }

  // --- UI TRONG SETTINGS ---

  const UI_IDS = {
    identity: 'persona-identity-input',
    tone: 'persona-tone-input',
    timeRule: 'persona-rule-time',
    privacyRule: 'persona-rule-privacy',
    thinkingRule: 'persona-rule-thinking',
    autoInject: 'persona-card-inject',
  };

  function refreshUI() {
    const cfg = get();
    const elIdentity = $(UI_IDS.identity);
    if (elIdentity) elIdentity.value = cfg.identity;
    const elTone = $(UI_IDS.tone);
    if (elTone) elTone.value = cfg.tone;
    const elTime = $(UI_IDS.timeRule);
    if (elTime) elTime.checked = cfg.timeRule;
    const elPrivacy = $(UI_IDS.privacyRule);
    if (elPrivacy) elPrivacy.checked = cfg.privacyRule;
    const elThinking = $(UI_IDS.thinkingRule);
    if (elThinking) elThinking.checked = cfg.thinkingRule;
    const elCard = $(UI_IDS.autoInject);
    if (elCard) elCard.checked = cfg.autoInject;
  }

  function persistFromUI() {
    save({
      identity: $(UI_IDS.identity)?.value ?? get().identity,
      tone: $(UI_IDS.tone)?.value ?? get().tone,
      timeRule: $(UI_IDS.timeRule) ? $(UI_IDS.timeRule).checked : get().timeRule,
      privacyRule: $(UI_IDS.privacyRule) ? $(UI_IDS.privacyRule).checked : get().privacyRule,
      thinkingRule: $(UI_IDS.thinkingRule) ? $(UI_IDS.thinkingRule).checked : get().thinkingRule,
      autoInject: $(UI_IDS.autoInject) ? $(UI_IDS.autoInject).checked : get().autoInject,
    });
  }

  function scheduleSync() {
    if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
      window.JarvisSync.scheduleAutoSync(3000);
    }
  }

  function initUI() {
    refreshUI();

    const identity = $(UI_IDS.identity);
    if (identity) identity.oninput = persistFromUI;

    const tone = $(UI_IDS.tone);
    if (tone) tone.oninput = persistFromUI;

    // Chỉ đẩy lên Gist khi rời ô (change), tránh mỗi ký tự một lần push
    [identity, tone].forEach(el => {
      if (el) el.onchange = scheduleSync;
    });

    [UI_IDS.timeRule, UI_IDS.privacyRule, UI_IDS.thinkingRule, UI_IDS.autoInject].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.onchange = () => {
        persistFromUI();
        scheduleSync();
      };
    });

    const btnReset = $('btn-persona-reset');
    if (btnReset) {
      btnReset.onclick = () => {
        reset();
        refreshUI();
        if (typeof window.showToast === 'function')
          window.showToast('Đã khôi phục tính cách mặc định của Jarvis', 'info');
        scheduleSync();
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  window.PersonaConfig = {
    STORAGE_KEY,
    DEFAULTS,
    get,
    save,
    reset,
    refreshUI,
    buildTimeRule,
    buildCard,
    buildToneRule,
    buildPrivacyRule,
    buildThinkingRule,
  };
})();
