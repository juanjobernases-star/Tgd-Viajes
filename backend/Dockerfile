FROM node:22-alpine

WORKDIR /app
# Las dependencias en capa aparte: cambiar el codigo no reinstala node_modules.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY src ./src

# Sin privilegios: la imagen de node ya trae el usuario 'node'.
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3010
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3010/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
