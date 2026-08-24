FROM debian:bookworm-slim AS pikafish

ARG PIKAFISH_VERSION=2026-01-02
ARG PIKAFISH_ARCHIVE_SHA256=84257063905615919fb4ee6a70273a94843bb6ec04c45e3ac706098838bc1a49
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl p7zip-full \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL "https://github.com/official-pikafish/Pikafish/releases/download/Pikafish-${PIKAFISH_VERSION}/Pikafish.${PIKAFISH_VERSION}.7z" -o /tmp/pikafish.7z \
  && echo "${PIKAFISH_ARCHIVE_SHA256}  /tmp/pikafish.7z" | sha256sum -c - \
  && mkdir -p /opt/pikafish \
  && 7z e /tmp/pikafish.7z -o/opt/pikafish Linux/pikafish-sse41-popcnt pikafish.nnue Copying.txt NNUE-License.md README.md \
  && chmod 0755 /opt/pikafish/pikafish-sse41-popcnt

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

COPY --from=pikafish /opt/pikafish /opt/pikafish

ENV NODE_ENV=production
ENV PORT=8787
ENV PIKAFISH_PATH=/opt/pikafish/pikafish-sse41-popcnt
ENV PIKAFISH_WORKDIR=/opt/pikafish

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
