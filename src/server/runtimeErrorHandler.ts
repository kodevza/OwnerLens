import { RuntimeHttpError } from "../core/runtime/localSnapshotFiles";

export function runtimeErrorResponse(error: unknown): Response {
  const statusCode = error instanceof RuntimeHttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Unknown error";

  return new Response(JSON.stringify({ error: { code: readRuntimeErrorCode(error, statusCode), message } }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    status: statusCode
  });
}

function readRuntimeErrorCode(error: unknown, statusCode: number): string {
  if (error instanceof RuntimeHttpError) {
    return error.code;
  }

  return statusCode === 500 ? "runtime.internalError" : "runtime.error";
}
