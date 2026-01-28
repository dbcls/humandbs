#!/bin/bash
set -e

# Default configuration
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.dev.yml}"
GARAGE_SERVICE_NAME="${GARAGE_SERVICE_NAME:-garage}"
GARAGE_CONTAINER_NAME="${GARAGE_CONTAINER_NAME:-humandbs-garage}"
BUCKETS="${BUCKETS:-cms,data}"

# Usage function
usage() {
    echo "🚀 Garage S3-Compatible Storage Setup"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -r, --runtime RUNTIME    Container runtime (docker or podman) [default: docker]"
    echo "  -f, --file FILE          Compose file path [default: compose.dev.yml]"
    echo "  -s, --service NAME       Garage service name in compose [default: garage]"
    echo "  -c, --container NAME     Garage container name [default: humandbs-garage]"
    echo "  -b, --buckets LIST       Comma-separated list of buckets to create [default: cms,data]"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  CONTAINER_RUNTIME        Same as --runtime"
    echo "  COMPOSE_FILE             Same as --file"
    echo "  GARAGE_SERVICE_NAME      Same as --service"
    echo "  GARAGE_CONTAINER_NAME    Same as --container"
    echo "  BUCKETS                  Same as --buckets"
    echo ""
    echo "Examples:"
    echo "  $0                                                   # Use defaults"
    echo "  $0 --runtime podman                                 # Use Podman"
    echo "  $0 --buckets 'cms,data,images'                      # Create multiple buckets"
    echo "  CONTAINER_RUNTIME=podman $0 --buckets 'data,backup' # Use env var + option"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--runtime)
            CONTAINER_RUNTIME="$2"
            shift 2
            ;;
        -f|--file)
            COMPOSE_FILE="$2"
            shift 2
            ;;
        -s|--service)
            GARAGE_SERVICE_NAME="$2"
            shift 2
            ;;
        -c|--container)
            GARAGE_CONTAINER_NAME="$2"
            shift 2
            ;;
        -b|--buckets)
            BUCKETS="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate container runtime
if [[ "$CONTAINER_RUNTIME" != "docker" && "$CONTAINER_RUNTIME" != "podman" ]]; then
    echo "❌ Invalid container runtime: $CONTAINER_RUNTIME"
    echo "   Supported runtimes: docker, podman"
    exit 1
fi

# Check if container runtime is available
if ! command -v "$CONTAINER_RUNTIME" &> /dev/null; then
    echo "❌ $CONTAINER_RUNTIME is not installed or not in PATH"
    exit 1
fi

# Set compose command based on runtime
if [[ "$CONTAINER_RUNTIME" == "podman" ]]; then
    if command -v podman-compose &> /dev/null; then
        COMPOSE_CMD="podman-compose"
    elif command -v "$CONTAINER_RUNTIME" compose &> /dev/null; then
        COMPOSE_CMD="$CONTAINER_RUNTIME compose"
    else
        echo "❌ Neither podman-compose nor 'podman compose' found"
        exit 1
    fi
else
    if command -v "$CONTAINER_RUNTIME" compose &> /dev/null; then
        COMPOSE_CMD="$CONTAINER_RUNTIME compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
        echo "⚠️  Using legacy docker-compose command"
    else
        echo "❌ Neither 'docker compose' nor docker-compose found"
        exit 1
    fi
fi

echo "🚀 Garage S3-Compatible Storage Setup"
echo "======================================"
echo "Container Runtime: $CONTAINER_RUNTIME"
echo "Compose Command:   $COMPOSE_CMD"
echo "Compose File:      $COMPOSE_FILE"
echo "Service Name:      $GARAGE_SERVICE_NAME"
echo "Container Name:    $GARAGE_CONTAINER_NAME"
echo "Buckets to create: $BUCKETS"
echo ""

# Generate secrets
echo "🔐 Generating RPC secret..."
GARAGE_RPC_SECRET=$(openssl rand -hex 32)

# Update .env file with Garage configuration
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo "📝 Creating .env file..."
    touch "$ENV_FILE"
fi

echo "📝 Cleaning up existing Garage configuration in $ENV_FILE..."

# Show existing GARAGE variables (if any)
if grep -q "^GARAGE_" "$ENV_FILE" 2>/dev/null; then
    echo "  Found existing GARAGE variables:"
    grep "^GARAGE_" "$ENV_FILE" | sed 's/^/    /'
    echo "  These will be replaced with new configuration..."
else
    echo "  No existing GARAGE variables found"
fi

# Create data directories (only needed for bind mounts, not named volumes)
if [[ "$COMPOSE_FILE" == *"staging"* ]]; then
    echo "📁 Using named volumes for staging environment - no host directories needed"
else
    echo "📁 Creating Garage data directories..."
    mkdir -p ./garage-data/data
    mkdir -p ./garage-data/meta
fi

echo "🐳 Starting Garage service with $CONTAINER_RUNTIME..."
$COMPOSE_CMD -f "$COMPOSE_FILE" up -d "$GARAGE_SERVICE_NAME"

echo "⏳ Waiting for Garage to be ready..."
sleep 10

# Check if Garage is running
if ! $CONTAINER_RUNTIME ps --format "table {{.Names}}" | grep -q "$GARAGE_CONTAINER_NAME"; then
    echo "❌ Garage failed to start. Check logs:"
    $CONTAINER_RUNTIME logs "$GARAGE_CONTAINER_NAME"
    exit 1
fi

echo "🔧 Initializing Garage..."

# Get node ID
NODE_ID=$($CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage node id | tail -1 | cut -d'@' -f1)
echo "📋 Node ID: $NODE_ID"

# Configure layout
echo "🏗️  Configuring layout..."

# Check if layout configuration is needed
LAYOUT_INFO=$($CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage layout show 2>/dev/null || echo "")

if echo "$LAYOUT_INFO" | grep -q "dc1.*$NODE_ID"; then
    echo "  Layout already configured with this node"
elif echo "$LAYOUT_INFO" | grep -q "No cluster layout is configured"; then
    echo "  No existing layout found, creating new layout..."
    $CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage layout assign -z dc1 -c 1G "$NODE_ID"
    $CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage layout apply --version 1
else
    echo "  Existing layout found but may have issues, attempting reset..."

    # Try to reset by stopping container and clearing data, then restart
    echo "  Stopping Garage container..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" down "$GARAGE_SERVICE_NAME"

    echo "  Clearing layout data..."
    if [[ "$COMPOSE_FILE" == *"staging"* ]]; then
        echo "    Using named volumes - clearing via container restart"
    else
        rm -rf ./garage-data/meta/*
    fi

    echo "  Restarting Garage..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d "$GARAGE_SERVICE_NAME"

    echo "  Waiting for restart..."
    sleep 10

    # Get new node ID after restart
    NODE_ID=$($CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage node id | tail -1 | cut -d'@' -f1)
    echo "  New Node ID: $NODE_ID"

    echo "  Creating fresh layout..."
    $CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage layout assign -z dc1 -c 1G "$NODE_ID"
    $CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage layout apply --version 1
fi

# Create application key
echo "🔑 Creating application key..."
KEY_OUTPUT=$($CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage key create humandbs-app)
ACCESS_KEY=$(echo "$KEY_OUTPUT" | grep "Key ID:" | awk '{print $3}')
SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key:" | awk '{print $3}')

echo "✅ Keys created:"
echo "  Access Key: $ACCESS_KEY"
echo "  Secret Key: $SECRET_KEY"

# Create buckets
echo "🪣 Creating buckets..."
IFS=',' read -ra BUCKET_ARRAY <<< "$BUCKETS"
CREATED_BUCKETS=()

for bucket in "${BUCKET_ARRAY[@]}"; do
    # Trim whitespace
    bucket=$(echo "$bucket" | xargs)

    if [[ -z "$bucket" ]]; then
        continue
    fi

    echo "  Creating bucket: $bucket"

    if $CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage bucket create "$bucket" > /dev/null 2>&1; then
        echo "  ✅ Bucket '$bucket' created"
    else
        echo "  ⚠️  Bucket '$bucket' may already exist"
    fi

    # Set permissions
    $CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage bucket allow "$bucket" --read --write --key humandbs-app
    echo "  🔐 Permissions set for '$bucket'"

    # Enable website mode
    $CONTAINER_RUNTIME exec "$GARAGE_CONTAINER_NAME" /garage bucket website --allow "$bucket"
    echo "  🌐 Website mode enabled for '$bucket'"

    CREATED_BUCKETS+=("$bucket")
done

# Update .env with access keys and configuration
echo "📝 Adding new Garage configuration to .env..."

# Remove ALL existing GARAGE_* variables and comments (create backup)
sed -i.bak '/^GARAGE_[A-Z_]*=/d; /^# Garage S3-compatible storage configuration$/d; /^# Bucket-specific environment variables$/d' "$ENV_FILE"

# Use first bucket as default
FIRST_BUCKET="${CREATED_BUCKETS[0]}"

# Add all Garage configuration at once
{
    echo ""
    echo "# Garage S3-compatible storage configuration"
    echo "GARAGE_RPC_SECRET=$GARAGE_RPC_SECRET"
    echo "GARAGE_ACCESS_KEY=$ACCESS_KEY"
    echo "GARAGE_SECRET_KEY=$SECRET_KEY"
    echo "GARAGE_ENDPOINT=http://$GARAGE_SERVICE_NAME:3900"
    echo "GARAGE_REGION=garage"

    echo ""
    echo "# Bucket-specific environment variables"
    for bucket in "${CREATED_BUCKETS[@]}"; do
        bucket_var=$(echo "$bucket" | tr '[:lower:]-' '[:upper:]_')
        echo "GARAGE_BUCKET_$bucket_var=$bucket"
    done
} >> "$ENV_FILE"

echo "📝 Added bucket-specific environment variables:"
for bucket in "${CREATED_BUCKETS[@]}"; do
    bucket_var=$(echo "$bucket" | tr '[:lower:]-' '[:upper:]_')
    echo "  GARAGE_BUCKET_$bucket_var=$bucket"
done

echo ""
echo "🎉 Garage setup complete!"
echo ""
echo "📋 Configuration Summary:"
echo "  • Container Runtime: $CONTAINER_RUNTIME"
echo "  • S3 API Endpoint: http://$GARAGE_SERVICE_NAME:3900 (internal) | http://localhost:3900 (external)"
echo "  • Admin API: http://localhost:3902"
echo "  • Access Key: $ACCESS_KEY"
echo "  • Secret Key: $SECRET_KEY"
echo "  • Default Bucket: $FIRST_BUCKET"
echo "  • All Buckets: $(IFS=', '; echo "${CREATED_BUCKETS[*]}")"
echo "  • Region: garage"
echo ""

# Show bucket-specific environment variables
echo "📦 Bucket Environment Variables:"
for bucket in "${CREATED_BUCKETS[@]}"; do
    bucket_var=$(echo "$bucket" | tr '[:lower:]-' '[:upper:]_')
    echo "  • GARAGE_BUCKET_$bucket_var=$bucket"
done
echo ""

echo "🧪 Test your setup with:"
echo "  $CONTAINER_RUNTIME exec $GARAGE_CONTAINER_NAME /garage status"
if command -v aws &> /dev/null; then
    echo "  AWS_ACCESS_KEY_ID=$ACCESS_KEY AWS_SECRET_ACCESS_KEY=$SECRET_KEY aws --endpoint-url=http://localhost:3900 --region=garage s3 ls"
fi
echo ""
echo "🔧 Your .env file has been updated with all necessary variables."
echo "   You can now use these in your application!"
echo ""
echo "📄 Current Garage configuration in .env:"
grep "^GARAGE_" "$ENV_FILE" | sed 's/^/  /'
echo ""
echo "💡 Use GARAGE_BUCKET_CMS, GARAGE_BUCKET_FILES, etc. for specific buckets in your code."
