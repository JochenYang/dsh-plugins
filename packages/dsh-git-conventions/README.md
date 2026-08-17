# dsh-git-conventions

Model-facing `git_conventions` tool bundle: deterministic validation of commit message format, subject length and case, body quality, AI signatures, and branch naming. Ported from the author's [kimi-engineering-tools](https://github.com/owner/kimi-engineering-tools) `git_conventions` MCP tool.

## What it does

Registers one tool, `git_conventions(message?, branch?, files?, include_guide?, enforce_body?)`, on `ctx.tools`. Validation is a pure function of the supplied text — it never reads repository state, runs git, or writes to the session log.

Checks:

- **Format** — subject matches `<type>(<scope>): <description>` with one of `feat|fix|refactor|docs|style|test|chore|perf|ci|build|revert`.
- **Length** — subject <= 72 chars (hard), <= 50 recommended.
- **Case** — subject starts lowercase; no trailing period.
- **AI signature** — no `Co-Authored-By` trailers or generated-with/by signatures.
- **Body** — blank-line separation, <= 72 chars per line, <= 20 lines (hard) / 15 recommended, bullet preference, no raw tool output or JSON argument blocks.
- **Branch** — main branches exempt; others need a `feat/|fix/|refactor/|docs/|chore/` prefix.

`enforce_body` defaults to true: a missing body is WARN and a bad body is ERROR; pass `false` to accept subject-only messages.

## Install

```powershell
pnpm run pack    # build + pack（tarball 不含 devDependencies）
pnpm dsh plugin --profile web add D:\codes\dsh-configure\dsh-git-conventions\dsh-git-conventions-0.1.0.tgz
```

Use the tarball, not the directory: a `link:` install resolves the bundle at its real path, so its `@deepseek-ai/*` imports cannot reach the profile's flat `node_modules`; a tarball install places the package under `profiles/web/node_modules/.pnpm`, whose parent-walk resolves them.

## Develop

```powershell
pnpm install
pnpm typecheck    # types resolve from the deepseek-harness checkout's built declarations via tsconfig paths
pnpm build        # esbuild emits lib/index.js; @deepseek-ai/* stay external (resolved from the profile)
pnpm pack         # build + stage a dependency-free package.json and pack the tarball
```

Restart dsh after reinstalling. Uninstall: `pnpm dsh plugin --profile web remove dsh-git-conventions`.

## Known limitations

- Regex-based approximation of Conventional Commits; exotic formats may be misjudged.
- No repository state inspection (`git status`/`git diff` belong to a commit-review skill or command consumer).
- Convention constants are fixed; per-deployment customization would need a `Config` field (deferred).
