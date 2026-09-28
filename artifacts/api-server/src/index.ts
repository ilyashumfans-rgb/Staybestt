import app from "./app";
import { logger } from "./lib/logger";
import { dispatchDueCampaigns } from "./routes/marketing";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importPostalDirectory } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  const postalDirectoryDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "postal-directory",
  );
  try {
    const importResult = await importPostalDirectory({
      csvPath: path.join(postalDirectoryDir, "india-post-offices.csv"),
      metadataPath: path.join(
        postalDirectoryDir,
        "india-post-offices.source.json",
      ),
    });
    logger.info(
      {
        rows: importResult.rows,
        sourceSlug: importResult.sourceSlug,
        status: importResult.status,
      },
      "Postal directory startup import complete",
    );
  } catch (error) {
    logger.error(
      { err: error },
      "Postal directory startup import failed; refusing to listen",
    );
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    // Claiming each scheduled row atomically makes this safe with multiple API instances.
    void dispatchDueCampaigns().catch((dispatchError) => logger.error({ err: dispatchError }, "Initial campaign dispatch failed"));
    setInterval(() => {
      void dispatchDueCampaigns().catch((dispatchError) => logger.error({ err: dispatchError }, "Scheduled campaign dispatch failed"));
    }, 60_000).unref();
  });
}

void start();
