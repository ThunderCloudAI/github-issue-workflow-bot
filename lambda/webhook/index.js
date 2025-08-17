"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const crypto = __importStar(require("crypto"));
// Initialize SQS client
const sqsClient = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
// Environment variables
const QUEUE_URL = process.env.QUEUE_URL;
const GITHUB_SECRET = process.env.GITHUB_SECRET;
// GitHub event types we want to handle
const SUPPORTED_EVENTS = ['push', 'pull_request', 'issues', 'issue_comment', 'pull_request_review'];
/**
 * Validates GitHub webhook signature using HMAC-SHA256
 */
function validateSignature(payload, signature, secret) {
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
function extractRepositoryInfo(payload) {
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
function createResponse(statusCode, message, details) {
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
const handler = async (event) => {
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
        }, {});
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
        let payload;
        try {
            payload = JSON.parse(event.body);
        }
        catch (error) {
            console.error('Failed to parse JSON payload:', error);
            return createResponse(400, 'Invalid JSON payload');
        }
        // Create webhook event object
        const webhookEvent = {
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
        const command = new client_sqs_1.SendMessageCommand(sqsMessage);
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
    }
    catch (error) {
        console.error('Error processing webhook:', error);
        // Don't expose internal errors to GitHub
        return createResponse(500, 'Internal server error');
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLG9EQUFvRTtBQUNwRSwrQ0FBaUM7QUFFakMsd0JBQXdCO0FBQ3hCLE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBRW5GLHdCQUF3QjtBQUN4QixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQztBQUN4QyxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQztBQUVoRCx1Q0FBdUM7QUFDdkMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLE1BQU0sRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO0FBY3BHOztHQUVHO0FBQ0gsU0FBUyxpQkFBaUIsQ0FBQyxPQUFlLEVBQUUsU0FBaUIsRUFBRSxNQUFjO0lBQzNFLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFO1FBQ2xELE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNqRCxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM3QixNQUFNLGlCQUFpQixHQUFHLFVBQVUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO0lBRXpELHVEQUF1RDtJQUN2RCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNqRCxNQUFNLGNB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cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1FTQ2xpZW50LCBTZW5kTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuXG4vLyBJbml0aWFsaXplIFNRUyBjbGllbnRcbmNvbnN0IHNxc0NsaWVudCA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbi8vIEVudmlyb25tZW50IHZhcmlhYmxlc1xuY29uc3QgUVVFVUVfVVJMID0gcHJvY2Vzcy5lbnYuUVVFVUVfVVJMO1xuY29uc3QgR0lUSFVCX1NFQ1JFVCA9IHByb2Nlc3MuZW52LkdJVEhVQl9TRUNSRVQ7XG5cbi8vIEdpdEh1YiBldmVudCB0eXBlcyB3ZSB3YW50IHRvIGhhbmRsZVxuY29uc3QgU1VQUE9SVEVEX0VWRU5UUyA9IFsncHVzaCcsICdwdWxsX3JlcXVlc3QnLCAnaXNzdWVzJywgJ2lzc3VlX2NvbW1lbnQnLCAncHVsbF9yZXF1ZXN0X3JldmlldyddO1xuXG5pbnRlcmZhY2UgV2ViaG9va0V2ZW50IHtcbiAgZXZlbnRUeXBlOiBzdHJpbmc7XG4gIGRlbGl2ZXJ5OiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xuICBwYXlsb2FkOiBhbnk7XG4gIHJlcG9zaXRvcnk/OiB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGZ1bGxOYW1lOiBzdHJpbmc7XG4gICAgcHJpdmF0ZTogYm9vbGVhbjtcbiAgfTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZXMgR2l0SHViIHdlYmhvb2sgc2lnbmF0dXJlIHVzaW5nIEhNQUMtU0hBMjU2XG4gKi9cbmZ1bmN0aW9uIHZhbGlkYXRlU2lnbmF0dXJlKHBheWxvYWQ6IHN0cmluZywgc2lnbmF0dXJlOiBzdHJpbmcsIHNlY3JldDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghc2lnbmF0dXJlIHx8ICFzaWduYXR1cmUuc3RhcnRzV2l0aCgnc2hhMjU2PScpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgaG1hYyA9IGNyeXB0by5jcmVhdGVIbWFjKCdzaGEyNTYnLCBzZWNyZXQpO1xuICBobWFjLnVwZGF0ZShwYXlsb2FkLCAndXRmOCcpO1xuICBjb25zdCBleHBlY3RlZFNpZ25hdHVyZSA9IGBzaGEyNTY9JHtobWFjLmRpZ2VzdCgnaGV4Jyl9YDtcblxuICAvLyBVc2UgY3J5cHRvLnRpbWluZ1NhZmVFcXVhbCB0byBwcmV2ZW50IHRpbWluZyBhdHRhY2tzXG4gIGNvbnN0IHNpZ0J1ZmZlciA9IEJ1ZmZlci5mcm9tKHNpZ25hdHVyZSwgJ3V0ZjgnKTtcbiAgY29uc3QgZXhwZWN0ZWRCdWZmZXIgPSBCdWZmZXIuZnJvbShleHBlY3RlZFNpZ25hdHVyZSwgJ3V0ZjgnKTtcblxuICBpZiAoc2lnQnVmZmVyLmxlbmd0aCAhPT0gZXhwZWN0ZWRCdWZmZXIubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIGNyeXB0by50aW1pbmdTYWZlRXF1YWwoc2lnQnVmZmVyLCBleHBlY3RlZEJ1ZmZlcik7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgcmVwb3NpdG9yeSBpbmZvcm1hdGlvbiBmcm9tIHRoZSB3ZWJob29rIHBheWxvYWRcbiAqL1xuZnVuY3Rpb24gZXh0cmFjdFJlcG9zaXRvcnlJbmZvKHBheWxvYWQ6IGFueSk6IFdlYmhvb2tFdmVudFsncmVwb3NpdG9yeSddIHwgdW5kZWZpbmVkIHtcbiAgaWYgKHBheWxvYWQucmVwb3NpdG9yeSkge1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiBwYXlsb2FkLnJlcG9zaXRvcnkubmFtZSxcbiAgICAgIGZ1bGxOYW1lOiBwYXlsb2FkLnJlcG9zaXRvcnkuZnVsbF9uYW1lLFxuICAgICAgcHJpdmF0ZTogcGF5bG9hZC5yZXBvc2l0b3J5LnByaXZhdGUgfHwgZmFsc2UsXG4gICAgfTtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSByZXNwb25zZSBvYmplY3QgZm9yIEFQSSBHYXRld2F5XG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVJlc3BvbnNlKHN0YXR1c0NvZGU6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nLCBkZXRhaWxzPzogYW55KTogQVBJR2F0ZXdheVByb3h5UmVzdWx0IHtcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAnWC1Qcm9jZXNzZWQtQnknOiAnZ2l0aHViLXdlYmhvb2staGFuZGxlcicsXG4gICAgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBtZXNzYWdlLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAuLi4oZGV0YWlscyAmJiB7IGRldGFpbHMgfSksXG4gICAgfSksXG4gIH07XG59XG5cbi8qKlxuICogTWFpbiBMYW1iZGEgaGFuZGxlciBmb3IgR2l0SHViIHdlYmhvb2tzXG4gKi9cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCk6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCdSZWNlaXZlZCB3ZWJob29rIGV2ZW50OicsIHtcbiAgICBodHRwTWV0aG9kOiBldmVudC5odHRwTWV0aG9kLFxuICAgIGhlYWRlcnM6IE9iamVjdC5rZXlzKGV2ZW50LmhlYWRlcnMpLFxuICAgIHBhdGhQYXJhbWV0ZXJzOiBldmVudC5wYXRoUGFyYW1ldGVycyxcbiAgICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM6IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyxcbiAgfSk7XG5cbiAgdHJ5IHtcbiAgICAvLyBWYWxpZGF0ZSBIVFRQIG1ldGhvZFxuICAgIGlmIChldmVudC5odHRwTWV0aG9kICE9PSAnUE9TVCcpIHtcbiAgICAgIGNvbnNvbGUud2FybignSW52YWxpZCBIVFRQIG1ldGhvZDonLCBldmVudC5odHRwTWV0aG9kKTtcbiAgICAgIHJldHVybiBjcmVhdGVSZXNwb25zZSg0MDUsICdNZXRob2Qgbm90IGFsbG93ZWQnKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBpZiAoIVFVRVVFX1VSTCkge1xuICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyBRVUVVRV9VUkwgZW52aXJvbm1lbnQgdmFyaWFibGUnKTtcbiAgICAgIHJldHVybiBjcmVhdGVSZXNwb25zZSg1MDAsICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9XG5cbiAgICBpZiAoIUdJVEhVQl9TRUNSRVQpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgR0lUSFVCX1NFQ1JFVCBlbnZpcm9ubWVudCB2YXJpYWJsZScpO1xuICAgICAgcmV0dXJuIGNyZWF0ZVJlc3BvbnNlKDUwMCwgJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH1cblxuICAgIC8vIEV4dHJhY3QgaGVhZGVycyAoY2FzZS1pbnNlbnNpdGl2ZSlcbiAgICBjb25zdCBoZWFkZXJzID0gT2JqZWN0LmtleXMoZXZlbnQuaGVhZGVycyB8fCB7fSkucmVkdWNlKFxuICAgICAgKGFjYywga2V5KSA9PiB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gZXZlbnQuaGVhZGVyc1trZXldO1xuICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICBhY2Nba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH0sXG4gICAgICB7fSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+XG4gICAgKTtcblxuICAgIGNvbnN0IHNpZ25hdHVyZSA9IGhlYWRlcnNbJ3gtaHViLXNpZ25hdHVyZS0yNTYnXTtcbiAgICBjb25zdCBldmVudFR5cGUgPSBoZWFkZXJzWyd4LWdpdGh1Yi1ldmVudCddO1xuICAgIGNvbnN0IGRlbGl2ZXJ5ID0gaGVhZGVyc1sneC1naXRodWItZGVsaXZlcnknXTtcblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIGhlYWRlcnNcbiAgICBpZiAoIXNpZ25hdHVyZSkge1xuICAgICAgY29uc29sZS53YXJuKCdNaXNzaW5nIFgtSHViLVNpZ25hdHVyZS0yNTYgaGVhZGVyJyk7XG4gICAgICByZXR1cm4gY3JlYXRlUmVzcG9uc2UoNDAwLCAnTWlzc2luZyBzaWduYXR1cmUgaGVhZGVyJyk7XG4gICAgfVxuXG4gICAgaWYgKCFldmVudFR5cGUpIHtcbiAgICAgIGNvbnNvbGUud2FybignTWlzc2luZyBYLUdpdEh1Yi1FdmVudCBoZWFkZXInKTtcbiAgICAgIHJldHVybiBjcmVhdGVSZXNwb25zZSg0MDAsICdNaXNzaW5nIGV2ZW50IHR5cGUgaGVhZGVyJyk7XG4gICAgfVxuXG4gICAgaWYgKCFkZWxpdmVyeSkge1xuICAgICAgY29uc29sZS53YXJuKCdNaXNzaW5nIFgtR2l0SHViLURlbGl2ZXJ5IGhlYWRlcicpO1xuICAgICAgcmV0dXJuIGNyZWF0ZVJlc3BvbnNlKDQwMCwgJ01pc3NpbmcgZGVsaXZlcnkgSUQgaGVhZGVyJyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgcGF5bG9hZCBleGlzdHNcbiAgICBpZiAoIWV2ZW50LmJvZHkpIHtcbiAgICAgIGNvbnNvbGUud2FybignTWlzc2luZyByZXF1ZXN0IGJvZHknKTtcbiAgICAgIHJldHVybiBjcmVhdGVSZXNwb25zZSg0MDAsICdNaXNzaW5nIHJlcXVlc3QgYm9keScpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIEdpdEh1YiBzaWduYXR1cmVcbiAgICBpZiAoIXZhbGlkYXRlU2lnbmF0dXJlKGV2ZW50LmJvZHksIHNpZ25hdHVyZSwgR0lUSFVCX1NFQ1JFVCkpIHtcbiAgICAgIGNvbnNvbGUud2FybignSW52YWxpZCBzaWduYXR1cmUgZm9yIGRlbGl2ZXJ5OicsIGRlbGl2ZXJ5KTtcbiAgICAgIHJldHVybiBjcmVhdGVSZXNwb25zZSg0MDEsICdJbnZhbGlkIHNpZ25hdHVyZScpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCdTaWduYXR1cmUgdmFsaWRhdGVkIHN1Y2Nlc3NmdWxseSBmb3IgZGVsaXZlcnk6JywgZGVsaXZlcnkpO1xuXG4gICAgLy8gQ2hlY2sgaWYgd2Ugc3VwcG9ydCB0aGlzIGV2ZW50IHR5cGVcbiAgICBpZiAoIVNVUFBPUlRFRF9FVkVOVFMuaW5jbHVkZXMoZXZlbnRUeXBlKSkge1xuICAgICAgY29uc29sZS5pbmZvKGBVbnN1cHBvcnRlZCBldmVudCB0eXBlOiAke2V2ZW50VHlwZX0gZm9yIGRlbGl2ZXJ5OiAke2RlbGl2ZXJ5fWApO1xuICAgICAgcmV0dXJuIGNyZWF0ZVJlc3BvbnNlKDIwMCwgJ0V2ZW50IHR5cGUgbm90IHN1cHBvcnRlZCcsIHsgZXZlbnRUeXBlIH0pO1xuICAgIH1cblxuICAgIC8vIFBhcnNlIHRoZSBwYXlsb2FkXG4gICAgbGV0IHBheWxvYWQ6IGFueTtcbiAgICB0cnkge1xuICAgICAgcGF5bG9hZCA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSBKU09OIHBheWxvYWQ6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIGNyZWF0ZVJlc3BvbnNlKDQwMCwgJ0ludmFsaWQgSlNPTiBwYXlsb2FkJyk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHdlYmhvb2sgZXZlbnQgb2JqZWN0XG4gICAgY29uc3Qgd2ViaG9va0V2ZW50OiBXZWJob29rRXZlbnQgPSB7XG4gICAgICBldmVudFR5cGUsXG4gICAgICBkZWxpdmVyeSxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgcGF5bG9hZCxcbiAgICAgIHJlcG9zaXRvcnk6IGV4dHJhY3RSZXBvc2l0b3J5SW5mbyhwYXlsb2FkKSxcbiAgICB9O1xuXG4gICAgY29uc29sZS5sb2coJ1Byb2Nlc3Npbmcgd2ViaG9vayBldmVudDonLCB7XG4gICAgICBldmVudFR5cGUsXG4gICAgICBkZWxpdmVyeSxcbiAgICAgIHJlcG9zaXRvcnk6IHdlYmhvb2tFdmVudC5yZXBvc2l0b3J5Py5mdWxsTmFtZSxcbiAgICAgIGlzUHJpdmF0ZTogd2ViaG9va0V2ZW50LnJlcG9zaXRvcnk/LnByaXZhdGUsXG4gICAgfSk7XG5cbiAgICAvLyBTZW5kIHRvIFNRU1xuICAgIGNvbnN0IHNxc01lc3NhZ2UgPSB7XG4gICAgICBRdWV1ZVVybDogUVVFVUVfVVJMLFxuICAgICAgTWVzc2FnZUJvZHk6IEpTT04uc3RyaW5naWZ5KHdlYmhvb2tFdmVudCksXG4gICAgICBNZXNzYWdlQXR0cmlidXRlczoge1xuICAgICAgICBFdmVudFR5cGU6IHtcbiAgICAgICAgICBEYXRhVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgU3RyaW5nVmFsdWU6IGV2ZW50VHlwZSxcbiAgICAgICAgfSxcbiAgICAgICAgUmVwb3NpdG9yeToge1xuICAgICAgICAgIERhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICBTdHJpbmdWYWx1ZTogd2ViaG9va0V2ZW50LnJlcG9zaXRvcnk/LmZ1bGxOYW1lIHx8ICd1bmtub3duJyxcbiAgICAgICAgfSxcbiAgICAgICAgRGVsaXZlcnlJZDoge1xuICAgICAgICAgIERhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICBTdHJpbmdWYWx1ZTogZGVsaXZlcnksXG4gICAgICAgIH0sXG4gICAgICAgIFByb2Nlc3NlZEF0OiB7XG4gICAgICAgICAgRGF0YVR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgIFN0cmluZ1ZhbHVlOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCBjb21tYW5kID0gbmV3IFNlbmRNZXNzYWdlQ29tbWFuZChzcXNNZXNzYWdlKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzcXNDbGllbnQuc2VuZChjb21tYW5kKTtcblxuICAgIGNvbnNvbGUubG9nKCdTdWNjZXNzZnVsbHkgc2VudCBtZXNzYWdlIHRvIFNRUzonLCB7XG4gICAgICBtZXNzYWdlSWQ6IHJlc3VsdC5NZXNzYWdlSWQsXG4gICAgICBldmVudFR5cGUsXG4gICAgICBkZWxpdmVyeSxcbiAgICAgIHJlcG9zaXRvcnk6IHdlYmhvb2tFdmVudC5yZXBvc2l0b3J5Py5mdWxsTmFtZSxcbiAgICB9KTtcblxuICAgIHJldHVybiBjcmVhdGVSZXNwb25zZSgyMDAsICdXZWJob29rIHByb2Nlc3NlZCBzdWNjZXNzZnVsbHknLCB7XG4gICAgICBldmVudFR5cGUsXG4gICAgICBkZWxpdmVyeSxcbiAgICAgIG1lc3NhZ2VJZDogcmVzdWx0Lk1lc3NhZ2VJZCxcbiAgICAgIHJlcG9zaXRvcnk6IHdlYmhvb2tFdmVudC5yZXBvc2l0b3J5Py5mdWxsTmFtZSxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBwcm9jZXNzaW5nIHdlYmhvb2s6JywgZXJyb3IpO1xuXG4gICAgLy8gRG9uJ3QgZXhwb3NlIGludGVybmFsIGVycm9ycyB0byBHaXRIdWJcbiAgICByZXR1cm4gY3JlYXRlUmVzcG9uc2UoNTAwLCAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gIH1cbn07XG4iXX0=