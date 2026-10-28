#!/usr/bin/env python3
import argparse
import copy
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description="Exercise the T3 JSON helper as a process, without launching a model.")
parser.add_argument("--helper", type=Path, required=True)
parser.add_argument("--artifacts", type=Path, required=True)
args = parser.parse_args()
args.artifacts.mkdir(parents=True, exist_ok=True)

caps = {
    "inheritedProviderInstanceId": "codex-local", "inheritedModel": "gpt-6.1-sol",
    "inheritedOptions": [{"id": "reasoningEffort", "value": "high"}, {"id": "serviceTier", "value": "fast"}],
    "runtimeMode": "full-access", "interactionMode": "default",
    "features": {"appOwnedSubagents": True, "cancellation": True},
    "providers": [
        {"providerInstanceId": "codex-local", "driverKind": "codex", "canRunChildTask": True,
         "canRunCrossProviderChildTask": True, "constraints": [], "models": [
             {"id": "gpt-6.1-sol", "options": [
                 {"id": "reasoningEffort", "values": ["high", "max"], "default": "high"},
                 {"id": "serviceTier", "values": ["standard", "fast"], "default": "standard"}]},
             {"id": "gpt-6-luna", "options": [{"id": "reasoningEffort", "values": ["high"], "default": "high"}]}]},
        {"providerInstanceId": "claude-local", "driverKind": "claudeAgent", "canRunChildTask": True,
         "canRunCrossProviderChildTask": True, "constraints": [], "models": [
             {"id": "claude-opus-4-8", "options": [{"id": "effort", "values": ["high", "max"], "default": "high"}]}]},
    ],
}
base = {
    "operation": "compile", "host": "t3", "parent": {"nativeAvailable": True, "delegateAvailable": True},
    "role": "arena runners", "apiRole": "implementation", "descriptor": "codex:gpt-6.1-sol@max",
    "task": "Read the assigned files and return a short result.", "title": "T3 boundary exercise",
    "lifecycle": {"isolation": "shared", "completion": "this-turn"},
    "access": {"intent": "advisory-read-only", "requireConfinement": False, "requireNoDelegation": False},
    "capabilities": caps,
}
rows = []
failures = 0

def run(name, payload, check):
    global failures
    row = {"scenario": name, "input": payload}
    try:
        result = subprocess.run([str(args.helper.resolve())], input=json.dumps(payload), text=True, capture_output=True)
        row.update(exitCode=result.returncode, stdout=result.stdout, stderr=result.stderr)
        assert result.returncode == 0, f"helper exited {result.returncode}"
        value = json.loads(result.stdout)
        check(value)
        row["passed"] = True
    except (OSError, AssertionError, ValueError, KeyError, TypeError) as error:
        failures += 1
        row.update(passed=False, error=str(error))
    rows.append(row)
    print(f"{'PASS' if row['passed'] else 'FAIL'} {name}" + (f": {row['error']}" if not row["passed"] else ""))
    return json.loads(row["stdout"]) if row.get("passed") else None

def equal(actual, expected):
    assert actual == expected, f"expected {expected!r}, got {actual!r}"

def compile_case(name, edit, check):
    payload = copy.deepcopy(base)
    edit(payload)
    return run(name, payload, check)

def refusal(code):
    def check(value):
        equal(value["kind"], "dropout")
        equal(value["reason"], code)
        assert "request" not in value
    return check

def check_request(value):
    equal(value["kind"], "delegate")
    equal(value["request"], {
        "task": base["task"] + "\n\nAccess intent: advisory read-only. Do not edit files. This is an instruction, not enforced confinement.",
        "title": base["title"], "role": "implementation", "isolation": "shared", "mode": "wait",
        "target": {"providerInstanceId": "codex-local", "model": "gpt-6.1-sol",
                   "options": {"reasoningEffort": "max", "serviceTier": "standard"}},
    })
    equal(value["assignment"], {"role": "arena runners", "descriptor": base["descriptor"]})
    equal(value["controls"], {"readOnly": "advisory", "confinement": "unattested", "recursiveDelegation": "unattested"})

plan = compile_case("exact Codex API fields and honest evidence", lambda x: None, check_request)
compile_case("Claude alias and effort key", lambda x: x.update(descriptor="claude:opus@max", apiRole="review"),
             lambda x: equal(x["request"]["target"], {"providerInstanceId": "claude-local", "model": "claude-opus-4-8", "options": {"effort": "max"}}))
compile_case("unchanged inherited native", lambda x: x.update(descriptor="inherit-parent"), lambda x: equal(x["kind"], "native"))
compile_case("explicit equal inherited setting still delegates", lambda x: x.update(descriptor="auto", options={"reasoningEffort": "high"}), lambda x: equal(x["kind"], "delegate"))
compile_case("worktree background uses the local T3 project", lambda x: x.update(descriptor="auto", lifecycle={"isolation": "worktree", "completion": "background"}),
             lambda x: (equal(x["request"]["mode"], "async"), equal(x["request"]["isolation"], "worktree"), equal(set(x["request"]["target"]), {"providerInstanceId", "model", "options"}), equal(x["request"]["target"]["options"]["serviceTier"], "fast")))
compile_case("local target cannot change projects", lambda x: x.update(projectId="another-project"), refusal("unsupported-project"))
compile_case("cross-model default clears foreign options", lambda x: x.update(descriptor="codex:gpt-6-luna@default"),
             lambda x: equal(x["request"]["target"], {"providerInstanceId": "codex-local", "model": "gpt-6-luna", "options": {"reasoningEffort": "high"}}))
compile_case("explicit service tier", lambda x: x.update(options={"serviceTier": "fast"}), lambda x: equal(x["request"]["target"]["options"]["serviceTier"], "fast"))
compile_case("unsupported exact effort", lambda x: x.update(descriptor="codex:gpt-6.1-sol@ultra"), refusal("unsupported-option"))
compile_case("conflicting effort", lambda x: x.update(options={"reasoningEffort": "high"}), refusal("conflicting-effort"))
compile_case("required confinement", lambda x: x["access"].update(requireConfinement=True), refusal("unattested-enforcement"))
compile_case("required recursion disabled", lambda x: x["access"].update(requireNoDelegation=True), refusal("unattested-enforcement"))
compile_case("missing delegate tool", lambda x: x["parent"].update(delegateAvailable=False), refusal("missing-tool"))
compile_case("missing native tool", lambda x: (x.update(descriptor="auto"), x["parent"].update(nativeAvailable=False)), refusal("missing-tool"))
compile_case("host explicit, never environment detection", lambda x: x.update(host="standalone"), refusal("invalid-input"))
compile_case("ambiguous provider instances", lambda x: x["capabilities"]["providers"].append(dict(x["capabilities"]["providers"][0], providerInstanceId="codex-other")), refusal("ambiguous-provider"))
compile_case("unknown driver never guessed", lambda x: x.update(descriptor="grok:grok-4.7@max"), refusal("unavailable-provider"))
compile_case("provider refuses child", lambda x: x["capabilities"]["providers"][0].update(canRunChildTask=False), refusal("provider-constraint"))
compile_case("cross-provider constraint", lambda x: (x.update(descriptor="claude:opus@max"), x["capabilities"]["providers"][0].update(canRunCrossProviderChildTask=False)), refusal("provider-constraint"))
compile_case("uninterpreted constraint refuses", lambda x: x["capabilities"]["providers"][0].update(constraints=["host-specific limit"]), refusal("provider-constraint"))
compile_case("omitted model is incomplete", lambda x: x["capabilities"]["providers"][0].update(models=[], omittedModels=12), refusal("incomplete-capabilities"))
compile_case("rolling alias selects latest advertised revision", lambda x: (x.update(descriptor="claude:opus@max"), x["capabilities"]["providers"][1]["models"].append({"id": "claude-opus-4-7", "options": []})),
             lambda x: equal(x["request"]["target"]["model"], "claude-opus-4-8"))
compile_case("partial rolling family refuses", lambda x: (x.update(descriptor="claude:opus@max"), x["capabilities"]["providers"][1].update(omittedModels=1)), refusal("incomplete-capabilities"))
compile_case("optional settings without defaults need no invented override", lambda x: x["capabilities"]["providers"][0]["models"][0]["options"].append({"id": "optionalMode", "values": [True, False]}), check_request)
compile_case("invalid API role", lambda x: x.update(apiRole="arena runners"), refusal("invalid-input"))
compile_case("inherited options missing", lambda x: x["capabilities"].update(inheritedOptions=None), refusal("incomplete-capabilities"))
compile_case("unknown selected option", lambda x: x.update(options={"sandbox": "read-only"}), refusal("unsupported-option"))
compile_case("missing model in complete list", lambda x: x.update(descriptor="codex:unknown-model@max"), refusal("unavailable-model"))

if plan:
    terminal = {
        "taskId": "actual-task", "childThreadId": "actual-thread", "link": "t3-thread://v1/actual-thread",
        "providerInstanceId": "codex-local", "model": "gpt-6.1-sol",
        "options": [{"id": "reasoningEffort", "value": "max"}, {"id": "serviceTier", "value": "standard"}],
        "status": "completed", "workState": "result_available", "hasPendingChildRuns": False,
        "pendingApproval": None, "hasPendingQuestion": False, "waitTimedOut": False, "next": None,
        "summary": "Actual child output.", "latestTerminalStatus": "completed", "latestTerminalSummary": "Actual child output.",
        "resultContextTransferId": "opaque-transfer", "latestTerminalResultContextTransferId": "opaque-terminal-transfer",
    }
    def normalize_case(name, changes, check):
        response = dict(terminal, **changes)
        def checked(value):
            check(value)
            equal(value["response"], response)
            equal(value["evidence"], {"configuration": "t3-report", "servedModel": "unattested", "controls": plan["controls"]})
            for key in ("argv", "exitCode", "modelVerified", "usage", "costUsd", "sandboxEnforced"):
                assert key not in value, key
        return run(name, {"operation": "normalize", "plan": plan, "response": response}, checked)
    normalize_case("matching terminal with actual output", {}, lambda x: (equal(x["kind"], "t3-complete"), equal(x["output"], "Actual child output.")))
    for name, changes in [
        ("running", {"status": "running", "workState": "working", "latestTerminalStatus": None}),
        ("waiting", {"status": "waiting", "workState": "working"}),
        ("live descendants", {"hasPendingChildRuns": True, "workState": "waiting_for_children"}),
        ("approval", {"pendingApproval": {"requestId": "approval", "kind": "command"}}),
        ("question", {"hasPendingQuestion": True}),
        ("wait timeout", {"waitTimedOut": True}),
    ]:
        normalize_case(name, changes, lambda x: equal(x["kind"], "t3-pending"))
    for status in ("failed", "cancelled", "interrupted"):
        normalize_case(status, {"status": status, "latestTerminalStatus": status}, lambda x, s=status: (equal(x["kind"], "t3-dropout"), equal(x["reason"], s)))
    for field, value in (("model", "wrong-model"), ("providerInstanceId", "other"), ("options", [])):
        normalize_case(f"mismatch {field}", {field: value}, lambda x: (equal(x["kind"], "t3-dropout"), equal(x["reason"], "configuration-mismatch")))
    normalize_case("empty output", {"summary": " ", "latestTerminalSummary": None}, lambda x: equal(x["reason"], "empty-output"))
    normalize_case("missing terminal confirmation", {"latestTerminalStatus": None}, lambda x: equal(x["reason"], "ambiguous-acceptance"))
    normalize_case("duplicate returned options", {"options": terminal["options"] * 2}, lambda x: equal(x["reason"], "ambiguous-acceptance"))
    run("ambiguous response preserves acceptance", {"operation": "normalize", "plan": plan, "response": {"taskId": "accepted-but-incomplete"}},
        lambda x: (equal(x["kind"], "t3-dropout"), equal(x["reason"], "ambiguous-acceptance"), equal(x["response"]["taskId"], "accepted-but-incomplete")))
    async_plan = copy.deepcopy(plan)
    async_plan["request"]["mode"] = "async"
    launch = dict(terminal, status="running", workState="working", latestTerminalStatus=None, latestTerminalSummary=None, summary=None)
    for name, response, retained, expected in [
        ("async completion binds retained launch", terminal, launch, "t3-complete"),
        ("wrong task cannot supply async completion", dict(terminal, taskId="another-task"), launch, "task-mismatch"),
        ("async completion requires launch evidence", terminal, None, "missing-launch-evidence"),
    ]:
        run(name, {"operation": "normalize", "plan": async_plan, "response": response, "launch": retained},
            lambda x, expected=expected: equal(x["kind"] if expected == "t3-complete" else x["reason"], expected))
else:
    print("Normalizer cases blocked by the failing compilation baseline.")

(args.artifacts / "cases.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows))
(args.artifacts / "summary.json").write_text(json.dumps({"passed": len(rows) - failures, "failed": failures, "helper": str(args.helper.resolve())}, indent=2) + "\n")
print(f"{len(rows) - failures} passed; {failures} failed. Evidence: {args.artifacts / 'cases.jsonl'}")
sys.exit(1 if failures else 0)
