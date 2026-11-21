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
      const qTokens = window.RagCore?.tokenizeQuery ? window.RagCore.tokenizeQuery(cleanQuery) : [];

      const results = [];
      if (allItems && Array.isArray(allItems) && queryVector) {
        for (const item of allItems) {
          if (!item.vector || !Array.isArray(item.vector)) continue;
          const { rawSimilarity, similarity } = window.RagCore.computeHybridScore(queryVector, item, qLower, qTokens);
          if (similarity >= threshold) {
            results.push({ item, similarity, rawSimilarity });
          }
        }
      }

      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, topK);
    }
