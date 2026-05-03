// AWS S3 helpers used by the documents module.
//   uploadObject     - put a file buffer into S3 (called from the upload controller)
//   deleteObject     - remove a file from S3 (called from the delete controller)
//   getDownloadUrl   - presigned GET URL, time-limited read access for the frontend

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

import { env } from "../config/env";

const s3 = new S3Client({
  region: env.AWS_REGION ?? "us-east-1",
});

function requireBucket(): string {
  if (!env.AWS_S3_BUCKET) {
    throw new Error(
      "AWS_S3_BUCKET is not configured. Fill in your S3 settings in .env",
    );
  }
  return env.AWS_S3_BUCKET;
}

// Build a unique S3 key. Folder per user keeps the bucket browseable in the AWS console.
export function buildS3Key(userId: string, originalName: string): string {
  return `documents/${userId}/${randomUUID()}-${originalName}`;
}

export async function uploadObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: requireBucket(),
      Key: key,
    }),
  );
}

// Returns a time-limited URL the frontend can use to view/download the file directly from S3.
// Default 15min expiry — short enough to limit damage if leaked.
export async function getDownloadUrl(
  key: string,
  expiresInSeconds = 900,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: requireBucket(),
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
}
