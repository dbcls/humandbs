FROM python:3.11.16-slim-trixie@sha256:da047cb8f9d1d98e5c070f5300ba9f7274e33b8fc0e5be5ed88740aed1b95ba9

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    tesseract-ocr \
    tesseract-ocr-jpn \
    tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.12.18@sha256:3adc3706091ce7c2fe595e669628caedd6d951551b92b258b7e7dbe06d9440bc /uv /usr/local/bin/uv

ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_LINK_MODE=copy \
    PATH=/app/.venv/bin:$PATH

# Install dependencies first, from the lockfile only, so this layer is cached
# independently of application source changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Install playwright browsers (the playwright package itself comes from the
# dependency sync above).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN playwright install --with-deps chromium

COPY README.md ./
COPY templates ./templates
COPY data ./data
COPY src ./src

# Install the project itself now that its source is present.
RUN uv sync --frozen --no-dev

ENV PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/work \
    && chown -R appuser:appuser /app

USER appuser

CMD ["uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8000"]
