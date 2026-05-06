(() => {
  const storageKeys = {
    accessToken: "skin_access_token",
    refreshToken: "skin_refresh_token",
    user: "skin_user",
    surveyId: "skin_survey_id",
    selectedPredictionId: "skin_prediction_id",
  };

  const labels = {
    skinType: ["건성", "중성", "지성"],
    severity3: ["낮음", "보통", "높음"],
    moisture: ["부족", "충분"],
    lips: ["양호", "보통", "건조"],
  };

  const state = {
    token: localStorage.getItem(storageKeys.accessToken) || "",
    refresh: localStorage.getItem(storageKeys.refreshToken) || "",
    user: parseJson(localStorage.getItem(storageKeys.user)),
    surveyId: localStorage.getItem(storageKeys.surveyId) || "",
    predictionId: Number(localStorage.getItem(storageKeys.selectedPredictionId)) || null,
    prediction: null,
    busy: false,
  };

  const $ = (id) => document.getElementById(id);

  const elements = {};

  function parseJson(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString("ko-KR")}원`;
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
    [
      elements.loginButton,
      elements.logoutButton,
      elements.surveyButton,
      elements.analyzeButton,
      elements.historyButton,
      elements.diagnosisButton,
      elements.recommendButton,
    ].forEach((button) => {
      button.disabled = isBusy;
    });

    if (message) setStatus(message);
    syncControls();
  }

  function syncControls() {
    const isLoggedIn = Boolean(state.token);
    const hasSavedPrediction = Boolean(state.predictionId);
    const hasPreviewFile = Boolean(elements.imageInput.files[0]);

    elements.authStatus.textContent = isLoggedIn
      ? `${state.user?.name || state.user?.id || "사용자"} 로그인`
      : "비로그인";

    elements.logoutButton.disabled = state.busy || !isLoggedIn;
    elements.analyzeButton.disabled = state.busy || !hasPreviewFile;
    elements.historyButton.disabled = state.busy || !isLoggedIn;
    elements.diagnosisButton.disabled = state.busy || !isLoggedIn || !hasSavedPrediction;
    elements.recommendButton.disabled = state.busy || !isLoggedIn || !hasSavedPrediction;
  }

  function requestHeaders(json = true) {
    const headers = {};
    if (json) headers["Content-Type"] = "application/json";
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    return headers;
  }

  async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
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

    if (!response.ok) {
      throw new Error(extractError(data, response.status));
    }
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
      ? `<img src="${escapeHtml(data.marked_image_url)}" alt="랜드마크 이미지" style="width:100%;border-radius:8px;border:1px solid var(--line)">`
      : "";

    elements.diagnosisText.textContent = "";
    elements.productList.innerHTML = "";
    syncControls();
  }

  function renderEmptyPanels() {
    elements.metrics.innerHTML = `<div class="empty-state" style="grid-column:1/-1">이미지를 분석하면 주요 지표가 여기에 표시됩니다.</div>`;
    elements.historyList.innerHTML = state.token
      ? `<div class="empty-state">저장된 진단 이력이 없습니다.</div>`
      : `<div class="empty-state">로그인하면 진단 이력을 불러올 수 있습니다.</div>`;
    elements.diagnosisText.textContent = "";
    elements.productList.innerHTML = `<div class="empty-state">로그인 후 저장된 분석 결과를 선택하면 추천을 받을 수 있습니다.</div>`;
  }

  async function login() {
    const id = elements.loginId.value.trim();
    const password = elements.loginPassword.value;
    if (!id || !password) {
      setStatus("아이디와 비밀번호를 입력하세요.", "error");
      return;
    }

    setBusy(true, "로그인 중입니다.");
    try {
      const data = await api("/api/accounts/login/", {
        method: "POST",
        body: JSON.stringify({ id, password }),
      });

      state.token = data.access;
      state.refresh = data.refresh;
      state.user = data.user || null;
      localStorage.setItem(storageKeys.accessToken, state.token);
      localStorage.setItem(storageKeys.refreshToken, state.refresh);
      localStorage.setItem(storageKeys.user, JSON.stringify(state.user));

      elements.loginPassword.value = "";
      setStatus(`${state.user?.name || state.user?.id || "사용자"}님, 로그인했습니다.`, "success");
      await loadSurvey();
      await loadHistory({ selectLatest: true });
    } catch (error) {
      clearAuth();
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function clearAuth() {
    state.token = "";
    state.refresh = "";
    state.user = null;
    state.predictionId = null;
    state.prediction = null;
    localStorage.removeItem(storageKeys.accessToken);
    localStorage.removeItem(storageKeys.refreshToken);
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.selectedPredictionId);
    renderEmptyPanels();
    syncControls();
  }

  async function saveSurvey() {
    setBusy(true, "설문을 저장 중입니다.");
    try {
      const payload = {
        atopy_level: Number(elements.atopy.value),
        acne_level: Number(elements.acne.value),
        sensitivity_level: Number(elements.sensitivity.value),
      };
      const targetSurveyId = state.token ? state.user?.id : state.surveyId;
      const data = targetSurveyId
        ? await api(`/api/surveys/${encodeURIComponent(targetSurveyId)}/`, {
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

  async function loadSurvey() {
    if (!state.token) return;

    try {
      const surveys = await api("/api/surveys/", {
        method: "GET",
        json: false,
      });
      const survey = Array.isArray(surveys) ? surveys[0] : null;
      if (!survey) return;

      state.surveyId = survey.user || String(survey.id);
      localStorage.setItem(storageKeys.surveyId, state.surveyId);
      elements.atopy.value = toSurveyScale(survey.atopy_level);
      elements.acne.value = toSurveyScale(survey.acne_level);
      elements.sensitivity.value = toSurveyScale(survey.sensitivity_level);
    } catch {
      state.surveyId = "";
      localStorage.removeItem(storageKeys.surveyId);
    }
  }

  function toSurveyScale(value) {
    const number = Number(value);
    if ([1, 2, 3, 4, 5].includes(number)) return String(number);
    if (number > 0 && number <= 1) return String(Math.round(number * 5));
    return "3";
  }

  async function analyze() {
    const file = elements.imageInput.files[0];
    if (!file) {
      setStatus("이미지를 먼저 선택하세요.", "error");
      return;
    }

    const body = new FormData();
    body.append("image", file);

    setBusy(true, "피부 분석을 실행 중입니다. 모델 로딩 때문에 처음에는 조금 걸릴 수 있습니다.");
    try {
      const data = await api("/api/diagnostics/", {
        method: "POST",
        json: false,
        body,
      });
      renderPrediction(data);
      setStatus(data.id ? "분석 결과가 저장됐습니다." : "비로그인 분석이 완료됐습니다. 저장/추천은 로그인 후 사용할 수 있습니다.", "success");
      if (state.token) await loadHistory({ keepSelection: true });
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(options = {}) {
    if (!state.token) {
      elements.historyList.innerHTML = `<div class="empty-state">로그인하면 진단 이력을 불러올 수 있습니다.</div>`;
      syncControls();
      return;
    }

    setBusy(true, "진단 이력을 불러오는 중입니다.");
    try {
      const data = await api("/api/diagnostics/history/", {
        method: "GET",
        json: false,
      });

      if (options.selectLatest && data[0]?.id) {
        state.predictionId = Number(data[0].id);
        state.prediction = data[0];
        localStorage.setItem(storageKeys.selectedPredictionId, String(state.predictionId));
      }

      renderHistory(data);
      if (state.prediction && options.selectLatest) renderPrediction(state.prediction);
      setStatus(data.length ? "진단 이력을 불러왔습니다." : "아직 저장된 진단 이력이 없습니다.", "success");
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
    if (!state.token) {
      setStatus("AI 진단은 로그인 후 저장된 분석 결과에서 사용할 수 있습니다.", "error");
      return;
    }
    if (!state.predictionId) {
      setStatus("AI 진단에 사용할 분석 결과를 선택하세요.", "error");
      return;
    }

    setBusy(true, "AI 진단을 생성 중입니다.");
    try {
      const data = await api("/api/generate/", {
        method: "POST",
        body: JSON.stringify({ prediction_id: state.predictionId }),
      });
      elements.diagnosisText.textContent = data.diagnosis_text || "진단 결과가 비어 있습니다.";
      setStatus("AI 진단이 준비됐습니다.", "success");
      document.querySelector("#recommendations")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function recommend() {
    if (!state.token) {
      setStatus("제품 추천은 로그인 후 저장된 분석 결과에서 사용할 수 있습니다.", "error");
      return;
    }
    if (!state.predictionId) {
      setStatus("추천에 사용할 분석 결과를 선택하세요.", "error");
      return;
    }

    setBusy(true, "제품 추천을 계산 중입니다.");
    try {
      const data = await api("/api/recommendations_data/", {
        method: "POST",
        body: JSON.stringify({ prediction_id: state.predictionId }),
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
          <img src="${escapeHtml(item.logo)}" alt="">
          <span class="product-main">
            <strong>${escapeHtml(item.brand)}</strong>
            <span>${escapeHtml(item.title)}</span>
            <small>${escapeHtml([item.category, item.etc].filter(Boolean).join(" · "))}</small>
          </span>
          <span class="price">${escapeHtml(money(item.price))}</span>
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
        elements.dropZone.style.borderColor = "var(--accent)";
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
      authStatus: $("auth-status"),
      status: $("status"),
      loginId: $("login-id"),
      loginPassword: $("login-password"),
      loginButton: $("login-button"),
      logoutButton: $("logout-button"),
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
      metrics: $("metrics"),
      markedImage: $("marked-image"),
      historyList: $("history-list"),
      diagnosisText: $("diagnosis-text"),
      productList: $("product-list"),
    });
  }

  function bindActions() {
    elements.loginButton.addEventListener("click", login);
    elements.loginPassword.addEventListener("keydown", (event) => {
      if (event.key === "Enter") login();
    });
    elements.logoutButton.addEventListener("click", () => {
      clearAuth();
      setStatus("로그아웃했습니다.", "success");
    });
    elements.surveyButton.addEventListener("click", saveSurvey);
    elements.analyzeButton.addEventListener("click", analyze);
    elements.historyButton.addEventListener("click", () => loadHistory({ keepSelection: true }));
    elements.diagnosisButton.addEventListener("click", generateDiagnosis);
    elements.recommendButton.addEventListener("click", recommend);
  }

  function init() {
    cacheElements();
    bindActions();
    bindUploadZone();
    bindNavigation();
    renderEmptyPanels();
    syncControls();

    if (state.token) {
      Promise.all([
        loadSurvey(),
        loadHistory({ selectLatest: !state.predictionId }),
      ]).catch((error) => {
        setStatus(error.message, "error");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
