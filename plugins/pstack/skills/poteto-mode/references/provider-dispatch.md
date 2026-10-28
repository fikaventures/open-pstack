# Provider dispatch

pstack model choices are provider-qualified descriptors:

```text
<provider>:<model>@<effort>
```

## Model catalog

The generated [model catalog](model-catalog.md) holds the model facts: the model matrix, kept predecessors and rolling aliases, the route table, provider notes, and role defaults. Match a descriptor's `(provider, model)` there.

The allowed effort universe is exactly `low`, `medium`, `high`, `xhigh`, `max`, `ultra`, and `default`, which passes no effort flag. A row offers `default` only when its Selectable efforts cell lists it. A row offers `ultra` only when its CLI's model entry lists that effort; for Codex, that is the model's entry in `codex`'s model list. First-run requested efforts are the Default effort cell of each row. Per spawn, the parent may move a role's effort to another effort that the row lists, under poteto-mode's Match the model to the job rule. A child never changes its assigned effort.

A rolling alias, such as `opus`, names a family whose CLI resolves it to the latest available family revision. A runner receipt keeps the requested alias in `model` and the concrete provider-reported revision in `reportedModel`; verification accepts only a revision of the matching family, as the catalog's rolling-alias table gives it.

A descriptor whose `(provider, model)` matches no matrix row, kept predecessor, or rolling-alias revision is an unregistered pair. It runs unchanged on an external route and on Codex's native route. A Claude-native route needs a generated agent, so an unregistered Claude model on a Claude Code parent is a dropout. Never guess a replacement.

## Read-time normalization

Match each configured descriptor before choosing a route, in this order: an exact model-matrix row, then a kept predecessor, then a rolling-alias revision. A model that is its own matrix row, such as a registered exact pin, is never normalized. If a provider-qualified model matches no matrix row or kept predecessor and is a versioned predecessor of a rolling alias in the catalog, replace that model component in memory with the alias. Preserve provider, effort, role, and lane order. Use only the normalized descriptor for native dispatch or runner argv. Never pass the versioned predecessor to Claude.

This read-time rule makes an older installed sheet use the latest family revision immediately without writing user files. Once per parent run, report that the persisted sheet is stale and that `/setup-pstack` will rewrite it after its normal probes and confirmation. Unknown versioned Claude models remain invalid. The external runner rejects a missed rolling-alias version pin instead of silently executing it.

A kept predecessor in the catalog matches its family. Dispatch it with the sheet's model until `/setup-pstack` replaces it, and with the sheet's effort or a per-spawn effort that its row lists. Do not rewrite its model in memory.

## The parent owns the route

The top-level harness resolves the route once. A child receives an assigned provider, model, effort, access mode, prompt, working directory, and output path. A child never detects the harness, chooses a provider, or launches another model. Environment markers may corroborate the top-level harness before fan-out, but nested processes inherit parent markers and must not use them for routing.

The catalog's [route table](model-catalog.md#routes) gives each provider's route from each parent. Outside T3, a provider native to the parent uses the parent's subagent primitive. Every other provider uses the external runner.

`inherit-parent` and `auto` remain aliases. They use the parent's current model and effort. On T3, apply the host eligibility rules below before choosing the native tool. In a panel they still consume one lane, but they reduce provider diversity; say so in the synthesis record.

## T3 host, 2026-10-28

This host route makes pstack compatible with host-owned delegation. It takes precedence over the standalone native, external CLI, worktree, wait, and receipt mappings below. Keep the same skill tree and model sheet. T3 is a host, not a runner provider or a new CLI Parent.

The parent identifies T3 from the actual session instructions. Never infer the host from inherited environment variables. A required T3 tool missing from that session is a named refusal. Do not fall back to a model CLI, another provider, or another orchestration mechanism.

### Compile the selected assignment

The parent calls `orchestrator_capabilities` once per thread before its first `delegate_task`. Refresh only after an error or a user-named provider change. Preserve the actual structured capability object. If the snapshot omits a selected model or a rolling family's revisions, report incomplete capabilities rather than declaring the model unavailable. Do not guess from the short list or silently search and select another model.

Run `skills/poteto-mode/scripts/runner/pstack-t3` with one JSON object on stdin. The helper emits one JSON object on stdout. It never calls MCP or HTTP, launches models, or manages tasks. Its shell launcher disables project Bun config, dotenv loading, and injected Bun or Node options, as the CLI launchers do. A tagged refusal exits zero so the parent can save and inspect it. Read `kind`, not just the process exit code.

Compile input has these fields:

- `operation: "compile"`, `host: "t3"`, and `parent: {nativeAvailable, delegateAvailable}` from the actual session tool inventory.
- `role`, the pstack role name, and `apiRole`, one of T3's `implementation`, `research`, `review`, `design`, `test`, or `general` roles. These are separate identities.
- `descriptor`, the selected `provider:model@effort`, `inherit-parent`, or `auto`, plus `task` and `title`.
- `lifecycle: {isolation: "shared"|"worktree", completion: "this-turn"|"background"}`.
- `access: {intent: "advisory-read-only"|"write", requireConfinement: boolean, requireNoDelegation: boolean}`.
- `capabilities`, the parent-obtained T3 structured object, with `inheritedProviderInstanceId`, `inheritedModel`, `inheritedOptions`, `runtimeMode`, `interactionMode`, `providers`, and `features`.
- Optional `options`, a record of exact requested option IDs and values, and `providerInstanceId` to select an ambiguous instance. Local delegates stay in the current thread's project. A `projectId` selection refuses; linked-environment delegation is outside this helper's scope.

The output is a `native`, `delegate`, or `dropout` plan. Native eligibility requires unchanged inherited provider, model, and settings, shared isolation, and completion this turn. Explicit requested settings require `delegate_task` even when equal to the inherited setting. Cross-provider, cross-model, worktree, background, or explicit project selection also requires `delegate_task`. A native plan contains the task and expected inheritance. Use the session's native tool without provider, model, or option overrides. Claude `Agent` uses `run_in_background: false`. Wait for that native result this turn and retain its transcript separately.

A delegate plan contains `request` with only these API fields:

```json
{
	"task": "The complete child brief",
	"title": "A short title",
	"role": "implementation",
	"isolation": "worktree",
	"mode": "wait",
	"target": {
		"providerInstanceId": "the advertised instance",
		"model": "the advertised concrete model",
		"options": {"reasoningEffort": "max"}
	}
}
```

Pass `request` directly to the real `delegate_task` tool. No child checkout commands or `cwd` belong in it. T3 prepares the worktree. It starts from the parent's commit, so uncommitted changes are not shared. Worktrees separate files but do not confine a process. Never create a child checkout in the shell or tell the child to create one.

The compiler maps pstack's `codex` provider to T3's `codex` driver and `claude` to `claudeAgent`. An ambiguous provider instance refuses unless explicitly selected. Claude rolling aliases use the existing catalog's family prefixes and select the highest numeric revision from a complete family listing. Partial family listings refuse. After that refusal, obtain a focused capability snapshot for the selected family and retain both snapshots. Exact registered pins stay exact. `inherit-parent` preserves the exact inherited revision. No other model is substituted.

Codex effort maps to `target.options.reasoningEffort`. Claude effort maps to `target.options.effort`. The exact value must appear in that model's advertised option values. Never lower an unsupported requested effort. Explicit descriptors start with the selected model's advertised option defaults, including `serviceTier` when present. `@default` adds no effort override. Optional settings without advertised defaults are omitted unless explicitly requested. `inherit-parent` and `auto` copy the complete inherited options, including service tier. Explicit `options` then override these values. A conflicting descriptor effort refuses. A different model never inherits foreign option IDs. Empty options explicitly clear overrides under T3's API contract.

Runtime and interaction modes are context, not permission attestations or launch overrides. The compiler passes neither field to `delegate_task`. An advisory no-edit review appends a labeled instruction to the task. REQUIRED enforced confinement, read-only sandboxing, or disabled recursive delegation refuses before launch because this API does not attest those controls. Do not reinterpret a CLI `read-only` access mode or the model sheet's Codex writer sandbox setting as a T3 guarantee. State advisory intent explicitly or record the refusal when enforcement is required.

### Retain T3 lifecycle evidence

Save the compiled plan and actual structured tool response. Normalize them with `{"operation":"normalize","plan":<compiled plan>,"response":<actual structured response>}` on stdin to the same executable. After a pending launch, add `launch` with that retained structured launch response when normalizing a later response. Task identities must match. Async completion requires launch evidence. Normalize only delegate plans. Native results keep native transcript evidence.

The result is tagged `t3-pending`, `t3-complete`, or `t3-dropout`. Running, queued, waiting, approval, question, wait timeout, and a completed turn with live child runs remain pending. A wait timeout does not cancel a child. Only matching provider, concrete model, and complete option values, a completed terminal status, no live work, and nonempty actual summary output yield `t3-complete`. Failure, cancellation, interruption, mismatch, empty output, and ambiguous acceptance stay distinct dropouts. Keep the raw response, task identity, child thread link, `next`, and opaque context-transfer references. An ambiguous response may represent an accepted task. Never relaunch automatically.

Follow the actual response's `next`. Async completion wakes the parent. End the turn when instructed and resume on the completion notification. Do not poll with `task_status`, sleep loops, watchers, Monitor, or ScheduleWakeup. Use `task_cancel` with the retained task identity when cancelling superseded or unwanted work. Never use `t3_thread_interrupt` on its child thread. A new review or re-check is a fresh `delegate_task` with the brief, findings, and objections, not `t3_thread_send`. Fix small review findings directly. If told to use fewer delegates, cancel extras without replacements.

T3 records prove the host reported a configuration and result. They are not schema-version-1 CLI receipts or proof of the model actually served. They never synthesize argv, an exit status, pinned-argv evidence, usage, cost, sandbox enforcement, or recursion enforcement. Unknown controls remain `unattested`. Keep any fields the host really returns under the raw response rather than promoting them into CLI evidence.

### Exercise the real host

Run the process checks from the source root and retain the JSONL artifact:

```sh
python3 tests/t3-e2e.py --helper plugins/pstack/skills/poteto-mode/scripts/runner/pstack-t3 --artifacts /absolute/private-artifacts/t3-boundary
```

For the live exercise, choose a permitted selected descriptor and advisory read-only shared task. A useful task is `Reply with exactly PSTACK_T3_LIVE_2026_10_28. Do not edit files or run commands.` Use `completion: "this-turn"` and a descriptor with an explicit effort to exercise `delegate_task`. Obtain the capability snapshot and tool inventory from the actual parent. Save the compile input as `input.json` in a private artifact directory. Then run:

```sh
"<plugin-root>/skills/poteto-mode/scripts/runner/pstack-t3" < input.json > plan.json
jq -e '.kind == "delegate"' plan.json
jq '.request' plan.json > request.json
```

The parent invokes the actual T3 `delegate_task` with the exact object in `request.json`. Save its actual `structuredContent` object as `response.json`, without reconstructing a terminal response from a child message. If pending, follow `next` and retain the completion notification before normalization. No polling. A live child notification alone is not proof that all descendants finished. Keep each actual response separately.

```sh
jq -n --slurpfile plan plan.json --slurpfile response response.json --slurpfile launch launch.json '{operation:"normalize",plan:$plan[0],response:$response[0],launch:$launch[0]}' > normalize.json
"<plugin-root>/skills/poteto-mode/scripts/runner/pstack-t3" < normalize.json > result.json
jq -e '.kind == "t3-complete" and (.output | contains("PSTACK_T3_LIVE_2026_10_28"))' result.json
```

For an immediate terminal wait response, save it as both `launch.json` and `response.json`. For a pending response, save it as `launch.json`, follow `next`, and obtain `response.json` with `task_status` only after the completion notification. Retain `input.json`, `plan.json`, `request.json`, `launch.json`, `response.json`, `normalize.json`, `result.json`, and the real child result or artifact. These files let a reviewer replay compilation and normalization. They do not replay the model launch. Record the installed candidate, host, selected assignment, observed output, and any refusal. Process checks alone do not satisfy the live gate.

## Native lanes

Native dispatch avoids a second CLI startup and its base context.

- Claude Code: match the descriptor's `(provider, model)` to one model-matrix row, then dispatch it through `pstack-<family>-<effort>` using that row's family and the descriptor's effort. Those definitions select the row's model and requested effort. `pstack-fable-max` and `pstack-opus-xhigh` remain in that set. Pass the complete task, grounding paths, access mode, and unique output location in the `Agent` prompt. Dispatch and wait as [Waits on Claude Code](codex-tools.md#waits-on-claude-code) says.
- Codex: call `spawn_agent` with the descriptor's model and `reasoning_effort`, the complete task, grounding paths, access mode, and unique output location. Use an isolated worktree for a writer. Codex subagents already run concurrently.

Do not send a same-provider descriptor to the external runner. It rejects that call because the native route is cheaper and already available.

## External lanes

The launcher lives at `skills/poteto-mode/scripts/runner/pstack-runner` under the installed plugin. The parent writes the complete candidate prompt to a unique file, creates a unique output directory or worktree, and invokes the launcher directly. Do not put another agent in front of it.

```text
pstack-runner \
  --parent <claude|codex> \
  --provider <provider in the route table> \
  --model <real CLI model> \
  --effort <low|medium|high|xhigh|max|ultra|default> \
  --mode <read-only|isolated-write> \
  [--writer-sandbox full-access] \
  --prompt <unique prompt file> \
  --cwd <repository or dedicated worktree> \
  --output <unique final-response file> \
  --receipt <unique receipt file> \
  [--timeout <seconds>]
```

Pass arguments as an argv array or quote every path. Never interpolate prompt text into a shell command. The launcher preflights the assigned CLI and authentication, invokes the model exactly once, disables recursive agents and ambient skill dispatch where the CLI supports it, restricts the built-in tool surface, and records the exact provider/model/effort flags. Each lane's preflight and model call receive the child environment in its provider's [notes](model-catalog.md#provider-notes), without the parent harness's identity markers. External lanes do not receive the parent's MCP surface. Keep MCP-dependent Why and Reflect roles on `inherit-parent` or `auto`. The launcher never falls back.

Provider-specific preflight details, state paths, and host prerequisites are in the provider notes.

### Codex writer sandbox

A model sheet may hold one setting line that is not a role: `codex writer sandbox: full-access` or `codex writer sandbox: bounded`. Read it once, from the same sheet as the roles. Append `--writer-sandbox full-access` only when that line says `full-access` and the lane is an external Codex `isolated-write` lane. Without the line, or with `bounded`, pass no `--writer-sandbox`, and the writer stays on Codex `workspace-write`. Never pass it for a read-only lane or another provider; the runner refuses both before launch. A native lane is unchanged: a Codex writer on a Codex parent stays on `spawn_agent` with the parent's sandbox, and the setting never moves a native lane to the runner. Never add the flag, or retry with it, after a sandbox failure; only the sheet opts in. Full access removes Codex's sandbox. A dedicated worktree keeps the writer's files apart, but it confines nothing, and a linked worktree shares the main repository's Git state.

### Host and parent prerequisites

- The parent tool sandbox still governs whether a subscribed child CLI can reach its credentials and network. Run setup's live probe from the actual parent profile. A blocked external CLI is a loud dropout, not a reason to elevate permissions or substitute a model silently.
- On Linux, Grok's bounded `read-only` and `workspace` sandbox profiles require Landlock support and bubblewrap (`bwrap`). Hosts missing these prerequisites, including affected Claude Code cloud sessions, cannot run these Grok lanes even if `grok models` succeeds. A sandbox-startup refusal remains `child-failed` (exit 70), with Grok's refusal text in the receipt's `error.evidence`; inspect that evidence rather than attributing every `child-failed` result to missing prerequisites. Open Pstack never substitutes `devbox` or `off` to bypass these protections.
- Codex's default `workspace-write` parent with network disabled can block external Claude Fable/Opus and Grok lanes: network lookups can fail (for example, `ENOTFOUND`), and required outside-workspace state writes such as `~/.grok/managed_config.toml` can be denied. In operator checks with Codex CLI 0.160.0 on macOS, the restricted session exposed `CODEX_SANDBOX=seatbelt` and `CODEX_SANDBOX_NETWORK_DISABLED=1`; full access exposed neither. Missing markers do not prove full access. Read the parent's effective permission instructions for network and the actual required paths; `workspace-write` alone does not establish either permission, and writable roots can include `CODEX_HOME`.
- `/setup-pstack` checks assigned external lanes' required access before any external CLI check or probe. If access is blocked or unresolved, the operator can restart with suitable permissions or explicitly choose native-only role assignments. For Grok under Codex on macOS, child sandbox profiles do not nest; deliberately starting the parent with `danger-full-access` is the documented operator choice, not an automatic change. Setup separately checks both actual configuration destinations before any write, leaving existing bytes unchanged on refusal. It does not alter Codex permissions, silently replace families, or lower effort.
- A dispatched runner still launches the instructed lane. Only after a plain `child-failed` without a provider-reported reason, an explicit Codex parent with `CODEX_SANDBOX_NETWORK_DISABLED=1` gets a likely-parent-sandbox hint in the existing error message and the front of its bounded evidence. The status remains `child-failed`/70; raw child evidence is retained. Provider-reported reasons, other failure statuses, successful runs, and Claude parents are unchanged. This post-failure hint is not a permission check or proof that every DNS or write error came from a sandbox.

The parent invocation must itself be resumable background work:

- Claude Code: call the launcher through a Bash tool invocation with `run_in_background: true` and retain its task ID. A foreground Bash tool call has an automatic ten-minute ceiling even when the runner's own timeout is longer. Shelling out with `&` and losing the task handle is not equivalent. A subagent that must wait on the launcher follows [Waits on Claude Code](codex-tools.md#waits-on-claude-code).
- Codex: run the launcher in a persistent exec session that returns a session ID, then wait or poll that handle. Do not hold one foreground tool call open for the model's full runtime.

Start the background process, continue launching the other lanes, then drain their handles. Native and external lanes belong in the same fan-out phase.

The runner and its preflight have no implicit timeout. Do not invent a duration from role, mode, or a convenient round number; real implementation lanes can run for 90 minutes or much longer. Pass `--timeout` only when the user, an external service deadline, or a measured task contract supplies a real bound. That value starts at wrapper entry, before module loading and argument parsing, and remains one absolute deadline across setup, preflight, model execution, and output capture. It is never a fresh allowance per child, and long waits are armed in runtime-safe chunks without shortening the supplied deadline. Otherwise supervise liveness through the retained background task/session handle and cancel manually only on evidence that the run is dead. Cancel through that retained handle so the runner receives SIGINT or SIGTERM, sends it to an active child when one remains, stops waiting on inherited output pipes, removes the empty output reservation, and writes a `cancelled` receipt. Preserve that receipt; a retry is a new attempt with new unique output and receipt paths. Unchanged running state is not a dropout, and Claude's ten-minute foreground ceiling is never a reason to terminate a healthy lane.

Read-only mode maps to Claude plan mode with project-only settings and an explicit tool list, Codex's read-only sandbox, and Grok auto mode plus its `read-only` sandbox and read-oriented tool list. Headless Grok cancels the whole turn on a permission prompt, which its `plan` mode raises for any shell command outside its built-in read-only list; auto mode reports a blocked call to the model instead. Grok's built-in read-only profile deliberately keeps its own state and system temporary directories writable, so point a read-only Grok lane at the actual checkout rather than a worktree under `/tmp`, `/var/tmp`, or the host's temporary directory. `isolated-write` maps to Claude `acceptEdits` with project-only settings plus the Claude Code Bash sandbox, Codex `workspace-write` (or `danger-full-access` for a writer the sheet opts in, as [Codex writer sandbox](#codex-writer-sandbox) says), and Grok auto mode plus its `workspace` sandbox and write-capable tool list. The Claude writer's Bash runs without prompts in that sandbox, and in a linked worktree the runner denies writes to the main repository's shared `.git`. The runner refuses the writer before launch when it cannot resolve that shared `.git` exactly or express its path literally. Grok uses auto mode in both access modes because `acceptEdits` raises the same turn-cancelling prompt for a shell command outside Grok's built-in list. Every other provider's mapping is in its [provider notes](model-catalog.md#provider-notes). The route table's Access modes cell lists each provider's modes. Give every writer only a dedicated worktree or output directory. Never route a writer into the primary checkout.

Every concurrent external lane needs distinct prompt, output, and receipt paths. The launcher exclusively reserves the output, receipt, and `<receipt>.stdout` / `<receipt>.stderr` sidecars with private (`0600`) permissions and refuses to overwrite existing files. For a provider whose notes name one, it also creates the private `<receipt>.provider/` directory (`0700`) that holds the provider's run-owned config and the file the CLI exports. All these paths must be distinct from each other and the prompt; a failed reservation rolls back only files created by that attempt. Schema-version-1 receipts add nullable `stdoutPath` and `stderrPath` fields identifying reserved artifacts. Sidecars retain the model process's raw stdout/stderr bytes, including on dropouts; they do not include authentication-preflight output. Cancellation and timeout retain every byte captured before the drain stops. Keep these private local files with the receipt; quote only operator-selected excerpts in public evidence.

## Completion and dropouts

Success requires all of these:

1. Exit status `0`.
2. Receipt status `complete`.
3. Either `modelVerified: true` with `modelEvidence: "provider-report"`, or, for a provider whose Model proof cell in the [route table](model-catalog.md#routes) reads `pinned argv`, such as Codex, a receipt with `reportedModel: null`, `modelVerified: false`, and `modelEvidence: "pinned-argv"`. For Claude's `fable` and `opus` aliases, the concrete provider report must belong to the requested family. Codex 0.149.0 accepts the exact `--model` argument but does not report the served model in its JSONL stream.
4. A non-empty output file.

The receipt also carries elapsed time, token usage when the CLI exposes it, and cost when available. Keep it with the arena or review artifacts so parent-harness comparisons are evidence-based.

Any missing CLI, failed login, unavailable model, explicit timeout, cancellation, catchable post-reservation launcher failure, non-zero child exit, malformed result, or model mismatch is a receipt-bearing dropout. Record it and apply the calling skill's existing dropout policy. A `cancelled` receipt can represent either a launcher signal or a provider-reported cancellation: a well-formed Grok terminal cancellation, or a Devin cancellation that its provider notes describe. Provider cancellations return wrapper exit 130; other valid Grok terminal failures return `child-failed`/70. After a zero exit, invalid or incomplete Grok terminal data is `malformed-output`/65. After a nonzero exit, it takes the ordinary failure classification: normally `child-failed`/70, or `unavailable-model`/69 when the model-error text matches. Only the authentication preflight classifies a lane as `unauthenticated`/77. A nonzero child exit after the model call starts, without a provider-reported reason, is never `unauthenticated`, even when its output mentions authentication. If a login expires between the preflight and the model call, the receipt is `child-failed`/70 and keeps the CLI's error text in `error.evidence`. These provider failures preserve the exact reason in `error.message`, put it first in bounded evidence, and retain reported model/session/usage/cost and the actual child exit code, even after an ordinary nonzero child exit. Missing provider metadata stays null. Launcher cancellation and timeout take precedence. The `signal` field is non-null only when the runner sent that signal to a still-active direct CLI child, and remains null for provider-only cancellation or when launcher cancellation only stopped a post-exit pipe drain. The provider CLI owns any processes it starts beneath that direct child; the receipt does not claim a process-tree kill. Do not delete or overwrite the receipt. Never substitute the parent model, retry another provider, or reinterpret an external descriptor as a native model slug.

Start native and external lanes in the same fan-out phase, then wait for all of them before judging. A judge must not read candidate paths while their owners are still writing.
