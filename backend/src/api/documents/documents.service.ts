// Documents business logic.
// CRUD operations + Redis caching + S3 integration.
// Ownership is enforced by including userId in every DB query (findFirst).
// 404 is returned for both "doesn't exist" and "wrong owner" — don't leak existence.

import { prisma } from "../../db/prisma";
import * as cache from "../../utils/cache";
import * as s3 from "../../services/s3.service";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { AppError, NotFoundError } from "../../utils/errors";
import * as notifications from "../notifications/notifications.service";
import { emitToUser } from "../../sockets";

import type {
  ListDocumentsQuery,
  UpdateDocumentInput,
  UploadDocumentInput,
} from "./documents.validation";
import type {
  CreateDocumentResponse,
  DocumentRecord,
  DocumentResponse,
  ListDocumentsResponse,
} from "./documents.types";

const SINGLE_TTL = 600; // 10 min per spec
const LIST_TTL = 300; // 5 min per spec

// ─── Cache key helpers ─────────────────────────────────────────
function singleKey(userId: string, id: string): string {
  return `doc:${userId}:${id}`;
}

function listKey(userId: string, q: ListDocumentsQuery): string {
  return `docs:${userId}:${q.page}:${q.limit}:${q.categoryId ?? ""}:${q.search ?? ""}`;
}

// ─── S3 URL helpers ────────────────────────────────────────────
function buildS3Url(key: string): string {
  const region = env.AWS_REGION ?? "us-east-1";
  return `https://${env.AWS_S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;
}

async function notifyUser(
  userId: string,
  type: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    await notifications.create({ userId, type, title, message });
  } catch (err) {
    logger.warn("notification create failed", {
      userId,
      type,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// Used for orphan cleanup (after a failed DB insert) and for the post-delete S3 sweep.
async function deleteFromS3(s3Key: string): Promise<void> {
  try {
    await s3.deleteObject(s3Key);
  } catch (err) {
    logger.warn("s3 delete failed (file may be orphaned)", {
      key: s3Key,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// Generate a fresh presigned URL for a document. Returns null if S3 isn't configured
// so list/get still work without a usable AWS setup.
async function getDownloadUrlSafe(s3Key: string): Promise<string | null> {
  try {
    return await s3.getDownloadUrl(s3Key);
  } catch (err) {
    logger.warn("presigned URL generation failed", {
      key: s3Key,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// Convert a DB record to the public response shape:
//   - omits s3Key (internal)
//   - replaces the static s3Url with a fresh presigned URL
async function toDocumentResponse(
  doc: DocumentRecord,
): Promise<DocumentResponse> {
  return {
    id: doc.id,
    userId: doc.userId,
    name: doc.name,
    description: doc.description,
    categoryId: doc.categoryId,
    fileSize: doc.fileSize,
    fileType: doc.fileType,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    s3Url: await getDownloadUrlSafe(doc.s3Key),
  };
}

// ─── Create ────────────────────────────────────────────────────
export async function create(
  userId: string,
  input: UploadDocumentInput,
  file: Express.Multer.File,
): Promise<CreateDocumentResponse> {
  const s3Key = s3.buildS3Key(userId, file.originalname);

  // Upload to S3 first.
  try {
    await s3.uploadObject({
      key: s3Key,
      body: file.buffer,
      contentType: file.mimetype,
    });
  } catch (err) {
    logger.error("s3 upload failed", {
      key: s3Key,
      message: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(502, "Upload to storage failed", "STORAGE_UPLOAD_FAILED");
  }

  // Create the DB row. If this fails, best-effort cleanup of the S3 object
  // so we don't leave orphans.
  let doc: DocumentRecord;
  try {
    doc = await prisma.document.create({
      data: {
        userId,
        name: input.name ?? file.originalname,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        s3Key,
        s3Url: buildS3Url(s3Key),
        fileSize: file.size,
        fileType: file.mimetype,
      },
    });
  } catch (err) {
    await deleteFromS3(s3Key);
    throw err;
  }

  await cache.set(singleKey(userId, doc.id), doc, SINGLE_TTL);
  await cache.delPattern(`docs:${userId}:*`);

  // Persist notification (DB) + emit realtime to user's tabs.
  await notifyUser(userId, "document:uploaded", "Document uploaded", doc.name);
  const docResponse = await toDocumentResponse(doc);
  emitToUser(userId, "document:uploaded", docResponse);

  return { id: docResponse.id, s3Url: docResponse.s3Url };
}

// ─── List ──────────────────────────────────────────────────────
export async function list(
  userId: string,
  query: ListDocumentsQuery,
): Promise<ListDocumentsResponse> {
  const key = listKey(userId, query);

  const cached = await cache.get<{ items: DocumentRecord[]; total: number }>(key);
  if (cached) {
    const items = await Promise.all(cached.items.map(toDocumentResponse));
    return { items, total: cached.total, page: query.page, limit: query.limit };
  }

  const where = {
    userId,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? { name: { contains: query.search, mode: "insensitive" as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.document.count({ where }),
  ]);

  // Cache the metadata only — downloadUrls are computed fresh per request.
  await cache.set(key, { items, total }, LIST_TTL);

  const withUrls = await Promise.all(items.map(toDocumentResponse));
  return { items: withUrls, total, page: query.page, limit: query.limit };
}

// ─── Get one ───────────────────────────────────────────────────
export async function getById(
  userId: string,
  id: string,
): Promise<DocumentResponse> {
  const key = singleKey(userId, id);

  const cached = await cache.get<DocumentRecord>(key);
  if (cached) return toDocumentResponse(cached);

  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc) throw new NotFoundError("Document not found");

  await cache.set(key, doc, SINGLE_TTL);
  return toDocumentResponse(doc);
}

// ─── Update ────────────────────────────────────────────────────
export async function update(
  userId: string,
  id: string,
  input: UpdateDocumentInput,
): Promise<DocumentResponse> {
  // Ownership check via the userId in the where clause.
  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError("Document not found");

  const updated = await prisma.document.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    },
  });

  await cache.del(singleKey(userId, id));
  await cache.delPattern(`docs:${userId}:*`);

  await notifyUser(userId, "document:updated", "Document updated", updated.name);
  const docResponse = await toDocumentResponse(updated);
  emitToUser(userId, "document:updated", docResponse);

  return docResponse;
}

// ─── Delete ────────────────────────────────────────────────────
export async function remove(userId: string, id: string): Promise<void> {
  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError("Document not found");

  await prisma.document.delete({ where: { id } });
  await deleteFromS3(existing.s3Key);

  await cache.del(singleKey(userId, id));
  await cache.delPattern(`docs:${userId}:*`);

  await notifyUser(userId, "document:deleted", "Document deleted", existing.name);
  emitToUser(userId, "document:deleted", { id });
}
