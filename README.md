# Skin Backend

Django 기반 피부 분석, LLM 진단, 제품 추천 API 프로젝트입니다. 루트 화면(`/`)에는 이미지 업로드와 설문, 진단 이력, 추천을 연결한 간단한 웹 UI가 포함되어 있습니다.

## 실행

```powershell
cd skin
copy .env.example .env
poetry install
poetry run python manage.py runserver
```

API 문서는 `/swagger/` 또는 `/redoc/`에서 확인할 수 있습니다.

## 주요 환경 변수

- `DJANGO_SECRET_KEY`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `OPENAI_API_KEY`
- `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`
