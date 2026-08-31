# Use node alpine as it's a small node image
FROM node:20-alpine

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

# Pinned to match the committed pnpm-lock.yaml (lockfileVersion 6.0, written
# by pnpm 8). An unpinned `pnpm` installs whatever is latest, which can't
# read that lockfile and also refuses to run native-module build scripts
# (bcrypt, sharp, ...) without interactive approval - both break this build.
RUN npm install -g pnpm@8

# Create the directory on the node image
# where our Next.js app will live
RUN mkdir -p /app

# Set /app as the working directory
WORKDIR /app

# Copy package.json and package-lock.json
# to the /app working directory
COPY package.json /app/

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
