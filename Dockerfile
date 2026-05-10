FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_FILE_PATH=/data/local-db.json

RUN mkdir -p /data

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY docs ./docs
COPY README.md ./
COPY .gitignore ./
COPY .env.example ./

EXPOSE 3000

CMD ["node", "server.js"]
