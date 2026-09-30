import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { probeRemoteImage } from "../../src/lib/assets/probe.ts";

const OUT = path.join("data", "visual-design", "joint-genesis-controlled-ready-13", "product-asset-audit-v1", "candidates");
const urls = [
  "https://jointgenesisofficial.com/assets/images/product/joint-genesis-6-bottle.png",
  "https://jointgenesisofficial.com/assets/images/product/joint-genesis-how-to-take.png",
  "https://jointgenesisofficial.com/assets/images/product/joint-genesis-supplement-facts.jpg",
];

async function main() {
  for (const url of urls) {
    const remote = await probeRemoteImage(url);
    if (!remote) {
      console.log(`FAILED path=${new URL(url).pathname}`);
      continue;
    }
    const hash = createHash("sha256").update(remote.buffer).digest("hex");
    const ext = remote.mime.includes("png") ? "png" : "jpg";
    const filename = `${hash}.${ext}`;
    writeFileSync(path.join(OUT, filename), remote.buffer);
    console.log(`SAVED=${filename} ${remote.width}x${remote.height} bytes=${remote.bytes} path=${new URL(url).pathname}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "download failed");
  process.exit(1);
});
