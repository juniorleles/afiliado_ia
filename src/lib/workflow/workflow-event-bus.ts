/**
 * Workflow Engine: event bus.
 *
 * Holds listeners. It notifies them in subscription order and never applies a
 * move, never runs work, and never records a business choice. A listener that
 * throws is skipped; the bus itself never throws.
 */
import type { WorkflowEvent, WorkflowEventType } from "./workflow-event";

export type WorkflowEventHandler = (event: WorkflowEvent) => void;
export type WorkflowEventSubscription = WorkflowEventType | "*";

export interface WorkflowEventBus {
  subscribe(type: WorkflowEventSubscription, handler: WorkflowEventHandler): () => void;
  dispatch(event: WorkflowEvent): number;
}

export function createWorkflowEventBus(): WorkflowEventBus {
  const listeners: Array<{ type: WorkflowEventSubscription; handler: WorkflowEventHandler }> = [];

  return {
    subscribe(type, handler) {
      const entry = { type, handler };
      listeners.push(entry);
      return () => {
        const index = listeners.indexOf(entry);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    dispatch(event) {
      let notified = 0;
      for (const listener of [...listeners]) {
        if (listener.type !== "*" && listener.type !== event.type) continue;
        try {
          listener.handler(event);
          notified += 1;
        } catch {
          /* a listener failure does not stop the others */
        }
      }
      return notified;
    },
  };
}
