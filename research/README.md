# Research Notebooks

졸업작품 진행 과정에서 사용한 데이터 수집·전처리·모델 학습 노트북입니다.

> ⚠️ 본 노트북들은 학술/연구 목적으로 작성된 원본 작업물입니다. 출력 셀과 절대 경로(`C:\\...`)가 포함되어 있을 수 있으며, 그대로 재현하기 위한 것이 아니라 방법론을 공개하기 위한 것입니다.

## 노트북 목록

| 파일 | 설명 |
| --- | --- |
| `01_resnext_skin_classification.ipynb` | ResNeXt-50 전이학습으로 피부 이미지를 분류하는 학습 코드. 데이터 증강(`RandomHorizontalFlip`, `RandomRotation`, `ColorJitter`), Dropout, StepLR 스케줄러 실험 포함. |
| `02_skin_dataset_preparation.ipynb` | AI Hub 원본 이미지에서 부위별(이마/볼/입술) 크롭과 라벨링을 거쳐 학습용 train/valid 데이터셋을 만드는 전처리 파이프라인. |
| `03_crawl_by_skin_type.ipynb` | 화해 랭킹 페이지에서 피부 타입별(지성·건성·중성·복합성·민감성·여드름·아토피) 제품과 리뷰 키워드 비율을 수집. |
| `04_crawl_by_age.ipynb` | 화해 랭킹 페이지에서 연령대별(10/20/30/40대 이상) 제품과 리뷰 키워드 비율을 수집. |

## 데이터 출처

### 피부 이미지 학습 데이터 — AI Hub
- **데이터셋**: [한국인 피부상태 측정 데이터](https://www.aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&dataSetSn=71645) (AI Hub, dataSetSn=71645)
- **사용 범위**: ResNeXt-50 모델 5종(모공·색소침착·수분·입술 건조·피부 타입) 학습
- **이용 조건**: AI Hub의 [데이터 이용 정책](https://aihub.or.kr/intrcn/intrcn.do?currMenu=151&topMenu=105)을 따릅니다. 본 데이터셋의 원본 이미지는 본 저장소에 포함되지 않으며, 사용자가 AI Hub에서 직접 신청·다운로드해야 합니다.

### 제품 데이터 — 화해 (hwahae.co.kr)
- **수집 대상**: 화해 랭킹 페이지의 피부 타입별/연령대별 추천 제품과 리뷰 키워드 비율
- **수집 시점**: 2024년 (학기 중 일회성 수집)
- **사용 범위**: 추천 시스템의 제품 특성 벡터 구성
- **주의**: 브랜드명·제품명·로고 URL·리뷰 키워드 등 모든 데이터의 원 권리는 화해 및 해당 브랜드에 귀속됩니다. 본 저장소의 CSV(`skin/data/`)는 학술 목적의 일회성 스냅샷이며, 화해의 [이용약관](https://www.hwahae.co.kr/terms)을 별도로 준수하지 않은 상업적 재배포는 금지합니다.

## 재현하려면

1. AI Hub에서 원본 데이터셋 신청·다운로드
2. `02_skin_dataset_preparation.ipynb`로 부위별 train/valid 폴더 구성
3. `01_resnext_skin_classification.ipynb`의 학습 셀 실행 (모공/색소/수분/입술/피부타입 각각 별도 학습 — 노트북 마지막에서 분류 클래스 수와 라벨 폴더만 바꿔 반복)
4. 결과 `.pth` 5개를 `skin/weights/`에 배치

크롤링 노트북(03, 04)은 화해 페이지 구조가 변경되면 그대로 작동하지 않을 수 있습니다. CSS 클래스명이 `hds-*` 접두 형태로 자주 바뀌는 점 참고.
