/* ==========================================================================
   Jarvis AI - RAG Worker (js/rag.worker.js)
   Thực thi tính toán Cosine Similarity và Vector Search ngầm trong Web Worker,
   giúp giao diện hoàn toàn mượt mà, không bị giật lag (UI freeze) khi tìm kiếm
   hoặc truy vấn khối lượng lớn văn bản tri thức / trí nhớ cá nhân.
   ========================================================================== */

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

function computeHybridScore(queryVector, item, qLower, qTokens) {
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

function tokenizeQuery(cleanQuery) {
  const stopWords = new Set(['và', 'là', 'của', 'có', 'cho', 'với', 'nhé', 'nha', 'ạ', 'ơi', 'hãy', 'các', 'những', 'được', 'trong', 'về', 'khi', 'nào', 'gì', 'sao', 'thế', 'thì', 'ở', 'tại', 'the', 'a', 'an', 'is', 'of', 'in', 'and', 'to', 'for', 'with', 'on', 'at']);
  return cleanQuery.split(/[\\s,.;:!?\\-\\+()[\\]{}'"]+/).filter(t => t.length >= 2 && !stopWords.has(t));
}

self.addEventListener('message', function (e) {
  const { token, type, queryVector, allItems, options } = e.data || {};
  if (type === 'SEARCH') {
    try {
      const { topK = 4, threshold = 0.40, query = '' } = options || {};
      const cleanQuery = (query || '').trim().toLowerCase();
      const qTokens = tokenizeQuery(cleanQuery);

      const results = [];
      if (allItems && Array.isArray(allItems) && queryVector) {
        for (const item of allItems) {
          if (!item.vector || !Array.isArray(item.vector)) continue;
          const { rawSimilarity, similarity } = computeHybridScore(queryVector, item, cleanQuery, qTokens);
          if (similarity >= threshold) {
            results.push({ item, similarity, rawSimilarity });
          }
        }
      }

      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, topK);

      self.postMessage({ token, success: true, results: topResults });
    } catch (err) {
      self.postMessage({ token, success: false, error: err.message });
    }
  }
});
