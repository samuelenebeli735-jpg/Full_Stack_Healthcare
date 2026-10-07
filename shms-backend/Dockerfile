FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
# No audit/fund calls (they stalled builds on slow links); retry flaky fetches.
RUN npm ci --omit=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000
RUN npx prisma generate

COPY src ./src
COPY ecosystem.config.cjs ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 5000

CMD ["node", "src/server.js"]