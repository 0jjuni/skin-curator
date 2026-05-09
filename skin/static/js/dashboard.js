(() => {
  const SCENE_ORDER = [
    "welcome",
    "survey-age",
    "survey-atopy",
    "survey-acne",
    "survey-sensitivity",
    "upload",
    "scanning",
    "result",
    "diagnosis",
  ];
  const STEPPER_MAP = {
    "survey-age": "survey-age",
    "survey-atopy": "survey-age",
    "survey-acne": "survey-age",
    "survey-sensitivity": "survey-age",
    upload: "upload",
    scanning: "scanning",
    result: "result",
    diagnosis: "diagnosis",
  };

  const SCAN_STAGES = [
    { key: "face", title: "얼굴 영역을 감지하는 중", duration: 1100 },
    { key: "crop", title: "이마 · 볼 · 입술을 추출하는 중", duration: 1300 },
    { key: "skin", title: "피부 타입을 분류하는 중", duration: 1500 },
    { key: "moisture", title: "수분과 색소침착을 측정하는 중", duration: 1500 },
    { key: "recommend", title: "맞춤 화장품을 매칭하는 중", duration: 1700 },
  ];

  const labels = {
    skinType: ["건성", "중성", "지성"],
    severity3: ["낮음", "보통", "높음"],
    moisture: ["부족", "충분"],
    lips: ["양호", "보통", "건조"],
  };

  const state = {
    scene: "welcome",
    survey: {
      "age-group": "twenties",
      atopy: "3",
      acne: "3",
      sensitivity: "3",
    },
    surveyId: "",
    imageFile: null,
    prediction: null,
    predictionId: null,
    recommendations: null,
    diagnosisPayload: null,
    busy: false,
  };

  const elements = {};
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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

  /* ============ TOAST ============ */
  let toastTimer;
  function toast(message, tone = "info", ms = 2800) {
    if (!message) return;
    const el = elements.toast;
    el.textContent = message;
    el.className = `toast show ${tone === "error" ? "error" : tone === "success" ? "success" : ""}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  /* ============ SCENE NAVIGATION ============ */
  function showScene(scene) {
    state.scene = scene;
    qsa("[data-scene]").forEach((el) => {
      el.classList.toggle("active", el.dataset.scene === scene);
    });
    updateStepper();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateStepper() {
    const targetKey = STEPPER_MAP[state.scene];
    const orderKeys = ["survey-age", "upload", "scanning", "result", "diagnosis"];
    const currentIdx = orderKeys.indexOf(targetKey);
    qsa("#stepper .step-pill").forEach((pill) => {
      const idx = orderKeys.indexOf(pill.dataset.step);
      pill.classList.toggle("active", idx === currentIdx);
      pill.classList.toggle("done", idx > -1 && idx < currentIdx);
    });
    elements.stepper.style.visibility = state.scene === "welcome" ? "hidden" : "visible";
  }

  function nextScene() {
    const idx = SCENE_ORDER.indexOf(state.scene);
    if (idx < 0 || idx >= SCENE_ORDER.length - 1) return;
    showScene(SCENE_ORDER[idx + 1]);
  }

  function prevScene() {
    const idx = SCENE_ORDER.indexOf(state.scene);
    if (idx <= 0) return;
    showScene(SCENE_ORDER[idx - 1]);
  }

  /* ============ OPTION SELECTION ============ */
  function bindOptionGroups() {
    qsa(".option[data-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const value = btn.dataset.value;
        state.survey[key] = value;
        qsa(`.option[data-key="${key}"]`).forEach((sib) => sib.classList.toggle("selected", sib === btn));
      });
    });
  }

  /* ============ SURVEY API ============ */
  async function api(path, options = {}) {
    const init = { ...options, headers: { ...(options.headers || {}) } };
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

  async function saveSurvey() {
    const payload = {
      atopy_level: Number(state.survey.atopy),
      acne_level: Number(state.survey.acne),
      sensitivity_level: Number(state.survey.sensitivity),
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
  }

  /* ============ UPLOAD ============ */
  function bindUpload() {
    elements.imageInput.addEventListener("change", (e) => previewFile(e.target.files[0]));

    ["dragenter", "dragover"].forEach((evt) => {
      elements.dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        elements.dropZone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      elements.dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove("dragging");
      });
    });
    elements.dropZone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      elements.imageInput.files = transfer.files;
      previewFile(file);
    });
  }

  function previewFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("이미지 파일만 업로드할 수 있어요.", "error");
      elements.imageInput.value = "";
      elements.startAnalysis.disabled = true;
      return;
    }
    state.imageFile = file;
    elements.preview.src = URL.createObjectURL(file);
    elements.preview.classList.remove("hidden");
    elements.previewEmpty.classList.add("hidden");
    elements.startAnalysis.disabled = false;
    toast(`${file.name} 준비 완료`, "success");
  }

  /* ============ SCAN ANIMATION ============ */
  let scanTimers = [];

  function startScanAnimation() {
    elements.scanStage.classList.add("active");
    if (state.imageFile) {
      elements.scanImage.src = URL.createObjectURL(state.imageFile);
    }
    elements.scanBar.style.width = "0%";

    qsa("#scan-status-list li").forEach((li) => li.classList.remove("active", "done"));
    elements.scanTitle.textContent = SCAN_STAGES[0].title;

    let cumulative = 0;
    const total = SCAN_STAGES.reduce((sum, s) => sum + s.duration, 0);

    SCAN_STAGES.forEach((stage, i) => {
      const start = cumulative;
      cumulative += stage.duration;

      scanTimers.push(setTimeout(() => {
        const items = qsa("#scan-status-list li");
        items.forEach((li, j) => {
          li.classList.toggle("active", j === i);
          li.classList.toggle("done", j < i);
        });
        elements.scanTitle.textContent = stage.title;
      }, start));

      // animate progress within this stage
      const stepEnd = cumulative;
      scanTimers.push(setTimeout(() => {
        elements.scanBar.style.width = `${Math.round((stepEnd / total) * 100)}%`;
      }, start + 50));
    });
  }

  function finishScanAnimation() {
    qsa("#scan-status-list li").forEach((li) => {
      li.classList.remove("active");
      li.classList.add("done");
    });
    elements.scanBar.style.width = "100%";
  }

  function stopScanAnimation() {
    scanTimers.forEach(clearTimeout);
    scanTimers = [];
    elements.scanStage.classList.remove("active");
  }

  /* ============ ANALYSIS PIPELINE ============ */
  async function runAnalysis() {
    if (!state.imageFile) {
      toast("이미지를 먼저 선택해 주세요.", "error");
      return;
    }
    if (state.busy) return;
    state.busy = true;

    showScene("scanning");
    startScanAnimation();

    try {
      // 1. survey first (sets surveyId)
      await saveSurvey();

      // 2. predict
      const body = new FormData();
      body.append("image", state.imageFile);
      const prediction = await api("/api/diagnostics/", { method: "POST", json: false, body });
      state.prediction = prediction;
      state.predictionId = Number(prediction.id);

      // 3. recommend
      const reco = await api("/api/recommendations_data/", {
        method: "POST",
        body: JSON.stringify({
          prediction_id: state.predictionId,
          survey_id: state.surveyId,
          age_group: state.survey["age-group"],
        }),
      });
      state.recommendations = reco.recommended_data || [];

      // ensure scan animation has had time to play (UX feel)
      await waitForScan();
      finishScanAnimation();
      await sleep(450);

      stopScanAnimation();
      renderResult();
      showScene("result");
    } catch (error) {
      stopScanAnimation();
      toast(error.message || "분석에 실패했어요.", "error");
      showScene("upload");
    } finally {
      state.busy = false;
    }
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function waitForScan() {
    const total = SCAN_STAGES.reduce((sum, s) => sum + s.duration, 0);
    return sleep(total);
  }

  /* ============ RESULT RENDERING ============ */
  function topProbability(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    return Math.max(...values);
  }

  function computeSkinScore(p) {
    // Compose a 0-100 score from the prediction signals.
    const moistureAvg = avg([
      scaleInverse(p.forehead_moisture_prediction, 1),
      scaleInverse(p.left_cheek_moisture_prediction, 1),
      scaleInverse(p.right_cheek_moisture_prediction, 1),
    ]);
    const poreAvg = avg([
      scaleInverse(p.left_cheek_pore_prediction, 2),
      scaleInverse(p.right_cheek_pore_prediction, 2),
    ]);
    const pigmentation = scaleInverse(p.forehead_pigmentation_prediction, 2);
    const lip = scaleInverse(p.lips_dryness_prediction, 2);
    return Math.round((moistureAvg * 0.35 + poreAvg * 0.25 + pigmentation * 0.25 + lip * 0.15) * 100);
  }

  function avg(values) {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function scaleInverse(value, max) {
    if (value === null || value === undefined) return 0.5;
    return Math.max(0, Math.min(1, 1 - Number(value) / max));
  }

  function renderResult() {
    const p = state.prediction;

    // Skin score gauge
    const score = computeSkinScore(p);
    const tone = score >= 75 ? "최상의 컨디션" : score >= 55 ? "안정적인 상태" : score >= 35 ? "케어가 필요해요" : "집중 관리가 필요해요";
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - score / 100);
    elements.skinGauge.innerHTML = `
      <div class="gauge-ring">
        <svg viewBox="0 0 92 92">
          <circle class="track" cx="46" cy="46" r="${radius}"></circle>
          <circle class="fill" cx="46" cy="46" r="${radius}"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${circumference}"></circle>
        </svg>
        <div class="gauge-num">
          <div>
            <strong>${score}</strong>
            <small>SKIN SCORE</small>
          </div>
        </div>
      </div>
      <div class="gauge-meta">
        <strong>${tone}</strong>
        <small>5개 모델의 추론을 종합한 케어 인덱스입니다.</small>
      </div>
    `;
    // animate gauge
    requestAnimationFrame(() => {
      const fill = elements.skinGauge.querySelector(".fill");
      if (fill) fill.style.strokeDashoffset = String(offset);
    });

    // Metrics tiles — bar represents the *care score* (higher = healthier).
    elements.metrics.innerHTML = [
      metricTile("피부 타입", labels.skinType[p.skin_type_prediction] || "-", null, topProbability(p.skin_type_probabilities)),
      metricTile("색소 침착", labels.severity3[p.forehead_pigmentation_prediction] || "-", careScoreThree(p.forehead_pigmentation_prediction)),
      metricTile("모공 (좌)", labels.severity3[p.left_cheek_pore_prediction] || "-", careScoreThree(p.left_cheek_pore_prediction)),
      metricTile("모공 (우)", labels.severity3[p.right_cheek_pore_prediction] || "-", careScoreThree(p.right_cheek_pore_prediction)),
      metricTile("이마 수분", labels.moisture[p.forehead_moisture_prediction] || "-", careScoreMoisture(p.forehead_moisture_prediction)),
      metricTile("입술 건조", labels.lips[p.lips_dryness_prediction] || "-", careScoreThree(p.lips_dryness_prediction)),
    ].join("");

    // Marked image
    if (p.marked_image_url) {
      elements.markedCard.style.display = "";
      elements.markedImage.innerHTML = `<img src="${escapeHtml(p.marked_image_url)}" alt="피부 랜드마크" style="width:100%;display:block;">`;
    } else {
      elements.markedCard.style.display = "none";
    }

    // Products
    renderProducts(state.recommendations || []);
  }

  function careScoreThree(value) {
    // 0 (낮음/양호) = healthy 90, 1 (보통) = 60, 2 (높음/건조) = 30
    if (value === null || value === undefined) return null;
    return value === 0 ? 90 : value === 1 ? 60 : 30;
  }

  function careScoreMoisture(value) {
    // 0 (부족) = 30, 1 (충분) = 90
    if (value === null || value === undefined) return null;
    return value === 1 ? 90 : 30;
  }

  function tintClassFor(score) {
    if (score === null || score === undefined) return "tint-info";
    if (score >= 80) return "tint-good";
    if (score >= 50) return "tint-mid";
    return "tint-low";
  }

  function badgeToneFor(score) {
    if (score === null || score === undefined) return "";
    if (score >= 80) return "good";
    if (score >= 50) return "mid";
    return "";
  }

  function metricTile(title, value, careScore, fallbackProbability) {
    // bar width = care score if available, else model confidence
    const widthPercent = careScore != null
      ? careScore
      : Math.round((fallbackProbability || 0) * 100);
    const tint = tintClassFor(careScore);
    const badgeHtml = careScore != null
      ? `<span class="care-score ${badgeToneFor(careScore)}">${careScore}점</span>`
      : "";
    return `
      <div class="metric">
        <span class="label">${escapeHtml(title)}${badgeHtml}</span>
        <strong class="value">${escapeHtml(value)}</strong>
        <div class="bar"><i class="${tint}" style="--value:${widthPercent}%"></i></div>
      </div>
    `;
  }

  function affinityFromScore(score) {
    const s = Number(score) || 0;
    let dots, label;
    if (s >= 90)      { dots = 5; label = "매우 잘 맞아요"; }
    else if (s >= 75) { dots = 4; label = "잘 맞아요"; }
    else if (s >= 60) { dots = 3; label = "괜찮아요"; }
    else if (s >= 45) { dots = 2; label = "보통이에요"; }
    else              { dots = 1; label = "참고만"; }
    const dotHtml = Array.from({ length: 5 }, (_, i) =>
      `<span class="dot${i < dots ? " on" : ""}"></span>`
    ).join("");
    return { dotHtml, label };
  }

  function renderProducts(products) {
    if (!products.length) {
      elements.productList.innerHTML = `<div class="empty"><span class="ico">💎</span>매칭된 제품이 없습니다.</div>`;
      return;
    }
    const top = products.slice(0, 8);
    elements.productList.innerHTML = top.map((item, idx) => {
      const reasons = (item.match_reasons || []).slice(0, 3);
      const reasonChips = reasons.map((r) => `<span class="chip">${escapeHtml(r)}</span>`).join("");
      const logo = item.logo
        ? `<img src="${escapeHtml(item.logo)}" alt="">`
        : `<div class="logo-fallback">${escapeHtml((item.brand || "SC").slice(0, 2))}</div>`;
      const meta = [item.category, item.etc].filter(Boolean).join(" · ");
      const aff = affinityFromScore(item.match_score);
      return `
        <div class="product">
          <div class="rank">${idx + 1}</div>
          ${logo}
          <div class="info">
            <div class="brand">${escapeHtml(item.brand || "")}</div>
            <span class="title">${escapeHtml(item.title || "")}</span>
            ${meta ? `<small style="color:var(--muted);font-size:11px;">${escapeHtml(meta)}</small>` : ""}
            ${reasons.length ? `<div class="reasons" style="margin-top:6px;">${reasonChips}</div>` : ""}
          </div>
          <div class="side">
            <div class="affinity-wrap">
              <div class="affinity">${aff.dotHtml}</div>
              <span class="affinity-label">${escapeHtml(aff.label)}</span>
            </div>
            <span class="price">${escapeHtml(money(item.price))}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  /* ============ DIAGNOSIS RENDER ============ */
  function parseDiagnosisPayload(raw) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function chips(items, variant = "") {
    if (!Array.isArray(items) || !items.length) return "";
    return `<div class="chips">${items.map((i) => `<span class="chip ${variant}">${escapeHtml(i)}</span>`).join("")}</div>`;
  }

  function routineList(items) {
    if (!Array.isArray(items) || !items.length) return "";
    return `<ol class="routine-list">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ol>`;
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
            <h3 style="margin:0 0 10px;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800;">우선 케어 포인트</h3>
            ${chips(concerns, "rose")}
          </div>
        ` : ""}
        ${(morning.length || evening.length) ? `
          <div class="routine-grid">
            ${morning.length ? `<div class="routine-col"><h3>☀️ 모닝 루틴</h3>${routineList(morning)}</div>` : ""}
            ${evening.length ? `<div class="routine-col evening"><h3>🌙 이브닝 루틴</h3>${routineList(evening)}</div>` : ""}
          </div>
        ` : ""}
        ${(seek.length || avoid.length) ? `
          <div class="routine-grid">
            ${seek.length ? `<div class="ingredient-block"><h4>찾아볼 성분</h4>${chips(seek, "mint")}</div>` : ""}
            ${avoid.length ? `<div class="ingredient-block"><h4>주의할 성분</h4>${chips(avoid, "gold")}</div>` : ""}
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

  function renderDiagnosisLoader() {
    elements.diagnosisText.innerHTML = `
      <div class="empty" style="background:linear-gradient(135deg,rgba(245,215,204,.4),rgba(197,221,209,.35));">
        <div style="width:42px;height:42px;margin:0 auto 14px;border-radius:50%;border:3px solid rgba(216,155,150,.25);border-top-color:var(--rose);animation:spin .85s linear infinite;"></div>
        <strong style="display:block;font-size:15px;color:var(--ink);margin-bottom:4px;">AI 카운셀러가 진단 중이에요</strong>
        <span style="color:var(--muted);font-size:13px;">분석 결과를 K-뷰티 톤으로 정리하고 있습니다.</span>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
  }

  async function fetchDiagnosis() {
    if (!state.predictionId) {
      toast("분석 결과가 필요해요.", "error");
      return;
    }
    if (state.busy) return;
    state.busy = true;

    showScene("diagnosis");
    renderDiagnosisLoader();
    try {
      const data = await api("/api/generate/", {
        method: "POST",
        body: JSON.stringify({ prediction_id: state.predictionId }),
      });
      const payload = parseDiagnosisPayload(data.diagnosis_text);
      state.diagnosisPayload = payload;
      if (payload && typeof payload === "object" && (payload.summary || payload.headline)) {
        renderStructuredDiagnosis(payload);
      } else {
        renderPlaintextDiagnosis(data.diagnosis_text || "진단 결과가 비어있습니다.");
      }
    } catch (error) {
      elements.diagnosisText.innerHTML = `
        <div class="empty">
          <span class="ico">⚠️</span>
          ${escapeHtml(error.message || "AI 진단을 불러오지 못했어요.")}
          <div style="margin-top:12px;font-size:12px;color:var(--muted);">
            OPENAI_API_KEY 설정을 확인해 주세요.
          </div>
        </div>
      `;
    } finally {
      state.busy = false;
    }
  }

  /* ============ RESET ============ */
  function resetAll() {
    state.scene = "welcome";
    state.imageFile = null;
    state.prediction = null;
    state.predictionId = null;
    state.recommendations = null;
    state.diagnosisPayload = null;
    elements.imageInput.value = "";
    elements.preview.removeAttribute("src");
    elements.preview.classList.add("hidden");
    elements.previewEmpty.classList.remove("hidden");
    elements.startAnalysis.disabled = true;
    elements.diagnosisText.innerHTML = "";
    showScene("welcome");
  }

  /* ============ BIND ============ */
  function cacheElements() {
    Object.assign(elements, {
      stepper: $("stepper"),
      scanStage: $("scan-stage"),
      scanImage: $("scan-image"),
      scanTitle: $("scan-title"),
      scanBar: $("scan-bar"),
      imageInput: $("image-input"),
      preview: $("preview"),
      previewEmpty: $("preview-empty"),
      dropZone: $("drop-zone"),
      startAnalysis: $("start-analysis"),
      productList: $("product-list"),
      metrics: $("metrics"),
      skinGauge: $("skin-gauge"),
      markedImage: $("marked-image"),
      markedCard: $("marked-card"),
      diagnosisText: $("diagnosis-text"),
      toast: $("toast"),
    });
  }

  function bindActions() {
    $("welcome-start").addEventListener("click", () => showScene("survey-age"));
    $("home-link").addEventListener("click", resetAll);

    qsa("[data-action='next']").forEach((btn) => btn.addEventListener("click", nextScene));
    qsa("[data-action='back']").forEach((btn) => btn.addEventListener("click", prevScene));

    $("start-analysis").addEventListener("click", runAnalysis);

    $("diagnosis-button").addEventListener("click", fetchDiagnosis);
    $("diagnosis-button-2").addEventListener("click", fetchDiagnosis);
    $("back-to-result").addEventListener("click", () => showScene("result"));

    $("restart-button").addEventListener("click", resetAll);
    $("restart-button-2").addEventListener("click", resetAll);
  }

  function init() {
    cacheElements();
    bindOptionGroups();
    bindUpload();
    bindActions();
    showScene("welcome");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
