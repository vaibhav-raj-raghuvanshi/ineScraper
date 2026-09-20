FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev
RUN npx playwright install chromium

# Copy application files
COPY . .

# Set environment
ENV PORT=4000
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 4000

CMD ["node", "src/index.js"]
