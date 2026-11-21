/* ==========================================================================
   Jarvis AI - Shared RAG Core (js/rag-core.js)
   Chứa các hàm tính toán dùng chung cho main thread và Web Worker:
   - cosineSimilarity
   - computeHybridScore
   - tokenizeQuery
   ========================================================================== */

(function (root) {
  'use strict';

  // --- COSINE SIMILARITY ---
  function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // --- HYBRID SCORE (COSINE + TITLE/TEXT BOOST) ---
  function computeHybridScore(queryVector, item, qLower, qTokens, cosineFn = cosineSimilarity) {
    if (!item.vector || !Array.isArray(item.vector)) return { rawSimilarity: 0, similarity: 0 };

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < queryVector.length; i++) {
      dot += queryVector[i] * item.vector[i];
      normA += queryVector[i] * queryVector[i];
      normB += item.vector[i] * item.vector[i];
    }
    if (normA === 0 || normB === 0) return { rawSimilarity: 0, similarity: 0 };

    const rawSimilarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    let boost = 0;

    const titleLower = ((item.title || '') + ' ' + (item.docName || '')).toLowerCase();
    const textLower = (item.text || '').toLowerCase();

    if (qLower && (titleLower.includes(qLower) || qLower.includes(titleLower.trim()))) {
      boost += 0.25;
    } else if (qLower && textLower.includes(qLower)) {
      boost += 0.15;
    }

    if (qTokens.length > 0) {
      let titleTokenMatches = 0;
      let textTokenMatches = 0;
      for (const t of qTokens) {
        if (titleLower.includes(t)) titleTokenMatches++;
        if (textLower.includes(t)) textTokenMatches++;
      }
      const titleOverlap = titleTokenMatches / qTokens.length;
      const textOverlap = textTokenMatches / qTokens.length;
      boost += (titleOverlap * 0.15) + (textOverlap * 0.08);
    }

    return { rawSimilarity: rawSimilarity, similarity: Math.min(1.0, rawSimilarity + boost) };
  }

  // --- QUERY TOKENIZER (VIETNAMESE + ENGLISH STOPWORDS) ---
  function tokenizeQuery(cleanQuery) {
    const stopWords = new Set([
      'và', 'là', 'của', 'có', 'cho', 'với', 'nhé', 'nha', 'ạ', 'ơi', 'hãy',
      'các', 'những', 'được', 'trong', 'về', 'khi', 'nào', 'gì', 'sao', 'thế',
      'thì', 'ở', 'tại', 'the', 'a', 'an', 'is', 'of', 'in', 'and', 'to',
      'for', 'with', 'on', 'at'
    ]);
    return cleanQuery.split(/[\s,.;:!?\-\+\(\)\[\]{}'"]+/).filter(t => t.length >= 2 && !stopWords.has(t));
  }

  // Export for both environments
  const exports = {
    cosineSimilarity,
    computeHybridScore,
    tokenizeQuery
  };

  // Main thread (ES module / window)
  if (typeof window !== 'undefined') {
    window.RagCore = exports;
    if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  }
  // Worker (self)
  if (typeof self !== 'undefined' && !self.window) {
    self.RagCore = exports;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);