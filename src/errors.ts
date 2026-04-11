export type OmyMongoErrorCode =
  | "CONNECTION_ERROR"
  | "COLLECTION_ERROR"
  | "VALIDATION_ERROR"
  | "INVALID_ARGUMENT";

export class OmyMongoError extends Error {
  readonly code: OmyMongoErrorCode;
  readonly details?: unknown;

  constructor(code: OmyMongoErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "OmyMongoError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends OmyMongoError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}
