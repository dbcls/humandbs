FROM python:3.10-slim

WORKDIR /workspace/humandbs-assistant

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

# Install playwright browsers
RUN playwright install --with-deps chromium

ENV PYTHONUNBUFFERED=1

CMD ["python", "src/app.py"]