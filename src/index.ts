import { WorkflowProcessor } from './workflow-processor';
import { SQSConsumer } from './queue/sqs-consumer';
import { WebhookHandler } from './webhook-handler';
import { WorkflowConfig } from './types';
import { SQSClientFactory } from './aws/sqs-client.factory';

// Load configuration from environment variables
const config: WorkflowConfig = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  },
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    initialDelayMs: parseInt(process.env.INITIAL_DELAY_MS || '1000'),
    maxDelayMs: parseInt(process.env.MAX_DELAY_MS || '30000'),
    backoffMultiplier: parseFloat(process.env.BACKOFF_MULTIPLIER || '2'),
  },
  agents: {
    tech_lead: {
      enabled: process.env.TECH_LEAD_ENABLED !== 'false',
      timeout: parseInt(process.env.TECH_LEAD_TIMEOUT || '30000'),
    },
    worker: {
      enabled: process.env.WORKER_ENABLED !== 'false',
      timeout: parseInt(process.env.WORKER_TIMEOUT || '300000'),
    },
    qa: {
      enabled: process.env.QA_ENABLED !== 'false',
      timeout: parseInt(process.env.QA_TIMEOUT || '60000'),
    },
  },
};

const sqsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  queueUrl: process.env.SQS_QUEUE_URL || '',
  maxMessages: parseInt(process.env.SQS_MAX_MESSAGES || '10'),
  waitTimeSeconds: parseInt(process.env.SQS_WAIT_TIME || '20'),
  visibilityTimeoutSeconds: parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '300'),
};

const webhookConfig = {
  port: parseInt(process.env.PORT || '3000'),
  secret: config.github.webhookSecret,
  queueUrl: sqsConfig.queueUrl,
  awsRegion: sqsConfig.region,
};

async function main() {
  try {
    // Validate required environment variables
    validateConfig();

    console.log('Starting GitHub Issue Workflow System...');

    // Initialize services
    const sqsClientFactory = new SQSClientFactory();
    const sqsClient = sqsClientFactory.createClient(sqsConfig.region);
    
    const processor = new WorkflowProcessor(config);
    const consumer = new SQSConsumer(processor, sqsConfig, sqsClient);
    const webhookHandler = new WebhookHandler(webhookConfig, sqsClient);

    // Health checks
    console.log('Performing health checks...');
    const processorHealth = await processor.healthCheck();
    const consumerHealth = await consumer.healthCheck();
    
    console.log('Processor health:', processorHealth);
    console.log('Consumer health:', consumerHealth);

    if (processorHealth.status !== 'healthy' || consumerHealth.status !== 'healthy') {
      throw new Error('Health checks failed');
    }

    // Start services
    await Promise.all([
      webhookHandler.start(),
      consumer.start(),
    ]);

    console.log('All services started successfully');

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

function validateConfig() {
  const required = [
    'GITHUB_TOKEN',
    'GITHUB_WEBHOOK_SECRET',
    'SQS_QUEUE_URL',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main();
}

export { WorkflowProcessor, SQSConsumer, WebhookHandler, config };
export default main;