import json
import logging
import os

from django.conf import settings
from google import genai
from google.genai import types as genai_types
from google.genai.errors import APIError


logger = logging.getLogger(__name__)


SKIN_TYPE_LABELS = {0: "건성", 1: "중성", 2: "지성"}
LIPS_DRYNESS_LABELS = {0: "양호", 1: "보통", 2: "건조"}
THREE_LEVEL_LABELS = {0: "낮음", 1: "보통", 2: "높음"}
MOISTURE_LABELS = {0: "부족", 1: "충분"}


SYSTEM_PROMPT = """당신은 피부 관리 상담을 돕는 K-뷰티 전문가입니다.
사용자의 AI 피부 분석 결과를 받아 부드럽고 따뜻한 어조로 진단과 케어 가이드를 제공합니다.

규칙:
- 의학적 확정 진단처럼 단정하지 말고 "~인 편입니다", "~할 수 있어요" 같은 안내형 어조를 사용합니다.
- 친근하지만 신뢰감 있는 K-뷰티 카운슬링 톤을 유지합니다.
- 모든 텍스트는 한국어로 작성합니다.
- 반드시 지정된 JSON 스키마에 맞춰 응답합니다."""


RESPONSE_SCHEMA_HINT = """반드시 다음 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "headline": "사용자 피부 상태를 한 줄로 표현 (15자 이내)",
  "summary": "전반적인 피부 상태 요약 (2~3문장)",
  "key_concerns": ["우선 케어가 필요한 포인트", ...] (2~4개),
  "morning_routine": ["오전 루틴 단계 설명", ...] (3~5개),
  "evening_routine": ["저녁 루틴 단계 설명", ...] (3~5개),
  "ingredients_to_seek": ["추천 성분 이름", ...] (3~5개),
  "ingredients_to_avoid": ["피해야 할 성분 또는 성질", ...] (2~4개),
  "lifestyle_tips": ["생활 습관 팁", ...] (2~3개)
}"""


def label(mapping, value):
    return mapping.get(value, "알 수 없음")


def build_user_prompt(prediction):
    return f"""다음은 사용자의 AI 피부 분석 결과입니다.

[분석 결과]
- 피부 타입: {label(SKIN_TYPE_LABELS, prediction.skin_type_prediction)}
- 이마 색소침착: {label(THREE_LEVEL_LABELS, prediction.forehead_pigmentation_prediction)}
- 왼쪽 볼 모공: {label(THREE_LEVEL_LABELS, prediction.left_cheek_pore_prediction)}
- 오른쪽 볼 모공: {label(THREE_LEVEL_LABELS, prediction.right_cheek_pore_prediction)}
- 이마 수분: {label(MOISTURE_LABELS, prediction.forehead_moisture_prediction)}
- 왼쪽 볼 수분: {label(MOISTURE_LABELS, prediction.left_cheek_moisture_prediction)}
- 오른쪽 볼 수분: {label(MOISTURE_LABELS, prediction.right_cheek_moisture_prediction)}
- 입술 건조: {label(LIPS_DRYNESS_LABELS, prediction.lips_dryness_prediction)}

위 분석 결과를 바탕으로 K-뷰티 카운슬러처럼 진단 리포트를 작성해 주세요.

{RESPONSE_SCHEMA_HINT}"""


def generate_diagnosis_from_prediction(prediction):
    if not settings.GOOGLE_API_KEY:
        logger.warning("GOOGLE_API_KEY is not configured; skipping LLM diagnosis")
        return None

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    client = genai.Client(api_key=settings.GOOGLE_API_KEY)

    try:
        response = client.models.generate_content(
            model=model,
            contents=build_user_prompt(prediction),
            config=genai_types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.7,
                max_output_tokens=1400,
            ),
        )
    except APIError:
        logger.exception("Gemini diagnosis call failed (model=%s)", model)
        return None

    raw = getattr(response, "text", None)
    if not raw:
        logger.warning("Gemini returned empty content for diagnosis")
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.exception("Gemini diagnosis returned non-JSON content: %s", raw[:500])
        return None

    return json.dumps(parsed, ensure_ascii=False)
