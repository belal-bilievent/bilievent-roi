FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=8080 DB_FILE=/data/roi.db COOKIE_SECURE=1
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node","--no-warnings","src/server.js"]
