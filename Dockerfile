FROM docker.io/oven/bun:1.3.5

LABEL org.opencontainers.image.title="humandbs" \
    org.opencontainers.image.description="HumanDBs Portal Backend & Frontend" \
    org.opencontainers.image.authors="DBCLS" \
    org.opencontainers.image.url="https://github.com/dbcls/humandbs" \
    org.opencontainers.image.source="https://github.com/dbcls/humandbs" \
    org.opencontainers.image.licenses="Apache-2.0"

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    jq \
    less \
    procps \
    tree \
    vim-tiny && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# chmod: named volume inherits image permissions on first creation;
#        make writable so arbitrary UID (Podman keep-id) can run `bun install`.
RUN bun install --frozen-lockfile && \
    chmod -R a+rwX node_modules && \
    [ -d apps/frontend/node_modules ] && chmod -R a+rwX apps/frontend/node_modules || true && \
    [ -d apps/backend/node_modules ] && chmod -R a+rwX apps/backend/node_modules || true && \
    [ -d packages/eslint-config/node_modules ] && chmod -R a+rwX packages/eslint-config/node_modules || true

COPY . .

# Writable home for arbitrary UID (Podman keep-id).
ENV HOME=/home/app
RUN mkdir -p /home/app && chmod 777 /home/app

ENTRYPOINT [""]
CMD ["sleep", "infinity"]
