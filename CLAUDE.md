# Claude Developer Instructions

## 🚨 CRITICAL: Pre-Commit Quality Checks

**ALWAYS run quality checks before committing to this repository.** The CI/CD pipeline enforces strict quality standards and will fail if these checks don't pass locally.

## Quick Start

```bash
# Run all CI checks at once (recommended)
make ci-check

# Or run the npm equivalent
npm run ci:check
```

## Required Checks Before Every Commit

### 1. Code Linting

```bash
make lint
# OR
npm run lint
```

- Ensures TypeScript code follows ESLint rules
- Must pass with zero errors or warnings

### 2. Code Formatting

```bash
make format-check
# OR
npm run format:check
```

- Validates Prettier formatting consistency
- Run `make format` to auto-fix formatting issues

### 3. Type Checking

```bash
make typecheck
# OR
npm run typecheck
```

- Validates TypeScript types compile correctly
- Must pass with zero type errors

### 4. Test Suite

```bash
make test
# OR
npm run test:coverage
```

- Runs complete test suite with coverage
- All tests must pass
- Coverage thresholds must be met

## Development Workflow

### Initial Setup

```bash
# Install dependencies
make install

# Verify development environment
make dev-setup
```

### Daily Development

```bash
# Start development with file watching
npm run dev

# Run tests in watch mode during development
make test-watch

# Before committing (REQUIRED)
make ci-check
```

### Code Quality Commands

| Command          | Purpose                 | When to Use             |
| ---------------- | ----------------------- | ----------------------- |
| `make ci-check`  | Run all CI checks       | Before every commit     |
| `make lint`      | Check code style        | During development      |
| `make lint-fix`  | Auto-fix lint issues    | When lint errors occur  |
| `make format`    | Format all code         | When format check fails |
| `make typecheck` | Verify TypeScript       | After code changes      |
| `make test`      | Run tests with coverage | After logic changes     |

## Testing Standards

This project follows strict testing standards outlined in `TEST_POLICY.md`:

- **100% test coverage required**
- **DRY principle** with reusable test utilities
- **SOLID principles** with dependency injection
- **Comprehensive error handling** tests

### Test Commands

```bash
# Run tests with coverage (required before commit)
make test

# Watch mode for development
make test-watch

# Interactive UI mode
make test-ui
```

## AWS CDK Commands

```bash
# Synthesize CloudFormation templates
make cdk-synth

# Deploy infrastructure (with confirmation)
make cdk-deploy

# One-time CDK setup
make cdk-bootstrap
```

## CI/CD Pipeline

The GitHub Actions pipeline runs the same checks as `make ci-check`:

1. **Lint & Format Check** - ESLint + Prettier validation
2. **TypeScript Type Check** - Compile-time verification
3. **Test & Coverage** - Full test suite execution
4. **Build Verification** - TypeScript compilation + CDK synthesis
5. **Security Scan** - npm audit + CodeQL analysis

## Common Issues & Solutions

### ESLint Errors

```bash
# View specific errors
make lint

# Auto-fix common issues
make lint-fix
```

### Formatting Issues

```bash
# Check what needs formatting
make format-check

# Auto-format all files
make format
```

### TypeScript Errors

```bash
# See specific type errors
make typecheck

# Check your IDE's TypeScript integration
```

### Test Failures

```bash
# Run specific test file
npm test -- src/path/to/test.test.ts

# Debug with verbose output
npm test -- --reporter=verbose

# Check coverage report
npm run test:coverage
```

## Pre-Commit Checklist

Before committing any code, ensure:

- [ ] `make ci-check` passes completely
- [ ] All new code has corresponding tests
- [ ] Test coverage remains at 100%
- [ ] No console.log statements in production code
- [ ] Environment variables are documented
- [ ] Changes follow existing code patterns

## File Organization

```
src/
├── agents/           # AI agent implementations
│   ├── *.ts         # Source files
│   └── *.test.ts    # Test files (alongside source)
├── aws/             # AWS service integrations
├── claude/          # Claude AI integration
├── queue/           # SQS queue handling
├── services/        # External service clients
├── test/            # Shared test utilities
│   ├── fixtures/    # Test data
│   ├── helpers/     # Test utilities
│   └── setup.ts     # Global test setup
└── types.ts         # TypeScript type definitions
```

## Branch Protection

The `main` branch is protected and requires:

- All CI status checks to pass
- At least 1 approving review
- Branches to be up to date before merging

## Getting Help

- **Build Issues**: Check `make help` for available commands
- **Test Issues**: Review `TEST_POLICY.md` for testing standards
- **CI Failures**: Run `make ci-check` locally to reproduce issues
- **AWS Issues**: Ensure proper AWS credentials and permissions

## Remember

🔥 **NEVER commit without running `make ci-check` first!** 🔥

The CI pipeline will reject any code that doesn't meet quality standards. Save time by catching issues locally before pushing to GitHub.
