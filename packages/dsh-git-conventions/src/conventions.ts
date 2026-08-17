/**
 * Pure git-convention validation shared by the model-facing tool and any future
 * consumer. Every check is a deterministic function of the supplied text;
 * nothing here reads repository state or runs git.
 */

/** Conventional Commits types accepted by the user's convention. */
const ALLOWED_TYPES = [
  'feat',
  'fix',
  'refactor',
  'docs',
  'style',
  'test',
  'chore',
  'perf',
  'ci',
  'build',
  'revert',
] as const

/** Branch prefixes required for non-main branches. */
const BRANCH_PREFIXES = ['feat', 'fix', 'refactor', 'docs', 'chore'] as const

/** Main branches exempt from the prefix convention. */
const MAIN_BRANCHES = new Set(['main', 'master', 'develop', 'dev', 'trunk', 'production'])

/** Subject format: `<type>(<scope>): <description>`. */
const COMMIT_REGEX = /^(feat|fix|refactor|docs|style|test|chore|perf|ci|build|revert)(\([a-z0-9_-]+\))?: .+$/

/** AI-generated signatures and Co-Authored-By trailers that must not appear. */
const AI_SIGNATURE_REGEX = /(^co-authored-by:.*$|generated (?:with|by) (?:claude|opencode|copilot|cursor|chatgpt|gpt)|🤖)/im

/** One check verdict. */
type Status = 'pass' | 'warn' | 'error'

/** One named check result. */
interface CheckResult {
  status: Status
  label: string
  detail: string
}

/** Input to the convention validator; at least one of `message` or `branch` should be set. */
export interface GitConventionsInput {
  /** Proposed commit message, including optional body. */
  message?: string
  /** Current or proposed branch name. */
  branch?: string
  /** Changed file paths included in the proposal output contract. */
  files?: string[]
  /** Default true. Set false for the validation result only, without the guide. */
  include_guide?: boolean
  /** Default true. When true (default), a missing body is WARN and a bad body is ERROR. */
  enforce_body?: boolean
}

/** @returns the first line of the message, or an empty string. */
function getSubjectLine(msg: string): string {
  return msg.split('\n')[0] ?? ''
}

/** @returns the subject text after the `<type>(<scope>): ` prefix. */
function extractSubject(msg: string): string {
  return msg.replace(/^[^(]+(\([^)]+\))?:\s*/, '')
}

/** @returns the body text after the subject and its separating blank lines. */
function extractBody(msg: string): string {
  const lines = msg.split('\n')
  if (lines.length <= 1) return ''
  let i = 1
  while (i < lines.length && lines[i]?.trim() === '') i++
  return lines.slice(i).join('\n')
}

/** Check the subject against the `<type>(<scope>): <description>` format. */
function checkFormat(msg: string): CheckResult {
  if (!COMMIT_REGEX.test(getSubjectLine(msg))) {
    return {
      status: 'error',
      label: 'Format',
      detail: 'Must match `<type>(<scope>): <description>`, e.g. `feat(auth): add login flow`',
    }
  }
  return { status: 'pass', label: 'Format', detail: 'Matches `<type>(<scope>): <description>`' }
}

/** Check the subject line length against the 72/50 limits. */
function checkLength(msg: string): CheckResult {
  const line = getSubjectLine(msg)
  if (line.length > 72) {
    return { status: 'error', label: 'Length', detail: `Subject line is ${line.length} chars (hard limit <= 72)` }
  }
  if (line.length > 50) {
    return { status: 'warn', label: 'Length', detail: `Subject line is ${line.length} chars (recommended <= 50)` }
  }
  return { status: 'pass', label: 'Length', detail: `${line.length} chars (<= 50)` }
}

/** Check that the subject starts with a lowercase letter. */
function checkCase(msg: string): CheckResult {
  const subject = extractSubject(getSubjectLine(msg))
  if (!subject) return { status: 'warn', label: 'Case', detail: 'Could not extract subject' }
  if (subject[0] !== subject[0]?.toLowerCase()) {
    return { status: 'warn', label: 'Case', detail: 'Subject should start with lowercase imperative mood' }
  }
  return { status: 'pass', label: 'Case', detail: 'Starts with lowercase' }
}

/** Check that the subject has no trailing period. */
function checkPeriod(msg: string): CheckResult {
  if (getSubjectLine(msg).endsWith('.')) {
    return { status: 'warn', label: 'Period', detail: 'No trailing period on subject' }
  }
  return { status: 'pass', label: 'Period', detail: 'No trailing period on subject' }
}

/** Check for AI signatures and Co-Authored-By trailers. */
function checkAiSignature(msg: string): CheckResult {
  if (AI_SIGNATURE_REGEX.test(msg)) {
    return {
      status: 'error',
      label: 'AI Signature',
      detail: 'Must not contain Co-Authored-By trailers or AI generated signatures',
    }
  }
  return { status: 'pass', label: 'AI Signature', detail: 'No AI signature' }
}

/**
 * Check body quality: presence, size limits, bullet preference, and absence of
 * raw tool output or JSON argument blocks.
 * @param msg - the full commit message.
 * @param enforceBody - whether a missing body is a warning and a bad body an error.
 */
function checkBodyQuality(msg: string, enforceBody: boolean): CheckResult {
  const body = extractBody(msg)
  if (!body) {
    if (enforceBody) return { status: 'warn', label: 'Body', detail: 'No body (subject only); recommend a short bullet list (<= 15 lines)' }
    return { status: 'pass', label: 'Body', detail: 'No body (subject only); recommend a short bullet list when change is non-trivial' }
  }

  const hardIssues: string[] = []
  const softIssues: string[] = []
  const stripped = body.replace(/```[\s\S]*?```/g, '')

  const backslashTokens = stripped.match(/\\[A-Za-z][A-Za-z0-9_.-]*\\/g)
  if (backslashTokens && backslashTokens.length > 0) {
    const samples = [...new Set(backslashTokens.slice(0, 3))].join(', ')
    const detail = `${backslashTokens.length} backslash-escaped token(s), e.g. ${samples}`
    ;(backslashTokens.length > 5 ? hardIssues : softIssues).push(detail)
  }
  if (/called the (read|write|edit|glob|grep|bash|webfetch|websearch) tool/i.test(body)) {
    hardIssues.push('contains tool invocation header')
  }
  if (/\b(filePath|tool_call|tool result:|tooluse_|tool_use_id)\b/i.test(body)) {
    hardIssues.push('contains tool metadata keywords')
  }
  if (/\{\s*"(?:filePath|path|command|content)":/i.test(body)) {
    hardIssues.push('contains raw JSON argument block')
  }

  const bodyLines = body.split('\n').filter(line => line.trim() !== '')
  if (bodyLines.length > 20) hardIssues.push(`body has ${bodyLines.length} non-empty lines (hard limit <= 20)`)
  else if (bodyLines.length > 15) softIssues.push(`body has ${bodyLines.length} non-empty lines (recommended <= 15)`)

  const longLines = bodyLines.filter(line => !line.startsWith('```') && line.length > 72)
  if (longLines.length > 0) {
    const maxLen = Math.max(...longLines.map(line => line.length))
    ;(longLines.length > 5 ? hardIssues : softIssues).push(`${longLines.length} line(s) exceed 72 chars (max: ${maxLen})`)
  }

  const bulletLines = bodyLines.filter(line => line.startsWith('- ') || line.startsWith('* ')).length
  const proseLines = bodyLines.filter(line => !line.startsWith('```') && !line.startsWith('- ') && !line.startsWith('* ')).length
  if (bulletLines === 0 && proseLines >= 3) {
    if (enforceBody) hardIssues.push('body is all prose; convert logical changes to bullets')
    else softIssues.push('body is all prose; convert logical changes to bullets')
  } else if (proseLines > bulletLines && proseLines > 2) {
    softIssues.push(`body has ${proseLines} prose line(s) vs ${bulletLines} bullet(s); prefer bullets`)
  }

  if (hardIssues.length > 0) return { status: 'error', label: 'Body', detail: [...hardIssues, ...softIssues].join('; ') }
  if (softIssues.length > 0) return { status: 'warn', label: 'Body', detail: softIssues.join('; ') }
  return { status: 'pass', label: 'Body', detail: 'Clean body, within size limits' }
}

/** Check the branch name against the prefix convention; main branches are exempt. */
function checkBranch(branch: string): CheckResult {
  if (MAIN_BRANCHES.has(branch)) {
    return { status: 'pass', label: 'Branch Name', detail: `Main branch '${branch}' exempt from prefix convention` }
  }
  const valid = BRANCH_PREFIXES.some(prefix => branch.startsWith(`${prefix}/`))
  if (!valid) {
    return {
      status: 'warn',
      label: 'Branch Name',
      detail: `Use a standard prefix: ${BRANCH_PREFIXES.map(prefix => `${prefix}/<name>`).join(', ')}`,
    }
  }
  return { status: 'pass', label: 'Branch Name', detail: 'Prefix matches convention' }
}

/** @returns the grouped PASS/WARN/ERROR report text. */
function formatResults(checks: CheckResult[]): string {
  const pass = checks.filter(check => check.status === 'pass')
  const warns = checks.filter(check => check.status === 'warn')
  const errs = checks.filter(check => check.status === 'error')
  const lines: string[] = []
  if (pass.length > 0) {
    lines.push('**Auto checks passed**')
    pass.forEach(check => lines.push(`  PASS  ${check.label}: ${check.detail}`))
    lines.push('')
  }
  if (warns.length > 0) {
    lines.push('**Needs manual verification**')
    warns.forEach(check => lines.push(`  WARN  ${check.label}: ${check.detail}`))
    lines.push('')
  }
  if (errs.length > 0) {
    lines.push('**Must fix before commit**')
    errs.forEach(check => lines.push(`  ERROR ${check.label}: ${check.detail}`))
    lines.push('')
  }
  return lines.join('\n')
}

/** @returns the user's convention guide block, with the changed files summary when supplied. */
function buildGuide(files?: string[]): string {
  return [
    '',
    '======== Git Convention Guide ========',
    '',
    '[Commit Format]',
    '  <type>(<scope>): <subject>',
    '',
    '  <blank line>',
    '  <body: 2-4 short bullets>',
    '',
    `  Allowed types: ${ALLOWED_TYPES.join(', ')}`,
    '',
    '[Commit Rules]',
    '  - Body is mandatory unless enforcing via enforce_body=false explicitly',
    '  - Subject starts with lowercase',
    '  - Subject line <= 72 chars (recommended <= 50)',
    '  - No trailing period',
    '  - No AI signature or Co-Authored-By',
    '  - Imperative mood (add, fix, update not added, fixed, updated)',
    '',
    '[Body Rules]',
    '  - Blank line between subject and body',
    '  - Each line <= 72 chars',
    '  - Body is required for project commits; subject alone returns WARN',
    '  - Prefer concise bullet lines (2-4 bullets per commit)',
    '  - Each bullet describes one logical change in plain prose',
    '  - Body <= 15 lines; split into multiple commits if longer',
    '  - Never paste raw tool output or JSON tool args',
    '',
    '[Pre-Commit Checklist]',
    '  [ ] No secret leakage',
    '  [ ] Tests pass or skipped reason is explicit',
    '  [ ] Lint / format pass or skipped reason is explicit',
    '  [ ] Scope is focused',
    '',
    '[Branch Naming]',
    `  ${BRANCH_PREFIXES.map(prefix => `${prefix}/<name>`).join(', ')}`,
    '',
    '[Git Proposal Output Contract]',
    '  1. Proposed branch name',
    '  2. Commit message',
    '  3. Changed files summary' + (files && files.length > 0 ? '\n' + files.map(file => `     - ${file}`).join('\n') : ''),
    '  4. Clear confirmation question',
    '',
    '========================================',
    '',
  ].join('\n')
}

/**
 * Validate a proposed commit message and/or branch name against the user's
 * conventions and render the check report plus the convention guide.
 * @param input - message, branch, changed files, and strictness switches.
 * @returns the formatted validation report and guide text.
 */
export function runGitConventions(input: GitConventionsInput): string {
  const output: string[] = []
  const checks: CheckResult[] = []
  const enforceBody = input.enforce_body !== false

  if (input.message) {
    checks.push(checkFormat(input.message))
    checks.push(checkLength(input.message))
    checks.push(checkCase(input.message))
    checks.push(checkPeriod(input.message))
    checks.push(checkAiSignature(input.message))
    checks.push(checkBodyQuality(input.message, enforceBody))
  }
  if (input.branch) checks.push(checkBranch(input.branch))
  if (checks.length > 0) output.push(formatResults(checks))

  if (input.message) {
    if (enforceBody) {
      output.push('**Strictness:** body enforcement = on (subject alone returns a WARN, bad body returns ERROR)')
    } else {
      output.push('**Strictness:** body enforcement = off (bad body returns WARN; subject alone passes)')
    }
  }

  const allPass = checks.every(check => check.status !== 'error')
  if (input.message && !allPass) {
    output.push('**Correct examples:**')
    output.push('  feat(auth): add login flow')
    output.push('  fix(api): handle null pointer in response parser')
    output.push('  docs(readme): update install instructions')
    output.push('')
  }
  if (input.include_guide !== false) output.push(buildGuide(input.files))
  return output.join('\n')
}
