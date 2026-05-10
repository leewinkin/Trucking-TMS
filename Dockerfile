FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./

RUN npm install --omit=dev

COPY server.js ./
COPY store.js ./
COPY public ./public
COPY docs ./docs
COPY README.md ./
COPY .gitignore ./
COPY .env.example ./

EXPOSE 3000

CMD ["node", "server.js"]
