# ============================================================
# 前端容器：Nginx 托管 SPA 构建产物（独立镜像）
# /api 与 /uploads 反向代理到后端服务（compose 服务名 backend）
# ============================================================

# Stage 1: 构建前端
FROM hub.rat.dev/library/node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Stage 2: Nginx 托管
FROM hub.rat.dev/library/nginx:alpine
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
