/**
 * Execution Task Framework: task builder.
 *
 * Builds one plan fragment from a task module and always returns a result: a
 * task that throws, fails validation, or returns a malformed output becomes a
 * FAILED result instead of stopping the collect. The builder adds the task
 * id, restated dependencies, and collect order; it runs no work, reaches no
 * outside system, and never produces a score.
 */
import type {
  ExecutionTaskDependencies,
  ExecutionTaskModule,
  ExecutionTaskOutput,
  ExecutionTaskResult,
  ExecutionTaskUpstream,
} from "./execution-task-contract";
import { freezeDeepExecutionTask, type ExecutionTaskContext } from "./execution-task-context";
import { validateExecutionTaskOutput } from "./execution-task-validator";

function copyDependencies(deps: ExecutionTaskDependencies): ExecutionTaskDependencies {
  return {
    requires: [...deps.requires],
    optional: [...deps.optional],
    conflicts: [...deps.conflicts],
  };
}

function result(taskId: string, output: ExecutionTaskOutput, dependencies: ExecutionTaskDependencies, executionOrder: number): ExecutionTaskResult {
  return freezeDeepExecutionTask({
    taskId,
    status: output.status,
    warnings: [...output.warnings],
    metadata: { ...output.metadata },
    estimatedDuration: output.estimatedDuration,
    dependencies: copyDependencies(dependencies),
    executionOrder,
  });
}

function named(taskId: string, status: ExecutionTaskResult["status"], warning: string, dependencies: ExecutionTaskDependencies, executionOrder: number): ExecutionTaskResult {
  return result(taskId, { status, warnings: [warning], metadata: {}, estimatedDuration: null }, dependencies, executionOrder);
}

/** A SKIPPED result for a task that was not built. */
export function skippedExecutionTaskResult(taskId: string, warning: string, dependencies: ExecutionTaskDependencies, executionOrder: number): ExecutionTaskResult {
  return named(taskId, "SKIPPED", warning, dependencies, executionOrder);
}

/** A BLOCKED result for a task whose required task was not READY. */
export function blockedExecutionTaskResult(taskId: string, warning: string, dependencies: ExecutionTaskDependencies, executionOrder: number): ExecutionTaskResult {
  return named(taskId, "BLOCKED", warning, dependencies, executionOrder);
}

export async function buildExecutionTask(
  module: ExecutionTaskModule,
  context: ExecutionTaskContext,
  upstream: ExecutionTaskUpstream,
  executionOrder: number,
): Promise<ExecutionTaskResult> {
  const failed = (warnings: string[]): ExecutionTaskResult =>
    result(module.id, { status: "FAILED", metadata: {}, warnings, estimatedDuration: null }, module.dependencies, executionOrder);

  try {
    if (!module.supportsPlan(context)) {
      return skippedExecutionTaskResult(module.id, "Task does not support this plan.", module.dependencies, executionOrder);
    }
    const problems = module.validate(context);
    if (problems.length > 0) return failed(problems.map((p) => `${p.field}: ${p.message}`));

    const output = await module.build(context, upstream);
    const issues = validateExecutionTaskOutput(output);
    if (issues.length > 0) return failed(issues.map((i) => `Invalid task output, ${i.field}: ${i.message}`));
    return result(module.id, output, module.dependencies, executionOrder);
  } catch (error) {
    return failed([error instanceof Error ? error.message : "Task threw an error."]);
  }
}
