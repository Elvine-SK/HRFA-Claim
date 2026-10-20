# Build from the repository root: docker build -f apps/api/Dockerfile --secret id=npm_token,env=NODE_AUTH_TOKEN .
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN \
  echo "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" > "$HOME/.npmrc" && pnpm install --frozen-lockfile && rm "$HOME/.npmrc"
RUN mkdir -p /app/apps/api/storage && chown -R node:node /app/apps/api/storage
ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
EXPOSE 3001
CMD ["pnpm", "run", "start"]
