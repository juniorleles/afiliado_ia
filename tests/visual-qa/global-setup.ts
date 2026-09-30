import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { startupFailureFromStatus, type StatusFile } from "../../scripts/dev-server/core";

export default function globalSetup(): void {
  const statusPath = path.join(process.cwd(), ".dev-server", "status.json");
  if (!existsSync(statusPath)) {
    throw new Error("startup failure: Dev Server Manager did not record Ready");
  }
  const status = JSON.parse(readFileSync(statusPath, "utf8")) as StatusFile;
  const failure = startupFailureFromStatus(status);
  if (failure) throw new Error(failure);
}
