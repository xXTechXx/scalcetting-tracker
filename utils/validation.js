/**
 * Valida i campi obbligatori nell'input
 * @param {Object} data - Dati input
 * @param {Array} requiredFields - Campi obbligatori
 * @returns {boolean} true se validi
 */
function validateInput(data, requiredFields = []) {
    for (const field of requiredFields) {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
            return false;
        }
    }
    return true;
}

/**
 * Sanifica una stringa per prevenire XSS
 * @param {string} str - Stringa da sanificare
 * @returns {string} stringa sanificata
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    
    return str
        .trim()
        .replace(/[<>]/g, '') // Rimuove < e >
        .replace(/['"]/g, '') // Rimuove virgolette
        .replace(/\s+/g, ' ') // Normalizza spazi
        .substring(0, 100); // Limita lunghezza
}

/**
 * Valida un ID numerico
 * @param {*} id - ID da validare
 * @returns {boolean} true se valido
 */
function validateId(id) {
    const numId = parseInt(id);
    return !isNaN(numId) && numId > 0 && numId <= 999999;
}

/**
 * Valida un ruolo giocatore
 * @param {string} ruolo - Ruolo da validare
 * @returns {boolean} true se valido
 */
function validateRuolo(ruolo) {
    return ['portiere', 'attaccante'].includes(ruolo);
}

/**
 * Valida formato email
 * @param {string} email - Email da validare
 * @returns {boolean} true se valida
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Valida range ELO
 * @param {number} elo - ELO da validare
 * @returns {boolean} true se valido
 */
function validateElo(elo) {
    const numElo = parseInt(elo);
    return !isNaN(numElo) && numElo >= 100 && numElo <= 3000;
}

/**
 * Valida data
 * @param {string} date - Data da validare
 * @returns {boolean} true se valida
 */
function validateDate(date) {
    const dateObj = new Date(date);
    return dateObj instanceof Date && !isNaN(dateObj.getTime());
}

/**
 * Valida vincitore partita
 * @param {*} vincitore - Vincitore da validare
 * @returns {boolean} true se valido
 */
function validateVincitore(vincitore) {
    const numVincitore = parseInt(vincitore);
    return [1, 2].includes(numVincitore);
}

/**
 * Valida struttura squadra
 * @param {*} squadra - Squadra da validare
 * @returns {boolean} true se valida
 */
function validateSquadra(squadra) {
    return Array.isArray(squadra) && 
           squadra.length === 2 && 
           squadra.every(id => validateId(id));
}

/**
 * Valida limite per paginazione
 * @param {*} limit - Limite da validare
 * @returns {number} limite validato
 */
function validateLimit(limit) {
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit <= 0) return 20;
    return Math.min(numLimit, 100); // Max 100 per protezione
}

/**
 * Valida offset per paginazione
 * @param {*} offset - Offset da validare
 * @returns {number} offset validato
 */
function validateOffset(offset) {
    const numOffset = parseInt(offset);
    if (isNaN(numOffset) || numOffset < 0) return 0;
    return numOffset;
}

/**
 * Valida parametri di ordinamento
 * @param {string} orderBy - Campo per ordinamento
 * @param {string} orderDir - Direzione ordinamento
 * @returns {Object} parametri validati
 */
function validateOrdering(orderBy, orderDir) {
    const validFields = ['nome', 'elo', 'partite', 'vittorie', 'data'];
    const validDirections = ['ASC', 'DESC'];
    
    return {
        orderBy: validFields.includes(orderBy) ? orderBy : 'elo',
        orderDir: validDirections.includes(orderDir?.toUpperCase()) ? orderDir.toUpperCase() : 'DESC'
    };
}

/**
 * Valida range di date
 * @param {string} startDate - Data inizio
 * @param {string} endDate - Data fine
 * @returns {Object} range validato
 */
function validateDateRange(startDate, endDate) {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    // Verifica validità date
    if (start && isNaN(start.getTime())) return { start: null, end: null };
    if (end && isNaN(end.getTime())) return { start: null, end: null };
    
    // Verifica che start sia prima di end
    if (start && end && start > end) {
        return { start: end, end: start }; // Scambia le date
    }
    
    return { start, end };
}

/**
 * Valida file upload
 * @param {Object} file - File da validare
 * @returns {boolean} true se valido
 */
function validateFile(file) {
    if (!file) return false;
    
    const allowedTypes = ['application/json', 'text/csv'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    return allowedTypes.includes(file.mimetype) && file.size <= maxSize;
}

/**
 * Escape SQL per prevenire SQL injection
 * @param {string} str - Stringa da escapare
 * @returns {string} stringa escapata
 */
function escapeSql(str) {
    if (typeof str !== 'string') return str;
    
    return str
        .replace(/'/g, "''")
        .replace(/;/g, '')
        .replace(/--/g, '')
        .replace(/\/\*/g, '')
        .replace(/\*\//g, '');
}

/**
 * Valida parametri query generici
 * @param {Object} query - Query parameters
 * @returns {Object} parametri validati
 */
function validateQuery(query) {
    const validated = {};
    
    // Limit e offset per paginazione
    if (query.limit) validated.limit = validateLimit(query.limit);
    if (query.offset) validated.offset = validateOffset(query.offset);
    
    // Ordinamento
    if (query.orderBy || query.orderDir) {
        const ordering = validateOrdering(query.orderBy, query.orderDir);
        validated.orderBy = ordering.orderBy;
        validated.orderDir = ordering.orderDir;
    }
    
    // Filtri
    if (query.ruolo && validateRuolo(query.ruolo)) {
        validated.ruolo = query.ruolo;
    }
    
    // Range date
    if (query.startDate || query.endDate) {
        const dateRange = validateDateRange(query.startDate, query.endDate);
        validated.startDate = dateRange.start;
        validated.endDate = dateRange.end;
    }
    
    // Search term
    if (query.search && typeof query.search === 'string') {
        validated.search = sanitizeString(query.search);
    }
    
    return validated;
}

module.exports = {
    validateInput,
    sanitizeString,
    validateId,
    validateRuolo,
    validateEmail,
    validateElo,
    validateDate,
    validateVincitore,
    validateSquadra,
    validateLimit,
    validateOffset,
    validateOrdering,
    validateDateRange,
    validateFile,
    escapeSql,
    validateQuery
};