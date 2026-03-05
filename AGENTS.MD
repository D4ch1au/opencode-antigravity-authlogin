# AGENTS.md

Guidance for AI agents working with this repository.

## Overview

OpenCode plugin for Google Antigravity OAuth. Intercepts `fetch()` calls to `generativelanguage.googleapis.com`, transforms them to Antigravity format, and handles auth, quota, recovery, and multi-account rotation.

## Build & Test Commands

```bash
npm install                          # Install dependencies
npm run build                        # Compile (tsc -p tsconfig.build.json)
npm run typecheck                    # Type-check only (tsc --noEmit)
npm test                             # Run all tests (vitest run)
npx vitest run src/plugin/auth.test.ts          # Single test file
npx vitest run -t "test name here"              # Single test by name
npx vitest --watch src/plugin/auth.test.ts      # Watch mode, single file
npm run test:coverage                # Coverage report
npm run test:e2e:models              # E2E: model availability check
npm run test:e2e:regression          # E2E: regression suite
```

No linter or formatter is configured. Style is enforced by convention (see below).

## TypeScript Configuration

- `strict: true` with extra strictness: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `target: ESNext`, `module: Preserve`, `moduleResolution: bundler`
- `allowImportingTsExtensions: true` — use `.ts` extensions in imports
- No path aliases — all imports are relative

## Code Style

### Imports
- Use `import type { ... }` for type-only imports (enforced by `verbatimModuleSyntax`)
- Named imports only — no default imports in src/
- Relative paths with `.ts` extensions: `import { foo } from "./bar.ts"`
- Order: node builtins > external packages > local modules

### Exports
- Named exports only in src/ — no default exports
- Barrel files (`index.ts`) for module surfaces

### Naming
- `camelCase` for functions, variables, parameters
- `PascalCase` for types, interfaces, classes, enums
- `UPPER_SNAKE_CASE` for constants
- `kebab-case` for file names (e.g., `request-helpers.ts`, `thinking-recovery.ts`)
- Test files: `*.test.ts` colocated with source

### Types
- No `I` prefix on interfaces, no `Type` suffix
- Use `z.infer<typeof Schema>` for Zod-derived types
- Extract to `types.ts` when shared, inline when local
- Discriminated unions preferred over boolean flags
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`

### Functions
- `export function` for public APIs
- Arrow functions for callbacks, factories, and inline closures
- Async functions with targeted try/catch (not blanket)

### Error Handling
- Defensive try/catch with graceful degradation (fallback values, not crashes)
- Custom error classes with metadata when domain-specific (see `errors.ts`)
- Catch `unknown`, log, and convert to domain errors — never empty catch blocks
- Rate limit / quota errors trigger account rotation, not failure

### Formatting
- 2-space indentation
- Double quotes for strings
- Trailing commas in multiline constructs
- No semicolons (project convention)

### Logging
- `createLogger("module-name")` for structured logging
- `console.log` only for CLI/user-facing output

## Module Structure

```
src/
├── plugin.ts                  # Main entry, fetch interceptor
├── constants.ts               # Endpoints, headers, API config, system prompts
├── shims.d.ts                 # Type shims
├── antigravity/
│   └── oauth.ts               # OAuth token exchange
├── hooks/
│   └── auto-update-checker/   # Plugin auto-update logic
│       ├── index.ts, checker.ts, cache.ts, constants.ts, logging.ts, types.ts
│       └── index.test.ts
└── plugin/
    ├── auth.ts                # Token validation & refresh
    ├── request.ts             # Request transformation (core logic)
    ├── request-helpers.ts     # Schema cleaning, thinking filters
    ├── thinking-recovery.ts   # Turn boundary detection
    ├── quota.ts               # Quota checking (API usage stats)
    ├── accounts.ts            # Multi-account management & storage
    ├── rotation.ts            # Account rotation & load balancing
    ├── refresh-queue.ts       # Token refresh queue
    ├── token.ts               # Token utilities
    ├── storage.ts             # Persistent storage schemas (Zod)
    ├── fingerprint.ts         # Device fingerprint generation & headers
    ├── project.ts             # Managed project context resolution
    ├── debug.ts               # Debug logging utilities
    ├── logger.ts              # Logger factory
    ├── logging-utils.ts       # Logging helpers
    ├── errors.ts              # Custom error classes
    ├── types.ts               # Shared type definitions
    ├── cli.ts                 # CLI interface
    ├── server.ts              # OAuth callback server
    ├── search.ts              # Google Search grounding
    ├── image-saver.ts         # Image output handling
    ├── version.ts             # Version detection
    ├── cache.ts               # Auth & signature caching (legacy)
    ├── cache/                 # Cache subsystem
    │   ├── index.ts, signature-cache.ts
    ├── config/                # Plugin configuration
    │   ├── index.ts, loader.ts, schema.ts, models.ts, updater.ts
    ├── core/
    │   └── streaming/         # Streaming response handling
    ├── recovery/              # Session recovery subsystem
    │   ├── index.ts, storage.ts, constants.ts, types.ts
    ├── recovery.ts            # Session recovery (tool_result_missing)
    ├── stores/
    │   └── signature-store.ts # Signature persistence
    ├── transform/             # Model-specific request/response transforms
    │   ├── index.ts, types.ts
    │   ├── claude.ts          # Claude-specific transforms
    │   ├── gemini.ts          # Gemini-specific transforms
    │   ├── model-resolver.ts  # Model name resolution & routing
    │   └── cross-model-sanitizer.ts  # Cross-model schema sanitization
    └── ui/                    # Terminal UI components
        ├── ansi.ts            # ANSI formatting
        ├── auth-menu.ts       # Auth menu interface
        ├── confirm.ts, select.ts  # Prompt helpers
```

## Key Design Patterns

1. **Request Interception** — Plugin intercepts `fetch()` for `generativelanguage.googleapis.com`, transforms to Antigravity format. Two header styles: `antigravity` (Electron-style UA + fingerprint) and `gemini-cli` (nodejs-client UA).
2. **Claude Thinking Blocks** — ALL thinking blocks are stripped from outgoing requests for Claude models. Claude generates fresh thinking each turn. Eliminates signature validation errors.
3. **Session Recovery** — When tool execution is interrupted (ESC/timeout), the plugin injects synthetic `tool_result` blocks to recover the session without starting over.
4. **Schema Sanitization** — Tool schemas are cleaned via allowlist. Unsupported fields (`const`, `$ref`, `$defs`) are removed or converted to Antigravity-compatible format.
5. **Multi-Account Load Balancing** — Accounts rotate on rate limits. Gemini has dual quota pools (Antigravity headers + Gemini CLI headers). Fingerprints are per-account and regenerated on capacity exhaustion.
6. **Fingerprint System** — Per-account device fingerprints stored in `antigravity-accounts.json`. Each fingerprint includes deviceId, sessionToken, userAgent, and reduced clientMetadata (ideType, platform, pluginType). Header composed by `buildFingerprintHeaders()` in `fingerprint.ts`.
7. **Model Transform Pipeline** — `transform/` separates Claude vs Gemini request/response transforms with a shared cross-model sanitizer and model resolver for name mapping.

## Dependencies

- `zod ^4` — schema validation (NOT zod v3)
- `@opencode-ai/plugin` — OpenCode plugin interface
- `@openauthjs/openauth` — OAuth client
- `proper-lockfile` — file locking for concurrent access
- `xdg-basedir` — XDG directory resolution

## Testing

- Framework: **Vitest 3** with native ESM, `globals: true`
- Config: `vitest.config.ts`
- Tests colocated: `src/plugin/foo.test.ts` next to `src/plugin/foo.ts`
- 30 test files across the codebase
- Use `describe`/`it`/`expect` — standard Vitest API
- Mock with `vi.fn()`, `vi.spyOn()`, `vi.mock()`

## Documentation

- [README.md](README.md) — Installation & usage
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Detailed architecture guide
- [docs/ANTIGRAVITY_API_SPEC.md](docs/ANTIGRAVITY_API_SPEC.md) — API reference
- [CHANGELOG.md](CHANGELOG.md) — Version history
