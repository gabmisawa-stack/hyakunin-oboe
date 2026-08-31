#!/bin/sh
# 文化ネットの五色分類ページを取得する（照合用）。ブラウザUAが要る。
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
mkdir -p tools/ref
for s in a-blue b-pink c-yellow d-green e-orange; do
  curl -sS -A "$UA" "https://www.bunkanet.jp/manabi/hyakunin-isshu-karuta/gosyoku/$s/" -o "tools/ref/bunkanet_$s.html"
done
