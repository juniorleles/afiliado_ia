import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { persistableProductVisualPlan, type AuditProductCandidate } from "../src/lib/product-visual/load";

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]+$/i.test(slug)) throw new Error("campaign slug required");
const inventoryPath = path.join("data", "visual-design", slug, "product-asset-audit-v1", "inventory.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8")) as { candidates: AuditProductCandidate[] };
const plan = persistableProductVisualPlan(inventory.candidates, "product-asset-audit-v1/inventory.json");
const out = path.join("data", "visual-design", slug, "visual-master", "product-visual-plan.json");
writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
const hero = plan.roles.HERO_PRODUCT_PRIMARY?.assetId ?? "none";
const bundle = plan.roles.PRODUCT_BUNDLE?.assetId ?? "none";
const closing = plan.roles.CLOSING_PRODUCT_CUE?.assetId ?? "none";
console.log(`PLAN_WRITTEN roles=${Object.keys(plan.roles).join(",")} hero=${hero} bundle=${bundle} closing=${closing}`);
