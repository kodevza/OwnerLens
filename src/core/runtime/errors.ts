export type RuntimeErrorBody = {
  code: string;
  message: string;
};

export type RuntimeErrorResponse = {
  error: RuntimeErrorBody;
};

export class RuntimeHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code = defaultRuntimeErrorCode(statusCode)) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function defaultRuntimeErrorCode(statusCode: number): string {
  if (statusCode === 400) {
    return "runtime.badRequest";
  }

  if (statusCode === 401) {
    return "runtime.unauthorized";
  }

  if (statusCode === 404) {
    return "runtime.notFound";
  }

  if (statusCode === 409) {
    return "runtime.conflict";
  }

  return "runtime.internalError";
}
