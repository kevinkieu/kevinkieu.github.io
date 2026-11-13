/* ==========================================================================
   Jarvis AI - Daily Briefing & Morning Assistant Controller (js/briefing.js)
   Tổng hợp Bản tin Ngày Mới: Dự báo thời tiết địa phương, Điểm tin công nghệ AI,
   Nhắc nhở trọng tâm từ Second Brain và Đọc bản tin bằng giọng Jarvis TTS.
   ========================================================================== */

(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;
  const showToast = (msg, type) => (typeof window.showToast === 'function') ? window.showToast(msg, type) : console.log(`[${type}] ${msg}`);
  const escapeHtml = str => (typeof window.escapeHtml === 'function') ? window.escapeHtml(str) : String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

  let currentDailyBriefingMarkdown = '';

  const VIETNAM_CITIES = [
    'Hà Nội', 'TP. Hồ Chí Minh', 'TP.HCM', 'Hồ Chí Minh', 'Sài Gòn',
    'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Nha Trang', 'Huế',
    'Vũng Tàu', 'Đà Lạt', 'Biên Hòa', 'Bình Dương', 'Đồng Nai',
    'Buôn Ma Thuột', 'Quy Nhơn', 'Long Xuyên', 'Thái Nguyên',
    'Nam Định', 'Rạch Giá', 'Bắc Ninh', 'Bắc Giang', 'Quảng Ninh',
    'Hạ Long', 'Vinh', 'Phan Thiết', 'Thanh Hóa', 'Bến Tre', 'Tiền Giang'
  ];

  async function detectUserCityFromSecondBrain() {
    if (!window.JarvisRAG || typeof window.JarvisRAG.getAllKnowledge !== 'function') return null;
    try {
      const mems = await window.JarvisRAG.getAllKnowledge('memory');
      if (!mems || !mems.length) return null;

      for (const m of mems) {
        const fullText = `${m.title || ''} ${m.text || ''}`.toLowerCase();
        for (const city of VIETNAM_CITIES) {
          if (fullText.includes(city.toLowerCase())) {
            return (city === 'Sài Gòn' || city === 'TP.HCM') ? 'TP. Hồ Chí Minh' : city;
          }
        }
      }
    } catch (e) {
      console.warn("Lỗi đọc vị trí từ Second Brain:", e);
    }
    return null;
  }

  async function resolveUserLocation() {
    // 1. Vị trí đã lưu trong cài đặt
    const savedCity = ls.getItem('jarvis_user_city');
    const savedLat = ls.getItem('jarvis_user_lat');
    const savedLon = ls.getItem('jarvis_user_lon');
    if (savedCity && savedCity.trim()) {
      return { city: savedCity.trim(), lat: savedLat, lon: savedLon, source: 'saved' };
    }

    // 2. Tự động nhận diện từ Trí nhớ cá nhân (Second Brain)
    const brainCity = await detectUserCityFromSecondBrain();
    if (brainCity) {
      ls.setItem('jarvis_user_city', brainCity);
      return { city: brainCity, source: 'brain' };
    }

    // 3. Tự động nhận diện nhanh qua IP Geolocation
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1800);
      const ipRes = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=vi', { signal: controller.signal });
      clearTimeout(timer);
      if (ipRes.ok) {
        const d = await ipRes.json();
        let city = d.city || d.principalSubdivision || d.locality;
        if (city) {
          city = city.replace(/Tỉnh |Thành phố /g, '').trim();
          if (city.toLowerCase().includes('hồ chí minh') || city.toLowerCase().includes('ho chi minh')) city = 'TP. Hồ Chí Minh';
          ls.setItem('jarvis_user_city', city);
          if (d.latitude) ls.setItem('jarvis_user_lat', d.latitude);
          if (d.longitude) ls.setItem('jarvis_user_lon', d.longitude);
          return { city, lat: d.latitude, lon: d.longitude, source: 'ip' };
        }
      }
    } catch (e) {
      console.warn("Lỗi định vị nhanh IP:", e);
    }

    // Mặc định an toàn
    return { city: 'Hà Nội', lat: 21.0285, lon: 105.8542, source: 'default' };
  }

  async function fetchWeatherData(loc) {
    const cityName = loc.city;
    let lat = loc.lat;
    let lon = loc.lon;

    const CITY_COORDS = {
      'hà nội': { lat: 21.0285, lon: 105.8542 },
      'tp. hồ chí minh': { lat: 10.8231, lon: 106.6297 },
      'hồ chí minh': { lat: 10.8231, lon: 106.6297 },
      'sài gòn': { lat: 10.8231, lon: 106.6297 },
      'đà nẵng': { lat: 16.0544, lon: 108.2022 },
      'hải phòng': { lat: 20.8449, lon: 106.6881 },
      'cần thơ': { lat: 10.0452, lon: 105.7469 },
      'nha trang': { lat: 12.2388, lon: 109.1967 },
      'huế': { lat: 16.4637, lon: 107.5909 },
      'vũng tàu': { lat: 10.3460, lon: 107.0843 },
      'đà lạt': { lat: 11.9404, lon: 108.4583 },
      'quy nhơn': { lat: 13.7820, lon: 109.2197 },
      'buôn ma thuột': { lat: 12.6667, lon: 108.0500 },
      'bắc ninh': { lat: 21.1861, lon: 106.0763 },
      'hạ long': { lat: 20.9505, lon: 107.0734 },
      'vinh': { lat: 18.6734, lon: 105.6813 }
    };

    if (!lat || !lon) {
      const cKey = cityName.toLowerCase().trim();
      const match = CITY_COORDS[cKey];
      if (match) {
        lat = match.lat;
        lon = match.lon;
      } else {
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=vi&format=json`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.results && geoData.results.length > 0) {
              lat = geoData.results[0].latitude;
              lon = geoData.results[0].longitude;
            }
          }
        } catch (_) {}
      }
    }

    if (!lat || !lon) {
      lat = 21.0285;
      lon = 105.8542;
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    const wRes = await fetch(weatherUrl);
    if (!wRes.ok) throw new Error("Open-Meteo HTTP " + wRes.status);
    const wData = await wRes.json();

    const cur = wData.current || {};
    const daily = wData.daily || {};

    const weatherCodeMap = {
      0: 'Trời quang đãng, nắng đẹp ☀️',
      1: 'Quang đãng, ít mây 🌤️',
      2: 'Mây rải rác ⛅',
      3: 'Nhiều mây, âm u ☁️',
      45: 'Có sương mù 🌫️',
      48: 'Sương mù đọng sương 🌫️',
      51: 'Mưa phùn nhẹ 🌦️',
      53: 'Mưa phùn vừa 🌦️',
      55: 'Mưa phùn dày hạt 🌧️',
      61: 'Mưa nhỏ rải rác 🌧️',
      63: 'Mưa vừa 🌧️',
      65: 'Mưa to 🌧️',
      71: 'Có tuyết rơi nhẹ 🌨️',
      80: 'Mưa rào nhẹ 🌦️',
      81: 'Mưa rào vừa 🌦️',
      82: 'Mưa rào rất to ⛈️',
      95: 'Dông sét rải rác ⛈️',
      96: 'Dông sét kèm mưa đá ⛈️',
      99: 'Dông bão mạnh ⛈️'
    };

    const condition = weatherCodeMap[cur.weather_code] || 'Trời nhiều mây, nắng ráo ⛅';
    const temp = cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : 29;
    const feel = cur.apparent_temperature !== undefined ? Math.round(cur.apparent_temperature) : temp;
    const humidity = cur.relative_humidity_2m !== undefined ? cur.relative_humidity_2m : 65;
    const wind = cur.wind_speed_10m !== undefined ? Math.round(cur.wind_speed_10m) : 5;
    const minTemp = daily.temperature_2m_min?.[0] !== undefined ? Math.round(daily.temperature_2m_min[0]) : temp - 4;
    const maxTemp = daily.temperature_2m_max?.[0] !== undefined ? Math.round(daily.temperature_2m_max[0]) : temp + 4;

    return {
      cityName,
      lat,
      lon,
      text: `Thời tiết tại ${cityName} hôm nay: ${condition}. Nhiệt độ hiện tại: ${temp}°C (cảm nhận như ${feel}°C). Biên độ nhiệt trong ngày: ${minTemp}°C - ${maxTemp}°C. Độ ẩm: ${humidity}%, sức gió: ${wind} km/h.`
    };
  }

  async function generateDailyBriefing(forceRefresh = false) {
    const loadingEl = $('briefing-loading-state');
    const contentEl = $('briefing-content-body');
    const statusEl = $('briefing-loading-status');
    const speakBtn = $('btn-speak-briefing');

    if (speakBtn) speakBtn.innerHTML = "<span>🔊 Nghe bản tin (Jarvis TTS)</span>";

    const now = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' };
    const dateStr = now.toLocaleDateString('vi-VN', dateOptions);
    const todayKey = now.toISOString().slice(0, 10);

    const dateLabel = $('briefing-date-label');
    if (dateLabel) dateLabel.innerText = `${dateStr} · Báo cáo tổng hợp tự động`;

    const userCity = ls.getItem('jarvis_user_city');
    const locationLabel = $('briefing-location-label');
    if (locationLabel && userCity) locationLabel.innerText = userCity;

    // 1. Kiểm tra cache hôm nay
    if (!forceRefresh) {
      const cached = ls.getItem('jarvis_briefing_' + todayKey);
      if (cached) {
        currentDailyBriefingMarkdown = cached;
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) {
          contentEl.style.display = 'block';
          contentEl.innerHTML = window.marked ? window.marked.parse(cached) : cached;
          window.renderMathInElement?.(contentEl, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
        }
        return;
      }
    }

    // 2. Bắt đầu tổng hợp
    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) {
      contentEl.style.display = 'none';
      contentEl.innerHTML = '';
    }

    try {
      const cs = (window.sessions && Array.isArray(window.sessions) && window.activeId) ? window.sessions.find(x => x.id === window.activeId) : null;
      const activeKeys = (typeof window.getGoogleKeysList === 'function') ? window.getGoogleKeysList().filter(Boolean) : [];
      const key = (typeof window.getSessionApiKey === 'function') ? (window.getSessionApiKey(cs) || activeKeys[0]) : activeKeys[0];
      if (!key) {
        throw new Error("Cần có Google API Key để tổng hợp Bản tin Ngày mới!");
      }

      // Xác định vị trí & thời tiết
      if (statusEl) statusEl.innerText = "Đang xác định vị trí & tra cứu thời tiết chính xác...";
      const loc = await resolveUserLocation();
      if (locationLabel) locationLabel.innerText = loc.city;

      let weatherInfo = '';
      try {
        const wResult = await fetchWeatherData(loc);
        weatherInfo = wResult.text;
      } catch (wErr) {
        console.warn("Lỗi lấy thời tiết:", wErr);
        weatherInfo = `Thời tiết tại ${loc.city}: Nhiệt độ trung bình 28-32°C, thời tiết nắng ráo xen kẽ mây.`;
      }

      // Tra cứu tin tức AI & Công nghệ
      if (statusEl) statusEl.innerText = "Đang quét tin tức Công nghệ & AI nóng nhất sáng nay...";
      let newsInfo = '';
      const newsQuery = "AI technology Google Gemini OpenAI tin tuc cong nghe hom nay";
      try {
        if (typeof window.executeLiveSearch === 'function') {
          newsInfo = await window.executeLiveSearch(newsQuery, 'serper');
        }
      } catch (nErr) {
        console.warn("Lỗi quét tin tức:", nErr);
      }

      // Đọc mục tiêu từ Second Brain
      if (statusEl) statusEl.innerText = "Đang kết nối Trí nhớ cá nhân (Second Brain)...";
      let memoryContext = '';
      if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
        try {
          const memories = await window.JarvisRAG.getAllKnowledge('memory');
          if (memories && memories.length > 0) {
            memoryContext = memories.slice(0, 5).map(m => `- ${m.title || 'Ghi nhớ'}: ${m.text || ''}`).join('\n');
          }
        } catch (mErr) {
          console.warn("Lỗi đọc Second Brain:", mErr);
        }
      }

      // Biên soạn bản tin bằng Flash Lite
      if (statusEl) statusEl.innerText = "Jarvis đang biên soạn bản tin siêu tốc...";
      const currentCityName = locationLabel ? locationLabel.innerText : loc.city;
      const synthesisPrompt = `Bạn là Jarvis - Trợ lý AI cá nhân cao cấp.
Hôm nay là: ${dateStr}.
Vị trí của người dùng: ${currentCityName}.

Thông tin thời tiết thực tế tại ${currentCityName}:
${weatherInfo}

Thông tin tin tức công nghệ / AI thời gian thực thu thập được:
${newsInfo ? newsInfo.slice(0, 2000) : "Các diễn biến phát triển AI mới nhất: Gemini 4 Hydrogen, Gemini 3.6 Flash, các mô hình Agentic AI, tự động hóa quy trình làm việc."}

Dữ liệu trí nhớ Second Brain về người dùng (mục tiêu, sở thích, dự án):
${memoryContext ? memoryContext : "Người dùng là một chuyên gia/kỹ sư công nghệ đam mê AI, tập trung vào hiệu suất cao và ứng dụng AI vào cuộc sống thực tế."}

Nhiệm vụ:
Hãy tạo một "Bản Tin Ngày Mới (Daily Briefing)" cực kỳ truyền cảm hứng, ngắn gọn, súc tích, mang tính thực tế cao cho người dùng:
1. ☀️ **Chào buổi sáng & Thời tiết tại ${currentCityName}:** Lời chào tràn đầy năng lượng, cập nhật ngắn gọn thời tiết và lưu ý trang phục/sức khỏe khi ra ngoài.
2. 🚀 **Điểm tin Công nghệ & AI nóng:** Chọn lọc 2-3 điểm tin công nghệ/AI đáng chú ý nhất.
3. 🎯 **Mục tiêu & Trọng tâm của bạn:** Dựa trên trí nhớ Second Brain, nhắc nhở và đề xuất 1-2 việc ưu tiên cần hoàn thành hôm nay.
4. 💡 **Châm ngôn & Gợi ý hành động:** 1 câu danh ngôn đắt giá và 1 mẹo nhỏ tăng năng suất hôm nay.

Định dạng Markdown đẹp mắt, phân đoạn rõ ràng bằng tiêu đề và bullet points, icon sinh động. Giữ giọng văn tự tin, tinh tế, tận tụy chuẩn phong cách Jarvis.`;

      const GoogleGenAI = window.GoogleGenAI;
      if (!GoogleGenAI) throw new Error("Chưa nạp thư viện GoogleGenAI!");
      const ai = new GoogleGenAI({ apiKey: key });
      const modelsToTry = window.AUX_FALLBACK_MODELS || ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'];
      let generatedText = '';
      let lastError = null;

      for (const m of modelsToTry) {
        try {
          const res = await ai.models.generateContent({
            model: m,
            contents: synthesisPrompt,
            config: {
              temperature: 0.35,
              safetySettings: window.SAFETY || []
            }
          });
          if (res.text) {
            generatedText = res.text;
            break;
          }
        } catch (err) {
          console.warn(`Briefing generation failed on ${m}:`, err);
          lastError = err;
        }
      }

      if (!generatedText) {
        throw lastError || new Error("Không thể tạo bản tin ngày mới lúc này.");
      }

      currentDailyBriefingMarkdown = generatedText;
      ls.setItem('jarvis_briefing_' + todayKey, generatedText);

      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) {
        contentEl.style.display = 'block';
        contentEl.innerHTML = window.marked ? window.marked.parse(generatedText) : generatedText;
        window.renderMathInElement?.(contentEl, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
      }
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) {
        contentEl.style.display = 'block';
        contentEl.innerHTML = `<div style="color:var(--danger);padding:16px;text-align:center;">
          <strong>Không thể tải bản tin ngày mới:</strong> ${escapeHtml(err.message)}
          <div style="margin-top:10px;"><button type="button" class="btn" onclick="window.generateDailyBriefing(true)">Thử lại</button></div>
        </div>`;
      }
    }
  }

  function openDailyBriefing() {
    const modal = $('daily-briefing-modal');
    const oLay = $('modal-overlay');
    if (!modal) return;
    modal.style.display = 'flex';
    if (oLay) oLay.style.display = 'block';
    generateDailyBriefing(false);
  }

  function initDailyBriefingEvents() {
    const btnOpenBriefing = $('btn-open-briefing');
    if (btnOpenBriefing) btnOpenBriefing.onclick = openDailyBriefing;

    const btnRefreshBriefing = $('btn-refresh-briefing');
    if (btnRefreshBriefing) btnRefreshBriefing.onclick = () => generateDailyBriefing(true);

    const btnSpeakBriefing = $('btn-speak-briefing');
    if (btnSpeakBriefing) {
      btnSpeakBriefing.onclick = () => {
        if (!currentDailyBriefingMarkdown) {
          return showToast("Chưa có nội dung bản tin để phát giọng nói!", "warning");
        }
        if (typeof window.playTextAudio === 'function') {
          window.playTextAudio(currentDailyBriefingMarkdown, { btn: btnSpeakBriefing });
        }
      };
    }

    const btnCopyBriefing = $('btn-copy-briefing');
    if (btnCopyBriefing) {
      btnCopyBriefing.onclick = async () => {
        if (!currentDailyBriefingMarkdown) return showToast("Chưa có nội dung để sao chép!", "warning");
        try {
          await navigator.clipboard.writeText(currentDailyBriefingMarkdown);
          showToast("📋 Đã sao chép bản tin ngày mới vào Clipboard!", "success");
        } catch (e) {
          showToast("Không thể sao chép: " + e.message, "danger");
        }
      };
    }

    const btnDiscussBriefing = $('btn-discuss-briefing');
    if (btnDiscussBriefing) {
      btnDiscussBriefing.onclick = () => {
        const modal = $('daily-briefing-modal');
        const oLay = $('modal-overlay');
        if (modal) modal.style.display = 'none';
        if (oLay) oLay.style.display = 'none';
        const userInp = $('user-input');
        if (userInp) {
          userInp.value = "Tôi vừa xem Bản Tin Ngày Mới. Hãy cùng tôi phân tích sâu hơn về các mục tiêu công việc hôm nay: ";
          userInp.dispatchEvent(new Event('input'));
          userInp.focus();
        }
      };
    }

    const btnChangeLocation = $('btn-change-location');
    if (btnChangeLocation) {
      btnChangeLocation.onclick = () => {
        const currentCity = ls.getItem('jarvis_user_city') || 'Hà Nội';
        const newCity = prompt("Nhập tên thành phố / tỉnh của bạn để nhận dự báo thời tiết chính xác:\n(Ví dụ: Hà Nội, TP. Hồ Chí Minh, Đà Nẵng, Cần Thơ, Hải Phòng, Nha Trang, Huế...)", currentCity);
        if (newCity && newCity.trim() && newCity.trim() !== currentCity) {
          ls.setItem('jarvis_user_city', newCity.trim());
          ls.removeItem('jarvis_user_lat');
          ls.removeItem('jarvis_user_lon');
          const todayKey = new Date().toISOString().slice(0, 10);
          ls.removeItem('jarvis_briefing_' + todayKey);
          showToast(`📍 Đã đổi vị trí sang: ${newCity.trim()}`, "success");
          generateDailyBriefing(true);
        }
      };
    }

    const btnGpsLocation = $('btn-gps-location');
    if (btnGpsLocation) {
      btnGpsLocation.onclick = () => {
        if (!navigator.geolocation) {
          return showToast("Trình duyệt không hỗ trợ Geolocation!", "warning");
        }
        btnGpsLocation.disabled = true;
        btnGpsLocation.innerText = "⏳ Đang định vị...";
        showToast("Đang xin quyền định vị GPS từ trình duyệt...", "info");

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            btnGpsLocation.disabled = false;
            btnGpsLocation.innerText = "🎯 Định vị GPS";
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            ls.setItem('jarvis_user_lat', lat);
            ls.setItem('jarvis_user_lon', lon);

            let detectedCity = 'Vị trí hiện tại';
            try {
              const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=vi`);
              if (r.ok) {
                const d = await r.json();
                detectedCity = d.city || d.principalSubdivision || d.locality || detectedCity;
                detectedCity = detectedCity.replace(/Tỉnh |Thành phố /g, '').trim();
              }
            } catch (e) {}

            ls.setItem('jarvis_user_city', detectedCity);
            const todayKey = new Date().toISOString().slice(0, 10);
            ls.removeItem('jarvis_briefing_' + todayKey);
            showToast(`🎯 Định vị GPS thành công: ${detectedCity}!`, "success");
            generateDailyBriefing(true);
          },
          (err) => {
            btnGpsLocation.disabled = false;
            btnGpsLocation.innerText = "🎯 Định vị GPS";
            console.warn("GPS error:", err);
            showToast("Không thể lấy toạ độ GPS: " + (err.message || "Bị từ chối quyền"), "warning");
          },
          { timeout: 10000, enableHighAccuracy: true }
        );
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDailyBriefingEvents);
  } else {
    setTimeout(initDailyBriefingEvents, 100);
  }

  // Window exports
  window.generateDailyBriefing = generateDailyBriefing;
  window.openDailyBriefing = openDailyBriefing;

})();
