#!/bin/bash

# Optimized startup script with memory management

# Set Node.js memory options
export NODE_OPTIONS="--max-old-space-size=2048 --max-semi-space-size=32"

# Start the service with optimized settings
echo "Starting Claude Relay Service with optimized memory settings..."
echo "Memory limit: 2GB"
echo "Node options: $NODE_OPTIONS"

# Run the application
node src/app.js