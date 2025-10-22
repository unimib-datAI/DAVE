# Use node alpine as it's a small node image
FROM node:alpine

RUN npm install -g pnpm

# Create the directory on the node image
# where our Next.js app will live
RUN mkdir -p /app

# Set /app as the working directory
WORKDIR /app

# Copy package.json and package-lock.json
# to the /app working directory
COPY package.json pnpm-lock.yaml /app/

# Install dependencies in /app
RUN pnpm config set auto-install-peers true
RUN pnpm install

# Copy source code (excluding node_modules)
COPY src /app/src
COPY .babelrc /app/
COPY _files /app/_files
COPY _collections /app/_collections

# Ensure port 3000 is accessible to our system
EXPOSE 3001

# Run yarn dev, as we would via the command line
CMD ["pnpm", "dev"]
