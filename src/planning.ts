import type { AnkhCommandContext } from "./commandContext.js";
import type { AnkhPackageRegistry } from "./packageRegistry.js";
import type { AnkhLoadedProvider } from "./providerManifestLoader.js";
import type {
  AnkhCommandListing,
  AnkhProviderRegistry,
  AnkhResolvedProviderCommand,
} from "./providerRegistry.js";

export interface AnkhCommandPlanDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "info" | "warning" | "error";
  readonly stepId?: string;
}

export interface AnkhCommandPlanStep {
  readonly capability: string;
  readonly dependsOn: readonly string[];
  readonly destructive: boolean;
  readonly id: string;
  readonly inputs?: unknown;
  readonly label: string;
  readonly outputs?: unknown;
  readonly providerId: string;
  readonly status: "planned" | "blocked";
}

export interface AnkhCommandPlan {
  readonly diagnostics: readonly AnkhCommandPlanDiagnostic[];
  readonly kind: "ankh-command-plan";
  readonly steps: readonly AnkhCommandPlanStep[];
  readonly title: string;
  readonly version: 1;
}

export interface AnkhPlanningContext extends AnkhCommandContext {
  readonly packageRegistry: AnkhPackageRegistry;
  readonly providerRegistry: AnkhProviderRegistry;
}

export interface AnkhPlanningRequest {
  readonly argv: readonly string[];
  readonly command: AnkhCommandListing;
  readonly context: AnkhPlanningContext;
  readonly provider: AnkhLoadedProvider;
}

export type AnkhPlanningHandler = (
  request: AnkhPlanningRequest,
) => AnkhCommandPlan | Promise<AnkhCommandPlan>;

export interface AnkhPlanningHandlerBinding {
  readonly handler: AnkhPlanningHandler;
  readonly path: readonly [string, ...string[]];
}

export interface AnkhCommandPlanningDiagnostic {
  readonly category?: string;
  readonly code: string;
  readonly message: string;
  readonly packageJsonPath: string;
  readonly packageName: string;
  readonly providerModulePath?: string;
  readonly severity: "error";
}

export interface AnkhResolvedPlannableCommand extends AnkhResolvedProviderCommand {
  readonly handler: AnkhPlanningHandler;
}

export interface ResolvePlannableCommandResult {
  readonly diagnostics: readonly AnkhCommandPlanningDiagnostic[];
  readonly resolvedCommand: AnkhResolvedPlannableCommand | null;
}

export function resolvePlannableCommand(
  providerRegistry: AnkhProviderRegistry,
  category: string,
  tokens: readonly string[],
): ResolvePlannableCommandResult {
  const categoryProviders = providerRegistry.findAllByCategory(category);
  if (categoryProviders.length > 1) {
    const [provider] = categoryProviders;
    if (provider === undefined) {
      return {
        diagnostics: [],
        resolvedCommand: null,
      };
    }

    return {
      diagnostics: [createDiagnostic(provider, "provider-duplicate-category")],
      resolvedCommand: null,
    };
  }

  const resolvedCommand = providerRegistry.resolveCommand(category, tokens);
  if (resolvedCommand === null) {
    return {
      diagnostics: [],
      resolvedCommand: null,
    };
  }

  const validation = validateProviderPlanningHandlers(resolvedCommand.provider);
  if (validation.handlersByPath === null) {
    return {
      diagnostics: validation.diagnostics,
      resolvedCommand: null,
    };
  }

  const handler = validation.handlersByPath.get(
    getCommandPathKey(resolvedCommand.command.path),
  );
  if (handler === undefined) {
    return {
      diagnostics: [
        createDiagnostic(
          resolvedCommand.provider,
          "provider-command-planning-handler-missing",
        ),
      ],
      resolvedCommand: null,
    };
  }

  return {
    diagnostics: [],
    resolvedCommand: {
      ...resolvedCommand,
      handler,
    },
  };
}

export function hasCommandPlanErrors(plan: AnkhCommandPlan): boolean {
  return plan.diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function renderCommandPlan(plan: AnkhCommandPlan): string {
  const lines = [
    `Plan: ${plan.title}`,
    `kind: ${plan.kind}`,
    `version: ${plan.version}`,
    "",
    "Steps:",
  ];

  if (plan.steps.length === 0) {
    lines.push("  - none");
  } else {
    for (const [index, step] of plan.steps.entries()) {
      lines.push(`  ${index + 1}. ${step.label}`);
      lines.push(`     id: ${step.id}`);
      lines.push(`     provider: ${step.providerId}`);
      lines.push(`     capability: ${step.capability}`);
      lines.push(`     dependsOn: ${renderDependencyList(step.dependsOn)}`);
      lines.push(`     destructive: ${step.destructive ? "yes" : "no"}`);
      lines.push(`     status: ${step.status}`);
    }
  }

  lines.push("", "Diagnostics:");
  if (plan.diagnostics.length === 0) {
    lines.push("  - none");
  } else {
    for (const diagnostic of plan.diagnostics) {
      lines.push(renderPlanDiagnostic(diagnostic));
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function renderCommandPlanJson(plan: AnkhCommandPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function renderPlanningDiagnostics(
  diagnostics: readonly AnkhCommandPlanningDiagnostic[],
): string {
  if (diagnostics.length === 0) {
    return "";
  }

  const lines = ["Ankh command planning diagnostics:", ""];
  for (const diagnostic of diagnostics) {
    const scope = renderDiagnosticScope(diagnostic);
    lines.push(
      `  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}${scope}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

interface PlanningHandlerValidationResult {
  readonly diagnostics: readonly AnkhCommandPlanningDiagnostic[];
  readonly handlersByPath: ReadonlyMap<string, AnkhPlanningHandler> | null;
}

function validateProviderPlanningHandlers(
  provider: AnkhLoadedProvider,
): PlanningHandlerValidationResult {
  if (!isRecord(provider.providerModuleDefaultExport)) {
    return {
      diagnostics: [createDiagnostic(provider, "provider-missing-planning-handlers")],
      handlersByPath: null,
    };
  }

  const rawBindings = provider.providerModuleDefaultExport.planningHandlers;
  if (rawBindings === undefined) {
    return {
      diagnostics: [createDiagnostic(provider, "provider-missing-planning-handlers")],
      handlersByPath: null,
    };
  }

  if (!Array.isArray(rawBindings)) {
    return {
      diagnostics: [createDiagnostic(provider, "invalid-provider-planning-handlers")],
      handlersByPath: null,
    };
  }

  const diagnostics: AnkhCommandPlanningDiagnostic[] = [];
  const handlersByPath = new Map<string, AnkhPlanningHandler>();
  const manifestPaths = new Set(
    provider.manifest.commands.map((command) =>
      getCommandPathKey(command.path),
    ),
  );

  for (const rawBinding of rawBindings) {
    const binding = getPlanningBinding(provider, rawBinding, manifestPaths);
    if (binding.diagnostic !== null) {
      diagnostics.push(binding.diagnostic);
      continue;
    }

    if (handlersByPath.has(binding.pathKey)) {
      diagnostics.push(
        createDiagnostic(provider, "provider-duplicate-planning-handler-path"),
      );
      continue;
    }

    handlersByPath.set(binding.pathKey, binding.handler);
  }

  if (diagnostics.length > 0) {
    return {
      diagnostics,
      handlersByPath: null,
    };
  }

  return {
    diagnostics: [],
    handlersByPath,
  };
}

function getPlanningBinding(
  provider: AnkhLoadedProvider,
  rawBinding: unknown,
  manifestPaths: ReadonlySet<string>,
):
  | {
      readonly diagnostic: AnkhCommandPlanningDiagnostic;
      readonly handler?: never;
      readonly pathKey?: never;
    }
  | {
      readonly diagnostic: null;
      readonly handler: AnkhPlanningHandler;
      readonly pathKey: string;
    } {
  if (!isRecord(rawBinding)) {
    return {
      diagnostic: createDiagnostic(provider, "invalid-provider-planning-handler"),
    };
  }

  const path = getCommandPath(rawBinding.path);
  if (path === null) {
    return {
      diagnostic: createDiagnostic(
        provider,
        "invalid-provider-planning-handler-path",
      ),
    };
  }

  const pathKey = getCommandPathKey(path);
  if (!manifestPaths.has(pathKey)) {
    return {
      diagnostic: createDiagnostic(provider, "provider-planning-handler-unknown-path"),
    };
  }

  if (!isPlanningHandler(rawBinding.handler)) {
    return {
      diagnostic: createDiagnostic(provider, "provider-planning-handler-not-function"),
    };
  }

  return {
    diagnostic: null,
    handler: rawBinding.handler,
    pathKey,
  };
}

function createDiagnostic(
  provider: AnkhLoadedProvider,
  code: string,
): AnkhCommandPlanningDiagnostic {
  return {
    category: provider.manifest.category,
    code,
    message: getDiagnosticMessage(code),
    packageJsonPath: provider.discoveredPackage.packageJsonPath,
    packageName: provider.discoveredPackage.packageName,
    providerModulePath: provider.providerModulePath,
    severity: "error",
  };
}

function getDiagnosticMessage(code: string): string {
  const messages: Record<string, string> = {
    "invalid-provider-planning-handler":
      "Each provider planning handler binding must be an object.",
    "invalid-provider-planning-handler-path":
      'Each provider planning handler "path" must be a non-empty array of non-empty strings.',
    "invalid-provider-planning-handlers":
      'Provider "planningHandlers" must be an array when present.',
    "provider-command-planning-handler-missing":
      "Provider command does not have a planning handler binding.",
    "provider-duplicate-category":
      "More than one loaded provider declares this category, so planning is ambiguous.",
    "provider-duplicate-planning-handler-path":
      "Provider declares more than one planning handler for the same command path.",
    "provider-missing-planning-handlers":
      "Provider does not define planning handlers.",
    "provider-planning-handler-not-function":
      "Provider planning handler must be a function.",
    "provider-planning-handler-unknown-path":
      "Provider planning handler path does not match any manifest command path.",
  };

  return messages[code] ?? "Provider planning handler is invalid.";
}

function getCommandPath(value: unknown): readonly [string, ...string[]] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const segment of value) {
    if (typeof segment !== "string" || segment.trim().length === 0) {
      return null;
    }
    parts.push(segment);
  }

  const [head, ...rest] = parts;
  return head === undefined ? null : [head, ...rest];
}

function getCommandPathKey(path: readonly string[]): string {
  return path.join("\0");
}

function isPlanningHandler(value: unknown): value is AnkhPlanningHandler {
  return typeof value === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function renderDependencyList(dependencies: readonly string[]): string {
  return dependencies.length === 0 ? "none" : dependencies.join(", ");
}

function renderDiagnosticScope(
  diagnostic: AnkhCommandPlanningDiagnostic,
): string {
  const parts = [
    diagnostic.category,
    diagnostic.packageName,
    diagnostic.packageJsonPath,
    diagnostic.providerModulePath,
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? "" : ` (${parts.join(" | ")})`;
}

function renderPlanDiagnostic(diagnostic: AnkhCommandPlanDiagnostic): string {
  const stepSuffix =
    diagnostic.stepId === undefined ? "" : ` step=${diagnostic.stepId}`;
  return `  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}${stepSuffix}`;
}
