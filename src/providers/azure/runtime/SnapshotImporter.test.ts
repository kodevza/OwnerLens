import type { SnapshotImportStatus } from "../../../core/runtime/snapshotImportRegistry";
import { SnapshotImporter, type SnapshotImportRuntime } from "./SnapshotImporter";
import type { LocalEntraReportRuntime } from "./entra/LocalEntraReportRuntime";
import type { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";

function createImportRuntime(imported: boolean): SnapshotImportRuntime {
  const initiallyImported = imported;
  return {
    getStatus(): SnapshotImportStatus {
      return {
        imported,
        fileName: "snapshot.json",
        name: imported ? "snapshot" : null,
        lastModifiedDate: imported ? "2026-06-25T00:00:00.000Z" : null,
        sizeBytes: imported ? 2 : null,
        contentHash: imported ? "hash" : null,
        importedAt: null,
        skipped: initiallyImported
      };
    },
    importSnapshot: jest.fn(async () => {
      imported = true;
    })
  };
}

test("SnapshotImporter logs import progress for startup diagnostics", async () => {
  const logger = { log: jest.fn() };
  const entra = createImportRuntime(false);
  const azureResources = createImportRuntime(true);
  const zeroTrustAssessment = createImportRuntime(false);
  const importer = new SnapshotImporter({
    entra: entra as LocalEntraReportRuntime,
    azureResources: azureResources as LocalAzureResourcesReportRuntime,
    zeroTrustAssessment,
    logger
  });

  await importer.importSnapshots();

  expect(logger.log.mock.calls.map(([message]) => message)).toEqual([
    "Importing Entra snapshot...",
    "Imported Entra snapshot.",
    "Checking Azure resources snapshot...",
    "Azure resources snapshot is already current.",
    "Importing Zero Trust Assessment snapshot...",
    "Imported Zero Trust Assessment snapshot."
  ]);
});
