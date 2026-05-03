// Module-local types for the documents feature.

export type DocumentRecord = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  s3Key: string;
  s3Url: string; // static URL (informational; private bucket means it's not usable as-is)
  fileSize: number;
  fileType: string;
  createdAt: Date;
  updatedAt: Date;
};

// Public — what we return to clients on GET / PUT / list-items.
// `s3Url` here is the PRESIGNED URL (the one the client can actually use).
// `s3Key` is omitted (internal).
export type DocumentResponse = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  fileSize: number;
  fileType: string;
  createdAt: Date;
  updatedAt: Date;
  s3Url: string | null; // null if S3 isn't configured
};

// Minimal — what we return on POST /upload per spec ("Return document ID and S3 URL").
export type CreateDocumentResponse = {
  id: string;
  s3Url: string | null;
};

export type ListDocumentsResponse = {
  items: DocumentResponse[];
  total: number;
  page: number;
  limit: number;
};
