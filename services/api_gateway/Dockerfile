FROM node:22-alpine AS deps

WORKDIR /app
COPY services/api_gateway/package.json services/api_gateway/tsconfig.json ./
RUN npm install

FROM deps AS build
COPY services/api_gateway/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY services/api_gateway/package.json ./package.json
EXPOSE 8080
CMD ["node", "dist/index.js"]

