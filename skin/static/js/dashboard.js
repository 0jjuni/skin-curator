(() => {
  const storageKeys = {
    surveyId: "skin_survey_id",
    ageGroup: "skin_age_group",
  };

  const labels = {
    skinType: ["건성", "중성", "지성"],
    severity3: ["낮음", "보통", "높음"],
    moisture: ["부족", "충분"],
    lips: ["양호", "보통", "건조"],
  };

  const state = {
    surveyId: localStorage.getItem(storageKeys.surveyId) || "",
    predictionId: null,
    prediction: null,
    history: [],
    busy: false,
    stage: "upload",
    ageGroup: localStorage.getItem(storageKeys.ageGroup) || "twenties",
  };

  const elements = {};
  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    return `${Number(value || 0).toLocaleString("ko-KR")}원`;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function setStatus(message = "", tone = "info") {
    elements.status.textContent = message;
    elements.status.className = `status ${tone === "error" ? "error" : tone === "success" ? "success" : ""}`.trim();
  }

  function getRadioValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
  }

  function setRadioValue(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  function setBusy(isBusy, message) {
    state.busy = isBusy;
    if (message) setStatus(message);
    syncControls();
  }

  function setStage(stage) {
    state.stage = stage;
    const order = ["upload", "analysis", "recommend"];
    elements.flowSteps.forEach((step) => {
      const stepStage = step.dataset.stage;
      step.classList.toggle("active", stepStage === stage);
      step.classList.toggle("done", order.indexOf(stepStage) < order.indexOf(stage));
    });
  }

  function syncControls() {
    const hasSavedPrediction = Boolean(state.predictionId);
    const hasPreviewFile = Boolean(elements.imageInput.files[0]);

    elements.surveyButton.disabled = state.busy;
    elements.analyzeButton.disabled = state.busy || !hasPreviewFile;
    elements.historyButton.disabled = state.busy;
    elements.diagnosisButton.disabled = state.busy || !hasSavedPrediction;
    elements.recommendButton.disabled = state.busy || !hasSavedPrediction;
  }

  async function api(path, options = {}) {
    const init = {
      ...options,
      headers: { ...(options.headers || {}) },
    };
    if (options.json !== false) {
      init.headers["Content-Type"] = "application/json";
    }
    const response = await fetch(path, init);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(extractError(data, response.status));
    return data;
  }

  function extractError(data, statusCode) {
    if (typeof data === "string" && data.trim()) return data.trim();
    if (!data || typeof data !== "object") return `요청 실패 (${statusCode})`;
    if (data.detail) return data.detail;
    if (data.error) return data.error;
    if (Array.isArray(data.non_field_errors)) return data.non_field_errors[0];

    const firstKey = Object.keys(data)[0];
    const firstValue = data[firstKey];
    if (Array.isArray(firstValue)) return `${firstKey}: ${firstValue[0]}`;
    if (typeof firstValue === "string") return `${firstKey}: ${firstValue}`;
    return `요청 실패 (${statusCode})`;
  }

  function topProbability(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    return Math.max(...values);
  }

  function metric(title, value, probability) {
    const percent = Math.round((probability || 0) * 100);
    return `
      <div class="metric">
        <span class="label">${escapeHtml(title)}</span>
        <strong class="value">${escapeHtml(value)}</strong>
        <div class="bar"><i style="--value:${percent}%"></i></div>
      </div>
    `;
  }

  function renderLoadingMetrics() {
    elements.metrics.innerHTML = `
      <div class="loader" style="grid-column:1/-1">
        <div class="spinner" aria-hidden="true"></div>
        <strong>피부를 읽고 있어요</strong>
        <p>얼굴 영역을 추출하고 모델 5종으로 추론 중입니다.</p>
      </div>
    `;
  }

  function renderPrediction(data) {
    state.prediction = data;
    if (data.id) state.predictionId = Number(data.id);

    elements.metrics.innerHTML = [
      metric("피부 타입", labels.skinType[data.skin_type_prediction] || "-", topProbability(data.skin_type_probabilities)),
      metric("색소 침착", labels.severity3[data.forehead_pigmentation_prediction] || "-", topProbability(data.forehead_pigmentation_probabilities)),
      metric("모공 (왼쪽)", labels.severity3[data.left_cheek_pore_prediction] || "-", topProbability(data.left_cheek_pore_probabilities)),
      metric("모공 (오른쪽)", labels.severity3[data.right_cheek_pore_prediction] || "-", topProbability(data.right_cheek_pore_probabilities)),
      metric("이마 수분", labels.moisture[data.forehead_moisture_prediction] || "-", topProbability(data.forehead_moisture_probabilities)),
      metric("입술 건조", labels.lips[data.lips_dryness_prediction] || "-", topProbability(data.lips_dryness_probabilities)),
    ].join("");

    elements.markedImage.innerHTML = data.marked_image_url
      ? `<img src="${escapeHtml(data.marked_image_url)}" alt="피부 랜드마크 이미지">`
      : "";

    renderEmptyDiagnosis();
    renderEmptyProducts();
    setStage("analysis");
    syncControls();
  }

  function renderEmptyMetrics() {
    elements.metrics.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <span class="ico">🌸</span>
        이미지를 분석하면 피부 타입·수분·모공·색소·입술 건조 지표가 여기에 표시돼요.
      </div>
    `;
  }

  function renderEmptyHistory() {
    elements.historyList.innerHTML = `
      <div class="empty">
        <span class="ico">📋</span>
        아직 진단 이력이 없어요. 이미지를 분석하면 자동으로 저장됩니다.
      </div>
    `;
  }

  function renderEmptyDiagnosis() {
    elements.diagnosisText.innerHTML = `
      <div class="empty">
        <span class="ico">✦</span>
        분석을 마친 뒤 <strong>AI 진단 받기</strong> 버튼을 눌러보세요.
      </div>
    `;
  }

  function renderEmptyProducts() {
    elements.productList.innerHTML = `
      <div class="empty">
        <span class="ico">💎</span>
        설문을 저장하고 <strong>맞춤 화장품 보기</strong>를 누르면 추천이 나타나요.
      </div>
    `;
  }

  function renderEmptyAll() {
    renderEmptyMetrics();
    renderEmptyHistory();
    renderEmptyDiagnosis();
    renderEmptyProducts();
    setStage("upload");
  }

  function clearCurrentAnalysis(message = "") {
    state.prediction = null;
    state.predictionId = null;
    elements.imageInput.value = "";
    elements.preview.removeAttribute("src");
    elements.preview.classList.add("hidden");
    elements.previewEmpty.classList.remove("hidden");
    elements.markedImage.innerHTML = "";
    renderEmptyMetrics();
    renderEmptyDiagnosis();
    renderEmptyProducts();
    setStage("upload");
    if (message) setStatus(message, "success");
    syncControls();
  }

  /* ---------- DIAGNOSIS RENDERING ---------- */

  function parseDiagnosisPayload(raw) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function chips(items, variant = "") {
    if (!Array.isArray(items) || !items.length) return "";
    return `<div class="chips">${items
      .map((item) => `<span class="chip ${variant}">${escapeHtml(item)}</span>`)
      .join("")}</div>`;
  }

  function routineList(items) {
    if (!Array.isArray(items) || !items.length) return "";
    return `<ol class="routine-list">${items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("")}</ol>`;
  }

  function renderStructuredDiagnosis(payload) {
    const headline = payload.headline || "오늘의 피부 진단";
    const summary = payload.summary || "";
    const concerns = payload.key_concerns || [];
    const morning = payload.morning_routine || [];
    const evening = payload.evening_routine || [];
    const seek = payload.ingredients_to_seek || [];
    const avoid = payload.ingredients_to_avoid || [];
    const tips = payload.lifestyle_tips || [];

    elements.diagnosisText.innerHTML = `
      <div class="diag">
        <div class="diag-headline">
          <p class="quote">"${escapeHtml(headline)}"</p>
          ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ""}
        </div>

        ${concerns.length ? `
          <div>
            <h3 style="margin:0 0 10px;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800;">우선 케어 포인트</h3>
            ${chips(concerns, "rose")}
          </div>
        ` : ""}

        ${(morning.length || evening.length) ? `
          <div class="routine-grid">
            ${morning.length ? `
              <div class="routine-col">
                <h3>☀️ 모닝 루틴</h3>
                ${routineList(morning)}
              </div>
            ` : ""}
            ${evening.length ? `
              <div class="routine-col evening">
                <h3>🌙 이브닝 루틴</h3>
                ${routineList(evening)}
              </div>
            ` : ""}
          </div>
        ` : ""}

        ${(seek.length || avoid.length) ? `
          <div class="routine-grid">
            ${seek.length ? `
              <div class="ingredient-block">
                <h4>찾아볼 성분</h4>
                ${chips(seek, "mint")}
              </div>
            ` : ""}
            ${avoid.length ? `
              <div class="ingredient-block">
                <h4>주의할 성분</h4>
                ${chips(avoid, "gold")}
              </div>
            ` : ""}
          </div>
        ` : ""}

        ${tips.length ? `
          <div class="ingredient-block">
            <h4>생활 관리 팁</h4>
            <ul style="margin:0;padding-left:18px;color:var(--ink-soft);font-size:13.5px;line-height:1.75;">
              ${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderPlaintextDiagnosis(text) {
    elements.diagnosisText.innerHTML = `
      <div class="diag-headline">
        <p class="summary" style="white-space:pre-wrap;">${escapeHtml(text)}</p>
      </div>
    `;
  }

  /* ---------- API CALLS ---------- */

  async function saveSurvey() {
    setBusy(true, "설문을 저장 중이에요.");
    try {
      const payload = {
        atopy_level: Number(getRadioValue("atopy")),
        acne_level: Number(getRadioValue("acne")),
        sensitivity_level: Number(getRadioValue("sensitivity")),
      };
      const data = state.surveyId
        ? await api(`/api/surveys/${encodeURIComponent(state.surveyId)}/`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
        : await api("/api/surveys/", {
          method: "POST",
          body: JSON.stringify(payload),
        });

      state.surveyId = data.user || String(data.id);
      localStorage.setItem(storageKeys.surveyId, state.surveyId);
      setStatus("설문이 저장됐어요 ✨", "success");
      return true;
    } catch (error) {
      setStatus(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    const file = elements.imageInput.files[0];
    if (!file) {
      setStatus("이미지를 먼저 선택해 주세요.", "error");
      return;
    }

    const body = new FormData();
    body.append("image", file);

    setStage("analysis");
    renderLoadingMetrics();
    elements.markedImage.innerHTML = "";
    renderEmptyDiagnosis();
    renderEmptyProducts();
    setBusy(true, "피부 분석을 시작했어요. 첫 분석은 모델 로딩으로 시간이 조금 걸릴 수 있어요.");
    document.querySelector("#analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const data = await api("/api/diagnostics/", {
        method: "POST",
        json: false,
        body,
      });
      renderPrediction(data);
      setStatus("분석이 완료됐어요. 진단을 받거나 추천을 확인해 보세요.", "success");
      document.querySelector("#analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      await loadHistory({ keepSelection: true, silent: true });
    } catch (error) {
      setStatus(error.message, "error");
      renderEmptyMetrics();
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(options = {}) {
    setBusy(true, options.silent ? "" : "진단 이력을 불러오는 중이에요.");
    try {
      const data = await api("/api/diagnostics/history/", {
        method: "GET",
        json: false,
      });

      state.history = data;
      renderHistory(data);
      if (!options.silent) {
        setStatus(data.length ? "진단 이력을 불러왔어요." : "아직 저장된 진단 이력이 없어요.", "success");
      }
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function renderHistory(items) {
    if (!items.length) {
      renderEmptyHistory();
      syncControls();
      return;
    }

    elements.historyList.innerHTML = items.map((item) => {
      const active = Number(item.id) === Number(state.predictionId) ? " active" : "";
      return `
        <button class="history-item${active}" type="button" data-id="${item.id}">
          <div class="meta">
            <strong>${escapeHtml(labels.skinType[item.skin_type_prediction] || "분석")} 피부</strong>
            <small>${escapeHtml(formatDate(item.created_at))}</small>
          </div>
          <span class="badge">입술 ${escapeHtml(labels.lips[item.lips_dryness_prediction] || "-")}</span>
        </button>
      `;
    }).join("");

    elements.historyList.querySelectorAll("[data-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const selected = items.find((item) => Number(item.id) === Number(button.dataset.id));
        if (!selected) return;
        renderPrediction(selected);
        renderHistory(items);
        setStatus(`이전 진단(#${selected.id})을 불러왔어요.`, "success");
      });
    });
    syncControls();
  }

  async function generateDiagnosis() {
    if (!state.predictionId) {
      setStatus("AI 진단을 받으려면 분석 결과를 먼저 선택해 주세요.", "error");
      return;
    }

    setStage("recommend");
    elements.diagnosisText.innerHTML = `
      <div class="loader">
        <div class="spinner" aria-hidden="true"></div>
        <strong>AI 카운슬러가 진단 중이에요</strong>
        <p>분석 결과를 바탕으로 모닝/이브닝 루틴과 성분 가이드를 정리하고 있어요.</p>
      </div>
    `;
    setBusy(true, "AI 진단을 생성 중이에요.");
    try {
      const data = await api("/api/generate/", {
        method: "POST",
        body: JSON.stringify({ prediction_id: state.predictionId }),
      });
      const payload = parseDiagnosisPayload(data.diagnosis_text);
      if (payload && typeof payload === "object" && (payload.summary || payload.headline)) {
        renderStructuredDiagnosis(payload);
      } else {
        renderPlaintextDiagnosis(data.diagnosis_text || "진단 결과가 비어 있습니다.");
      }
      setStatus("AI 진단이 도착했어요 ✦", "success");
      document.querySelector("#diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(error.message, "error");
      renderEmptyDiagnosis();
    } finally {
      setBusy(false);
    }
  }

  async function recommend() {
    if (!state.predictionId) {
      setStatus("추천을 받으려면 분석 결과를 먼저 선택해 주세요.", "error");
      return;
    }

    const saved = await saveSurvey();
    if (!saved || !state.surveyId) return;

    state.ageGroup = getRadioValue("age-group") || "twenties";
    localStorage.setItem(storageKeys.ageGroup, state.ageGroup);
    setStage("recommend");
    elements.productList.innerHTML = `
      <div class="loader">
        <div class="spinner" aria-hidden="true"></div>
        <strong>당신만의 화장품을 고르는 중이에요</strong>
        <p>피부 신호와 설문 응답으로 가장 잘 맞는 제품을 추려내고 있어요.</p>
      </div>
    `;
    document.querySelector("#recommend")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setBusy(true, "맞춤 추천을 계산 중이에요.");
    try {
      const data = await api("/api/recommendations_data/", {
        method: "POST",
        body: JSON.stringify({
          prediction_id: state.predictionId,
          survey_id: state.surveyId,
          age_group: state.ageGroup,
        }),
      });
      renderProducts(data.recommended_data || []);
      setStatus("추천이 완료됐어요 💎", "success");
    } catch (error) {
      setStatus(error.message, "error");
      renderEmptyProducts();
    } finally {
      setBusy(false);
    }
  }

  function renderProducts(products) {
    if (!products.length) {
      renderEmptyProducts();
      return;
    }

    elements.productList.innerHTML = products.map((item) => {
      const reasons = (item.match_reasons || []).slice(0, 3);
      const reasonChips = reasons
        .map((r) => `<span class="chip">${escapeHtml(r)}</span>`)
        .join("");
      const logo = item.logo
        ? `<img src="${escapeHtml(item.logo)}" alt="">`
        : `<div class="logo-fallback">${escapeHtml((item.brand || "SC").slice(0, 2))}</div>`;
      const meta = [item.category, item.etc].filter(Boolean).join(" · ");
      return `
        <div class="product">
          ${logo}
          <div class="info">
            <div class="brand">${escapeHtml(item.brand || "")}</div>
            <span class="title">${escapeHtml(item.title || "")}</span>
            ${meta ? `<small style="color:var(--muted);font-size:12px;">${escapeHtml(meta)}</small>` : ""}
            ${reasons.length ? `<div class="reasons" style="margin-top:8px;">${reasonChips}</div>` : ""}
          </div>
          <div class="side">
            <span class="match">${escapeHtml(item.match_score ?? "-")}<small>%</small></span>
            <span class="price">${escapeHtml(money(item.price))}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  /* ---------- UPLOAD ---------- */

  function previewFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("이미지 파일만 업로드할 수 있어요.", "error");
      elements.imageInput.value = "";
      syncControls();
      return;
    }

    elements.preview.src = URL.createObjectURL(file);
    elements.preview.classList.remove("hidden");
    elements.previewEmpty.classList.add("hidden");
    setStatus(`${file.name} 파일이 준비됐어요. 분석 버튼을 눌러주세요.`, "success");
    syncControls();
  }

  function bindUploadZone() {
    elements.imageInput.addEventListener("change", (event) => {
      previewFile(event.target.files[0]);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      elements.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropZone.style.borderColor = "var(--rose)";
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      elements.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropZone.style.borderColor = "";
      });
    });

    elements.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer.files[0];
      if (!file) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      elements.imageInput.files = transfer.files;
      previewFile(file);
    });
  }

  function bindNavigation() {
    document.querySelectorAll(".topnav a[href^='#']").forEach((link) => {
      link.addEventListener("click", () => {
        document.querySelectorAll(".topnav a").forEach((item) => item.classList.remove("active"));
        link.classList.add("active");
      });
    });
  }

  function cacheElements() {
    Object.assign(elements, {
      status: $("status"),
      surveyButton: $("survey-button"),
      analyzeButton: $("analyze-button"),
      historyButton: $("history-button"),
      diagnosisButton: $("diagnosis-button"),
      recommendButton: $("recommend-button"),
      imageInput: $("image-input"),
      preview: $("preview"),
      previewEmpty: $("preview-empty"),
      dropZone: $("drop-zone"),
      metrics: $("metrics"),
      markedImage: $("marked-image"),
      historyList: $("history-list"),
      diagnosisText: $("diagnosis-text"),
      productList: $("product-list"),
      flowSteps: Array.from(document.querySelectorAll(".step[data-stage]")),
    });
  }

  function bindActions() {
    elements.surveyButton.addEventListener("click", saveSurvey);
    elements.analyzeButton.addEventListener("click", analyze);
    elements.historyButton.addEventListener("click", async () => {
      clearCurrentAnalysis();
      await loadHistory({ keepSelection: true });
    });
    elements.diagnosisButton.addEventListener("click", generateDiagnosis);
    elements.recommendButton.addEventListener("click", recommend);

    document.querySelectorAll('input[name="age-group"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.ageGroup = getRadioValue("age-group") || "twenties";
        localStorage.setItem(storageKeys.ageGroup, state.ageGroup);
      });
    });

    document.querySelectorAll('input[name="atopy"], input[name="acne"], input[name="sensitivity"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (!state.surveyId) return;
        setStatus("설문 값이 바뀌었어요. 추천 전에 자동으로 저장됩니다.");
      });
    });
  }

  async function refreshHistoryOnStart() {
    try {
      await loadHistory({ keepSelection: true, silent: true });
      setStatus(
        state.history.length
          ? "이전 진단을 불러왔어요. 새 분석을 시작하거나 이력에서 골라보세요."
          : "얼굴 사진을 올리면 분석이 시작돼요.",
        state.history.length ? "success" : "info"
      );
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function restorePreferences() {
    setRadioValue("age-group", state.ageGroup);
  }

  function init() {
    cacheElements();
    bindActions();
    bindUploadZone();
    bindNavigation();
    renderEmptyAll();
    restorePreferences();
    syncControls();
    refreshHistoryOnStart();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
