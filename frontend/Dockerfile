# Debian-based (glibc), not alpine: native modules with prebuilt binaries
# (sharp, bcrypt) are built for glibc's dynamic linker.
FROM node:20-slim

ARG ACCESS_USERNAME
ARG ACCESS_PASSWORD
ARG API_BASE_URI
ARG API_USERNAME
ARG API_PASSWORD
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL
ARG NEXT_PUBLIC_BASE_PATH
ARG KEYCLOAK_ID
ARG KEYCLOAK_SECRET
ARG KEYCLOAK_ISSUER
ARG KEYCLOAK_ISSUER_INTERNAL
ARG KEYCLOAK_ISSUER_EXTERNAL
ARG API_LLM
ARG API_INDEXER
ARG VARIANT
ARG TEXT_GENERATION
ARG ELASTIC_INDEX
ARG NEXT_PUBLIC_FULL_PATH
ARG NEXT_PUBLIC_LLM_NAME
ARG USE_AUTH
ARG NEXT_PUBLIC_USE_AUTH

# pnpm 12 matches the committed pnpm-lock.yaml (lockfileVersion 9.0). Which
# dependencies may run install scripts (bcrypt, ...) is declared in
# pnpm-workspace.yaml, so the install needs no interactive approval.
RUN npm install -g pnpm@12

# Create the directory on the node image
# where our Next.js app will live
RUN mkdir -p /app

# Set /app as the working directory
WORKDIR /app

# Copy package.json and package-lock.json
# to the /app working directory
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/

# Install dependencies in /app
RUN pnpm install

# Copy the rest of our Next.js folder into /app
COPY . /app

# Ensure port 3000 is accessible to our system
EXPOSE 3000

# Build
RUN pnpm build

# Run yarn dev, as we would via the command line


CMD ["pnpm", "start"]
