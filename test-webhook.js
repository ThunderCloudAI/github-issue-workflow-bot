#!/usr/bin/env node

// Simple test script to verify webhook signature validation
const crypto = require('crypto');

const secret = 'test-secret';
const payload = JSON.stringify({
  action: 'opened',
  repository: {
    name: 'test-repo',
    full_name: 'user/test-repo',
    private: false
  }
});

// Create HMAC signature
const hmac = crypto.createHmac('sha256', secret);
hmac.update(payload, 'utf8');
const signature = `sha256=${hmac.digest('hex')}`;

console.log('Test Payload:', payload);
console.log('Generated Signature:', signature);
console.log('\nTo test the webhook locally:');
console.log('1. Set GITHUB_SECRET=test-secret');
console.log('2. Set QUEUE_URL=test-queue');
console.log('3. Use the above payload and signature in your test');

// Test signature validation (from Lambda function logic)
function validateSignature(payload, signature, secret) {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const expectedSignature = `sha256=${hmac.digest('hex')}`;
  
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  
  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

const isValid = validateSignature(payload, signature, secret);
console.log('\nSignature Validation Test:', isValid ? 'PASS' : 'FAIL');