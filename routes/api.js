const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validateInput, sanitizeString, validateId } = require('../utils/validation');

// Middleware per logging delle richieste API
router.use((req, res, next) => {
    logger.info(`API Request: ${req.method} ${req.path}`, {
        body: req.body,
        query: req.query,
        ip: req.ip
    });
    next();
});

// GET /api/giocatori - Recupera tutti i giocatori
router.get('/giocatori', async (req, res) => {
    try {
        const giocatori = await req.db.getGiocatori();
        res.json(giocatori);
    } catch (error) {
        logger.error('Errore API /giocatori:', error);
        res.status(500).json({
            error: 'Errore recupero giocatori',
            message: error.message
        });
    }
});

// POST /api/giocatori - Crea nuovo giocatore
router.post('/giocatori', async (req, res) => {
    try {
        const { nome, ruolo } = req.body;
        
        // Validazione input
        if (!validateInput(req.body, ['nome', 'ruolo'])) {
            return res.status(400).json({
                error: 'Dati mancanti',
                message: 'Nome e ruolo sono obbligatori'
            });
        }
        
        const nomeSanitized = sanitizeString(nome);
        
        if (nomeSanitized.length < 2) {
            return res.status(400).json({
                error: 'Nome troppo corto',
                message: 'Il nome deve essere di almeno 2 caratteri'
            });
        }
        
        if (!['portiere', 'attaccante'].includes(ruolo)) {
            return res.status(400).json({
                error: 'Ruolo non valido',
                message: 'Il ruolo deve essere "portiere" o "attaccante"'
            });
        }
        
        const giocatore = await req.db.createGiocatore(nomeSanitized, ruolo);
        
        logger.info(`Giocatore creato: ${giocatore.nome} (${giocatore.ruolo})`);
        
        res.status(201).json({
            ...giocatore,
            message: 'Giocatore creato con successo'
        });
        
    } catch (error) {
        logger.error('Errore API POST /giocatori:', error);
        
        if (error.message === 'Giocatore già esistente') {
            return res.status(409).json({
                error: 'Giocatore già esistente',
                message: 'Esiste già un giocatore con questo nome'
            });
        }
        
        res.status(500).json({
            error: 'Errore creazione giocatore',
            message: error.message
        });
    }
});

// GET /api/partite - Recupera tutte le partite
router.get('/partite', async (req, res) => {
    try {
        const partite = await req.db.getPartite();
        res.json(partite);
    } catch (error) {
        logger.error('Errore API /partite:', error);
        res.status(500).json({
            error: 'Errore recupero partite',
            message: error.message
        });
    }
});

// POST /api/partite - Crea nuova partita
router.post('/partite', async (req, res) => {
    try {
        const { squadra1, squadra2, vincitore } = req.body;
        
        // Validazione input
        if (!validateInput(req.body, ['squadra1', 'squadra2', 'vincitore'])) {
            return res.status(400).json({
                error: 'Dati mancanti',
                message: 'Squadra1, squadra2 e vincitore sono obbligatori'
            });
        }
        
        // Validazione struttura squadre
        if (!Array.isArray(squadra1) || squadra1.length !== 2 || 
            !Array.isArray(squadra2) || squadra2.length !== 2) {
            return res.status(400).json({
                error: 'Formato squadre non valido',
                message: 'Ogni squadra deve avere esattamente 2 giocatori'
            });
        }
        
        // Validazione vincitore
        if (![1, 2].includes(parseInt(vincitore))) {
            return res.status(400).json({
                error: 'Vincitore non valido',
                message: 'Il vincitore deve essere 1 o 2'
            });
        }
        
        // Validazione IDs giocatori
        const tuttiGiocatori = [...squadra1, ...squadra2];
        for (const id of tuttiGiocatori) {
            if (!validateId(id)) {
                return res.status(400).json({
                    error: 'ID giocatore non valido',
                    message: `ID ${id} non è valido`
                });
            }
        }
        
        // Controllo giocatori duplicati
        if (new Set(tuttiGiocatori).size !== 4) {
            return res.status(400).json({
                error: 'Giocatori duplicati',
                message: 'Ogni giocatore può essere selezionato solo una volta'
            });
        }
        
        const partita = await req.db.createPartita(squadra1, squadra2, parseInt(vincitore));
        
        logger.info(`Partita creata: Squadra1 ${squadra1} vs Squadra2 ${squadra2}, vincitore: ${vincitore}`);
        
        res.status(201).json({
            ...partita,
            message: 'Partita creata con successo'
        });
        
    } catch (error) {
        logger.error('Errore API POST /partite:', error);
        res.status(500).json({
            error: 'Errore creazione partita',
            message: error.message
        });
    }
});

// GET /api/statistics - Recupera statistiche
router.get('/statistics', async (req, res) => {
    try {
        const giocatori = await req.db.getGiocatori();
        const partite = await req.db.getPartite();
        
        const stats = {
            totale_giocatori: giocatori.length,
            totale_partite: partite.length,
            portieri: giocatori.filter(g => g.ruolo === 'portiere').length,
            attaccanti: giocatori.filter(g => g.ruolo === 'attaccante').length,
            elo_medio: giocatori.length > 0 ? 
                Math.round(giocatori.reduce((sum, g) => sum + g.elo, 0) / giocatori.length) : 0,
            migliore_giocatore: giocatori.length > 0 ? 
                giocatori.reduce((max, g) => g.elo > max.elo ? g : max) : null,
            giocatori_con_partite: giocatori.filter(g => g.partite > 0).length
        };
        
        res.json(stats);
    } catch (error) {
        logger.error('Errore API /statistics:', error);
        res.status(500).json({
            error: 'Errore recupero statistiche',
            message: error.message
        });
    }
});

// GET /api/export - Esporta tutti i dati
router.get('/export', async (req, res) => {
    try {
        const data = await req.db.exportData();
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="scalcetting_export.json"');
        res.json(data);
        
    } catch (error) {
        logger.error('Errore API /export:', error);
        res.status(500).json({
            error: 'Errore export dati',
            message: error.message
        });
    }
});

// GET /api/export/csv/:type - Esporta CSV
router.get('/export/csv/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const timestamp = new Date().toISOString().slice(0, 10);
        
        let csv = '';
        let filename = '';
        
        switch (type) {
            case 'giocatori':
                const giocatori = await req.db.getGiocatori();
                csv = 'Nome,Ruolo,ELO,Partite,Vittorie,Sconfitte,WinRate\n';
                csv += giocatori.map(g => {
                    const winRate = g.partite > 0 ? ((g.vittorie / g.partite) * 100).toFixed(1) : '0.0';
                    return `"${g.nome}","${g.ruolo}",${g.elo},${g.partite},${g.vittorie},${g.sconfitte},"${winRate}%"`;
                }).join('\n');
                filename = `giocatori_${timestamp}.csv`;
                break;
                
            case 'partite':
                const partite = await req.db.getPartite();
                csv = 'Data,Squadra1_Portiere,Squadra1_Attaccante,Squadra2_Portiere,Squadra2_Attaccante,Vincitore\n';
                csv += partite.map(p => {
                    const data = new Date(p.data).toLocaleDateString('it-IT');
                    const vincitore = p.vincitore === 1 ? 'Squadra1' : 'Squadra2';
                    return `"${data}","${p.nomi_giocatori.squadra1_portiere}","${p.nomi_giocatori.squadra1_attaccante}","${p.nomi_giocatori.squadra2_portiere}","${p.nomi_giocatori.squadra2_attaccante}","${vincitore}"`;
                }).join('\n');
                filename = `partite_${timestamp}.csv`;
                break;
                
            case 'classifica':
                const classificaGiocatori = await req.db.getGiocatori();
                csv = 'Posizione,Nome,Ruolo,ELO,Partite,Vittorie,Sconfitte,WinRate\n';
                csv += classificaGiocatori.map((g, index) => {
                    const winRate = g.partite > 0 ? ((g.vittorie / g.partite) * 100).toFixed(1) : '0.0';
                    return `${index + 1},"${g.nome}","${g.ruolo}",${g.elo},${g.partite},${g.vittorie},${g.sconfitte},"${winRate}%"`;
                }).join('\n');
                filename = `classifica_${timestamp}.csv`;
                break;
                
            default:
                return res.status(400).json({
                    error: 'Tipo export non valido',
                    message: 'Tipi supportati: giocatori, partite, classifica'
                });
        }
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
        
    } catch (error) {
        logger.error('Errore API /export/csv:', error);
        res.status(500).json({
            error: 'Errore export CSV',
            message: error.message
        });
    }
});

// POST /api/reset - Reset database (solo sviluppo)
router.post('/reset', async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                error: 'Operazione non consentita',
                message: 'Reset non disponibile in produzione'
            });
        }
        
        await req.db.resetDatabase();
        
        logger.info('Database resettato');
        
        res.json({
            success: true,
            message: 'Database resettato con successo'
        });
        
    } catch (error) {
        logger.error('Errore API /reset:', error);
        res.status(500).json({
            error: 'Errore reset database',
            message: error.message
        });
    }
});

// Middleware per gestire errori non catturati nelle routes
router.use((err, req, res, next) => {
    logger.error('Errore non catturato nelle API routes:', err);
    res.status(500).json({
        error: 'Errore interno del server',
        message: 'Si è verificato un errore imprevisto'
    });
});

module.exports = router;