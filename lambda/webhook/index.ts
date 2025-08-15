import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import * as crypto from 'crypto';

// Initialize SQS client
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const QUEUE_URL = process.env.QUEUE_URL;
const GITHUB_SECRET = process.env.GITHUB_SECRET;

// GitHub event types we want to handle
const SUPPORTED_EVENTS = ['push', 'pull_request', 'issues', 'issue_comment', 'pull_request_review'];

interface WebhookEvent {
  eventType: string;
  delivery: string;
  timestamp: string;
  payload: any;
  repository?: {
    name: string;
    fullName: string;
    private: boolean;
  };
}

/**
 * Validates GitHub webhook signature using HMAC-SHA256
 */
function validateSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const expectedSignature = `sha256=${hmac.digest('hex')}`;
  
  // Use crypto.timingSafeEqual to prevent timing attacks
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  
  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Extracts repository information from the webhook payload
 */
function extractRepositoryInfo(payload: any): WebhookEvent['repository'] | undefined {
  if (payload.repository) {
    return {
      name: payload.repository.name,
      fullName: payload.repository.full_name,
      private: payload.repository.private || false,
    };
  }
  return undefined;
}

/**
 * Creates a response object for API Gateway
 */
function createResponse(statusCode: number, message: string, details?: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Processed-By': 'github-webhook-handler',
    },
    body: JSON.stringify({
      message,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    }),
  };
}

/**
 * Main Lambda handler for GitHub webhooks
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Received webhook event:', {
    httpMethod: event.httpMethod,
    headers: Object.keys(event.headers),
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters,
  });

  try {
    // Validate HTTP method
    if (event.httpMethod !== 'POST') {
      console.warn('Invalid HTTP method:', event.httpMethod);
      return createResponse(405, 'Method not allowed');
    }

    // Validate required environment variables
    if (!QUEUE_URL) {
      console.error('Missing QUEUE_URL environment variable');
      return createResponse(500, 'Internal server error');
    }

    if (!GITHUB_SECRET) {
      console.error('Missing GITHUB_SECRET environment variable');
      return createResponse(500, 'Internal server error');
    }

    // Extract headers (case-insensitive)
    const headers = Object.keys(event.headers || {}).reduce((acc, key) => {
      const value = event.headers[key];
      if (value) {
        acc[key.toLowerCase()] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    const signature = headers['x-hub-signature-256'];
    const eventType = headers['x-github-event'];
    const delivery = headers['x-github-delivery'];

    // Validate required headers
    if (!signature) {
      console.warn('Missing X-Hub-Signature-256 header');
      return createResponse(400, 'Missing signature header');
    }

    if (!eventType) {
      console.warn('Missing X-GitHub-Event header');
      return createResponse(400, 'Missing event type header');
    }

    if (!delivery) {
      console.warn('Missing X-GitHub-Delivery header');
      return createResponse(400, 'Missing delivery ID header');
    }

    // Validate payload exists
    if (!event.body) {
      console.warn('Missing request body');
      return createResponse(400, 'Missing request body');
    }

    // Validate GitHub signature
    if (!validateSignature(event.body, signature, GITHUB_SECRET)) {
      console.warn('Invalid signature for delivery:', delivery);
      return createResponse(401, 'Invalid signature');
    }

    console.log('Signature validated successfully for delivery:', delivery);

    // Check if we support this event type
    if (!SUPPORTED_EVENTS.includes(eventType)) {
      console.info(`Unsupported event type: ${eventType} for delivery: ${delivery}`);
      return createResponse(200, 'Event type not supported', { eventType });
    }

    // Parse the payload
    let payload: any;
    try {
      payload = JSON.parse(event.body);
    } catch (error) {
      console.error('Failed to parse JSON payload:', error);
      return createResponse(400, 'Invalid JSON payload');
    }

    // Create webhook event object
    const webhookEvent: WebhookEvent = {
      eventType,
      delivery,
      timestamp: new Date().toISOString(),
      payload,
      repository: extractRepositoryInfo(payload),
    };

    console.log('Processing webhook event:', {
      eventType,
      delivery,
      repository: webhookEvent.repository?.fullName,
      isPrivate: webhookEvent.repository?.private,
    });

    // Send to SQS
    const sqsMessage = {
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(webhookEvent),
      MessageAttributes: {
        EventType: {
          DataType: 'String',
          StringValue: eventType,
        },
        Repository: {
          DataType: 'String',
          StringValue: webhookEvent.repository?.fullName || 'unknown',
        },
        DeliveryId: {
          DataType: 'String',
          StringValue: delivery,
        },
        ProcessedAt: {
          DataType: 'String',
          StringValue: new Date().toISOString(),
        },
      },
    };

    const command = new SendMessageCommand(sqsMessage);
    const result = await sqsClient.send(command);

    console.log('Successfully sent message to SQS:', {
      messageId: result.MessageId,
      eventType,
      delivery,
      repository: webhookEvent.repository?.fullName,
    });

    return createResponse(200, 'Webhook processed successfully', {
      eventType,
      delivery,
      messageId: result.MessageId,
      repository: webhookEvent.repository?.fullName,
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Don't expose internal errors to GitHub
    return createResponse(500, 'Internal server error');
  }
};