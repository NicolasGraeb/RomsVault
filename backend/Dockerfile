FROM --platform=$BUILDPLATFORM golang:1.26.3-alpine AS build
ARG TARGETOS
ARG TARGETARCH
ENV GOMEMLIMIT=768MiB GOMAXPROCS=2
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -p 2 -trimpath -ldflags="-s -w" -o /romvault .
FROM alpine:3.23
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
COPY --from=build /romvault /usr/local/bin/romvault
USER app
EXPOSE 8001
ENTRYPOINT ["romvault"]
