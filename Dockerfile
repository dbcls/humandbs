FROM docker.io/oven/bun:1.3.5

RUN apt update && \
  apt install -y --no-install-recommends \
  curl \
  jq && \
  apt clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN bun ci

EXPOSE 3000
EXPOSE 8080

CMD ["sleep", "infinity"]
