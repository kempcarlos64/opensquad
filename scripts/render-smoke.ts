import { readFile } from "node:fs/promises";
import path from "node:path";

import { renderTimelineSchema } from "../src/lib/domain";
import { renderTimelineToFiles } from "../src/remotion/render";
import { getEnv } from "../src/server/env";

async function main(): Promise<void> {
  const timelinePath = path.resolve(
    process.cwd(),
    getEnv().STORAGE_ROOT,
    "mock",
    "timeline.json",
  );
  const timeline = renderTimelineSchema.parse(
    JSON.parse(await readFile(timelinePath, "utf8")) as unknown,
  );
  const result = await renderTimelineToFiles({
    timeline,
    outputDirectory: path.resolve(process.cwd(), "data", "smoke"),
    fileStem: "besorah-smoke",
    concurrency: getEnv().REMOTION_CONCURRENCY,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
