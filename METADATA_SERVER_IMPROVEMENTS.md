# Metadata Server Improvements for Frontend Issues

## 🔧 Current Issues Analysis

Based on the frontend errors and metadata server code review, here are the key areas for improvement:

### 1. Network Request Reliability
The current retry logic in `graphClient.request()` is good but can be enhanced:

```javascript
// Enhanced retry logic with better error handling
export const graphClient = {
  async request(query, variables, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await baseGraphClient.request(query, variables);
        if (i > 0) {
          logger.info('GraphQL request succeeded after retry', { 
            attempt: i + 1, 
            variables 
          });
        }
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if it's a network error vs data not found
        if (error.response?.status === 404 || error.message.includes('not found')) {
          logger.warn('Data not found in GraphQL', { query, variables });
          throw new Error(`Data not found: ${error.message}`);
        }
        
        logger.error(`GraphQL request failed (attempt ${i + 1}/${maxRetries})`, error, { 
          query: query.definitions?.[0]?.name?.value || 'unknown',
          variables 
        });
        
        if (i < maxRetries - 1) {
          // Exponential backoff with jitter
          const delay = Math.min(1000 * Math.pow(2, i) + Math.random() * 1000, 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
};
```

### 2. Improved Error Responses
Add more specific error types and better error messages:

```javascript
// Enhanced error handling middleware
const handleRequest = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    const errorResponse = {
      error: true,
      message: error.message,
      timestamp: new Date().toISOString(),
      tokenId: req.params.tokenId,
      endpoint: req.path
    };
    
    // Handle specific error types
    if (error.message.includes('not found')) {
      logger.warn(`[Not Found on ${req.path}]`, error.message);
      return res.status(404).json({ 
        ...errorResponse,
        type: 'NOT_FOUND',
        suggestion: 'Token may not exist or data not yet indexed'
      });
    }
    
    if (error.message.includes('timeout') || error.message.includes('network')) {
      logger.error(`[Network Error on ${req.path}]`, error);
      return res.status(503).json({ 
        ...errorResponse,
        type: 'NETWORK_ERROR',
        suggestion: 'Service temporarily unavailable, please try again'
      });
    }
    
    if (error.message.includes('rate limit')) {
      logger.error(`[Rate Limit on ${req.path}]`, error);
      return res.status(429).json({ 
        ...errorResponse,
        type: 'RATE_LIMIT',
        suggestion: 'Too many requests, please wait and try again'
      });
    }
    
    logger.error(`[Unknown Error on ${req.path}]`, error);
    res.status(500).json({ 
      ...errorResponse,
      type: 'INTERNAL_ERROR',
      suggestion: 'Internal server error, please contact support'
    });
  }
};
```

### 3. Health Check Enhancement
Improve the health check to test GraphQL connectivity:

```javascript
// Enhanced health check
app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {}
  };
  
  try {
    // Test GraphQL connectivity
    const testQuery = gql`query TestQuery { _meta { block { number } } }`;
    const startTime = Date.now();
    await graphClient.request(testQuery);
    const duration = Date.now() - startTime;
    
    healthCheck.checks.graphql = {
      status: 'OK',
      responseTime: duration,
      endpoint: THE_GRAPH_API_URL
    };
    
    // Test RPC connectivity
    const rpcStartTime = Date.now();
    const blockNumber = await publicClient.getBlockNumber();
    const rpcDuration = Date.now() - rpcStartTime;
    
    healthCheck.checks.rpc = {
      status: 'OK',
      responseTime: rpcDuration,
      blockNumber: blockNumber.toString()
    };
    
    // Test cache
    const cacheKey = 'health-check';
    const cacheData = { test: true, timestamp: Date.now() };
    caches.hero.set(cacheKey, cacheData);
    const retrievedData = caches.hero.get(cacheKey);
    
    healthCheck.checks.cache = {
      status: retrievedData ? 'OK' : 'FAILED',
      operations: ['SET', 'GET']
    };
    
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;
    
    // Mark specific services as failed
    if (error.message.includes('GraphQL') || error.message.includes('graph')) {
      healthCheck.checks.graphql = { status: 'FAILED', error: error.message };
    }
    if (error.message.includes('RPC') || error.message.includes('block')) {
      healthCheck.checks.rpc = { status: 'FAILED', error: error.message };
    }
    
    res.status(503).json(healthCheck);
  }
});
```

### 4. Performance Monitoring
Add performance metrics and monitoring:

```javascript
// Performance monitoring middleware
const performanceMiddleware = (req, res, next) => {
  const start = Date.now();
  const startMemory = process.memoryUsage();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const endMemory = process.memoryUsage();
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
    
    const metrics = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: duration,
      memoryDelta: memoryDelta,
      contentLength: res.get('content-length') || 0,
      userAgent: req.get('user-agent'),
      tokenId: req.params.tokenId
    };
    
    // Log slow requests
    if (duration > 5000) {
      logger.error('Slow request detected', null, metrics);
    } else if (duration > 2000) {
      logger.warn('Request took longer than expected', metrics);
    } else {
      logger.info('Request completed', metrics);
    }
  });
  
  next();
};
```

### 5. Fallback Mechanism
Implement better fallback for when The Graph is unavailable:

```javascript
// Enhanced fallback with blockchain fallback
const withFallback = async (tokenId, type, primaryFetcher, blockchainFallback) => {
  try {
    return await primaryFetcher();
  } catch (error) {
    logger.warn(`Primary data source failed for ${type} #${tokenId}, trying blockchain fallback`, error);
    
    try {
      const blockchainData = await blockchainFallback();
      logger.info(`Blockchain fallback succeeded for ${type} #${tokenId}`);
      return blockchainData;
    } catch (fallbackError) {
      logger.error(`Both primary and fallback failed for ${type} #${tokenId}`, fallbackError);
      
      // Return cached data if available
      const cachedData = caches[type].get(`${type}-${tokenId}`);
      if (cachedData) {
        logger.info(`Returning stale cached data for ${type} #${tokenId}`);
        return cachedData;
      }
      
      // Last resort: return minimal fallback
      return fallbackMetadata(tokenId, type);
    }
  }
};
```

### 6. VIP Data Fix
Fix the VIP data reading issues:

```javascript
// Enhanced VIP endpoint with better error handling
app.get('/api/vipstaking/:tokenId', handleRequest(async (req, res) => {
  const { tokenId } = req.params;
  const cacheKey = `vip-${tokenId}`;

  const metadata = await withCache(cacheKey, async () => {
    // First, check if token exists
    let owner;
    try {
      owner = await publicClient.readContract({
        address: contractAddresses.vipStaking,
        abi: abis.vipStaking,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      });
    } catch (error) {
      if (error.message.includes('ERC721: owner query for nonexistent token')) {
        throw new Error(`VIP token #${tokenId} does not exist`);
      }
      throw new Error(`Failed to get VIP token owner: ${error.message}`);
    }

    // Get VIP data from The Graph
    const query = gql`
      query GetVip($id: Bytes!) {
        player(id: $id) {
          vip {
            level
            stakedAmount
          }
        }
      }`;
    
    const { player } = await graphClient.request(query, { id: owner.toLowerCase() });
    
    if (!player?.vip) {
      // Fallback to blockchain if The Graph doesn't have data
      logger.warn(`VIP data not found in The Graph for ${owner}, using blockchain fallback`);
      
      // Try to get staked amount from contract
      const stakedAmount = await publicClient.readContract({
        address: contractAddresses.vipStaking,
        abi: abis.vipStaking,
        functionName: 'stakedAmount',
        args: [owner],
      }).catch(() => 0n);
      
      // Calculate level based on staked amount
      const level = calculateVIPLevel(stakedAmount);
      
      player.vip = {
        level,
        stakedAmount: stakedAmount.toString()
      };
    }

    const vip = player.vip;
    
    // Get USD value
    let stakedValueUSD;
    try {
      stakedValueUSD = await publicClient.readContract({
        address: contractAddresses.oracle,
        abi: abis.oracle,
        functionName: 'getAmountOut',
        args: [contractAddresses.soulShard, BigInt(vip.stakedAmount)]
      });
    } catch (error) {
      logger.error('Failed to get USD value from oracle', error);
      stakedValueUSD = 0n; // Default to 0 if oracle fails
    }

    const svgString = generateVipSVG({ level: vip.level, stakedValueUSD }, BigInt(tokenId));
    const image_data = Buffer.from(svgString).toString('base64');
    
    return {
      name: `Dungeon Delvers VIP #${tokenId}`,
      description: "A soul-bound VIP card that provides in-game bonuses based on the staked value.",
      image: `data:image/svg+xml;base64,${image_data}`,
      attributes: [
        { trait_type: "Level", value: vip.level },
        { display_type: "number", trait_type: "Staked Amount", value: vip.stakedAmount },
        { display_type: "number", trait_type: "Staked Value (USD)", value: Number(formatEther(stakedValueUSD)) },
        { trait_type: "Owner", value: owner }
      ],
    };
  }, 'vip');
  
  res.json(metadata);
}));

// Helper function to calculate VIP level
function calculateVIPLevel(stakedAmount) {
  // This should match your contract's level calculation logic
  const level = Math.floor(Math.sqrt(Number(stakedAmount) / 1e18 / 100));
  return Math.max(0, level);
}
```

### 7. Rate Limiting and CORS Improvements
Add rate limiting and improve CORS:

```javascript
// Simple rate limiting
const rateLimiter = new Map();

const rateLimit = (windowMs = 60000, max = 100) => {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimiter.has(key)) {
      rateLimiter.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const limit = rateLimiter.get(key);
    
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    
    if (limit.count >= max) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((limit.resetTime - now) / 1000)
      });
    }
    
    limit.count++;
    next();
  };
};

// Apply rate limiting
app.use('/api/', rateLimit(60000, 100)); // 100 requests per minute

// Improved CORS with better error handling
const allowedOrigins = [
  'https://www.soulshard.fun',
  'https://soulshard.fun',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin, allowedOrigins });
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
```

### 8. Monitoring and Alerts
Add basic monitoring:

```javascript
// Monitoring endpoint
app.get('/metrics', (req, res) => {
  const metrics = {
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version
    },
    cache: {
      hero: { keys: caches.hero.keys().length, stats: caches.hero.getStats() },
      relic: { keys: caches.relic.keys().length, stats: caches.relic.getStats() },
      party: { keys: caches.party.keys().length, stats: caches.party.getStats() },
      profile: { keys: caches.profile.keys().length, stats: caches.profile.getStats() },
      vip: { keys: caches.vip.keys().length, stats: caches.vip.getStats() }
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      port: PORT,
      hasGraphUrl: !!process.env.VITE_THE_GRAPH_STUDIO_API_URL,
      hasRpcUrl: !!process.env.BSC_RPC_URL
    }
  };
  
  res.json(metrics);
});
```

## 🚀 Deployment Improvements

### 1. Environment Configuration
```bash
# .env.example
NODE_ENV=production
PORT=3001
BSC_RPC_URL=https://bsc-dataseed1.binance.org/
VITE_THE_GRAPH_STUDIO_API_URL=your_graph_url_here

# Contract addresses
VITE_MAINNET_HERO_ADDRESS=0x...
VITE_MAINNET_RELIC_ADDRESS=0x...
VITE_MAINNET_PARTY_ADDRESS=0x...
VITE_MAINNET_PLAYERPROFILE_ADDRESS=0x...
VITE_MAINNET_VIPSTAKING_ADDRESS=0x...
VITE_MAINNET_ORACLE_ADDRESS=0x...
VITE_MAINNET_SOUL_SHARD_TOKEN_ADDRESS=0x...

# Optional: Monitoring
SENTRY_DSN=your_sentry_dsn
LOG_LEVEL=info
```

### 2. Docker Improvements
```dockerfile
# Dockerfile improvements
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

USER node
EXPOSE ${PORT}
CMD ["node", "src/index.js"]
```

### 3. PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'dungeon-delvers-metadata',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    watch: false,
    ignore_watch: ['node_modules', 'logs']
  }]
};
```

## 🎯 Priority Implementation Order

1. **High Priority**: Fix VIP data endpoint and error handling
2. **Medium Priority**: Add rate limiting and monitoring
3. **Low Priority**: Improve fallback mechanisms and performance monitoring

These improvements should help resolve many of the frontend issues you're experiencing, particularly the metadata fetching errors and VIP data problems.