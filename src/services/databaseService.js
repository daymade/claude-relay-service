const Database = require('better-sqlite3')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const logger = require('../utils/logger')
const _config = require('../../config/config')

class DatabaseService {
  constructor() {
    this.db = null
    this.dbPath = null
  }

  initialize() {
    // Check multiple possible database locations
    const possiblePaths = [
      // Production path (shared between services)
      path.join(__dirname, '../../../../claude4dev/data/aicoding.db'),
      // Development path
      path.join(__dirname, '../../../claude4dev/data/aicoding.db'),
      // Environment variable path
      process.env.CLAUDE4DEV_DB_PATH,
      // Default fallback
      '/data/aicoding.db'
    ].filter(Boolean)

    for (const dbPath of possiblePaths) {
      if (fs.existsSync(dbPath)) {
        this.dbPath = dbPath
        logger.info(`Found database at: ${dbPath}`)
        break
      }
    }

    if (!this.dbPath) {
      logger.error('Database file not found in any expected location')
      logger.info('Falling back to Redis-only mode')
      return false
    }

    try {
      this.db = new Database(this.dbPath, {
        readonly: false, // Need write access for usage tracking
        fileMustExist: true
      })

      // Test connection
      const version = this.db.prepare('SELECT sqlite_version()').get()
      logger.info(`Connected to SQLite database: ${version['sqlite_version()']}`)

      // Prepare statements
      this.prepareStatements()
      return true
    } catch (error) {
      logger.error('Failed to initialize database:', error)
      return false
    }
  }

  prepareStatements() {
    // Prepare commonly used statements for better performance
    this.statements = {
      getTokenByHash: this.db.prepare(`
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
      `),

      updateLastUsed: this.db.prepare(`
        UPDATE tokens 
        SET last_used = datetime('now') 
        WHERE id = ?
      `),

      getUserCredits: this.db.prepare(`
        SELECT balance, daily_allocation, last_updated
        FROM credits
        WHERE user_id = ?
      `),

      updateCreditsBalance: this.db.prepare(`
        UPDATE credits
        SET balance = ?
        WHERE user_id = ?
      `),

      insertUsageLog: this.db.prepare(`
        INSERT INTO usage_logs (
          user_id, token_id, model, 
          input_tokens, output_tokens, 
          cache_creation_tokens, cache_read_tokens,
          total_tokens, cost, request_id, 
          endpoint, status_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateDailyUsage: this.db.prepare(`
        INSERT INTO usage_daily (
          user_id, date, 
          total_input_tokens, total_output_tokens,
          total_cache_creation_tokens, total_cache_read_tokens,
          total_cost, request_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          total_input_tokens = total_input_tokens + excluded.total_input_tokens,
          total_output_tokens = total_output_tokens + excluded.total_output_tokens,
          total_cache_creation_tokens = total_cache_creation_tokens + excluded.total_cache_creation_tokens,
          total_cache_read_tokens = total_cache_read_tokens + excluded.total_cache_read_tokens,
          total_cost = total_cost + excluded.total_cost,
          request_count = request_count + excluded.request_count,
          updated_at = datetime('now')
      `)
    }
  }

  /**
   * Validate an API key against the database
   * @param {string} apiKey - The plain API key to validate
   * @returns {Object|null} Token info if valid, null otherwise
   */
  async validateApiKey(apiKey) {
    if (!this.db) {
      logger.debug('Database not initialized, falling back to Redis')
      return null
    }

    try {
      // Hash the API key (matching claude4dev's implementation)
      const hashedToken = crypto.createHash('sha256').update(apiKey).digest('hex')

      // Look up the token in database
      const tokenInfo = this.statements.getTokenByHash.get(hashedToken)

      if (!tokenInfo) {
        logger.debug('Token not found in database')
        return null
      }

      // Update last_used timestamp (async, don't wait)
      setImmediate(() => {
        try {
          this.statements.updateLastUsed.run(tokenInfo.id)
        } catch (error) {
          logger.error('Failed to update last_used:', error)
        }
      })

      // Return formatted token info for relay service
      return {
        id: `db_${tokenInfo.id}`, // Prefix to distinguish from Redis keys
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
        // Map to relay service format
        limits: {
          maxTokensPerMinute: 100000, // Default limits
          maxRequestsPerMinute: 100,
          maxConcurrentRequests: 5,
          dailyCostLimit: tokenInfo.credits_balance ? tokenInfo.credits_balance / 100 : 10 // Convert credits to cost
        }
      }
    } catch (error) {
      logger.error('Database validation error:', error)
      return null
    }
  }

  /**
   * Record usage for a user
   * @param {Object} usageData - Usage data to record
   */
  async recordUsage(usageData) {
    if (!this.db) {
      return
    }

    const {
      userId,
      tokenId,
      model,
      inputTokens = 0,
      outputTokens = 0,
      cacheCreationTokens = 0,
      cacheReadTokens = 0,
      cost = 0,
      requestId = null,
      endpoint = '/v1/messages',
      statusCode = 200
    } = usageData

    try {
      // Calculate total tokens
      const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens

      // Start a transaction for consistency
      const transaction = this.db.transaction(() => {
        // Insert usage log
        this.statements.insertUsageLog.run(
          userId,
          tokenId,
          model,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          totalTokens,
          cost,
          requestId,
          endpoint,
          statusCode
        )

        // Update daily usage
        const today = new Date().toISOString().split('T')[0]
        this.statements.updateDailyUsage.run(
          userId,
          today,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          cost,
          1 // request count
        )

        // Get current balance
        const credits = this.statements.getUserCredits.get(userId)
        if (credits) {
          // Deduct cost from balance
          const newBalance = Math.max(0, credits.balance - cost)
          this.statements.updateCreditsBalance.run(newBalance, userId)
          logger.debug(`Updated credits for user ${userId}: ${credits.balance} -> ${newBalance}`)
        }
      })

      // Execute transaction
      transaction()

      logger.debug(
        `Recorded usage for user ${userId}: ${totalTokens} tokens, $${cost.toFixed(4)} cost`
      )
    } catch (error) {
      logger.error('Failed to record usage:', error)
    }
  }

  /**
   * Get all active API keys (for sync purposes)
   */
  async getAllApiKeys() {
    if (!this.db) {
      return []
    }

    try {
      const stmt = this.db.prepare(`
        SELECT 
          t.id,
          t.token_hash,
          t.user_id,
          t.name,
          t.created_at,
          u.email as user_email
        FROM tokens t
        JOIN users u ON t.user_id = u.user_id
        ORDER BY t.created_at DESC
      `)

      return stmt.all()
    } catch (error) {
      logger.error('Failed to get all API keys:', error)
      return []
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close()
      logger.info('Database connection closed')
    }
  }
}

// Export singleton instance
module.exports = new DatabaseService()
