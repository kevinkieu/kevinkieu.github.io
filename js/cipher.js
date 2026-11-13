/* ==========================================================================
   Jarvis AI - Cipher & Security Helpers (js/cipher.js)
   ==========================================================================
   NOTE: Client-side "encryption" using btoa/atob provides ZERO real security.
   API keys stored this way can be trivially decoded by anyone inspecting the code.
   This module exists only for compatibility with existing backup formats.
   Real key security requires server-side protection - see README for details.
   ========================================================================== */

(function() {
  'use strict';

  const ls = window.ls || localStorage;

  // --- KEY STORAGE HELPERS ---
  // These functions exist only for reading/writing previously obfuscated keys
  // from backup files. They do NOT provide actual security - keys are still
  // fully exposed in browser localStorage/IndexedDB.

  function obfuscateKey(k) {
    if (!k || typeof k !== 'string') return '';
    // Legacy format - returns JVENC_ or ENC_ prefixed strings
    // WARNING: This is SECURITY THEATER - decode easily with: atob(k.split('_').slice(1).join('_'))
    const salt = Math.random().toString(36).slice(2, 10);
    return 'JVENC_' + salt + '_' + btoa(k);
  }

  function deobfuscateKey(k) {
    if (!k || typeof k !== 'string') return '';
    if (k.startsWith('JVENC_')) {
      try {
        const parts = k.slice(6).split('_');
        if (parts.length >= 2) {
          const b64 = parts.slice(1).join('_');
          return atob(b64);
        }
      } catch (e) {
        console.warn('JVENC decode failed:', e);
      }
    }
    if (k.startsWith('ENC_')) {
      try {
        return atob(k.slice(4)).split('').reverse().join('');
      } catch (e) {
        try {
          return k.slice(4);
        } catch (e) {}
      }
    }
    return k;
  }

  // --- SESSION SANITIZATION FOR BACKUP ---
  // Sanitizes API keys from session data before local backup
  function sanitizeSessionForBackup(session) {
    if (!session || typeof session !== 'object') return session;
    const clean = JSON.parse(JSON.stringify(session));
    clean.assignedApiKey = null;
    if (Array.isArray(clean.his)) {
      clean.his.forEach(msg => {
        if (typeof msg.text === 'string') {
          // Mask known API key patterns in chat history for backup privacy
          msg.text = msg.text
            .replace(/AIzaSy[A-Za-z0-9_-]{30,40}/g, 'AIzaSy[PROTECTED]')
            .replace(/tvly-[A-Za-z0-9_-]{20,40}/g, 'tvly-[PROTECTED]')
            .replace(/jina_[A-Za-z0-9_-]{20,}/g, 'jina_[PROTECTED]')
            .replace(/ghp_[A-Za-z0-9]{30,45}/g, 'ghp_[PROTECTED]')
            .replace(/github_pat_[A-Za-z0-9_]{30,}/g, 'github_pat_[PROTECTED]');
        }
      });
    }
    return clean;
  }

  // --- Window exports - MINIMAL for backward compatibility ---
  // These are exposed for legacy code that may depend on them,
  // but users should NOT rely on them for actual security.
  if (typeof window !== 'undefined') {
    window.obfuscateKey = obfuscateKey;
    window.deobfuscateKey = deobfuscateKey;
    window.sanitizeSessionForBackup = sanitizeSessionForBackup;
  }

})();