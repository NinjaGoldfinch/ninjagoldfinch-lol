# Built on the VM: docker compose -f deploy/compose.yaml up -d --build
FROM node:22-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# The site's public origin (e.g. http://<vm-ip>:3000), baked in at build
# time for form CSRF checks; adapter-node 6 does not read it at runtime.
ARG ORIGIN
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
# PORT from deploy/.env if it sets one; the server's own default otherwise.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
	CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1
CMD ["node", "build"]
