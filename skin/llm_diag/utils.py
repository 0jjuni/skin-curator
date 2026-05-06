from openai import OpenAI
from django.conf import settings


SKIN_TYPE_LABELS = {
    0: "건성",
    1: "중성",
    2: "지성",
}

LIPS_DRYNESS_LABELS = {
    0: "양호",
    1: "보통",
    2: "건조",
}

THREE_LEVEL_LABELS = {
    0: "낮음",
    1: "보통",
    2: "높음",
}

MOISTURE_LABELS = {
    0: "부족",
    1: "충분",
}


def label(mapping, value):
    return mapping.get(value, "알 수 없음")


def generate_diagnosis_from_prediction(prediction):
    if not settings.OPENAI_API_KEY:
        return None

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    prompt = f"""
사용자의 피부 분석 결과입니다.

- 피부 타입: {label(SKIN_TYPE_LABELS, prediction.skin_type_prediction)}
- 이마 색소침착: {label(THREE_LEVEL_LABELS, prediction.forehead_pigmentation_prediction)}
- 왼쪽 볼 모공: {label(THREE_LEVEL_LABELS, prediction.left_cheek_pore_prediction)}
- 오른쪽 볼 모공: {label(THREE_LEVEL_LABELS, prediction.right_cheek_pore_prediction)}
- 이마 수분: {label(MOISTURE_LABELS, prediction.forehead_moisture_prediction)}
- 왼쪽 볼 수분: {label(MOISTURE_LABELS, prediction.left_cheek_moisture_prediction)}
- 오른쪽 볼 수분: {label(MOISTURE_LABELS, prediction.right_cheek_moisture_prediction)}
- 입술 건조: {label(LIPS_DRYNESS_LABELS, prediction.lips_dryness_prediction)}

피부 상태를 간결하게 진단하고, 아침/저녁 관리법과 주의할 성분을 한국어로 제안해 주세요.
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "당신은 피부 관리 상담을 돕는 전문가입니다. 의학적 확정 진단처럼 말하지 말고 생활 관리 중심으로 조언하세요.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=1200,
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception:
        return None
