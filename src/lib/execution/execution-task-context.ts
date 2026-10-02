/**
 * Execution Task Framework: shared context.
 *
 * One immutable context is handed to every task in a collect. It carries a
 * Decision Analysis id holder, a workflow snapshot id holder, execution
 * metadata, runtime metadata, and configuration. Each named record is an id
 * holder only: the framework does not read fields beyond the id and does not
 * copy or change a Decision Analysis or a workflow snapshot.
 *
 * It is created empty and holds only what the caller hands in, as copies:
 * nothing here reads a file, a database, the network, or any other engine.
 * Later changes to the caller's objects never reach a task, and a task cannot
 * change what other tasks see.
 */
import { ExecutionTaskFrameworkError } from "./execution-task-registry";
import { validateExecutionTaskContext } from "./execution-task-validator";
import type { ExecutionMetadata } from "./execution-types";

export interface ExecutionTaskContext {
  /** The Decision Analysis this plan reads. An id holder only. */
  readonly decisionAnalysis: { readonly id: string } | null;
  /** The workflow snapshot this plan reads. An id holder only. */
  readonly workflowSnapshot: { readonly id: string } | null;
  readonly executionMetadata: Readonly<ExecutionMetadata>;
  readonly runtimeMetadata: Readonly<ExecutionMetadata>;
  readonly configuration: Readonly<ExecutionMetadata>;
}

export type ExecutionTaskContextInit = Partial<{
  decisionAnalysis: { id: string } | null;
  workflowSnapshot: { id: string } | null;
  executionMetadata: ExecutionMetadata;
  runtimeMetadata: ExecutionMetadata;
  configuration: ExecutionMetadata;
}>;

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepExecutionTask<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepExecutionTask(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

function copyPlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlain(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlain(inner)])) as T;
  }
  return value;
}

function copyId(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

/**
 * Builds a frozen context from copies of the inputs. Every member defaults
 * to empty. Throws ExecutionTaskFrameworkError for metadata that is not flat
 * and for members that are not id holders.
 */
export function createExecutionTaskContext(init: ExecutionTaskContextInit = {}): ExecutionTaskContext {
  const issues = validateExecutionTaskContext(init ?? {});
  if (issues.length > 0) throw new ExecutionTaskFrameworkError("Context is invalid.", issues);
  const source = init ?? {};
  return freezeDeepExecutionTask({
    decisionAnalysis: copyId(source.decisionAnalysis),
    workflowSnapshot: copyId(source.workflowSnapshot),
    executionMetadata: copyPlain(source.executionMetadata ?? {}),
    runtimeMetadata: copyPlain(source.runtimeMetadata ?? {}),
    configuration: copyPlain(source.configuration ?? {}),
  });
}
