/* ==========================================================================
   Jarvis AI - Cipher & Security Helpers (js/cipher.js)
   Helpers mã hóa/giải mã API keys và sanitize session cho backup.
   ========================================================================== */

(function() {
  'use strict';

  const ls = window.ls || localStorage;

  // --- CIPHER CONSTANTS ---
  const CIPHER_SECRET = "JarvisAI_SecretKey_Protect_2026_X9!";

  // --- KEY OBFUSCATION ---
  function obfuscateKey(k) {
    if (!k || typeof k !== 'string') return '';
    try {
      const salt = Math.random().toString(36).slice(2, 10);
      const fullKey = CIPHER_SECRET + salt;
      const utf8Bytes = new TextEncoder().encode(k);
      const outBytes = new Uint8Array(utf8Bytes.length);
      for (let i = 0; i < utf8Bytes.length; i++) {
        outBytes[i] = utf8Bytes[i] ^ fullKey.charCodeAt(i % fullKey.length) ^ ((i * 31 + 17) & 0xFF);
      }
      let binStr = '';
      for (let i = 0; i < outBytes.length; i++) {
        binStr += String.fromCharCode(outBytes[i]);
      }
      return 'JVENC_' + salt + '_' + btoa(binStr);
    } catch (e) {
      try {
        return 'ENC_' + btoa(unescape(encodeURIComponent(k.split('').reverse().join(''))));
      } catch {
        return 'ENC_' + btoa(k.split('').reverse().join(''));
      }
    }
  }

  function deobfuscateKey(k) {
    if (!k || typeof k !== 'string') return '';
    if (k.startsWith('JVENC_')) {
      try {
        const parts = k.slice(6).split('_');
        if (parts.length >= 2) {
          const salt = parts[0];
          const b64 = parts.slice(1).join('_');
          const fullKey = CIPHER_SECRET + salt;
          const binStr = atob(b64);
          const outBytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) {
            outBytes[i] = binStr.charCodeAt(i) ^ ((i * 31 + 17) & 0xFF) ^ fullKey.charCodeAt(i % fullKey.length);
          }
          return new TextDecoder().decode(outBytes);
        }
      } catch (e) {
        console.warn('JVENC decode failed:', e);
      }
    }
    if (k.startsWith('ENC_')) {
      try {
        const rawB64 = k.slice(4);
        return decodeURIComponent(escape(atob(rawB64))).split('').reverse().join('');
      } catch {
        try {
          return atob(k.slice(4)).split('').reverse().join('');
        } catch {
          return k;
        }
      }
    }
    return k;
  }

  // --- SESSION SANITIZATION FOR BACKUP ---
  function sanitizeSessionForBackup(session) {
    if (!session || typeof session !== 'object') return session;
    const clean = JSON.parse(JSON.stringify(session));
    clean.assignedApiKey = null;
    if (Array.isArray(clean.his)) {
      clean.his.forEach(msg => {
        if (typeof msg.text === 'string') {
          msg.text = msg.text
            .replace(/AIzaSy[A-Za-z0-9_-]{30,40}/g, 'AIzaSy[PROTECTED_BY_JARVIS]')
            .replace(/tvly-[A-Za-z0-9_-]{20,40}/g, 'tvly-[PROTECTED_BY_JARVIS]')
            .replace(/jina_[A-Za-z0-9_-]{20,}/g, 'jina_[PROTECTED_BY_JARVIS]')
            .replace(/ghp_[A-Za-z0-9]{30,45}/g, 'ghp_[PROTECTED_BY_JARVIS]')
            .replace(/github_pat_[A-Za-z0-9_]{30,}/g, 'github_pat_[PROTECTED_BY_JARVIS]');
        }
      });
    }
    return clean;
  }

  // --- Window exports ---
  window.obfuscateKey = obfuscateKey;
  window.deobfuscateKey = deobfuscateKey;
  window.sanitizeSessionForBackup = sanitizeSessionForBackup;

})();