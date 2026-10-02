# package.json has no engines; match the local Node 24 runtime.
FROM node:24-alpine
WORKDIR /app
RUN corepack enable && corepack install --global pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 4000
CMD ["pnpm", "dev"]
