# 0005.0005. Provider adapter pattern

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

## Summary

Every outside service AFT depends on (LLMs, image and video models, Stripe, email, AWS, GitHub, the code sandbox) sits behind an AFT interface called a port. Each provider gets one adapter that implements the port, and the rest of the code only ever talks to the port. Swapping or adding a provider then means writing one adapter, and tests use fakes instead of real services.

## Decision

Ports and adapters in the owning domain package; one adapter folder per provider; a shared contract test per port; the LLM adapter built on the Vercel AI SDK; a lint rule that keeps provider SDKs inside their adapters.

## Shape

```
packages/<domain>/src/
  ports/<capability>.ts        the interface and its zod input and output types
  adapters/<provider>/index.ts one implementation per provider
  adapters/fake/index.ts       an in memory fake for tests
  ports/<capability>.contract.ts  shared tests every adapter must pass
  index.ts                     exports the port, a factory, and the fake
```

| Port | Package | First adapters |
|---|---|---|
| `LlmPort` (chat, tools, structured output, streaming) | `packages/ai` | Vercel AI SDK adapter covering Anthropic, OpenAI, and Google; routing and fallback by config (feature 83) |
| `ImagePort`, `VideoPort`, `ModelPort` | `packages/ai` | chosen in features 86 to 98 |
| `PaymentsPort` | `packages/billing` | Stripe |
| `EmailPort` | `packages/email` | Resend (existing) |
| `SandboxPort` | `packages/sandbox` | chosen in slice 9 (child 0007) |
| `CloudPort` (the AWS calls provisioning needs) | `packages/provisioning` | AWS SDK v3 |
| `GitHostPort` | `packages/provisioning` | GitHub (App Studio export) |

## Rules

- A port speaks AFT's language (AFT ids, minor unit money, UTC times), never a provider's types; adapters translate.
- Factories pick the adapter from typed config (`LLM_PROVIDERS`, `EMAIL_PROVIDER`), never from `if` statements in domain code.
- Every adapter call has a timeout, a retry budget with jitter for safe operations, a circuit breaker, and an idempotency key for writes (X6, X1); the helpers live in `packages/observability` (feature 7).
- Every adapter records a span with `provider`, `operation`, latency, and cost where known (per call cost tracking for AI).
- Provider output is validated with zod before use; model output is data, never instructions (X14).
- A lint rule (`no-restricted-imports`) blocks provider SDK imports outside `adapters/<provider>/` (AC-11).
- Every adapter runs its port's contract test against the fake in CI and against the real provider in a nightly job with test credentials.

## Consequences

- One more layer per provider, and contract tests to maintain.
- The Vercel AI SDK already normalizes many LLM providers, so the LLM adapter stays thin; the port still shields the code from that SDK's own changes.

## Rationale (short)

PLAN.md already made ports and adapters a rule for every provider, and multi provider LLMs were locked on 2026-10-18. Writing down the folder shape, contract tests, and lint rule makes the rule enforceable instead of aspirational.
