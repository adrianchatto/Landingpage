FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache git openssh-client

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY data ./data

ENV HOST=0.0.0.0
ENV PORT=3000
ENV GIT_SYNC_INTERVAL_MINUTES=15

EXPOSE 3000

CMD ["node", "server.js"]
