# @hraness/build-governance

Shared Hraness build-governance scripts and canonical package inventory logic.

This package is consumed as a dev dependency by Hraness repositories. It provides:

- `effect-architecture` — a TypeScript AST checker that enforces the repository's Effect architecture policy (module roles, adapters, runtime roots, ambient I/O, etc.).
- `portfolio-inventory` — a canonicalizer that derives the `hraness.portfolio-inventory/v1` fragment from a package's `package.json` dependencies.

Each consumer keeps its own policy map and any product-specific inventory extensions.
