#!/bin/sh
# Cloudflare Pages（fudacchi.pages.dev）へ公開する。
#   ./tools/deploy-cf.sh
#
# GitHubを経由しないので、アカウント名も本名もどこにも出ない。
# 認証は naosenseiai@gmail.com のCloudflareアカウント。
# 切れたら `npx wrangler login` をユーザー自身が実行する（認証情報は扱わない）。
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
cp index.html style.css app.js srs.js sw.js manifest.json dist/
cp -R icons data audio dist/
echo "配置 $(find dist -type f | wc -l | tr -d ' ') ファイル / $(du -sh dist | cut -f1)"
npx wrangler pages deploy dist --project-name fudacchi --branch main --commit-dirty=true
echo "→ https://fudacchi.pages.dev/"
