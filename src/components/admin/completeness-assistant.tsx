"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CompletenessCard } from "@/components/admin/completeness-card";
import { LpQualityCard } from "@/components/admin/lp-quality-card";
import { predictLpQuality } from "@/lib/lp-quality-predictor";
import { layerStatus, type LayerStatus } from "@/lib/editor-layers";
import {
  analyzeImportCompleteness,
  projectCompletenessDraft,
  type CompletenessSectionId,
  type SectionPresence,
} from "@/lib/completeness-engine";
import type { ProductFacts } from "@/lib/product-facts";
import type { ProductEditorModel } from "@/lib/manual-overrides";
import type { PresentationFormState } from "@/app/admin/product-editor/[campaignId]/editor-overlay";

export type LiveSaveResult = { ok: true; notice: string } | { ok: false; error: string };

type DraftState = { text: string; importedText: string; list: boolean };

type AssistantValue = {
  publish: (field: string, draft: DraftState) => void;
  revert: (field: string) => void;
  commit: (field: string) => void;
  notify: (message: string) => void;
};

const AssistantContext = createContext<AssistantValue | null>(null);

export function useCompletenessAssistant(): AssistantValue | null {
  return useContext(AssistantContext);
}

const FIELD_SECTION: Record<string, CompletenessSectionId> = {
  productName: "identity",
  description: "description",
  manufacturer: "manufacturer",
  ingredients: "ingredients",
  features: "features",
  faq: "faq",
  usage: "usage",
  guarantee: "guarantee",
  warnings: "warnings",
  pricing: "pricing",
  "presentation.headline": "hero",
  "presentation.images": "images",
  "presentation.shipping": "shipping",
  "presentation.returns": "returns",
};

export function CompletenessAssistant({
  campaignId,
  facts,
  headline,
  imageUrl,
  imageProvenance,
  visualAssetCount,
  shippingText,
  returnsText,
  model,
  presentation,
  children,
}: {
  campaignId: number;
  facts: ProductFacts;
  headline: string | null;
  imageUrl: string | null;
  imageProvenance: string | null;
  visualAssetCount: number;
  shippingText: string | null;
  returnsText: string | null;
  model: ProductEditorModel;
  presentation: PresentationFormState;
  children: ReactNode;
}) {
  const [base, setBase] = useState(facts);
  const [extras, setExtras] = useState({ headline, imageUrl, shippingText, returnsText });
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [presence, setPresence] = useState<Partial<Record<CompletenessSectionId, SectionPresence>>>(() =>
    initialPresence(model, presentation),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const committedPresence = useRef(presence);

  const live = useMemo(() => {
    let next = base;
    let liveHeadline = extras.headline;
    let liveImage = extras.imageUrl;
    let liveShipping = extras.shippingText;
    let liveReturns = extras.returnsText;
    for (const [field, draft] of Object.entries(drafts)) {
      const typed = draft.text.trim();
      if (field === "presentation.headline") {
        if (typed) liveHeadline = draft.text;
      } else if (field === "presentation.images") {
        if (typed) liveImage = draft.text;
      } else if (field === "presentation.shipping") {
        if (typed) liveShipping = draft.text;
      } else if (field === "presentation.returns") {
        if (typed) liveReturns = draft.text;
      } else next = projectCompletenessDraft(next, field, draft.text);
    }
    const report = analyzeImportCompleteness({
      facts: next,
      headline: liveHeadline,
      imageUrl: liveImage,
      imageProvenance,
      visualAssetCount,
      shippingText: liveShipping,
      returnsText: liveReturns,
      presence,
    });
    const bonusDraft = drafts["presentation.bonus"];
    const bonusText = bonusDraft?.text.trim() ? bonusDraft.text : presentation.bonus;
    return { report, prediction: predictLpQuality({ facts: next, report, bonusText }) };
  }, [base, drafts, extras, imageProvenance, presence, presentation.bonus, visualAssetCount]);

  const value = useMemo<AssistantValue>(
    () => ({
      publish(field, draft) {
        setDrafts((current) => ({ ...current, [field]: draft }));
        const section = FIELD_SECTION[field];
        if (!section) return;
        const override = draft.text.trim() ? draft.text : null;
        setPresence((current) => ({ ...current, [section]: layerStatus(draft.importedText, override, draft.list) }));
      },
      revert(field) {
        if (!(field in draftsRef.current)) return;
        setDrafts((current) => {
          if (!(field in current)) return current;
          const next = { ...current };
          delete next[field];
          return next;
        });
        setPresence({ ...committedPresence.current });
      },
      commit(field) {
        const draft = draftsRef.current[field];
        if (!draft) return;
        if (field === "presentation.headline") setExtras((current) => ({ ...current, headline: draft.text }));
        else if (field === "presentation.images") setExtras((current) => ({ ...current, imageUrl: draft.text }));
        else if (field === "presentation.shipping") setExtras((current) => ({ ...current, shippingText: draft.text }));
        else if (field === "presentation.returns") setExtras((current) => ({ ...current, returnsText: draft.text }));
        else setBase((current) => projectCompletenessDraft(current, field, draft.text));
        const section = FIELD_SECTION[field];
        if (section) {
          committedPresence.current = {
            ...committedPresence.current,
            [section]: layerStatus(draft.importedText, draft.text.trim() ? draft.text : null, draft.list),
          };
          setPresence({ ...committedPresence.current });
        }
        setDrafts((current) => {
          const next = { ...current };
          delete next[field];
          return next;
        });
      },
      notify(message) {
        setNotice(message);
      },
    }),
    [],
  );

  return (
    <AssistantContext.Provider value={value}>
      {notice ? (
        <p className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200" role="status">
          {notice}
        </p>
      ) : null}
      <LpQualityCard prediction={live.prediction} campaignId={campaignId} />
      <CompletenessCard report={live.report} campaignId={campaignId} />
      {children}
    </AssistantContext.Provider>
  );
}

export function LiveEditorForm({
  action,
  field,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<LiveSaveResult | void>;
  field: string;
  className?: string;
  children: ReactNode;
}) {
  const assistant = useCompletenessAssistant();
  return (
    <form
      className={className}
      action={async (formData) => {
        formData.set("stay", "1");
        const result = await action(formData);
        if (!result) return;
        if (result.ok) {
          assistant?.commit(field);
          assistant?.notify(`Saved ${result.notice}. Source is now Manual Override.`);
          return;
        }
        assistant?.notify(result.error);
      }}
    >
      {children}
    </form>
  );
}

export function useLiveFieldDraft(field: string, text: string, importedText: string, list: boolean, active = true) {
  const assistant = useCompletenessAssistant();
  useEffect(() => {
    if (!assistant) return;
    if (!active) {
      assistant.revert(field);
      return;
    }
    assistant.publish(field, { text, importedText, list });
  }, [assistant, field, text, importedText, list, active]);
  useEffect(() => {
    return () => {
      assistant?.revert(field);
    };
  }, [assistant, field]);
}

function initialPresence(
  model: ProductEditorModel,
  presentation: PresentationFormState,
): Partial<Record<CompletenessSectionId, SectionPresence>> {
  const presence: Partial<Record<CompletenessSectionId, SectionPresence>> = {};
  for (const section of model.sections) {
    for (const field of section.fields) {
      const target = FIELD_SECTION[field.field];
      if (!target) continue;
      const list = field.kind === "list" || field.kind === "faq" || field.kind === "packages";
      const override = field.source === "MANUAL" ? fieldText(field) : null;
      presence[target] = layerStatus(field.importedText, override, list);
    }
  }
  presence.hero = layerStatus(presentation.imported.headline, presentation.headline, false);
  presence.images = layerStatus(presentation.imported.images, presentation.images, false);
  presence.shipping = layerStatus(presentation.imported.shipping, presentation.shipping, false);
  presence.returns = layerStatus(presentation.imported.returns, presentation.returns, false);
  return presence;
}

function fieldText(field: ProductEditorModel["sections"][number]["fields"][number]): string {
  if (typeof field.value === "string") return field.value;
  if (field.kind === "list" && Array.isArray(field.value)) return field.value.map((item) => String(item)).join("\n");
  if (field.kind === "faq" && Array.isArray(field.value)) {
    return field.value
      .map((item) => (item && typeof item === "object" && "question" in item ? `${item.question}\n${item.answer}`.trim() : ""))
      .filter(Boolean)
      .join("\n\n");
  }
  return JSON.stringify(field.value);
}
