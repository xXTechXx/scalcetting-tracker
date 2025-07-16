const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.connection = null;
        this.config = {
            // Railway MySQL configuration
            host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
            port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
            user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
            password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
            database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'scalcetting',
            charset: 'utf8mb4',
            timezone: '+00:00',
            acquireTimeout: 60000,
            timeout: 60000,
            reconnect: true,
            // SSL configuration for Railway
            ssl: process.env.NODE_ENV === 'production' && process.env.MYSQLHOST ? {
                rejectUnauthorized: false
            } : false
        };
    }

    async initialize() {
        try {
            await this.connect();
            await this.createTables();
            await this.insertSampleData();
            logger.info('✅ Database inizializzato con successo');
        } catch (error) {
            logger.error('❌ Errore inizializzazione database:', error);
            throw error;
        }
    }

    async connect() {
        try {
            // Log connection details (without password)
            logger.info('🔌 Connecting to database:', {
                host: this.config.host,
                port: this.config.port,
                user: this.config.user,
                database: this.config.database,
                ssl: !!this.config.ssl
            });
            
            this.connection = await mysql.createConnection(this.config);
            
            // Test connection
            await this.connection.ping();
            
            logger.info('✅ Connessione database stabilita');
        } catch (error) {
            logger.error('❌ Errore connessione database:', error);
            throw error;
        }
    }

    async createTables() {
        try {
            // Tabella giocatori
            const createGiocatoriTable = `
                CREATE TABLE IF NOT EXISTS giocatori (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(100) NOT NULL UNIQUE,
                    ruolo ENUM('portiere', 'attaccante') NOT NULL,
                    elo INT DEFAULT 1500,
                    partite INT DEFAULT 0,
                    vittorie INT DEFAULT 0,
                    sconfitte INT DEFAULT 0,
                    creato TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    aggiornato TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    
                    INDEX idx_nome (nome),
                    INDEX idx_elo (elo),
                    INDEX idx_ruolo (ruolo),
                    INDEX idx_partite (partite)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;
            
            await this.connection.execute(createGiocatoriTable);

            // Tabella partite
            const createPartiteTable = `
                CREATE TABLE IF NOT EXISTS partite (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    squadra1 JSON NOT NULL,
                    squadra2 JSON NOT NULL,
                    vincitore TINYINT NOT NULL CHECK (vincitore IN (1, 2)),
                    data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    
                    INDEX idx_data (data),
                    INDEX idx_vincitore (vincitore)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;
            
            await this.connection.execute(createPartiteTable);

            logger.info('✅ Tabelle create/verificate');
        } catch (error) {
            logger.error('❌ Errore creazione tabelle:', error);
            throw error;
        }
    }

    async insertSampleData() {
        try {
            // Controlla se ci sono già giocatori
            const [rows] = await this.connection.execute('SELECT COUNT(*) as count FROM giocatori');
            const count = rows[0].count;
            
            if (count === 0) {
                const samplePlayers = [
                    ['Mario', 'portiere'],
                    ['Luigi', 'attaccante'],
                    ['Paolo', 'portiere'],
                    ['Marco', 'attaccante'],
                    ['Giovanni', 'portiere'],
                    ['Luca', 'attaccante']
                ];

                for (const [nome, ruolo] of samplePlayers) {
                    await this.connection.execute(
                        'INSERT INTO giocatori (nome, ruolo) VALUES (?, ?)',
                        [nome, ruolo]
                    );
                }
                
                logger.info(`✅ Inseriti ${samplePlayers.length} giocatori di esempio`);
            }
        } catch (error) {
            logger.error('❌ Errore inserimento dati di esempio:', error);
            // Non critico, l'app può funzionare senza dati di esempio
        }
    }

    async getGiocatori() {
        try {
            const [rows] = await this.connection.execute(`
                SELECT 
                    id, nome, ruolo, elo, partite, vittorie, sconfitte, creato
                FROM giocatori
                ORDER BY elo DESC, nome ASC
            `);
            
            return rows.map(row => ({
                id: row.id,
                nome: row.nome,
                ruolo: row.ruolo,
                elo: row.elo,
                partite: row.partite,
                vittorie: row.vittorie,
                sconfitte: row.sconfitte,
                creato: row.creato
            }));
        } catch (error) {
            logger.error('❌ Errore recupero giocatori:', error);
            throw error;
        }
    }

    async createGiocatore(nome, ruolo) {
        try {
            // Controlla se il giocatore esiste già
            const [existing] = await this.connection.execute(
                'SELECT id FROM giocatori WHERE LOWER(nome) = LOWER(?)',
                [nome]
            );
            
            if (existing.length > 0) {
                throw new Error('Giocatore già esistente');
            }
            
            const [result] = await this.connection.execute(
                'INSERT INTO giocatori (nome, ruolo, elo, partite, vittorie, sconfitte) VALUES (?, ?, 1500, 0, 0, 0)',
                [nome, ruolo]
            );
            
            return {
                id: result.insertId,
                nome,
                ruolo,
                elo: 1500,
                partite: 0,
                vittorie: 0,
                sconfitte: 0
            };
        } catch (error) {
            logger.error('❌ Errore creazione giocatore:', error);
            throw error;
        }
    }

    async getPartite() {
        try {
            const [rows] = await this.connection.execute(`
                SELECT 
                    id, squadra1, squadra2, vincitore, data
                FROM partite
                ORDER BY data DESC
            `);
            
            const partite = [];
            
            for (const row of rows) {
                const squadra1 = JSON.parse(row.squadra1);
                const squadra2 = JSON.parse(row.squadra2);
                
                // Recupera nomi giocatori
                const nomiGiocatori = await this.getNomiGiocatori([
                    squadra1[0], squadra1[1], squadra2[0], squadra2[1]
                ]);
                
                partite.push({
                    id: row.id,
                    squadra1,
                    squadra2,
                    vincitore: row.vincitore,
                    data: row.data,
                    nomi_giocatori: {
                        squadra1_portiere: nomiGiocatori[squadra1[0]],
                        squadra1_attaccante: nomiGiocatori[squadra1[1]],
                        squadra2_portiere: nomiGiocatori[squadra2[0]],
                        squadra2_attaccante: nomiGiocatori[squadra2[1]]
                    }
                });
            }
            
            return partite;
        } catch (error) {
            logger.error('❌ Errore recupero partite:', error);
            throw error;
        }
    }

    async getNomiGiocatori(ids) {
        try {
            const placeholders = ids.map(() => '?').join(',');
            const [rows] = await this.connection.execute(
                `SELECT id, nome FROM giocatori WHERE id IN (${placeholders})`,
                ids
            );
            
            const nomiMap = {};
            rows.forEach(row => {
                nomiMap[row.id] = row.nome;
            });
            
            return nomiMap;
        } catch (error) {
            logger.error('❌ Errore recupero nomi giocatori:', error);
            throw error;
        }
    }

    async createPartita(squadra1, squadra2, vincitore) {
        // Create new connection for transaction
        const connection = await mysql.createConnection(this.config);
        
        try {
            await connection.beginTransaction();
            
            // Validazione giocatori
            const tuttiGiocatori = [...squadra1, ...squadra2];
            const placeholders = tuttiGiocatori.map(() => '?').join(',');
            const [giocatori] = await connection.execute(
                `SELECT id, elo FROM giocatori WHERE id IN (${placeholders})`,
                tuttiGiocatori
            );
            
            if (giocatori.length !== 4) {
                throw new Error('Uno o più giocatori non esistono');
            }
            
            // Crea mappa ELO
            const eloMap = {};
            giocatori.forEach(g => {
                eloMap[g.id] = g.elo;
            });
            
            // Calcola ELO medio per squadra
            const eloSquadra1 = (eloMap[squadra1[0]] + eloMap[squadra1[1]]) / 2;
            const eloSquadra2 = (eloMap[squadra2[0]] + eloMap[squadra2[1]]) / 2;
            
            // Calcola nuovi ELO
            const k = 32; // Fattore K
            const risultato1 = vincitore === 1 ? 1 : 0;
            const risultato2 = vincitore === 2 ? 1 : 0;
            
            const nuoviEloSquadra1 = this.calcolaELO(eloSquadra1, eloSquadra2, risultato1, k);
            const nuoviEloSquadra2 = this.calcolaELO(eloSquadra2, eloSquadra1, risultato2, k);
            
            const deltaElo1 = nuoviEloSquadra1 - eloSquadra1;
            const deltaElo2 = nuoviEloSquadra2 - eloSquadra2;
            
            // Aggiorna ELO e statistiche giocatori
            for (const giocatoreId of squadra1) {
                const nuovoElo = eloMap[giocatoreId] + deltaElo1;
                const isVincitore = vincitore === 1 ? 1 : 0;
                
                await connection.execute(`
                    UPDATE giocatori 
                    SET elo = ?, 
                        partite = partite + 1,
                        vittorie = vittorie + ?,
                        sconfitte = sconfitte + ?
                    WHERE id = ?
                `, [nuovoElo, isVincitore, 1 - isVincitore, giocatoreId]);
            }
            
            for (const giocatoreId of squadra2) {
                const nuovoElo = eloMap[giocatoreId] + deltaElo2;
                const isVincitore = vincitore === 2 ? 1 : 0;
                
                await connection.execute(`
                    UPDATE giocatori 
                    SET elo = ?, 
                        partite = partite + 1,
                        vittorie = vittorie + ?,
                        sconfitte = sconfitte + ?
                    WHERE id = ?
                `, [nuovoElo, isVincitore, 1 - isVincitore, giocatoreId]);
            }
            
            // Inserisci partita
            const [result] = await connection.execute(
                'INSERT INTO partite (squadra1, squadra2, vincitore, data) VALUES (?, ?, ?, NOW())',
                [JSON.stringify(squadra1), JSON.stringify(squadra2), vincitore]
            );
            
            await connection.commit();
            
            return {
                id: result.insertId,
                squadra1,
                squadra2,
                vincitore,
                elo_changes: {
                    squadra1_delta: deltaElo1,
                    squadra2_delta: deltaElo2
                }
            };
            
        } catch (error) {
            await connection.rollback();
            logger.error('❌ Errore creazione partita:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    calcolaELO(eloA, eloB, risultato, k = 32) {
        const atteso = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
        return Math.round(eloA + k * (risultato - atteso));
    }

    async checkHealth() {
        try {
            // Reconnect if connection is lost
            if (!this.connection || this.connection.connection._closing) {
                await this.connect();
            }
            
            const [versionResult] = await this.connection.execute('SELECT VERSION() as version');
            const [giocatoriCount] = await this.connection.execute('SELECT COUNT(*) as count FROM giocatori');
            const [partiteCount] = await this.connection.execute('SELECT COUNT(*) as count FROM partite');
            
            return {
                connected: true,
                mysql_version: versionResult[0].version,
                giocatori_count: giocatoriCount[0].count,
                partite_count: partiteCount[0].count,
                host: this.config.host,
                database: this.config.database,
                ssl: !!this.config.ssl
            };
        } catch (error) {
            logger.error('❌ Health check failed:', error);
            return {
                connected: false,
                error: error.message
            };
        }
    }

    async exportData() {
        try {
            const giocatori = await this.getGiocatori();
            const partite = await this.getPartite();
            
            return {
                metadata: {
                    esportato: new Date().toISOString(),
                    versione: '2.0',
                    platform: 'Railway',
                    totale_giocatori: giocatori.length,
                    totale_partite: partite.length
                },
                giocatori,
                partite
            };
        } catch (error) {
            logger.error('❌ Errore export dati:', error);
            throw error;
        }
    }

    async resetDatabase() {
        try {
            // Solo in ambiente di sviluppo
            if (process.env.NODE_ENV === 'production') {
                throw new Error('Reset database non consentito in produzione');
            }
            
            await this.connection.execute('SET FOREIGN_KEY_CHECKS = 0');
            await this.connection.execute('TRUNCATE TABLE partite');
            await this.connection.execute('TRUNCATE TABLE giocatori');
            await this.connection.execute('SET FOREIGN_KEY_CHECKS = 1');
            
            // Reinserisce dati di esempio
            await this.insertSampleData();
            
            logger.info('✅ Database resettato');
            return true;
        } catch (error) {
            logger.error('❌ Errore reset database:', error);
            throw error;
        }
    }

    async close() {
        try {
            if (this.connection) {
                await this.connection.end();
                logger.info('✅ Database connection chiusa');
            }
        } catch (error) {
            logger.error('❌ Errore chiusura database:', error);
        }
    }
}

module.exports = Database;)const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.connection = null;
        this.config = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'scalcetting',
            charset: 'utf8mb4',
            timezone: '+00:00',
            acquireTimeout: 60000,
            timeout: 60000,
            reconnect: true
        };
    }

    async initialize() {
        try {
            await this.connect();
            await this.createTables();
            await this.insertSampleData();
            logger.info('✅ Database inizializzato con successo');
        } catch (error) {
            logger.error('❌ Errore inizializzazione database:', error);
            throw error;
        }
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection(this.config);
            logger.info('✅ Connessione database stabilita');
        } catch (error) {
            logger.error('❌ Errore connessione database:', error);
            throw error;
        }
    }

    async createTables() {
        try {
            // Tabella giocatori
            const createGiocatoriTable = `
                CREATE TABLE IF NOT EXISTS giocatori (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(100) NOT NULL UNIQUE,
                    ruolo ENUM('portiere', 'attaccante') NOT NULL,
                    elo INT DEFAULT 1500,
                    partite INT DEFAULT 0,
                    vittorie INT DEFAULT 0,
                    sconfitte INT DEFAULT 0,
                    creato TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    aggiornato TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    
                    INDEX idx_nome (nome),
                    INDEX idx_elo (elo),
                    INDEX idx_ruolo (ruolo),
                    INDEX idx_partite (partite)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;
            
            await this.connection.execute(createGiocatoriTable);

            // Tabella partite
            const createPartiteTable = `
                CREATE TABLE IF NOT EXISTS partite (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    squadra1 JSON NOT NULL,
                    squadra2 JSON NOT NULL,
                    vincitore TINYINT NOT NULL CHECK (vincitore IN (1, 2)),
                    data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    
                    INDEX idx_data (data),
                    INDEX idx_vincitore (vincitore)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;
            
            await this.connection.execute(createPartiteTable);

            logger.info('✅ Tabelle create/verificate');
        } catch (error) {
            logger.error('❌ Errore creazione tabelle:', error);
            throw error;
        }
    }

    async insertSampleData() {
        try {
            // Controlla se ci sono già giocatori
            const [rows] = await this.connection.execute('SELECT COUNT(*) as count FROM giocatori');
            const count = rows[0].count;
            
            if (count === 0) {
                const samplePlayers = [
                    ['Mario', 'portiere'],
                    ['Luigi', 'attaccante'],
                    ['Paolo', 'portiere'],
                    ['Marco', 'attaccante'],
                    ['Giovanni', 'portiere'],
                    ['Luca', 'attaccante']
                ];

                for (const [nome, ruolo] of samplePlayers) {
                    await this.connection.execute(
                        'INSERT INTO giocatori (nome, ruolo) VALUES (?, ?)',
                        [nome, ruolo]
                    );
                }
                
                logger.info(`✅ Inseriti ${samplePlayers.length} giocatori di esempio`);
            }
        } catch (error) {
            logger.error('❌ Errore inserimento dati di esempio:', error);
            // Non critico, l'app può funzionare senza dati di esempio
        }
    }

    async getGiocatori() {
        try {
            const [rows] = await this.connection.execute(`
                SELECT 
                    id, nome, ruolo, elo, partite, vittorie, sconfitte, creato
                FROM giocatori
                ORDER BY elo DESC, nome ASC
            `);
            
            return rows.map(row => ({
                id: row.id,
                nome: row.nome,
                ruolo: row.ruolo,
                elo: row.elo,
                partite: row.partite,
                vittorie: row.vittorie,
                sconfitte: row.sconfitte,
                creato: row.creato
            }));
        } catch (error) {
            logger.error('❌ Errore recupero giocatori:', error);
            throw error;
        }
    }

    async createGiocatore(nome, ruolo) {
        try {
            // Controlla se il giocatore esiste già
            const [existing] = await this.connection.execute(
                'SELECT id FROM giocatori WHERE LOWER(nome) = LOWER(?)',
                [nome]
            );
            
            if (existing.length > 0) {
                throw new Error('Giocatore già esistente');
            }
            
            const [result] = await this.connection.execute(
                'INSERT INTO giocatori (nome, ruolo, elo, partite, vittorie, sconfitte) VALUES (?, ?, 1500, 0, 0, 0)',
                [nome, ruolo]
            );
            
            return {
                id: result.insertId,
                nome,
                ruolo,
                elo: 1500,
                partite: 0,
                vittorie: 0,
                sconfitte: 0
            };
        } catch (error) {
            logger.error('❌ Errore creazione giocatore:', error);
            throw error;
        }
    }

    async getPartite() {
        try {
            const [rows] = await this.connection.execute(`
                SELECT 
                    id, squadra1, squadra2, vincitore, data
                FROM partite
                ORDER BY data DESC
            `);
            
            const partite = [];
            
            for (const row of rows) {
                const squadra1 = JSON.parse(row.squadra1);
                const squadra2 = JSON.parse(row.squadra2);
                
                // Recupera nomi giocatori
                const nomiGiocatori = await this.getNomiGiocatori([
                    squadra1[0], squadra1[1], squadra2[0], squadra2[1]
                ]);
                
                partite.push({
                    id: row.id,
                    squadra1,
                    squadra2,
                    vincitore: row.vincitore,
                    data: row.data,
                    nomi_giocatori: {
                        squadra1_portiere: nomiGiocatori[squadra1[0]],
                        squadra1_attaccante: nomiGiocatori[squadra1[1]],
                        squadra2_portiere: nomiGiocatori[squadra2[0]],
                        squadra2_attaccante: nomiGiocatori[squadra2[1]]
                    }
                });
            }
            
            return partite;
        } catch (error) {
            logger.error('❌ Errore recupero partite:', error);
            throw error;
        }
    }

    async getNomiGiocatori(ids) {
        try {
            const placeholders = ids.map(() => '?').join(',');
            const [rows] = await this.connection.execute(
                `SELECT id, nome FROM giocatori WHERE id IN (${placeholders})`,
                ids
            );
            
            const nomiMap = {};
            rows.forEach(row => {
                nomiMap[row.id] = row.nome;
            });
            
            return nomiMap;
        } catch (error) {
            logger.error('❌ Errore recupero nomi giocatori:', error);
            throw error;
        }
    }

    async createPartita(squadra1, squadra2, vincitore) {
        const connection = await mysql.createConnection(this.config);
        
        try {
            await connection.beginTransaction();
            
            // Validazione giocatori
            const tuttiGiocatori = [...squadra1, ...squadra2];
            const placeholders = tuttiGiocatori.map(() => '?').join(',');
            const [giocatori] = await connection.execute(
                `SELECT id, elo FROM giocatori WHERE id IN (${placeholders})`,
                tuttiGiocatori
            );
            
            if (giocatori.length !== 4) {
                throw new Error('Uno o più giocatori non esistono');
            }
            
            // Crea mappa ELO
            const eloMap = {};
            giocatori.forEach(g => {
                eloMap[g.id] = g.elo;
            });
            
            // Calcola ELO medio per squadra
            const eloSquadra1 = (eloMap[squadra1[0]] + eloMap[squadra1[1]]) / 2;
            const eloSquadra2 = (eloMap[squadra2[0]] + eloMap[squadra2[1]]) / 2;
            
            // Calcola nuovi ELO
            const k = 32; // Fattore K
            const risultato1 = vincitore === 1 ? 1 : 0;
            const risultato2 = vincitore === 2 ? 1 : 0;
            
            const nuoviEloSquadra1 = this.calcolaELO(eloSquadra1, eloSquadra2, risultato1, k);
            const nuoviEloSquadra2 = this.calcolaELO(eloSquadra2, eloSquadra1, risultato2, k);
            
            const deltaElo1 = nuoviEloSquadra1 - eloSquadra1;
            const deltaElo2 = nuoviEloSquadra2 - eloSquadra2;
            
            // Aggiorna ELO e statistiche giocatori
            for (const giocatoreId of squadra1) {
                const nuovoElo = eloMap[giocatoreId] + deltaElo1;
                const isVincitore = vincitore === 1 ? 1 : 0;
                
                await connection.execute(`
                    UPDATE giocatori 
                    SET elo = ?, 
                        partite = partite + 1,
                        vittorie = vittorie + ?,
                        sconfitte = sconfitte + ?
                    WHERE id = ?
                `, [nuovoElo, isVincitore, 1 - isVincitore, giocatoreId]);
            }
            
            for (const giocatoreId of squadra2) {
                const nuovoElo = eloMap[giocatoreId] + deltaElo2;
                const isVincitore = vincitore === 2 ? 1 : 0;
                
                await connection.execute(`
                    UPDATE giocatori 
                    SET elo = ?, 
                        partite = partite + 1,
                        vittorie = vittorie + ?,
                        sconfitte = sconfitte + ?
                    WHERE id = ?
                `, [nuovoElo, isVincitore, 1 - isVincitore, giocatoreId]);
            }
            
            // Inserisci partita
            const [result] = await connection.execute(
                'INSERT INTO partite (squadra1, squadra2, vincitore, data) VALUES (?, ?, ?, NOW())',
                [JSON.stringify(squadra1), JSON.stringify(squadra2), vincitore]
            );
            
            await connection.commit();
            
            return {
                id: result.insertId,
                squadra1,
                squadra2,
                vincitore,
                elo_changes: {
                    squadra1_delta: deltaElo1,
                    squadra2_delta: deltaElo2
                }
            };
            
        } catch (error) {
            await connection.rollback();
            logger.error('❌ Errore creazione partita:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    calcolaELO(eloA, eloB, risultato, k = 32) {
        const atteso = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
        return Math.round(eloA + k * (risultato - atteso));
    }

    async checkHealth() {
        try {
            const [versionResult] = await this.connection.execute('SELECT VERSION() as version');
            const [giocatoriCount] = await this.connection.execute('SELECT COUNT(*) as count FROM giocatori');
            const [partiteCount] = await this.connection.execute('SELECT COUNT(*) as count FROM partite');
            
            return {
                connected: true,
                mysql_version: versionResult[0].version,
                giocatori_count: giocatoriCount[0].count,
                partite_count: partiteCount[0].count
            };
        } catch (error) {
            logger.error('❌ Health check failed:', error);
            return {
                connected: false,
                error: error.message
            };
        }
    }

    async exportData() {
        try {
            const giocatori = await this.getGiocatori();
            const partite = await this.getPartite();
            
            return {
                metadata: {
                    esportato: new Date().toISOString(),
                    versione: '2.0',
                    totale_giocatori: giocatori.length,
                    totale_partite: partite.length
                },
                giocatori,
                partite
            };
        } catch (error) {
            logger.error('❌ Errore export dati:', error);
            throw error;
        }
    }

    async resetDatabase() {
        try {
            // Solo in ambiente di sviluppo
            if (process.env.NODE_ENV === 'production') {
                throw new Error('Reset database non consentito in produzione');
            }
            
            await this.connection.execute('SET FOREIGN_KEY_CHECKS = 0');
            await this.connection.execute('TRUNCATE TABLE partite');
            await this.connection.execute('TRUNCATE TABLE giocatori');
            await this.connection.execute('SET FOREIGN_KEY_CHECKS = 1');
            
            // Reinserisce dati di esempio
            await this.insertSampleData();
            
            logger.info('✅ Database resettato');
            return true;
        } catch (error) {
            logger.error('❌ Errore reset database:', error);
            throw error;
        }
    }

    async close() {
        try {
            if (this.connection) {
                await this.connection.end();
                logger.info('✅ Database connection chiusa');
            }
        } catch (error) {
            logger.error('❌ Errore chiusura database:', error);
        }
    }
}

module.exports = Database;