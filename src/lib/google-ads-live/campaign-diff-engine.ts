/**
 * Host record domain: campaign diff engine.
 *
 * Compares an observed campaign state with a local campaign state and names
 * field changes and resources that exist on only one side. It does not change
 * either state.
 */
import type { AdGroupState, AdState, CampaignState, LabelState, MissingResource, StateChange, SyncDifference } from "./campaign-sync-snapshot";

const CAMPAIGN_FIELDS = ["name", "status", "servingStatus", "budgetResourceName", "budgetName", "budgetAmountMicros", "budgetStatus", "lastModifiedTime"] as const;

export interface CampaignDiff {
  differences: SyncDifference[];
  missingResources: MissingResource[];
  stateChanges: StateChange[];
}

function valueOf(campaign: CampaignState, field: (typeof CAMPAIGN_FIELDS)[number]): string | null {
  return campaign[field];
}

function change(resourceName: string, field: string, localValue: string | null, observedValue: string | null): { difference: SyncDifference; stateChange: StateChange } {
  return {
    difference: { kind: "STATE_CHANGE", resourceName, field, localValue, observedValue },
    stateChange: { resourceName, field, localValue, observedValue },
  };
}

function missing(resourceName: string, missingFrom: "LOCAL" | "GOOGLE"): { difference: SyncDifference; missingResource: MissingResource } {
  const localValue = missingFrom === "GOOGLE" ? resourceName : null;
  const observedValue = missingFrom === "LOCAL" ? resourceName : null;
  return {
    difference: { kind: "MISSING", resourceName, field: "resourceName", localValue, observedValue },
    missingResource: { resourceName, missingFrom },
  };
}

function indexBy<T extends { resourceName: string }>(items: readonly T[]): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const item of items) indexed.set(item.resourceName, item);
  return indexed;
}

function compareText(resourceName: string, field: string, localValue: string | null, observedValue: string | null, diff: CampaignDiff): void {
  if (localValue === observedValue) return;
  const next = change(resourceName, field, localValue, observedValue);
  diff.differences.push(next.difference);
  diff.stateChanges.push(next.stateChange);
}

function compareLabels(local: readonly LabelState[], observed: readonly LabelState[], diff: CampaignDiff): void {
  const localIndex = indexBy(local);
  const observedIndex = indexBy(observed);
  for (const label of observed) {
    const prior = localIndex.get(label.resourceName);
    if (prior === undefined) {
      const next = missing(label.resourceName, "LOCAL");
      diff.differences.push(next.difference);
      diff.missingResources.push(next.missingResource);
      continue;
    }
    compareText(label.resourceName, "labelId", prior.labelId, label.labelId, diff);
    compareText(label.resourceName, "name", prior.name, label.name, diff);
  }
  for (const label of local) {
    if (observedIndex.has(label.resourceName)) continue;
    const next = missing(label.resourceName, "GOOGLE");
    diff.differences.push(next.difference);
    diff.missingResources.push(next.missingResource);
  }
}

function compareAds(local: readonly AdState[], observed: readonly AdState[], diff: CampaignDiff): void {
  const localIndex = indexBy(local);
  const observedIndex = indexBy(observed);
  for (const ad of observed) {
    const prior = localIndex.get(ad.resourceName);
    if (prior === undefined) {
      const next = missing(ad.resourceName, "LOCAL");
      diff.differences.push(next.difference);
      diff.missingResources.push(next.missingResource);
      continue;
    }
    compareText(ad.resourceName, "status", prior.status, ad.status, diff);
    compareText(ad.resourceName, "approvalStatus", prior.approvalStatus, ad.approvalStatus, diff);
    compareText(ad.resourceName, "policyReviewStatus", prior.policyReviewStatus, ad.policyReviewStatus, diff);
  }
  for (const ad of local) {
    if (observedIndex.has(ad.resourceName)) continue;
    const next = missing(ad.resourceName, "GOOGLE");
    diff.differences.push(next.difference);
    diff.missingResources.push(next.missingResource);
  }
}

function compareAdGroups(local: readonly AdGroupState[], observed: readonly AdGroupState[], diff: CampaignDiff): void {
  const localIndex = indexBy(local);
  const observedIndex = indexBy(observed);
  for (const adGroup of observed) {
    const prior = localIndex.get(adGroup.resourceName);
    if (prior === undefined) {
      const next = missing(adGroup.resourceName, "LOCAL");
      diff.differences.push(next.difference);
      diff.missingResources.push(next.missingResource);
      continue;
    }
    compareText(adGroup.resourceName, "name", prior.name, adGroup.name, diff);
    compareText(adGroup.resourceName, "status", prior.status, adGroup.status, diff);
    compareAds(prior.ads, adGroup.ads, diff);
  }
  for (const adGroup of local) {
    if (observedIndex.has(adGroup.resourceName)) continue;
    const next = missing(adGroup.resourceName, "GOOGLE");
    diff.differences.push(next.difference);
    diff.missingResources.push(next.missingResource);
  }
}

export function diffCampaign(local: CampaignState | null, observed: CampaignState): CampaignDiff {
  const diff: CampaignDiff = { differences: [], missingResources: [], stateChanges: [] };
  if (local === null) {
    const next = missing(observed.resourceName, "LOCAL");
    diff.differences.push(next.difference);
    diff.missingResources.push(next.missingResource);
    return diff;
  }
  for (const field of CAMPAIGN_FIELDS) compareText(observed.resourceName, field, valueOf(local, field), valueOf(observed, field), diff);
  compareLabels(local.labels, observed.labels, diff);
  compareAdGroups(local.adGroups, observed.adGroups, diff);
  return diff;
}

export function diffCampaigns(local: readonly CampaignState[], observed: readonly CampaignState[]): CampaignDiff {
  const diff: CampaignDiff = { differences: [], missingResources: [], stateChanges: [] };
  const localIndex = indexBy(local);
  for (const campaign of observed) {
    const part = diffCampaign(localIndex.get(campaign.resourceName) ?? null, campaign);
    diff.differences.push(...part.differences);
    diff.missingResources.push(...part.missingResources);
    diff.stateChanges.push(...part.stateChanges);
  }
  return diff;
}
