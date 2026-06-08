import type { OwnerConfidence } from "./ownership/types";

export type OwnerTagConfig = {
  name: string;
  confidence: Exclude<OwnerConfidence, "none">;
};

export type AppConfig = {
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

export const appConfig: AppConfig = {
  azure: {
    ownership: {
      ownerTags: [
        {
          name: "ownerGroup",
          confidence: "high"
        },
        {
          name: "costCenter",
          confidence: "high"
        },
        {
          name: "owner",
          confidence: "medium"
        }
      ]
    }
  }
};
