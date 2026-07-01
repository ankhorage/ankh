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

interface AnkhResolvedPlannableCommand extends AnkhResolvedProviderCommand {
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
      diagnostics: [
        createPlanningDiagnostic(provider, {
          code: "provider-duplicate-category",
          message: `More than one loaded provider declares the category "${category}", so planning is ambiguous.`,
        }),
      ],
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

  const planningHandlerResult = validateProviderPlanningHandlers(
    resolvedCommand.provider,
  );
  if (planningHandlerResult.handlersByPath === null) {
    return {
      diagnostics: planningHandlerResult.diagnostics,
      resolvedCommand: null,
    };
  }

  const handler = planningHandlerResult.handlersByPath.get(
    getCommandPathKey(resolvedCommand.command.path),
  );

  if (handler === undefined) {
    return {
      diagnostics: [
        createPlanningDiagnostic(resolvedCommand.provider, {
          code: "provider-command-planning-handler-missing",
          message: `Provider command "${resolvedCommand.command.path.join(
            " ",
          )}" does not have a planning handler binding.`,
        }),
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
  return plan.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );
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
      lines.push(
        `     dependsOn: ${
          step.dependsOn.length === 0 ? "none" : step.dependsOn.join(", ")
        }`,
      );
      lines.push(`     destructive: ${step.destructive ? "yes" : "no"}`);
      lines.push(`     status: ${step.status}`);
    }
  }

  lines.push("", "Diagnostics:");
  if (plan.diagnostics.length === 0) {
    lines.push("  - none");
  } else {
    for (const diagnostic of plan.diagnostics) {
      const stepSuffix =
        diagnostic.stepId === undefined ? "" : ` step=${diagnostic.stepId}`;
      lines.push(
        `  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}${stepSuffix}`,
      );
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
    const scopeParts = [
      diagnostic.category,
      diagnostic.packageName,
      diagnostic.packageJsonPath,
      diagnostic.providerModulePath,
    ].filter((part): part is string => part !== undefined);
    const scope = scopeParts.length === 0 ? "" : ` (${scopeParts.join(" | ")})`;
    lines.push(
      `  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}${scope}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

interface ValidateProviderPlanningHandlersResult {
  readonly diagnostics: readonly AnkhCommandPlanningDiagnostic[];
  readonly handlersByPath: ReadonlyMap<string, AnkhPlanningHandler> | null;
}

function validateProviderPlanningHandlers(
  provider: AnkhLoadedProvider,
): ValidateProviderPlanningHandlersResult {
  if (!isRecord(provider.providerModuleDefaultExport)) {
    return {
      diagnostics: [
        createPlanningDiagnostic(provider, {
          code: "provider-missing-planning-handlers",
          message:
            "Provider module default export does not expose planning handlers.",
        }),
      ],
      handlersByPath: null,
    };
  }

  const rawPlanningHandlers =
    provider.providerModuleDefaultExport.planningHandlers;
  if (rawPlanningHandlers === undefined) {
    return {
      diagnostics: [
        createPlanningDiagnostic(provider, {
          code: "provider-missing-planning-handlers",
          message: "Provider does not define planning handlers.",
        }),
      ],
      handlersByPath: null,
    };
  }

  if (!Array.isArray(rawPlanningHandlers)) {
    return {
      diagnostics: [
        createPlanningDiagnostic(provider, {
          code: "invalid-provider-planning-handlers",
          message: 'Provider "planningHandlers" must be an array when present.',
        }),
      ],
      handlersByPath: null,
    };
  }

  const diagnostics: AnkhCommandPlanningDiagnostic[] = [];
  const handlersByPath = new Map<string, AnkhPlanningHandler>();
  const manifestCommandPaths = new Set(
    provider.manifest.commands.map((command) =>
      getCommandPathKey(command.path),
    ),
  );

  for (const rawHandlerBinding of rawPlanningHandlers) {
    if (!isRecord(rawHandlerBinding)) {
      diagnostics.push(
        createPlanningDiagnostic(provider, {
          code: "invalid-provider-planning-handler",
          message: "Each provider planning handler binding must be an object.",
        }),
      );
      continue;
    }

    const path = getCommandPath(rawHandlerBinding.path);
    if (path === null) {
      diagnostics.push(
        createPlanningDiagnostic(provider, {
          code: "invalid-provider-planning-handler-path",
          message:
            'Each provider planning handler "path" must be a non-empty array of non-empty strings.',
        }),
      );
      continue;
    }

    const pathKey = getCommandPathKey(path);
    if (!manifestCommandPaths.has(pathKey)) {
      diagnostics.push(
        createPlanningDiagnostic(provider, {
          code: "provider-planning-handler-unknown-path",
          message: `Provider planning handler path "${path.join(
            " ",
          )}" does not match any manifest command path.`,
        }),
      );
      continue;
    }

    if (handlersByPath.has(pathKey)) {
      diagnostics.push(
        createPlanningDiagnostic(provider, {
          code: "provider-duplicate-planning-handler-path",
          message: `Provider declares more than one planning handler for command path "${path.join(
            " ",
          )}".`,
        }),
      );
      continue;
    }

    if (!isPlanningHandler(rawHandlerBinding.handler)) {
      diagnostics.push(
        createPlanningDiagnostic(provider, {
          code: "provider-planning-handler-not-function",
          message: `Provider planning handler for command path "${path.join(
            " ",
          )}" must be a function.`,
        }),
      );
      continue;
    }

    handlersByPath.set(pathKey, rawHandlerBinding.handler);
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

function createPlanningDiagnostic(
  provider: AnkhLoadedProvider,
  details: {
    readonly code: string;
    readonly message: string;
  },
): AnkhCommandPlanningDiagnostic {
  return {
    category: provider.manifest.category,
    code: details.code,
    message: details.message,
    packageJsonPath: provider.discoveredPackage.packageJsonPath,
    packageName: provider.discoveredPackage.packageName,
    providerModulePath: provider.providerModulePath,
    severity: "error",
  };
}

function getCommandPath(value: unknown): readonly [string, ...string[]] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const path = value.filter(
    (segment): segment is string =>
      typeof segment === "string" && segment.trim().length > 0,
  );

  return path.length === value.length
    ? (path as readonly [string, ...string[]])
    : null;
}

function getCommandPathKey(path: readonly string[]): string {
  return path.join("\u0000");
}

function isPlanningHandler(value: unknown): value is AnkhPlanningHandler {
  return typeof value === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
