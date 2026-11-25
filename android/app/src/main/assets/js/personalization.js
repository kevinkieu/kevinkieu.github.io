/* ==========================================================================
   Jarvis AI - Personalization (Persona Profile, Facts Store, UI Density)
   ========================================================================== */

(function () {
  'use strict';

  const $ = window.$;
  const ls = window.ls;
  const showToast = window.showToast;
  const escapeHtml = window.escapeHtml;

  const PROFILE_KEY = 'jarvis_persona_profile';
  const FACTS_KEY = 'jarvis_facts';
  const DENSITY_KEY = 'jarvis_ui_density';

  function getProfile() {
    try {
      return JSON.parse(ls.getItem(PROFILE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }
  function saveProfile(p) {
    ls.setItem(PROFILE_KEY, JSON.stringify(p || {}));

  }

  function getFacts() {
    try {
      return JSON.parse(ls.getItem(FACTS_KEY) || '[]') || [];
    } catch {
      return [];
    }
  }
  function saveFacts(f) {
    ls.setItem(FACTS_KEY, JSON.stringify(f || []));
  }
  function addFact(text) {
    const t = (text || '').trim();
    if (!t) return null;
    const facts = getFacts();
    const item = { id: 'f_' + Date.now(), text: t, createdAt: Date.now() };
    facts.unshift(item);
    saveFacts(facts);
    return item;
  }
  function removeFact(id) {
    saveFacts(getFacts().filter(f => f.id !== id));
  }

  function getDensity() {
    return ls.getItem(DENSITY_KEY) || 'comfortable';
  }
  function setDensity(d) {
    ls.setItem(DENSITY_KEY, d === 'compact' ? 'compact' : 'comfortable');
    applyDensity();
  }
  function applyDensity() {
    document.body.classList.toggle('compact-ui', getDensity() === 'compact');
  }

  function buildPromptBlock() {
    const p = getProfile();
    const facts = getFacts();
    const lines = [];
    if (p.name || p.role || p.style || p.interests || p.notes) {
      lines.push('[HỒ SƠ NGƯỜI DÙNG]');
      if (p.name) lines.push('Tên: ' + p.name);
      if (p.role) lines.push('Vai trò: ' + p.role);
      if (p.style) lines.push('Phong cách trả lời mong muốn: ' + p.style);
      if (p.interests) lines.push('Sở thích/chủ đề quan tâm: ' + p.interests);
      if (p.notes) lines.push('Ghi chú thêm: ' + p.notes);
    }
    if (facts.length) {
      lines.push('[SỰ KIỆN/FACTS DÀI HẠN VỀ NGƯỜI DÙNG]');
      facts.slice(0, 30).forEach(f => lines.push('- ' + f.text));
    }
    return lines.join('\n');
  }

  // Modal UI dùng lại .modal-box và #modal-overlay của app (lazy create)
  let modalEl = null;
  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.id = 'personalization-modal';
    modalEl.className = 'modal-box';
    modalEl.innerHTML = `
      <div class="modal-header">
        <h3>👤 Cá nhân hóa Jarvis</h3>
        <button id="pers-close" class="btn pers-close" aria-label="Đóng">✕</button>
      </div>
      <div class="modal-scroll-body">
        <fieldset class="settings-group">
          <legend>👤 Hồ sơ người dùng</legend>
          <div class="pers-form">
            <div>
              <label class="field-label" for="pers-name">Tên của bạn</label>
              <input id="pers-name" class="modern-input" placeholder="Ví dụ: Kevin" />
            </div>
            <div>
              <label class="field-label" for="pers-role">Vai trò / nghề nghiệp</label>
              <input id="pers-role" class="modern-input" placeholder="Ví dụ: Kỹ sư phần mềm" />
            </div>
            <div>
              <label class="field-label" for="pers-style">Phong cách trả lời mong muốn</label>
              <select id="pers-style" class="modern-select">
                <option value="Cân bằng, rõ ràng">Cân bằng, rõ ràng</option>
                <option value="Ngắn gọn, đi thẳng vấn đề">Ngắn gọn, đi thẳng vấn đề</option>
                <option value="Chi tiết, giải thích sâu">Chi tiết, giải thích sâu</option>
                <option value="Thân thiện, hài hước">Thân thiện, hài hước</option>
              </select>
            </div>
            <div>
              <label class="field-label" for="pers-interests">Sở thích / chủ đề quan tâm</label>
              <input id="pers-interests" class="modern-input" placeholder="Ví dụ: AI, lập trình, năng suất" />
            </div>
            <div>
              <label class="field-label" for="pers-notes">Ghi chú thêm</label>
              <textarea id="pers-notes" class="modern-input" rows="3" placeholder="Thông tin khác Jarvis nên nhớ..."></textarea>
            </div>
            <div>
              <label class="field-label" for="pers-density">Mật độ giao diện</label>
              <select id="pers-density" class="modern-select">
                <option value="comfortable">Thoải mái (mặc định)</option>
                <option value="compact">Gọn (compact)</option>
              </select>
            </div>
            <button id="pers-save" class="btn primary">💾 Lưu hồ sơ</button>
          </div>
        </fieldset>
        <fieldset class="settings-group">
          <legend>🧠 Facts dài hạn</legend>
          <div class="pers-fact-form">
            <input id="pers-fact-input" class="modern-input" placeholder="Thêm một sự kiện cần nhớ..." />
            <button id="pers-fact-add" class="btn" aria-label="Thêm fact">➕</button>
          </div>
          <div id="pers-facts-list" class="pers-facts-list"></div>
        </fieldset>
      </div>`;
    document.body.appendChild(modalEl);

    $('pers-close').onclick = closeModal;
    $('pers-save').onclick = () => {
      const p = {
        name: $('pers-name').value.trim(),
        role: $('pers-role').value.trim(),
        style: $('pers-style').value,
        interests: $('pers-interests').value.trim(),
        notes: $('pers-notes').value.trim(),
      };
      saveProfile(p);
      showToast('✅ Đã lưu hồ sơ cá nhân!', 'success');
      setDensity($('pers-density').value);
    };
    $('pers-fact-add').onclick = () => {
      const v = $('pers-fact-input').value.trim();
      if (!v) return;
      addFact(v);
      $('pers-fact-input').value = '';
      renderFacts();
      showToast('🧠 Đã ghi nhớ!', 'success');
    };
    $('pers-fact-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') $('pers-fact-add').click();
    });
    return modalEl;
  }

  function renderFacts() {
    const c = $('pers-facts-list');
    if (!c) return;
    const facts = getFacts();
    if (!facts.length) {
      c.innerHTML = '<div class="pers-empty">Chưa có fact nào.</div>';
      return;
    }
    c.innerHTML = facts
      .map(
        f =>
          `<div class="pers-fact-row">
            <span class="pers-fact-text">${escapeHtml(f.text)}</span>
            <button class="btn pers-fact-remove" data-fid="${escapeHtml(f.id)}" aria-label="Xoá fact">🗑️</button>
          </div>`
      )
      .join('');
    c.querySelectorAll('button[data-fid]').forEach(b => {
      b.onclick = () => {
        removeFact(b.dataset.fid);
        renderFacts();
      };
    });
  }


  function openModal() {
    ensureModal();
    const p = getProfile();
    $('pers-name').value = p.name || '';
    $('pers-role').value = p.role || '';
    $('pers-style').value = p.style || 'Cân bằng, rõ ràng';
    $('pers-interests').value = p.interests || '';
    $('pers-notes').value = p.notes || '';
    $('pers-density').value = getDensity();
    renderFacts();
    modalEl.style.display = 'flex';
    const oLay = $('modal-overlay');
    if (oLay) oLay.style.display = 'block';
  }

  function closeModal() {
    if (modalEl) modalEl.style.display = 'none';
    const oLay = $('modal-overlay');
    if (oLay) oLay.style.display = 'none';
  }

  // Init
  applyDensity();

  window.Personalization = {
    getProfile,
    saveProfile,
    getFacts,
    addFact,
    removeFact,
    getDensity,
    setDensity,
    buildPromptBlock,
    openModal,
  };



})();
