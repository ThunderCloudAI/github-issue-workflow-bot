const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const crypto = require('crypto');

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

/**
 * Validates GitHub webhook signature using HMAC-SHA256
 */
function validateGitHubSignature(body, signature, secret) {
  if (!signature) {
    return false;
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');

  const expectedSignatureFormatted = `sha256=${expectedSignature}`;

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignatureFormatted));
}

/**
 * Main Lambda handler for GitHub webhooks
 */
exports.handler = async event => {
  console.log('Received webhook event:', JSON.stringify(event, null, 2));

  try {
    const { body, headers } = event;

    // Extract GitHub headers
    const signature = headers['X-Hub-Signature-256'] || headers['x-hub-signature-256'];
    const githubEvent = headers['X-GitHub-Event'] || headers['x-github-event'];
    const githubDelivery = headers['X-GitHub-Delivery'] || headers['x-github-delivery'];

    // Validate required headers
    if (!signature) {
      console.error('Missing X-Hub-Signature-256 header');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing signature' }),
        headers: {
          'Content-Type': 'application/json',
        },
      };
    }

    if (!githubEvent) {
      console.error('Missing X-GitHub-Event header');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing GitHub event type' }),
        headers: {
          'Content-Type': 'application/json',
        },
      };
    }

    // Get GitHub secret from environment
    const githubSecret = process.env.GITHUB_SECRET;
    if (!githubSecret || githubSecret === 'default-secret-change-me') {
      console.error('GitHub secret not configured properly');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' }),
        headers: {
          'Content-Type': 'application/json',
        },
      };
    }

    // Validate webhook signature
    const isValidSignature = validateGitHubSignature(body, signature, githubSecret);
    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
        headers: {
          'Content-Type': 'application/json',
        },
      };
    }

    // Parse the webhook payload
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error('Failed to parse webhook payload:', error);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON payload' }),
        headers: {
          'Content-Type': 'application/json',
        },
      };
    }

    // Prepare message for SQS
    const messageBody = {
      githubEvent,
      githubDelivery,
      timestamp: new Date().toISOString(),
      payload,
    };

    // Send message to SQS
    const sendMessageCommand = new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        GitHubEvent: {
          DataType: 'String',
          StringValue: githubEvent,
        },
        GitHubDelivery: {
          DataType: 'String',
          StringValue: githubDelivery,
        },
      },
    });

    const result = await sqsClient.send(sendMessageCommand);
    console.log('Message sent to SQS:', result.MessageId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Webhook processed successfully',
        messageId: result.MessageId,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }
};
