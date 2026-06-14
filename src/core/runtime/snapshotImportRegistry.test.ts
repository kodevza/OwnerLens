import { shouldImportSnapshot, type SnapshotImportFingerprint } from "./snapshotImportRegistry";

const previousImport: SnapshotImportFingerprint = {
  fileName: "exports/snapshot.json",
  name: "snapshot.json",
  lastModifiedDate: "2026-06-01T10:00:00.000Z",
  sizeBytes: 42,
  contentHash: "hash-1"
};

test("skips import when file metadata matches previous import", () => {
  expect(shouldImportSnapshot({ ...previousImport, contentHash: null }, previousImport)).toBe(false);
});

test("skips import when metadata changed but content hash matches", () => {
  expect(
    shouldImportSnapshot(
      {
        ...previousImport,
        lastModifiedDate: "2026-06-02T10:00:00.000Z",
        contentHash: "hash-1"
      },
      previousImport
    )
  ).toBe(false);
});

test("imports when metadata and content hash changed", () => {
  expect(
    shouldImportSnapshot(
      {
        ...previousImport,
        sizeBytes: 43,
        contentHash: "hash-2"
      },
      previousImport
    )
  ).toBe(true);
});
