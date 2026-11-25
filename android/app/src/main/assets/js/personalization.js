/* ==========================================================================
   Jarvis AI - Personalization (Persona Profile, Facts Store, UI Density)
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;
  const showToast = (msg, type) =>
    typeof window.showToast === 'function' ? window.showToast(msg, type) : console.log(`[${type}] ${msg}`);

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
    if (typeof window.showToast === 'function') showToast('✅ Đã lưu hồ sơ cá nhân!', 'success');
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

  // Modal UI (lazy create)
  let modalEl = null;
  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.id = 'personalization-modal';
    modalEl.style.cssText =
      'display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;padding:16px;';
    modalEl.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--radius-lg);padding:20px;max-width:560px;width:100%;max-height:90vh;overflow:auto;border:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;color:var(--text-main);">👤 Cá nhân hóa Jarvis</h3>
          <button id="pers-close" class="btn" style="padding:4px 10px;">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <label style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">Tên của bạn</label>
          <input id="pers-name" class="modern-input" placeholder="Ví dụ: Kevin" />
          <label style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">Vai trò / nghề nghiệp</label>
          <input id="pers-role" class="modern-input" placeholder="Ví dụ: Kỹ sư phần mềm" />
          <label style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">Phong cách trả lời mong muốn</label>
          <select id="pers-style" class="modern-select">
            <option value="Cân bằng, rõ ràng">Cân bằng, rõ ràng</option>
            <option value="Ngắn gọn, đi thẳng vấn đề">Ngắn gọn, đi thẳng vấn đề</option>
            <option value="Chi tiết, giải thích sâu">Chi tiết, giải thích sâu</option>
            <option value="Thân thiện, hài hước">Thân thiện, hài hước</option>
          </select>
          <label style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">Sở thích / chủ đề quan tâm</label>
          <input id="pers-interests" class="modern-input" placeholder="Ví dụ: AI, lập trình, năng suất" />
          <label style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">Ghi chú thêm</label>
          <textarea id="pers-notes" class="modern-input" rows="3" placeholder="Thông tin khác Jarvis nên nhớ..."></textarea>
          <label style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">Mật độ giao diện</label>
          <select id="pers-density" class="modern-select">
            <option value="comfortable">Thoải mái (mặc định)</option>
            <option value="compact">Gọn (compact)</option>
          </select>
          <button id="pers-save" class="btn primary" style="margin-top:6px;">💾 Lưu hồ sơ</button>
        </div>
        <hr style="margin:16px 0;border-color:var(--border);" />
        <h4 style="margin:0 0 8px 0;color:var(--text-main);">🧠 Facts dài hạn</h4>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <input id="pers-fact-input" class="modern-input" placeholder="Thêm một sự kiện cần nhớ..." style="flex:1;" />
          <button id="pers-fact-add" class="btn" style="padding:6px 12px;">➕</button>
        </div>
        <div id="pers-facts-list" style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow:auto;"></div>
      </div>`;
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', e => {
      if (e.target === modalEl) closeModal();
    });
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
      setDensity($('pers-density').value);
      renderFacts();
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
      c.innerHTML = '<div style="color:var(--text-muted);font-size:0.78rem;">Chưa có fact nào.</div>';
      return;
    }
    c.innerHTML = facts
      .map(
        f =>
          `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--input-bg);border-radius:6px;border:1px solid var(--border);">
            <span style="flex:1;font-size:0.8rem;color:var(--text-main);">${escapeHtml(f.text)}</span>
            <button class="btn" style="padding:2px 8px;font-size:0.75rem;" data-fid="${f.id}">🗑️</button>
          </div>`
      )
      .join('');
    c.querySelectorAll('button[data-fid]').forEach(b => {
      b.onclick = () => {
        removeFact(b.getAttribute('data-fid'));
        renderFacts();
      };
    });
  }

  function escapeHtml(str) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(str)
      : String(str || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
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
  window.openPersonalizationModal = openModal;

  // Command palette hook (if commands.js loaded later, it reads window)
})();
