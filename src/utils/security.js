const crypto = require('crypto')

/**
 * Security utilities for production-ready authentication
 */
class SecurityUtils {
  /**
   * Generate a cryptographically secure random secret
   * @param {number} length - Length of the secret in bytes
   * @returns {string} Hex-encoded secret
   */
  static generateSecureSecret(length = 32) {
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * Constant-time comparison to prevent timing attacks
   * @param {string} a - First string to compare
   * @param {string} b - Second string to compare
   * @returns {boolean} True if strings match
   */
  static constantTimeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false
    }

    // Ensure both strings are the same length
    const lengthA = Buffer.byteLength(a)
    const lengthB = Buffer.byteLength(b)

    if (lengthA !== lengthB) {
      return false
    }

    // Use crypto.timingSafeEqual for constant-time comparison
    const bufferA = Buffer.from(a)
    const bufferB = Buffer.from(b)

    try {
      return crypto.timingSafeEqual(bufferA, bufferB)
    } catch {
      return false
    }
  }

  /**
   * Validate and sanitize file paths to prevent directory traversal
   * @param {string} path - Path to validate
   * @param {string} basePath - Base directory path
   * @returns {string|null} Sanitized path or null if invalid
   */
  static validatePath(path, basePath) {
    if (!path || typeof path !== 'string') {
      return null
    }

    // Normalize and resolve the path
    const resolvedPath = require('path').resolve(basePath, path)
    const resolvedBase = require('path').resolve(basePath)

    // Ensure the resolved path is within the base directory
    if (!resolvedPath.startsWith(resolvedBase)) {
      return null // Path traversal attempt
    }

    return resolvedPath
  }

  /**
   * Hash API key with salt for storage
   * @param {string} apiKey - Plain API key
   * @param {string} salt - Optional salt (generated if not provided)
   * @returns {object} Hash and salt
   */
  static hashApiKey(apiKey, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(16).toString('hex')
    }

    const hash = crypto.pbkdf2Sync(apiKey, salt, 10000, 64, 'sha512').toString('hex')

    return { hash, salt }
  }

  /**
   * Verify API key against stored hash
   * @param {string} apiKey - Plain API key
   * @param {string} hash - Stored hash
   * @param {string} salt - Stored salt
   * @returns {boolean} True if valid
   */
  static verifyApiKey(apiKey, hash, salt) {
    const computedHash = crypto.pbkdf2Sync(apiKey, salt, 10000, 64, 'sha512').toString('hex')

    return this.constantTimeCompare(computedHash, hash)
  }

  /**
   * Generate secure session token
   * @returns {string} Session token
   */
  static generateSessionToken() {
    return crypto.randomBytes(32).toString('base64url')
  }

  /**
   * Sanitize user input to prevent injection attacks
   * @param {string} input - User input
   * @param {object} options - Sanitization options
   * @returns {string} Sanitized input
   */
  static sanitizeInput(input, options = {}) {
    if (typeof input !== 'string') {
      return ''
    }

    let sanitized = input

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '')

    // Limit length
    const maxLength = options.maxLength || 1000
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength)
    }

    // Remove control characters except newlines and tabs
    if (!options.allowControlChars) {
      // eslint-disable-next-line no-control-regex
      sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    }

    // Escape SQL special characters if needed
    if (options.escapeSql) {
      sanitized = sanitized.replace(/['";\\]/g, '\\$&')
    }

    // Escape HTML if needed
    if (options.escapeHtml) {
      const htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }
      sanitized = sanitized.replace(/[&<>"']/g, (char) => htmlEscapes[char])
    }

    return sanitized
  }

  /**
   * Validate API key format
   * @param {string} apiKey - API key to validate
   * @returns {boolean} True if valid format
   */
  static isValidApiKeyFormat(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false
    }

    // Check length (between 20 and 256 characters)
    if (apiKey.length < 20 || apiKey.length > 256) {
      return false
    }

    // Check for valid prefix
    const validPrefixes = ['sk_', 'cr_', 'pk_']
    const hasValidPrefix = validPrefixes.some((prefix) => apiKey.startsWith(prefix))

    if (!hasValidPrefix) {
      return false
    }

    // Check for valid characters (alphanumeric and underscore only after prefix)
    const keyPart = apiKey.substring(3) // Remove prefix
    if (!/^[a-zA-Z0-9_]+$/.test(keyPart)) {
      return false
    }

    return true
  }

  /**
   * Rate limiting tracker with exponential backoff
   */
  static RateLimiter = class {
    constructor(options = {}) {
      this.attempts = new Map()
      this.maxAttempts = options.maxAttempts || 5
      this.windowMs = options.windowMs || 900000 // 15 minutes
      this.backoffMultiplier = options.backoffMultiplier || 2
    }

    /**
     * Check if identifier is rate limited
     * @param {string} identifier - IP, user ID, or API key
     * @returns {object} Rate limit status
     */
    check(identifier) {
      const now = Date.now()
      const record = this.attempts.get(identifier)

      if (!record) {
        return { limited: false, remainingAttempts: this.maxAttempts }
      }

      // Clean old attempts
      record.attempts = record.attempts.filter((timestamp) => now - timestamp < this.windowMs)

      if (record.attempts.length >= this.maxAttempts) {
        const oldestAttempt = record.attempts[0]
        const lockoutTime = this.calculateLockoutTime(record.attempts.length)
        const timeUntilReset = oldestAttempt + lockoutTime - now

        if (timeUntilReset > 0) {
          return {
            limited: true,
            remainingAttempts: 0,
            resetTime: new Date(now + timeUntilReset),
            retryAfter: Math.ceil(timeUntilReset / 1000)
          }
        }
      }

      return {
        limited: false,
        remainingAttempts: this.maxAttempts - record.attempts.length
      }
    }

    /**
     * Record an attempt
     * @param {string} identifier - IP, user ID, or API key
     */
    recordAttempt(identifier) {
      const now = Date.now()
      let record = this.attempts.get(identifier)

      if (!record) {
        record = { attempts: [] }
        this.attempts.set(identifier, record)
      }

      record.attempts.push(now)

      // Cleanup old records periodically
      if (Math.random() < 0.01) {
        // 1% chance
        this.cleanup()
      }
    }

    /**
     * Calculate lockout time with exponential backoff
     * @param {number} attemptCount - Number of attempts
     * @returns {number} Lockout time in milliseconds
     */
    calculateLockoutTime(attemptCount) {
      const baseLockout = this.windowMs
      const excessAttempts = Math.max(0, attemptCount - this.maxAttempts)
      return baseLockout * Math.pow(this.backoffMultiplier, excessAttempts)
    }

    /**
     * Clean up old records
     */
    cleanup() {
      const now = Date.now()
      for (const [identifier, record] of this.attempts.entries()) {
        record.attempts = record.attempts.filter((timestamp) => now - timestamp < this.windowMs * 2)

        if (record.attempts.length === 0) {
          this.attempts.delete(identifier)
        }
      }
    }

    /**
     * Reset attempts for an identifier
     * @param {string} identifier - IP, user ID, or API key
     */
    reset(identifier) {
      this.attempts.delete(identifier)
    }
  }
}

module.exports = SecurityUtils
