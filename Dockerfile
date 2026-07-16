# Use Node.js LTS version
FROM node:latest

# Install ffmpeg for video thumbnail generation
RUN apt-get update && apt-get install -y \
ffmpeg \
libnss3 \
libdbus-1-3 \
libatk1.0-0 \
libgbm-dev \
libasound2 \
libxrandr2 \
libxkbcommon-dev \
libxfixes3 \
libxcomposite1 \
libxdamage1 \
libatk-bridge2.0-0 \
libpango-1.0-0 \
libcairo2 \
libcups2

RUN rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code (includes committed remotion-bundle/ for storyboard renders)
COPY . .

# Fail the image build if the Remotion webpack bundle is missing from the repo
RUN test -f remotion-bundle/index.html || (echo "Missing remotion-bundle/ in the build context. In genny run npm run remotion:bundle, then in gennyapi run npm run remotion:sync and commit remotion-bundle/." && exit 1)

# Build the application
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Local filesystem path — Remotion serves it on localhost (secure context for WebCodecs)
ENV REMOTION_SERVE_URL=/app/remotion-bundle

# Expose port
EXPOSE 3000

# Health check - verifies the API is responding
# Docker will automatically restart unhealthy containers in orchestrated environments
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]
