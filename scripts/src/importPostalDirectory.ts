import { fileURLToPath } from "node:url";
import { importPostalDirectory, pool } from "@workspace/db";

const csvPath = fileURLToPath(
  new URL("../../lib/db/data/india-post-offices.csv", import.meta.url),
);
const metadataPath = fileURLToPath(
  new URL("../../lib/db/data/india-post-offices.source.json", import.meta.url),
);

importPostalDirectory({ csvPath, metadataPath })
  .then((result) => {
    console.log(
      `${result.status === "skipped" ? "Skipped" : "Imported"} ${result.rows} India Post office rows (${result.checksum.slice(0, 12)}…)`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());