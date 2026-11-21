import { describe, it, expect, beforeEach, vi } from 'vitest';

function loadBlobModule() {
  const code = `
    async function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    function base64ToBlob(base64, mimeType) {
      const byteChars = atob(base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function saveBlobViaNative(blob, filename, mimeType) {
      if (window.Android && typeof window.Android.saveFile === 'function') {
        const base64 = await blobToBase64(blob);
        return window.Android.saveFile(base64, filename, mimeType);
      }
      downloadBlob(blob, filename);
    }

    async function shareContent(data) {
      if (navigator.share) {
        try {
          await navigator.share(data);
          return true;
        } catch (e) {
          if (e.name !== 'AbortError') console.warn('Share API failed:', e);
        }
      }
      if (data.text && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(data.text);
          return true;
        } catch (e) {
          console.warn('Clipboard fallback failed:', e);
        }
      }
      return false;
    }

    async function copyToClipboard(text, toastMsg = 'Đã copy!') {
      try {
        await navigator.clipboard.writeText(text);
        if (typeof window.showToast === 'function') window.showToast(toastMsg, 'success');
        return true;
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        if (typeof window.showToast === 'function') window.showToast(toastMsg, 'success');
        return true;
      }
    }

    window.__TEST_EXPORTS__ = {
      blobToBase64,
      base64ToBlob,
      downloadBlob,
      saveBlobViaNative,
      shareContent,
      copyToClipboard,
    };
  `;
  eval(code);
  return window.__TEST_EXPORTS__;
}

describe('blob.js', () => {
  let blob;

  beforeEach(() => {
    blob = loadBlobModule();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    
    // Mock document.execCommand
    document.execCommand = vi.fn().mockReturnValue(true);
  });

  describe('blobToBase64', () => {
    it('converts blob to base64 string', async () => {
      const testBlob = new Blob(['hello world'], { type: 'text/plain' });
      const result = await blob.blobToBase64(testBlob);
      expect(result).toBe('dGVzdA=='); // base64 of 'test' (from mock)
    });

    it('rejects on FileReader error', async () => {
      const testBlob = new Blob(['test'], { type: 'text/plain' });
      const OriginalFileReader = global.FileReader;
      global.FileReader = class extends OriginalFileReader {
        readAsDataURL() {
          setTimeout(() => this.onerror?.({ target: this }), 0);
        }
      };
      
      await expect(blob.blobToBase64(testBlob)).rejects.toBeDefined();
      global.FileReader = OriginalFileReader;
    });
  });

  describe('base64ToBlob', () => {
    it('converts base64 string to blob with correct mime type', () => {
      const base64 = 'SGVsbG8='; // "Hello"
      const result = blob.base64ToBlob(base64, 'text/plain');
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('text/plain');
    });

    it('handles empty base64', () => {
      const result = blob.base64ToBlob('', 'application/octet-stream');
      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBe(0);
    });
  });

  describe('downloadBlob', () => {
    it('creates object URL', () => {
      const testBlob = new Blob(['content'], { type: 'text/plain' });
      
      blob.downloadBlob(testBlob, 'test.txt');
      
      expect(URL.createObjectURL).toHaveBeenCalledWith(testBlob);
    });
  });

  describe('saveBlobViaNative', () => {
    it('uses Android bridge when available', async () => {
      window.Android = { saveFile: vi.fn().mockResolvedValue(true) };
      const testBlob = new Blob(['content'], { type: 'text/plain' });
      
      await blob.saveBlobViaNative(testBlob, 'test.txt', 'text/plain');
      
      expect(window.Android.saveFile).toHaveBeenCalledWith('dGVzdA==', 'test.txt', 'text/plain');
    });

    it('falls back to downloadBlob when no Android bridge', async () => {
      delete window.Android;
      const testBlob = new Blob(['content'], { type: 'text/plain' });
      
      await blob.saveBlobViaNative(testBlob, 'test.txt', 'text/plain');
      
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  describe('shareContent', () => {
    it('uses navigator.share when available', async () => {
      navigator.share.mockResolvedValue(undefined);
      const result = await blob.shareContent({ text: 'Hello', title: 'Test' });
      expect(result).toBe(true);
      expect(navigator.share).toHaveBeenCalledWith({ text: 'Hello', title: 'Test' });
    });

    it('falls back to clipboard when share fails with AbortError', async () => {
      navigator.share.mockRejectedValue({ name: 'AbortError' });
      navigator.clipboard.writeText.mockResolvedValue(undefined);
      
      const result = await blob.shareContent({ text: 'Fallback text' });
      expect(result).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Fallback text');
    });

    it('falls back to clipboard when share fails with other error', async () => {
      navigator.share.mockRejectedValue(new Error('Not supported'));
      navigator.clipboard.writeText.mockResolvedValue(undefined);
      
      const result = await blob.shareContent({ text: 'Fallback text' });
      expect(result).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Fallback text');
    });

    it('returns false when both share and clipboard unavailable', async () => {
      navigator.share.mockRejectedValue(new Error('Not supported'));
      navigator.clipboard.writeText.mockRejectedValue(new Error('Not supported'));
      
      const result = await blob.shareContent({ text: 'Test' });
      expect(result).toBe(false);
    });
  });

  describe('copyToClipboard', () => {
    it('uses navigator.clipboard.writeText', async () => {
      navigator.clipboard.writeText.mockResolvedValue(undefined);
      const result = await blob.copyToClipboard('Hello world');
      expect(result).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello world');
      expect(showToast).toHaveBeenCalledWith('Đã copy!', 'success');
    });

    it('falls back to execCommand when clipboard API fails', async () => {
      navigator.clipboard.writeText.mockRejectedValue(new Error('Not allowed'));
      
      const result = await blob.copyToClipboard('Fallback copy');
      expect(result).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
      expect(showToast).toHaveBeenCalledWith('Đã copy!', 'success');
    });

    it('uses custom toast message', async () => {
      navigator.clipboard.writeText.mockResolvedValue(undefined);
      await blob.copyToClipboard('Test', 'Custom message');
      expect(showToast).toHaveBeenCalledWith('Custom message', 'success');
    });
  });
});