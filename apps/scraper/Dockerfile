# Збірка й тести: docker build --target test apps/scraper
FROM rust:1-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY tests ./tests
RUN cargo build --release

FROM build AS test
RUN cargo test --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/scraper_worker /usr/local/bin/scraper_worker
ENTRYPOINT ["scraper_worker"]
