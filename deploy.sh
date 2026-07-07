#!/bin/bash
set -euo pipefail

cd /home/ubuntu

echo "[deploy] 备份环境变量与数据库..."
cp -f .env .env.bak.deploy 2>/dev/null || true
cp -f data/pdd.db data/pdd.db.bak.deploy 2>/dev/null || true

echo "[deploy] 拉取最新代码..."
git pull origin master

echo "[deploy] 安装后端依赖..."
npm ci

echo "[deploy] 安装并构建前端..."
cd frontend
npm ci
npm run build
cd ..

echo "[deploy] 重启 pdd-manager..."
pm2 restart pdd-manager

echo "[deploy] 完成"
