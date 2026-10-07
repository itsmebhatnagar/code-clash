FROM node:20-bookworm-slim

# Install necessary compilers and runtimes for the code judge
RUN apt-get update && apt-get install -y \
    python3 \
    gcc \
    g++ \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and prisma schema
COPY . .

# Generate Prisma client and build typescript
RUN npx prisma generate
RUN npm run build

# Start both the API and the Worker concurrently
CMD ["bash", "-c", "npm run db:deploy && node dist/worker.js & node dist/index.js & wait -n"]
