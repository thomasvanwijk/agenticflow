FROM node:24-alpine

WORKDIR /app

# Install dependencies for bridge and Atlassian tools
COPY package*.json ./
RUN npm install
RUN npm install -g mcp-atlassian jsdom

COPY . .

# Bridge listens on 3000
EXPOSE 3000

CMD ["node", "index.js"]
