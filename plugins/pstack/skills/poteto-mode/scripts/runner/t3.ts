import { FAMILIES } from "./registry/models.ts";
import { EFFORTS } from "./types.ts";

type Options = Record<string, string | boolean>;
type ApiRole = "implementation" | "research" | "review" | "design" | "test" | "general";
type Isolation = "shared" | "worktree";
interface Model {
  id: string;
  options: { id: string; values: (string | boolean)[]; default: string | boolean | null }[];
}
interface Provider {
  providerInstanceId: string;
  driverKind: string;
  canRunChildTask: boolean;
  canRunCrossProviderChildTask: boolean;
  models: Model[];
  omittedModels: number;
  constraints: string[];
}
interface Capabilities {
  inheritedProviderInstanceId: string;
  inheritedModel: string;
  inheritedOptions: Options;
  runtimeMode: string;
  interactionMode: string;
  appOwnedSubagents: boolean;
  providers: Provider[];
}
interface Intent {
  parent: { nativeAvailable: boolean; delegateAvailable: boolean };
  role: string;
  apiRole: ApiRole;
  descriptor: string;
  task: string;
  title: string;
  isolation: Isolation;
  background: boolean;
  access: { intent: "advisory-read-only" | "write"; requireConfinement: boolean; requireNoDelegation: boolean };
  options: Options;
  providerInstanceId?: string;
  capabilities: Capabilities;
}
interface Target {
  providerInstanceId: string;
  model: string;
  options: Options;
}
interface Request {
  task: string;
  title: string;
  role: ApiRole;
  isolation: Isolation;
  mode: "wait" | "async";
  target: Target;
}
interface Controls {
  readOnly: "advisory" | "not-requested";
  confinement: "unattested";
  recursiveDelegation: "unattested";
}
interface Assignment { role: string; descriptor: string }
interface PlanFacts {
  assignment: Assignment;
  controls: Controls;
  context: { runtimeMode: string; interactionMode: string };
}
type Plan =
  | PlanFacts & { kind: "native"; task: string; title: string; expected: Target }
  | PlanFacts & { kind: "delegate"; request: Request }
  | { kind: "dropout"; reason: string; message: string };

class Refusal extends Error {
  constructor(readonly reason: string, message: string) { super(message); }
}
function refuse(reason: string, message: string): never { throw new Refusal(reason, message); }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse("invalid-input", "Expected a JSON object");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) refuse("invalid-input", "Expected a nonempty string");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") refuse("invalid-input", "Expected a boolean");
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) refuse("invalid-input", "Expected an array");
  return value;
}
function optionValue(value: unknown): string | boolean {
  if (typeof value !== "string" && typeof value !== "boolean") refuse("invalid-input", "Option values must be strings or booleans");
  return value;
}
function options(value: unknown): Options {
  return Object.fromEntries(Object.entries(object(value)).map(([id, value]) => [id, optionValue(value)]));
}
function optionList(value: unknown): Options {
  const entries = array(value).map((entry): [string, string | boolean] => {
    const item = object(entry);
    return [string(item.id), optionValue(item.value)];
  });
  if (new Set(entries.map(([id]) => id)).size !== entries.length) refuse("invalid-input", "Duplicate option IDs");
  return Object.fromEntries(entries);
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  for (const allowed of choices) if (value === allowed) return allowed;
  return refuse("invalid-input", `Expected one of ${choices.join(", ")}`);
}
function parseCapabilities(value: unknown): Capabilities {
  const cap = object(value);
  if (cap.inheritedOptions == null || !cap.inheritedModel || !cap.inheritedProviderInstanceId) {
    refuse("incomplete-capabilities", "Inherited provider, model and options must be known");
  }
  const providers = array(cap.providers).map((value): Provider => {
    const provider = object(value);
    const models = array(provider.models).map((value): Model => {
      const model = object(value);
      const parsed = array(model.options ?? []).map((value) => {
        const option = object(value);
        return { id: string(option.id), values: array(option.values).map(optionValue), default: option.default == null ? null : optionValue(option.default) };
      });
      if (new Set(parsed.map((option) => option.id)).size !== parsed.length) refuse("invalid-input", "Duplicate advertised option IDs");
      return { id: string(model.id), options: parsed };
    });
    if (new Set(models.map((model) => model.id)).size !== models.length) refuse("invalid-input", "Duplicate advertised models");
    if (provider.omittedModels != null && (typeof provider.omittedModels !== "number" || !Number.isInteger(provider.omittedModels) || provider.omittedModels < 0)) {
      refuse("invalid-input", "omittedModels must be a nonnegative integer");
    }
    return {
      providerInstanceId: string(provider.providerInstanceId), driverKind: string(provider.driverKind),
      canRunChildTask: boolean(provider.canRunChildTask), canRunCrossProviderChildTask: boolean(provider.canRunCrossProviderChildTask),
      models, omittedModels: typeof provider.omittedModels === "number" ? provider.omittedModels : 0,
      constraints: array(provider.constraints).map(string),
    };
  });
  if (new Set(providers.map((provider) => provider.providerInstanceId)).size !== providers.length) refuse("invalid-input", "Duplicate provider instances");
  return {
    inheritedProviderInstanceId: string(cap.inheritedProviderInstanceId), inheritedModel: string(cap.inheritedModel), inheritedOptions: optionList(cap.inheritedOptions),
    runtimeMode: string(cap.runtimeMode), interactionMode: string(cap.interactionMode),
    appOwnedSubagents: boolean(object(cap.features).appOwnedSubagents), providers,
  };
}
function parseIntent(input: Record<string, unknown>): Intent {
  choice(input.host, ["t3"]);
  if (input.projectId !== undefined) refuse("unsupported-project", "Local T3 delegation stays in this thread's project; project selection requires a linked environment");
  const parent = object(input.parent);
  const lifecycle = object(input.lifecycle);
  const access = object(input.access);
  return {
    parent: { nativeAvailable: boolean(parent.nativeAvailable), delegateAvailable: boolean(parent.delegateAvailable) },
    role: string(input.role), apiRole: choice(input.apiRole, ["implementation", "research", "review", "design", "test", "general"]),
    descriptor: string(input.descriptor), task: string(input.task), title: string(input.title),
    isolation: choice(lifecycle.isolation, ["shared", "worktree"]), background: choice(lifecycle.completion, ["this-turn", "background"]) === "background",
    access: { intent: choice(access.intent, ["advisory-read-only", "write"]), requireConfinement: boolean(access.requireConfinement), requireNoDelegation: boolean(access.requireNoDelegation) },
    options: input.options === undefined ? {} : options(input.options),
    ...(input.providerInstanceId === undefined ? {} : { providerInstanceId: string(input.providerInstanceId) }),
    capabilities: parseCapabilities(input.capabilities),
  };
}
function advertisedModel(provider: Provider, requested: string): Model {
  const exactFamily = FAMILIES.find((family) => family.provider === "claude" && family.model === requested);
  const rollingFamily = exactFamily ?? FAMILIES.find((family) => family.provider === "claude" && "rolling" in family
    && requested.startsWith(family.rolling.revisionPrefix) && /^[0-9]+(?:-[0-9]+)*$/.test(requested.slice(family.rolling.revisionPrefix.length)));
  const rolling = provider.driverKind === "claudeAgent" && rollingFamily && "rolling" in rollingFamily ? rollingFamily.rolling : null;
  const matches = provider.models.filter((model) => rolling
    ? model.id.startsWith(rolling.revisionPrefix) && /^[0-9]+(?:-[0-9]+)*$/.test(model.id.slice(rolling.revisionPrefix.length))
    : model.id === requested);
  if (rolling) matches.sort((left, right) => {
    const leftRevision = left.id.slice(rolling.revisionPrefix.length).split("-").map(Number);
    const rightRevision = right.id.slice(rolling.revisionPrefix.length).split("-").map(Number);
    for (let index = 0; index < Math.max(leftRevision.length, rightRevision.length); index++) {
      const difference = (rightRevision[index] ?? 0) - (leftRevision[index] ?? 0);
      if (difference) return difference;
    }
    return left.id.localeCompare(right.id);
  });
  const selected = matches[0];
  if (!selected) refuse(provider.omittedModels > 0 ? "incomplete-capabilities" : "unavailable-model", `No advertised model for ${requested}; omitted models are not evidence of unavailability`);
  if (rolling && provider.omittedModels > 0) refuse("incomplete-capabilities", `The ${requested} family listing is incomplete`);
  return selected;
}
function checkOptions(model: Model, selected: Options): void {
  for (const [id, value] of Object.entries(selected)) {
    const option = model.options.find((option) => option.id === id);
    if (!option || !option.values.includes(value)) refuse("unsupported-option", `${model.id} does not advertise ${id}=${value}`);
  }
}
function compile(intent: Intent): Plan {
  const cap = intent.capabilities;
  if (intent.access.requireConfinement || intent.access.requireNoDelegation) {
    refuse("unattested-enforcement", "T3 delegation does not attest enforced read-only confinement or disabled recursive delegation");
  }
  const inherited = cap.providers.find((provider) => provider.providerInstanceId === cap.inheritedProviderInstanceId);
  if (!inherited) refuse("incomplete-capabilities", "Inherited provider instance is absent");
  const inherit = intent.descriptor === "auto" || intent.descriptor === "inherit-parent";
  let provider = inherited;
  let modelName = cap.inheritedModel;
  let effort = "default";
  if (!inherit) {
    const parts = /^([^:@]+):([^@]+)@([^@]+)$/.exec(intent.descriptor);
    if (!parts || !parts[1] || !parts[2] || !parts[3] || !EFFORTS.some((value) => value === parts[3])) refuse("invalid-input", "Expected provider:model@effort or inherit-parent/auto");
    const [providerName, requested, requestedEffort] = [parts[1], parts[2], parts[3]];
    if (providerName !== "claude" && providerName !== "codex") refuse("unavailable-provider", `No T3 driver mapping for ${providerName}`);
    const driverKind = providerName === "claude" ? "claudeAgent" : "codex";
    const candidates = cap.providers.filter((candidate) => candidate.driverKind === driverKind
      && (intent.providerInstanceId === undefined || candidate.providerInstanceId === intent.providerInstanceId));
    if (candidates.length > 1) refuse("ambiguous-provider", `Select one ${providerName} providerInstanceId`);
    const candidate = candidates[0];
    if (!candidate) refuse("unavailable-provider", `No advertised T3 provider for ${providerName}`);
    provider = candidate;
    modelName = requested;
    effort = requestedEffort;
  } else if (intent.providerInstanceId !== undefined && intent.providerInstanceId !== inherited.providerInstanceId) {
    refuse("invalid-input", "inherit-parent cannot select another provider instance");
  }
  const model = inherit ? provider.models.find((model) => model.id === modelName) : advertisedModel(provider, modelName);
  if (!model) refuse("incomplete-capabilities", "The inherited model must be advertised exactly; never substitute a family revision");
  const selected: Options = inherit ? { ...cap.inheritedOptions } : Object.fromEntries(model.options.flatMap((option) => option.default === null ? [] : [[option.id, option.default]]));
  const effortId = provider.driverKind === "codex" ? "reasoningEffort" : "effort";
  if (effort !== "default") {
    if (intent.options[effortId] !== undefined && intent.options[effortId] !== effort) refuse("conflicting-effort", "Descriptor effort and explicit options disagree");
    selected[effortId] = effort;
  }
  Object.assign(selected, intent.options);
  checkOptions(model, selected);
  const target: Target = { providerInstanceId: provider.providerInstanceId, model: model.id, options: selected };
  const controls: Controls = { readOnly: intent.access.intent === "advisory-read-only" ? "advisory" : "not-requested", confinement: "unattested", recursiveDelegation: "unattested" };
  const facts: PlanFacts = { assignment: { role: intent.role, descriptor: intent.descriptor }, controls, context: { runtimeMode: cap.runtimeMode, interactionMode: cap.interactionMode } };
  const task = intent.task + (controls.readOnly === "advisory" ? "\n\nAccess intent: advisory read-only. Do not edit files. This is an instruction, not enforced confinement." : "");
  const native = provider.providerInstanceId === cap.inheritedProviderInstanceId && model.id === cap.inheritedModel
    && sameOptions(selected, cap.inheritedOptions) && effort === "default" && Object.keys(intent.options).length === 0
    && intent.isolation === "shared" && !intent.background;
  if (native) {
    if (!intent.parent.nativeAvailable) refuse("missing-tool", "The inherited native tool is unavailable; do not fall back");
    return { kind: "native", ...facts, task, title: intent.title, expected: target };
  }
  if (!intent.parent.delegateAvailable || !cap.appOwnedSubagents) refuse("missing-tool", "T3 delegate_task is unavailable; do not use a CLI fallback");
  if (!provider.canRunChildTask || provider.constraints.length || inherited.constraints.length
    || (provider.providerInstanceId !== inherited.providerInstanceId && (!provider.canRunCrossProviderChildTask || !inherited.canRunCrossProviderChildTask))) {
    refuse("provider-constraint", "Advertised provider constraints do not permit this delegation");
  }
  return { kind: "delegate", ...facts, request: { task, title: intent.title, role: intent.apiRole, isolation: intent.isolation, mode: intent.background ? "async" : "wait", target } };
}
function sameOptions(left: Options, right: Options): boolean {
  return Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([id, value]) => Object.hasOwn(right, id) && right[id] === value);
}
interface ResultFacts {
  assignment: Assignment;
  request: Request;
  launch: unknown;
  response: unknown;
  evidence: { configuration: "t3-report" | "unattested"; servedModel: "unattested"; controls: Controls };
}
type Result = ResultFacts & (
  | { kind: "t3-pending" }
  | { kind: "t3-complete"; output: string }
  | { kind: "t3-dropout"; reason: string }
);
function normalize(planValue: unknown, response: unknown, launch: unknown): Result {
  const plan = object(planValue);
  if (plan.kind !== "delegate") refuse("invalid-input", "Only a compiled delegate plan has a T3 response; keep native transcripts separately");
  const target = object(object(plan.request).target);
  const expected = { providerInstanceId: string(target.providerInstanceId), model: string(target.model), options: options(target.options) };
  const rawControls = object(plan.controls);
  const controls: Controls = {
    readOnly: choice(rawControls.readOnly, ["advisory", "not-requested"]),
    confinement: choice(rawControls.confinement, ["unattested"]),
    recursiveDelegation: choice(rawControls.recursiveDelegation, ["unattested"]),
  };
  const rawRequest = object(plan.request);
  const rawAssignment = object(plan.assignment);
  const request: Request = {
    task: string(rawRequest.task), title: string(rawRequest.title),
    role: choice(rawRequest.role, ["implementation", "research", "review", "design", "test", "general"]),
    isolation: choice(rawRequest.isolation, ["shared", "worktree"]), mode: choice(rawRequest.mode, ["wait", "async"]),
    target: expected,
  };
  const facts: ResultFacts = {
    assignment: { role: string(rawAssignment.role), descriptor: string(rawAssignment.descriptor) }, request, launch: launch ?? null, response,
    evidence: { configuration: "unattested", servedModel: "unattested", controls },
  };
  const dropout = (reason: string): Result => ({ kind: "t3-dropout", reason, ...facts });
  let actual;
  let raw;
  try {
    raw = object(response);
    actual = {
      taskId: string(raw.taskId),
      status: choice(raw.status, ["queued", "running", "waiting", "completed", "failed", "cancelled", "interrupted"]),
      workState: choice(raw.workState, ["working", "waiting_for_children", "result_available"]),
      hasPendingChildRuns: boolean(raw.hasPendingChildRuns), hasPendingQuestion: boolean(raw.hasPendingQuestion), waitTimedOut: boolean(raw.waitTimedOut),
      pendingApproval: raw.pendingApproval, latestTerminalStatus: raw.latestTerminalStatus,
      output: typeof raw.latestTerminalSummary === "string" && raw.latestTerminalSummary.trim() ? raw.latestTerminalSummary : raw.summary,
    };
    if (raw.pendingApproval === undefined || (raw.pendingApproval !== null && (typeof raw.pendingApproval !== "object" || Array.isArray(raw.pendingApproval)))) return dropout("ambiguous-acceptance");
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return dropout("ambiguous-acceptance");
  }
  const failure = actual.status === "failed" || actual.status === "cancelled" || actual.status === "interrupted";
  const pending = actual.status !== "completed" || actual.workState !== "result_available" || actual.hasPendingChildRuns || actual.pendingApproval !== null || actual.hasPendingQuestion || actual.waitTimedOut;
  if (launch != null) {
    try {
      if (string(object(launch).taskId) !== actual.taskId) return dropout("task-mismatch");
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      return dropout("ambiguous-acceptance");
    }
  } else if (request.mode === "async" && !pending && !failure) {
    return dropout("missing-launch-evidence");
  }
  try {
    if (typeof raw.providerInstanceId === "string" && typeof raw.model === "string" && Array.isArray(raw.options)) facts.evidence.configuration = "t3-report";
    const reported = { providerInstanceId: string(raw.providerInstanceId), model: string(raw.model), options: optionList(raw.options) };
    if (!sameOptions(reported.options, expected.options) || reported.providerInstanceId !== expected.providerInstanceId || reported.model !== expected.model) return dropout("configuration-mismatch");
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    if (failure) return dropout(actual.status);
    return pending ? { kind: "t3-pending", ...facts } : dropout("ambiguous-acceptance");
  }
  if (failure) return dropout(actual.status);
  if (pending) return { kind: "t3-pending", ...facts };
  if (actual.latestTerminalStatus !== "completed") return dropout("ambiguous-acceptance");
  if (typeof actual.output !== "string" || !actual.output.trim()) return dropout("empty-output");
  return { kind: "t3-complete", ...facts, output: actual.output };
}
try {
  const input = object(JSON.parse(await Bun.stdin.text()));
  const operation = choice(input.operation, ["compile", "normalize"]);
  const result = operation === "compile" ? compile(parseIntent(input)) : normalize(input.plan, input.response, input.launch);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ kind: "dropout", reason: error instanceof Refusal ? error.reason : "invalid-input", message: error instanceof Error ? error.message : String(error) })}\n`);
}
