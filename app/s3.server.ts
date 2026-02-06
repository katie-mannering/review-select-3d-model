import AWS from "aws-sdk";

// Configure AWS SDK
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "eu-north-1",
});

export interface ModelConfig {
  key: string;
  bucket?: string;
}

/**
 * Generate a presigned URL for an S3 object
 * @param key - The S3 object key (path within the bucket)
 * @param bucket - Optional bucket name (defaults to env variable)
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Presigned URL string
 */
export async function getPresignedUrl(
  key: string,
  bucket?: string,
  expiresIn: number = 3600,
): Promise<string> {
  const bucketName = bucket || process.env.AWS_S3_BUCKET;

  if (!bucketName) {
    throw new Error("AWS_S3_BUCKET environment variable is not set");
  }

  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: expiresIn,
  };

  try {
    const url = await s3.getSignedUrlPromise("getObject", params);
    return url;
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw error;
  }
}

/**
 * Generate presigned URLs for multiple models
 * @param models - Array of model configurations
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Array of presigned URLs
 */
export async function getPresignedUrls(
  models: ModelConfig[],
  expiresIn: number = 3600,
): Promise<string[]> {
  return Promise.all(
    models.map((model) => getPresignedUrl(model.key, model.bucket, expiresIn)),
  );
}