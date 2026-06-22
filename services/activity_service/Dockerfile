FROM golang:1.23-alpine AS build

WORKDIR /src
COPY services/activity_service/go.mod ./
RUN go mod download

COPY services/activity_service ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/activity-service ./cmd/activity-service

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/activity-service /app/activity-service
EXPOSE 8082
CMD ["/app/activity-service"]
