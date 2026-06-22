FROM node:22-alpine AS deps

WORKDIR /app
COPY services/notification_service/package.json services/notification_service/tsconfig.json ./
RUN npm install

FROM deps AS build
COPY services/notification_service/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY services/notification_service/package.json ./package.json
EXPOSE 8086
CMD ["node", "dist/index.js"]

