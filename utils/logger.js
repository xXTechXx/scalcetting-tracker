const winston = require('winston');

// Railway logging configuration
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { 
        service: 'scalcetting-tracker',
        platform: 'railway',
        version: '2.0.0'
    },
    transports: [
        // Railway uses stdout/stderr for logging
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    let log = `${timestamp} [${level}]: ${message}`;
                    
                    // Add metadata if present
                    if (Object.keys(meta).length > 0) {
                        log += ` ${JSON.stringify(meta)}`;
                    }
                    
                    return log;
                })
            )
        })
    ]
});

// In development, also log to files if possible
if (process.env.NODE_ENV !== 'production') {
    const fs = require('fs');
    const path = require('path');
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
        try {
            fs.mkdirSync(logsDir, { recursive: true });
            
            // Add file transports for development
            logger.add(new winston.transports.File({ 
                filename: path.join(logsDir, 'error.log'), 
                level: 'error',
                maxsize: 5242880, // 5MB
                maxFiles: 5
            }));
            
            logger.add(new winston.transports.File({ 
                filename: path.join(logsDir, 'combined.log'),
                maxsize: 5242880, // 5MB
                maxFiles: 10
            }));
        } catch (error) {
            // Ignore file logging errors in production environments
            console.warn('Could not create logs directory:', error.message);
        }
    }
}

// Railway-specific logging helpers
logger.railway = {
    deployment: (message, meta = {}) => {
        logger.info(`🚂 RAILWAY: ${message}`, { ...meta, type: 'deployment' });
    },
    
    database: (message, meta = {}) => {
        logger.info(`💾 DATABASE: ${message}`, { ...meta, type: 'database' });
    },
    
    api: (message, meta = {}) => {
        logger.info(`🔗 API: ${message}`, { ...meta, type: 'api' });
    },
    
    performance: (message, meta = {}) => {
        logger.info(`⚡ PERFORMANCE: ${message}`, { ...meta, type: 'performance' });
    }
};

module.exports = logger;