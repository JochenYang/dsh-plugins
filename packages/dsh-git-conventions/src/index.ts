/**
 * Model-facing git convention validation: commit message format, length, case,
 * body quality, AI signatures, and branch naming. Registers one tool,
 * `git_conventions`, on `ctx.tools`; the validation itself is the pure
 * `runGitConventions` function in `./conventions.ts`.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGitConventions } from './conventions.ts'

/** Cordis plugin name. */
export const name = 'dsh-git-conventions'
/** Services required before the tool can register. */
export const inject = ['tools']

/**
 * Register the `git_conventions` tool on `ctx.tools`. Its schema joins the
 * system-prompt assembly automatically; disposing the plugin fiber unregisters
 * the tool.
 * @param ctx - registrant context carrying the tool registry.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'git_conventions',
    description: 'Validate git commit messages and branch naming conventions. Use before proposing commits, branch names, or PR metadata. Returns validation results plus the user\'s Git convention guide unless include_guide=false.',
    parameters: {
      message: { type: 'string', description: 'Proposed commit message, including optional body.' },
      branch: { type: 'string', description: 'Current or proposed branch name.' },
      files: { type: 'array', items: { type: 'string' }, description: 'Changed file paths for the output contract.' },
      include_guide: { type: 'boolean', description: 'Default true. Set false for validation result only.' },
      enforce_body: { type: 'boolean', description: 'Default true. When true (default), missing body is WARN and bad body is ERROR. Pass false only to validate subject-only.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => runGitConventions(args),
  }))
}
