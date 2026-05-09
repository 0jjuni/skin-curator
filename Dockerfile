# Hugging Face Spaces (Docker SDK) deployment image.
#
# Build context: repo root.
# Listens on $PORT (default 7860, the HF Spaces default).
# Loads ResNeXt weights from /app/skin/weights at runtime — upload the five
# .pth files via the Space "Files" tab once after the first build.

FROM python:3.12-slim

# System libs required by opencv-python-headless and mediapipe.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        ffmpeg \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=1.8.3 \
    POETRY_VIRTUALENVS_CREATE=false

RUN pip install --no-cache-dir "poetry==${POETRY_VERSION}"

WORKDIR /app/skin

# Install dependencies first for better layer caching.
COPY skin/pyproject.toml skin/poetry.lock /app/skin/
RUN poetry install --no-interaction --no-ansi --no-root

# Copy the rest of the project.
COPY skin/ /app/skin/

# Pre-compute static assets and DB so the container starts fast.
ENV DJANGO_SECRET_KEY=hf-spaces-build-only \
    DJANGO_DEBUG=false \
    DJANGO_ALLOWED_HOSTS=* \
    PYTHONPATH=/app/skin

RUN python manage.py migrate --noinput \
    && python manage.py import_products

# HF Spaces sends the public port via $PORT (default 7860).
ENV PORT=7860
EXPOSE 7860

# Bind to 0.0.0.0 so the Space proxy can reach Django.
# --insecure lets runserver serve /static/ even with DEBUG=false (demo only).
CMD ["sh", "-c", "python manage.py runserver --insecure 0.0.0.0:${PORT}"]
