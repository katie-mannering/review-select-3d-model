export interface StorageClient {
  getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
}
