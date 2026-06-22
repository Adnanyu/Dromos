FROM node:22-alpine AS deps

WORKDIR /app
COPY services/user_service/package.json services/user_service/tsconfig.json ./
RUN npm install

FROM deps AS build
COPY services/user_service/src ./src
COPY services/user_service/sql ./sql
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY services/user_service/sql ./sql
COPY services/user_service/package.json ./package.json
EXPOSE 8084
CMD ["node", "dist/index.js"]

