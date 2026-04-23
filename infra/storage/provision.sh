#!/bin/sh
set -eu

ALIAS="myminio"
ENDPOINT="$STORAGE_SERVICE_ENDPOINT"

echo "Connecting to MinIO at $ENDPOINT with alias '$ALIAS'..."

# Connect to MinIO
mc alias set "$ALIAS" "$ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# Create buckets if they don't exist
mc mb "$ALIAS/media-public" --ignore-existing
mc mb "$ALIAS/media-private" --ignore-existing
mc mb "$ALIAS/loki-chunks" --ignore-existing
mc mb "$ALIAS/chat-archive" --ignore-existing

echo "Setup complete. Buckets are ready."
