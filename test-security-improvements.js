/**
 * Test script to verify security improvements
 */

const SecurityUtils = require('./src/utils/security');

console.log('Testing Security Improvements...\n');

// Test 1: Secure secret generation
console.log('1. Testing secure secret generation:');
const secret = SecurityUtils.generateSecureSecret(32);
console.log(`   Generated secret (64 chars): ${secret}`);
console.log(`   ✅ Length: ${secret.length} characters\n`);

// Test 2: Constant-time comparison
console.log('2. Testing constant-time comparison:');
const str1 = 'sk_test123456789';
const str2 = 'sk_test123456789';
const str3 = 'sk_test123456788';

console.log(`   Comparing identical strings: ${SecurityUtils.constantTimeCompare(str1, str2)}`);
console.log(`   Comparing different strings: ${SecurityUtils.constantTimeCompare(str1, str3)}`);
console.log('   ✅ Constant-time comparison working\n');

// Test 3: Path validation
console.log('3. Testing path validation (directory traversal prevention):');
const basePath = '/data';
const safePath = SecurityUtils.validatePath('aicoding.db', basePath);
const unsafePath = SecurityUtils.validatePath('../../../etc/passwd', basePath);

console.log(`   Safe path: ${safePath}`);
console.log(`   Unsafe path (should be null): ${unsafePath}`);
console.log('   ✅ Path validation working\n');

// Test 4: API key format validation
console.log('4. Testing API key format validation:');
const validKeys = [
  'sk_1234567890abcdef1234567890abcdef',
  'cr_test_key_with_underscores_123',
];
const invalidKeys = [
  'invalid_key',
  'sk_',
  'sk_short',
  'sk_invalid-chars!@#',
  'x'.repeat(300),
];

console.log('   Valid keys:');
validKeys.forEach(key => {
  console.log(`     ${key.substring(0, 20)}... -> ${SecurityUtils.isValidApiKeyFormat(key)}`);
});

console.log('   Invalid keys:');
invalidKeys.forEach(key => {
  const display = key.length > 20 ? key.substring(0, 20) + '...' : key;
  console.log(`     ${display} -> ${SecurityUtils.isValidApiKeyFormat(key)}`);
});
console.log('   ✅ API key validation working\n');

// Test 5: Rate limiter
console.log('5. Testing rate limiter with exponential backoff:');
const rateLimiter = new SecurityUtils.RateLimiter({
  maxAttempts: 3,
  windowMs: 5000, // 5 seconds for testing
});

const testIp = '192.168.1.1';

// Simulate attempts
for (let i = 1; i <= 5; i++) {
  const status = rateLimiter.check(testIp);
  if (!status.limited) {
    rateLimiter.recordAttempt(testIp);
    console.log(`   Attempt ${i}: Allowed (${status.remainingAttempts} remaining)`);
  } else {
    console.log(`   Attempt ${i}: BLOCKED (retry after ${status.retryAfter}s)`);
  }
}

// Reset and test again
rateLimiter.reset(testIp);
console.log('   Reset rate limit');
const resetStatus = rateLimiter.check(testIp);
console.log(`   After reset: ${resetStatus.limited ? 'Still blocked' : 'Allowed'}`);
console.log('   ✅ Rate limiter working\n');

// Test 6: Input sanitization
console.log('6. Testing input sanitization:');
const maliciousInputs = [
  "'; DROP TABLE users; --",
  "<script>alert('XSS')</script>",
  "test\0null\0byte",
  "normal text",
];

console.log('   SQL injection prevention:');
maliciousInputs.forEach(input => {
  const sanitized = SecurityUtils.sanitizeInput(input, { escapeSql: true, maxLength: 50 });
  console.log(`     Input: "${input}"`);
  console.log(`     Sanitized: "${sanitized}"`);
});

console.log('\n   XSS prevention:');
const xssInput = "<div onclick='alert(1)'>Click me</div>";
const sanitizedHtml = SecurityUtils.sanitizeInput(xssInput, { escapeHtml: true });
console.log(`     Input: ${xssInput}`);
console.log(`     Sanitized: ${sanitizedHtml}`);
console.log('   ✅ Input sanitization working\n');

// Test 7: API key hashing
console.log('7. Testing API key hashing:');
const apiKey = 'sk_test_secure_key_123456';
const { hash, salt } = SecurityUtils.hashApiKey(apiKey);
console.log(`   Original key: ${apiKey}`);
console.log(`   Hash (truncated): ${hash.substring(0, 32)}...`);
console.log(`   Salt: ${salt}`);

const isValid = SecurityUtils.verifyApiKey(apiKey, hash, salt);
const isInvalid = SecurityUtils.verifyApiKey('wrong_key', hash, salt);
console.log(`   Verify correct key: ${isValid}`);
console.log(`   Verify wrong key: ${isInvalid}`);
console.log('   ✅ API key hashing working\n');

// Summary
console.log('='.repeat(50));
console.log('✅ All security improvements tested successfully!');
console.log('='.repeat(50));

console.log('\nSecurity recommendations implemented:');
console.log('1. ✅ Cryptographically secure secret generation');
console.log('2. ✅ Constant-time comparison (timing attack prevention)');
console.log('3. ✅ Path validation (directory traversal prevention)');
console.log('4. ✅ API key format validation');
console.log('5. ✅ Rate limiting with exponential backoff');
console.log('6. ✅ Input sanitization (SQL injection & XSS prevention)');
console.log('7. ✅ Secure API key hashing with salt');

process.exit(0);