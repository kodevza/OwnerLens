import type { DuckDBConnection } from "@duckdb/node-api";

import {
  countDisabledOwnerEvidenceKeys,
  type DisabledOwnerKey,
  disableOwnerEvidenceKey,
  enableOwnerEvidenceKey,
  readDisabledOwnerEvidenceKeys
} from "./resources/disabledOwnerEvidenceTable";

export { type DisabledOwnerKey };

export class DisabledEvidenceStore {
  private readonly getConnection: () => DuckDBConnection;

  constructor(getConnection: () => DuckDBConnection) {
    this.getConnection = getConnection;
  }

  readKeys(): Promise<ReadonlySet<DisabledOwnerKey>> {
    return readDisabledOwnerEvidenceKeys(this.getConnection());
  }

  async setDisabled(key: DisabledOwnerKey, disabled: boolean): Promise<number> {
    const connection = this.getConnection();
    if (disabled) {
      await disableOwnerEvidenceKey(connection, key);
    } else {
      await enableOwnerEvidenceKey(connection, key);
    }

    return countDisabledOwnerEvidenceKeys(connection);
  }
}
