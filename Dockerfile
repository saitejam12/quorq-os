# QuorqOS production image — Node SSR server for AWS (ECS Fargate / App Runner / EC2).
# See docs/deploy-aws.md.

# ---- build stage: install all deps and produce dist/ ----
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- runtime stage: production deps + built output only ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY server.js ./server.js
# For full RDS TLS verification (docs/deploy-aws.md §A.6): add a certs/ dir with
# the RDS CA bundle, uncomment the next line, and set RDS_CA_PATH in the task.
# COPY certs ./certs
EXPOSE 3000
CMD ["node", "server.js"]
