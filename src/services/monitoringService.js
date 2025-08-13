const os = require('os')
const v8 = require('v8')
const logger = require('../utils/logger')
const redis = require('../models/redis')
const databaseService = require('./databaseService')

/**
 * Production monitoring service for health checks, memory management, and performance tracking
 */
class MonitoringService {
  constructor() {
    this.healthStatus = {
      healthy: true,
      lastCheck: null,
      services: {
        redis: { healthy: false, lastCheck: null, message: null },
        database: { healthy: false, lastCheck: null, message: null },
        memory: { healthy: true, lastCheck: null, usage: {} },
        api: { healthy: true, lastCheck: null, stats: {} }
      }
    }

    // Memory thresholds - adjusted for development environment
    // In production, consider using 0.8 and 0.85 respectively
    this.memoryThreshold = process.env.NODE_ENV === 'production' ? 0.8 : 0.95 // 95% for dev, 80% for prod
    this.heapThreshold = process.env.NODE_ENV === 'production' ? 0.85 : 0.95 // 95% for dev, 85% for prod

    // Performance metrics
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        failed: 0,
        avgResponseTime: 0
      },
      apiKeys: {
        validated: 0,
        failed: 0,
        cached: 0
      },
      errors: new Map(), // Track error frequencies
      slowQueries: []
    }

    // Monitoring intervals
    this.intervals = {
      health: null,
      memory: null,
      cleanup: null
    }
  }

  /**
   * Start monitoring services
   */
  async start() {
    logger.info('Starting monitoring service...')

    // Initial health check
    await this.performHealthCheck()

    // Start periodic health checks (every 30 seconds)
    this.intervals.health = setInterval(() => {
      this.performHealthCheck().catch((err) => {
        logger.error('Health check error:', err)
      })
    }, 30000)

    // Start memory monitoring (every 60 seconds)
    this.intervals.memory = setInterval(() => {
      this.checkMemory()
    }, 60000)

    // Start cleanup tasks (every 5 minutes)
    this.intervals.cleanup = setInterval(() => {
      this.performCleanup()
    }, 300000)

    // Setup graceful shutdown
    this.setupShutdownHandlers()

    logger.success('Monitoring service started')
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now()
    const checks = []

    // Check Redis
    checks.push(this.checkRedis())

    // Check Database
    checks.push(this.checkDatabase())

    // Check Memory
    checks.push(this.checkMemory())

    // Check API responsiveness
    checks.push(this.checkApiHealth())

    // Wait for all checks
    const results = await Promise.allSettled(checks)

    // Update overall health status
    const allHealthy = results.every(
      (result) => result.status === 'fulfilled' && result.value === true
    )

    this.healthStatus.healthy = allHealthy
    this.healthStatus.lastCheck = new Date().toISOString()
    this.healthStatus.checkDuration = Date.now() - startTime

    if (!allHealthy) {
      logger.warn('Health check detected issues:', this.healthStatus)
    }

    return this.healthStatus
  }

  /**
   * Check Redis health
   */
  async checkRedis() {
    try {
      const client = redis.getClientSafe()
      if (!client) {
        throw new Error('Redis client not available')
      }

      // Ping Redis
      const start = Date.now()
      await client.ping()
      const latency = Date.now() - start

      // Check memory usage
      const info = await client.info('memory')
      const memoryUsed = this.parseRedisInfo(info, 'used_memory_human')

      this.healthStatus.services.redis = {
        healthy: true,
        lastCheck: new Date().toISOString(),
        message: 'Redis is healthy',
        latency,
        memoryUsed
      }

      return true
    } catch (error) {
      this.healthStatus.services.redis = {
        healthy: false,
        lastCheck: new Date().toISOString(),
        message: error.message,
        error: error.code
      }

      logger.error('Redis health check failed:', error)
      return false
    }
  }

  /**
   * Check database health
   */
  async checkDatabase() {
    try {
      if (!databaseService.db) {
        // Database is optional (can run Redis-only)
        this.healthStatus.services.database = {
          healthy: true,
          lastCheck: new Date().toISOString(),
          message: 'Database not configured (Redis-only mode)'
        }
        return true
      }

      // Run a simple query
      const start = Date.now()
      const result = databaseService.db.prepare('SELECT 1 as health').get()
      const latency = Date.now() - start

      if (result.health !== 1) {
        throw new Error('Database query returned unexpected result')
      }

      // Get database stats
      const stats = databaseService.db.prepare('SELECT COUNT(*) as count FROM tokens').get()

      this.healthStatus.services.database = {
        healthy: true,
        lastCheck: new Date().toISOString(),
        message: 'Database is healthy',
        latency,
        tokenCount: stats.count
      }

      return true
    } catch (error) {
      this.healthStatus.services.database = {
        healthy: false,
        lastCheck: new Date().toISOString(),
        message: error.message
      }

      logger.error('Database health check failed:', error)
      return false
    }
  }

  /**
   * Check memory usage
   */
  checkMemory() {
    const memUsage = process.memoryUsage()
    const heapStats = v8.getHeapStatistics()
    const systemMem = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    }

    // Calculate percentages
    const heapPercent = memUsage.heapUsed / heapStats.heap_size_limit
    const systemPercent = systemMem.used / systemMem.total

    // Check if memory usage is too high
    const isHealthy = heapPercent < this.heapThreshold && systemPercent < this.memoryThreshold

    this.healthStatus.services.memory = {
      healthy: isHealthy,
      lastCheck: new Date().toISOString(),
      usage: {
        heap: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(heapStats.heap_size_limit / 1024 / 1024),
          percent: Math.round(heapPercent * 100)
        },
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        system: {
          used: Math.round(systemMem.used / 1024 / 1024),
          total: Math.round(systemMem.total / 1024 / 1024),
          percent: Math.round(systemPercent * 100)
        }
      }
    }

    // Trigger cleanup if memory is high
    if (!isHealthy) {
      logger.warn('High memory usage detected:', this.healthStatus.services.memory.usage)
      this.performMemoryCleanup()
    }

    return isHealthy
  }

  /**
   * Check API health
   */
  async checkApiHealth() {
    try {
      // Calculate success rate
      const successRate =
        this.metrics.requests.total > 0
          ? this.metrics.requests.success / this.metrics.requests.total
          : 1

      // Check for high error rates
      const errorRate = 1 - successRate
      const isHealthy = errorRate < 0.1 // Less than 10% error rate

      // Get top errors
      const topErrors = Array.from(this.metrics.errors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([error, count]) => ({ error, count }))

      this.healthStatus.services.api = {
        healthy: isHealthy,
        lastCheck: new Date().toISOString(),
        stats: {
          totalRequests: this.metrics.requests.total,
          successRate: Math.round(successRate * 100),
          errorRate: Math.round(errorRate * 100),
          avgResponseTime: Math.round(this.metrics.requests.avgResponseTime),
          topErrors
        }
      }

      return isHealthy
    } catch (error) {
      logger.error('API health check failed:', error)
      return false
    }
  }

  /**
   * Perform memory cleanup
   */
  performMemoryCleanup() {
    logger.info('Performing memory cleanup...')

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
      logger.info('Forced garbage collection')
    }

    // Clear old error metrics
    const oneHourAgo = Date.now() - 3600000
    for (const [error, timestamp] of this.metrics.errors.entries()) {
      if (timestamp < oneHourAgo) {
        this.metrics.errors.delete(error)
      }
    }

    // Clear old slow query logs
    this.metrics.slowQueries = this.metrics.slowQueries.filter(
      (query) => query.timestamp > oneHourAgo
    )

    // Log memory after cleanup
    const memAfter = process.memoryUsage()
    logger.info('Memory after cleanup:', {
      heap: `${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`,
      rss: `${Math.round(memAfter.rss / 1024 / 1024)}MB`
    })
  }

  /**
   * Perform periodic cleanup tasks
   */
  async performCleanup() {
    logger.debug('Performing periodic cleanup...')

    try {
      // Clean up old Redis keys
      await this.cleanupRedisKeys()

      // Clean up old database sessions
      await this.cleanupDatabaseSessions()

      // Reset metrics if needed
      this.resetMetricsIfNeeded()
    } catch (error) {
      logger.error('Cleanup error:', error)
    }
  }

  /**
   * Clean up old Redis keys
   */
  async cleanupRedisKeys() {
    const client = redis.getClientSafe()
    if (!client) {
      return
    }

    try {
      // Clean up old rate limit keys
      const rateLimitPattern = 'rate_limit:*'
      const keys = await client.keys(rateLimitPattern)

      for (const key of keys) {
        const ttl = await client.ttl(key)
        if (ttl === -1) {
          // No expiry set
          await client.expire(key, 3600) // Set 1 hour expiry
        }
      }

      logger.debug(`Cleaned up ${keys.length} rate limit keys`)
    } catch (error) {
      logger.error('Redis cleanup error:', error)
    }
  }

  /**
   * Clean up old database sessions
   */
  async cleanupDatabaseSessions() {
    // Skip database cleanup since we're in readonly mode
    // This prevents the "attempt to write a readonly database" error
    // Database cleanup should be handled by the main claude4dev service
    return
  }

  /**
   * Reset metrics if needed (daily reset)
   */
  resetMetricsIfNeeded() {
    const now = new Date()
    const hour = now.getHours()

    // Reset at midnight
    if (hour === 0 && !this.lastReset) {
      this.metrics.requests = {
        total: 0,
        success: 0,
        failed: 0,
        avgResponseTime: 0
      }

      this.metrics.apiKeys = {
        validated: 0,
        failed: 0,
        cached: 0
      }

      this.lastReset = now.toDateString()
      logger.info('Daily metrics reset completed')
    } else if (hour !== 0) {
      this.lastReset = null
    }
  }

  /**
   * Record request metrics
   */
  recordRequest(success, responseTime, error = null) {
    this.metrics.requests.total++

    if (success) {
      this.metrics.requests.success++
    } else {
      this.metrics.requests.failed++

      if (error) {
        const errorKey = error.code || error.message || 'unknown'
        this.metrics.errors.set(errorKey, (this.metrics.errors.get(errorKey) || 0) + 1)
      }
    }

    // Update average response time
    const currentAvg = this.metrics.requests.avgResponseTime
    const { total } = this.metrics.requests
    this.metrics.requests.avgResponseTime = (currentAvg * (total - 1) + responseTime) / total
  }

  /**
   * Record API key validation
   */
  recordApiKeyValidation(success, cached = false) {
    if (success) {
      this.metrics.apiKeys.validated++
      if (cached) {
        this.metrics.apiKeys.cached++
      }
    } else {
      this.metrics.apiKeys.failed++
    }
  }

  /**
   * Record slow query
   */
  recordSlowQuery(query, duration) {
    this.metrics.slowQueries.push({
      query,
      duration,
      timestamp: Date.now()
    })

    // Keep only last 100 slow queries
    if (this.metrics.slowQueries.length > 100) {
      this.metrics.slowQueries = this.metrics.slowQueries.slice(-100)
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      health: this.healthStatus,
      metrics: this.metrics,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Parse Redis INFO output
   */
  parseRedisInfo(info, key) {
    const lines = info.split('\r\n')
    for (const line of lines) {
      if (line.startsWith(`${key}:`)) {
        return line.split(':')[1]
      }
    }
    return null
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down monitoring...`)

      // Clear all intervals
      Object.values(this.intervals).forEach((interval) => {
        if (interval) {
          clearInterval(interval)
        }
      })

      // Perform final cleanup
      await this.performCleanup()

      logger.info('Monitoring service shut down gracefully')
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }

  /**
   * Stop monitoring services
   */
  stop() {
    Object.values(this.intervals).forEach((interval) => {
      if (interval) {
        clearInterval(interval)
      }
    })

    logger.info('Monitoring service stopped')
  }
}

// Export singleton instance
module.exports = new MonitoringService()
