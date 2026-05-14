# Agent Instructions

## Shared Skills
- Use `$project-documentation` when updating `README.md`, `docs/**`, contributor guidance, or repository workflow docs.
- Use `$git-pr-workflow` for the standard branch, review, final-verify, commit, push, and PR-notes flow.
- Use `$api-contract-sync` when backend API changes could drift from OpenAPI output, fixtures, generated clients, or external consumers.
- Use `$intelligence-testing` by default for new development work covered by `npm run test:coverage` that requires tests.
- Use `$local-first-verification` when choosing the cheapest honest local verification path before handoff, review, or commit.
- Use `$mutation-testing` when backend branching, validation, repository SQL, or importer logic deserves a scoped Stryker run beyond the default `verify` gate.

## Principles
- Keep the API read-only unless the user explicitly asks for writes.
- Prefer strict TypeScript, integration-focused tests, and a small dependency footprint.
- Discogs access tokens are importer-only; never require them for request-time API reads.
- Update docs when behavior, schema, or public interfaces change.
- Favor reachable, intentional code paths over defensive branches that can never fire in practice.

## Implementation Expectations
- Use plain SQL migrations and repository modules instead of an ORM.
- Keep Discogs client logic isolated from HTTP handlers.
- Treat SQLite as the cache boundary; request handlers must not call Discogs directly.
- Validate public query parameters and fail with clear `400` responses for invalid input.
- When tests already cover behavior through importer or API integration, avoid duplicate unit tests.
- Prefer code paths that fail fast under mutation testing.

## Quality
- Run `npm run verify` after meaningful backend changes.
- Pull requests against `main` must pass the GitHub Actions `Verify` workflow, which runs `npm run verify`.
- Mutation testing can be run whenever it is a reasonable validation step for the task.
- Add integration fixtures for Discogs payload changes before changing importer mapping logic.
- Preserve backwards-compatible response shapes unless the user asks for a breaking change.
- Keep `npm run verify` fast for routine development.
- Keep the basic coverage gate strict: line and function coverage should stay at `100%`, with branch coverage kept near the current high-water mark instead of capped loosely.
- Treat surviving mutants, no-coverage mutants, and timeout mutants as quality failures.
- Keep mutation test files ordered from focused and fast to broad and slow.
- For API tests, assert complete public response shapes, important error bodies, cache revalidation behavior, and metadata.
- For repository and importer tests, prefer integration-style SQLite fixtures that exercise real SQL, cache-boundary behavior, nullable mappings, replacement or upsert semantics, pagination, limits, and edge values.
- Use coverage ignores only for type-only or source-map artifacts or explicitly unreachable platform branches after considering a realistic test or refactor first.
- Keep README focused on project overview and user-facing basics. Put detailed deployment, development, and testing procedures under `docs/` and link to them from README when needed.
- Treat `docs/plans/` as local planning scratch space. Do not commit plan files by default unless the user explicitly asks for a plan to be preserved in the repository.

## Repo-Specific Workflow Overrides
- Commit in reasonable implementation batches instead of waiting until the very end.
- Prefer one coherent concern per commit, such as scaffold, importer, API, or tests.
- Provide pull request notes as a single fenced Markdown code block so they can be copied in one action without reformatting.
- Structure PR notes with explicit `Title`, `Summary`, and `Verification` sections.
