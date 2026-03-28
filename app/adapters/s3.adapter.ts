import AWS from "aws-sdk";
import type { StorageClient } from "../ports/storage";

/**
 * AWS S3-backed StorageClient.
 *
 * Constructed with a pre-configured AWS.S3 instance and a bucket name so that
 * the same class works in production (real AWS) and in tests (LocalStack).
 * The caller is responsible for wiring the right endpoint and credentials.
 */
export class S3Adapter implements StorageClient {
  private readonly s3: AWS.S3;
  private readonly bucket: string;

  constructor(s3: AWS.S3, bucket: string) {
    this.s3 = s3;
    this.bucket = bucket;
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return this.s3.getSignedUrlPromise("getObject", {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn,
    });
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.s3
      .putObject({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
      .promise();
  }
}
