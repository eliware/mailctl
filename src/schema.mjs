export const REQUIRED_SCHEMA_VERSION = "0.1.1";

function versionParts(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export async function assertSchemaVersion(
  db,
  { packageVersion = REQUIRED_SCHEMA_VERSION, log = console } = {},
) {
  const [rows] = await db.query(
    "SELECT package_version FROM schema_version WHERE singleton_id = 1",
  );
  const actualVersion = rows[0]?.package_version ?? null;
  if (!actualVersion) {
    throw new Error(
      `mail schema version is missing; mailctl is ${packageVersion}`,
    );
  }
  if (compareVersions(actualVersion, packageVersion) === 1) {
    log.warn?.("Mail schema is newer than mailctl; upgrade suggested", {
      mailctlVersion: packageVersion,
      schemaVersion: actualVersion,
      suggestion: "Upgrade mailctl before using newer schema features.",
    });
  }
  return actualVersion;
}
