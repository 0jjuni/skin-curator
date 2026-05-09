(() => {
  const storageKeys = {
    surveyId: "skin_survey_id",
    selectedPredictionId: "skin_prediction_id",
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
    predictionId: Number(localStorage.getItem(storageKeys.selectedPredictionId)) || null,
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

  function setBusy(isBusy, message) {
    state.busy = isBusy;
    if (message) setStatus(message);
    syncControls();
  }

  function setStage(stage) {
    state.stage = stage;
    elements.flowSteps.forEach((step) => {
      const order = ["upload", "analysis", "recommend"];
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

  function requestHeaders(json = true) {
    return json ? { "Content-Type": "application/json" } : {};
  }

  async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response.json();
    return response.text();
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...requestHeaders(options.json !== false),
        ...(options.headers || {}),
      },
    });
    const data = await readResponse(response);
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
        <span>${escapeHtml(title)}</span>
        <strong>${escapeHtml(value)}</strong>
        <div class="bar"><i style="--value:${percent}%"></i></div>
      </div>
    `;
  }

  function renderLoading(target, title, message) {
    target.innerHTML = `
      <div class="loading-card">
        <div>
          <div class="spinner" aria-hidden="true"></div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    `;
  }

  function renderPrediction(data) {
    state.prediction = data;
    if (data.id) {
      state.predictionId = Number(data.id);
      localStorage.setItem(storageKeys.selectedPredictionId, String(state.predictionId));
    }

    elements.metrics.innerHTML = [
      metric("피부 타입", labels.skinType[data.skin_type_prediction] || "-", topProbability(data.skin_type_probabilities)),
      metric("색소 침착", labels.severity3[data.forehead_pigmentation_prediction] || "-", topProbability(data.forehead_pigmentation_probabilities)),
      metric("왼쪽 모공", labels.severity3[data.left_cheek_pore_prediction] || "-", topProbability(data.left_cheek_pore_probabilities)),
      metric("오른쪽 모공", labels.severity3[data.right_cheek_pore_prediction] || "-", topProbability(data.right_cheek_pore_probabilities)),
      metric("이마 수분", labels.moisture[data.forehead_moisture_prediction] || "-", topProbability(data.forehead_moisture_probabilities)),
      metric("입술 건조", labels.lips[data.lips_dryness_prediction] || "-", topProbability(data.lips_dryness_probabilities)),
    ].join("");

    elements.markedImage.innerHTML = data.marked_image_url
      ? `<img src="${escapeHtml(data.marked_image_url)}" alt="피부 랜드마크 이미지">`
      : "";

    elements.diagnosisText.textContent = "";
    elements.productList.innerHTML = "";
    setStage("analysis");
    syncControls();
  }

  function renderEmptyPanels() {
    elements.metrics.innerHTML = `<div class="empty-state" style="grid-column:1/-1">이미지를 분석하면 피부 타입, 수분, 모공, 색소침착 지표가 표시됩니다.</div>`;
    elements.historyList.innerHTML = `<div class="empty-state">분석 결과가 아직 없습니다. 이미지를 분석하면 이 브라우저 세션에 저장됩니다.</div>`;
    elements.diagnosisText.textContent = "";
    elements.productList.innerHTML = `<div class="empty-state">분석 결과와 설문을 저장하면 추천 화장품을 확인할 수 있습니다.</div>`;
    setStage("upload");
  }

  async function saveSurvey() {
    setBusy(true, "설문을 저장 중입니다.");
    try {
      const payload = {
        atopy_level: Number(elements.atopy.value),
        acne_level: Number(elements.acne.value),
        sensitivity_level: Number(elements.sensitivity.value),
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
      setStatus("설문이 저장됐습니다.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    const file = elements.imageInput.files[0];
    if (!file) {
      setStatus("이미지를 먼저 선택하세요.", "error");
      return;
    }

    const body = new FormData();
    body.append("image", file);

    setStage("analysis");
    renderLoading(elements.metrics, "피부를 분석하는 중입니다", "얼굴 영역을 읽고 피부 타입, 모공, 수분, 색소침착 신호를 계산하고 있습니다.");
    elements.markedImage.innerHTML = "";
    elements.productList.innerHTML = "";
    setBusy(true, "피부 분석을 실행 중입니다. 첫 분석은 모델 로딩 때문에 조금 걸릴 수 있습니다.");
    document.querySelector("#analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const data = await api("/api/diagnostics/", {
        method: "POST",
        json: false,
        body,
      });
      renderPrediction(data);
      setStatus("분석 결과가 준비됐습니다. 결과를 확인한 뒤 추천 보기를 눌러보세요.", "success");
      document.querySelector("#analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      await loadHistory({ keepSelection: true, silent: true });
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(options = {}) {
    setBusy(true, options.silent ? "" : "진단 이력을 불러오는 중입니다.");
    try {
      const data = await api("/api/diagnostics/history/", {
        method: "GET",
        json: false,
      });

      state.history = data;
      if (!options.keepSelection && data[0]?.id) {
        state.predictionId = Number(data[0].id);
        state.prediction = data[0];
        localStorage.setItem(storageKeys.selectedPredictionId, String(state.predictionId));
      }

      renderHistory(data);
      if (state.prediction && !options.keepSelection) renderPrediction(state.prediction);
      if (!options.silent) {
        setStatus(data.length ? "진단 이력을 불러왔습니다." : "아직 저장된 진단 이력이 없습니다.", "success");
      }
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function renderHistory(items) {
    if (!items.length) {
      elements.historyList.innerHTML = `<div class="empty-state">저장된 진단 이력이 없습니다.</div>`;
      syncControls();
      return;
    }

    elements.historyList.innerHTML = items.map((item) => {
      const active = Number(item.id) === Number(state.predictionId) ? " active" : "";
      return `
        <button class="list-item${active}" type="button" data-id="${item.id}">
          <span>
            <strong>${escapeHtml(labels.skinType[item.skin_type_prediction] || "분석")}</strong><br>
            <small>${escapeHtml(formatDate(item.created_at))}</small>
          </span>
          <span>${escapeHtml(labels.lips[item.lips_dryness_prediction] || "-")}</span>
        </button>
      `;
    }).join("");

    elements.historyList.querySelectorAll("[data-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const selected = items.find((item) => Number(item.id) === Number(button.dataset.id));
        if (!selected) return;
        renderPrediction(selected);
        renderHistory(items);
        setStatus(`진단 ID ${selected.id}를 선택했습니다.`, "success");
      });
    });
    syncControls();
  }

  async function generateDiagnosis() {
    if (!state.predictionId) {
      setStatus("AI 코멘트에 사용할 분석 결과를 선택하세요.", "error");
      return;
    }

    setStage("recommend");
    elements.diagnosisText.innerHTML = `
      <div class="loading-card">
        <div>
          <div class="spinner" aria-hidden="true"></div>
          <strong>AI 코멘트를 정리하는 중입니다</strong>
          <p>분석 결과를 바탕으로 피부 상태를 읽기 쉬운 문장으로 요약하고 있습니다.</p>
        </div>
      </div>
    `;
    setBusy(true, "AI 코멘트를 생성 중입니다.");
    try {
      const data = await api("/api/generate/", {
        method: "POST",
        body: JSON.stringify({ prediction_id: state.predictionId }),
      });
      elements.diagnosisText.textContent = data.diagnosis_text || "코멘트 결과가 비어 있습니다.";
      setStatus("AI 코멘트가 준비됐습니다.", "success");
      document.querySelector("#recommendations")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function recommend() {
    if (!state.predictionId) {
      setStatus("추천에 사용할 분석 결과를 선택하세요.", "error");
      return;
    }

    if (!state.surveyId) {
      await saveSurvey();
      if (!state.surveyId) return;
    }

    state.ageGroup = elements.ageGroup.value;
    localStorage.setItem(storageKeys.ageGroup, state.ageGroup);
    setStage("recommend");
    renderLoading(elements.productList, "화장품을 고르는 중입니다", "피부 분석값과 설문 응답을 비교해서 잘 맞는 제품을 추려내고 있습니다.");
    document.querySelector("#recommendations")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setBusy(true, "제품 추천을 계산 중입니다.");
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
      setStatus("추천이 완료됐습니다.", "success");
      document.querySelector("#recommendations")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function renderProducts(products) {
    elements.productList.innerHTML = products.length
      ? products.map((item) => `
        <div class="list-item product">
          ${item.logo
            ? `<img src="${escapeHtml(item.logo)}" alt="">`
            : `<span class="product-logo-fallback">${escapeHtml((item.brand || "SC").slice(0, 2))}</span>`}
          <span class="product-main">
            <strong>${escapeHtml(item.brand)}</strong>
            <span>${escapeHtml(item.title)}</span>
            <small>${escapeHtml([item.category, item.etc].filter(Boolean).join(" · "))}</small>
            <small>${escapeHtml((item.match_reasons || []).join(" · "))}</small>
          </span>
          <span class="product-side">
            <strong>${escapeHtml(item.match_score ?? "-")}%</strong>
            <span class="price">${escapeHtml(money(item.price))}</span>
          </span>
        </div>
      `).join("")
      : `<div class="empty-state">추천할 제품 데이터가 없습니다.</div>`;
  }

  function previewFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("이미지 파일만 업로드할 수 있습니다.", "error");
      elements.imageInput.value = "";
      syncControls();
      return;
    }

    elements.preview.src = URL.createObjectURL(file);
    elements.preview.classList.remove("hidden");
    elements.previewEmpty.classList.add("hidden");
    setStatus(`${file.name} 파일을 선택했습니다.`, "success");
    syncControls();
  }

  function bindUploadZone() {
    elements.imageInput.addEventListener("change", (event) => {
      previewFile(event.target.files[0]);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      elements.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropZone.style.borderColor = "var(--teal)";
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
    document.querySelectorAll("nav a[href^='#']").forEach((link) => {
      link.addEventListener("click", () => {
        document.querySelectorAll("nav a").forEach((item) => item.classList.remove("active"));
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
      atopy: $("atopy"),
      acne: $("acne"),
      sensitivity: $("sensitivity"),
      ageGroup: $("age-group"),
      metrics: $("metrics"),
      markedImage: $("marked-image"),
      historyList: $("history-list"),
      diagnosisText: $("diagnosis-text"),
      productList: $("product-list"),
      flowSteps: Array.from(document.querySelectorAll(".flow-step")),
    });
  }

  function bindActions() {
    elements.surveyButton.addEventListener("click", saveSurvey);
    elements.analyzeButton.addEventListener("click", analyze);
    elements.historyButton.addEventListener("click", () => loadHistory({ keepSelection: true }));
    elements.diagnosisButton.addEventListener("click", generateDiagnosis);
    elements.recommendButton.addEventListener("click", recommend);
    elements.ageGroup.addEventListener("change", () => {
      state.ageGroup = elements.ageGroup.value;
      localStorage.setItem(storageKeys.ageGroup, state.ageGroup);
    });
  }

  function init() {
    cacheElements();
    bindActions();
    bindUploadZone();
    bindNavigation();
    renderEmptyPanels();
    elements.ageGroup.value = state.ageGroup;
    syncControls();
    loadHistory().catch((error) => setStatus(error.message, "error"));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
