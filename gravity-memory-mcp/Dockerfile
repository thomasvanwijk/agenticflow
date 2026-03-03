FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Vault is mounted at runtime
VOLUME ["/vault"]

EXPOSE 3001

CMD ["node", "dist/index.js"]
