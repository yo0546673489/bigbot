FROM golang:1.25-alpine AS builder

# Install build dependencies for whatsmeow (needs CGO for sqlite)
RUN apk add --no-cache gcc musl-dev sqlite-dev git ca-certificates

WORKDIR /app

# Copy go.mod first for caching
COPY go.mod ./

# Download dependencies (will also create go.sum)
RUN go mod download || true

# Copy source
COPY . .

# Update whatsmeow to latest and build
RUN go get go.mau.fi/whatsmeow@latest && \
    go mod tidy && \
    CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/main.go

FROM alpine:3.19
RUN apk add --no-cache ca-certificates sqlite-libs tzdata
ENV TZ=Asia/Jerusalem

WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/internal/matching/data ./internal/matching/data

EXPOSE 7879
CMD ["./server"]
