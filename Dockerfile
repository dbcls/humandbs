FROM docker.io/library/node:24-bookworm-slim AS base
ENV NODE_ENV=development
WORKDIR /app
# node_modules is kept in a named volume in dev. Creating it here as node:node
# makes the volume inherit that ownership, so the unprivileged user can install
# into it while bind-mounted sources stay owned by the host user.
RUN mkdir -p /app/node_modules && chown -R node:node /app
USER node

# Development: the sources are bind-mounted over /app and the modules are
# installed into the named volume, so the image has neither.
FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS deps
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS source
COPY --chown=node:node . .

FROM source AS build
RUN npm run build

# The one-shot jobs of a deployment: the schema migrations with the grants, and
# the scripts under scripts/ and migration/. They run TypeScript through tsx and
# so need the development dependencies, which the served image does not have.
FROM source AS tools
ENV NODE_ENV=production
CMD ["npm", "run", "db:migrate"]

# What is served: the build output and the production dependencies, nothing
# else. The server is started without npm in between so that the stop signal
# reaches node, which npm does not pass on.
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=5173 \
    PATH=/app/node_modules/.bin:$PATH
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build --chown=node:node /app/build ./build
EXPOSE 5173
CMD ["react-router-serve", "./build/server/index.js"]

# The front proxy, with the client half of the same build. It serves the
# static files itself and hands everything else to the application; the
# application keeps its own copy, so a file this image lacks is still served.
FROM docker.io/library/nginx:1.29-alpine AS proxy
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/client /srv/client
