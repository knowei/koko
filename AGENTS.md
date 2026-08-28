# AI Companion Development Rules

These instructions apply to all work inside `ai-companion/`.

## Required Validation

Run `npm run check` before handing off a completed change. It checks both browser and server TypeScript, runs the Node test suite, and creates a production bundle. For UI changes, also inspect the affected desktop and mobile layouts through `npm run dev`.

## TypeScript

- Keep strict typing enabled. Do not introduce `any`, `@ts-ignore`, or unchecked API response casts. Parse external data as `unknown` and narrow it with small validation helpers.
- Use `type` imports for type-only dependencies. Export shared domain types instead of repeating inline object shapes.
- Catch errors as `unknown`; convert them with `error instanceof Error ? error.message : String(error)`.
- Validate and bound all request input at the API boundary before passing it to domain functions.

## React and State

- Components use `PascalCase`; hooks, handlers, and state use `camelCase`.
- Keep components focused. Extract a section when it owns independent state, effects, or substantial markup. Avoid adding more responsibilities to files already over roughly 500 lines.
- Put shared application state in Zustand, temporary form state in the component, API calls in `src/lib/`, and static content in `src/data/`.
- Avoid inline styles. Add semantic class names to `src/styles.css`; preserve desktop and mobile behavior together.

## Server

- Keep route handlers thin: validate input, call a service, then map the result to HTTP.
- Reuse network clients and connection pools. Every external request must have a timeout and a safe user-facing error.
- Never log API keys, authorization headers, passwords, tokens, or full third-party responses.

## Style and Changes

Use two-space indentation, double quotes, semicolons, ES modules, and descriptive names. Prefer early returns over deeply nested conditions. Keep changes scoped; do not reformat unrelated files or overwrite existing worktree changes. Add or update tests for game rules, parsers, state transitions, and bug fixes.
