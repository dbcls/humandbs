FROM docker.io/library/node:24-bookworm-slim AS base
ENV NODE_ENV=development
WORKDIR /app
# node_modules lives in a named volume in dev. Creating it here as node:node
# makes the volume inherit that ownership, so the unprivileged user can install
# into it while bind-mounted sources stay owned by the host user.
RUN mkdir -p /app/node_modules && chown -R node:node /app
USER node

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS deps
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY --chown=node:node . .
RUN npm run build

FROM base AS prod
ENV NODE_ENV=production
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/build ./build
CMD ["npm", "run", "start"]
