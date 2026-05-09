# Skin Curator

졸업작품으로 제작한 **AI 피부 분석 + 화장품 추천** 백엔드입니다.
얼굴 사진을 업로드하면 직접 학습한 ResNeXt-50 모델 5종이 피부 타입·모공·색소침착·수분·입술 건조도를 진단하고, GPT 기반의 관리법 코멘트와 코사인 유사도 기반 제품 추천을 한 페이지에서 보여줍니다.

> ⚠️ 본 프로젝트는 교육·연구 목적의 졸업작품이며 의학적 진단 도구가 아닙니다. 결과를 의료적 판단에 사용하지 마세요. 자세한 내용은 [LICENSE](LICENSE) 참조.

## 주요 기능

- **얼굴 부위 자동 크롭**: MediaPipe FaceMesh로 이마/양볼/입술 추출
- **5개 ResNeXt-50 모델**: 모공·색소침착·수분·입술 건조·피부 타입을 직접 학습한 가중치로 추론
- **LLM 진단 코멘트**: OpenAI GPT-4o-mini로 분석 결과를 한국어 관리 가이드로 변환
- **제품 추천**: 사용자 피부 벡터(15차원) × 제품 특성 벡터의 가중치 코사인 유사도로 상위 20개 추천
- **세션 기반 익명 워크플로우**: 로그인 없이 브라우저 세션 단위로 분석 이력 보관

## 기술 스택

- **백엔드**: Django 5, Django REST Framework
- **ML**: PyTorch, torchvision (ResNeXt-50), MediaPipe, OpenCV
- **LLM**: OpenAI Python SDK
- **추천**: scikit-learn (cosine similarity), NumPy
- **DB**: SQLite (단일 파일, 별도 설정 불필요)
- **프론트**: Django 템플릿 + Vanilla JS 단일 페이지

## 디렉터리 구조

```
.
├── README.md
├── LICENSE                 # CC BY-NC 4.0
├── research/               # 데이터 수집·전처리·모델 학습 노트북
└── skin/                   # Django 프로젝트
    ├── manage.py
    ├── pyproject.toml      # poetry 의존성 정의
    ├── .env.example
    ├── skin/               # Django 설정 (settings, urls, wsgi)
    ├── accounts/           # 커스텀 유저(현재 비활성), 이메일 활성화 코드
    ├── diagnostics/        # 이미지 업로드 → ResNeXt 추론 → 결과 저장
    │   └── ml.py           # 모델 로딩, 얼굴 크롭, 추론 파이프라인
    ├── llm_diag/           # 예측 결과를 GPT 진단 텍스트로 변환
    ├── reco/               # 설문 + 예측 → 제품 추천
    │   └── management/commands/import_products.py
    ├── data/               # 제품 정보 CSV (crawled, 동봉)
    ├── weights/            # *.pth (별도 다운로드 — 아래 참조)
    ├── templates/dashboard.html
    └── static/js/dashboard.js
```

## 설치 및 실행

### 1. 저장소 클론

```powershell
git clone https://github.com/<your-username>/skin-backend.git
cd skin-backend/skin
```

### 2. 모델 가중치 다운로드 (필수)

직접 학습한 ResNeXt-50 가중치 파일은 용량(약 89MB × 5)이 커서 저장소에 포함되지 않습니다. 아래 링크에서 다운로드해 `skin/weights/` 폴더에 넣어주세요.

> 📦 **모델 가중치 다운로드 링크**: `<여기에 Google Drive 링크 채워주세요>`

`skin/weights/` 폴더에 다음 5개 파일이 있어야 합니다:

```
weights/
├── lips_dryness_model.pth
├── moisture_model.pth
├── pigmentation_model.pth
├── pore_model.pth
└── skin_type_model.pth
```

### 3. 환경 변수 설정

```powershell
copy .env.example .env
```

필수 항목:
- `DJANGO_SECRET_KEY` — 임의의 긴 문자열로 교체
- `OPENAI_API_KEY` — LLM 진단을 사용할 경우 (없으면 이 단계만 건너뜀)
- `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` — 회원 가입 이메일 활성화 (현재 메인 흐름에선 미사용)

### 4. 의존성 설치

[Poetry](https://python-poetry.org/) 사용:

```powershell
poetry install
```

### 5. 데이터베이스 마이그레이션 + 제품 데이터 임포트

```powershell
poetry run python manage.py migrate
poetry run python manage.py import_products
```

`import_products`는 기본적으로 `skin/data/`의 CSV 3개(`info.csv`, `filled_reco.csv`, `logo.csv`)를 읽습니다. 다른 경로의 데이터를 사용하려면 `--data-dir`로 지정 가능.

### 6. 서버 실행

```powershell
poetry run python manage.py runserver
```

브라우저에서 [http://localhost:8000](http://localhost:8000) 접속.

## API 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/api/diagnostics/` | 얼굴 이미지 업로드 → 5종 모델 추론 결과 저장 |
| GET | `/api/diagnostics/history/` | 현재 세션의 분석 이력 조회 |
| DELETE | `/api/diagnostics/<pk>/delete/` | 특정 분석 결과 삭제 |
| POST | `/api/llm-diagnosis/` | `prediction_id` → GPT 진단 텍스트 생성 |
| POST | `/api/surveys/` | 민감도/아토피/여드름 설문 등록 |
| POST | `/api/recommendations_data/` | 예측 + 설문 → 추천 제품 20개 반환 |

## 학습 데이터 및 모델

- **피부 분석 모델**: AI Hub의 [한국인 피부상태 측정 데이터](https://www.aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&dataSetSn=71645)(dataSetSn=71645)를 ResNeXt-50으로 직접 파인튜닝. 이마/볼 영역에 대해 모공·색소·수분 3분류, 피부타입 3분류, 입술 건조 3분류 모델로 분리 학습. 원본 이미지는 AI Hub의 이용 정책에 따라 본 저장소에 포함되지 않으며, 사용자가 직접 신청해 받아야 합니다.
- **제품 데이터**: 화장품 리뷰 사이트 [화해(hwahae.co.kr)](https://www.hwahae.co.kr)의 랭킹 페이지를 학술 목적으로 일회성 크롤링(2024). 피부 타입별·연령대별 제품과 리뷰 키워드 비율을 정리한 CSV. 원 출처의 모든 권리는 화해 및 각 브랜드에 귀속되며, 상업적 재배포는 금지합니다.
- **데이터 수집·전처리·모델 학습 코드**는 [`research/`](research/) 폴더에 노트북으로 공개되어 있습니다.

## 알려진 한계

- 단일 정면 얼굴 사진에 최적화. 측면, 마스크 착용, 부분 가려짐 시 크롭 실패 가능.
- 모델은 학습 데이터 분포에 종속됨. 학습 데이터에 없는 피부 톤/연령에서 정확도 저하 가능.
- 추천 점수는 코사인 유사도 × 가중치이며 절대적 효능 보장이 아닌 매칭 지표입니다.
- DB는 SQLite 기본 설정. 다중 사용자 동시 추론에는 부적합.

## 라이선스

[CC BY-NC 4.0](LICENSE) — 비상업적 용도로 자유롭게 사용·수정·배포 가능. 출처 표기 필수.
