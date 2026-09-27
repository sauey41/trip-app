FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node lib ./lib
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
