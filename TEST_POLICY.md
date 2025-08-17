# Test Policy & Best Practices

## Overview

This document outlines the testing standards and practices for the GitHub Issue Workflow Bot project. Our goal is to achieve and maintain 100% test coverage while following industry best practices.

## Core Testing Principles

### 1. DRY (Don't Repeat Yourself)

- **Test Utilities**: Create reusable test helpers and fixtures
- **Shared Setup**: Use `beforeEach`/`afterEach` for common test setup
- **Factory Functions**: Build data factories for test objects
- **Custom Matchers**: Create domain-specific assertion helpers

### 2. SOLID Principles in Testing

- **Single Responsibility**: Each test should verify one specific behavior
- **Open/Closed**: Tests should be easily extensible without modification
- **Liskov Substitution**: Mocks should behave identically to real implementations
- **Interface Segregation**: Mock only the interfaces your code actually uses
- **Dependency Inversion**: Test against abstractions, not concrete implementations

### 3. Dependency Inversion

- **Interface-Based Testing**: Test against TypeScript interfaces
- **Mock Injection**: Inject dependencies rather than importing them directly
- **Abstraction Layer**: Test business logic separately from infrastructure concerns
- **Isolated Units**: Each unit test should test one component in isolation

## Test Coverage Requirements

### Coverage Targets

- **Overall Coverage**: 100%
- **Line Coverage**: 100%
- **Branch Coverage**: 100%
- **Function Coverage**: 100%
- **Statement Coverage**: 100%

### Coverage Exclusions

- Generated files (CDK output, compiled JS)
- Configuration files
- Type definition files
- Test files themselves

## Test Structure & Organization

### File Naming Conventions

```
src/
├── components/
│   ├── example.ts
│   ├── example.test.ts          # Unit tests
│   └── example.integration.test.ts  # Integration tests
└── test/
    ├── fixtures/                # Test data
    ├── helpers/                 # Test utilities
    └── setup.ts                # Global test setup
```

### Test Categories

#### 1. Unit Tests

- Test individual functions/classes in isolation
- Mock all external dependencies
- Fast execution (< 100ms per test)
- Located alongside source files

#### 2. Integration Tests

- Test component interactions
- Use real implementations where practical
- Mock only external services (AWS, GitHub API)
- Located in `src/test/integration/`

#### 3. Contract Tests

- Verify interface compliance
- Ensure mocks match real implementations
- Test API contracts and data structures

## Test Implementation Standards

### Test Structure (AAA Pattern)

```typescript
describe('ComponentName', () => {
  it('should perform expected behavior when given valid input', () => {
    // Arrange - Set up test data and mocks
    const mockDependency = createMockDependency();
    const component = new Component(mockDependency);

    // Act - Execute the code under test
    const result = component.methodUnderTest(testInput);

    // Assert - Verify the expected outcome
    expect(result).toBe(expectedOutput);
    expect(mockDependency.method).toHaveBeenCalledWith(expectedArgs);
  });
});
```

### Mock Strategy

#### Dependency Injection Pattern

```typescript
// ✅ Good - Testable with dependency injection
class WorkflowProcessor {
  constructor(
    private githubService: GitHubServiceInterface,
    private sqsClient: SQSClientInterface
  ) {}
}

// Test
const mockGitHub = createMockGitHubService();
const mockSQS = createMockSQSClient();
const processor = new WorkflowProcessor(mockGitHub, mockSQS);
```

#### Factory Pattern for Mocks

```typescript
// test/helpers/mock-factories.ts
export const createMockGitHubService = (overrides?: Partial<GitHubServiceInterface>) => ({
  createIssueComment: vi.fn(),
  createBranch: vi.fn(),
  createPullRequest: vi.fn(),
  ...overrides,
});
```

### Test Data Management

#### Fixture Pattern

```typescript
// test/fixtures/github-webhook.ts
export const githubIssueCreatedFixture = {
  action: 'opened',
  issue: {
    id: 123,
    number: 1,
    title: 'Test Issue',
    body: 'Test description',
    // ... complete valid structure
  },
  repository: {
    // ... complete valid structure
  },
};
```

#### Builder Pattern for Complex Objects

```typescript
// test/helpers/workflow-context-builder.ts
export class WorkflowContextBuilder {
  private context: Partial<WorkflowContext> = {};

  withIssueId(id: number) {
    this.context.issueId = id;
    return this;
  }

  withStatus(status: WorkflowStatus) {
    this.context.status = status;
    return this;
  }

  build(): WorkflowContext {
    return {
      issueId: 1,
      issueNumber: 1,
      repository: 'test-repo',
      owner: 'test-owner',
      title: 'Test Issue',
      body: 'Test body',
      labels: [],
      status: WorkflowStatus.PENDING,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...this.context,
    };
  }
}
```

## Error Handling & Edge Cases

### Error Scenarios to Test

- Network failures
- Invalid input data
- Authentication failures
- Rate limiting
- Timeout scenarios
- Resource not found
- Concurrent access issues

### Error Testing Pattern

```typescript
it('should handle network failures gracefully', async () => {
  // Arrange
  const mockService = createMockService();
  mockService.apiCall.mockRejectedValue(new NetworkError('Connection failed'));

  // Act & Assert
  await expect(component.performAction()).rejects.toThrow('Connection failed');
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
});
```

## Async Testing Standards

### Promise Testing

```typescript
it('should handle async operations correctly', async () => {
  // ✅ Good - Using async/await
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

it('should handle promise rejections', async () => {
  // ✅ Good - Testing rejections
  await expect(failingAsyncFunction()).rejects.toThrow('Expected error');
});
```

### Timeout Handling

```typescript
it('should timeout long-running operations', async () => {
  const slowFunction = vi
    .fn()
    .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));

  await expect(withTimeout(slowFunction(), 1000)).rejects.toThrow('Operation timed out');
}, 2000); // Test timeout
```

## Performance Testing

### Benchmark Critical Paths

```typescript
describe('Performance Tests', () => {
  it('should process webhook events efficiently', async () => {
    const startTime = performance.now();

    await webhookProcessor.process(largeWebhookPayload);

    const duration = performance.now() - startTime;
    expect(duration).toBeLessThan(500); // 500ms max
  });
});
```

## Test Environment Setup

### Global Setup (test/setup.ts)

```typescript
import { vi } from 'vitest';

// Mock external services globally
vi.mock('@aws-sdk/client-sqs');
vi.mock('@octokit/rest');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.GITHUB_TOKEN = 'test-token';
process.env.SQS_QUEUE_URL = 'test-queue-url';

// Global test utilities
global.createTestContext = () => {
  // Common test setup
};
```

## Continuous Integration Requirements

### CI Pipeline

- Run tests in parallel when possible
- Generate coverage reports
- Fail build if coverage drops below 100%
- Store test artifacts for debugging

### Coverage Enforcement

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
      // Fail CI if coverage drops
      all: true,
      skipFull: false,
    },
  },
});
```

## Code Quality Standards

### Test Code Quality

- Tests should be as well-written as production code
- Use TypeScript strictly in tests
- Apply ESLint rules to test files
- Regular refactoring of test code

### Documentation

- Test names should clearly describe the scenario
- Complex test logic should include comments
- Document any test-specific setup or teardown

### Review Guidelines

- All tests must be reviewed before merge
- Coverage reports must be reviewed
- Test performance must be considered

## Monitoring & Maintenance

### Test Health Metrics

- Test execution time trends
- Flaky test identification
- Coverage trend analysis
- Test maintenance overhead

### Regular Maintenance

- Review and update test fixtures
- Refactor duplicated test code
- Update mocks when interfaces change
- Prune obsolete tests

This policy ensures our test suite provides maximum confidence in the codebase while maintaining developer productivity and code quality.
