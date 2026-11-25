# Stage 1: Build React 19 + Rsbuild frontend
FROM node:22-alpine AS frontend
WORKDIR /app/web
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY web/package.json web/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY web/ ./
RUN pnpm build

# Stage 2: Build Go static binary with embedded frontend
FROM golang:1.26-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN rm -rf webdist/dist && mkdir -p webdist/dist
COPY --from=frontend /app/web/dist/ ./webdist/dist/
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /sub-ui .

# Stage 3: Minimal runtime image
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend /sub-ui /usr/local/bin/sub-ui
VOLUME ["/app/data"]
EXPOSE 8080
ENV SUBUI_HOST=0.0.0.0 \
    SUBUI_PORT=8080 \
    SUBUI_DB_DRIVER=sqlite \
    SUBUI_DB_DSN=/app/data/sub-ui.db \
    GOMEMLIMIT=160MiB
ENTRYPOINT ["/usr/local/bin/sub-ui"]
