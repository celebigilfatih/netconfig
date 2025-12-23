FROM node:20-alpine AS deps
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS dev
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
EXPOSE 3001
CMD ["npm", "run", "dev"]

FROM node:20-alpine AS runner
WORKDIR /usr/src/app
RUN apk add --no-cache curl
ENV NODE_ENV=production
COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/src/infra/db/schema.sql ./src/infra/db/schema.sql
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s CMD curl -fs http://localhost:3001/health || exit 1
CMD ["node", "dist/server.js"]
