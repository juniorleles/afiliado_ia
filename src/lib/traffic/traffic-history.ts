/**
 * Traffic Versioning: history.
 *
 * Lists stored versions for one generated analysis, oldest first. The list is
 * a copy. Nothing here changes a version or the generated analysis.
 */
import { cloneTrafficVersion, type TrafficVersion } from "./traffic-snapshot";

export interface TrafficHistory {
  list(versions: readonly TrafficVersion[], analysisId?: string): TrafficVersion[];
  latest(versions: readonly TrafficVersion[], analysisId: string): TrafficVersion | null;
  get(versions: readonly TrafficVersion[], versionId: string): TrafficVersion | null;
}

function byTimeThenId(a: TrafficVersion, b: TrafficVersion): number {
  if (a.timestamp < b.timestamp) return -1;
  if (a.timestamp > b.timestamp) return 1;
  if (a.versionId < b.versionId) return -1;
  if (a.versionId > b.versionId) return 1;
  return 0;
}

export function createTrafficHistory(): TrafficHistory {
  return {
    list(versions, analysisId) {
      const filtered = analysisId === undefined ? [...versions] : versions.filter((version) => version.analysisId === analysisId);
      return filtered.sort(byTimeThenId).map((version) => cloneTrafficVersion(version));
    },
    latest(versions, analysisId) {
      const list = this.list(versions, analysisId);
      return list.length > 0 ? list[list.length - 1] : null;
    },
    get(versions, versionId) {
      const found = versions.find((version) => version.versionId === versionId);
      return found ? cloneTrafficVersion(found) : null;
    },
  };
}
