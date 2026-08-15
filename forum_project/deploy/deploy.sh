#!/bin/bash
# Academy Forum 远程部署脚本（方案 B：镜像导入 + 数据还原）
# 在服务器 ~/academy 目录下执行：bash deploy.sh
set -e
cd ~/academy

echo "== 1/6 导入镜像 =="
docker load -i academy_images.tar

echo "== 2/6 准备数据目录（root 容器清理残留 + SELinux 打标）=="
docker run --rm -v ~/academy:/mnt hub.rat.dev/library/postgres:16-alpine sh -c 'rm -rf /mnt/pgdata && mkdir -p /mnt/pgdata && chmod 777 /mnt/pgdata && mkdir -p /mnt/uploads && chmod 777 /mnt/uploads'
chcon -Rt svirt_sandbox_file_t ~/academy/pgdata ~/academy/uploads 2>/dev/null || true

echo "== 3/6 启动数据库容器 =="
docker compose -p academy up -d db

echo "== 4/6 等待数据库健康 =="
ok=0
for i in $(seq 1 30); do
  st=$(docker inspect -f '{{.State.Health.Status}}' academy-db 2>/dev/null || echo starting)
  if [ "$st" = "healthy" ]; then ok=1; break; fi
  sleep 2
done
if [ "$ok" != "1" ]; then echo "数据库未就绪，请检查"; docker logs academy-db | tail -30; exit 1; fi
echo "db healthy"

echo "== 5/6 还原数据（清库重建 + 导入）=="
docker exec -i academy-db psql -U academy -d academy < academy_dump.sql

echo "== 6/6 复制上传文件并启动全部服务 =="
cp -rf ~/academy/uploads_new/. ~/academy/uploads/
docker compose -p academy up -d
sleep 3
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo "DONE"
