# Garage Setup Scripts

This directory contains scripts for setting up and managing Garage S3-compatible storage.

## Scripts

### `setup-garage.sh`

A comprehensive script to set up Garage from scratch with configurable options.

## Usage

### Basic Setup (Docker)

```bash
./scripts/setup-garage.sh
```

This will:

- Use Docker as the container runtime
- Use `compose.dev.yml` as the compose file
- Create two default buckets: `cms` and `data`
- Generate all necessary secrets and keys
- Update your `.env` file with configuration

### Using Podman

```bash
./scripts/setup-garage.sh --runtime podman
```

Or set the environment variable:

```bash
CONTAINER_RUNTIME=podman ./scripts/setup-garage.sh
```

### Creating Multiple Buckets

```bash
./scripts/setup-garage.sh --buckets "cms,data,images,documents,backups"
```

This creates five buckets:

- `cms`
- `data`
- `images`
- `documents`
- `backups`

### Custom Configuration

```bash
./scripts/setup-garage.sh \
  --runtime podman \
  --file compose.prod.yml \
  --service storage \
  --container my-garage \
  --buckets "data,media"
```

### Environment Variables

You can also configure the script using environment variables:

```bash
export CONTAINER_RUNTIME=podman
export COMPOSE_FILE=compose.staging.yml
export GARAGE_SERVICE_NAME=storage
export GARAGE_CONTAINER_NAME=my-garage
export BUCKETS="uploads,downloads"

./scripts/setup-garage.sh
```

## Command Line Options

| Option            | Environment Variable    | Default           | Description                          |
| ----------------- | ----------------------- | ----------------- | ------------------------------------ |
| `-r, --runtime`   | `CONTAINER_RUNTIME`     | `docker`          | Container runtime (docker or podman) |
| `-f, --file`      | `COMPOSE_FILE`          | `compose.dev.yml` | Path to compose file                 |
| `-s, --service`   | `GARAGE_SERVICE_NAME`   | `garage`          | Service name in compose file         |
| `-c, --container` | `GARAGE_CONTAINER_NAME` | `humandbs-garage` | Container name                       |
| `-b, --buckets`   | `BUCKETS`               | `cms,data`        | Comma-separated list of buckets      |
| `-h, --help`      |                         |                   | Show help message                    |

## What the Script Does

1. **Validates** container runtime and dependencies
2. **Generates** secure RPC secret (32-byte hex)
3. **Creates** data directories for Garage
4. **Starts** Garage container using specified runtime
5. **Initializes** Garage cluster layout
6. **Creates** application access keys
7. **Creates** specified buckets with full permissions
8. **Enables** website mode for public file serving
9. **Updates** `.env` file with all configuration

## Generated Configuration

After running, your `.env` will contain:

```env
GARAGE_RPC_SECRET=<generated-32-byte-hex>
GARAGE_ACCESS_KEY=<generated-access-key>
GARAGE_SECRET_KEY=<generated-secret-key>
GARAGE_ENDPOINT=http://garage:3900
GARAGE_REGION=garage
GARAGE_BUCKET_CMS=cms
GARAGE_BUCKET_DATA=data
```

### Bucket-Specific Environment Variables

For each bucket created, the script generates a specific environment variable:

- **Bucket name formatting**: Converts to uppercase and replaces hyphens with underscores
- **Variable format**: `GARAGE_BUCKET_<BUCKET_NAME>`

Examples:

- `cms` bucket → `GARAGE_BUCKET_CMS=cms`
- `data` bucket → `GARAGE_BUCKET_DATA=data`
- `user-uploads` bucket → `GARAGE_BUCKET_USER_UPLOADS=user-uploads`
- `static-assets` bucket → `GARAGE_BUCKET_STATIC_ASSETS=static-assets`

## Testing Your Setup

### Check Garage Status

```bash
# With Docker
docker exec humandbs-garage /garage status

# With Podman
podman exec humandbs-garage /garage status
```

### List Buckets

```bash
# With Docker
docker exec humandbs-garage /garage bucket list

# With Podman
podman exec humandbs-garage /garage bucket list
```

### AWS CLI Test

If you have AWS CLI installed:

```bash
AWS_ACCESS_KEY_ID=<your-access-key> \
AWS_SECRET_ACCESS_KEY=<your-secret-key> \
aws --endpoint-url=http://localhost:3900 s3 ls
```

### Daily Usage

Once set up, you only need to start/stop Garage:

```bash
# Start
docker compose -f compose.dev.yml up -d garage

# Stop
docker compose -f compose.dev.yml down garage

# Or with Podman
podman-compose -f compose.dev.yml up -d garage
```

## Troubleshooting

### Container Not Starting

Check logs:

```bash
docker logs humandbs-garage
# or
podman logs humandbs-garage
```

### Connection Issues

Ensure the container is running and ports are accessible:

```bash
# Check if container is running
docker ps | grep garage
# or
podman ps | grep garage

# Test API endpoint
curl http://localhost:3902/health
```

### Re-running Setup

If you need to completely reset:

1. Stop and remove containers:

   ```bash
   docker compose -f compose.dev.yml down garage
   docker rm humandbs-garage
   ```

2. Remove data (⚠️ **This deletes all data**):

   ```bash
   rm -rf ./data/garage
   ```

3. Clean up .env (optional):

   ```bash
   sed -i '/^GARAGE_/d' .env
   ```

4. Re-run setup:
   ```bash
   ./scripts/setup-garage.sh
   ```

## Integration with Applications

Use the generated environment variables in your application:

```javascript
// Next.js example
const s3Client = new S3Client({
  endpoint: process.env.GARAGE_ENDPOINT,
  region: process.env.GARAGE_REGION,
  credentials: {
    accessKeyId: process.env.GARAGE_ACCESS_KEY,
    secretAccessKey: process.env.GARAGE_SECRET_KEY,
  },
});

// Upload to CMS bucket
await s3Client.send(
  new PutObjectCommand({
    Bucket: process.env.GARAGE_BUCKET_CMS, // CMS files
    Key: "my-file.txt",
    Body: "Hello world!",
  }),
);

// Upload to specific buckets
await s3Client.send(
  new PutObjectCommand({
    Bucket: process.env.GARAGE_BUCKET_CMS, // CMS files
    Key: "blog-image.jpg",
    Body: imageBuffer,
  }),
);

await s3Client.send(
  new PutObjectCommand({
    Bucket: process.env.GARAGE_BUCKET_DATA, // User files
    Key: "user-upload.pdf",
    Body: documentBuffer,
  }),
);
```

### Application Usage Patterns

```javascript
// CMS file uploads
const uploadCMSFile = async (file) => {
  return await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.GARAGE_BUCKET_CMS,
      Key: `cms/${Date.now()}-${file.name}`,
      Body: file.buffer,
    }),
  );
};

// User file uploads
const uploadUserFile = async (userId, file) => {
  return await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.GARAGE_BUCKET_DATA,
      Key: `users/${userId}/${file.name}`,
      Body: file.buffer,
    }),
  );
};
```
