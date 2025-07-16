#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const readline = require('readline');

console.log('🏆 Scalcetting Tracker - Setup');
console.log('===============================\n');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    try {
        console.log('Configurazione database MySQL...\n');
        
        const host = await question('Host database (default: localhost): ') || 'localhost';
        const port = await question('Porta database (default: 3306): ') || '3306';
        const user = await question('Username database (default: root): ') || 'root';
        const password = await question('Password database: ');
        const database = await question('Nome database (default: scalcetting): ') || 'scalcetting';
        
        console.log('\n🔍 Test connessione database...');
        
        // Test connessione
        const connection = await mysql.createConnection({
            host,
            port: parseInt(port),
            user,
            password
        });
        
        console.log('✅ Connessione riuscita!');
        
        // Crea database se non esiste
        console.log(`🗄️  Creazione database '${database}'...`);
        await connection.execute(`CREATE DATABASE IF NOT EXISTS ${database}`);
        console.log('✅ Database creato/verificato!');
        
        await connection.end();
        
        // Crea file .env
        console.log('\n📝 Creazione file .env...');
        const envContent = `# Scalcetting Tracker Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database Configuration
DB_HOST=${host}
DB_PORT=${port}
DB_USER=${user}
DB_PASSWORD=${password}
DB_NAME=${database}

# Security
JWT_SECRET=${generateRandomString(64)}
SESSION_SECRET=${generateRandomString(64)}

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Development
DEBUG=scalcetting:*
`;
        
        fs.writeFileSync('.env', envContent);
        console.log('✅ File .env creato!');
        
        // Crea directory logs
        console.log('\n📁 Creazione directory logs...');
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        console.log('✅ Directory logs creata!');
        
        // Crea directory public se non esiste
        console.log('\n📁 Verifica directory public...');
        const publicDir = path.join(__dirname, 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        console.log('✅ Directory public pronta!');
        
        console.log('\n🎉 Setup completato con successo!');
        console.log('\nProssimi passi:');
        console.log('1. npm install');
        console.log('2. npm start');
        console.log('3. Apri http://localhost:3000');
        console.log('\nComandi disponibili:');
        console.log('• npm run dev - Avvia in modalità sviluppo');
        console.log('• npm test - Esegue i test');
        console.log('• npm run setup - Esegue di nuovo il setup');
        
    } catch (error) {
        console.error('❌ Errore durante il setup:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

if (require.main === module) {
    main();
}