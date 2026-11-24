import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function loadModule(relativePath) {
  const code = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
  eval(code);
}

describe('color-tags.js', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="session-color-picker">
        <span class="color-chip-btn" data-color="#2563eb"></span>
        <span class="color-chip-btn" data-color="#ef4444"></span>
        <span class="color-chip-btn" data-color="none"></span>
      </div>`;
    loadModule('js/color-tags.js');
  });

  it('đánh dấu active đúng màu của phiên đang mở', () => {
    window.sessions = [{ id: 's1', color: '#ef4444' }];
    window.activeId = 's1';
    window.updateColorPickerUI();
    const chips = [...document.querySelectorAll('#session-color-picker .color-chip-btn')];
    expect(chips.find(c => c.dataset.color === '#ef4444').classList.contains('active')).toBe(true);
    expect(chips.find(c => c.dataset.color === '#2563eb').classList.contains('active')).toBe(false);
  });

  it('phiên không có màu thì chip "none" được active', () => {
    window.sessions = [{ id: 's2' }];
    window.activeId = 's2';
    window.updateColorPickerUI();
    const noneChip = document.querySelector('.color-chip-btn[data-color="none"]');
    expect(noneChip.classList.contains('active')).toBe(true);
  });
});

describe('follow-up-chips.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.escapeHtml = str =>
      String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    loadModule('js/follow-up-chips.js');
  });

  it('render đúng số chip và escape HTML', () => {
    const box = window.renderFollowUpChips(['<b>Nguy hiểm</b>', 'Câu hỏi 2']);
    expect(box).not.toBeNull();
    const buttons = box.querySelectorAll('.follow-up-chip');
    expect(buttons).toHaveLength(2);
    expect(box.innerHTML).toContain('&lt;b&gt;Nguy hiểm&lt;/b&gt;');
    expect(box.innerHTML).not.toContain('<b>Nguy hiểm</b>');
  });

  it('trả về null khi không có gợi ý', () => {
    expect(window.renderFollowUpChips([])).toBeNull();
    expect(window.renderFollowUpChips(null)).toBeNull();
  });
});
