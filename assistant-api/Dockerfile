FROM python:3.11-slim


WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    tesseract-ocr \
    tesseract-ocr-jpn \
    tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml .

# Install dependencies with uv
RUN uv pip install --system --no-cache .

COPY src ./src
COPY templates ./templates

# Install playwright browsers
RUN playwright install --with-deps chromium

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8000"]
