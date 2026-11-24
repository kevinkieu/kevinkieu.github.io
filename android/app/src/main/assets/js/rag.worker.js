/* ==========================================================================
   Jarvis AI - RAG Worker (js/rag.worker.js)
   Thực thi tính toán Cosine Similarity và Vector Search ngầm trong Web Worker,
   giúp giao diện hoàn toàn mượt mà, không bị giật lag (UI freeze) khi tìm kiếm
   hoặc truy vấn khối lượng lớn văn bản tri thức / trí nhớ cá nhân.
   ========================================================================== */

// Load shared RAG core (cosineSimilarity, computeHybridScore, tokenizeQuery)
importScripts('./rag-core.js');

self.addEventListener('message', function (e) {
  const { token, type, queryVector, allItems, options } = e.data || {};
  if (type === 'SEARCH') {
    try {
      const { topK = 4, threshold = 0.4, query = '' } = options || {};
      const cleanQuery = (query || '').trim().toLowerCase();
      const qTokens = self.RagCore.tokenizeQuery(cleanQuery);

      const results = [];
      if (allItems && Array.isArray(allItems) && queryVector) {
        for (const item of allItems) {
          if (!item.vector || !Array.isArray(item.vector)) continue;
          const { rawSimilarity, similarity } = self.RagCore.computeHybridScore(
            queryVector,
            item,
            cleanQuery,
            qTokens
          );
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
