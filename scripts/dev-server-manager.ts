import path from "node:path";
import { nextDevArgs, requestedPort } from "./dev-server/core";
import { createSessionDeps } from "./dev-server/os";
import { runSession } from "./dev-server/session";

const repoRoot = path.resolve(process.cwd());
const userArgs = process.argv.slice(2);
const deps = createSessionDeps(repoRoot, nextDevArgs(userArgs));
deps.requestedPort = requestedPort(userArgs);

process.on("SIGINT", () => {
  void deps.shutdown();
});
process.on("SIGTERM", () => {
  void deps.shutdown();
});

runSession(deps)
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`startup failure: ${message}\n`);
    process.exit(1);
  });
