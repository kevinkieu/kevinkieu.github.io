    // --- WORKER-ACCELERATED VECTOR SEARCH (PRIMARY) ---
    let ragWorker = null;

    function getRagWorker() {
      if (!ragWorker && typeof window.Worker !== 'undefined') {
        try {
          ragWorker = new Worker(new URL('./js/rag.worker.js', import.meta.url));
        } catch (e) {
          console.warn('[RAG] Worker unavailable, will fallback to main thread on use:', e);
        }
      }
      return ragWorker;
    }

    async function searchSimilarVectors(query, options = {}) {
      const {
        topK = 4,
        threshold = 0.40,
        type = null,
        apiKey = null,
        taskType = 'RETRIEVAL_QUERY',
        raw = false
      } = options;
      const cleanQuery = (query || '').trim();
      if (!cleanQuery) return [];

      const queryVector = await getEmbedding(cleanQuery, { taskType, apiKey });
      if (!queryVector) return [];

      const allItems = await getAllVectorItems(type);
      if (!allItems.length) return [];

      // Worker path
      const worker = !raw && getRagWorker();
      if (worker) {
        return new Promise((resolve) => {
          const token = 'rag_' + Math.random().toString(36).substring(2, 10);
          const onMsg = (e) => {
            if (e.data && e.data.token === token) {
              worker.removeEventListener('message', onMsg);
              resolve(e.data.success ? e.data.results || [] : []);
            }
          };
          worker.addEventListener('message', onMsg);
          worker.postMessage({
            token,
            type: 'SEARCH',
            queryVector,
            allItems,
            options: { topK, threshold, query: cleanQuery }
          });
        });
      }

      // Main-thread fallback (always available)
      return searchSimilarVectorsMain(queryVector, allItems, { topK, threshold, query: cleanQuery });
    }

    // --- MAIN-THREAD FALLBACK (USED BY WORKER PATH FAILOVER AND raw=true) ---
    function searchSimilarVectorsMain(queryVector, allItems, options = {}) {
      const { topK = 4, threshold = 0.40, query = '' } = options;
      const cleanQuery = (query || '').trim();
      const qLower = cleanQuery.toLowerCase();
      const stopWords = new Set(['và', 'là', 'của', 'có', 'cho', 'với', 'nhé', 'nha', 'ạ', 'ơi', 'hãy', 'các', 'những', 'được', 'trong', 'về', 'khi', 'nào', 'gì', 'sao', 'thế', 'thì', 'ở', 'tại', 'the', 'a', 'an', 'is', 'of', 'in', 'and', 'to', 'for', 'with', 'on', 'at']);
      const qTokens = qLower.split(/[\\s,.;:!?\\-\\+()[\\]{}'"]+/).filter(t => t.length >= 2 && !stopWords.has(t));

      const results = [];
      if (allItems && Array.isArray(allItems) && queryVector) {
        for (const item of allItems) {
          if (!item.vector || !Array.isArray(item.vector)) continue;
          const { rawSimilarity, similarity } = computeHybridScore(queryVector, item, qLower, qTokens);
          if (similarity >= threshold) {
            results.push({ item, similarity, rawSimilarity });
          }
        }
      }

      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, topK);
    }

    // --- SHARED HYBRID SCORE FUNCTION (USED BY WORKER + MAIN-THREAD FALLBACK) ---
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
