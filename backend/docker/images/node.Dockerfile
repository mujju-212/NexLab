# nexlab/node:24
# Covers: JavaScript (Node 24 LTS) + TypeScript (tsc 7 — native Go compiler)
FROM node:24-alpine

LABEL maintainer="NexLab" \
      nexlab.image="node" \
      nexlab.version="24"

# Install TypeScript 7 (native Go compiler — fast per-request compile)
RUN npm install -g typescript@7 --no-fund --no-audit && \
    node --version && tsc --version
