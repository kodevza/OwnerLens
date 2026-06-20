import Ajv, { type ErrorObject, type JSONSchemaType } from "ajv";
import addFormats from "ajv-formats";

import { RuntimeHttpError } from "./localSnapshotFiles";

export type RuntimeRestJsonSchema = JSONSchemaType<unknown> | Record<string, unknown>;

const ajv = addFormats(
  new Ajv({
    allErrors: true,
    strict: false
  })
);

export function validateRuntimeRestPayload(schema: RuntimeRestJsonSchema, value: unknown, label: string): void {
  const validate = ajv.compile(schema);
  if (validate(value)) {
    return;
  }

  throw new RuntimeHttpError(`Runtime API validation failed for ${label}: ${formatAjvErrors(validate.errors)}`, 400);
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return "unknown validation error";
  }

  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
}
