FROM node:22-alpine
ARG BUILD_SHA=development
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data RUNTIME_DIR=/app/runtime BUILD_SHA=$BUILD_SHA CHROMIUM_PATH=/usr/bin/chromium TMPDIR=/app/runtime XDG_CACHE_HOME=/app/runtime/cache XDG_CONFIG_HOME=/app/runtime/config
RUN apk add --no-cache git chromium
WORKDIR /app
COPY --chown=node:node package.json server.mjs launcher.mjs ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node public ./public
COPY --chown=node:node lib ./lib
COPY --chown=node:node scripts/browser-smoke.mjs ./scripts/browser-smoke.mjs
RUN mkdir -p /app/data /app/runtime && chown node:node /app/data /app/runtime
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "launcher.mjs"]
