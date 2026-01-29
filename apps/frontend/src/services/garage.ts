import { S3Client, type S3Options } from "bun";

const credentials: S3Options = {
  accessKeyId: process.env.GARAGE_ACCESS_KEY,
  secretAccessKey: process.env.GARAGE_SECRET_KEY,
  region: process.env.GARAGE_REGION,
  endpoint: process.env.GARAGE_ENDPOINT,
  bucket: process.env.GARAGE_BUCKET_CMS,
};

const clientCms = new S3Client(credentials);

export { clientCms, credentials };
