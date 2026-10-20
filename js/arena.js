/* ==========================================================================
   Jarvis AI - Multi-Agent Arena (Debate & Referee Verdict) Module
   ========================================================================== */

    // --- MULTI-AGENT ARENA CONTROLLER ---
    let currentArenaPreset = 'pro-con';
    let arenaAbortCtrl = null;
    let lastArenaTranscript = [];
    let lastArenaTopic = '';

    window.openArenaModal = function() {
      const modal = $('arena-modal');
      if (!modal) return;
      modal.style.display = 'flex';
      if (oLay) oLay.style.display = 'block';
      
      // Pre-fill topic if user has written in prompt box
      if (DOM.input && DOM.input.value.trim() && !$('arena-topic-input').value.trim()) {
        $('arena-topic-input').value = DOM.input.value.trim();
      }
      setTimeout(() => $('arena-topic-input')?.focus(), 60);
    };

    window.closeArenaModal = function() {
      const modal = $('arena-modal');
      if (modal) modal.style.display = 'none';
      if (oLay) oLay.style.display = 'none';
      if (arenaAbortCtrl) {
        arenaAbortCtrl.abort();
        arenaAbortCtrl = null;
      }
    };

    window.setArenaTopic = function(topic) {
      if ($('arena-topic-input')) {
        $('arena-topic-input').value = topic;
        $('arena-topic-input').focus();
      }
    };

    window.selectArenaPreset = function(presetKey) {
      currentArenaPreset = presetKey;
      document.querySelectorAll('.arena-preset-card').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-preset') === presetKey);
      });
      const customBox = $('arena-custom-roles');
      if (customBox) {
        customBox.style.display = presetKey === 'custom' ? 'block' : 'none';
      }
    };

    $('btn-arena-reset')?.addEventListener('click', () => {
      if (arenaAbortCtrl) {
        arenaAbortCtrl.abort();
        arenaAbortCtrl = null;
      }
      $('arena-stage-view').style.display = 'none';
      $('arena-setup-view').style.display = 'flex';
    });

    $('btn-arena-stop')?.addEventListener('click', () => {
      if (arenaAbortCtrl) {
        arenaAbortCtrl.abort();
        arenaAbortCtrl = null;
        showToast("⏹️ Đã dừng lượt tranh biện!", "warning");
      }
    });

    async function callArenaModel(model, prompt, signal) {
      const cs = sessions.find(x => x.id === activeId);
      const k = getSessionApiKey(cs, true);
      if (!k) throw new Error("Chưa có API Key Google khả dụng. Vui lòng cấu hình trong Cài đặt!");

      const ai = new GoogleGenAI({ apiKey: k });
      const res = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          safetySettings: SAFETY,
          temperature: 0.7
        }
      });
      return res.text || "(Không nhận được phản hồi)";
    }

    $('btn-start-arena')?.addEventListener('click', async () => {
      const topic = $('arena-topic-input').value.trim();
      if (!topic) {
        showToast("Vui lòng nhập chủ đề tranh luận!", "warning");
        $('arena-topic-input').focus();
        return;
      }

      const cs = sessions.find(x => x.id === activeId);
      const k = getSessionApiKey(cs);
      if (!k) {
        showToast("Vui lòng cấu hình Google API Key trước khi tranh biện!", "danger");
        return;
      }

      const model = $('arena-model').value || 'gemini-3.5-flash-lite';
      const totalRounds = parseInt($('arena-rounds').value) || 2;
      const presetKey = currentArenaPreset;

      let roleA = "Bên Ủng Hộ (Advocate)";
      let stanceA = "Tìm kiếm mọi cơ hội, lợi ích, giá trị thực tiễn và đưa ra các luận cứ thuyết phục nhất để bảo vệ quan điểm.";
      let roleB = "Bên Phản Biện (Skeptic / Devil's Advocate)";
      let stanceB = "Vạch ra mọi rủi ro tiềm ẩn, chi phí ngầm, rào cản thực thi và kịch bản thất bại tồi tệ nhất.";

      if (presetKey === 'tech-biz') {
        roleA = "Chuyên Gia Kỹ Thuật (Tech Lead)";
        stanceA = "Tối ưu hóa kiến trúc, hiệu năng, độ tin cậy kỹ thuật và khả năng mở rộng hệ thống.";
        roleB = "Giám Đốc Kinh Doanh (Business ROI & Product Manager)";
        stanceB = "Tối ưu hóa chi phí đầu tư, thời gian đưa sản phẩm ra thị trường, tính kinh tế và trải nghiệm người dùng.";
      } else if (presetKey === 'vision-pragmatic') {
        roleA = "Nhà Đổi Mới Táo Bạo (Visionary Innovator)";
        stanceA = "Tư duy đột phá, đón đầu tương lai, chấp nhận mạo hiểm để tạo ra bước nhảy vọt.";
        roleB = "Chuyên Gia Thực Tế & Thận Trọng (Pragmatic Realist)";
        stanceB = "Bám sát thực tế nguồn lực hiện có, ưu tiên giải pháp an toàn, chắc chắn, kiểm soát rủi ro.";
      } else if (presetKey === 'custom') {
        roleA = $('arena-role-a').value.trim() || "Agent A (Ủng hộ)";
        stanceA = $('arena-desc-a').value.trim() || "Bảo vệ lập trường bằng logic chặt chẽ.";
        roleB = $('arena-role-b').value.trim() || "Agent B (Phản biện)";
        stanceB = $('arena-desc-b').value.trim() || "Phản bác và chỉ ra các kẽ hở sắc bén.";
      }

      // Switch view
      $('arena-setup-view').style.display = 'none';
      $('arena-stage-view').style.display = 'flex';
      const stream = $('arena-debate-stream');
      stream.innerHTML = '';
      $('arena-bottom-actions').style.display = 'none';
      $('arena-status-badge').className = 'arena-status-badge';
      $('btn-arena-stop').style.display = 'inline-block';

      arenaAbortCtrl = new AbortController();
      lastArenaTopic = topic;
      lastArenaTranscript = [];
      lastArenaTranscript.push({ speaker: 'CHỦ ĐỀ TRANH BIỆN', text: topic });

      try {
        for (let round = 1; round <= totalRounds; round++) {
          if (arenaAbortCtrl?.signal?.aborted) break;

          // Round divider
          const roundDiv = document.createElement('div');
          roundDiv.className = 'arena-round-divider';
          roundDiv.innerHTML = `<span>⚔️ HIỆP ${round} / ${totalRounds}</span>`;
          stream.appendChild(roundDiv);
          stream.scrollTop = stream.scrollHeight;

          // AGENT A TURN
          $('arena-status-text').innerText = `Hiệp ${round}: ${roleA} đang lập luận...`;
          const cardA = document.createElement('div');
          cardA.className = 'arena-card agent-a';
          cardA.innerHTML = `
            <div class="arena-card-header">
              <div class="arena-card-speaker">
                <span class="arena-avatar">🔵</span>
                <div>
                  <strong>${roleA}</strong>
                  <small>Lượt phát biểu hiệp ${round}</small>
                </div>
              </div>
              <span class="arena-role-pill a">Ủng hộ</span>
            </div>
            <div class="arena-card-body"><span class="pulse-dot"></span> Đang tư duy lập luận sắc bén...</div>
          `;
          stream.appendChild(cardA);
          stream.scrollTop = stream.scrollHeight;

          let promptA = "";
          if (round === 1) {
            promptA = `Bạn là ${roleA}. Lập trường của bạn: ${stanceA}.\nChủ đề tranh luận: "${topic}".\nNhiệm vụ (Hiệp 1): Trình bày bài phát biểu mở màn thật sắc bén, nêu 3-4 luận điểm cốt lõi nhất để bảo vệ lập trường của bạn. Trình bày rõ ràng, mạch lạc, có dẫn chứng logic. Hãy nói với sự tự tin như một nhà hùng biện xuất sắc.`;
          } else {
            const prevB = lastArenaTranscript.filter(x => x.speaker === roleB).slice(-1)[0]?.text || '';
            promptA = `Bạn là ${roleA}. Lập trường: ${stanceA}.\nChủ đề: "${topic}".\nĐối thủ (${roleB}) vừa phản biện:\n"${prevB}"\n\nNhiệm vụ của bạn (Hiệp ${round}): Hãy đáp trả thẳng thắn các chỉ trích và nghi ngại mà đối thủ vừa nêu. Đưa ra giải pháp hóa giải rủi ro, đồng thời củng cố lại lý do vì sao lập trường của bạn vẫn là lựa chọn ưu việt. Logic đanh thép, hùng biện tự tin.`;
          }

          const bodyA = cardA.querySelector('.arena-card-body');
          const headA = cardA.querySelector('.arena-card-header');
          if (headA) {
            headA.style.cursor = 'pointer';
            headA.title = 'Nhấn để thu gọn / mở rộng';
            headA.onclick = () => { bodyA.style.display = bodyA.style.display === 'none' ? 'block' : 'none'; };
          }
          const speechA = await callArenaModel(model, promptA, arenaAbortCtrl.signal);
          bodyA.innerHTML = marked.parse(speechA);
          window.renderMathInElement?.(bodyA, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
          lastArenaTranscript.push({ speaker: roleA, round, text: speechA });
          stream.scrollTop = stream.scrollHeight;

          if (arenaAbortCtrl?.signal?.aborted) break;

          // AGENT B TURN
          $('arena-status-text').innerText = `Hiệp ${round}: ${roleB} đang phản bác...`;
          const cardB = document.createElement('div');
          cardB.className = 'arena-card agent-b';
          cardB.innerHTML = `
            <div class="arena-card-header">
              <div class="arena-card-speaker">
                <span class="arena-avatar">🔴</span>
                <div>
                  <strong>${roleB}</strong>
                  <small>Lượt phản bác hiệp ${round}</small>
                </div>
              </div>
              <span class="arena-role-pill b">Phản biện</span>
            </div>
            <div class="arena-card-body"><span class="pulse-dot"></span> Đang phân tích kẽ hở & chuẩn bị phản đòn...</div>
          `;
          stream.appendChild(cardB);
          stream.scrollTop = stream.scrollHeight;

          const promptB = `Bạn là ${roleB}. Lập trường của bạn: ${stanceB}.\nChủ đề tranh luận: "${topic}".\nĐối thủ (${roleA}) vừa phát biểu:\n"${speechA}"\n\nNhiệm vụ của bạn (Hiệp ${round}): Hãy phản bác trực diện vào các luận điểm mà đối thủ vừa đưa ra! Vạch ra những lỗ hổng logic, chi phí ngầm, rủi ro tiềm ẩn hoặc sự thiếu thực tế. Đặt ra những câu hỏi hóc búa và đưa ra lập luận phản chứng mạnh mẽ. Phát biểu đanh thép, thuyết phục.`;

          const bodyB = cardB.querySelector('.arena-card-body');
          const headB = cardB.querySelector('.arena-card-header');
          if (headB) {
            headB.style.cursor = 'pointer';
            headB.title = 'Nhấn để thu gọn / mở rộng';
            headB.onclick = () => { bodyB.style.display = bodyB.style.display === 'none' ? 'block' : 'none'; };
          }
          const speechB = await callArenaModel(model, promptB, arenaAbortCtrl.signal);
          bodyB.innerHTML = marked.parse(speechB);
          window.renderMathInElement?.(bodyB, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
          lastArenaTranscript.push({ speaker: roleB, round, text: speechB });
          stream.scrollTop = stream.scrollHeight;
        }

        if (!arenaAbortCtrl?.signal?.aborted) {
          // REFEREE VERDICT
          $('arena-status-text').innerText = `Trọng tài AI đang tổng hợp phán quyết khách quan...`;
          const cardRef = document.createElement('div');
          cardRef.className = 'arena-card referee';
          cardRef.innerHTML = `
            <div class="arena-card-header">
              <div class="arena-card-speaker">
                <span class="arena-avatar">⚖️</span>
                <div>
                  <strong style="color:#d97706;">Trọng Tài AI (Verdict & Actionable Synthesis)</strong>
                  <small>Tổng kết đa chiều & Ma trận quyết định</small>
                </div>
              </div>
              <span class="arena-role-pill ref">Phán quyết</span>
            </div>
            <div class="arena-card-body"><span class="pulse-dot"></span> Đang lập bảng so sánh và phân tích hành động...</div>
          `;
          stream.appendChild(cardRef);
          stream.scrollTop = stream.scrollHeight;

          const summaryLog = lastArenaTranscript.map(x => `### ${x.speaker}${x.round ? ` (Hiệp ${x.round})` : ''}:\n${x.text}`).join('\n\n');

          const promptRef = `Bạn là một Trọng Tài và Cố Vấn Chiến Lược Khách Quan Cấp Cao (Senior Strategic Advisor & Referee).\nChủ đề tranh luận: "${topic}".\n\nDưới đây là biên bản tranh luận giữa ${roleA} và ${roleB}:\n${summaryLog}\n\nNhiệm vụ của bạn là đưa ra một Báo Cáo Phán Quyết Toàn Diện và Thực Tiễn:\n1. 📊 **BẢNG SO SÁNH ĐỐI CHIẾU:** Bảng Markdown tóm tắt Điểm Mạnh Nhất của Bên A vs Rủi Ro Lớn Nhất của Bên B.\n2. 🤝 **ĐIỂM ĐỒNG THUẬN (Common Ground):** Những thực tế khách quan mà cả hai bên đều phải thừa nhận.\n3. ⚖️ **CHẤM ĐIỂM LUẬN ĐIỂM (Thang điểm 1 - 10):** Đánh giá sức thuyết phục của mỗi bên kèm lý do ngắn gọn.\n4. 🏆 **PHÁN QUYẾT & LỜI KHUYÊN HÀNH ĐỘNG (Actionable Verdict):**\n   - Khi nào NÊN chọn giải pháp của Bên A?\n   - Khi nào NÊN chọn giải pháp của Bên B?\n   - Đề xuất lộ trình hoặc giải pháp dung hòa tối ưu (Hybrid Solution) giúp tối đa hóa lợi ích và kiểm soát rủi ro.`;

          const bodyRef = cardRef.querySelector('.arena-card-body');
          const headRef = cardRef.querySelector('.arena-card-header');
          if (headRef) {
            headRef.style.cursor = 'pointer';
            headRef.title = 'Nhấn để thu gọn / mở rộng';
            headRef.onclick = () => { bodyRef.style.display = bodyRef.style.display === 'none' ? 'block' : 'none'; };
          }
          const speechRef = await callArenaModel(model, promptRef, arenaAbortCtrl.signal);
          bodyRef.innerHTML = marked.parse(speechRef);
          window.renderMathInElement?.(bodyRef, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
          lastArenaTranscript.push({ speaker: 'TRỌNG TÀI AI (PHÁN QUYẾT)', text: speechRef });
          stream.scrollTop = stream.scrollHeight;
          setTimeout(() => { cardRef.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);

          $('arena-status-text').innerText = `✅ Đã có phán quyết trọng tài!`;
          $('arena-status-badge').className = 'arena-status-badge complete';
        } else {
          $('arena-status-text').innerText = `⏹️ Đã dừng tranh biện.`;
          $('arena-status-badge').className = 'arena-status-badge stopped';
        }

      } catch (err) {
        if (err.name === 'AbortError') {
          $('arena-status-text').innerText = `⏹️ Đã dừng tranh biện.`;
        } else {
          $('arena-status-text').innerText = `❌ Lỗi: ${err.message}`;
          showToast(`Lỗi tranh biện: ${err.message}`, 'danger');
        }
      } finally {
        $('btn-arena-stop').style.display = 'none';
        $('arena-bottom-actions').style.display = 'flex';
      }
    });

    $('btn-arena-export-chat')?.addEventListener('click', async () => {
      if (!lastArenaTranscript || lastArenaTranscript.length <= 1) {
        return showToast("Chưa có nội dung tranh biện để lưu!", "warning");
      }
      let md = `## ⚔️ ĐẤU TRƯỜNG TRANH BIỆN AI: ${lastArenaTopic}\n\n`;
      lastArenaTranscript.forEach(t => {
        if (t.speaker === 'CHỦ ĐỀ TRANH BIỆN') return;
        md += `### ${t.speaker}${t.round ? ` (Hiệp ${t.round})` : ''}\n\n${t.text}\n\n---\n\n`;
      });

      const cs = sessions.find(x => x.id === activeId);
      if (!cs) return showToast("Không tìm thấy phiên chat!", "danger");
      chatHistory.push({
        role: 'model',
        text: md.trim(),
        time: getNowTime24h(),
        isArenaDebate: true
      });
      cs.his = chatHistory;
      await saveToDB(cs);
      await switchSess(activeId);
      closeArenaModal();
      showToast("💬 Đã lưu toàn bộ biên bản tranh biện vào phiên Chat!", "success");
    });

    $('btn-arena-copy-all')?.addEventListener('click', () => {
      if (!lastArenaTranscript || lastArenaTranscript.length <= 1) {
        return showToast("Chưa có nội dung tranh biện!", "warning");
      }
      let md = `# ⚔️ ĐẤU TRƯỜNG TRANH BIỆN AI: ${lastArenaTopic}\n\n`;
      lastArenaTranscript.forEach(t => {
        if (t.speaker === 'CHỦ ĐỀ TRANH BIỆN') return;
        md += `## ${t.speaker}${t.round ? ` (Hiệp ${t.round})` : ''}\n\n${t.text}\n\n---\n\n`;
      });
      fallbackBrowserDownload(new Blob([md], { type: 'text/markdown' }), `arena_debate_${Date.now()}.md`);
      showToast("📋 Đã sao chép/xuất biên bản tranh biện!");
    });
