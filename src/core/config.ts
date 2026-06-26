import type { OwnerConfidence, OwnerType } from "./ownership/types";
import defaultConfigJson from "./defaultConfig.json";

type OwnerTagConfig = {
  name: string;
  confidence: Exclude<OwnerConfidence, "none">;
  type: OwnerType;
};

export type AppConfig = {
  features: {
    zeroTrustAssessment: boolean;
  };
  azure: {
    ownership: {
      /**
       * Ordered by priority. The tag value is treated as the owner identity,
       * so it can be a group name, security group alias, or user email.
       */
      ownerTags: OwnerTagConfig[];
    };
  };
};

export const defaultAppConfig = defaultConfigJson as AppConfig;

export let appConfig: AppConfig = defaultAppConfig;

export function setAppConfig(config: AppConfig): void {
  appConfig = config;
}

export function isAppConfig(value: unknown): value is AppConfig {
  if (!isRecord(value) || !isRecord(value.features) || !isRecord(value.azure)) {
    return false;
  }

  if (typeof value.features.zeroTrustAssessment !== "boolean") {
    return false;
  }

  if (!isRecord(value.azure.ownership) || !Array.isArray(value.azure.ownership.ownerTags)) {
    return false;
  }

  return value.azure.ownership.ownerTags.every(isOwnerTagConfig);
}

function isOwnerTagConfig(value: unknown): value is OwnerTagConfig {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isOwnerConfidence(value.confidence) &&
    isOwnerType(value.type)
  );
}

function isOwnerConfidence(value: unknown): value is OwnerTagConfig["confidence"] {
  return value === "high" || value === "medium" || value === "low";
}

function isOwnerType(value: unknown): value is OwnerType {
  return (
    value === "ownerUser" ||
    value === "ownerGroup" ||
    value === "ownerTag" ||
    value === "application" ||
    value === "unknown"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
