FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Set environment
ENV PORT=4000
ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "src/index.js"]
