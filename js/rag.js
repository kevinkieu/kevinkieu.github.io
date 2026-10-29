/* ==========================================================================
   Jarvis AI - Knowledge Base, RAG Studio & Semantic Search (js/rag.js)
   Powered by Gemini Embedding 2 (Unified Multimodal Embedding Engine)
   ========================================================================== */

(function () {
  'use strict';

  // --- MODEL IDENTIFIERS ---
  const PRIMARY_EMBEDDING_MODEL = "gemini-embedding-2";
  const FALLBACK_EMBEDDING_MODEL = "gemini-embedding-001";

  // --- DATABASE CONFIGURATION ---
  const VECTOR_DB_NAME = "Jarvis_Vector_DB";
  const VECTOR_STORE_NAME = "knowledge_vectors";
  const VECTOR_DB_VERSION = 1;

  let vDb = null;
  const embeddingCache = new Map();

  // --- VECTOR DATABASE INITIALIZATION ---
  function initVectorDB() {
    return new Promise((resolve, reject) => {
      if (vDb) return resolve(vDb);
      const req = indexedDB.open(VECTOR_DB_NAME, VECTOR_DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(VECTOR_STORE_NAME)) {
          const store = db.createObjectStore(VECTOR_STORE_NAME, { keyPath: "id" });
          store.createIndex("type", "type", { unique: false });
          store.createIndex("docName", "docName", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = (e) => {
        vDb = e.target.result;
        resolve(vDb);
      };
      req.onerror = (e) => reject(e);
    });
  }

  // Helper ghi nhớ ID tri thức đã xóa để tránh bị hồi sinh khi sync 2 chiều
  function recordDeletedVectorId(id) {
    if (!id) return;
    try {
      const ls = window.ls || localStorage;
      const list = JSON.parse(ls.getItem('jarvis_deleted_vector_ids') || '[]');
      if (!list.includes(id)) {
        list.push(id);
        if (list.length > 500) list.shift();
        ls.setItem('jarvis_deleted_vector_ids', JSON.stringify(list));
      }
    } catch (e) {}
  }

  // --- DB CRUD HELPERS ---
  async function saveVectorItem(item) {
    const db = await initVectorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
      tx.objectStore(VECTOR_STORE_NAME).put(item);
      tx.oncomplete = () => {
        if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
          window.JarvisSync.scheduleAutoSync();
        }
        resolve(item);
      };
      tx.onerror = (e) => reject(e);
    });
  }

  async function getAllVectorItems(type = null) {
    const db = await initVectorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, "readonly");
      const store = tx.objectStore(VECTOR_STORE_NAME);
      const req = (type && store.indexNames && store.indexNames.contains("type")) ? store.index("type").getAll(type) : store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        resolve(type ? list.filter(it => it.type === type) : list);
      };
      req.onerror = (e) => reject(e);
    });
  }

  async function deleteVectorItem(id) {
    recordDeletedVectorId(id);
    const db = await initVectorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
      tx.objectStore(VECTOR_STORE_NAME).delete(id);
      tx.oncomplete = () => {
        if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
          window.JarvisSync.scheduleAutoSync();
        }
        resolve(true);
      };
      tx.onerror = (e) => reject(e);
    });
  }

  async function deleteDocumentVectors(docName) {
    const db = await initVectorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
      const store = tx.objectStore(VECTOR_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        items.forEach((item) => {
          if (item.docName === docName || item.metadata?.docName === docName) {
            recordDeletedVectorId(item.id);
            store.delete(item.id);
          }
        });
      };
      tx.oncomplete = () => {
        if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
          window.JarvisSync.scheduleAutoSync();
        }
        resolve(true);
      };
      tx.onerror = (e) => reject(e);
    });
  }

  async function clearAllVectorDB() {
    const db = await initVectorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
      tx.objectStore(VECTOR_STORE_NAME).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e);
    });
  }

  async function importKnowledgeItems(items, clearExisting = false) {
    if (!Array.isArray(items)) return 0;
    const db = await initVectorDB();
    if (clearExisting) {
      await clearAllVectorDB();
    }
    const ls = window.ls || localStorage;
    const deletedIds = new Set(JSON.parse(ls.getItem('jarvis_deleted_vector_ids') || '[]'));
    return new Promise((resolve, reject) => {
      if (!items.length) {
        renderMemoryList();
        renderDocsList();
        return resolve(0);
      }
      const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
      const store = tx.objectStore(VECTOR_STORE_NAME);
      let count = 0;
      items.forEach(it => {
        if (it && it.id && !deletedIds.has(it.id)) {
          store.put(it);
          count++;
        }
      });
      tx.oncomplete = () => {
        renderMemoryList();
        renderDocsList();
        resolve(count);
      };
      tx.onerror = (e) => reject(e);
    });
  }

  // --- COSINE SIMILARITY CALCULATION (0ms In-Browser Math) ---
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

  // --- API KEY RETRIEVAL ---
  function getActiveApiKey() {
    if (window.apiKeys && Array.isArray(window.apiKeys) && window.apiKeys.length) {
      for (const k of window.apiKeys) {
        if (typeof k === 'string' && k.trim()) return k.trim();
      }
    }
    const ls = window.ls || localStorage;
    for (let i = 1; i <= 10; i++) {
      let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || '').trim();
      if (k) {
        if (typeof window.deobfuscateKey === 'function' && (k.startsWith('JVENC_') || k.startsWith('ENC_'))) {
          k = window.deobfuscateKey(k);
        }
        return k;
      }
    }
    return '';
  }

  // --- HELPER: FILE TO BASE64 FOR MULTIMODAL EMBEDDINGS ---
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      let mimeType = file.type || '';
      if (!mimeType) {
        const ext = (file.name || '').split('.').pop().toLowerCase();
        const map = {
          pdf: 'application/pdf',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          gif: 'image/gif',
          mp3: 'audio/mp3',
          wav: 'audio/wav',
          m4a: 'audio/m4a',
          ogg: 'audio/ogg',
          mp4: 'video/mp4',
          webm: 'video/webm',
          mov: 'video/quicktime'
        };
        mimeType = map[ext] || 'application/octet-stream';
      }
      const reader = new FileReader();
      reader.onload = () => resolve({
        mimeType,
        data: reader.result.split(',')[1]
      });
      reader.onerror = e => reject(e);
      reader.readAsDataURL(file);
    });
  }

  // --- MULTIMODAL EMBEDDING API CALL (Gemini Embedding 2 Unified Space) ---
  async function getEmbedding(input, options = {}) {
    if (!input) return null;

    let customApiKey = null, taskType = null, title = null, outputDimensionality = 768;
    if (typeof options === 'string') {
      customApiKey = options;
    } else if (options && typeof options === 'object') {
      customApiKey = options.apiKey || null;
      taskType = options.taskType || null;
      title = options.title || null;
      outputDimensionality = options.outputDimensionality || 768;
    }

    const apiKey = customApiKey || getActiveApiKey();
    if (!apiKey) {
      throw new Error("Cần ít nhất 1 Google API Key hợp lệ trong Cài đặt để tạo Vector Embedding.");
    }

    if (!window.GoogleGenAI) {
      throw new Error("Thư viện GoogleGenAI chưa sẵn sàng.");
    }

    const isString = typeof input === 'string';
    const cleanText = isString ? input.trim() : '';
    if (isString && !cleanText) return null;

    // Cache hit for text
    const cacheKey = isString ? `${taskType || 'none'}_${outputDimensionality}_${cleanText}` : null;
    if (cacheKey && embeddingCache.has(cacheKey)) {
      return embeddingCache.get(cacheKey);
    }

    const ai = new window.GoogleGenAI({ apiKey });
    let vector = null;

    // Chuẩn bị nội dung đầu vào cho gemini-embedding-2 (Text / Image / Audio / Video / PDF)
    let contentsForModel2;
    if (isString) {
      // Định dạng tiền tố theo chuẩn tài liệu chính thức của Google cho Gemini Embedding 2
      if (taskType === 'RETRIEVAL_QUERY') {
        contentsForModel2 = `task: search result | query: ${cleanText}`;
      } else if (taskType === 'RETRIEVAL_DOCUMENT') {
        contentsForModel2 = `title: ${title || 'none'} | text: ${cleanText}`;
      } else if (taskType === 'SEMANTIC_SIMILARITY') {
        contentsForModel2 = `task: sentence similarity | query: ${cleanText}`;
      } else {
        contentsForModel2 = cleanText;
      }
    } else if (input.inlineData) {
      // Media part (image, audio, video, pdf)
      contentsForModel2 = [{ inlineData: input.inlineData }];
      if (title) {
        contentsForModel2.push({ text: `title: ${title}` });
      }
    } else if (Array.isArray(input)) {
      contentsForModel2 = input;
    } else {
      contentsForModel2 = input;
    }

    const configModel2 = {
      outputDimensionality
    };

    try {
      // 1. Model thế hệ mới nhất: gemini-embedding-2 (Đa phương thức, MRL 768 chiều auto-normalized)
      const res = await ai.models.embedContent({
        model: PRIMARY_EMBEDDING_MODEL,
        contents: contentsForModel2,
        config: configModel2
      });
      vector = res?.embedding?.values || res?.embeddings?.[0]?.values;
    } catch (err) {
      console.warn(`[RAG] ${PRIMARY_EMBEDDING_MODEL} gặp sự cố, tự động dùng ${FALLBACK_EMBEDDING_MODEL}:`, err);
      try {
        // 2. Dự phòng: gemini-embedding-001 (chỉ hỗ trợ text)
        if (isString) {
          const configModel1 = { outputDimensionality };
          if (taskType) {
            configModel1.taskType = taskType;
            if (title && taskType === 'RETRIEVAL_DOCUMENT') configModel1.title = title;
          }
          const fallbackRes = await ai.models.embedContent({
            model: FALLBACK_EMBEDDING_MODEL,
            contents: cleanText,
            config: configModel1
          });
          vector = fallbackRes?.embedding?.values || fallbackRes?.embeddings?.[0]?.values;
        } else {
          throw err;
        }
      } catch (err2) {
        console.error("[RAG] Không thể tạo vector embedding:", err2);
        throw err2;
      }
    }

    if (vector && Array.isArray(vector)) {
      if (cacheKey) {
        embeddingCache.set(cacheKey, vector);
        if (embeddingCache.size > 500) {
          const firstKey = embeddingCache.keys().next().value;
          embeddingCache.delete(firstKey);
        }
      }
      return vector;
    }

    throw new Error("Không nhận được vector từ Google Gemini API.");
  }

  // --- TEXT CHUNKING WITH OVERLAP ---
  function chunkText(text, chunkSize = 750, overlap = 100) {
    if (!text || !text.trim()) return [];
    const clean = text.trim();
    if (clean.length <= chunkSize) return [clean];

    const chunks = [];
    let start = 0;
    while (start < clean.length) {
      let end = start + chunkSize;
      if (end < clean.length) {
        // Cắt tự nhiên tại dấu chấm câu hoặc ngắt dòng gần nhất
        const sub = clean.substring(start, end);
        const lastBreak = Math.max(
          sub.lastIndexOf('\n'),
          sub.lastIndexOf('. '),
          sub.lastIndexOf('? '),
          sub.lastIndexOf('! ')
        );
        if (lastBreak > chunkSize * 0.5) {
          end = start + lastBreak + 1;
        }
      } else {
        end = clean.length;
      }

      const chunk = clean.substring(start, end).trim();
      if (chunk.length >= 20) {
        chunks.push(chunk);
      }

      // Quan trọng: Nếu end đã chạm tới hoặc vượt qua cuối chuỗi thì dừng ngay lập tức
      if (end >= clean.length) {
        break;
      }

      // Tiến start lên: lùi lại overlap từ end, nhưng luôn phải lớn hơn start cũ để tránh lặp vô tận
      const nextStart = end - overlap;
      if (nextStart <= start) {
        start = start + Math.max(1, Math.floor(chunkSize * 0.5));
      } else {
        start = nextStart;
      }
    }
    return chunks;
  }

  // --- KNOWLEDGE BASE: ADD PERSONAL MEMORY (SECOND BRAIN) ---
  async function addMemoryItem({ title, text, category = 'personal' }, customApiKey = null) {
    if (!text || !text.trim()) throw new Error("Nội dung không được để trống.");
    const embedding = await getEmbedding(text.trim(), { taskType: 'RETRIEVAL_DOCUMENT', title: title || 'Ghi nhớ cá nhân', apiKey: customApiKey });
    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const item = {
      id,
      type: 'memory',
      title: (title || 'Ghi nhớ cá nhân').trim(),
      text: text.trim(),
      category: category || 'personal',
      vector: embedding,
      createdAt: Date.now()
    };
    await saveVectorItem(item);
    return item;
  }

  // --- RAG STUDIO: INDEX DOCUMENT ---
  async function indexDocument({ docName, text, onProgress = null }) {
    if (!docName || !text) throw new Error("Tên tệp và nội dung không được để trống.");
    const chunks = chunkText(text, 750, 100);
    if (!chunks.length) throw new Error("Tài liệu không có nội dung hợp lệ.");

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    let completed = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: chunks.length,
          percent: Math.round(((i + 1) / chunks.length) * 100),
          status: `Đang nhúng vector đoạn ${i + 1}/${chunks.length} (${PRIMARY_EMBEDDING_MODEL})...`
        });
      }

      const vector = await getEmbedding(chunk, { taskType: 'RETRIEVAL_DOCUMENT', title: docName });
      const item = {
        id: `${docId}_chk_${i}`,
        type: 'doc',
        docName,
        chunkIndex: i,
        totalChunks: chunks.length,
        title: `${docName} (Đoạn ${i + 1}/${chunks.length})`,
        text: chunk,
        vector,
        metadata: { docName, chunkIndex: i, totalChunks: chunks.length },
        createdAt: Date.now()
      };
      await saveVectorItem(item);
      completed++;
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 60));
      }
    }

    return { docName, totalChunks: chunks.length };
  }

  // --- SIMILARITY SEARCH ACROSS KNOWLEDGE BASE ---
  async function searchSimilarVectors(query, options = {}) {
    const { topK = 4, threshold = 0.58, type = null, apiKey = null, taskType = 'RETRIEVAL_QUERY' } = options;
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    const queryVector = await getEmbedding(cleanQuery, { taskType, apiKey });
    if (!queryVector) return [];

    const allItems = await getAllVectorItems(type);
    if (!allItems.length) return [];

    const results = [];
    for (const item of allItems) {
      if (!item.vector || !Array.isArray(item.vector)) continue;
      const sim = cosineSimilarity(queryVector, item.vector);
      if (sim >= threshold) {
        results.push({ item, similarity: sim });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  // --- BỘ LỌC Ý ĐỊNH THÔNG MINH (SMART INTENT FILTER: NHẬN DIỆN HỎI DANH TÍNH / THÔNG TIN CÁ NHÂN) ---
  function isPersonalIdentityQuery(prompt) {
    if (!prompt || typeof prompt !== 'string') return false;
    const p = prompt.toLowerCase().trim();

    // 1. Tên, danh xưng, danh tính
    const asksName = /(tôi tên gì|tên tôi là gì|tên của tôi là gì|tôi là ai|tên tui là gì|tui tên gì|tên mình là gì|mình tên gì|biết tôi tên gì|nhớ tôi tên gì|bạn biết tôi là ai|biết tôi là ai|tên tôi\?|tên tui\?)/i.test(p);
    
    // 2. Giới tính
    const asksGender = /(nam hay nữ|nữ hay nam|giới tính của tôi|giới tính tôi|tôi là nam hay|tôi là nữ hay|tôi là con trai hay|tôi là trai hay gái|tôi là đàn ông hay|giới tính gì)/i.test(p);
    
    // 3. Tuổi tác, ngày sinh, năm sinh
    const asksAgeOrDob = /(sinh ngày|sinh năm|ngày sinh|năm sinh|sinh nhật tôi|sinh nhật của tôi|tôi bao nhiêu tuổi|tuổi của tôi|tôi mấy tuổi)/i.test(p);
    
    // 4. Gia đình, con cái, vợ chồng, người thân
    const asksFamily = /(con (của )?tôi|con tui|mấy đứa con|mấy con|con gái tôi|con trai tôi|bé bắp|bé tiền|tên con|vợ tôi|vợ của tôi|chồng tôi|gia đình tôi|nhà tôi có mấy|bố mẹ tôi|ba mẹ tôi)/i.test(p) && /(tên gì|mấy|bao nhiêu|là ai|ai|như thế nào|thế nào|không|ko|\?)/i.test(p);
    
    // 5. Nơi ở, quê quán, nghề nghiệp
    const asksLocation = /(nhà tôi ở đâu|tôi sống ở đâu|tôi ở đâu|quê tôi ở đâu|quê quán của tôi)/i.test(p);
    const asksJob = /(tôi làm nghề gì|nghề của tôi là gì|công việc của tôi là gì|tôi làm gì|tôi làm việc ở đâu)/i.test(p);
    
    // 6. Sở thích, thói quen
    const asksHobby = /(sở thích của tôi là gì|sở thích tôi là gì|tôi thích gì|tôi ghét gì)/i.test(p);
    
    // 7. Hỏi chung về trí nhớ hoặc những gì Jarvis biết/nhớ về người dùng
    const asksMemory = /(bạn nhớ gì về tôi|bạn biết gì về tôi|bạn đã nhớ gì|có nhớ tôi không|nhớ gì về tôi|biết gì về tôi|nhớ thông tin gì về tôi|thông tin cá nhân của tôi|trí nhớ của bạn về tôi|bạn biết những gì về tôi|lưu gì về tôi|biết gì về tui|nhớ gì về tui|bạn biết gì về gia đình tôi|bạn có biết tôi không)/i.test(p);
    
    // 8. Yêu cầu cá nhân hóa riêng cho bản thân hoặc gia đình
    const asksPersonalizedAdvice = /(cho gia đình tôi|cho 2 bé nhà tôi|cho hai bé nhà tôi|cho con gái tôi|cho bé bắp|cho bé tiền|cho bản thân tôi|theo sở thích của tôi|phù hợp với tôi)/i.test(p);

    return asksName || asksGender || asksAgeOrDob || asksFamily || asksLocation || asksJob || asksHobby || asksMemory || asksPersonalizedAdvice;
  }

  // --- SMART CONTEXT RETRIEVAL FOR CHAT (DUAL-TRACK INTENT GUARDED) ---
  async function retrieveContextForPrompt(userPrompt, apiKey = null) {
    const ls = window.ls || localStorage;
    const isRagEnabled = ls.getItem('jarvis_rag_enabled') !== 'false';
    if (!isRagEnabled) return { text: "", matches: [] };

    const cleanPrompt = (userPrompt || '').trim();
    if (cleanPrompt.length < 3) return { text: "", matches: [] };

    // =========================================================================
    // LUỒNG 1: TRUY VẤN DANH TÍNH / THÔNG TIN CÁ NHÂN (0ms Latency, 100% Chính xác)
    // =========================================================================
    if (isPersonalIdentityQuery(cleanPrompt)) {
      try {
        const memoryItems = await getAllVectorItems('memory');
        if (memoryItems && memoryItems.length > 0) {
          let selectedMemories = memoryItems;
          if (memoryItems.length > 6) {
            const pLower = cleanPrompt.toLowerCase();
            const scored = memoryItems.map(m => {
              let score = 0;
              const textLower = ((m.title || '') + ' ' + (m.text || '')).toLowerCase();
              if (pLower.includes('tên') && textLower.includes('tên')) score += 5;
              if ((pLower.includes('nam') || pLower.includes('nữ') || pLower.includes('giới tính')) && (textLower.includes('nam') || textLower.includes('nữ') || textLower.includes('giới tính') || textLower.includes('nam giới') || textLower.includes('nữ giới'))) score += 5;
              if ((pLower.includes('sinh') || pLower.includes('tuổi') || pLower.includes('năm')) && (textLower.includes('sinh') || textLower.includes('tuổi') || textLower.includes('1988') || textLower.includes('năm'))) score += 5;
              if ((pLower.includes('con') || pLower.includes('bắp') || pLower.includes('tiền')) && (textLower.includes('con') || textLower.includes('bắp') || textLower.includes('tiền'))) score += 5;
              if ((pLower.includes('nhà') || pLower.includes('ở') || pLower.includes('sống')) && (textLower.includes('nhà') || textLower.includes('ở') || textLower.includes('sống'))) score += 5;
              if ((pLower.includes('nghề') || pLower.includes('làm') || pLower.includes('việc')) && (textLower.includes('nghề') || textLower.includes('làm') || textLower.includes('việc'))) score += 5;
              return { item: m, score };
            });
            scored.sort((a, b) => b.score - a.score);
            selectedMemories = scored.slice(0, 5).map(s => s.item);
          }

          const formattedSnippets = selectedMemories.map((m, idx) => {
            return '--- [Trí nhớ cá nhân #' + (idx + 1) + ': "' + m.title + '"]:\n' + m.text;
          }).join('\n\n');

          const text = '\n\n[DỮ LIỆU TRÍ NHỚ CÁ NHÂN CỦA NGƯỜI DÙNG]:\n' + formattedSnippets + '\n\n[CHỈ THỊ TRÍ NHỚ]: Trả lời câu hỏi của người dùng dựa trên thông tin trí nhớ cá nhân ở trên một cách chính xác, tự nhiên, thân thiện và đầy đủ nhất.';
          const matches = selectedMemories.map(m => ({ item: m, similarity: 1.0 }));
          return { text, matches };
        }
      } catch (memErr) {
        console.warn("[RAG] Lỗi đọc trí nhớ cá nhân từ IndexedDB:", memErr);
      }
    }

    // =========================================================================
    // LUỒNG 2: TRUY VẤN KIẾN THỨC / TÀI LIỆU RAG (BẢO VỆ TUYỆT ĐỐI ĐỜI TƯ)
    // =========================================================================
    // Đối với câu hỏi kiến thức chung (VD: 'Thịt gà có nhiều dinh dưỡng không?'),
    // TUYỆT ĐỐI KHÔNG nạp trí nhớ cá nhân để model không bị thiên kiến hay hỏi lan man!

    // Bỏ qua tin nhắn quá ngắn hoặc chào hỏi xã giao (0ms Latency)
    if (/^(chào|hi|hello|alo|ê|ơi|chào bạn|xin chào|ok|tiếp|tóm tắt|dạ|vâng|cảm ơn|thanks|bye|tạm biệt)\b/i.test(cleanPrompt)) {
      return { text: "", matches: [] };
    }
    // Bỏ qua câu người dùng tự khai báo để học mà không chứa từ để hỏi
    if (/^(tôi thích|tôi ghét|nhà tôi|tôi sống|tôi ở|tôi làm|nghề của tôi|sở thích của tôi|từ giờ hãy gọi tôi|hãy nhớ rằng tôi)\b/i.test(cleanPrompt) && !/(gì|không|ko|\?)/i.test(cleanPrompt)) {
      return { text: "", matches: [] };
    }

    try {
      // Chỉ tìm kiếm trong các tài liệu RAG đã tải lên (type: 'doc')
      const allDocs = await getAllVectorItems('doc');
      if (!allDocs || allDocs.length === 0) {
        return { text: "", matches: [] }; // Không có tài liệu trong kho -> 0ms
      }

      // Tăng timeout lên 3500ms để cuộc gọi Gemini Embedding 2 hoàn tất an toàn
      const retrievalPromise = searchSimilarVectors(cleanPrompt, { topK: 4, threshold: 0.48, type: 'doc', apiKey });
      const matches = await Promise.race([retrievalPromise, new Promise(r => setTimeout(() => r([]), 3500))]);
      if (!matches.length) return { text: "", matches: [] };

      const formattedSnippets = matches.map((m, idx) => {
        const item = m.item;
        const pct = Math.round(m.similarity * 100);
        return '--- [Trích đoạn Tài liệu RAG #' + (idx + 1) + ': "' + (item.docName || item.title) + '" (Độ phù hợp: ' + pct + '%)]:\n' + item.text;
      }).join('\n\n');

      const text = '\n\n[DỮ LIỆU TÀI LIỆU TRÍCH XUẤT TỪ KHO RAG]:\n' + formattedSnippets + '\n\n[CHỈ THỊ RAG]: Hãy sử dụng dữ liệu trích xuất từ tài liệu ở trên khi trả lời người dùng một cách chính xác, đúng ngữ cảnh và tự nhiên nhất.';
      return { text, matches };
    } catch (e) {
      console.warn("[RAG Context Retrieval] Bỏ qua lỗi tìm kiếm vector:", e);
      return { text: "", matches: [] };
    }
  }

  // --- SHOW RETRIEVED RAG DETAILS MODAL ---
  function showRetrievedDetails(encodedData) {
    const modal = document.getElementById('rag-details-modal');
    const list = document.getElementById('rag-details-list');
    const overlay = document.getElementById('modal-overlay');
    if (!modal || !list) return;

    let items = [];
    try {
      items = JSON.parse(decodeURIComponent(encodedData));
    } catch (e) {
      console.warn("Lỗi giải mã RAG details:", e);
    }

    if (!items.length) return;

    list.innerHTML = items.map((it, idx) => {
      const pct = Math.round((it.similarity || 0) * 100);
      const isDoc = it.type === 'doc';
      const icon = isDoc ? '📄' : '🧠';
      const typeLabel = isDoc ? 'Tài liệu RAG' : 'Trí nhớ cá nhân';
      return `
        <div class="memory-card" style="margin-top:0;">
          <div class="memory-card-header">
            <span class="memory-card-title">${icon} #${idx + 1}: ${escapeHtml(it.title)}</span>
            <span class="similarity-badge ${pct >= 80 ? 'high' : 'medium'}">⭐ ${pct}% khớp ý</span>
          </div>
          <div class="memory-card-body" style="background:var(--input-bg);padding:8px 10px;border-radius:var(--radius-sm);margin:6px 0;font-size:0.8rem;line-height:1.5;">
            ${escapeHtml(it.text)}
          </div>
          <div class="memory-card-footer">
            <span>Nguồn: ${typeLabel}</span>
            <span>Đã đưa vào Context</span>
          </div>
        </div>
      `;
    }).join('');

    modal.style.display = 'flex';
    if (overlay) overlay.style.display = 'block';
  }

  // --- HELPER SAFE JSON PARSER ---
  function safeParseJson(str) {
    if (!str) return null;
    const cleaned = str.replace(/```json/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(cleaned); } catch (e) {}
    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(str.substring(start, end + 1)); } catch (e2) {}
    }
    return null;
  }

  // --- CHATGPT-STYLE AUTO-LEARN MEMORY ---
  async function extractAndLearnMemory(userPrompt, apiKey = null) {
    const ls = window.ls || localStorage;
    const isAutoLearn = ls.getItem('jarvis_auto_learn_memory') !== 'false';
    if (!isAutoLearn) {
      console.log("[Auto-Memory] Tính năng tự động học đang bị tắt trong cài đặt.");
      return null;
    }

    const txt = (userPrompt || '').trim();
    if (txt.length < 8) return null;

    // Lọc nhanh: nếu là câu chào hỏi quá ngắn thuần túy thì bỏ qua
    if (/^(hi|hello|alo|chào|xin chào|ê|ơi|chào bạn|ok|vâng|dạ|bye|tạm biệt)$/i.test(txt)) {
      return null;
    }

    const key = apiKey || getActiveApiKey();
    if (!key || !window.GoogleGenAI) {
      console.warn("[Auto-Memory] Thiếu Google API Key hợp lệ.");
      return null;
    }

    console.log('[Auto-Memory] Đang phân tích tin nhắn để học:', txt);

    try {
      const ai = new window.GoogleGenAI({ apiKey: key });
      const prompt = `Bạn là hệ thống tự động nhận diện và ghi nhớ thông tin cá nhân của người dùng (tương tự tính năng Memory của ChatGPT).
Phân tích câu nói sau đây của người dùng:
"""${txt}"""

Nhiệm vụ:
1. Xác định xem người dùng có chia sẻ hoặc yêu cầu ghi nhớ một THÔNG TIN CÁ NHÂN BỀN VỮNG (tên, tuổi, nơi sống, nghề nghiệp, dự án cá nhân, sở thích ăn uống/âm nhạc/giải trí, thói quen, người thân/thú cưng, quy tắc phản hồi riêng) hay không.
   Ví dụ: "tôi thích uống cà phê đá ít đường", "tôi mới chuyển nhà sang Quận 1", "tôi làm lập trình viên", "từ giờ gọi tôi là anh Hai".
2. Nếu câu nói chứa thông tin cá nhân/sở thích/thói quen đáng lưu:
   Trả về JSON:
   {
     "learn": true,
     "title": "Tiêu đề ngắn 3-5 từ (VD: Sở thích uống cà phê, Nơi sinh sống, Nghề nghiệp)",
     "text": "Nội dung ghi nhớ khách quan ở ngôi thứ ba (VD: Người dùng thích uống cà phê đá ít đường)",
     "category": "hobbies"
   }
   (category chọn trong: "personal", "work", "project", "hobbies", "rules")
3. Nếu chỉ là câu chào hỏi, hỏi đáp kiến thức chung, nhờ viết văn/code/dịch thuật mà KHÔNG chứa thông tin về bản thân người dùng:
   Trả về JSON: { "learn": false }`;

      // Tác vụ phụ trích xuất tri thức nền: Luôn dùng Flash-Lite (500 RPD) để không tốn quota của 3.6/3.8 Flash (20 RPD)
      const uniqueModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

      let res = null;
      let lastExtractErr = null;
      for (const m of uniqueModels) {
        try {
          res = await ai.models.generateContent({
            model: m,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 300
            }
          });
          if (res) break;
        } catch (mErr) {
          lastExtractErr = mErr;
          console.warn('[Auto-Memory] Model ' + m + ' không phản hồi:', mErr?.message || mErr);
        }
      }

      if (!res) {
        console.error("[Auto-Memory] Không thể phân tích bằng bất kỳ model nào:", lastExtractErr);
        return null;
      }

      const raw = (res?.text || res?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      const parsed = safeParseJson(raw);
      console.log('[Auto-Memory] Kết quả phân tích:', parsed);

      if (parsed && (parsed.learn === true || parsed.learn === 'true') && parsed.text) {
        // Kiểm tra xem trí nhớ này đã tồn tại chưa để tránh trùng lặp
        try {
          const duplicates = await searchSimilarVectors(parsed.text, { topK: 1, threshold: 0.90, taskType: 'SEMANTIC_SIMILARITY', apiKey: key });
          if (duplicates && duplicates.length > 0) {
            console.log('[Auto-Memory] Đã có trí nhớ tương tự trong kho:', duplicates[0].item.title);
            if (typeof window.showToast === 'function') {
              window.showToast('🧠 Đã có trong trí nhớ: "' + duplicates[0].item.title + '"', 'info');
            }
            return duplicates[0].item;
          }
        } catch (simErr) {
          console.warn("[Auto-Memory] Lỗi kiểm tra trùng lặp (tiếp tục lưu):", simErr);
        }

        const newItem = await addMemoryItem({
          title: parsed.title || 'Thông tin cá nhân',
          text: parsed.text,
          category: parsed.category || 'personal'
        }, key);

        console.log('[Auto-Memory] Đã lưu thành công vào Kho Tri Thức:', newItem);

        // Hiển thị thông báo Toast đẹp mắt
        if (typeof window.showToast === 'function') {
          window.showToast('🧠 Đã tự động ghi nhớ: "' + newItem.title + '"', 'success');
        }

        // Cập nhật lại danh sách nếu đang mở modal
        renderMemoryList();

        return newItem;
      }
    } catch (e) {
      console.error("[Auto-Memory] Lỗi trích xuất ghi nhớ:", e);
      if (typeof window.showToast === 'function') {
        window.showToast('⚠️ Lỗi ghi nhớ tự động: ' + (e.message || 'Lỗi không xác định'), 'warning');
      }
    }
    return null;
  }

  // --- SEMANTIC CHAT SEARCH ENGINE ---
  async function searchChatHistorySemantic(query, sessions, options = {}) {
    const { topK = 25, threshold = 0.52, apiKey = null, onProgress = null } = options;
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    if (onProgress) onProgress({ status: 'Đang tạo vector câu truy vấn...' });
    const queryVector = await getEmbedding(cleanQuery, apiKey);
    if (!queryVector) return [];

    const messagesToScore = [];
    (sessions || []).forEach(sess => {
      (sess.his || []).forEach((msg, idx) => {
        const cleanMsgText = (msg.text || '').replace(/<[^>]+>/g, '').trim();
        if (cleanMsgText.length >= 10) {
          messagesToScore.push({
            session: sess,
            message: msg,
            cleanText: cleanMsgText,
            msgIndex: idx
          });
        }
      });
    });

    if (!messagesToScore.length) return [];

    // Lấy embedding cho từng tin nhắn (dùng cache để tối ưu)
    const scoredResults = [];
    const total = Math.min(messagesToScore.length, 60); // Giới hạn kiểm tra 60 tin nhắn gần nhất để tối ưu tốc độ

    for (let i = 0; i < total; i++) {
      const item = messagesToScore[i];
      if (onProgress && i % 5 === 0) {
        onProgress({ status: `Đang so khớp ý nghĩa (${i + 1}/${total})...` });
      }

      try {
        let msgVector = null;
        if (embeddingCache.has(item.cleanText)) {
          msgVector = embeddingCache.get(item.cleanText);
        } else {
          // Lấy vector cho tin nhắn (cắt ngắn 200 ký tự đầu để siêu nhanh)
          const sample = item.cleanText.substring(0, 220);
          msgVector = await getEmbedding(sample, apiKey);
        }

        if (msgVector) {
          const sim = cosineSimilarity(queryVector, msgVector);
          if (sim >= threshold) {
            scoredResults.push({
              session: item.session,
              message: item.message,
              text: item.cleanText,
              similarity: sim
            });
          }
        }
      } catch (err) {
        console.warn("[Semantic Search Message Error]:", err);
      }
    }

    scoredResults.sort((a, b) => b.similarity - a.similarity);
    return scoredResults.slice(0, topK);
  }

  // --- UI CONTROLLER FOR KNOWLEDGE MODAL ---
  let activeRagTab = 'memory';

  function openKnowledgeModal(tab = 'memory') {
    const modal = document.getElementById('knowledge-modal');
    const overlay = document.getElementById('modal-overlay');
    if (!modal) return;

    modal.style.display = 'flex';
    if (overlay) overlay.style.display = 'block';

    switchRagTab(tab);
    renderMemoryList();
    renderDocsList();
  }

  function closeKnowledgeModal() {
    const modal = document.getElementById('knowledge-modal');
    const overlay = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  }

  function switchRagTab(tabName) {
    activeRagTab = tabName;
    document.querySelectorAll('.rag-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.rag-tab-pane').forEach(pane => {
      pane.style.display = pane.id === `rag-pane-${tabName}` ? 'block' : 'none';
    });
  }

    // --- MEMORY DASHBOARD STATE ---
  let activeMemoryCategory = 'all';
  let memorySearchKeyword = '';

  async function renderMemoryList() {
    const container = document.getElementById('memory-list-container');
    const countBadge = document.getElementById('memory-count-badge');
    const pillsContainer = document.getElementById('memory-category-pills');
    if (!container) return;

    try {
      const allItems = await getAllVectorItems('memory');
      if (countBadge) countBadge.innerText = `${allItems.length} mục`;

      // 1. Render Category Filter Pills with counts
      if (pillsContainer) {
        const counts = { personal: 0, work: 0, project: 0, hobbies: 0, rules: 0 };
        allItems.forEach(it => {
          const cat = it.category || 'personal';
          if (counts[cat] !== undefined) counts[cat]++;
          else counts.personal++;
        });

        pillsContainer.innerHTML = `
          <button type="button" class="memory-cat-pill ${activeMemoryCategory === 'all' ? 'active' : ''}" data-cat="all">🌟 Tất cả (${allItems.length})</button>
          <button type="button" class="memory-cat-pill ${activeMemoryCategory === 'personal' ? 'active' : ''}" data-cat="personal">👤 Cá nhân (${counts.personal})</button>
          <button type="button" class="memory-cat-pill ${activeMemoryCategory === 'work' ? 'active' : ''}" data-cat="work">💼 Công việc (${counts.work})</button>
          <button type="button" class="memory-cat-pill ${activeMemoryCategory === 'project' ? 'active' : ''}" data-cat="project">🚀 Dự án (${counts.project})</button>
          <button type="button" class="memory-cat-pill ${activeMemoryCategory === 'hobbies' ? 'active' : ''}" data-cat="hobbies">🎨 Sở thích (${counts.hobbies})</button>
          <button type="button" class="memory-cat-pill ${activeMemoryCategory === 'rules' ? 'active' : ''}" data-cat="rules">⚖️ Quy tắc (${counts.rules})</button>
        `;

        pillsContainer.querySelectorAll('.memory-cat-pill').forEach(pill => {
          pill.onclick = (e) => {
            e.preventDefault();
            activeMemoryCategory = pill.getAttribute('data-cat');
            renderMemoryList();
          };
        });
      }

      // 2. Filter items by Category & Search Keyword
      let filtered = allItems;
      if (activeMemoryCategory !== 'all') {
        filtered = filtered.filter(it => (it.category || 'personal') === activeMemoryCategory);
      }
      if (memorySearchKeyword) {
        const kw = memorySearchKeyword.toLowerCase();
        filtered = filtered.filter(it => 
          (it.title && it.title.toLowerCase().includes(kw)) || 
          (it.text && it.text.toLowerCase().includes(kw))
        );
      }

      if (!allItems.length) {
        container.innerHTML = `
          <div style="text-align:center;padding:24px 12px;color:var(--text-muted);font-size:0.82rem;">
            Chưa có mẩu trí nhớ nào. Hãy thêm thông tin về bạn, sở thích hoặc quy tắc làm việc ở trên!
          </div>
        `;
        return;
      }

      if (!filtered.length) {
        container.innerHTML = `
          <div style="text-align:center;padding:22px 12px;color:var(--text-muted);font-size:0.82rem;">
            🔍 Không tìm thấy mẩu trí nhớ nào khớp với bộ lọc hiện tại.
          </div>
        `;
        return;
      }

      const catMap = {
        personal: 'Cá nhân',
        work: 'Công việc',
        hobbies: 'Sở thích',
        project: 'Dự án',
        rules: 'Quy tắc'
      };

      container.innerHTML = filtered.map(item => {
        const dateStr = new Date(item.updatedAt || item.createdAt).toLocaleDateString('vi-VN');
        const catName = catMap[item.category] || item.category || 'Cá nhân';
        return `
          <div class="memory-card" id="card-${item.id}">
            <div class="memory-card-header">
              <span class="memory-card-title">
                📌 ${escapeHtml(item.title)}
              </span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="memory-tag ${item.category || 'personal'}">${catName}</span>
                <button class="icon-btn" onclick="window.JarvisRAG.editMemory('${item.id}')" title="Chỉnh sửa mẩu trí nhớ" style="width:24px;height:24px;font-size:0.82rem;">
                  ✏️
                </button>
                <button class="icon-btn" onclick="window.JarvisRAG.deleteMemory('${item.id}')" title="Xóa mẩu trí nhớ" style="width:24px;height:24px;color:var(--danger);font-size:0.82rem;">
                  🗑️
                </button>
              </div>
            </div>
            <div class="memory-card-body" id="body-${item.id}">${escapeHtml(item.text)}</div>
            <div class="memory-card-footer">
              <span>Đã nhúng Vector (${PRIMARY_EMBEDDING_MODEL})</span>
              <span>${dateStr}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error("renderMemoryList error:", e);
    }
  }

  // --- IN-PLACE MEMORY EDITING ---
  async function editMemory(id) {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;

    const items = await getAllVectorItems('memory');
    const item = items.find(x => x.id === id);
    if (!item) return;

    card.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">
        <div style="display:flex;gap:8px;">
          <input type="text" id="edit-title-${id}" class="modern-input" value="${escapeHtml(item.title)}" style="flex:2;font-size:0.82rem;font-weight:700;" placeholder="Tiêu đề...">
          <select id="edit-cat-${id}" class="modern-select" style="flex:1;font-size:0.8rem;padding:4px 8px;">
            <option value="personal" ${item.category === 'personal' ? 'selected' : ''}>Cá nhân</option>
            <option value="work" ${item.category === 'work' ? 'selected' : ''}>Công việc</option>
            <option value="project" ${item.category === 'project' ? 'selected' : ''}>Dự án</option>
            <option value="hobbies" ${item.category === 'hobbies' ? 'selected' : ''}>Sở thích</option>
            <option value="rules" ${item.category === 'rules' ? 'selected' : ''}>Quy tắc</option>
          </select>
        </div>
        <textarea id="edit-text-${id}" class="modern-input" rows="3" style="width:100%;font-size:0.82rem;resize:vertical;" placeholder="Nội dung ghi nhớ...">${escapeHtml(item.text)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px;">
          <button type="button" class="btn" onclick="window.JarvisRAG.renderMemoryList()" style="font-size:0.75rem;padding:4px 10px;">Hủy</button>
          <button type="button" id="btn-save-edit-${id}" class="btn primary" style="font-size:0.75rem;padding:4px 12px;">💾 Lưu cập nhật</button>
        </div>
      </div>
    `;

    document.getElementById(`btn-save-edit-${id}`).onclick = async () => {
      const newTitle = (document.getElementById(`edit-title-${id}`)?.value || '').trim();
      const newCat = document.getElementById(`edit-cat-${id}`)?.value || 'personal';
      const newText = (document.getElementById(`edit-text-${id}`)?.value || '').trim();

      if (!newText) {
        if (typeof window.showToast === 'function') window.showToast("Nội dung không được để trống!", "warning");
        return;
      }

      const saveBtn = document.getElementById(`btn-save-edit-${id}`);
      saveBtn.disabled = true;
      saveBtn.innerText = "Đang nhúng...";

      try {
        const key = getActiveApiKey();
        const newEmbedding = await getEmbedding(newText, { taskType: 'RETRIEVAL_DOCUMENT', title: newTitle, apiKey: key });

        const updatedItem = {
          ...item,
          title: newTitle || 'Ghi nhớ',
          category: newCat,
          text: newText,
          embedding: newEmbedding,
          updatedAt: Date.now()
        };

        const db = await initVectorDB();
        await new Promise((res, rej) => {
          const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
          const store = tx.objectStore(VECTOR_STORE_NAME);
          const req = store.put(updatedItem);
          req.onsuccess = () => res();
          req.onerror = (e) => rej(e.target.error);
        });

        if (typeof window.showToast === 'function') window.showToast("✓ Đã cập nhật trí nhớ & làm mới vector!", "success");
        await renderMemoryList();
      } catch (err) {
        if (typeof window.showToast === 'function') window.showToast("Lỗi cập nhật: " + err.message, "danger");
        saveBtn.disabled = false;
        saveBtn.innerText = "💾 Lưu cập nhật";
      }
    };
  }

  // --- PERSONA SYNTHESIS ENGINE (GEMINI 3.6 FLASH / 3.5 FLASH-LITE) ---
  async function synthesizePersonaProfile() {
    const summaryBox = document.getElementById('persona-summary-box');
    const summaryText = document.getElementById('persona-summary-text');
    const btn = document.getElementById('btn-synthesize-persona');
    if (!summaryBox || !summaryText) return;

    summaryBox.style.display = 'block';
    summaryText.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:12px;color:var(--text-muted);">
        <span class="hf-pulse-dot" style="background:var(--primary);width:10px;height:10px;"></span>
        <span>Jarvis đang dùng <strong>Gemini 3.6 Flash</strong> phân tích toàn bộ mẩu trí nhớ để phác họa chân dung cá nhân...</span>
      </div>
    `;

    try {
      const allMemories = await getAllVectorItems('memory');
      if (!allMemories.length) {
        summaryText.innerHTML = `
          <div style="color:var(--text-muted);font-style:italic;padding:8px 0;">
            Chưa có mẩu trí nhớ nào trong Second Brain. Hãy thêm thông tin về bạn (sở thích, công việc, quy tắc) hoặc kích hoạt tính năng "Tự động học & ghi nhớ" khi trò chuyện để Jarvis hiểu bạn hơn nhé!
          </div>
        `;
        return;
      }

      const key = getActiveApiKey();
      if (!key) {
        summaryText.innerHTML = `<span style="color:var(--danger)">Cần có Google API Key để tổng hợp chân dung!</span>`;
        return;
      }

      const memorySummary = allMemories.map((m, idx) => `[Mục ${idx + 1}] (${m.category || 'personal'}): ${m.title} - ${m.text}`).join('\n');

      const prompt = `Bạn là Jarvis - Siêu trí tuệ nhân tạo và trợ lý cá nhân tận tâm.
Dưới đây là danh sách toàn bộ các mẩu dữ liệu trí nhớ (Second Brain) mà bạn đã ghi nhớ về người dùng của mình:
${memorySummary}

Dựa trên dữ liệu trên, hãy phác họa chân dung tổng thể về người dùng (Persona Profile) một cách ngắn gọn, sâu sắc, súc tích và có cấu trúc:
1. 👤 **Tổng quan & Bản sắc:** Tên/cách xưng hô, nghề nghiệp, phong cách làm việc và giao tiếp.
2. 🎯 **Mục tiêu & Dự án trọng tâm:** Những gì người dùng đang tập trung xây dựng hoặc phát triển.
3. 🎨 **Sở thích & Phong cách sống:** Thói quen, sở thích cá nhân.
4. ⚖️ **Quy tắc vàng:** Các nguyên tắc ứng xử, cách phản hồi mà Jarvis cần tuân thủ tuyệt đối khi phục vụ người dùng này.

Giọng văn ấm áp, thông minh, tôn trọng, đúng chuẩn Jarvis. Không bịa đặt thông tin chưa có trong trí nhớ.`;

      const ai = new window.GoogleGenAI({ apiKey: key });
      // Sử dụng model Flash tối ưu tốc độ: gemini-3.6-flash, fallback gemini-3.5-flash-lite
      const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
      let resultText = '';
      let lastErr = null;

      for (const m of candidateModels) {
        try {
          const res = await ai.models.generateContent({
            model: m,
            contents: prompt,
            config: {
              temperature: 0.3
            }
          });
          if (res.text) {
            resultText = res.text;
            break;
          }
        } catch (err) {
          console.warn(`Persona synthesis failed with ${m}:`, err);
          lastErr = err;
        }
      }

      if (resultText) {
        summaryText.innerHTML = (window.marked && typeof window.marked.parse === 'function') 
          ? window.marked.parse(resultText) 
          : `<pre style="white-space:pre-wrap;">${escapeHtml(resultText)}</pre>`;
      } else {
        throw lastErr || new Error("Không nhận được phản hồi từ mô hình.");
      }
    } catch (e) {
      summaryText.innerHTML = `<span style="color:var(--danger)">Lỗi phác họa chân dung: ${escapeHtml(e.message)}</span>`;
    }
  }

  async function renderDocsList() {
    const container = document.getElementById('docs-list-container');
    const countBadge = document.getElementById('docs-count-badge');
    if (!container) return;

    try {
      const allDocs = await getAllVectorItems('doc');
      // Nhóm theo docName
      const docGroups = {};
      allDocs.forEach(item => {
        const name = item.docName || 'Tài liệu không tên';
        if (!docGroups[name]) {
          docGroups[name] = { name, chunks: 0, createdAt: item.createdAt };
        }
        docGroups[name].chunks++;
      });

      const docsArray = Object.values(docGroups);
      if (countBadge) countBadge.innerText = `${docsArray.length} tệp (${allDocs.length} đoạn)`;

      if (!docsArray.length) {
        container.innerHTML = `
          <div style="text-align:center;padding:24px 12px;color:var(--text-muted);font-size:0.82rem;">
            Chưa có tài liệu nào trong RAG Studio. Hãy tải lên tệp PDF, TXT, MD hoặc dán văn bản ở trên!
          </div>
        `;
        return;
      }

      container.innerHTML = docsArray.map(doc => {
        const dateStr = new Date(doc.createdAt).toLocaleDateString('vi-VN');
        return `
          <div class="rag-doc-card">
            <div class="rag-doc-info">
              <span class="rag-doc-title">📄 ${escapeHtml(doc.name)}</span>
              <span class="rag-doc-meta">
                <span>📦 ${doc.chunks} đoạn vector</span>
                <span>📅 ${dateStr}</span>
              </span>
            </div>
            <button class="btn danger" style="padding:4px 10px;font-size:0.75rem;" onclick="window.JarvisRAG.deleteDoc('${escapeHtml(doc.name)}')">
              🗑️ Xóa tệp
            </button>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error("renderDocsList error:", e);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  function updateRagUI(enabled) {
    const ragStateEl = document.getElementById('rag-memory-state');
    const toggleRagSidebar = document.getElementById('toggle-rag-embedding');
    if (ragStateEl) {
      ragStateEl.innerText = enabled ? 'BẬT' : 'TẮT';
      ragStateEl.style.color = enabled ? 'var(--success)' : 'var(--text-muted)';
    }
    if (toggleRagSidebar) toggleRagSidebar.checked = enabled;
  }

  // --- INITIALIZE UI & EVENT LISTENERS ---
  function setupRAGListeners() {
    // 1. Chuyển đổi tab trong RAG Modal
    document.querySelectorAll('.rag-tab-btn').forEach(btn => {
      btn.onclick = () => switchRagTab(btn.getAttribute('data-tab'));
    });

    // 2. Thêm mẩu trí nhớ mới
    const btnSaveMemory = document.getElementById('btn-save-memory');
    if (btnSaveMemory) {
      btnSaveMemory.onclick = async () => {
        const titleEl = document.getElementById('memory-input-title');
        const textEl = document.getElementById('memory-input-text');
        const catEl = document.getElementById('memory-input-category');

        const title = (titleEl?.value || '').trim();
        const text = (textEl?.value || '').trim();
        const category = catEl?.value || 'personal';

        if (!text) {
          if (typeof window.showToast === 'function') window.showToast("Vui lòng nhập nội dung ghi nhớ!", "warning");
          return;
        }

        btnSaveMemory.disabled = true;
        btnSaveMemory.innerHTML = `<span>⏳ Đang nhúng Vector...</span>`;

        try {
          await addMemoryItem({ title: title || 'Ghi nhớ', text, category });
          if (titleEl) titleEl.value = '';
          if (textEl) textEl.value = '';
          await renderMemoryList();
          if (typeof window.showToast === 'function') {
            window.showToast("✓ Đã lưu và nhúng Vector vào Trí nhớ vĩnh cửu!", "success");
          }
        } catch (err) {
          if (typeof window.showToast === 'function') {
            window.showToast(`Lỗi nhúng vector: ${err.message}`, "danger");
          }
        } finally {
          btnSaveMemory.disabled = false;
          btnSaveMemory.innerHTML = `<span>💾 Lưu & Nhúng Vector ngay</span>`;
        }
      };
    }

    // 3. Tải lên tệp tài liệu RAG
    const docFileInput = document.getElementById('rag-doc-file-input');
    const docDropZone = document.getElementById('rag-drop-zone');
    const btnProcessDoc = document.getElementById('btn-process-doc');

    if (docDropZone && docFileInput) {
      docDropZone.onclick = () => docFileInput.click();
      docDropZone.ondragover = e => { e.preventDefault(); docDropZone.classList.add('dragover'); };
      docDropZone.ondragleave = () => docDropZone.classList.remove('dragover');
      docDropZone.ondrop = e => {
        e.preventDefault();
        docDropZone.classList.remove('dragover');
        if (e.dataTransfer.files?.length) {
          docFileInput.files = e.dataTransfer.files;
          handleDocFileSelected(e.dataTransfer.files[0]);
        }
      };

      docFileInput.onchange = () => {
        if (docFileInput.files?.length) {
          handleDocFileSelected(docFileInput.files[0]);
        }
      };
    }

    function handleDocFileSelected(file) {
      const nameInput = document.getElementById('rag-doc-name-input');
      if (nameInput) nameInput.value = file.name;
    }

        if (btnProcessDoc) {
      btnProcessDoc.onclick = async () => {
        const nameInput = document.getElementById('rag-doc-name-input');
        const pasteInput = document.getElementById('rag-doc-paste-input');
        const file = docFileInput?.files?.[0];
        const docName = (nameInput?.value || '').trim() || (file ? file.name : 'Tài liệu dán');
        let textContent = (pasteInput?.value || '').trim();

        const isPdf = file && (file.type === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf')));
        const isMediaFile = file && (
          file.type.startsWith('image/') ||
          file.type.startsWith('audio/') ||
          file.type.startsWith('video/') ||
          /\.(jpe?g|png|webp|gif|bmp|mp3|wav|m4a|ogg|mp4|webm|mov)$/i.test(file.name || '')
        );

        // 1. Tệp đa phương tiện thuần túy (ảnh, audio, video) -> Nhúng trực tiếp qua Gemini Embedding 2
        if (isMediaFile) {
          const progressBox = document.getElementById('rag-progress-box');
          const progressFill = document.getElementById('rag-progress-fill');
          const progressStatus = document.getElementById('rag-progress-status');

          if (progressBox) progressBox.style.display = 'block';
          if (progressStatus) progressStatus.innerText = `Đang nhúng vector đa phương tiện (${PRIMARY_EMBEDDING_MODEL})...`;
          if (progressFill) progressFill.style.width = '60%';
          btnProcessDoc.disabled = true;

          try {
            const b64 = await fileToBase64(file);
            const vector = await getEmbedding({ inlineData: b64 }, { title: docName });
            const mediaTypeDesc = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || '') ? 'Hình ảnh' : 
              (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg)$/i.test(file.name || '') ? 'Âm thanh' : 'Video');
            const item = {
              id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              type: 'doc',
              docName,
              chunkIndex: 0,
              totalChunks: 1,
              title: `${docName} (${mediaTypeDesc})`,
              text: `[Tệp ${mediaTypeDesc}: ${docName} - Định dạng: ${b64.mimeType}]`,
              mediaType: b64.mimeType,
              vector,
              metadata: { docName, size: file.size, mimeType: b64.mimeType },
              createdAt: Date.now()
            };
            await saveVectorItem(item);
            if (progressFill) progressFill.style.width = '100%';
            if (progressStatus) progressStatus.innerText = 'Hoàn tất nhúng vector tệp đa phương tiện!';
            if (nameInput) nameInput.value = '';
            if (docFileInput) docFileInput.value = '';
            await renderDocsList();
            if (typeof window.showToast === 'function') {
              window.showToast(`Đã nhúng thành công tệp ${mediaTypeDesc.toLowerCase()}: "${docName}"!`, "success");
            }
          } catch (mErr) {
            console.error("Lỗi nhúng tệp đa phương tiện:", mErr);
            if (typeof window.showToast === 'function') {
              window.showToast(`Lỗi nhúng tệp: ${mErr.message}`, "danger");
            }
          } finally {
            btnProcessDoc.disabled = false;
            setTimeout(() => { if (progressBox) progressBox.style.display = 'none'; }, 2000);
          }
          return;
        }

        // 2. Tệp tài liệu (PDF, TXT, MD, CSV, ...) -> Đọc trích xuất text
        if (!textContent && file) {
          try {
            if (isPdf) {
              if (typeof window.readPDF === 'function') {
                textContent = await window.readPDF(file);
              } else if (window.pdfjsLib) {
                const p = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
                let t = "";
                for (let i = 1; i <= p.numPages; i++) {
                  t += (await (await p.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + "\n";
                }
                textContent = t;
              } else {
                console.warn("pdfjs chưa sẵn sàng trên trình duyệt.");
              }
            } else {
              textContent = await file.text();
            }
          } catch (readErr) {
            console.warn("Không trích xuất được text tự động từ tệp:", readErr);
          }
        }

        // 3. Fallback cho PDF scan hình ảnh (không trích xuất được text hoặc < 50 ký tự)
        // Gemini Embedding 2 hỗ trợ đọc tệp PDF đa phương thức trực tiếp nguyên bản!
        if (isPdf && (!textContent || textContent.trim().length < 50)) {
          const progressBox = document.getElementById('rag-progress-box');
          const progressFill = document.getElementById('rag-progress-fill');
          const progressStatus = document.getElementById('rag-progress-status');

          if (progressBox) progressBox.style.display = 'block';
          if (progressStatus) progressStatus.innerText = `Đang nhúng vector PDF đa phương thức (${PRIMARY_EMBEDDING_MODEL})...`;
          if (progressFill) progressFill.style.width = '60%';
          btnProcessDoc.disabled = true;

          try {
            const b64 = await fileToBase64(file);
            const vector = await getEmbedding({ inlineData: b64 }, { title: docName });
            const item = {
              id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              type: 'doc',
              docName,
              chunkIndex: 0,
              totalChunks: 1,
              title: `${docName} (PDF Đa phương thức)`,
              text: `[Tài liệu PDF: ${docName} - Nhúng đa phương thức nguyên bản qua Gemini Embedding 2]`,
              mediaType: 'application/pdf',
              vector,
              metadata: { docName, size: file.size, mimeType: 'application/pdf' },
              createdAt: Date.now()
            };
            await saveVectorItem(item);
            if (progressFill) progressFill.style.width = '100%';
            if (progressStatus) progressStatus.innerText = 'Hoàn tất nhúng vector tài liệu PDF!';
            if (nameInput) nameInput.value = '';
            if (docFileInput) docFileInput.value = '';
            await renderDocsList();
            if (typeof window.showToast === 'function') {
              window.showToast(`Đã nạp thành công tài liệu PDF đa phương thức: "${docName}"!`, "success");
            }
          } catch (mErr) {
            console.error("Lỗi nhúng tệp PDF:", mErr);
            if (typeof window.showToast === 'function') {
              window.showToast(`Lỗi nhúng tệp PDF: ${mErr.message}`, "danger");
            }
          } finally {
            btnProcessDoc.disabled = false;
            setTimeout(() => { if (progressBox) progressBox.style.display = 'none'; }, 2000);
          }
          return;
        }

        if (!textContent) {
          if (typeof window.showToast === 'function') {
            window.showToast("Vui lòng chọn tệp hoặc dán văn bản để nạp vào RAG!", "warning");
          }
          return;
        }

        const progressBox = document.getElementById('rag-progress-box');
        const progressFill = document.getElementById('rag-progress-fill');
        const progressStatus = document.getElementById('rag-progress-status');

        if (progressBox) progressBox.style.display = 'block';
        btnProcessDoc.disabled = true;

        try {
          await indexDocument({
            docName,
            text: textContent,
            onProgress: p => {
              if (progressFill) progressFill.style.width = `${p.percent}%`;
              if (progressStatus) progressStatus.innerText = p.status;
            }
          });

          if (pasteInput) pasteInput.value = '';
          if (nameInput) nameInput.value = '';
          if (docFileInput) docFileInput.value = '';
          await renderDocsList();
          if (typeof window.showToast === 'function') {
            window.showToast(`✓ Đã nạp thành công tài liệu "${docName}" vào RAG Studio!`, "success");
          }
        } catch (idxErr) {
          if (typeof window.showToast === 'function') {
            window.showToast(`Lỗi xử lý RAG: ${idxErr.message}`, "danger");
          }
        } finally {
          btnProcessDoc.disabled = false;
          setTimeout(() => { if (progressBox) progressBox.style.display = 'none'; }, 2000);
        }
      };
    }

    // 4. Thử nghiệm truy vấn RAG Tester
    const btnRunRagTest = document.getElementById('btn-run-rag-test');
    if (btnRunRagTest) {
      btnRunRagTest.onclick = async () => {
        const queryInput = document.getElementById('rag-test-query-input');
        const thresholdInput = document.getElementById('rag-test-threshold');
        const resultsBox = document.getElementById('rag-test-results');

        const q = (queryInput?.value || '').trim();
        const th = thresholdInput ? parseFloat(thresholdInput.value) / 100 : 0.55;

        if (!q) {
          if (typeof window.showToast === 'function') window.showToast("Nhập câu hỏi để thử nghiệm!", "warning");
          return;
        }

        btnRunRagTest.disabled = true;
        btnRunRagTest.innerHTML = `<span>⏳ Đang tìm kiếm...</span>`;
        if (resultsBox) resultsBox.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;padding:12px;">Đang tính toán vector và so khớp Cosine Similarity...</div>`;

        try {
          const matches = await searchSimilarVectors(q, { topK: 5, threshold: th });
          if (!matches.length) {
            if (resultsBox) resultsBox.innerHTML = `<div style="color:var(--danger);font-size:0.82rem;padding:12px;">Không tìm thấy mẩu tri thức nào có độ tương đồng >= ${Math.round(th * 100)}%. Hãy thử hạ ngưỡng lọc hoặc kiểm tra từ khóa.</div>`;
            return;
          }

          if (resultsBox) {
            resultsBox.innerHTML = matches.map((m, idx) => {
              const item = m.item;
              const pct = Math.round(m.similarity * 100);
              const badgeClass = pct >= 80 ? 'high' : (pct >= 65 ? 'medium' : 'low');
              return `
                <div class="memory-card">
                  <div class="memory-card-header">
                    <span class="memory-card-title">#${idx + 1}. ${escapeHtml(item.title || item.docName)}</span>
                    <span class="similarity-badge ${badgeClass}">⭐ ${pct}% khớp</span>
                  </div>
                  <div class="memory-card-body">${escapeHtml(item.text)}</div>
                  <div class="memory-card-footer">
                    <span>Loại: ${item.type === 'doc' ? 'Tài liệu RAG' : 'Trí nhớ cá nhân'}</span>
                  </div>
                </div>
              `;
            }).join('');
          }
        } catch (testErr) {
          if (resultsBox) resultsBox.innerHTML = `<div style="color:var(--danger);font-size:0.82rem;padding:12px;">Lỗi: ${testErr.message}</div>`;
        } finally {
          btnRunRagTest.disabled = false;
          btnRunRagTest.innerHTML = `<span>⚡ Kiểm tra kết quả</span>`;
        }
      };
    }

    // 5. Tool-chip toggle trên thanh chat (Điều khiển Trí nhớ Vector RAG cho TỪNG PHIÊN)
    const btnToggleRag = document.getElementById('btn-toggle-rag-memory');
    const toggleRagSidebar = document.getElementById('toggle-rag-embedding');

    const toggleRagForCurrentSession = (forceVal) => {
      const activeId = window.activeId;
      const sessions = window.sessions || [];
      const s = sessions.find(x => x.id === activeId);
      const cur = s ? (s.rag !== false) : (toggleRagSidebar ? toggleRagSidebar.checked : true);
      const next = (typeof forceVal === 'boolean') ? forceVal : !cur;
      if (s) {
        s.rag = next;
        if (typeof window.saveToDB === 'function') window.saveToDB(s);
      }
      updateRagUI(next);
      if (typeof window.showToast === 'function') {
        window.showToast(`Trí nhớ Vector RAG [Phiên này]: ${next ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`, next ? 'success' : 'warning');
      }
    };

    if (btnToggleRag) {
      btnToggleRag.onclick = () => toggleRagForCurrentSession();
    }

    if (toggleRagSidebar) {
      toggleRagSidebar.onchange = () => toggleRagForCurrentSession(toggleRagSidebar.checked);
    }

    const toggleAutoLearn = document.getElementById('toggle-auto-learn-memory');
    if (toggleAutoLearn) {
      toggleAutoLearn.checked = localStorage.getItem('jarvis_auto_learn_memory') !== 'false';
      toggleAutoLearn.onchange = () => {
        localStorage.setItem('jarvis_auto_learn_memory', toggleAutoLearn.checked ? 'true' : 'false');
        if (typeof window.showToast === 'function') {
          window.showToast(`Tự động ghi nhớ: ${toggleAutoLearn.checked ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`, toggleAutoLearn.checked ? 'success' : 'info');
        }
      };
    }

    // 6. Tìm kiếm trong trí nhớ và phác họa chân dung cá nhân
    const searchInput = document.getElementById('memory-search-input');
    if (searchInput) {
      let searchDebounce = null;
      searchInput.oninput = (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          memorySearchKeyword = e.target.value.trim();
          renderMemoryList();
        }, 120);
      };
    }

    const btnPersona = document.getElementById('btn-synthesize-persona');
    if (btnPersona) {
      btnPersona.onclick = () => synthesizePersonaProfile();
    }
  }

  // --- GLOBAL SEARCH MODAL CONTROLLER (KEYWORD + SEMANTIC) ---
  let currentSearchMode = 'keyword'; // 'keyword' | 'semantic'

  function setupSearchModalListeners() {
    const sInput = document.getElementById('global-search-input');
    const resBox = document.getElementById('search-results');
    const sModal = document.getElementById('search-modal');
    const oLay = document.getElementById('modal-overlay');
    const btnClear = document.getElementById('btn-clear-search-modal');
    const statusBox = document.getElementById('search-semantic-status');

    // Chuyển đổi Mode tìm kiếm
    const btnKw = document.getElementById('btn-search-mode-keyword');
    const btnSm = document.getElementById('btn-search-mode-semantic');

    if (btnKw && btnSm) {
      btnKw.onclick = () => {
        currentSearchMode = 'keyword';
        btnKw.classList.add('active');
        btnSm.classList.remove('active');
        if (sInput?.value.trim()) triggerSearch();
      };
      btnSm.onclick = () => {
        currentSearchMode = 'semantic';
        btnSm.classList.add('active');
        btnKw.classList.remove('active');
        if (sInput?.value.trim()) triggerSearch();
      };
    }

    if (btnClear && sInput) {
      btnClear.onclick = () => {
        sInput.value = '';
        btnClear.style.display = 'none';
        if (resBox) resBox.innerHTML = '';
        sInput.focus();
      };
    }

    let searchTimer = null;
    const triggerSearch = async () => {
      const q = (sInput?.value || '').trim();
      if (btnClear) btnClear.style.display = q ? 'block' : 'none';
      if (!q) {
        if (resBox) resBox.innerHTML = '';
        if (statusBox) statusBox.style.display = 'none';
        return;
      }

      const scope = document.getElementById('search-scope-select')?.value || 'all';

      if (currentSearchMode === 'keyword') {
        if (statusBox) statusBox.style.display = 'none';
        renderKeywordSearchResults(q, scope);
      } else {
        if (statusBox) {
          statusBox.style.display = 'block';
          statusBox.innerHTML = `<span>⏳</span> Đang chuyển đổi câu hỏi sang vector (${PRIMARY_EMBEDDING_MODEL}) và so khớp ý nghĩa...`;
        }
        try {
          await renderSemanticSearchResults(q, scope);
        } finally {
          if (statusBox) statusBox.style.display = 'none';
        }
      }
    };

    if (sInput) {
      sInput.oninput = () => {
        clearTimeout(searchTimer);
        const delay = currentSearchMode === 'keyword' ? 120 : 500;
        searchTimer = setTimeout(triggerSearch, delay);
      };

      sInput.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(searchTimer);
          triggerSearch();
        }
      };
    }

    const scopeSelect = document.getElementById('search-scope-select');
    if (scopeSelect) {
      scopeSelect.onchange = () => triggerSearch();
    }
  }

  // Tìm kiếm theo từ khóa (Keyword Text Search)
  function renderKeywordSearchResults(query, scope) {
    const resBox = document.getElementById('search-results');
    if (!resBox) return;

    const q = query.toLowerCase();
    const sessions = window.sessions || [];
    const matched = [];

    if (scope === 'all' || scope === 'chats') {
      sessions.forEach(s => {
        (s.his || []).forEach((m, idx) => {
          const txt = (m.text || '').toLowerCase();
          if (txt.includes(q)) {
            matched.push({
              type: 'chat',
              session: s,
              text: m.text,
              role: m.role,
              time: m.time,
              idx
            });
          }
        });
      });
    }

    resBox.innerHTML = matched.length ? matched.slice(0, 30).map(item => `
      <div onclick="window.switchSess('${item.session.id}'); document.querySelectorAll('.modal-box, #command-palette-modal').forEach(m => m.style.display='none'); document.getElementById('modal-overlay').style.display='none';" style="padding:10px 12px;border-radius:var(--radius-sm);background:var(--bg-main);border-left:3px solid var(--primary);cursor:pointer;font-size:0.82rem;transition:all 0.15s ease;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <strong style="color:var(--primary);">${escapeHtml(item.session.name)} (${item.role === 'user' ? 'Bạn' : 'Jarvis'} - ${item.time || ''})</strong>
          <span style="font-size:0.7rem;color:var(--text-muted);background:var(--bg-card);padding:2px 6px;border-radius:4px;">Từ khóa</span>
        </div>
        <p style="margin:4px 0 0 0;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.text.replace(/<[^>]+>/g, '').substring(0, 120))}</p>
      </div>
    `).join('') : '<i style="color:var(--text-muted);padding:8px;">Không tìm thấy kết quả từ khóa phù hợp. Thử bật chế độ "🧠 Ngữ nghĩa AI".</i>';
  }

  // Tìm kiếm theo ngữ nghĩa AI (Gemini Embedding 2 Vector Search)
  async function renderSemanticSearchResults(query, scope) {
    const resBox = document.getElementById('search-results');
    if (!resBox) return;

    try {
      const results = [];
      const statusBox = document.getElementById('search-semantic-status');

      // 1. Quét lịch sử chat
      if (scope === 'all' || scope === 'chats') {
        const chatMatches = await searchChatHistorySemantic(query, window.sessions || [], {
          topK: 15,
          threshold: 0.52,
          onProgress: p => {
            if (statusBox) statusBox.innerHTML = `<span>⏳</span> ${p.status}`;
          }
        });
        chatMatches.forEach(cm => {
          results.push({
            type: 'chat',
            title: `${cm.session.name} (${cm.message.role === 'user' ? 'Bạn' : 'Jarvis'})`,
            sessionId: cm.session.id,
            text: cm.text,
            similarity: cm.similarity
          });
        });
      }

      // 2. Quét kho tri thức & tài liệu RAG
      if (scope === 'all' || scope === 'knowledge') {
        const kMatches = await searchSimilarVectors(query, { topK: 10, threshold: 0.52 });
        kMatches.forEach(km => {
          results.push({
            type: km.item.type,
            title: km.item.title || km.item.docName,
            text: km.item.text,
            similarity: km.similarity
          });
        });
      }

      results.sort((a, b) => b.similarity - a.similarity);

      if (!results.length) {
        resBox.innerHTML = `<i style="color:var(--text-muted);padding:8px;">Không tìm thấy nội dung có độ khớp ý nghĩa cao. Hãy thử diễn đạt câu hỏi theo cách khác.</i>`;
        return;
      }

      resBox.innerHTML = results.map(item => {
        const pct = Math.round(item.similarity * 100);
        const badgeClass = pct >= 80 ? 'high' : (pct >= 65 ? 'medium' : 'low');
        const clickAction = item.sessionId
          ? `onclick="window.switchSess('${item.sessionId}'); document.querySelectorAll('.modal-box').forEach(m => m.style.display='none'); document.getElementById('modal-overlay').style.display='none';"`
          : `onclick="window.JarvisRAG.openModal('${item.type === 'doc' ? 'docs' : 'memory'}')"`;

        return `
          <div ${clickAction} style="padding:10px 12px;border-radius:var(--radius-sm);background:var(--bg-main);border-left:3px solid #10b981;cursor:pointer;font-size:0.82rem;transition:all 0.15s ease;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <strong style="color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${item.type === 'chat' ? '💬 ' : (item.type === 'doc' ? '📄 ' : '🧠 ')} ${escapeHtml(item.title)}
              </strong>
              <span class="similarity-badge ${badgeClass}">⭐ ${pct}% khớp ý</span>
            </div>
            <p style="margin:4px 0 0 0;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${escapeHtml(item.text.replace(/<[^>]+>/g, '').substring(0, 120))}
            </p>
          </div>
        `;
      }).join('');
    } catch (err) {
      resBox.innerHTML = `<div style="color:var(--danger);padding:8px;">Lỗi tìm kiếm ngữ nghĩa: ${err.message}</div>`;
    }
  }

  // --- UNIFIED MODAL OPENER WITH QUERY ---
  function openSearchModalWithQuery(query = '', mode = null) {
    const sModal = document.getElementById('search-modal');
    const oLay = document.getElementById('modal-overlay');
    const sInput = document.getElementById('global-search-input');
    if (!sModal) return;

    if (mode) {
      currentSearchMode = mode;
      const btnKw = document.getElementById('btn-search-mode-keyword');
      const btnSm = document.getElementById('btn-search-mode-semantic');
      if (btnKw && btnSm) {
        btnKw.classList.toggle('active', mode === 'keyword');
        btnSm.classList.toggle('active', mode === 'semantic');
      }
    }

    sModal.style.display = 'flex';
    if (oLay) oLay.style.display = 'block';

    if (sInput) {
      if (query) sInput.value = query;
      sInput.focus();
      sInput.dispatchEvent(new Event('input'));
    }
  }

  // --- EXPOSE PUBLIC API ---
  window.JarvisRAG = {
    init: initVectorDB,
    getEmbedding,
    cosineSimilarity,
    renderMemoryList,
    editMemory,
    synthesizePersonaProfile,
    addMemory: addMemoryItem,
    deleteMemory: async (id) => {
      await deleteVectorItem(id);
      await renderMemoryList();
      if (typeof window.showToast === 'function') window.showToast("Đã xóa mẩu trí nhớ!", "info");
    },
    deleteDoc: async (docName) => {
      if (confirm(`Bạn có chắc muốn xóa tài liệu "${docName}" khỏi RAG Studio?`)) {
        await deleteDocumentVectors(docName);
        await renderDocsList();
        if (typeof window.showToast === 'function') window.showToast(`Đã xóa tài liệu "${docName}"!`, "info");
      }
    },
    indexDocument,
    searchSimilar: searchSimilarVectors,
    retrieveContext: retrieveContextForPrompt,
    updateRagUI,
    searchChatSemantic: searchChatHistorySemantic,
    openModal: openKnowledgeModal,
    closeModal: closeKnowledgeModal,
    openSearch: openSearchModalWithQuery,
    getAllKnowledge: getAllVectorItems,
    importKnowledge: importKnowledgeItems,
    clearAll: clearAllVectorDB,
    extractAndLearnMemory,
    showRetrievedDetails,
    isPersonalIdentityQuery
  };

  window.showRetrievedRagDetails = showRetrievedDetails;

  // Global functions for inline DOM onclick handlers
  window.openKnowledgeModal = openKnowledgeModal;
  window.closeKnowledgeModal = closeKnowledgeModal;
  window.openSearchModalWithQuery = openSearchModalWithQuery;

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initVectorDB();
      setupRAGListeners();
      setupSearchModalListeners();
    });
  } else {
    initVectorDB();
    setupRAGListeners();
    setupSearchModalListeners();
  }

})();
