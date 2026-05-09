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

## 추천 시스템 설계

졸업작품 보고서에서 채택한 설계 방향과 현재 백엔드 구현을 함께 정리합니다.

### 1. 방법론 — 내용 기반 필터링 (Content-Based Filtering)

사용자 행동 로그가 없는 졸업작품 환경이라 협업 필터링 대신 **내용 기반 필터링**을 채택했습니다. 제품의 특성 벡터와 사용자 특성 벡터를 같은 공간에 두고 코사인 유사도가 높은 제품을 추천합니다.

### 2. 제품 특성 벡터 구축

화해 랭킹 페이지에서 피부 타입 7종(지성·건성·중성·복합성·민감성·여드름·아토피)과 연령대 4종(10/20/30/40대 이상)에 대해 각각 상위 20개 제품을 스크래핑한 뒤, 두 데이터프레임을 제품 단위로 통합했습니다. 평점·리뷰 수처럼 카테고리별로 다르게 집계된 값은 평균으로 일관성을 맞추고 소수점 2자리·정수로 반올림했습니다.

#### 결측치 보정 — 행렬 인수분해 + 경사하강법

서로 다른 카테고리에서 가져온 두 데이터프레임을 합치면 한쪽에만 존재하는 제품이 생기면서 빈 칸(NaN)이 다수 발생합니다. 이를 단순 0/평균 대체 대신 **행렬 인수분해(Matrix Factorization)** 로 추정해서 채웠습니다:

- 잠재 요인(latent factor) 3개
- 학습률 0.01, 최대 반복 10,000
- MSE가 다시 발산하는 현상을 막기 위해 **조기 종료 threshold `1e-6`** 도입 → 약 1,890회에서 수렴
- 채워진 값은 0~1 범위로 **클리핑** 후 소수점 2자리 반올림

이 결과가 [`skin/data/filled_reco.csv`](skin/data/filled_reco.csv) 입니다. `import_products` 명령어가 이 CSV를 읽어 `ProductFeature` 테이블의 15차원 특성 벡터로 적재합니다.

### 3. 사용자 특성 벡터 구축

원 보고서는 사용자가 입력한 피부 타입·연령대만으로 벡터를 만들었지만, 백엔드에서는 ResNeXt 분석 결과와 설문을 결합해 더 풍부한 벡터를 만듭니다 ([reco/views.py](skin/reco/views.py#L177)):

| 차원 | 출처 |
| --- | --- |
| `oily / dry / normal / combination` (4) | ResNeXt 피부 타입 분류 결과 (one-hot) |
| `sensitive / acne / atopy` (3) | 사용자 설문 (1~5단계 → 0.2~1.0 스케일) |
| `teens / twenties / thirties / forties_above` (4) | 회원 나이 또는 사용자 선택 (one-hot) |
| `moisture_supply` | 이마/양볼 수분 예측의 평균을 1에서 뺀 값 (낮을수록 보습 필요) |
| `pore_care` | 양볼 모공 예측 평균 |
| `pigmentation_care` | 이마 색소침착 예측 |
| `lip_dry_care` | 입술 건조도 예측 |

### 4. 유사도 계산 — 가중치 코사인 유사도

기본 코사인 유사도 위에 **차원별 가중치**를 곱해 해석 가능성을 확보했습니다 ([reco/views.py:51](skin/reco/views.py#L51)). 예를 들어 피부 타입(`oily`/`dry` 1.7)·수분 보충(1.45)·모공 케어(1.35)는 비중을 높이고, 연령대(0.75)는 비중을 낮췄습니다.

추천 단계:
1. 사용자 벡터·제품 벡터에 동일한 가중치를 element-wise 곱
2. 코사인 유사도 계산 → 상위 20개 선정
3. 각 제품에 대해 `사용자값 × 제품값 × 가중치`가 큰 차원 3개를 `match_reasons`로 노출 (예: "수분/보습", "모공 케어", "지성 피부")
4. 유사도를 0~1로 클리핑한 뒤 100점 만점 `match_score`로 환산

### 5. 알려진 한계 (보고서 고찰 + 추가)

- **데이터 양 부족** — 카테고리당 20개라 추천 다양성에 한계.
- **협업 필터링 부재** — 사용자 행동 로그가 없어 도입하지 못함. 사용 로그가 쌓이면 하이브리드(content × collaborative)로 확장 가능.
- **결측치 보정의 한계** — 행렬 인수분해는 관측된 패턴을 일반화한 추정이라 실제 제품 특성과 어긋날 수 있음.
- **현재 시점 가격/할인 정보** — 2024년 스냅샷이라 시간이 지나면 정확도 저하.

## 알려진 한계

- 단일 정면 얼굴 사진에 최적화. 측면, 마스크 착용, 부분 가려짐 시 크롭 실패 가능.
- 모델은 학습 데이터 분포에 종속됨. 학습 데이터에 없는 피부 톤/연령에서 정확도 저하 가능.
- 추천 점수는 코사인 유사도 × 가중치이며 절대적 효능 보장이 아닌 매칭 지표입니다.
- DB는 SQLite 기본 설정. 다중 사용자 동시 추론에는 부적합.

## 라이선스

[CC BY-NC 4.0](LICENSE) — 비상업적 용도로 자유롭게 사용·수정·배포 가능. 출처 표기 필수.
