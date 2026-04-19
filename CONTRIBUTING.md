# Contributing Guide

Thank you for your interest in contributing to `mcp-server-starter-ts`!

## Getting Started

### Prerequisites

- Node.js 22+ (use `.nvmrc` for version management)
- npm or pnpm
- Docker (for local testing)

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/reaatech/mcp-server-starter-ts.git
   cd mcp-server-starter-ts
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Locally

```bash
# Development mode with hot reload
npm run dev

# Run tests
npm run test:unit

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

### Pre-commit Hooks

The project uses Husky with lint-staged. Pre-commit hooks automatically:
- Lint staged files
- Run type checking
- Run all unit tests

### Adding Tools

1. Create `src/tools/your-tool.tool.ts`
2. Create `tests/unit/tools/your-tool.tool.test.ts`
3. Follow the patterns in `docs/TOOL_AUTHORING.md`

### Adding Tests

- Unit tests go in `tests/unit/`
- E2E tests go in `tests/e2e/`
- Maintain >80% code coverage

## Pull Request Process

1. Ensure all CI checks pass
2. Update documentation if needed
3. Add tests for new functionality
4. Follow the PR template
5. Request review from maintainers

## Code Style

- Follow ESLint rules
- Use Prettier for formatting
- Write descriptive variable names
- Add JSDoc for public APIs

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add new tool`
- `fix: resolve auth middleware bug`
- `docs: update README`
- `refactor: improve tool discovery`
- `test: add unit tests for rate limiter`

## Reporting Issues

- Use the bug report template
- Include environment details
- Provide reproduction steps
- Add logs if applicable

## Security

- Report vulnerabilities privately
- Do not commit secrets
- Follow security best practices in `docs/SECURITY.md`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
