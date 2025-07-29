# Local Development Environment Setup Guide

This guide provides complete instructions for setting up the Claude Relay Service development environment on your local machine.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Docker Setup (Recommended)](#docker-setup-recommended)
4. [Manual Setup](#manual-setup)
5. [Configuration](#configuration)
6. [Development Commands](#development-commands)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **Node.js**: 18.0.0 or higher
- **Redis**: 7.0 or higher
- **Docker** (recommended): Latest version with Docker Compose
- **Git**: For version control
- **Operating System**: macOS, Linux, or Windows

### Hardware Requirements
- **CPU**: 1+ cores (2+ recommended)
- **Memory**: 512MB minimum (1GB+ recommended)
- **Storage**: 1GB available space
- **Network**: Internet access for dependencies and Claude API

## Quick Start

The fastest way to get started is using our hybrid approach:

```bash
# 1. Clone the repository
git clone https://github.com/Wei-Shaw/claude-relay-service.git
cd claude-relay-service

# 2. Start Redis with Docker
docker run -d --name claude-relay-redis -p 6379:6379 redis:7-alpine

# 3. Install dependencies
npm install

# 4. Copy configuration files
cp .env.example .env
cp config/config.example.js config/config.js

# 5. Run initial setup
npm run setup

# 6. Start development server
npm run dev
```

Your service will be available at:
- **Web Interface**: http://localhost:3000/web
- **API Endpoint**: http://localhost:3000/api/v1/messages
- **Health Check**: http://localhost:3000/health

## Docker Setup (Recommended)

### Full Docker Compose Setup

```bash
# 1. Clone and navigate
git clone https://github.com/Wei-Shaw/claude-relay-service.git
cd claude-relay-service

# 2. Configure environment
cp .env.example .env

# 3. Generate secure keys
node -e "
const crypto = require('crypto');
console.log('JWT_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('ENCRYPTION_KEY=' + crypto.randomBytes(16).toString('hex'));
"

# 4. Update .env with generated keys
# Edit .env and replace JWT_SECRET and ENCRYPTION_KEY with generated values

# 5. Start all services
docker-compose up -d

# 6. Check status
docker-compose ps
```

### Hybrid Docker Setup (Current Implementation)

For faster development iteration, we use Redis in Docker and run the application natively:

```bash
# Start Redis container
docker run -d --name claude-relay-redis -p 6379:6379 redis:7-alpine

# Continue with manual setup for the application
```

## Manual Setup

### 1. Environment Setup

```bash
# Install Node.js (if not already installed)
# macOS with Homebrew:
brew install node@18

# Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Redis
# macOS:
brew install redis
brew services start redis

# Ubuntu/Debian:
sudo apt update && sudo apt install redis-server
sudo systemctl start redis-server
```

### 2. Project Setup

```bash
# Clone repository
git clone https://github.com/Wei-Shaw/claude-relay-service.git
cd claude-relay-service

# Install dependencies
npm install
npm run install:web  # Install web interface dependencies

# Copy configuration templates
cp .env.example .env
cp config/config.example.js config/config.js
```

### 3. Security Configuration

Generate secure random keys:

```bash
node -e "
const crypto = require('crypto');
const jwt_secret = crypto.randomBytes(32).toString('hex');
const encryption_key = crypto.randomBytes(16).toString('hex');
console.log('Generated keys:');
console.log('JWT_SECRET=' + jwt_secret);
console.log('ENCRYPTION_KEY=' + encryption_key);
console.log('\nAdd these to your .env file');
"
```

Update your `.env` file with the generated keys:

```bash
# Example .env configuration
JWT_SECRET=686be66689d8e6b0f63af6e6dc1b4049957ae191864f459da91e69d8f8c16065
ENCRYPTION_KEY=9c1ccda27b95ace4933f6c47fd222155
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
```

### 4. Initialize Service

```bash
# Run setup script (generates admin credentials)
npm run setup

# The setup will output admin credentials like:
# Username: cr_admin_1677783a
# Password: btBHHRsmLryPAcNx
# Save these credentials!
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | ✅ | - | JWT signing secret (32+ chars) |
| `ENCRYPTION_KEY` | ✅ | - | AES encryption key (32 chars) |
| `REDIS_HOST` | ✅ | localhost | Redis server host |
| `REDIS_PORT` | ✅ | 6379 | Redis server port |
| `PORT` | ❌ | 3000 | Service port |
| `HOST` | ❌ | 0.0.0.0 | Service host |
| `NODE_ENV` | ❌ | production | Environment mode |

### Admin Credentials

Admin credentials are stored in `/Users/tiansheng/Workspace/js/claude-relay-service/data/init.json`:

```json
{
  "initializedAt": "2025-07-29T13:58:42.286Z",
  "adminUsername": "cr_admin_1677783a",
  "adminPassword": "btBHHRsmLryPAcNx",
  "version": "1.0.0"
}
```

## Development Commands

### Basic Commands

```bash
# Development (hot reload)
npm run dev

# Production mode
npm start

# Install web dependencies
npm run install:web
```

### Service Management

```bash
# Start as daemon (recommended for development)
npm run service:start:daemon

# Check service status
npm run service:status

# View logs
npm run service:logs

# Stop service
npm run service:stop

# Restart daemon
npm run service:restart:daemon
```

### CLI Management Tools

```bash
# System status
npm run cli status

# Admin operations
npm run cli admin

# API key management
npm run cli keys

# Claude account management
npm run cli accounts
```

### Code Quality

```bash
# Run linting
npm run lint

# Run tests
npm test

# Build Docker image
npm run docker:build
```

## Testing

### Manual Testing

1. **Health Check**:
   ```bash
   curl http://localhost:3000/health
   ```

2. **Web Interface**:
   - Navigate to http://localhost:3000/web
   - Login with admin credentials
   - Verify dashboard loads

3. **API Authentication**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/messages \
     -H "Content-Type: application/json" \
     -d '{"messages": []}'
   # Should return: {"error": "Missing API key"}
   ```

### Running Tests

```bash
# Run all tests
npm test

# Run linting
npm run lint

# Check service status
npm run cli status
```

## Troubleshooting

### Common Issues

#### 1. Redis Connection Failed
```
Error: Redis connection failed
```

**Solutions**:
- Ensure Redis is running: `redis-cli ping`
- Check Redis port: `netstat -an | grep 6379`
- Verify Docker container: `docker ps | grep redis`

#### 2. Module Not Found
```
Error: Cannot find module '../config/config'
```

**Solution**:
```bash
cp config/config.example.js config/config.js
```

#### 3. Permission Denied
```
Error: EACCES: permission denied
```

**Solutions**:
- Check file permissions: `ls -la`
- Create directories: `mkdir -p logs data`
- Use correct user permissions

#### 4. Port Already in Use
```
Error: Port 3000 is already in use
```

**Solutions**:
- Check what's using the port: `lsof -i :3000`
- Kill the process or use a different port
- Update `PORT` in `.env`

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# View service logs
tail -f logs/claude-relay-*.log

# Check system status
npm run cli status

# Test database connection
npm run cli admin
```

### Log Files

Logs are stored in the `logs/` directory:
- `claude-relay-2025-07-29.log` - General application logs
- `claude-relay-error-2025-07-29.log` - Error logs
- `claude-relay-security-2025-07-29.log` - Security events
- `service.log` - Service management logs

### Getting Help

1. **Check service status**: `npm run cli status`
2. **Review logs**: `npm run service:logs`
3. **Verify configuration**: Ensure all required environment variables are set
4. **Test components individually**: Redis, Node.js, ports
5. **Check documentation**: Review project README and docs/

## Next Steps

After successful setup:

1. **Access Web Interface**: http://localhost:3000/web
2. **Add Claude Accounts**: Configure OAuth accounts via the web interface
3. **Create API Keys**: Generate keys for client applications
4. **Test API Integration**: Use generated keys with your applications
5. **Monitor Usage**: Check dashboard for statistics and health

For production deployment, refer to the main project documentation for Docker Compose, reverse proxy setup, and security considerations.