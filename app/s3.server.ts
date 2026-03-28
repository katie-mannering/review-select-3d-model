import AWS from "aws-sdk";
import { S3Adapter } from "./adapters/s3.adapter";
import type { StorageClient } from "./ports/storage";

// Production singleton — route handlers import this.
// Tests inject their own StorageClient backed by LocalStack instead.
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "eu-north-1",
});

export const storage: StorageClient = new S3Adapter(
  s3,
  process.env.AWS_S3_BUCKET ?? "",
);
