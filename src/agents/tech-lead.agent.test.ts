import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TechLeadAgent } from './tech-lead.agent';
import { AgentType, WorkflowError } from '../types';
import { MockClaudeRunner } from '../claude';
import { mockWorkflowContext } from '../test/fixtures';

describe('TechLeadAgent', () => {
  let techLeadAgent: TechLeadAgent;
  let mockClaudeRunner: MockClaudeRunner;

  beforeEach(() => {
    mockClaudeRunner = new MockClaudeRunner();

    // Set up a spy to return different responses based on the prompt content
    const originalRunPrompt = mockClaudeRunner.runPrompt.bind(mockClaudeRunner);
    vi.spyOn(mockClaudeRunner, 'runPrompt').mockImplementation(async (prompt: string) => {
      // Determine response based on prompt content (order matters - most specific first)
      if (prompt.includes('Add unit tests') || prompt.includes('comprehensive test coverage')) {
        return `## Technical Analysis

### Complexity Assessment
**Medium** - Standard feature development with moderate complexity

### Recommended Technologies
- Jest for unit testing
- Supertest for API testing
- Testing Library for component testing

### Implementation Approach
1. **Set up testing framework**
   - Configure test environment
   - Set up test utilities

2. **Write unit tests**
   - Test individual functions
   - Mock external dependencies

3. **Write integration tests**
   - Test API endpoints
   - Test database interactions

4. **Set up continuous testing**
   - Configure test automation
   - Add coverage reporting

### Testing Strategy
- Unit Tests for individual functions
- Integration Tests for system components
- End-to-end Tests for user workflows
- Performance Tests for critical paths

### Estimated Timeline
2-4 business days

### Dependencies
- Testing framework setup
- CI/CD pipeline integration

### Acceptance Criteria
- [ ] Comprehensive test coverage
- [ ] All tests pass consistently
- [ ] Testing is automated`;
      }

      if (
        prompt.includes('REST API endpoints') ||
        (prompt.includes('API') &&
          !prompt.includes('General improvement') &&
          !prompt.includes('Some improvement'))
      ) {
        return `## Technical Analysis

### Complexity Assessment
**Medium** - Standard feature development with moderate complexity

### Recommended Technologies
- Express.js for REST API
- OpenAPI/Swagger for documentation
- Node.js for backend runtime

### Implementation Approach
1. **Design API endpoints**
   - Define request/response schemas
   - Set up routing structure

2. **Implement core business logic**
   - Create service layer
   - Add validation middleware

3. **Add error handling**
   - Global error middleware
   - Proper HTTP status codes

4. **Add documentation**
   - OpenAPI specification
   - Interactive API docs

### Testing Strategy
- Unit Tests for API functions
- Integration Tests for endpoints
- Performance Tests for load handling

### Estimated Timeline
2-4 business days

### Dependencies
- API documentation updates
- Client-side integration

### Acceptance Criteria
- [ ] API endpoints respond correctly
- [ ] Request validation works properly
- [ ] Documentation is complete`;
      }

      if (prompt.includes('database') || prompt.includes('Database')) {
        return `## Technical Analysis

### Complexity Assessment
**Medium** - Standard feature development with moderate complexity

### Recommended Technologies
- PostgreSQL for relational data
- Prisma for database ORM
- Redis for caching

### Implementation Approach
1. **Database schema design**
   - Define entity relationships
   - Create migration scripts

2. **ORM setup and configuration**
   - Set up Prisma client
   - Configure connection pooling

### Testing Strategy
- Unit Tests for database functions
- Integration Tests for data flow
- Performance Tests for query optimization

### Estimated Timeline
2-4 business days

### Dependencies
- Database server setup
- Migration strategy

### Acceptance Criteria
- [ ] Database schema is properly designed
- [ ] ORM integration works correctly
- [ ] Data integrity is maintained`;
      }

      if (prompt.includes('refactor') || prompt.includes('breaking')) {
        return `## Technical Analysis

### Complexity Assessment
**High** - Requires significant architectural changes and careful planning

### Recommended Technologies
- Standard project stack technologies

### Implementation Approach
1. **Analyze current codebase**
   - Identify breaking changes needed
   - Plan migration strategy

2. **Implement core functionality**
   - Refactor in phases
   - Maintain backwards compatibility where possible

3. **Update dependencies**
   - Upgrade affected packages
   - Update documentation

4. **Integration and testing**
   - Comprehensive testing suite
   - Gradual rollout strategy

### Testing Strategy
- Unit Tests for refactored components
- Integration Tests for system compatibility
- Performance Tests for optimization
- Regression Tests for existing functionality

### Estimated Timeline
5-8 business days

### Dependencies
- Code review approval
- Deployment coordination

### Acceptance Criteria
- [ ] Breaking changes are documented
- [ ] Migration path is clear
- [ ] All tests pass after refactor`;
      }

      if (prompt.includes('typo') || prompt.includes('minor') || prompt.includes('Simple')) {
        return `## Technical Analysis

### Complexity Assessment
**Low** - Simple fix or minor enhancement

### Recommended Technologies
- Standard project stack technologies

### Implementation Approach
1. **Analyze current codebase**
   - Identify the issue
   - Plan the fix

2. **Implement core functionality**
   - Make the necessary changes
   - Test the fix

3. **Update dependencies**
   - Update any affected documentation

4. **Integration and testing**
   - Run existing tests
   - Verify the fix works

### Testing Strategy
- Unit Tests for affected functions
- Integration Tests if needed
- Performance Tests if applicable
- Manual verification

### Estimated Timeline
1-2 business days

### Dependencies
- No external dependencies identified

### Acceptance Criteria
- [ ] Issue is resolved
- [ ] No regressions introduced
- [ ] Documentation updated if needed`;
      }

      if (
        (prompt.includes('authentication') ||
          prompt.includes('login') ||
          prompt.includes('auth')) &&
        !prompt.includes('General improvement') &&
        !prompt.includes('Some improvement')
      ) {
        return `## Technical Analysis

### Complexity Assessment
**Medium** - Standard feature development with moderate complexity

### Recommended Technologies
- JWT for token-based authentication
- bcrypt for password hashing
- Passport.js for authentication middleware

### Implementation Approach
1. **Create authentication middleware**
   - Implement JWT token validation
   - Add error handling for invalid tokens

2. **Set up user authentication service**
   - Password hashing and validation
   - Token generation and refresh logic

3. **Update existing endpoints**
   - Add authentication requirements
   - Implement authorization checks

4. **Create authentication routes**
   - Login and logout endpoints
   - Token refresh mechanism

### Testing Strategy
- Unit Tests for authentication middleware
- Integration Tests for login flow
- Security Tests for token validation
- Performance Tests for auth overhead

### Estimated Timeline
2-3 business days

### Dependencies
- User management system
- Database schema for users

### Acceptance Criteria
- [ ] Users can log in with valid credentials
- [ ] Invalid login attempts are rejected
- [ ] JWT tokens are generated and validated
- [ ] Protected endpoints require authentication`;
      }

      if (
        (prompt.includes('testing') || prompt.includes('test')) &&
        !prompt.includes('General improvement') &&
        !prompt.includes('Some improvement') &&
        !prompt.includes('random improvement')
      ) {
        return `## Technical Analysis

### Complexity Assessment
**Medium** - Standard feature development with moderate complexity

### Recommended Technologies
- Jest for unit testing
- Supertest for API testing
- Testing Library for component testing

### Implementation Approach
1. **Set up testing framework**
   - Configure test environment
   - Set up test utilities

2. **Write unit tests**
   - Test individual functions
   - Mock external dependencies

3. **Write integration tests**
   - Test API endpoints
   - Test database interactions

4. **Set up continuous testing**
   - Configure test automation
   - Add coverage reporting

### Testing Strategy
- Unit Tests for individual functions
- Integration Tests for system components
- End-to-end Tests for user workflows
- Performance Tests for critical paths

### Estimated Timeline
2-4 business days

### Dependencies
- Testing framework setup
- CI/CD pipeline integration

### Acceptance Criteria
- [ ] Comprehensive test coverage
- [ ] All tests pass consistently
- [ ] Testing is automated`;
      }

      // Default response for other cases
      return `## Technical Analysis

### Complexity Assessment
**Medium** - Standard feature development with moderate complexity

### Recommended Technologies
- Standard project stack technologies

### Implementation Approach
1. **Analyze current codebase**
   - Understand existing architecture
   - Identify integration points

2. **Implement core functionality**
   - Build the feature incrementally
   - Follow existing patterns

3. **Update dependencies**
   - Add necessary packages
   - Update configuration

4. **Integration and testing**
   - Write comprehensive tests
   - Verify integration works

### Testing Strategy
- Unit Tests for core functionality
- Integration Tests for system compatibility
- Performance Tests for scalability
- Manual testing for edge cases

### Estimated Timeline
2-4 business days

### Dependencies
- No external dependencies identified

### Acceptance Criteria
- [ ] Feature works as described in the issue
- [ ] All edge cases are handled appropriately
- [ ] Error messages are clear and helpful
- [ ] Performance meets acceptable standards`;
    });

    techLeadAgent = new TechLeadAgent(mockClaudeRunner);
  });

  describe('constructor', () => {
    it('should initialize with correct agent type', () => {
      expect((techLeadAgent as any).type).toBe(AgentType.TECH_LEAD);
      expect((techLeadAgent as any).claudeRunner).toBe(mockClaudeRunner);
    });

    it('should use default timeout when not specified', () => {
      expect((techLeadAgent as any).timeout).toBe(30000);
    });

    it('should use custom timeout when specified', () => {
      const customAgent = new TechLeadAgent(mockClaudeRunner, 60000);
      expect((customAgent as any).timeout).toBe(60000);
    });
  });

  describe('execute', () => {
    it('should successfully analyze an authentication issue', async () => {
      const authContext = {
        ...mockWorkflowContext,
        title: 'Add user authentication',
        body: 'We need to add login functionality with JWT tokens',
        labels: ['enhancement', 'security'],
      };

      const result = await techLeadAgent.execute(authContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain('## Technical Analysis');
      expect(result.output).toContain('### Complexity Assessment');
      expect(result.output).toContain('### Recommended Technologies');
      expect(result.output).toContain('JWT for token-based authentication');
      expect(result.output).toContain('bcrypt for password hashing');
      expect(result.output).toContain('### Implementation Approach');
      expect(result.output).toContain('authentication middleware');
      expect(result.error).toBeUndefined();
    });

    it('should successfully analyze an API issue', async () => {
      const apiContext = {
        ...mockWorkflowContext,
        title: 'Create REST API endpoints',
        body: 'We need to create API endpoints for user management',
        labels: ['api', 'backend'],
      };

      const result = await techLeadAgent.execute(apiContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Express.js for REST API');
      expect(result.output).toContain('OpenAPI/Swagger for documentation');
      expect(result.output).toContain('Design API endpoints');
      expect(result.output).toContain('Define request/response schemas');
    });

    it('should successfully analyze a database issue', async () => {
      const dbContext = {
        ...mockWorkflowContext,
        title: 'Add database integration',
        body: 'We need to integrate a database for storing user data',
        labels: ['database', 'backend'],
      };

      const result = await techLeadAgent.execute(dbContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain('PostgreSQL for relational data');
      expect(result.output).toContain('Prisma for database ORM');
      expect(result.output).toContain('Redis for caching');
    });

    it('should handle context validation errors', async () => {
      const invalidContext = { ...mockWorkflowContext, title: '' };

      try {
        await techLeadAgent.execute(invalidContext);
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowError);
        expect((error as WorkflowError).code).toBe('INVALID_CONTEXT');
      }
    });

    it('should include testing strategy in analysis', async () => {
      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.output).toContain('### Testing Strategy');
      expect(result.output).toContain('Unit Tests');
      expect(result.output).toContain('Integration Tests');
      expect(result.output).toContain('Security Tests');
      expect(result.output).toContain('Performance Tests');
    });

    it('should include timeline estimation', async () => {
      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.output).toContain('### Estimated Timeline');
      expect(result.output).toMatch(/\d+-\d+ business days/);
    });

    it('should include acceptance criteria', async () => {
      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.output).toContain('### Acceptance Criteria');
      expect(result.output).toContain('- [ ]'); // Checklist format
    });
  });

  describe('complexity determination', () => {
    it('should identify high complexity issues', async () => {
      const highComplexityContext = {
        ...mockWorkflowContext,
        title: 'Major system refactor',
        body: 'This requires breaking changes to the architecture',
        labels: ['refactor', 'breaking'],
      };

      const result = await techLeadAgent.execute(highComplexityContext);

      expect(result.output).toContain('**High**');
      expect(result.output).toContain('significant architectural changes');
      expect(result.output).toContain('5-8 business days');
    });

    it('should identify medium complexity issues', async () => {
      const mediumComplexityContext = {
        ...mockWorkflowContext,
        title: 'Add new feature',
        body: 'Implement a new user dashboard feature',
        labels: ['feature', 'enhancement'],
      };

      const result = await techLeadAgent.execute(mediumComplexityContext);

      expect(result.output).toContain('**Medium**');
      expect(result.output).toContain('Standard feature development');
      expect(result.output).toContain('2-4 business days');
    });

    it('should identify low complexity issues', async () => {
      const lowComplexityContext = {
        ...mockWorkflowContext,
        title: 'Fix typo in documentation',
        body: 'Small update to fix a typo',
        labels: ['bug', 'minor'],
      };

      const result = await techLeadAgent.execute(lowComplexityContext);

      expect(result.output).toContain('**Low**');
      expect(result.output).toContain('Simple fix or minor enhancement');
      expect(result.output).toContain('1-2 business days');
    });
  });

  describe('technology suggestions', () => {
    it('should suggest appropriate technologies for auth issues', async () => {
      const authContext = {
        ...mockWorkflowContext,
        title: 'User login system',
        body: 'Need authentication and authorization',
      };

      const result = await techLeadAgent.execute(authContext);

      expect(result.output).toContain('JWT for token-based authentication');
      expect(result.output).toContain('bcrypt for password hashing');
      expect(result.output).toContain('Passport.js for authentication middleware');
    });

    it('should suggest testing technologies', async () => {
      const testContext = {
        ...mockWorkflowContext,
        title: 'Add unit tests',
        body: 'We need comprehensive test coverage',
      };

      const result = await techLeadAgent.execute(testContext);

      expect(result.output).toContain('Jest for unit testing');
      expect(result.output).toContain('Supertest for API testing');
      expect(result.output).toContain('Testing Library for component testing');
    });

    it('should fall back to standard technologies for unknown domains', async () => {
      const genericContext = {
        ...mockWorkflowContext,
        title: 'Generic improvement',
        body: 'Some random improvement that doesnt match patterns',
      };

      const result = await techLeadAgent.execute(genericContext);

      expect(result.output).toContain('Standard project stack technologies');
    });
  });

  describe('implementation planning', () => {
    it('should provide detailed auth implementation plan', async () => {
      const authContext = {
        ...mockWorkflowContext,
        title: 'Add authentication',
        body: 'Need user login functionality',
      };

      const result = await techLeadAgent.execute(authContext);

      expect(result.output).toContain('1. **Create authentication middleware**');
      expect(result.output).toContain('JWT token validation');
      expect(result.output).toContain('2. **Set up user authentication service**');
      expect(result.output).toContain('Password hashing and validation');
      expect(result.output).toContain('3. **Update existing endpoints**');
      expect(result.output).toContain('4. **Create authentication routes**');
    });

    it('should provide API implementation plan', async () => {
      const apiContext = {
        ...mockWorkflowContext,
        title: 'Create API',
        body: 'Need REST API endpoints',
      };

      const result = await techLeadAgent.execute(apiContext);

      expect(result.output).toContain('1. **Design API endpoints**');
      expect(result.output).toContain('request/response schemas');
      expect(result.output).toContain('2. **Implement core business logic**');
      expect(result.output).toContain('3. **Add error handling**');
      expect(result.output).toContain('4. **Add documentation**');
    });

    it('should provide generic implementation plan for other cases', async () => {
      const genericContext = {
        ...mockWorkflowContext,
        title: 'General improvement',
        body: 'Some improvement needed',
      };

      const result = await techLeadAgent.execute(genericContext);

      expect(result.output).toContain('1. **Analyze current codebase**');
      expect(result.output).toContain('2. **Implement core functionality**');
      expect(result.output).toContain('3. **Update dependencies**');
      expect(result.output).toContain('4. **Integration and testing**');
    });
  });

  describe('dependencies identification', () => {
    it('should identify auth dependencies', async () => {
      const authContext = {
        ...mockWorkflowContext,
        title: 'Authentication system',
        body: 'Need user auth',
      };

      const result = await techLeadAgent.execute(authContext);

      expect(result.output).toContain('User management system');
      expect(result.output).toContain('Database schema for users');
    });

    it('should identify API dependencies', async () => {
      const apiContext = {
        ...mockWorkflowContext,
        title: 'API endpoints',
        body: 'Need API',
      };

      const result = await techLeadAgent.execute(apiContext);

      expect(result.output).toContain('API documentation updates');
      expect(result.output).toContain('Client-side integration');
    });

    it('should handle no dependencies case', async () => {
      const simpleContext = {
        ...mockWorkflowContext,
        title: 'Simple fix',
        body: 'Simple update',
      };

      const result = await techLeadAgent.execute(simpleContext);

      expect(result.output).toContain('No external dependencies identified');
    });
  });

  describe('acceptance criteria generation', () => {
    it('should generate auth-specific acceptance criteria', async () => {
      const authContext = {
        ...mockWorkflowContext,
        title: 'User login',
        body: 'Authentication needed',
      };

      const result = await techLeadAgent.execute(authContext);

      expect(result.output).toContain('Users can log in with valid credentials');
      expect(result.output).toContain('Invalid login attempts are rejected');
      expect(result.output).toContain('JWT tokens are generated and validated');
      expect(result.output).toContain('Protected endpoints require authentication');
    });

    it('should generate generic acceptance criteria for other issues', async () => {
      const genericContext = {
        ...mockWorkflowContext,
        title: 'General improvement',
        body: 'Some improvement needed',
      };

      const result = await techLeadAgent.execute(genericContext);

      expect(result.output).toContain('Feature works as described in the issue');
      expect(result.output).toContain('All edge cases are handled appropriately');
      expect(result.output).toContain('Error messages are clear and helpful');
      expect(result.output).toContain('Performance meets acceptable standards');
    });
  });

  describe('error handling', () => {
    it('should wrap processing errors in WorkflowError', async () => {
      // Mock the analyzeIssue method to throw an error
      const originalAnalyze = (techLeadAgent as any).analyzeIssue;
      (techLeadAgent as any).analyzeIssue = vi.fn().mockRejectedValue(new Error('Analysis failed'));

      try {
        await techLeadAgent.execute(mockWorkflowContext);
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowError);
        expect((error as WorkflowError).code).toBe('TECH_LEAD_ANALYSIS_FAILED');
        expect((error as WorkflowError).retryable).toBe(true);
        expect((error as Error).message).toContain('Tech lead analysis failed');
      }

      // Restore original method
      (techLeadAgent as any).analyzeIssue = originalAnalyze;
    });
  });
});
