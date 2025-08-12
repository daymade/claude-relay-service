const express = require('express')
const router = express.Router()
const monitoringService = require('../services/monitoringService')
const logger = require('../utils/logger')

/**
 * Health check endpoint
 * Returns overall system health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await monitoringService.performHealthCheck()

    // Determine HTTP status code based on health
    const statusCode = health.healthy ? 200 : 503

    res.status(statusCode).json({
      status: health.healthy ? 'healthy' : 'unhealthy',
      timestamp: health.lastCheck,
      checkDuration: health.checkDuration,
      services: health.services
    })
  } catch (error) {
    logger.error('Health check endpoint error:', error)
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    })
  }
})

/**
 * Liveness probe endpoint (for Kubernetes)
 * Simple check to see if the service is alive
 */
router.get('/liveness', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  })
})

/**
 * Readiness probe endpoint (for Kubernetes)
 * Check if the service is ready to handle requests
 */
router.get('/readiness', async (req, res) => {
  try {
    const health = monitoringService.healthStatus

    // Service is ready if Redis is healthy
    const isReady = health.services.redis?.healthy === true

    res.status(isReady ? 200 : 503).json({
      ready: isReady,
      timestamp: new Date().toISOString(),
      redis: health.services.redis?.healthy || false,
      database: health.services.database?.healthy || false
    })
  } catch (error) {
    res.status(503).json({
      ready: false,
      error: error.message
    })
  }
})

/**
 * Metrics endpoint
 * Returns detailed performance metrics
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = monitoringService.getMetrics()

    // Format as Prometheus metrics if requested
    if (req.headers.accept?.includes('text/plain')) {
      const prometheusMetrics = formatPrometheusMetrics(metrics)
      res.set('Content-Type', 'text/plain; version=0.0.4')
      res.send(prometheusMetrics)
    } else {
      // Return JSON metrics
      res.json(metrics)
    }
  } catch (error) {
    logger.error('Metrics endpoint error:', error)
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    })
  }
})

/**
 * Format metrics for Prometheus
 */
function formatPrometheusMetrics(metrics) {
  const lines = []

  // Health status
  lines.push(`# HELP relay_health_status Overall health status (1 = healthy, 0 = unhealthy)`)
  lines.push(`# TYPE relay_health_status gauge`)
  lines.push(`relay_health_status ${metrics.health.healthy ? 1 : 0}`)

  // Service health
  for (const [service, status] of Object.entries(metrics.health.services)) {
    lines.push(`# HELP relay_service_health_${service} Health status of ${service}`)
    lines.push(`# TYPE relay_service_health_${service} gauge`)
    lines.push(`relay_service_health_${service} ${status.healthy ? 1 : 0}`)
  }

  // Request metrics
  lines.push(`# HELP relay_requests_total Total number of requests`)
  lines.push(`# TYPE relay_requests_total counter`)
  lines.push(`relay_requests_total ${metrics.metrics.requests.total}`)

  lines.push(`# HELP relay_requests_success Successful requests`)
  lines.push(`# TYPE relay_requests_success counter`)
  lines.push(`relay_requests_success ${metrics.metrics.requests.success}`)

  lines.push(`# HELP relay_requests_failed Failed requests`)
  lines.push(`# TYPE relay_requests_failed counter`)
  lines.push(`relay_requests_failed ${metrics.metrics.requests.failed}`)

  lines.push(`# HELP relay_response_time_avg Average response time in ms`)
  lines.push(`# TYPE relay_response_time_avg gauge`)
  lines.push(`relay_response_time_avg ${metrics.metrics.requests.avgResponseTime}`)

  // API key metrics
  lines.push(`# HELP relay_apikeys_validated Total validated API keys`)
  lines.push(`# TYPE relay_apikeys_validated counter`)
  lines.push(`relay_apikeys_validated ${metrics.metrics.apiKeys.validated}`)

  lines.push(`# HELP relay_apikeys_failed Failed API key validations`)
  lines.push(`# TYPE relay_apikeys_failed counter`)
  lines.push(`relay_apikeys_failed ${metrics.metrics.apiKeys.failed}`)

  // Memory metrics
  if (metrics.health.services.memory?.usage) {
    const memUsage = metrics.health.services.memory.usage

    lines.push(`# HELP relay_memory_heap_used Heap memory used in MB`)
    lines.push(`# TYPE relay_memory_heap_used gauge`)
    lines.push(`relay_memory_heap_used ${memUsage.heap.used}`)

    lines.push(`# HELP relay_memory_heap_percent Heap memory usage percentage`)
    lines.push(`# TYPE relay_memory_heap_percent gauge`)
    lines.push(`relay_memory_heap_percent ${memUsage.heap.percent}`)

    lines.push(`# HELP relay_memory_rss RSS memory in MB`)
    lines.push(`# TYPE relay_memory_rss gauge`)
    lines.push(`relay_memory_rss ${memUsage.rss}`)
  }

  // Uptime
  lines.push(`# HELP relay_uptime_seconds Service uptime in seconds`)
  lines.push(`# TYPE relay_uptime_seconds counter`)
  lines.push(`relay_uptime_seconds ${metrics.uptime}`)

  return lines.join('\n')
}

/**
 * Debug endpoint (only in development)
 */
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug', (req, res) => {
    const debug = {
      env: process.env.NODE_ENV,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      versions: process.versions
    }

    res.json(debug)
  })
}

module.exports = router
