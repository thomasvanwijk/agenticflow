FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Vault is mounted at runtime
VOLUME ["/vault"]

CMD ["node", "dist/index.js"]
