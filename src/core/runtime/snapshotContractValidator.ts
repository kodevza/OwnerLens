import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

import { RuntimeHttpError } from "./errors";

export function parseAndValidateSnapshot<T>(
  rawJson: string,
  options: {
    schema: object;
    fileName: string;
  }
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new RuntimeHttpError(
      `Invalid ${options.fileName}: ${error instanceof Error ? error.message : "could not parse JSON"}`,
      400
    );
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validate = ajv.compile(options.schema);
  if (!validate(parsed)) {
    throw new RuntimeHttpError(`Invalid ${options.fileName}: ${formatValidationError(validate.errors ?? [])}`, 400);
  }

  return parsed as T;
}

function formatValidationError(errors: ErrorObject[]): string {
  const firstError = errors[0];

  if (!firstError) {
    return "snapshot does not match the contract";
  }

  const anyOfTypes = findAnyOfTypes(errors, firstError);
  if (anyOfTypes) {
    return `${formatPath(firstError.instancePath)} must be ${anyOfTypes}`;
  }

  return `${formatPath(firstError.instancePath)} ${firstError.message ?? "does not match the contract"}`;
}

function findAnyOfTypes(errors: ErrorObject[], firstError: ErrorObject): string | null {
  const anyOfError = errors.find((error) => error.keyword === "anyOf" && error.instancePath === firstError.instancePath);
  if (!anyOfError) {
    return null;
  }

  const types = errors
    .filter((error) => error.keyword === "type" && error.instancePath === firstError.instancePath)
    .map((error) => error.params.type)
    .filter((type): type is string => typeof type === "string");

  if (types.length === 0) {
    return null;
  }

  return types.join(" or ");
}

function formatPath(instancePath: string): string {
  return instancePath || "/";
}
