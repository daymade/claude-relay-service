#!/usr/bin/env node

/**
 * Simplified integration test for claude4dev database service
 * Tests API key validation only, without usage tracking
 */

const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

// Set the database path
const dbPath = path.join(__dirname, '../claude4dev/data/aicoding.db');
const TEST_API_KEY = 'sk_32e1b80291673d5fc340a7bde1e68f36fac8678ba859aad40832389d2c7eb818';

async function testApiKeyValidation() {
  console.log('🔍 Testing Claude4dev API Key Validation\n');
  
  console.log('📊 Database path:', dbPath);
  console.log('🔑 Test API key:', TEST_API_KEY);
  console.log('');
  
  try {
    // Test 1: Direct database connection
    console.log('1️⃣ Testing direct database connection...');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    console.log('✅ Database opened successfully\n');
    
    // Test 2: API key lookup
    console.log('2️⃣ Testing API key lookup...');
    const hashedToken = crypto.createHash('sha256').update(TEST_API_KEY).digest('hex');
    console.log('🔑 Hashed token:', hashedToken);
    
    const query = `
      SELECT 
        t.id,
        t.user_id,
        t.name,
        t.created_at,
        t.last_used,
        u.email as user_email,
        u.name as user_name,
        c.balance as credits_balance,
        c.daily_allocation,
        c.last_updated
      FROM tokens t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN credits c ON u.id = c.user_id
      WHERE t.token = ?
    `;
    
    const stmt = db.prepare(query);
    const tokenInfo = stmt.get(hashedToken);
    
    if (tokenInfo) {
      console.log('✅ API key found in database!');
      console.log('📋 Token details:');
      console.log(`   - ID: ${tokenInfo.id}`);
      console.log(`   - User ID: ${tokenInfo.user_id}`);
      console.log(`   - Name: ${tokenInfo.name}`);
      console.log(`   - User Email: ${tokenInfo.user_email}`);
      console.log(`   - User Name: ${tokenInfo.user_name}`);
      console.log(`   - Created At: ${tokenInfo.created_at}`);
      console.log(`   - Last Used: ${tokenInfo.last_used || 'Never'}`);
      console.log(`   - Credits Balance: ${tokenInfo.credits_balance || 0}`);
      console.log(`   - Daily Allocation: ${tokenInfo.daily_allocation || 0}`);
      console.log(`   - Credits Last Updated: ${tokenInfo.last_updated || 'Never'}`);
      console.log('');
    } else {
      console.log('❌ API key not found in database\n');
    }
    
    // Test 3: Test invalid key
    console.log('3️⃣ Testing invalid API key...');
    const invalidHashed = crypto.createHash('sha256').update('sk_invalid_key_12345').digest('hex');
    const invalidResult = stmt.get(invalidHashed);
    if (invalidResult) {
      console.log('⚠️ Invalid key unexpectedly found');
    } else {
      console.log('✅ Invalid key correctly not found\n');
    }
    
    // Test 4: Simulate relay service validation logic
    console.log('4️⃣ Testing relay service validation format...');
    if (tokenInfo) {
      const relayFormat = {
        id: `db_${tokenInfo.id}`,
        userId: tokenInfo.user_id,
        name: tokenInfo.name,
        userEmail: tokenInfo.user_email,
        userName: tokenInfo.user_name,
        active: true,
        createdAt: tokenInfo.created_at,
        lastUsed: tokenInfo.last_used,
        credits: {
          balance: tokenInfo.credits_balance || 0,
          dailyAllocation: tokenInfo.daily_allocation || 0,
          lastUpdated: tokenInfo.last_updated
        },
        limits: {
          maxTokensPerMinute: 100000,
          maxRequestsPerMinute: 100,
          maxConcurrentRequests: 5,
          dailyCostLimit: tokenInfo.credits_balance ? tokenInfo.credits_balance / 100 : 10
        }
      };
      
      console.log('✅ Relay service format generated:');
      console.log('📋 Formatted result:', JSON.stringify(relayFormat, null, 2));
      console.log('');
    }
    
    db.close();
    console.log('🎯 Integration test completed successfully!');
    
  } catch (error) {
    console.error('💥 Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
testApiKeyValidation();