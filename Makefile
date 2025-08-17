# GitHub Issue Workflow Bot - Local CI/CD Commands
# Run these commands before committing to ensure code quality

.PHONY: help install clean lint lint-fix format format-check typecheck test test-coverage build ci-check cdk-synth all

# Default target
help:
	@echo "GitHub Issue Workflow Bot - Local CI/CD Commands"
	@echo ""
	@echo "Quality Checks (run before committing):"
	@echo "  make ci-check     - Run all CI checks (lint, format, typecheck, test)"
	@echo "  make lint         - Run ESLint checks"
	@echo "  make format-check - Check code formatting with Prettier"
	@echo "  make typecheck    - Run TypeScript type checking"
	@echo "  make test         - Run tests with coverage"
	@echo ""
	@echo "Development Commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make lint-fix     - Fix ESLint issues automatically"
	@echo "  make format       - Format code with Prettier"
	@echo "  make test-watch   - Run tests in watch mode"
	@echo "  make build        - Build TypeScript to JavaScript"
	@echo "  make clean        - Clean build artifacts"
	@echo ""
	@echo "AWS CDK Commands:"
	@echo "  make cdk-synth    - Synthesize CDK templates"
	@echo "  make cdk-bootstrap - Bootstrap CDK (one-time setup)"
	@echo "  make cdk-deploy   - Deploy to AWS"
	@echo "  make cdk-destroy  - Destroy AWS resources"
	@echo ""
	@echo "Shortcuts:"
	@echo "  make all          - Install deps + run all CI checks"

# Dependency management
install:
	@echo "📦 Installing dependencies..."
	npm ci

# Code quality checks (same as CI pipeline)
ci-check:
	@echo "🔍 Running all CI checks..."
	@echo "1/4 Linting TypeScript files..."
	npm run lint
	@echo "2/4 Checking code formatting..."
	npm run format:check
	@echo "3/4 Running TypeScript type check..."
	npm run typecheck
	@echo "4/4 Running tests with coverage..."
	npm run test:coverage
	@echo "✅ All CI checks passed!"

lint:
	@echo "🔍 Running ESLint..."
	npm run lint

lint-fix:
	@echo "🔧 Fixing ESLint issues..."
	npm run lint:fix

format:
	@echo "💅 Formatting code with Prettier..."
	npm run format

format-check:
	@echo "💅 Checking code formatting..."
	npm run format:check

typecheck:
	@echo "🔍 Running TypeScript type check..."
	npm run typecheck

# Testing
test:
	@echo "🧪 Running tests with coverage..."
	npm run test:coverage

test-watch:
	@echo "🧪 Running tests in watch mode..."
	npm run test:watch

test-ui:
	@echo "🧪 Running tests with UI..."
	npm run test:ui

# Build
build:
	@echo "🏗️  Building TypeScript..."
	npm run build

clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist/
	rm -rf coverage/
	rm -rf cdk.out/

# AWS CDK
cdk-synth:
	@echo "☁️  Synthesizing CDK templates..."
	npm run synth

cdk-bootstrap:
	@echo "☁️  Bootstrapping CDK..."
	npm run bootstrap

cdk-deploy:
	@echo "🚀 Deploying to AWS..."
	npm run deploy

cdk-destroy:
	@echo "💥 Destroying AWS resources..."
	npm run destroy

# Convenience targets
all: install ci-check
	@echo "🎉 All setup and checks complete!"

# Quick pre-commit check
pre-commit: lint format-check typecheck
	@echo "✅ Pre-commit checks passed!"

# Development setup
dev-setup: install
	@echo "🛠️  Development environment ready!"
	@echo "💡 Run 'make ci-check' before committing"
	@echo "💡 Run 'make test-watch' for continuous testing"