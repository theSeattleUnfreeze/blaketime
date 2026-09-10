FROM node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f AS ui-build
WORKDIR /source
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --registry=https://registry.npmjs.org
RUN npm run build --workspace @blaketime/ui

FROM rust:1.94.1-bookworm@sha256:6ae102bdbf528294bc79ad6e1fae682f6f7c2a6e6621506ba959f9685b308a55 AS server-build
RUN apt-get update && apt-get install -y --no-install-recommends cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /source
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
ARG BLAKETIME_COMMIT=development
RUN cargo run --locked --quiet -p blaketime-core --bin export_types > /tmp/contracts.ts && cmp /tmp/contracts.ts packages/contracts/src/generated.ts
RUN BLAKETIME_COMMIT=$BLAKETIME_COMMIT cargo build --release --locked -p blaketime-web

FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home blaketime
WORKDIR /app
COPY --from=server-build /source/target/release/blaketime-web /usr/local/bin/blaketime-web
COPY LICENSE /app/LICENSE
ARG BLAKETIME_COMMIT=development
ARG BLAKETIME_VERSION=development
ARG BLAKETIME_SOURCE
LABEL org.opencontainers.image.title="Blaketime" org.opencontainers.image.licenses="MIT" org.opencontainers.image.revision=$BLAKETIME_COMMIT org.opencontainers.image.version=$BLAKETIME_VERSION org.opencontainers.image.source=$BLAKETIME_SOURCE
ENV BLAKETIME_BIND=0.0.0.0:3000 BLAKETIME_ASSETS=/app/ui
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD curl --noproxy '*' --fail --silent http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/blaketime-web"]

FROM runtime AS release
COPY dist/ui /app/ui

FROM runtime AS local
COPY --from=ui-build /source/dist/ui /app/ui
