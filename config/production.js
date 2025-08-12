const crypto = require('crypto');

/**
 * Production configuration with secure defaults
 * All sensitive values should be provided via environment variables
 */

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'WEB_SESSION_SECRET',
  'REDIS_HOST',
  'REDIS_PASSWORD'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars);
  console.error('Please set these variables before starting in production mode');
  
  // Generate secure suggestions for missing secrets
  if (missingVars.includes('JWT_SECRET')) {
    console.log(`Suggested JWT_SECRET: ${crypto.randomBytes(32).toString('hex')}`);
  }
  if (missingVars.includes('ENCRYPTION_KEY')) {
    console.log(`Suggested ENCRYPTION_KEY: ${crypto.randomBytes(32).toString('hex')}`);
  }
  if (missingVars.includes('WEB_SESSION_SECRET')) {
    console.log(`Suggested WEB_SESSION_SECRET: ${crypto.randomBytes(32).toString('hex')}`);
  }
  
  process.exit(1);
}

module.exports = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    env: 'production',
    trustProxy: true,
    
    // Timeouts
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '60000', 10),
    keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT || '65000', 10),
    headersTimeout: parseInt(process.env.HEADERS_TIMEOUT || '66000', 10)
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    encryptionKey: process.env.ENCRYPTION_KEY,
    apiKeyPrefix: process.env.API_KEY_PREFIX || 'sk_',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    
    // Session configuration
    sessionSecret: process.env.WEB_SESSION_SECRET,
    sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10), // 24 hours
    sessionName: 'relay.sid',
    sessionSecure: true, // Require HTTPS
    sessionHttpOnly: true,
    sessionSameSite: 'strict',
    
    // CORS
    corsOrigin: process.env.CORS_ORIGIN ? 
      process.env.CORS_ORIGIN.split(',') : false,
    corsCredentials: true,
    
    // CSP Headers
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    }
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'relay:',
    
    // Connection options
    enableOfflineQueue: false,
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    
    // TLS configuration (if using Redis with TLS)
    tls: process.env.REDIS_TLS === 'true' ? {
      rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false'
    } : undefined
  },

  // Database configuration
  database: {
    path: process.env.CLAUDE4DEV_DB_PATH || '/data/aicoding.db',
    readonly: true,
    timeout: 5000,
    busyTimeout: 10000,
    
    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000
  },

  // Claude API configuration
  claude: {
    apiUrl: process.env.CLAUDE_API_URL || 'https://api.anthropic.com',
    apiVersion: process.env.CLAUDE_API_VERSION || '2023-06-01',
    betaHeaders: process.env.CLAUDE_BETA_HEADERS || 
      'max-tokens-3-5-sonnet-2024-07-15,messages-2023-12-15,prompt-caching-2024-07-31,pdfs-2024-09-25,token-counting-2024-11-01',
    
    // Timeout settings
    timeout: parseInt(process.env.CLAUDE_TIMEOUT || '300000', 10), // 5 minutes
    streamTimeout: parseInt(process.env.CLAUDE_STREAM_TIMEOUT || '600000', 10), // 10 minutes
    
    // Retry configuration
    maxRetries: parseInt(process.env.CLAUDE_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.CLAUDE_RETRY_DELAY || '1000', 10)
  },

  // Proxy configuration
  proxy: {
    timeout: parseInt(process.env.PROXY_TIMEOUT || '300000', 10),
    proxyTimeout: parseInt(process.env.PROXY_PROXY_TIMEOUT || '300000', 10),
    maxRetries: parseInt(process.env.PROXY_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.PROXY_RETRY_DELAY || '1000', 10),
    
    // Circuit breaker
    circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    circuitBreakerTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '30000', 10),
    circuitBreakerResetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET || '30000', 10)
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    
    // File logging
    file: {
      enabled: process.env.LOG_FILE_ENABLED !== 'false',
      filename: process.env.LOG_FILE_NAME || 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_FILE_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_FILE_MAX_FILES || '14d',
      level: process.env.LOG_FILE_LEVEL || 'info'
    },
    
    // Error logging
    errorFile: {
      enabled: process.env.LOG_ERROR_FILE_ENABLED !== 'false',
      filename: process.env.LOG_ERROR_FILE_NAME || 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_ERROR_FILE_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_ERROR_FILE_MAX_FILES || '30d',
      level: 'error'
    },
    
    // Audit logging
    audit: {
      enabled: process.env.AUDIT_LOG_ENABLED === 'true',
      filename: process.env.AUDIT_LOG_FILE || 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '90d'
    }
  },

  // Rate limiting configuration
  rateLimit: {
    // Global rate limit
    global: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    },
    
    // API key specific limits
    apiKey: {
      defaultTokenLimit: parseInt(process.env.DEFAULT_TOKEN_LIMIT || '1000000', 10),
      defaultRequestLimit: parseInt(process.env.DEFAULT_REQUEST_LIMIT || '100', 10),
      defaultConcurrentLimit: parseInt(process.env.DEFAULT_CONCURRENT_LIMIT || '5', 10),
      windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '1', 10)
    },
    
    // Auth rate limit
    auth: {
      windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
      max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
      skipSuccessfulRequests: true
    }
  },

  // Monitoring configuration
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    
    // Health check
    healthCheck: {
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
      unhealthyThreshold: parseInt(process.env.HEALTH_CHECK_UNHEALTHY || '3', 10)
    },
    
    // Metrics
    metrics: {
      enabled: process.env.METRICS_ENABLED === 'true',
      port: parseInt(process.env.METRICS_PORT || '9090', 10),
      path: process.env.METRICS_PATH || '/metrics'
    },
    
    // OpenTelemetry
    openTelemetry: {
      enabled: process.env.OTEL_ENABLED === 'true',
      serviceName: process.env.OTEL_SERVICE_NAME || 'claude-relay-service',
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
    }
  },

  // Performance configuration
  performance: {
    // Memory limits
    maxMemoryUsage: parseInt(process.env.MAX_MEMORY_MB || '512', 10) * 1024 * 1024,
    memoryCheckInterval: parseInt(process.env.MEMORY_CHECK_INTERVAL || '60000', 10),
    
    // Request limits
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
    maxUploadSize: process.env.MAX_UPLOAD_SIZE || '50mb',
    
    // Connection limits
    maxConnections: parseInt(process.env.MAX_CONNECTIONS || '1000', 10),
    maxConnectionsPerIp: parseInt(process.env.MAX_CONNECTIONS_PER_IP || '20', 10)
  },

  // Maintenance mode
  maintenance: {
    enabled: process.env.MAINTENANCE_MODE === 'true',
    message: process.env.MAINTENANCE_MESSAGE || 'Service is under maintenance. Please try again later.',
    allowedIps: process.env.MAINTENANCE_ALLOWED_IPS ? 
      process.env.MAINTENANCE_ALLOWED_IPS.split(',') : []
  }
};

// Validate configuration
function validateConfig(config) {
  const errors = [];
  
  // Validate JWT secret length
  if (config.security.jwtSecret.length < 32) {
    errors.push('JWT_SECRET should be at least 32 characters long');
  }
  
  // Validate encryption key length
  if (config.security.encryptionKey.length < 32) {
    errors.push('ENCRYPTION_KEY should be at least 32 characters long');
  }
  
  // Validate Redis connection
  if (!config.redis.host) {
    errors.push('REDIS_HOST is required');
  }
  
  if (errors.length > 0) {
    console.error('Configuration validation errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
}

// Validate on load
validateConfig(module.exports);