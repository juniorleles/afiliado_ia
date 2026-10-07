/**
 * Host record domain: asset builder.
 *
 * Copies one validated ad group draft or responsive search ad draft into the
 * mutate operation that creates it paused. It does not choose a name, a bid,
 * a headline, a description, a URL, or a status.
 */
import type { AdGroupDraft, RsaDraft } from "./publisher-context";

export interface AdGroupMutateBody {
  partialFailure: false;
  validateOnly: false;
  mutateOperations: readonly [
    {
      adGroupOperation: {
        create: {
          name: string;
          status: "PAUSED";
          campaign: string;
          type: "SEARCH_STANDARD";
          cpcBidMicros: string;
        };
      };
    },
  ];
}

interface RsaTextOperation {
  text: string;
  pinnedField?: string;
}

export interface RsaMutateBody {
  partialFailure: false;
  validateOnly: false;
  mutateOperations: readonly [
    {
      adGroupAdOperation: {
        create: {
          adGroup: string;
          status: "PAUSED";
          ad: {
            finalUrls: string[];
            responsiveSearchAd: {
              headlines: RsaTextOperation[];
              descriptions: RsaTextOperation[];
              path1?: string;
              path2?: string;
            };
          };
        };
      };
    },
  ];
}

function textAsset(text: string, pinnedField: string | null): RsaTextOperation {
  if (pinnedField === null) return { text };
  return { text, pinnedField };
}

export function buildAdGroupMutateBody(campaignResourceName: string, draft: AdGroupDraft): AdGroupMutateBody {
  return {
    partialFailure: false,
    validateOnly: false,
    mutateOperations: [
      {
        adGroupOperation: {
          create: {
            name: draft.name,
            status: "PAUSED",
            campaign: campaignResourceName,
            type: "SEARCH_STANDARD",
            cpcBidMicros: String(draft.cpcBidMicros),
          },
        },
      },
    ],
  };
}

export function buildRsaMutateBody(adGroupResourceName: string, draft: RsaDraft): RsaMutateBody {
  const responsiveSearchAd: RsaMutateBody["mutateOperations"][0]["adGroupAdOperation"]["create"]["ad"]["responsiveSearchAd"] = {
    headlines: draft.headlines.map((item) => textAsset(item.text, item.pinnedField)),
    descriptions: draft.descriptions.map((item) => textAsset(item.text, item.pinnedField)),
  };
  if (draft.path1 !== "") responsiveSearchAd.path1 = draft.path1;
  if (draft.path2 !== "") responsiveSearchAd.path2 = draft.path2;
  return {
    partialFailure: false,
    validateOnly: false,
    mutateOperations: [
      {
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "PAUSED",
            ad: {
              finalUrls: [...draft.finalUrls],
              responsiveSearchAd,
            },
          },
        },
      },
    ],
  };
}
