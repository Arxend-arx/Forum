# ============================================================
# 后端容器：Flask REST API（独立镜像，不托管前端静态文件）
# 数据通过共享卷 /data 访问（由 db 容器初始化维护）
# ============================================================
FROM hub.rat.dev/library/python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt

COPY app.py academic_match.py starlink.py config.json ./

ENV DB_PATH=/data/forum.db \
    UPLOAD_DIR=/data/uploads \
    FLASK_DEBUG=0

EXPOSE 5000
CMD ["python", "app.py"]
