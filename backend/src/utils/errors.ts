// Custom error hierarchy.
// Services throw these; the global error handler in app.ts maps them to HTTP responses.
// `instanceof AppError` distinguishes "we threw this" from genuinely unexpected crashes.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = this.constructor.name;
    // Cleaner stack traces — omit this constructor frame.
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad Request", details?: unknown) {
    super(400, message, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not Found") {
    super(404, message, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, message, "CONFLICT");
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Payload Too Large") {
    super(413, message, "PAYLOAD_TOO_LARGE");
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = "Unsupported Media Type") {
    super(415, message, "UNSUPPORTED_MEDIA_TYPE");
  }
}
