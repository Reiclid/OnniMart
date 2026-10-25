# osmium-tool для вибірки магазинів з вивантажень OpenStreetMap (Geofabrik).
# docker compose run --rm osm <url .osm.pbf> <назва>  → data/osm/<назва>.shops.geojsonseq
FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends osmium-tool curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY osm-shops.sh /usr/local/bin/osm-shops
RUN chmod +x /usr/local/bin/osm-shops
WORKDIR /data
ENTRYPOINT ["osm-shops"]
