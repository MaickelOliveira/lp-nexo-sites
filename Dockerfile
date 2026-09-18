FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
COPY .openai ./.openai
COPY public ./public
COPY scripts ./scripts
COPY server ./server
COPY worker ./worker

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/api/leads/config || exit 1

CMD ["node", "dist/server/node-server.mjs"]
