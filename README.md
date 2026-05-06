# Skin Backend

Django 기반 피부 분석, LLM 진단, 제품 추천 프로젝트입니다. 루트 화면(`/`)에는 이미지 업로드와 설문, 진단 이력, 추천을 연결한 웹 UI가 포함되어 있습니다.

## 실행

```powershell
cd skin
copy .env.example .env
poetry install
poetry run python manage.py runserver
```

기본 데이터베이스는 Django 프로젝트 안의 `skin/db.sqlite3`로 생성됩니다.

## 주요 환경 변수

- `DJANGO_SECRET_KEY`
- `OPENAI_API_KEY`
- `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`
