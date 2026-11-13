/* ==========================================================================
   Jarvis AI - Max Care Medication & Pill Reminder Subsystem (js/medication.js)
   Quản lý tủ thuốc, lịch uống thuốc theo cữ, nhắc nhở thông minh & lịch sử
   Chỉ kích hoạt giao diện khi chạy trong Native Android App (hoặc khi bật thủ công)
   ========================================================================== */

(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const showToast = (msg, type) => (typeof window.showToast === 'function') ? window.showToast(msg, type) : console.log(`[${type}] ${msg}`);
  const escapeHtml = str => (typeof window.escapeHtml === 'function') ? window.escapeHtml(str) : String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

  var maxMedications = [];
  var maxMedHistory = [];
  var maxFormSelectedTimes = ['08:00'];
  var maxEditingMedId = null;

  function isNativeAndroidApp() {
    return Boolean(window.JarvisNativeBridge && (window.JarvisNativeBridge.isNativeApp || window.JarvisNativeBridge.getItem));
  }

  function getTodayDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function loadMedicationData() {
    try {
      let medsRaw = null;
      let histRaw = null;

      if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.getItem === 'function') {
        medsRaw = window.JarvisNativeBridge.getItem('jarvis_medications');
        histRaw = window.JarvisNativeBridge.getItem('jarvis_med_history');
      } else {
        medsRaw = localStorage.getItem('jarvis_medications');
        histRaw = localStorage.getItem('jarvis_med_history');
      }

      maxMedications = medsRaw ? JSON.parse(medsRaw) : [];
      maxMedHistory = histRaw ? JSON.parse(histRaw) : [];

      // Đảm bảo mọi bản ghi lịch sử luôn có id duy nhất
      if (Array.isArray(maxMedHistory)) {
        maxMedHistory.forEach((h, i) => {
          if (!h.id) {
            h.id = 'take_' + (h.timestamp || Date.now()) + '_' + i;
          }
        });
      }

      // Nếu mới cài lần đầu chưa có thuốc nào, thêm 1-2 mẫu thân thiện để người dùng trải nghiệm ngay
      if (!maxMedications || maxMedications.length === 0) {
        maxMedications = [
          {
            id: 'med_sample_1',
            name: 'Vitamin C 500mg',
            dosage: '1 viên',
            type: 'pill',
            icon: '💊',
            times: ['08:00'],
            meal: 'Sau bữa ăn (30 phút) 🍽️',
            notes: 'Uống nhiều nước để hấp thu tốt',
            active: true,
            createdAt: Date.now()
          },
          {
            id: 'med_sample_2',
            name: 'Omega 3 Dầu cá',
            dosage: '2 viên',
            type: 'capsule',
            icon: '💊',
            times: ['12:00', '20:30'],
            meal: 'Trong bữa ăn 🥗',
            notes: 'Tốt cho mắt và trí nhớ',
            active: true,
            createdAt: Date.now()
          }
        ];
        saveMedicationData(false);
      }
    } catch (e) {
      console.warn('Lỗi nạp dữ liệu Max Care:', e);
      maxMedications = [];
      maxMedHistory = [];
    }
  }

  function saveMedicationData(syncAlarms = true) {
    try {
      const medsStr = JSON.stringify(maxMedications);
      const histStr = JSON.stringify(maxMedHistory);

      if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.setItem === 'function') {
        window.JarvisNativeBridge.setItem('jarvis_medications', medsStr);
        window.JarvisNativeBridge.setItem('jarvis_med_history', histStr);
        if (typeof window.JarvisNativeBridge.commit === 'function') {
          window.JarvisNativeBridge.commit();
        }
        if (syncAlarms && typeof window.JarvisNativeBridge.rescheduleAllMedications === 'function') {
          window.JarvisNativeBridge.rescheduleAllMedications();
        }
      } else {
        localStorage.setItem('jarvis_medications', medsStr);
        localStorage.setItem('jarvis_med_history', histStr);
      }
    } catch (e) {
      console.warn('Lỗi lưu dữ liệu Max Care:', e);
    }
  }

  function updateMedicationBadge() {
    const badge = $('max-med-badge');
    if (!badge) return;

    const todayStr = getTodayDateStr();
    let totalDosesToday = 0;
    let takenDosesToday = 0;

    maxMedications.filter(m => m.active).forEach(med => {
      (med.times || []).forEach(t => {
        totalDosesToday++;
        const isTaken = maxMedHistory.some(h => h.medId === med.id && h.timeStr === t && h.date === todayStr);
        if (isTaken) takenDosesToday++;
      });
    });

    const pending = Math.max(0, totalDosesToday - takenDosesToday);
    if (pending > 0) {
      badge.innerText = pending;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  function openMedicationModal() {
    const modal = $('max-medication-modal');
    if (!modal) {
      console.warn('Modal #max-medication-modal không tìm thấy trong DOM!');
      return;
    }
    loadMedicationData();
    modal.style.display = 'flex';
    switchMaxTab('today');
  }

  function closeMedicationModal() {
    const modal = $('max-medication-modal');
    if (modal) modal.style.display = 'none';
    updateMedicationBadge();
  }

  function switchMaxTab(tabName) {
    document.querySelectorAll('.max-nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.max-tab-content').forEach(c => c.classList.remove('active'));

    const target = $('max-tab-view-' + tabName);
    if (target) target.classList.add('active');

    if (tabName === 'today') renderMaxTodaySchedule();
    else if (tabName === 'cabinet') renderMaxCabinetList();
    else if (tabName === 'history') renderMaxHistoryList();
  }

  function renderMaxTodaySchedule() {
    const container = $('max-today-list');
    if (!container) return;

    const todayStr = getTodayDateStr();
    const activeMeds = maxMedications.filter(m => m.active);

    // Thu thập toàn bộ các cữ thuốc trong ngày
    const allDoses = [];
    activeMeds.forEach(med => {
      (med.times || []).forEach(timeStr => {
        const isTaken = maxMedHistory.some(h => h.medId === med.id && h.timeStr === timeStr && h.date === todayStr);
        const historyRecord = maxMedHistory.find(h => h.medId === med.id && h.timeStr === timeStr && h.date === todayStr);
        allDoses.push({
          med,
          timeStr,
          isTaken,
          takenRecord: historyRecord
        });
      });
    });

    // Sắp xếp theo giờ tăng dần (VD: 08:00 -> 12:00 -> 20:30)
    allDoses.sort((a, b) => a.timeStr.localeCompare(b.timeStr));

    // Cập nhật thanh tiến độ
    const total = allDoses.length;
    const takenCount = allDoses.filter(d => d.isTaken).length;
    const percent = total > 0 ? Math.round((takenCount / total) * 100) : 0;

    const textEl = $('max-progress-text');
    const percentEl = $('max-progress-percent');
    const fillEl = $('max-progress-bar-fill');
    const speechEl = $('max-mascot-speech');

    if (textEl) textEl.innerText = `Hôm nay: Đã uống ${takenCount}/${total} liều`;
    if (percentEl) percentEl.innerText = `${percent}%`;
    if (fillEl) fillEl.style.width = `${percent}%`;

    if (speechEl) {
      function getMaxGreeting() {
        const h = new Date().getHours();
        if (h >= 5 && h < 11) return "Gâu Gâu! Chào buổi sáng! Hãy khởi đầu ngày mới tràn đầy năng lượng và nhớ uống thuốc đầy đủ nhé!";
        if (h >= 11 && h < 14) return "Gâu Gâu! Chúc bạn bữa trưa ngon miệng! Nhớ kiểm tra cữ thuốc buổi trưa nha!";
        if (h >= 14 && h < 18) return "Gâu Gâu! Buổi chiều an lành! Đừng quên uống đủ nước và cữ thuốc buổi chiều nhé!";
        return "Gâu Gâu! Buổi tối thư giãn! Nhớ cữ thuốc buổi tối trước khi nghỉ ngơi để ngủ thật ngon nhé!";
      }

      if (total === 0) {
        speechEl.innerText = "Gâu Gâu! Chưa có lịch uống thuốc nào hôm nay. Hãy thêm thuốc vào Tủ nhé!";
      } else if (takenCount === total) {
        speechEl.innerText = "Gâu Gâu! Tuyệt vời lắm! Bạn đã hoàn thành tất cả các cữ thuốc hôm nay rồi!";
      } else if (takenCount > 0) {
        speechEl.innerText = `Gâu Gâu! Đã uống ${takenCount}/${total} cữ rồi! Còn ${total - takenCount} cữ nữa thôi, cố lên nhé!`;
      } else {
        speechEl.innerText = getMaxGreeting();
      }
    }

    if (allDoses.length === 0) {
      container.innerHTML = `
        <div class="max-empty-state">
          <div class="max-empty-mascot">🐶</div>
          <div class="max-empty-title">Tủ thuốc đang trống</div>
          <div class="max-empty-desc">Bạn chưa lên lịch uống thuốc nào. Hãy bấm sang tab <b>"Tủ thuốc"</b> để thêm thuốc mới nhé!</div>
        </div>
      `;
      return;
    }

    // Phân nhóm theo 4 khung giờ: Sáng, Trưa, Chiều, Tối
    const sections = {
      morning: { label: '🌅 Buổi Sáng (06:00 - 11:00)', items: [] },
      noon: { label: '☀️ Buổi Trưa (11:00 - 14:00)', items: [] },
      afternoon: { label: '🌇 Buổi Chiều (14:00 - 18:00)', items: [] },
      evening: { label: '🌙 Buổi Tối (18:00 - 23:59)', items: [] }
    };

    allDoses.forEach(dose => {
      const hour = parseInt(dose.timeStr.split(':')[0], 10);
      if (hour < 11) sections.morning.items.push(dose);
      else if (hour < 14) sections.noon.items.push(dose);
      else if (hour < 18) sections.afternoon.items.push(dose);
      else sections.evening.items.push(dose);
    });

    let html = '';
    Object.keys(sections).forEach(secKey => {
      const sec = sections[secKey];
      if (sec.items.length === 0) return;

      html += `
        <div class="max-time-section">
          <div class="max-time-section-title">${sec.label}</div>
      `;

      sec.items.forEach(item => {
        const m = item.med;
        const cardClass = item.isTaken ? 'max-med-card is-taken' : 'max-med-card';
        const icon = m.icon || '💊';
        const takenTimeDisplay = item.takenRecord ? new Date(item.takenRecord.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : item.timeStr;

        html += `
          <div class="${cardClass}" data-id="${m.id}" data-time="${item.timeStr}">
            <div class="max-med-card-body">
              <div class="max-med-icon-box">${icon}</div>
              <div class="max-med-info">
                <div class="max-med-name-row">
                  <span class="max-med-name">${escapeHtml(m.name)}</span>
                  <span class="max-pill-time-tag">⏰ ${item.timeStr}</span>
                </div>
                <div class="max-med-meta">
                  <span>💊 <b>${escapeHtml(m.dosage || '1 liều')}</b></span>
                  <span>• ${escapeHtml(m.meal || 'Sau bữa ăn')}</span>
                </div>
              </div>
            </div>
            <div class="max-med-actions">
        `;

        if (item.isTaken) {
          html += `
              <div class="max-badge-taken">
                ✓ Đã uống (${takenTimeDisplay})
              </div>
              <button class="max-btn-undo-pill" title="Hoàn tác (chưa uống)" onclick="window.maxUndoTaken('${m.id}', '${item.timeStr}')">↩️ Hoàn tác</button>
          `;
        } else {
          html += `
              <button class="max-btn-taken" onclick="window.maxMarkTaken('${m.id}', '${item.timeStr}')">
                ✅ Đã uống cữ này
              </button>
          `;
        }

        html += `
            </div>
          </div>
        `;
      });

      html += `</div>`;
    });

    container.innerHTML = html;
  }

  function renderMaxCabinetList() {
    const container = $('max-cabinet-list');
    if (!container) return;

    if (maxMedications.length === 0) {
      container.innerHTML = `
        <div class="max-empty-state">
          <div class="max-empty-mascot">💊</div>
          <div class="max-empty-title">Chưa có thuốc trong tủ</div>
          <div class="max-empty-desc">Bấm nút <b>"+ Thêm thuốc mới"</b> phía trên để thêm đơn thuốc hoặc vitamin của bạn.</div>
        </div>
      `;
      return;
    }

    let html = '';
    maxMedications.forEach(m => {
      const icon = m.icon || '💊';
      const timesPills = (m.times || []).map(t => `<span class="max-cab-time-tag">⏰ ${t}</span>`).join(' ');

      html += `
        <div class="max-cabinet-item" data-id="${m.id}">
          <div class="max-cab-main">
            <div class="max-med-icon-box">${icon}</div>
            <div class="max-med-info">
              <div class="max-med-name">${escapeHtml(m.name)}</div>
              <div class="max-med-meta">
                <span>${escapeHtml(m.dosage || '1 liều')}</span>
                <span>• ${escapeHtml(m.meal || 'Sau bữa ăn')}</span>
              </div>
              <div class="max-cab-times">${timesPills}</div>
            </div>
          </div>
          <div class="max-cab-controls">
            <label class="max-switch" title="Bật/Tắt chuông nhắc thuốc này">
              <input type="checkbox" ${m.active ? 'checked' : ''} onchange="window.maxToggleActive('${m.id}', this.checked)">
              <span class="max-slider"></span>
            </label>
            <button class="max-icon-btn" title="Chỉnh sửa thuốc" onclick="window.maxEditMedicine('${m.id}')">✏️</button>
            <button class="max-icon-btn" title="Xóa thuốc khỏi tủ" onclick="window.maxDeleteMedicine('${m.id}')">🗑️</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderMaxHistoryList() {
    const container = $('max-history-list');
    const totalTakenEl = $('max-history-total-taken');
    const streakEl = $('max-history-streak');

    if (!container) return;

    if (totalTakenEl) totalTakenEl.innerText = maxMedHistory.length;

    // Tính chuỗi ngày liên tục uống thuốc
    const uniqueDays = new Set(maxMedHistory.map(h => h.date));
    if (streakEl) streakEl.innerText = `${uniqueDays.size} ngày`;

    if (maxMedHistory.length === 0) {
      container.innerHTML = `
        <div class="max-empty-state">
          <div class="max-empty-mascot">📊</div>
          <div class="max-empty-title">Chưa có nhật ký uống thuốc</div>
          <div class="max-empty-desc">Khi bạn bấm xác nhận "Đã uống" hoặc bấm trên thông báo Android, Max sẽ ghi nhận lịch sử tại đây.</div>
        </div>
      `;
      return;
    }

    // Sắp xếp giảm dần theo thời gian (mới nhất lên đầu)
    const sorted = [...maxMedHistory].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let html = '';
    sorted.slice(0, 50).forEach(h => {
      const timeStr = h.timestamp ? new Date(h.timestamp).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : `${h.date} ${h.timeStr}`;

      html += `
        <div class="max-history-row" data-id="${h.id || ''}">
          <div class="max-hist-info">
            <span class="max-hist-name">🐶 ${escapeHtml(h.medName || 'Thuốc')}</span>
            <span class="max-hist-time">Đã uống lúc: ${timeStr} (Cữ: ${h.timeStr})</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span class="max-hist-status">✓ Đã uống</span>
            <button class="max-hist-delete-btn" title="Xóa cữ này khỏi lịch sử" onclick="window.maxDeleteHistoryItem('${h.id || ''}', '${h.medId || ''}', ${h.timestamp || 0})">🗑️</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function openMaxFormModal(editMed = null) {
    const formModal = $('max-form-modal');
    if (!formModal) return;

    maxEditingMedId = editMed ? editMed.id : null;
    const titleEl = $('max-form-title');
    if (titleEl) titleEl.innerText = editMed ? '✏️ Chỉnh sửa thuốc' : '➕ Thêm thuốc vào Tủ';

    const nameInput = $('max-input-name');
    const dosageInput = $('max-input-dosage');
    const mealSelect = $('max-select-meal');
    const notesInput = $('max-input-notes');

    if (nameInput) nameInput.value = editMed ? editMed.name : '';
    if (dosageInput) dosageInput.value = editMed ? (editMed.dosage || '1 viên') : '1 viên';
    if (mealSelect && editMed && editMed.meal) mealSelect.value = editMed.meal;
    if (notesInput) notesInput.value = editMed ? (editMed.notes || '') : '';

    // Type & Icon selector
    const currentType = editMed ? (editMed.type || 'pill') : 'pill';
    document.querySelectorAll('.max-type-opt').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-type') === currentType);
    });

    // Times list
    maxFormSelectedTimes = editMed && editMed.times && editMed.times.length ? [...editMed.times] : ['08:00'];
    renderFormSelectedTimes();

    formModal.style.display = 'flex';
  }

  function closeMaxFormModal() {
    const formModal = $('max-form-modal');
    if (formModal) formModal.style.display = 'none';
    maxEditingMedId = null;
  }

  function renderFormSelectedTimes() {
    const container = $('max-selected-times-list');
    if (!container) return;

    maxFormSelectedTimes.sort();

    // Cập nhật trạng thái active cho quick time chips
    document.querySelectorAll('.max-time-chip').forEach(btn => {
      const timeVal = btn.getAttribute('data-time');
      btn.classList.toggle('selected', maxFormSelectedTimes.includes(timeVal));
    });

    let html = '';
    maxFormSelectedTimes.forEach((t, i) => {
      html += `
        <span class="max-time-pill">
          ⏰ ${t}
          <span class="max-time-pill-del" onclick="window.maxRemoveFormTime(${i})" title="Bỏ giờ này">&times;</span>
        </span>
      `;
    });
    container.innerHTML = html;
  }

  function saveMedicineFromForm() {
    const nameInput = $('max-input-name');
    const dosageInput = $('max-input-dosage');
    const mealSelect = $('max-select-meal');
    const notesInput = $('max-input-notes');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      showToast('Vui lòng nhập tên thuốc hoặc thực phẩm chức năng!', 'warning');
      if (nameInput) nameInput.focus();
      return;
    }

    if (maxFormSelectedTimes.length === 0) {
      showToast('Vui lòng chọn ít nhất một khung giờ uống thuốc!', 'warning');
      return;
    }

    const dosage = dosageInput ? (dosageInput.value.trim() || '1 liều') : '1 liều';
    const meal = mealSelect ? mealSelect.value : 'Sau bữa ăn (30 phút) 🍽️';
    const notes = notesInput ? notesInput.value.trim() : '';

    const activeTypeOpt = document.querySelector('.max-type-opt.active');
    const type = activeTypeOpt ? activeTypeOpt.getAttribute('data-type') : 'pill';
    const icon = activeTypeOpt ? (activeTypeOpt.getAttribute('data-icon') || '💊') : '💊';

    if (maxEditingMedId) {
      // Cập nhật thuốc cũ
      const med = maxMedications.find(m => m.id === maxEditingMedId);
      if (med) {
        // Hủy các alarm cũ
        if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.cancelMedicationAlarm === 'function') {
          (med.times || []).forEach(t => window.JarvisNativeBridge.cancelMedicationAlarm(med.id, t));
        }
        med.name = name;
        med.dosage = dosage;
        med.type = type;
        med.icon = icon;
        med.times = [...maxFormSelectedTimes];
        med.meal = meal;
        med.notes = notes;
      }
    } else {
      // Thêm thuốc mới
      const newMed = {
        id: 'med_' + Date.now(),
        name: name,
        dosage: dosage,
        type: type,
        icon: icon,
        times: [...maxFormSelectedTimes],
        meal: meal,
        notes: notes,
        active: true,
        createdAt: Date.now()
      };
      maxMedications.push(newMed);
    }

    saveMedicationData(true);
    closeMaxFormModal();
    renderMaxCabinetList();
    renderMaxTodaySchedule();
    updateMedicationBadge();
    showToast(`🐶 Max: Đã lưu "${name}" vào Tủ thuốc thành công!`, 'success');
  }

  function setupMaxEventListeners() {
    // Mở modal từ nút Header và Sidebar
    $('btn-open-max-medication')?.addEventListener('click', (e) => {
      e.preventDefault();
      openMedicationModal();
    });
    $('btn-sidebar-max-medication')?.addEventListener('click', (e) => {
      e.preventDefault();
      openMedicationModal();
    });

    // Đóng modal
    $('btn-close-max-med')?.addEventListener('click', closeMedicationModal);
    $('btn-close-max-form')?.addEventListener('click', closeMaxFormModal);
    $('btn-cancel-max-form')?.addEventListener('click', closeMaxFormModal);

    // Chuyển tab
    document.querySelectorAll('.max-nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchMaxTab(tab);
      });
    });

    // Mở form thêm mới
    $('btn-add-new-med')?.addEventListener('click', () => openMaxFormModal());

    // Thử chuông thông báo Max (3 giây sau reo)
    $('btn-test-notification')?.addEventListener('click', () => {
      if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.testMedicationReminder === 'function') {
        window.JarvisNativeBridge.testMedicationReminder('Panadol Extra', '1 viên', 'Sau bữa ăn 🍽️');
        showToast('🐶 Max: Chuông thông báo mẫu sẽ reo sau 3 giây trên điện thoại...', 'info');
      } else {
        showToast('🐶 Max: Tính năng thử chuông chỉ hoạt động trên ứng dụng Android.', 'info');
      }
    });

    // Xóa toàn bộ lịch sử
    $('btn-clear-med-history')?.addEventListener('click', () => {
      if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử uống thuốc không?')) return;
      maxMedHistory = [];
      saveMedicationData(false);
      renderMaxHistoryList();
      renderMaxTodaySchedule();
      updateMedicationBadge();
      showToast('Đã xóa toàn bộ lịch sử uống thuốc.', 'info');
    });

    // Gợi ý tên thuốc
    document.querySelectorAll('#max-name-chips .max-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const name = chip.getAttribute('data-name');
        const input = $('max-input-name');
        if (input && name) {
          input.value = name;
          input.focus();
        }
      });
    });

    // Gợi ý liều lượng
    document.querySelectorAll('#max-dosage-chips .max-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const dose = chip.getAttribute('data-dose');
        const input = $('max-input-dosage');
        if (input && dose) input.value = dose;
      });
    });

    // Chọn dạng thuốc (Type selector)
    document.querySelectorAll('.max-type-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.max-type-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
    });

    // Chọn nhanh giờ (Sáng 08:00, Trưa 12:00, Chiều 17:30, Tối 20:30)
    document.querySelectorAll('.max-time-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const timeVal = btn.getAttribute('data-time');
        if (!timeVal) return;
        const idx = maxFormSelectedTimes.indexOf(timeVal);
        if (idx === -1) {
          maxFormSelectedTimes.push(timeVal);
        } else {
          if (maxFormSelectedTimes.length <= 1) {
            showToast('Cần ít nhất 1 khung giờ uống thuốc.', 'warning');
            return;
          }
          maxFormSelectedTimes.splice(idx, 1);
        }
        renderFormSelectedTimes();
      });
    });

    // Thêm giờ tùy chỉnh (custom time picker)
    $('btn-add-custom-time')?.addEventListener('click', () => {
      const picker = $('max-custom-time-picker');
      if (!picker || !picker.value) return;
      const val = picker.value.trim();
      if (!maxFormSelectedTimes.includes(val)) {
        maxFormSelectedTimes.push(val);
        renderFormSelectedTimes();
      }
      picker.value = '';
    });

    // Lưu từ form
    $('btn-save-max-med')?.addEventListener('click', saveMedicineFromForm);
  }

  function initMaxMedicationReminder() {
    if (!isNativeAndroidApp()) {
      // Trên môi trường trình duyệt thông thường (GitHub Pages): Hoàn toàn không hiển thị
      const btnHeader = $('btn-open-max-medication');
      if (btnHeader) btnHeader.style.display = 'none';
      const btnSidebar = $('btn-sidebar-max-medication');
      if (btnSidebar) btnSidebar.style.display = 'none';
      return;
    }

    // Khi chạy trong Native Android App: Hiện các nút mở Max Care
    const btnHeader = $('btn-open-max-medication');
    if (btnHeader) btnHeader.style.display = 'inline-flex';
    const btnSidebar = $('btn-sidebar-max-medication');
    if (btnSidebar) btnSidebar.style.display = 'flex';

    loadMedicationData();
    updateMedicationBadge();
    setupMaxEventListeners();

    window.onMedicationStatusChanged = function(medId, timeStr, status) {
      loadMedicationData();
      renderMaxTodaySchedule();
      renderMaxCabinetList();
      renderMaxHistoryList();
      updateMedicationBadge();
    };

    window.reloadMaxMedicationsFromStorage = function() {
      loadMedicationData();
      renderMaxTodaySchedule();
      renderMaxCabinetList();
      renderMaxHistoryList();
      updateMedicationBadge();
      if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.rescheduleAllMedications === 'function') {
        try { window.JarvisNativeBridge.rescheduleAllMedications(); } catch (e) {}
      }
    };
  }

  // Window action bindings & exports
  window.openMedicationTab = openMedicationModal;
  window.openMedicationModal = openMedicationModal;
  window.closeMedicationModal = closeMedicationModal;
  window.openMaxFormModal = openMaxFormModal;
  window.closeMaxFormModal = closeMaxFormModal;
  window.switchMaxTab = switchMaxTab;
  window.initMaxMedicationReminder = initMaxMedicationReminder;

  window.maxMarkTaken = function(medId, timeStr) {
    const med = maxMedications.find(m => m.id === medId);
    if (!med) return;

    const todayStr = getTodayDateStr();
    const existing = maxMedHistory.find(h => h.medId === medId && h.timeStr === timeStr && h.date === todayStr);
    if (existing) return;

    const record = {
      id: 'take_' + Date.now(),
      medId: medId,
      medName: med.name,
      timeStr: timeStr,
      date: todayStr,
      timestamp: Date.now()
    };

    maxMedHistory.push(record);
    saveMedicationData(false);

    if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.markMedicationTakenNative === 'function') {
      window.JarvisNativeBridge.markMedicationTakenNative(medId, med.name, timeStr);
    }

    renderMaxTodaySchedule();
    updateMedicationBadge();
    showToast(`🐶 Max: Giỏi lắm! Đã ghi nhận bạn uống ${med.name}`, 'success');
  };

  window.maxUndoTaken = function(medId, timeStr) {
    const todayStr = getTodayDateStr();
    const idx = maxMedHistory.findIndex(h => h.medId === medId && h.timeStr === timeStr && h.date === todayStr);
    if (idx !== -1) {
      maxMedHistory.splice(idx, 1);
      saveMedicationData(false);
      renderMaxTodaySchedule();
      updateMedicationBadge();
      showToast('Đã hoàn tác cữ thuốc.', 'info');
    }
  };

  window.maxToggleActive = function(medId, active) {
    const med = maxMedications.find(m => m.id === medId);
    if (!med) return;
    med.active = active;
    saveMedicationData(true);
    renderMaxTodaySchedule();
    updateMedicationBadge();
    showToast(active ? `Đã bật chuông nhắc cho ${med.name}` : `Đã tạm tắt nhắc nhở cho ${med.name}`, 'info');
  };

  window.maxDeleteMedicine = function(medId) {
    const med = maxMedications.find(m => m.id === medId);
    if (!med) return;
    if (!confirm(`Bạn có chắc muốn xóa "${med.name}" khỏi Tủ thuốc không?`)) return;

    // Hủy toàn bộ alarm trên Android native
    if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.cancelMedicationAlarm === 'function') {
      (med.times || []).forEach(t => {
        window.JarvisNativeBridge.cancelMedicationAlarm(med.id, t);
      });
    }

    maxMedications = maxMedications.filter(m => m.id !== medId);
    saveMedicationData(true);
    renderMaxCabinetList();
    renderMaxTodaySchedule();
    updateMedicationBadge();
    showToast(`Đã xóa "${med.name}" khỏi tủ thuốc.`, 'info');
  };

  window.maxEditMedicine = function(medId) {
    const med = maxMedications.find(m => m.id === medId);
    if (!med) return;
    openMaxFormModal(med);
  };

  window.maxRemoveFormTime = function(index) {
    if (maxFormSelectedTimes.length <= 1) {
      showToast('Cần ít nhất 1 khung giờ uống thuốc trong ngày.', 'warning');
      return;
    }
    maxFormSelectedTimes.splice(index, 1);
    renderFormSelectedTimes();
  };

  window.maxDeleteHistoryItem = function(histId, medId, timestamp) {
    let idx = -1;
    if (histId) {
      idx = maxMedHistory.findIndex(h => h.id === histId);
    }
    if (idx === -1 && timestamp) {
      idx = maxMedHistory.findIndex(h => Number(h.timestamp) === Number(timestamp));
    }
    if (idx === -1 && medId) {
      idx = maxMedHistory.findIndex(h => h.medId === medId);
    }
    if (idx !== -1) {
      const removed = maxMedHistory.splice(idx, 1)[0];
      saveMedicationData(false);
      renderMaxHistoryList();
      renderMaxTodaySchedule();
      updateMedicationBadge();
      showToast(`Đã xóa cữ "${removed?.medName || 'thuốc'}" khỏi lịch sử.`, 'info');
    } else {
      showToast('Không tìm thấy mục cần xóa.', 'error');
    }
  };

  // Tự khởi chạy nếu DOM đã sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMaxMedicationReminder);
  } else {
    setTimeout(initMaxMedicationReminder, 80);
  }

})();
