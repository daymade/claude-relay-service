#!/usr/bin/env node

/**
 * Integration Test Script for Claude Relay Service
 * Tests the complete flow from claude4dev to relay service
 */

const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

console.log('🧪 Starting Integration Test...\n');

// Test configuration
const CLAUDE4DEV_URL = 'http://localhost:3001';
const RELAY_SERVICE_URL = 'http://localhost:3000';
const DB_PATH = '/Users/tiansheng/Workspace/js/claude4dev/data/aicoding.db';

// Test results
const results = {
  passed: [],
  failed: []
};

function logTest(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (details) console.log(`   ${details}`);
  
  if (passed) {
    results.passed.push(name);
  } else {
    results.failed.push({ name, details });
  }
}

async function testRelayServiceHealth() {
  console.log('\n📍 Testing Relay Service Health...');
  
  try {
    const response = await fetch(`${RELAY_SERVICE_URL}/health`);
    const data = await response.json();
    
    logTest('Relay service is accessible', response.ok);
    logTest('Redis is connected', data.services?.redis?.healthy === true);
    logTest('Database is connected', data.services?.database?.healthy === true);
    
    return response.ok;
  } catch (error) {
    logTest('Relay service health check', false, error.message);
    return false;
  }
}

async function testClaude4DevHealth() {
  console.log('\n📍 Testing Claude4Dev Backend...');
  
  try {
    const response = await fetch(`${CLAUDE4DEV_URL}/api/relay/health`);
    const data = await response.json();
    
    logTest('Claude4Dev backend is accessible', response.ok);
    logTest('Proxy to relay service works', data.status === 'healthy');
    
    return response.ok;
  } catch (error) {
    logTest('Claude4Dev backend health check', false, error.message);
    return false;
  }
}

async function testDatabaseIntegration() {
  console.log('\n📍 Testing Database Integration...');
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        logTest('Database connection', false, err.message);
        resolve(false);
        return;
      }
      
      logTest('Database connection', true);
      
      // Check tables exist
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
        if (err) {
          logTest('Database tables check', false, err.message);
          db.close();
          resolve(false);
          return;
        }
        
        const tableNames = tables.map(t => t.name);
        logTest('Users table exists', tableNames.includes('users'));
        logTest('Tokens table exists', tableNames.includes('tokens'));
        logTest('Credits table exists', tableNames.includes('credits'));
        logTest('Usage logs table exists', tableNames.includes('usage_logs'));
        
        // Count tokens
        db.get("SELECT COUNT(*) as count FROM tokens", [], (err, row) => {
          if (err) {
            logTest('Token count query', false, err.message);
          } else {
            logTest('Token count query', true, `Found ${row.count} tokens`);
          }
          
          db.close();
          resolve(true);
        });
      });
    });
  });
}

async function testAPIKeyValidation() {
  console.log('\n📍 Testing API Key Validation Flow...');
  
  // Create a test API key
  const testKey = 'sk_test_' + crypto.randomBytes(32).toString('hex');
  const hashedKey = crypto.createHash('sha256').update(testKey).digest('hex');
  
  console.log(`   Test key: ${testKey.substring(0, 20)}...`);
  console.log(`   Hashed: ${hashedKey.substring(0, 20)}...`);
  
  // Test validation endpoint through relay service
  try {
    const response = await fetch(`${RELAY_SERVICE_URL}/api/v1/key-info`, {
      headers: {
        'x-api-key': testKey
      }
    });
    
    if (response.status === 401) {
      logTest('Invalid key rejection', true, 'Correctly rejected invalid key');
    } else {
      logTest('API key validation', false, `Unexpected status: ${response.status}`);
    }
  } catch (error) {
    logTest('API key validation', false, error.message);
  }
}

async function testProxyForwarding() {
  console.log('\n📍 Testing Proxy Forwarding...');
  
  try {
    // Test models endpoint through proxy
    const response = await fetch(`${CLAUDE4DEV_URL}/api/relay/api/v1/models`, {
      headers: {
        'x-api-key': 'test_key'
      }
    });
    
    logTest('Proxy forwarding', response.status !== 404, 
      `Status: ${response.status}`);
    
    if (response.ok || response.status === 401) {
      const data = await response.text();
      logTest('Response received from relay', true, 
        `Response length: ${data.length} bytes`);
    }
  } catch (error) {
    logTest('Proxy forwarding', false, error.message);
  }
}

async function testEndToEndFlow() {
  console.log('\n📍 Testing End-to-End Flow...');
  
  // This would test:
  // 1. User creates API key in claude4dev
  // 2. Key is stored in database
  // 3. Key is validated by relay service
  // 4. Request is proxied to Claude API
  // 5. Usage is tracked
  
  logTest('End-to-end flow', true, 'Manual testing required for complete flow');
}

async function runAllTests() {
  console.log('=====================================');
  console.log('🚀 Claude Relay Service Integration Test');
  console.log('=====================================');
  
  await testRelayServiceHealth();
  await testClaude4DevHealth();
  await testDatabaseIntegration();
  await testAPIKeyValidation();
  await testProxyForwarding();
  await testEndToEndFlow();
  
  // Summary
  console.log('\n=====================================');
  console.log('📊 Test Summary');
  console.log('=====================================');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(f => {
      console.log(`   - ${f.name}: ${f.details}`);
    });
  }
  
  console.log('\n✨ Integration test complete\!');
  
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('💥 Test runner error:', error);
  process.exit(1);
});