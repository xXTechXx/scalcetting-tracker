const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const logger = require('./utils/logger');
const Database = require('./database/database');
const apiRoutes = require('./routes/api');

const app = express();

// Railway port configuration
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway HTTPS
app.set('trust proxy', 1);

// Configurazione middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    },
    hsts: process.env.NODE_ENV === 'production' ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    } : false
}));

app.use(compression());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://*.railway.app', 'https://*.up.railway.app'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (più permissivo per Railway)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: process.env.NODE_ENV === 'production' ? 200 : 1000, // Railway needs higher limits
    message: {
        error: 'Troppe richieste da questo IP, riprova tra 15 minuti'
    },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true // Important for Railway
});

app.use('/api/', limiter);

// Logging
const morgan = require('morgan');
app.use(morgan('combined', { 
    stream: { write: message => logger.info(message.trim()) }
}));

// Middleware per gestire JSON errors
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        logger.error('JSON parsing error:', err.message);
        return res.status(400).json({
            error: 'Invalid JSON format',
            message: 'Controlla la sintassi JSON'
        });
    }
    next(err);
});

// Inizializza database
let db;

async function initializeDatabase() {
    try {
        db = new Database();
        await db.initialize();
        logger.info('✅ Database inizializzato con successo');
        return true;
    } catch (error) {
        logger.error('❌ Errore inizializzazione database:', error);
        return false;
    }
}

// Middleware per inserire db in req
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Routes
app.use('/api', apiRoutes);

// Serve static files with caching for production
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    lastModified: true
}));

// Route per la pagina principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint (importante per Railway)
app.get('/health', async (req, res) => {
    try {
        const health = await db.checkHealth();
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: health,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version,
            platform: 'railway'
        });
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Railway specific endpoints
app.get('/railway/info', (req, res) => {
    res.json({
        service: 'Scalcetting Tracker',
        version: '2.0.0',
        platform: 'Railway',
        node_version: process.version,
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        database: {
            host: process.env.MYSQLHOST || 'localhost',
            port: process.env.MYSQLPORT || 3306,
            name: process.env.MYSQLDATABASE || 'scalcetting'
        }
    });
});

// Gestione errori 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint non trovato',
        path: req.path,
        method: req.method
    });
});

// Gestione errori globale
app.use((err, req, res, next) => {
    logger.error('Errore del server:', err);
    
    if (res.headersSent) {
        return next(err);
    }
    
    res.status(500).json({
        error: 'Errore interno del server',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Si è verificato un errore imprevisto',
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM ricevuto, chiusura graceful...');
    
    server.close(async () => {
        logger.info('HTTP server chiuso');
        
        if (db) {
            await db.close();
            logger.info('Database connection chiusa');
        }
        
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    logger.info('SIGINT ricevuto, chiusura graceful...');
    
    server.close(async () => {
        logger.info('HTTP server chiuso');
        
        if (db) {
            await db.close();
            logger.info('Database connection chiusa');
        }
        
        process.exit(0);
    });
});

// Gestione errori non catturati
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Avvio server
let server;

async function startServer() {
    try {
        const dbInitialized = await initializeDatabase();
        
        if (!dbInitialized) {
            logger.error('❌ Impossibile avviare il server senza database');
            process.exit(1);
        }
        
        server = app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🚂 Scalcetting Tracker running on Railway`);
            logger.info(`📍 Port: ${PORT}`);
            logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`💾 Database: ${process.env.MYSQLDATABASE || 'scalcetting'}`);
            logger.info(`🌐 Platform: Railway`);
        });
        
        // Keep-alive for Railway
        server.keepAliveTimeout = 120000; // 2 minutes
        server.headersTimeout = 120000; // 2 minutes
        
    } catch (error) {
        logger.error('❌ Errore avvio server:', error);
        process.exit(1);
    }
}

// Avvia il server solo se non è in modalità test
if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };