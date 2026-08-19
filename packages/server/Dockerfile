# ---- Builder ----
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY packages/server/ packages/server/
RUN cd packages/server && pnpm build

# ---- Production ----
FROM node:20-alpine
WORKDIR /app
# 用 pnpm deploy 从 workspace 提取独立可运行包（含真实 node_modules，非 symlink）
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
# 用 npm 装生产依赖（避免 pnpm workspace symlink 问题）
RUN cd packages/server && npm install --omit=dev && npm cache clean --force
EXPOSE 3100
CMD ["node", "packages/server/dist/index.js"]
