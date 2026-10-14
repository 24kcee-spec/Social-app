# Repository Map — Social-app

This file maps the repository layout and explains the purpose of important files and folders.

## Overview
This repo is a TypeScript-heavy monorepo for a social app. The project appears to use a workspace structure with app packages and shared libraries.

## Top-level files
- .editorconfig — Editor configuration for consistent formatting and whitespace.
- .env.example — Example environment variables used by the app.
- .gitattributes — Git attributes for line endings and file handling.
- .gitignore — Ignore rules for generated files, environment files, and local artifacts.
- .nvmrc — Specifies the Node.js version recommended for the project.
- .prettierrc — Formatting rules used by Prettier.
- README.md — Main project documentation and setup guide.
- package.json — Root package manifest for the monorepo and workspace scripts.
- pnpm-lock.yaml — Lockfile for pnpm dependency resolution.
- pnpm-workspace.yaml — Defines the workspace packages used by pnpm.
- tsconfig.base.json — Shared TypeScript configuration for all packages.
- smoke-next-phase.ps1 — PowerShell automation script for smoke testing or setup flows.

## Top-level directories
- .github/ — GitHub configuration such as workflows, templates, and automation.
- apps/ — Application-level packages, likely frontend and/or backend apps.
- packages/ — Shared libraries and reusable code packages.
- docs/ — Project documentation and developer notes.
- scripts/ — Helper scripts for maintenance, testing, or local tooling.

## Repository structure summary

```text
Social-app/
├── .github/
├── apps/
├── packages/
├── docs/
├── scripts/
├── .editorconfig
├── .env.example
├── .gitattributes
├── .gitignore
├── .nvmrc
├── .prettierrc
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── smoke-next-phase.ps1
├── tsconfig.base.json
└── ...
```

## Recommended next step
To make this map more complete, the next pass would be to expand each folder (`apps/`, `packages/`, `scripts/`, `.github/`) with a per-directory breakdown and purpose.

---

This map was added to the repository docs folder for quick orientation.
