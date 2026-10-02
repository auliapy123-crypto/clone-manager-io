# Use the same Node runtime as the backend.
FROM node:24-alpine
WORKDIR /app
RUN corepack enable && corepack install --global pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL
ARG VITE_APP_NAME
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
# Generate the gitignored route tree before the build script's tsc step.
RUN pnpm exec vite build && pnpm build
EXPOSE 3000
CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "3000"]
