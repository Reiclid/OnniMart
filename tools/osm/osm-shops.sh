#!/bin/sh
# Одна країна: завантажити .osm.pbf → лишити продуктові магазини → GeoJSON → видалити .pbf.
# Повне вивантаження на диску живе лише під час обробки (до 12 ГБ для США).
# --retry-all-errors: Geofabrik інколи обриває з'єднання (curl 56), а його curl за замовчуванням не повторює.
#   osm-shops <url> <назва>
set -eu
url="$1"
name="$2"
cd /data

echo "[$name] завантаження $url"
curl -fsSL --retry 10 --retry-delay 60 --retry-all-errors -A "OnniMartBot/0.1 (diploma project; reiclid@gmail.com)" -o "$name.pbf.part" "$url"
mv "$name.pbf.part" "$name.pbf"

echo "[$name] вибірка магазинів"
# Точки й будівлі (way/relation) з тегом shop продуктових типів; другий прохід додає вузли будівель
osmium tags-filter "$name.pbf" nwr/shop=supermarket,convenience,hypermarket,wholesale,discount \
  -o "$name.shops.pbf" --overwrite
# Дата даних (найсвіжіша правка у вивантаженні) — для звіту про свіжість
osmium fileinfo -g header.option.osmosis_replication_timestamp "$name.pbf" > "$name.timestamp" || true
rm -f "$name.pbf"

osmium export "$name.shops.pbf" -f geojsonseq --format-option print_record_separator=false \
  --geometry-types=point,polygon -a type,id -o "$name.shops.geojsonseq" --overwrite
echo "[$name] готово: $(wc -l < "$name.shops.geojsonseq") магазинів"
