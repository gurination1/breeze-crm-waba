FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5055
ENV PORT=5055
CMD ["node", "server.js"]
