/* ==========================================================================
   Jarvis AI - Knowledge Base, RAG Studio & Semantic Search (js/rag.js)
   Powered by Gemini Embedding 2 (Unified Multimodal Embedding Engine)
   ========================================================================== */

(function () {
  'use strict';

  // --- MODEL IDENTIFIERS ---
  const PRIMARY_EMBEDDING_MODEL = "gemini-embedding-001";
  const FALLBACK_EMBEDDING_MODEL = "gemini-embedding-2";

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

  // --- DB CRUD HELPERS ---
  async function saveVectorItem(item) {
    const db = await initVectorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
      tx.objectStore(VECTOR_STORE_NAME).put(item);
      tx.oncomplete = () => resolve(item);
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
    const db = await initVectorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
      tx.objectStore(VECTOR_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve(true);
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
            store.delete(item.id);
          }
        });
      };
      tx.oncomplete = () => resolve(true);
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
        if (it && it.id) {
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

  // --- EMBEDDING API CALL WITH FALLBACK & CACHING ---
  async function getEmbedding(text, customApiKey = null) {
    const cleanText = (text || '').trim();
    if (!cleanText) return null;

    // Cache hit -> 0ms latency!
    if (embeddingCache.has(cleanText)) {
      return embeddingCache.get(cleanText);
    }

    const apiKey = customApiKey || getActiveApiKey();
    if (!apiKey) {
      throw new Error("Cần ít nhất 1 Google API Key hợp lệ trong Cài đặt để tạo Vector Embedding.");
    }

    if (!window.GoogleGenAI) {
      throw new Error("Thư viện GoogleGenAI chưa sẵn sàng.");
    }

    const ai = new window.GoogleGenAI({ apiKey });
    let vector = null;

    try {
      // 1. Thử model chuẩn tốc độ cao: gemini-embedding-001
      const res = await ai.models.embedContent({
        model: PRIMARY_EMBEDDING_MODEL,
        contents: cleanText
      });
      vector = res?.embedding?.values || res?.embeddings?.[0]?.values;
    } catch (err) {
      console.warn(`[RAG] ${PRIMARY_EMBEDDING_MODEL} không phản hồi, tự động dùng ${FALLBACK_EMBEDDING_MODEL}:`, err);
      try {
        // 2. Dự phòng: gemini-embedding-2
        const fallbackRes = await ai.models.embedContent({
          model: FALLBACK_EMBEDDING_MODEL,
          contents: cleanText
        });
        vector = fallbackRes?.embedding?.values || fallbackRes?.embeddings?.[0]?.values;
      } catch (err2) {
        console.error("[RAG] Cả 2 model embedding đều lỗi:", err2);
        throw err2;
      }
    }

    if (vector && Array.isArray(vector)) {
      embeddingCache.set(cleanText, vector);
      // Giữ kích thước cache tối đa 400 mục
      if (embeddingCache.size > 400) {
        const firstKey = embeddingCache.keys().next().value;
        embeddingCache.delete(firstKey);
      }
      return vector;
    }

    throw new Error("Không nhận được vector từ Google Gemini API.");
  }

  // --- TEXT CHUNKING WITH OVERLAP ---
  function chunkText(text, chunkSize = 750, overlap = 120) {
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
        const lastBreak = Math.max(sub.lastIndexOf('\n'), sub.lastIndexOf('. '), sub.lastIndexOf('? '), sub.lastIndexOf('! '));
        if (lastBreak > chunkSize * 0.6) {
          end = start + lastBreak + 1;
        }
      } else {
        end = clean.length;
      }

      const chunk = clean.substring(start, end).trim();
      if (chunk.length >= 30) chunks.push(chunk);

      start = end - overlap;
      if (start >= clean.length) break;
    }
    return chunks;
  }

  // --- KNOWLEDGE BASE: ADD PERSONAL MEMORY (SECOND BRAIN) ---
  async function addMemoryItem({ title, text, category = 'personal' }, customApiKey = null) {
    if (!text || !text.trim()) throw new Error("Nội dung không được để trống.");
    const embedding = await getEmbedding(text.trim(), customApiKey);
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

      const vector = await getEmbedding(chunk);
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
    }

    return { docName, totalChunks: chunks.length };
  }

  // --- SIMILARITY SEARCH ACROSS KNOWLEDGE BASE ---
  async function searchSimilarVectors(query, options = {}) {
    const { topK = 4, threshold = 0.58, type = null, apiKey = null } = options;
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    const queryVector = await getEmbedding(cleanQuery, apiKey);
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

  // --- SMART CONTEXT RETRIEVAL FOR CHAT (LATENCY-GUARDED) ---
  async function retrieveContextForPrompt(userPrompt, apiKey = null) {
    const ls = window.ls || localStorage;
    const isRagEnabled = ls.getItem('jarvis_rag_enabled') !== 'false';
    if (!isRagEnabled) return { text: "", matches: [] };

    const cleanPrompt = (userPrompt || '').trim();
    // Bỏ qua tin nhắn quá ngắn hoặc chào hỏi xã giao (0ms Latency!)
    if (cleanPrompt.length < 6) return { text: "", matches: [] };
    if (/^(chào|hi|hello|alo|ê|ơi|chào bạn|xin chào|ok|tiếp|tóm tắt|dạ|vâng|cảm ơn|thanks|bye|tạm biệt)\b/i.test(cleanPrompt) || /^(tôi thích|tôi ghét|tên tôi|tôi tên|nhà tôi|tôi sống|tôi ở|tôi làm|nghề của tôi|tôi sinh năm|sở thích của tôi|từ giờ hãy gọi tôi|hãy nhớ rằng tôi)\b/i.test(cleanPrompt)) {
      return { text: "", matches: [] };
    }

    try {
      const allItems = await getAllVectorItems();
      if (!allItems || allItems.length === 0) return { text: "", matches: [] }; // Không có tri thức -> 0ms

      const retrievalPromise = searchSimilarVectors(cleanPrompt, { topK: 3, threshold: 0.58, apiKey });
      const matches = await Promise.race([retrievalPromise, new Promise(r => setTimeout(() => r([]), 1000))]);
      if (!matches.length) return { text: "", matches: [] };

      const formattedSnippets = matches.map((m, idx) => {
        const item = m.item;
        const pct = Math.round(m.similarity * 100);
        if (item.type === 'doc') {
          return `--- [Trích đoạn Tài liệu RAG #${idx + 1}: "${item.docName || item.title}" (Độ phù hợp: ${pct}%)]:\n${item.text}`;
        } else {
          return `--- [Trí nhớ cá nhân #${idx + 1}: "${item.title}" (Độ phù hợp: ${pct}%)]:\n${item.text}`;
        }
      }).join('\n\n');

      const text = `\n\n[DỮ LIỆU TRÍ NHỚ VÀ TÀI LIỆU TRÍCH XUẤT TỪ KHO RAG]:\n${formattedSnippets}\n\n[CHỈ THỊ RAG]: Hãy sử dụng dữ liệu trích xuất ở trên khi trả lời người dùng một cách chính xác, đúng ngữ cảnh và tự nhiên nhất. Nếu có thông tin trong tài liệu hoặc ghi nhớ cá nhân trên, hãy ưu tiên áp dụng.`;
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

      const activeModel = document.getElementById('model-select')?.value || 'gemini-3.6-flash';
      const modelsToTry = [activeModel, 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
      const uniqueModels = [...new Set(modelsToTry)];

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
          const duplicates = await searchSimilarVectors(parsed.text, { topK: 1, threshold: 0.90, apiKey: key });
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

  async function renderMemoryList() {
    const container = document.getElementById('memory-list-container');
    const countBadge = document.getElementById('memory-count-badge');
    if (!container) return;

    try {
      const items = await getAllVectorItems('memory');
      if (countBadge) countBadge.innerText = `${items.length} mục`;

      if (!items.length) {
        container.innerHTML = `
          <div style="text-align:center;padding:24px 12px;color:var(--text-muted);font-size:0.82rem;">
            Chưa có mẩu trí nhớ nào. Hãy thêm thông tin về bạn, sở thích hoặc quy tắc làm việc ở trên!
          </div>
        `;
        return;
      }

      container.innerHTML = items.map(item => {
        const dateStr = new Date(item.createdAt).toLocaleDateString('vi-VN');
        const catMap = {
          personal: 'Cá nhân',
          work: 'Công việc',
          hobbies: 'Sở thích',
          project: 'Dự án',
          rules: 'Quy tắc'
        };
        const catName = catMap[item.category] || item.category || 'Cá nhân';
        return `
          <div class="memory-card" id="card-${item.id}">
            <div class="memory-card-header">
              <span class="memory-card-title">
                📌 ${escapeHtml(item.title)}
              </span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="memory-tag ${item.category || 'personal'}">${catName}</span>
                <button class="icon-btn" onclick="window.JarvisRAG.deleteMemory('${item.id}')" title="Xóa mẩu trí nhớ" style="width:24px;height:24px;color:var(--danger);">
                  🗑️
                </button>
              </div>
            </div>
            <div class="memory-card-body">${escapeHtml(item.text)}</div>
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

        if (!textContent && file) {
          try {
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
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
                throw new Error("Không thể đọc tệp PDF. pdfjs chưa sẵn sàng.");
              }
            } else {
              textContent = await file.text();
            }
          } catch (readErr) {
            if (typeof window.showToast === 'function') {
              window.showToast(`Lỗi đọc tệp: ${readErr.message}`, "danger");
            }
            return;
          }
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

    // 5. Tool-chip toggle trên thanh chat
    const btnToggleRag = document.getElementById('btn-toggle-rag-memory');
    const ragStateEl = document.getElementById('rag-memory-state');
    const toggleRagSidebar = document.getElementById('toggle-rag-embedding');

    const updateRagUI = (enabled) => {
      if (ragStateEl) {
        ragStateEl.innerText = enabled ? 'BẬT' : 'TẮT';
        ragStateEl.style.color = enabled ? 'var(--success)' : 'var(--text-muted)';
      }
      if (toggleRagSidebar) toggleRagSidebar.checked = enabled;
      localStorage.setItem('jarvis_rag_enabled', enabled ? 'true' : 'false');
    };

    const initialRagState = localStorage.getItem('jarvis_rag_enabled') !== 'false';
    updateRagUI(initialRagState);

    if (btnToggleRag) {
      btnToggleRag.onclick = () => {
        const cur = localStorage.getItem('jarvis_rag_enabled') !== 'false';
        updateRagUI(!cur);
        if (typeof window.showToast === 'function') {
          window.showToast(`Trí nhớ Vector RAG: ${!cur ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`, !cur ? 'success' : 'warning');
        }
      };
    }

    if (toggleRagSidebar) {
      toggleRagSidebar.onchange = () => {
        updateRagUI(toggleRagSidebar.checked);
      };
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
    searchChatSemantic: searchChatHistorySemantic,
    openModal: openKnowledgeModal,
    closeModal: closeKnowledgeModal,
    openSearch: openSearchModalWithQuery,
    getAllKnowledge: getAllVectorItems,
    importKnowledge: importKnowledgeItems,
    clearAll: clearAllVectorDB,
    extractAndLearnMemory,
    showRetrievedDetails
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
