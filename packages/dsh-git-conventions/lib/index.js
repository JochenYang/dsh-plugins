// src/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/conventions.ts
var ALLOWED_TYPES = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "style",
  "test",
  "chore",
  "perf",
  "ci",
  "build",
  "revert"
];
var BRANCH_PREFIXES = ["feat", "fix", "refactor", "docs", "chore"];
var MAIN_BRANCHES = /* @__PURE__ */ new Set(["main", "master", "develop", "dev", "trunk", "production"]);
var COMMIT_REGEX = /^(feat|fix|refactor|docs|style|test|chore|perf|ci|build|revert)(\([a-z0-9_-]+\))?: .+$/;
var AI_SIGNATURE_REGEX = /(^co-authored-by:.*$|generated (?:with|by) (?:claude|opencode|copilot|cursor|chatgpt|gpt)|🤖)/im;
function getSubjectLine(msg) {
  return msg.split("\n")[0] ?? "";
}
function extractSubject(msg) {
  return msg.replace(/^[^(]+(\([^)]+\))?:\s*/, "");
}
function extractBody(msg) {
  const lines = msg.split("\n");
  if (lines.length <= 1) return "";
  let i = 1;
  while (i < lines.length && lines[i]?.trim() === "") i++;
  return lines.slice(i).join("\n");
}
function checkFormat(msg) {
  if (!COMMIT_REGEX.test(getSubjectLine(msg))) {
    return {
      status: "error",
      label: "Format",
      detail: "Must match `<type>(<scope>): <description>`, e.g. `feat(auth): add login flow`"
    };
  }
  return { status: "pass", label: "Format", detail: "Matches `<type>(<scope>): <description>`" };
}
function checkLength(msg) {
  const line = getSubjectLine(msg);
  if (line.length > 72) {
    return { status: "error", label: "Length", detail: `Subject line is ${line.length} chars (hard limit <= 72)` };
  }
  if (line.length > 50) {
    return { status: "warn", label: "Length", detail: `Subject line is ${line.length} chars (recommended <= 50)` };
  }
  return { status: "pass", label: "Length", detail: `${line.length} chars (<= 50)` };
}
function checkCase(msg) {
  const subject = extractSubject(getSubjectLine(msg));
  if (!subject) return { status: "warn", label: "Case", detail: "Could not extract subject" };
  if (subject[0] !== subject[0]?.toLowerCase()) {
    return { status: "warn", label: "Case", detail: "Subject should start with lowercase imperative mood" };
  }
  return { status: "pass", label: "Case", detail: "Starts with lowercase" };
}
function checkPeriod(msg) {
  if (getSubjectLine(msg).endsWith(".")) {
    return { status: "warn", label: "Period", detail: "No trailing period on subject" };
  }
  return { status: "pass", label: "Period", detail: "No trailing period on subject" };
}
function checkAiSignature(msg) {
  if (AI_SIGNATURE_REGEX.test(msg)) {
    return {
      status: "error",
      label: "AI Signature",
      detail: "Must not contain Co-Authored-By trailers or AI generated signatures"
    };
  }
  return { status: "pass", label: "AI Signature", detail: "No AI signature" };
}
function checkBodyQuality(msg, enforceBody) {
  const body = extractBody(msg);
  if (!body) {
    if (enforceBody) return { status: "warn", label: "Body", detail: "No body (subject only); recommend a short bullet list (<= 15 lines)" };
    return { status: "pass", label: "Body", detail: "No body (subject only); recommend a short bullet list when change is non-trivial" };
  }
  const hardIssues = [];
  const softIssues = [];
  const stripped = body.replace(/```[\s\S]*?```/g, "");
  const backslashTokens = stripped.match(/\\[A-Za-z][A-Za-z0-9_.-]*\\/g);
  if (backslashTokens && backslashTokens.length > 0) {
    const samples = [...new Set(backslashTokens.slice(0, 3))].join(", ");
    const detail = `${backslashTokens.length} backslash-escaped token(s), e.g. ${samples}`;
    (backslashTokens.length > 5 ? hardIssues : softIssues).push(detail);
  }
  if (/called the (read|write|edit|glob|grep|bash|webfetch|websearch) tool/i.test(body)) {
    hardIssues.push("contains tool invocation header");
  }
  if (/\b(filePath|tool_call|tool result:|tooluse_|tool_use_id)\b/i.test(body)) {
    hardIssues.push("contains tool metadata keywords");
  }
  if (/\{\s*"(?:filePath|path|command|content)":/i.test(body)) {
    hardIssues.push("contains raw JSON argument block");
  }
  const bodyLines = body.split("\n").filter((line) => line.trim() !== "");
  if (bodyLines.length > 20) hardIssues.push(`body has ${bodyLines.length} non-empty lines (hard limit <= 20)`);
  else if (bodyLines.length > 15) softIssues.push(`body has ${bodyLines.length} non-empty lines (recommended <= 15)`);
  const longLines = bodyLines.filter((line) => !line.startsWith("```") && line.length > 72);
  if (longLines.length > 0) {
    const maxLen = Math.max(...longLines.map((line) => line.length));
    (longLines.length > 5 ? hardIssues : softIssues).push(`${longLines.length} line(s) exceed 72 chars (max: ${maxLen})`);
  }
  const bulletLines = bodyLines.filter((line) => line.startsWith("- ") || line.startsWith("* ")).length;
  const proseLines = bodyLines.filter((line) => !line.startsWith("```") && !line.startsWith("- ") && !line.startsWith("* ")).length;
  if (bulletLines === 0 && proseLines >= 3) {
    if (enforceBody) hardIssues.push("body is all prose; convert logical changes to bullets");
    else softIssues.push("body is all prose; convert logical changes to bullets");
  } else if (proseLines > bulletLines && proseLines > 2) {
    softIssues.push(`body has ${proseLines} prose line(s) vs ${bulletLines} bullet(s); prefer bullets`);
  }
  if (hardIssues.length > 0) return { status: "error", label: "Body", detail: [...hardIssues, ...softIssues].join("; ") };
  if (softIssues.length > 0) return { status: "warn", label: "Body", detail: softIssues.join("; ") };
  return { status: "pass", label: "Body", detail: "Clean body, within size limits" };
}
function checkBranch(branch) {
  if (MAIN_BRANCHES.has(branch)) {
    return { status: "pass", label: "Branch Name", detail: `Main branch '${branch}' exempt from prefix convention` };
  }
  const valid = BRANCH_PREFIXES.some((prefix) => branch.startsWith(`${prefix}/`));
  if (!valid) {
    return {
      status: "warn",
      label: "Branch Name",
      detail: `Use a standard prefix: ${BRANCH_PREFIXES.map((prefix) => `${prefix}/<name>`).join(", ")}`
    };
  }
  return { status: "pass", label: "Branch Name", detail: "Prefix matches convention" };
}
function formatResults(checks) {
  const pass = checks.filter((check) => check.status === "pass");
  const warns = checks.filter((check) => check.status === "warn");
  const errs = checks.filter((check) => check.status === "error");
  const lines = [];
  if (pass.length > 0) {
    lines.push("**Auto checks passed**");
    pass.forEach((check) => lines.push(`  PASS  ${check.label}: ${check.detail}`));
    lines.push("");
  }
  if (warns.length > 0) {
    lines.push("**Needs manual verification**");
    warns.forEach((check) => lines.push(`  WARN  ${check.label}: ${check.detail}`));
    lines.push("");
  }
  if (errs.length > 0) {
    lines.push("**Must fix before commit**");
    errs.forEach((check) => lines.push(`  ERROR ${check.label}: ${check.detail}`));
    lines.push("");
  }
  return lines.join("\n");
}
function buildGuide(files) {
  return [
    "",
    "======== Git Convention Guide ========",
    "",
    "[Commit Format]",
    "  <type>(<scope>): <subject>",
    "",
    "  <blank line>",
    "  <body: 2-4 short bullets>",
    "",
    `  Allowed types: ${ALLOWED_TYPES.join(", ")}`,
    "",
    "[Commit Rules]",
    "  - Body is mandatory unless enforcing via enforce_body=false explicitly",
    "  - Subject starts with lowercase",
    "  - Subject line <= 72 chars (recommended <= 50)",
    "  - No trailing period",
    "  - No AI signature or Co-Authored-By",
    "  - Imperative mood (add, fix, update not added, fixed, updated)",
    "",
    "[Body Rules]",
    "  - Blank line between subject and body",
    "  - Each line <= 72 chars",
    "  - Body is required for project commits; subject alone returns WARN",
    "  - Prefer concise bullet lines (2-4 bullets per commit)",
    "  - Each bullet describes one logical change in plain prose",
    "  - Body <= 15 lines; split into multiple commits if longer",
    "  - Never paste raw tool output or JSON tool args",
    "",
    "[Pre-Commit Checklist]",
    "  [ ] No secret leakage",
    "  [ ] Tests pass or skipped reason is explicit",
    "  [ ] Lint / format pass or skipped reason is explicit",
    "  [ ] Scope is focused",
    "",
    "[Branch Naming]",
    `  ${BRANCH_PREFIXES.map((prefix) => `${prefix}/<name>`).join(", ")}`,
    "",
    "[Git Proposal Output Contract]",
    "  1. Proposed branch name",
    "  2. Commit message",
    "  3. Changed files summary" + (files && files.length > 0 ? "\n" + files.map((file) => `     - ${file}`).join("\n") : ""),
    "  4. Clear confirmation question",
    "",
    "========================================",
    ""
  ].join("\n");
}
function runGitConventions(input) {
  const output = [];
  const checks = [];
  const enforceBody = input.enforce_body !== false;
  if (input.message) {
    checks.push(checkFormat(input.message));
    checks.push(checkLength(input.message));
    checks.push(checkCase(input.message));
    checks.push(checkPeriod(input.message));
    checks.push(checkAiSignature(input.message));
    checks.push(checkBodyQuality(input.message, enforceBody));
  }
  if (input.branch) checks.push(checkBranch(input.branch));
  if (checks.length > 0) output.push(formatResults(checks));
  if (input.message) {
    if (enforceBody) {
      output.push("**Strictness:** body enforcement = on (subject alone returns a WARN, bad body returns ERROR)");
    } else {
      output.push("**Strictness:** body enforcement = off (bad body returns WARN; subject alone passes)");
    }
  }
  const allPass = checks.every((check) => check.status !== "error");
  if (input.message && !allPass) {
    output.push("**Correct examples:**");
    output.push("  feat(auth): add login flow");
    output.push("  fix(api): handle null pointer in response parser");
    output.push("  docs(readme): update install instructions");
    output.push("");
  }
  if (input.include_guide !== false) output.push(buildGuide(input.files));
  return output.join("\n");
}

// src/index.ts
var name = "dsh-git-conventions";
var inject = ["tools"];
function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "git_conventions",
    description: "Validate git commit messages and branch naming conventions. Use before proposing commits, branch names, or PR metadata. Returns validation results plus the user's Git convention guide unless include_guide=false.",
    parameters: {
      message: { type: "string", description: "Proposed commit message, including optional body." },
      branch: { type: "string", description: "Current or proposed branch name." },
      files: { type: "array", items: { type: "string" }, description: "Changed file paths for the output contract." },
      include_guide: { type: "boolean", description: "Default true. Set false for validation result only." },
      enforce_body: { type: "boolean", description: "Default true. When true (default), missing body is WARN and bad body is ERROR. Pass false only to validate subject-only." }
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    execute: async (args) => runGitConventions(args)
  }));
}
export {
  apply,
  inject,
  name
};
