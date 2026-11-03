// npx tsx scripts/inspect-54g-quality.ts
import { inspectContentQuality, repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";

const BOFU = "lp-mvky9o48-93f564b4";
const EDITORIAL = "lp-mvky9o48-a95b60bc";

function dump(id: string) {
  const record = readGeneration(id);
  const model = readGenerationModel(id);
  if (!record || !model) throw new Error(`missing ${id}`);
  const inspected = inspectContentQuality({ copy: model.copy, contract: model.contract, brief: model.brief });
  const repaired = repairContentQuality({ copy: model.copy, contract: model.contract, brief: model.brief });
  const grounding = [
    classifyCopyText({ path: "headline", text: model.copy.headline.text, contract: model.contract }),
    classifyCopyText({ path: "introduction", text: model.copy.introduction.text, contract: model.contract }),
    ...model.copy.sections.map((section, index) =>
      classifyCopyText({ path: `sections[${index}].headline`, text: section.headline.text, contract: model.contract }),
    ),
    ...model.copy.faq.flatMap((item, index) => [
      classifyCopyText({ path: `faq[${index}].question`, text: item.question.text, contract: model.contract }),
      classifyCopyText({ path: `faq[${index}].answer`, text: item.answer.text, contract: model.contract }),
    ]),
  ];
  console.log(JSON.stringify({
    id,
    gateLabels: record.gateLabels,
    storedDefects: record.defects.length,
    inspectCount: inspected.length,
    inspect: inspected.map((item) => ({ id: item.id, message: item.message, evidence: item.evidence })),
    repairedStatus: repaired.status,
    repairedDefects: repaired.defects.map((item) => ({ id: item.id, message: item.message, evidence: item.evidence })),
    sections: model.copy.sections.map((item) => item.sectionType),
    faqCount: model.copy.faq.length,
    components: (model.contract.components ?? []).map((item) => item.name),
    features: (model.contract.features ?? []).map((item) => item.text),
    guarantee: model.contract.guarantee?.text ?? null,
    cta: model.contract.cta,
    hopHref: model.hopHref ?? null,
    sandbox: model.sandbox ?? null,
    groundingBlocked: grounding.filter((item) => !item.allowed),
  }, null, 2));
}

dump(EDITORIAL);
dump(BOFU);
