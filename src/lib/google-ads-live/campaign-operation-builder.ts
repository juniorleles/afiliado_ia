/**
 * Host record domain: campaign operation builder.
 *
 * Copies one validated draft into the mutate operations a paused campaign
 * requires. It does not choose an amount, a name, or a status.
 */
import type { CampaignDraft } from "./campaign-publisher-context";

export interface CampaignMutateBody {
  partialFailure: false;
  validateOnly: false;
  mutateOperations: readonly [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: string;
          name: string;
          amountMicros: string;
          deliveryMethod: "STANDARD";
          explicitlyShared: false;
        };
      };
    },
    {
      campaignOperation: {
        create: {
          name: string;
          status: "PAUSED";
          advertisingChannelType: "SEARCH";
          campaignBudget: string;
          manualCpc: Record<string, never>;
          networkSettings: {
            targetGoogleSearch: boolean;
            targetSearchNetwork: boolean;
            targetContentNetwork: boolean;
          };
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING";
        };
      };
    },
  ];
}

export function buildCampaignMutateBody(customerId: string, draft: CampaignDraft): CampaignMutateBody {
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  return {
    partialFailure: false,
    validateOnly: false,
    mutateOperations: [
      {
        campaignBudgetOperation: {
          create: {
            resourceName: budgetResourceName,
            name: draft.budgetName,
            amountMicros: String(draft.amountMicros),
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      },
      {
        campaignOperation: {
          create: {
            name: draft.name,
            status: "PAUSED",
            advertisingChannelType: "SEARCH",
            campaignBudget: budgetResourceName,
            manualCpc: {},
            networkSettings: {
              targetGoogleSearch: draft.targetGoogleSearch,
              targetSearchNetwork: draft.targetSearchNetwork,
              targetContentNetwork: draft.targetContentNetwork,
            },
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          },
        },
      },
    ],
  };
}
