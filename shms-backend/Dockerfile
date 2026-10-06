FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY src ./src
COPY ecosystem.config.cjs ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 5000

CMD ["node", "src/server.js"]