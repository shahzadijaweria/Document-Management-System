// Multer middleware for single-file uploads.
// File ends up at req.file.buffer (memory storage) so we hand it straight to S3.

import multer from "multer";
import type { NextFunction, Request, Response } from "express";

import {
  BadRequestError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from "../utils/errors";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed types: PDF, DOC, DOCX, TXT, PNG, JPG, JPEG
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "image/png",
  "image/jpeg",
]);

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new UnsupportedMediaTypeError(`File type ${file.mimetype} is not allowed`));
    }
  },
});

// Wraps multer.single("file") so its errors are converted into our AppError types
// and the global error handler can return clean HTTP responses.
export function uploadSingle(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  multerInstance.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return next(
          new PayloadTooLargeError(
            `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
          ),
        );
      }
      return next(err);
    }

    if (!req.file) {
      return next(new BadRequestError("No file uploaded; expected field 'file'"));
    }

    next();
  });
}
