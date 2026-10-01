/**
 * Discovery Foundation: storage contract.
 *
 * Interface only. No implementation and no persistence ship in this step.
 */
import type {
  DiscoveryCandidate,
  DiscoveryJob,
  DiscoveryQueueItem,
  DiscoveryQueueStatus,
  DiscoverySource,
  DiscoveryStatus,
} from "./discovery-types";

export type NewDiscoveryCandidate = Omit<DiscoveryCandidate, "id" | "createdAt" | "status">;

export type NewDiscoveryJob = Pick<DiscoveryJob, "source">;

export interface DiscoveryCandidateFilter {
  source?: string;
  status?: DiscoveryStatus;
}

export interface DiscoveryStore {
  saveSource(source: DiscoverySource): Promise<DiscoverySource>;
  getSource(id: string): Promise<DiscoverySource | null>;
  listSources(): Promise<DiscoverySource[]>;

  saveCandidate(candidate: NewDiscoveryCandidate): Promise<DiscoveryCandidate>;
  getCandidate(id: string): Promise<DiscoveryCandidate | null>;
  listCandidates(filter?: DiscoveryCandidateFilter): Promise<DiscoveryCandidate[]>;
  setCandidateStatus(id: string, status: DiscoveryStatus): Promise<DiscoveryCandidate>;

  startJob(job: NewDiscoveryJob): Promise<DiscoveryJob>;
  finishJob(id: string, result: Pick<DiscoveryJob, "status" | "itemsFound">): Promise<DiscoveryJob>;
  getJob(id: string): Promise<DiscoveryJob | null>;
  listJobs(source?: string): Promise<DiscoveryJob[]>;

  saveQueueItem(item: DiscoveryQueueItem): Promise<DiscoveryQueueItem>;
  getQueueItem(candidateId: string): Promise<DiscoveryQueueItem | null>;
  listQueueItems(status?: DiscoveryQueueStatus): Promise<DiscoveryQueueItem[]>;
}
