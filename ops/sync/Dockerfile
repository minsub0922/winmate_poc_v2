# 베이스 이미지는 루트 .env의 PYTHON_IMAGE(docker-compose build args)로 고정한다
ARG PYTHON_IMAGE=python:3.12.16-slim
FROM ${PYTHON_IMAGE}
RUN pip install --no-cache-dir "psycopg[binary]==3.3.9" \
 && useradd --system --uid 10001 --home /app winmate
WORKDIR /app
COPY loader.py views.sql ./
USER winmate
CMD ["python", "-u", "/app/loader.py"]
