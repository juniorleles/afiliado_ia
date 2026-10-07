import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GOOGLE_ADS_CONTEXT_MEMBERS, type GoogleAdsContext } from "../src/lib/providers/google-ads/google-ads-context.ts";
import type { GoogleAdsProvider, GoogleAdsProviderDependencies } from "../src/lib/providers/google-ads/google-ads-provider.ts";
import type { GoogleAdsRegistry } from "../src/lib/providers/google-ads/google-ads-registry.ts";
import {
  GOOGLE_ADS_CAMPAIGN_KEYS,
  GOOGLE_ADS_MODEL_KEYS,
  type GoogleAdsAdGroup,
  type GoogleAdsAsset,
  type GoogleAdsAudience,
  type GoogleAdsBidStrategy,
  type GoogleAdsCampaign,
  type GoogleAdsCampaignBudget,
  type GoogleAdsCampaignSettings,
  type GoogleAdsConversionGoal,
  type GoogleAdsDescription,
  type GoogleAdsExtension,
  type GoogleAdsFinalUrl,
  type GoogleAdsHeadline,
  type GoogleAdsKeyword,
  type GoogleAdsLanguage,
  type GoogleAdsLocation,
  type GoogleAdsMetadata,
  type GoogleAdsModel,
  type GoogleAdsNegativeKeyword,
  type GoogleAdsResponsiveSearchAd,
  type GoogleAdsTrackingTemplate,
} from "../src/lib/providers/google-ads/google-ads-types.ts";
import type { GoogleAdsIssue, GoogleAdsValidator } from "../src/lib/providers/google-ads/google-ads-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const metadata: GoogleAdsMetadata = { note: "fixture", n: 1, flag: true, none: null };
const budget: GoogleAdsCampaignBudget = { id: "b-1", name: "daily", metadata };
const settings: GoogleAdsCampaignSettings = { id: "s-1", campaignId: "c-1", metadata };
const campaign: GoogleAdsCampaign = { id: "c-1", name: "search", budgetId: "b-1", settingsId: "s-1", metadata };
const adGroup: GoogleAdsAdGroup = { id: "g-1", campaignId: "c-1", name: "core", metadata };
const keyword: GoogleAdsKeyword = { id: "k-1", adGroupId: "g-1", text: "alpha term", metadata };
const negative: GoogleAdsNegativeKeyword = { id: "n-1", text: "beta term", metadata };
const headline: GoogleAdsHeadline = { id: "h-1", text: "line one", metadata };
const description: GoogleAdsDescription = { id: "d-1", text: "line two", metadata };
const finalUrl: GoogleAdsFinalUrl = { id: "u-1", url: "https://example.test/offer", metadata };
const tracking: GoogleAdsTrackingTemplate = { id: "t-1", text: "{lpurl}?src=host", metadata };
const rsa: GoogleAdsResponsiveSearchAd = {
  id: "rsa-1",
  adGroupId: "g-1",
  headlineIds: ["h-1"],
  descriptionIds: ["d-1"],
  finalUrlId: "u-1",
  trackingTemplateId: "t-1",
  metadata,
};
const audience: GoogleAdsAudience = { id: "aud-1", name: "in-market", metadata };
const location: GoogleAdsLocation = { id: "loc-1", name: "US", metadata };
const language: GoogleAdsLanguage = { id: "lang-1", name: "en", metadata };
const bidStrategy: GoogleAdsBidStrategy = { id: "bs-1", name: "manual", metadata };
const asset: GoogleAdsAsset = { id: "as-1", name: "logo", metadata };
const extension: GoogleAdsExtension = { id: "ex-1", name: "sitelink", metadata };
const conversionGoal: GoogleAdsConversionGoal = { id: "cg-1", name: "purchase", metadata };

const model: GoogleAdsModel = {
  id: "model-1",
  executionContractId: "ec-1",
  executionPlanId: "ep-1",
  campaigns: [campaign],
  budgets: [budget],
  settings: [settings],
  adGroups: [adGroup],
  keywords: [keyword],
  negativeKeywords: [negative],
  responsiveSearchAds: [rsa],
  headlines: [headline],
  descriptions: [description],
  finalUrls: [finalUrl],
  trackingTemplates: [tracking],
  audiences: [audience],
  locations: [location],
  languages: [language],
  bidStrategies: [bidStrategy],
  assets: [asset],
  extensions: [extension],
  conversionGoals: [conversionGoal],
  metadata,
};

const context: GoogleAdsContext = {
  executionContract: { id: "ec-1" },
  executionPlan: { id: "ep-1" },
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
};

function campaignIssues(input: unknown): GoogleAdsIssue[] {
  if (typeof input !== "object" || input === null || !("id" in input)) {
    return [{ field: "campaign", message: "Invalid Campaign: a campaign id is required." }];
  }
  const item = input as GoogleAdsCampaign;
  if (typeof item.id !== "string" || item.id.trim() === "") {
    return [{ field: "campaign", message: "Invalid Campaign: a campaign id is required." }];
  }
  return [];
}

function adGroupIssues(input: unknown): GoogleAdsIssue[] {
  if (typeof input !== "object" || input === null || !("id" in input)) {
    return [{ field: "adGroup", message: "Duplicate Ad Group: a group id is required." }];
  }
  return [];
}

function keywordIssues(input: unknown): GoogleAdsIssue[] {
  if (typeof input !== "object" || input === null || !("id" in input)) {
    return [{ field: "keyword", message: "Duplicate Keyword: a term id is required." }];
  }
  return [];
}

function fakeRegistry(): GoogleAdsRegistry {
  const campaigns = new Map<string, GoogleAdsCampaign>();
  const adGroups = new Map<string, GoogleAdsAdGroup>();
  const keywords = new Map<string, GoogleAdsKeyword>();
  return {
    registerCampaign: (item) => {
      if (campaignIssues(item).length > 0) throw new Error("Invalid Campaign");
      if (campaigns.has(item.id)) throw new Error("Invalid Campaign");
      campaigns.set(item.id, item);
      return item;
    },
    registerAdGroup: (item) => {
      if (adGroupIssues(item).length > 0) throw new Error("Duplicate Ad Group");
      if (adGroups.has(item.id)) throw new Error("Duplicate Ad Group");
      adGroups.set(item.id, item);
      return item;
    },
    registerKeyword: (item) => {
      if (keywordIssues(item).length > 0) throw new Error("Duplicate Keyword");
      if (keywords.has(item.id)) throw new Error("Duplicate Keyword");
      keywords.set(item.id, item);
      return item;
    },
    getCampaign: (id) => campaigns.get(id) ?? null,
    getAdGroup: (id) => adGroups.get(id) ?? null,
    getKeyword: (id) => keywords.get(id) ?? null,
    listCampaigns: () => [...campaigns.values()],
    listAdGroups: () => [...adGroups.values()],
    listKeywords: () => [...keywords.values()],
    validateCampaign: campaignIssues,
    validateAdGroup: adGroupIssues,
    validateKeyword: keywordIssues,
  };
}

const validator: GoogleAdsValidator = {
  validateCampaign: campaignIssues,
  validateAdGroup: adGroupIssues,
  validateKeyword: keywordIssues,
  validateUrl: (input) =>
    typeof input === "string" && /^https:\/\//.test(input)
      ? []
      : [{ field: "url", message: "Invalid URL: a well-formed address is required." }],
  validateMetadata: (input) =>
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.values(input as object).every((v) => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      ? []
      : [{ field: "metadata", message: "Invalid Metadata: a flat record is required." }],
  validateContext: (input) => (input == null ? [{ field: "context", message: "Invalid Metadata: a context is required." }] : []),
  validateModel: (input) => (input == null ? [{ field: "model", message: "Invalid Campaign: a model is required." }] : []),
  validateGraph: (campaigns, adGroups, keywords) => {
    const issues: GoogleAdsIssue[] = [];
    const campaignIds = new Set<string>();
    for (const item of campaigns) {
      if (campaignIssues(item).length > 0 || campaignIds.has(item.id)) {
        issues.push({ field: "campaigns", message: "Invalid Campaign: a campaign record is not well-formed." });
      }
      campaignIds.add(item.id);
    }
    const groupIds = new Set<string>();
    for (const item of adGroups) {
      if (groupIds.has(item.id)) issues.push({ field: "adGroups", message: "Duplicate Ad Group: the same group id is already registered." });
      groupIds.add(item.id);
    }
    const keywordIds = new Set<string>();
    for (const item of keywords) {
      if (keywordIds.has(item.id)) issues.push({ field: "keywords", message: "Duplicate Keyword: the same term id is already registered." });
      keywordIds.add(item.id);
    }
    return issues;
  },
};

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(p));
    else if (name.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

async function main() {
  check("four context members, in the requested order", GOOGLE_ADS_CONTEXT_MEMBERS.join() === "executionContract,executionPlan,executionMetadata,runtimeMetadata");
  check("a campaign has exactly the requested fields", GOOGLE_ADS_CAMPAIGN_KEYS.join() === "id,name,budgetId,settingsId,metadata" && Object.keys(campaign).join() === GOOGLE_ADS_CAMPAIGN_KEYS.join());
  check(
    "a model has exactly the requested fields",
    GOOGLE_ADS_MODEL_KEYS.join() ===
      "id,executionContractId,executionPlanId,campaigns,budgets,settings,adGroups,keywords,negativeKeywords,responsiveSearchAds,headlines,descriptions,finalUrls,trackingTemplates,audiences,locations,languages,bidStrategies,assets,extensions,conversionGoals,metadata" &&
      Object.keys(model).join() === GOOGLE_ADS_MODEL_KEYS.join(),
  );
  check("a budget has exactly id, name, and metadata", Object.keys(budget).join() === "id,name,metadata");
  check("settings have exactly id, campaignId, and metadata", Object.keys(settings).join() === "id,campaignId,metadata");
  check("an ad group has exactly id, campaignId, name, and metadata", Object.keys(adGroup).join() === "id,campaignId,name,metadata");
  check("a keyword has exactly id, adGroupId, text, and metadata", Object.keys(keyword).join() === "id,adGroupId,text,metadata");
  check("a negative keyword has exactly id, text, and metadata", Object.keys(negative).join() === "id,text,metadata");
  check("a responsive search ad has id, group, headlines, descriptions, final url, tracking, and metadata", Object.keys(rsa).join() === "id,adGroupId,headlineIds,descriptionIds,finalUrlId,trackingTemplateId,metadata");
  check("a headline has exactly id, text, and metadata", Object.keys(headline).join() === "id,text,metadata");
  check("a description has exactly id, text, and metadata", Object.keys(description).join() === "id,text,metadata");
  check("a final url has exactly id, url, and metadata", Object.keys(finalUrl).join() === "id,url,metadata");
  check("a tracking template has exactly id, text, and metadata", Object.keys(tracking).join() === "id,text,metadata");
  check("an audience has exactly id, name, and metadata", Object.keys(audience).join() === "id,name,metadata");
  check("a location has exactly id, name, and metadata", Object.keys(location).join() === "id,name,metadata");
  check("a language has exactly id, name, and metadata", Object.keys(language).join() === "id,name,metadata");
  check("a bid strategy has exactly id, name, and metadata", Object.keys(bidStrategy).join() === "id,name,metadata");
  check("an asset has exactly id, name, and metadata", Object.keys(asset).join() === "id,name,metadata");
  check("an extension has exactly id, name, and metadata", Object.keys(extension).join() === "id,name,metadata");
  check("a conversion goal has exactly id, name, and metadata", Object.keys(conversionGoal).join() === "id,name,metadata");
  check("a context has exactly the four members", Object.keys(context).join() === GOOGLE_ADS_CONTEXT_MEMBERS.join());
  check("the model carries named records and no send path", model.campaigns[0].id === "c-1" && model.keywords[0].id === "k-1" && !("http" in model) && !("oauth" in model) && !("token" in model));

  const registry = fakeRegistry();
  const dependencies: GoogleAdsProviderDependencies = { registry, validator };
  const provider: GoogleAdsProvider = {
    model: async (ctx) => ({
      ...model,
      executionContractId: ctx.executionContract?.id ?? null,
      executionPlanId: ctx.executionPlan?.id ?? null,
      campaigns: registry.listCampaigns(),
      adGroups: registry.listAdGroups(),
      keywords: registry.listKeywords(),
      metadata: { ...ctx.executionMetadata, ...ctx.runtimeMetadata },
    }),
    getModel: () => null,
  };

  registry.registerCampaign(campaign);
  registry.registerAdGroup(adGroup);
  registry.registerKeyword(keyword);
  check("the registry registers, gets, and lists campaigns", registry.getCampaign("c-1")?.name === "search" && registry.getCampaign("missing") === null && registry.listCampaigns().length === 1);
  check("the registry registers, gets, and lists ad groups", registry.getAdGroup("g-1")?.name === "core" && registry.getAdGroup("missing") === null && registry.listAdGroups().length === 1);
  check("the registry registers, gets, and lists keywords", registry.getKeyword("k-1")?.text === "alpha term" && registry.getKeyword("missing") === null && registry.listKeywords().length === 1);
  check("the registry validates without registering", registry.validateCampaign(campaign).length === 0 && registry.validateCampaign(null).length === 1 && registry.getCampaign("c-2") === null);
  let invalidCampaign = false;
  try {
    registry.registerCampaign({ ...campaign, id: "" });
  } catch (error) {
    invalidCampaign = error instanceof Error && error.message === "Invalid Campaign";
  }
  check("Invalid Campaign: a second empty id is rejected", invalidCampaign && registry.listCampaigns().length === 1);
  let duplicateGroup = false;
  try {
    registry.registerAdGroup(adGroup);
  } catch (error) {
    duplicateGroup = error instanceof Error && error.message === "Duplicate Ad Group";
  }
  check("Duplicate Ad Group: a second registration is rejected", duplicateGroup && registry.listAdGroups().length === 1);
  let duplicateKeyword = false;
  try {
    registry.registerKeyword(keyword);
  } catch (error) {
    duplicateKeyword = error instanceof Error && error.message === "Duplicate Keyword";
  }
  check("Duplicate Keyword: a second registration is rejected", duplicateKeyword && registry.listKeywords().length === 1);
  check("Invalid Campaign is rejected by the validator contract", validator.validateCampaign({}).some((i) => /Invalid Campaign/.test(`${i.field} ${i.message}`)));
  check("Duplicate Ad Group is rejected by the validator contract", validator.validateGraph([campaign], [adGroup, adGroup], [keyword]).some((i) => /Duplicate Ad Group/.test(`${i.field} ${i.message}`)));
  check("Duplicate Keyword is rejected by the validator contract", validator.validateGraph([campaign], [adGroup], [keyword, keyword]).some((i) => /Duplicate Keyword/.test(`${i.field} ${i.message}`)));
  check("Invalid URL is rejected by the validator contract", validator.validateUrl("not-a-url").some((i) => /Invalid URL/.test(`${i.field} ${i.message}`)) && validator.validateUrl(finalUrl.url).length === 0);
  check("Invalid Metadata is rejected by the validator contract", validator.validateMetadata({ a: { b: 1 } }).some((i) => /Invalid Metadata/.test(`${i.field} ${i.message}`)) && validator.validateMetadata(metadata).length === 0);

  const before = JSON.stringify(context);
  const produced = await provider.model(context);
  check("the provider returns a model from id holders and does not look up a missing id", produced.executionContractId === "ec-1" && produced.executionPlanId === "ep-1" && produced.campaigns.length === 1 && provider.getModel("nope") === null);
  check("no mutation: the context is unchanged after model()", JSON.stringify(context) === before && context.executionContract?.id === "ec-1" && context.executionPlan?.id === "ep-1");
  void dependencies;

  const other = fakeRegistry();
  check("independent provider: a second registry does not share records", other.getCampaign("c-1") === null && other.listAdGroups().length === 0 && other.listKeywords().length === 0 && registry.getCampaign("c-1") !== null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"];
  check("the five architecture modules are present", architecture.every((f) => readdirSync(dir).includes(f)));
  const files = readdirSync(dir).filter((f) => architecture.includes(f));
  check("exactly the five architecture modules exist", files.sort().join() === architecture.slice().sort().join());
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 5);
  check("every import is type-only and from inside the google-ads folder", imports.every((i) => i.typeOnly && /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, OAuth, token, or send path in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization|publish\(/i.test(l)));
  check("no AI, persistence, timers, or file access in code", !code.some((l) => /anthropic|openai|better-sqlite3|getDb|setTimeout|setInterval|writeFile|node:fs|child_process|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !code.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  const runtime = code.filter((l) => /^\s*export\s+(async\s+)?(function|class)\b|=>\s*[^;]*;?\s*$/.test(l) && !/^\s*export\s+(type|interface)\b/.test(l));
  check("architecture only: no function or class is exported, and the only runtime values are constants", runtime.length === 0 && code.filter((l) => /^\s*export\s+const\b/.test(l)).length === 3);

  const libRoot = join(process.cwd(), "src/lib");
  const others = listTs(libRoot).filter((f) => {
    const name = f.replace(/\\/g, "/");
    return !name.includes("/providers/google-ads/") && !name.endsWith("/product-intelligence/product-analysis-runner.ts");
  });
  check("no other lib module imports the google-ads provider", !others.some((f) => /providers\/google-ads|google-ads-(provider|types|registry|validator|context)/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import the google-ads provider", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads architecture: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
