// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const WORKER_URL = 'https://noisy-voice-0c5b.mohammedmila022.workers.dev';


// ═══════════════════════════════════════════════════
// CLIENT SECRET & NONCE (v4.0 worker)
// ═══════════════════════════════════════════════════
function ensureClientSecret() {
    let cs = localStorage.getItem('merchClientSecret');
    if (!cs) {
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        cs = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('merchClientSecret', cs);
    }
    return cs;
}
function generateNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
const CLIENT_SECRET = ensureClientSecret();

// ═══════════════════════════════════════════════════
// CLIENT SESSION STATE (NEW)
// ═══════════════════════════════════════════════════
let SESSION_TOKEN = null; // In-memory only, never stored in localStorage

// ═══════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════
function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            if (inQuotes && row[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function extractBsrNumber(bsrString) {
    if (!bsrString) return 99999999;
    const m = bsrString.replace(/,/g, '').match(/\d+/);
    return m ? parseInt(m[0]) : 99999999;
}

function cleanBsrDisplay(bsrString) {
    if (!bsrString) return 'N/A';
    return bsrString.replace(/ in Clothing, Shoes & Jewelry/gi, '').replace(/ in .+$/i, '').trim();
}

function parseDateFromString(dateString) {
    if (!dateString) return null;
    const c = dateString.replace(/^:\s*/, '').replace(/\u200e/g, '').trim();
    const dt = new Date(c);
    return isNaN(dt) ? null : dt;
}

function formatDate(date) {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════
// STOP WORDS & STEMMING
// ═══════════════════════════════════════════════════
const STOP_WORDS = new Set(['a','an','the','and','or','but','for','of','with','without','by','to','in','on','at','from','up','down','is','are','was','were','be','been','being','have','has','had','do','does','did','so','if','then','when','where','which','while','who','whom','this','that','these','those','no','not','just','very','too','than','over','more','out','as','its','it','i','my','your','our','their','his','her','we','they','me','him','us','them','what','how','all','any','each','few','some','such','into','about','after','before','between','during','off','shirt','shirts','tshirt','tshirts','tee','tees','tank','top','tops','hoodie','hoodies','pullover','sweatshirt','crewneck','vneck','sleeve','sleeves','short','long','graphic','design','printed','print','men','women','man','woman','male','female','boy','girl','boys','girls','kids','adult','adults','unisex','youth','toddler','infant','baby','clothing','wear','apparel','fashion','style','outfit','product','item','merchandise','merch','gift','gifts','present','presents','idea','ideas','great','perfect','best','good','nice','beautiful','pretty','funny','cool','cute','awesome','amazing','unique','original','vintage','retro','classic','new','old','modern','trendy','brand','made','quality','premium','official','licensed','100','cotton','polyester','blend','machine','wash','dry','lightweight','comfortable','comfort','soft','casual','fit','fitted','novelty','humor','humorous','sarcastic','sarcasm','quote','saying','slogan','text','word','words','team','group','crew','squad','club','family','member','members','love','lover','lovers','fan','fans','enthusiast','enthusiasts','life','lifestyle','living','co','inc','llc','ltd','us','uk','ca','usa','america','side','see','soon','day','days','year','years','time']);

function stem(w) {
    if (!w || w.length < 4) return w;
    w = w.replace(/ies$/, 'y').replace(/([^aeiou])s$/, '$1').replace(/ing$/, '').replace(/edly$/, '').replace(/ed$/, '').replace(/er$/, '');
    return w.length >= 2 ? w : w + 'e';
}

function cleanTokens(t) {
    if (!t) return [];
    return t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length >= 2 && !/^\d+$/.test(w) && !STOP_WORDS.has(w) && !STOP_WORDS.has(stem(w))).map(w => stem(w));
}

// ═══════════════════════════════════════════════════
// KEYWORD MATCHING
// ═══════════════════════════════════════════════════
function keywordMatchNormal(p, kw) {
    if (!kw?.trim()) return true;
    const tokens = kw.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').split(' ').filter(t => t);
    if (!tokens.length) return true;
    const txt = [p.designTitle, p.brand, p.featureBullet1, p.featureBullet2].join(' ').toLowerCase().replace(/[^\w\s]/g, ' ');
    return tokens.every(t => txt.includes(t));
}

function keywordMatchExact(p, kw) {
    if (!kw?.trim()) return true;
    const n = kw.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return true;
    const h = [p.designTitle, p.brand, p.featureBullet1, p.featureBullet2].join(' ').toLowerCase().replace(/[^\w\s]/g, ' ');
    return new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(h);
}

function keywordMatch(p, kw) {
    return (document.getElementById('searchMode')?.value === 'exact') ? keywordMatchExact(p, kw) : keywordMatchNormal(p, kw);
}

// ═══════════════════════════════════════════════════
// LONG-TAIL EXTRACTION
// ═══════════════════════════════════════════════════
function extractLongTailByLength(title, n) {
    if (!title || n < 2) return [];
    const t = cleanTokens(title);
    if (t.length < n) return [];
    const s = new Set();
    for (let i = 0; i <= t.length - n; i++) {
        s.add(t.slice(i, i + n).join(' '));
    }
    return [...s];
}

// ═══════════════════════════════════════════════════
// HOT NICHES CALCULATION
// ═══════════════════════════════════════════════════
function calculateHotNiches(wl, pd, mr) {
    let prods = allProducts;
    if (pd > 0) {
        const cut = new Date();
        cut.setDate(cut.getDate() - pd);
        prods = prods.filter(p => p.parsedDate && p.parsedDate >= cut);
    }
    const freq = new Map(), bsrM = new Map(), titleM = new Map();
    prods.forEach(p => {
        const ph = extractLongTailByLength(p.designTitle, wl);
        const seen = new Set();
        ph.forEach(x => {
            if (seen.has(x)) return;
            seen.add(x);
            freq.set(x, (freq.get(x) || 0) + 1);
            if (!bsrM.has(x)) bsrM.set(x, []);
            bsrM.get(x).push(p.bsrNumber);
            if (!titleM.has(x)) titleM.set(x, p.designTitle);
        });
    });
    return [...freq.entries()].map(([kw, count]) => {
        const b = bsrM.get(kw) || [];
        return {
            keyword: kw,
            count,
            avgBSR: Math.round(b.reduce((a, x) => a + x, 0) / b.length),
            minBSR: Math.min(...b),
            exampleTitle: titleM.get(kw) || ''
        };
    }).filter(n => n.count >= mr).sort((a, b) => b.count - a.count || a.avgBSR - b.avgBSR).slice(0, 50);
}

// ═══════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════
const rateLimiter = {
    attempts: {},
    check(key, maxAttempts = 5, windowMs = 60000) {
        const now = Date.now();
        if (!this.attempts[key]) this.attempts[key] = [];
        this.attempts[key] = this.attempts[key].filter(t => now - t < windowMs);
        if (this.attempts[key].length >= maxAttempts) return false;
        this.attempts[key].push(now);
        return true;
    },
    cleanup() {
        const now = Date.now();
        for (const key in this.attempts) {
            this.attempts[key] = this.attempts[key].filter(t => now - t < 60000);
            if (this.attempts[key].length === 0) delete this.attempts[key];
        }
    }
};
setInterval(() => rateLimiter.cleanup(), 300000);

// ═══════════════════════════════════════════════════
// DEVICE FINGERPRINT
// ═══════════════════════════════════════════════════
function generateSimpleFingerprint() {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset()
    ].join('|');
    
    let hash = 0;
    for (let i = 0; i < components.length; i++) {
        hash = ((hash << 5) - hash) + components.charCodeAt(i);
        hash = hash & hash;
    }
    return 'fp_' + Math.abs(hash).toString(36);
}

// ═══════════════════════════════════════════════════
// SESSION STATE VARIABLES
// ═══════════════════════════════════════════════════
let currentAccessCode = null;
let accessData = null;
let sessionId = null;
let periodicCheckInterval = null;
const simpleFingerprint = generateSimpleFingerprint();

// ═══════════════════════════════════════════════════
// WORKER API (UPDATED)
// ═══════════════════════════════════════════════════
async function callWorker(endpoint, method = 'GET', body = null) {
    try {
        const headers = { 
            'Content-Type': 'application/json'
        };
        
        // Protected endpoints need Session Token
        const protectedEndpoints = ['/fetchProducts', '/fetchAccessCodes'];
        const isProtected = protectedEndpoints.some(ep => endpoint.includes(ep));
        
        if (isProtected && SESSION_TOKEN) {
            headers['X-Session-Token'] = SESSION_TOKEN;
        }
        
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(`${WORKER_URL}${endpoint}`, options);
        
        // Handle 401 - token expired
        if (response.status === 401) {
            const refreshed = await refreshSessionToken();
            if (refreshed) {
                headers['X-Session-Token'] = SESSION_TOKEN;
                const retryOptions = { method, headers };
                if (body) retryOptions.body = JSON.stringify(body);
                const retryResponse = await fetch(`${WORKER_URL}${endpoint}`, retryOptions);
                return await retryResponse.json();
            } else {
                return { success: false, message: 'Session expired' };
            }
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Worker call failed: ${endpoint}`, error);
        return { success: false, message: 'Connection error' };
    }
}

async function refreshSessionToken() {
    try {
        const response = await fetch(`${WORKER_URL}/sessionRefreshToken`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: sessionId,
                code: currentAccessCode,
                ua: navigator.userAgent,
                clientSecret: CLIENT_SECRET
            })
        });
        const result = await response.json();
        if (result.success && result.sessionToken) {
            SESSION_TOKEN = result.sessionToken;
            return true;
        }
        return false;
    } catch (e) {
        console.error('Token refresh failed:', e);
        return false;
    }
}

async function validateAccessCode(code) {
    const result = await callWorker('/validateCode', 'POST', { code: String(code).toUpperCase() });
    if (!result.success) return null;
    return {
        code: String(code).toUpperCase(),
        expiryDate: result.expiryDate,
        status: result.status,
        valid: result.valid
    };
}

async function fetchProductsFromWorker() {
    const result = await callWorker('/fetchProducts', 'GET');
    if (!result.success || !result.data) {
        throw new Error('Failed to fetch products');
    }
    
    const lines = result.data.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('Empty data');
    
    return lines.slice(1).map(l => {
        const c = parseCSVRow(l);
        if (c.length < 5) return null;
        return {
            asin: c[0] || '',
            link: c[1] || '#',
            bsrRaw: c[2] || '',
            bsrNumber: extractBsrNumber(c[2]),
            bsrDisplay: cleanBsrDisplay(c[2]),
            imageUrl: c[3] || 'https://via.placeholder.com/300?text=No+Image',
            dateAddedRaw: c[4] || '',
            parsedDate: parseDateFromString(c[4]),
            designTitle: c[5] || '',
            brand: c[6] || '',
            featureBullet1: c[7] || '',
            featureBullet2: c[8] || ''
        };
    }).filter(Boolean);
}

// ═══════════════════════════════════════════════════
// SESSION TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════
async function generateSessionToken() {
    return await refreshSessionToken() ? SESSION_TOKEN : null;
}

// ═══════════════════════════════════════════════════
// SESSION STORAGE (NO SESSION TOKEN)
// ═══════════════════════════════════════════════════
function saveLocalSession(code, expiryDate, sid) {
    localStorage.setItem('merchSession', JSON.stringify({
        code, expiryDate, sessionId: sid,
        savedAt: new Date().toISOString()
    }));
}

function clearSession() {
    localStorage.removeItem('merchSession');
    stopPeriodicCheck();
    currentAccessCode = null;
    accessData = null;
    sessionId = null;
    SESSION_TOKEN = null;
}

async function loadSession() {
    const saved = localStorage.getItem('merchSession');
    if (!saved) return false;
    try {
        const session = JSON.parse(saved);
        if (!session.sessionId || !session.code) return false;
        if (!session.expiryDate || new Date(session.expiryDate) < new Date()) {
            clearSession(); return false;
        }
        const ua = navigator.userAgent;
        const entry = await validateAccessCode(session.code);
        if (!entry || !entry.valid) { clearSession(); return false; }
        // Server-side session check
        const touch = await callWorker('/sessionTouch', 'POST', {
    sessionId: session.sessionId,
    code: session.code,
    ua,
    clientSecret: CLIENT_SECRET
});
        if (!touch.success) { clearSession(); return false; }
        currentAccessCode = session.code.toUpperCase();
        accessData = { code: session.code, expiryDate: entry.expiryDate };
        sessionId = session.sessionId;
        // Generate new token on load
        SESSION_TOKEN = await generateSessionToken(currentAccessCode);
        saveLocalSession(currentAccessCode, entry.expiryDate, session.sessionId);
        return true;
    } catch (e) {
        console.error('loadSession error:', e);
        clearSession();
        return false;
    }
}

// ═══════════════════════════════════════════════════
// ACCESS CONTROL
// ═══════════════════════════════════════════════════
function showError(message) {
    const errorMsg = document.getElementById('errorMsg');
    const errorText = document.getElementById('errorText');
    errorText.textContent = message;
    errorMsg.classList.add('show');
    document.getElementById('successMsg').classList.remove('show');
    
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = false;
    document.getElementById('btnText').style.display = 'inline';
    document.getElementById('loadingSpinner').style.display = 'none';
}

async function verifyAccessCode() {
    const codeInput = document.getElementById('accessCode');
    const loginBtn = document.getElementById('loginBtn');
    const btnText = document.getElementById('btnText');
    const spinner = document.getElementById('loadingSpinner');

    const code = codeInput.value.trim().toUpperCase();
    if (!code) { showError('Please enter an access code'); return; }

    if (!rateLimiter.check('login_' + simpleFingerprint, 5, 60000)) {
        showError('Too many attempts. Please wait a minute.');
        return;
    }

    loginBtn.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'block';
    document.getElementById('errorMsg').classList.remove('show');
    document.getElementById('successMsg').classList.remove('show');

    try {
        const ua = navigator.userAgent;

        const entry = await validateAccessCode(code);
        if (!entry) { showError('Connection error. Please try again.'); return; }
        if (!entry.valid) {
            if (entry.status === 'revoked') { showError('This code has been revoked.'); return; }
            if (entry.status === 'unknown') { showError('Invalid access code'); return; }
            showError('This code has expired.'); return;
        }

        // Try resuming an existing session on THIS device first
        const saved = (() => {
            try { return JSON.parse(localStorage.getItem('merchSession') || 'null'); }
            catch { return null; }
        })();
        if (saved && saved.code === code && saved.sessionId) {
            const touch = await callWorker('/sessionTouch', 'POST', {
                sessionId: saved.sessionId,
                code,
                ua,
                clientSecret: CLIENT_SECRET
            });
            if (touch.success) {
                sessionId = saved.sessionId;
                currentAccessCode = code;
                accessData = { code, expiryDate: entry.expiryDate };
                SESSION_TOKEN = await generateSessionToken();
                saveLocalSession(code, entry.expiryDate, sessionId);
                await showSuccess();
                return;
            }
        }

        // Otherwise check whether the code is already in use on another device
        const lookup = await callWorker('/sessionLookup', 'POST', { code, ua });
        if (!lookup.success) { showError('Connection error. Please try again.'); return; }
        if (lookup.exists) {
            showError('This code is already in use on another device.');
            return;
        }

        // Create a brand new session
        const newSid = generateSessionId();
        const create = await callWorker('/sessionCreate', 'POST', {
            code,
            ua,
            sessionId: newSid,
            clientSecret: CLIENT_SECRET,
            nonce: generateNonce(),
            expiryDate: entry.expiryDate
        });
        if (!create.success) { showError('Failed to create secure session'); return; }

        currentAccessCode = code;
        accessData = { code, expiryDate: entry.expiryDate };
        sessionId = newSid;
        SESSION_TOKEN = create.sessionToken || await generateSessionToken();
        saveLocalSession(code, entry.expiryDate, newSid);
        await showSuccess();

    } catch (err) {
        console.error('Verify error:', err);
        showError('Verification failed. Please try again.');
    } finally {
        loginBtn.disabled = false;
        btnText.style.display = 'inline';
        spinner.style.display = 'none';
    }
}

function generateSessionId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return 's_' + hex;
}

async function showSuccess() {
    const sm = document.getElementById('successMsg');
    sm.classList.add('show');
    sm.querySelector('span').textContent = 'Access granted! Loading...';
    setTimeout(() => showMainApp(), 1000);
}

async function showMainApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').classList.add('show');
    document.getElementById('currentCode').textContent = currentAccessCode;
    updateExpiryBadge();
    startPeriodicCheck();
    await initApp();
}

function updateExpiryBadge() {
    if (!accessData?.expiryDate) return;
    const exp = new Date(accessData.expiryDate);
    const daysLeft = Math.ceil((exp - new Date()) / (1000*60*60*24));
    const badge = document.getElementById('expiryBadge');
    const text = document.getElementById('expiryText');
    
    if (daysLeft <= 0) {
        badge.classList.add('expired');
        text.textContent = 'Expired';
    } else if (daysLeft <= 7) {
        badge.classList.add('expired');
        text.textContent = `Expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`;
    } else {
        badge.classList.remove('expired');
        text.textContent = `Expires in ${daysLeft} days`;
    }
}

// ═══════════════════════════════════════════════════
// PERIODIC CHECK
// ═══════════════════════════════════════════════════
function startPeriodicCheck() {
    if (periodicCheckInterval) clearInterval(periodicCheckInterval);
    setTimeout(() => performPeriodicCheck(), 5000);
    periodicCheckInterval = setInterval(performPeriodicCheck, 20 * 1000);
}

function stopPeriodicCheck() {
    if (periodicCheckInterval) {
        clearInterval(periodicCheckInterval);
        periodicCheckInterval = null;
    }
}

async function performPeriodicCheck() {
    if (!currentAccessCode || !sessionId) {
        stopPeriodicCheck();
        return;
    }

    try {
        const ua = navigator.userAgent;
        
        const entry = await validateAccessCode(currentAccessCode);
        if (!entry) {
            console.warn('validateAccessCode returned null — network glitch, will retry next cycle');
            return;
        }
        if (!entry.valid) {
            if (entry.status === 'revoked') { await forceLogout('Access has been revoked.'); return; }
            if (entry.status === 'unknown') { await forceLogout('Access code not found.'); return; }
            await forceLogout('Access code expired.'); return;
        }

        const touch = await callWorker('/sessionTouch', 'POST', {
    sessionId,
    code: currentAccessCode,
    ua,
    clientSecret: CLIENT_SECRET
});
        if (!touch.success) {
            await forceLogout(touch.message === 'Fingerprint mismatch'
                ? 'Device verification failed.'
                : 'Session terminated.');
            return;
        }

        // Refresh token if needed (every 4 minutes)
        if (!SESSION_TOKEN) {
            SESSION_TOKEN = await generateSessionToken(currentAccessCode);
        }

        if (entry.expiryDate !== accessData.expiryDate) {
            accessData.expiryDate = entry.expiryDate;
            saveLocalSession(currentAccessCode, entry.expiryDate, sessionId);
            updateExpiryBadge();
        }

    } catch (err) {
        console.error('Periodic check error:', err);
    }
}

async function forceLogout(message) {
    stopPeriodicCheck();
    try {
        if (sessionId && currentAccessCode) {
            await callWorker('/sessionEnd', 'POST', {
    sessionId,
    code: currentAccessCode,
    ua: navigator.userAgent,
    clientSecret: CLIENT_SECRET
}).catch(() => {});
        }
    } catch (e) {}
    clearSession();
    alert(message);
    document.getElementById('mainApp').classList.remove('show');
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('accessCode').value = '';
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        await forceLogout('You have been logged out.');
    }
}

// ═══════════════════════════════════════════════════
// APP DATA & STATE
// ═══════════════════════════════════════════════════
let allProducts = [];
let filteredProducts = [];
let favorites = new Set();
let favoritesFilterActive = false;
let currentKeywordSearch = '';
let trendChart = null;
let currentWordLength = 3;

// ═══════════════════════════════════════════════════
// FAVORITES MANAGEMENT
// ═══════════════════════════════════════════════════
function loadFavorites() {
    const saved = localStorage.getItem('merchFavorites');
    if (saved) {
        try {
            favorites = new Set(JSON.parse(saved));
        } catch (e) {
            favorites = new Set();
        }
    }
    updateFavoritesUI();
}

function saveFavorites() {
    localStorage.setItem('merchFavorites', JSON.stringify([...favorites]));
    updateFavoritesUI();
}

function toggleFavorite(asin) {
    console.log('toggleFavorite called with asin:', asin);
    
    if (!asin) {
        console.error('toggleFavorite: asin is empty');
        return;
    }
    
    if (favorites.has(asin)) {
        favorites.delete(asin);
        console.log('Removed from favorites');
    } else {
        favorites.add(asin);
        console.log('Added to favorites');
    }
    
    saveFavorites();
    
    if (favoritesFilterActive) {
        applyAllFilters();
    } else {
        renderProducts(filteredProducts.length > 0 ? filteredProducts : allProducts);
    }
}

function isFavorite(asin) {
    return favorites.has(asin);
}

function updateFavoritesUI() {
    const count = favorites.size;
    document.getElementById('favoritesCount').textContent = count;
    
    const toggleBtn = document.getElementById('favoritesToggleBtn');
    const indicator = document.getElementById('favoritesActiveIndicator');
    const exportBtn = document.getElementById('exportCsvBtn');
    
    if (favoritesFilterActive) {
        toggleBtn.classList.add('active');
        toggleBtn.querySelector('i').className = 'fas fa-heart';
        indicator.style.display = 'inline-flex';
    } else {
        toggleBtn.classList.remove('active');
        toggleBtn.querySelector('i').className = 'far fa-heart';
        indicator.style.display = 'none';
    }
    
    exportBtn.disabled = count === 0;
}

function toggleFavoritesFilter() {
    favoritesFilterActive = !favoritesFilterActive;
    updateFavoritesUI();
    applyAllFilters();
}

function exportFavoritesToCSV() {
    if (favorites.size === 0) {
        showToast('No favorites to export');
        return;
    }
    
    const favProducts = allProducts.filter(p => favorites.has(p.asin));
    if (favProducts.length === 0) {
        showToast('No favorite products found in current data');
        return;
    }
    
    const headers = ['ASIN', 'Title', 'BSR', 'Date Added', 'Link'];
    const rows = favProducts.map(p => [
        p.asin,
        `"${(p.designTitle || '').replace(/"/g, '""')}"`,
        p.bsrDisplay,
        p.dateAddedRaw,
        p.link
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merch_favorites_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast(`✅ Exported ${favProducts.length} favorites`);
}

function showToast(message) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// ═══════════════════════════════════════════════════
// AMAZON RESEARCH TOOL
// ═══════════════════════════════════════════════════
function openResearchModal() {
    document.getElementById('researchModal').classList.add('active');
}
function closeResearchModal() {
    document.getElementById('researchModal').classList.remove('active');
}

const researchUrls = {
    com: {
        tshirt: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+shirt&=most-purchased-rank&oq=Solid+colors%3A+100%25%2BCotton%3B+Heather+Grey%3A+90%25%2BCotton%2C+10%25%2BPolyester%3B+All+Other+Heathers%3A+50%25%2BCotton%2C+50%25%2BPolyester+Lightweight%2C+Classic+fit%2C+Double-needle+sleeve+and+bottom+hem+Machine+wash+cold+with+like+colors%2C+dry+low+heat+-long+-premium+-sweatshirt+-v-neck+-tank+10+x+8+x+1+inches%3B+4.8+Ounces&qid=1699392328&ref=sr_pg_1',
        longsleeve: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+long+sleeve&=most-purchased-rank&oq=Solid+colors%3A+100%25%2BCotton%3B+Heather+Grey%3A+90%25%2BCotton%2C+10%25%2BPolyester%3B+All+Other+Heathers%3A+50%25%2BCotton%2C+50%25%2BPolyester+Lightweight%2C+Classic+fit%2C+Double-needle+sleeve+and+bottom+hem+Machine+wash+cold+with+like+colors%2C+dry+low+heat+-long+-premium+-sweatshirt+-v-neck+-tank+10+x+8+x+1+inches%3B+4.8+Ounces&qid=1699392328&ref=sr_pg_1',
        sweatshirt: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+sweatshirt&=most-purchased-rank&oq=Solid+colors%3A+100%25%2BCotton%3B+Heather+Grey%3A+90%25%2BCotton%2C+10%25%2BPolyester%3B+All+Other+Heathers%3A+50%25%2BCotton%2C+50%25%2BPolyester+Lightweight%2C+Classic+fit%2C+Double-needle+sleeve+and+bottom+hem+Machine+wash+cold+with+like+colors%2C+dry+low+heat+-long+-premium+-sweatshirt+-v-neck+-tank+10+x+8+x+1+inches%3B+4.8+Ounces&qid=1699392328&ref=sr_pg_1',
        hoodie: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+hoodie&=most-purchased-rank&oq=Solid+colors%3A+100%25%2BCotton%3B+Heather+Grey%3A+90%25%2BCotton%2C+10%25%2BPolyester%3B+All+Other+Heathers%3A+50%25%2BCotton%2C+50%25%2BPolyester+Lightweight%2C+Classic+fit%2C+Double-needle+sleeve+and+bottom+hem+Machine+wash+cold+with+like+colors%2C+dry+low+heat+-long+-premium+-sweatshirt+-v-neck+-tank+10+x+8+x+1+inches%3B+4.8+Ounces&qid=1699392328&ref=sr_pg_1',
        vneck: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+v+neck&=most-purchased-rank&oq=Solid+colors%3A+100%25%2BCotton%3B+Heather+Grey%3A+90%25%2BCotton%2C+10%25%2BPolyester%3B+All+Other+Heathers%3A+50%25%2BCotton%2C+50%25%2BPolyester+Lightweight%2C+Classic+fit%2C+Double-needle+sleeve+and+bottom+hem+Machine+wash+cold+with+like+colors%2C+dry+low+heat+-long+-premium+-sweatshirt+-v-neck+-tank+10+x+8+x+1+inches%3B+4.8+Ounces&qid=1699392328&ref=sr_pg_1',
        raglan: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+raglan&=most-purchased-rank&oq=Solid+colors%3A+100%25%2BCotton%3B+Heather+Grey%3A+90%25%2BCotton%2C+10%25%2BPolyester%3B+All+Other+Heathers%3A+50%25%2BCotton%2C+50%25%2BPolyester+Lightweight%2C+Classic+fit%2C+Double-needle+sleeve+and+bottom+hem+Machine+wash+cold+with+like+colors%2C+dry+low+heat+-long+-premium+-sweatshirt+-v-neck+-tank+10+x+8+x+1+inches%3B+4.8+Ounces&qid=1699392328&ref=sr_pg_1',
        tanktop: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+tank+top&=most-purchased-rank&oq=Solid+colors%3A+100%25%2BCotton%3B+Heather+Grey%3A+90%25%2BCotton%2C+10%25%2BPolyester%3B+All+Other+Heathers%3A+50%25%2BCotton%2C+50%25%2BPolyester+Lightweight%2C+Classic+fit%2C+Double-needle+sleeve+and+bottom+hem+Machine+wash+cold+with+like+colors%2C+dry+low+heat+-long+-premium+-sweatshirt+-v-neck+-tank+10+x+8+x+1+inches%3B+4.8+Ounces&qid=1699392328&ref=sr_pg_1',
        popsocket: 'https://www.amazon.com/s?k=SEARCHTERM+%22popsockets%22',
        case: 'https://www.amazon.com/s?k=SEARCHTERM+%22Two-part+protective+case+made+from+a+premium+scratch-resistant+polycarbonate+shell+and+shock+absorbent+TPU+liner+protects+against+drops%22',
        throwpillow: 'https://www.amazon.com/s?k=SEARCHTERM+throw+pillow+%22100%25+spun+polyester+fabric',
        totebag: 'https://www.amazon.com/s?k=SEARCHTERM+%22Tote+Bag%22&hidden-keywords=%2216%E2%80%9D+x+16%E2%80%9D+bag+with+two+14%E2%80%9D+long+and+1%E2%80%9D+wide+black+cotton+webbing+strap+handles%22'
    },
    couk: {
        tshirt: 'https://www.amazon.co.uk/s?k=SEARCHTERM+shirt&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE&dc&ds=v1%3AnnZMRGr%2BicY%2F%2BdsHXTyLzOZ5AVaS8BZJ3Hqy6fnccAU&qid=1738951174&rnid=419151031&ref=sr_nr_p_6_1',
        longsleeve: 'https://www.amazon.co.uk/s?k=SEARCHTERM+long+sleeve&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE&dc&ds=v1%3AnnZMRGr%2BicY%2F%2BdsHXTyLzOZ5AVaS8BZJ3Hqy6fnccAU&qid=1738951174&rnid=419151031&ref=sr_nr_p_6_1',
        sweatshirt: 'https://www.amazon.co.uk/s?k=SEARCHTERM+sweatshirt&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE&dc&ds=v1%3AnnZMRGr%2BicY%2F%2BdsHXTyLzOZ5AVaS8BZJ3Hqy6fnccAU&qid=1738951174&rnid=419151031&ref=sr_nr_p_6_1',
        hoodie: 'https://www.amazon.co.uk/s?k=SEARCHTERM+hoodie&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE&dc&ds=v1%3AnnZMRGr%2BicY%2F%2BdsHXTyLzOZ5AVaS8BZJ3Hqy6fnccAU&qid=1738951174&rnid=419151031&ref=sr_nr_p_6_1',
        raglan: 'https://www.amazon.co.uk/s?k=SEARCHTERM+raglan&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE&dc&ds=v1%3AnnZMRGr%2BicY%2F%2BdsHXTyLzOZ5AVaS8BZJ3Hqy6fnccAU&qid=1738951174&rnid=419151031&ref=sr_nr_p_6_1',
        vneck: 'https://www.amazon.co.uk/s?k=SEARCHTERM+v+neck&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE&dc&ds=v1%3AnnZMRGr%2BicY%2F%2BdsHXTyLzOZ5AVaS8BZJ3Hqy6fnccAU&qid=1738951174&rnid=419151031&ref=sr_nr_p_6_1',
        tanktop: 'https://www.amazon.co.uk/s?k=SEARCHTERM+tank+top&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE&dc&ds=v1%3AnnZMRGr%2BicY%2F%2BdsHXTyLzOZ5AVaS8BZJ3Hqy6fnccAU&qid=1738951174&rnid=419151031&ref=sr_nr_p_6_1',
        popsocket: 'https://www.amazon.co.uk/s?k=SEARCHTERM+%22popsockets%22',
        case: 'https://www.amazon.co.uk/s?k=SEARCHTERM+phone+case&rh=n%3A560798%2Cp_6%3AA3P5ROKL5A1OLE&dc&ds=v1%3ArapiHdzIV5G%2FQh5nraKtX5A8pijQVB39ApZAQOcrEDM&crid=2H4TYOOBCD6AD&qid=1738953195&rnid=419151031'
    },
    de: {
        tshirt: 'https://www.amazon.de/s?k=SEARCHTERM+shirt&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF&dc&language=en&ds=v1%3A%2FG0%2BZ9aqc%2FL3%2F7vcxmAUhq61RUhlZfT7k9UKgG7fj84&crid=S8TTJ7PQP6GF&qid=1738951992&rnid=419115031&ref=sr_nr_p_6_1',
        vneck: 'https://www.amazon.de/s?k=SEARCHTERM+v+neck&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF&dc&language=en&ds=v1%3A%2FG0%2BZ9aqc%2FL3%2F7vcxmAUhq61RUhlZfT7k9UKgG7fj84&crid=S8TTJ7PQP6GF&qid=1738951992&rnid=419115031&ref=sr_nr_p_6_1',
        longsleeve: 'https://www.amazon.de/s?k=SEARCHTERM+langarmshirt&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF&dc&language=en&ds=v1%3A%2FG0%2BZ9aqc%2FL3%2F7vcxmAUhq61RUhlZfT7k9UKgG7fj84&crid=S8TTJ7PQP6GF&qid=1738951992&rnid=419115031&ref=sr_nr_p_6_1',
        sweatshirt: 'https://www.amazon.de/s?k=SEARCHTERM+sweatshirt&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF&dc&language=en&ds=v1%3A%2FG0%2BZ9aqc%2FL3%2F7vcxmAUhq61RUhlZfT7k9UKgG7fj84&crid=S8TTJ7PQP6GF&qid=1738951992&rnid=419115031&ref=sr_nr_p_6_1',
        hoodie: 'https://www.amazon.de/s?k=SEARCHTERM+hoodie&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF&dc&language=en&ds=v1%3A%2FG0%2BZ9aqc%2FL3%2F7vcxmAUhq61RUhlZfT7k9UKgG7fj84&crid=S8TTJ7PQP6GF&qid=1738951992&rnid=419115031&ref=sr_nr_p_6_1',
        popsocket: 'https://www.amazon.de/s?k=SEARCHTERM+%22popsockets%22',
        raglan: 'https://www.amazon.de/s?k=SEARCHTERM+raglan&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF&dc&language=en&ds=v1%3A%2FG0%2BZ9aqc%2FL3%2F7vcxmAUhq61RUhlZfT7k9UKgG7fj84&crid=S8TTJ7PQP6GF&qid=1738951992&rnid=419115031&ref=sr_nr_p_6_1',
        tanktop: 'https://www.amazon.de/s?k=SEARCHTERM+tank+top&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF&dc&language=en&ds=v1%3A%2FG0%2BZ9aqc%2FL3%2F7vcxmAUhq61RUhlZfT7k9UKgG7fj84&crid=S8TTJ7PQP6GF&qid=1738951992&rnid=419115031&ref=sr_nr_p_6_1',
        case: 'https://www.amazon.de/s?k=SEARCHTERM+H%C3%BClle+phone&rh=n%3A562066%2Cp_6%3AA3JWKAKR8XB7XF&dc&language=en&ds=v1%3ASCh9N13%2Fe97k7MXEjuayDuNNmA8m3AKtyQYi%2BYqQrik&crid=3I1WXN91F3J66&qid=1738952957&rnid=419115031&sprefix=dogh%C3%BClle+phone%2Caps%2C163&ref=sr_nr_p_6_1'
    }
};

function performAmazonSearch() {
    const locale = document.getElementById('researchLocale').value;
    const category = document.getElementById('researchCategory').value;
    const keyword = document.getElementById('researchKeyword').value.trim();
    
    const urlTemplate = researchUrls[locale]?.[category];
    if (!urlTemplate) {
        showToast('This category is not available for that marketplace');
        return;
    }
    
    const searchTerm = keyword ? encodeURIComponent(keyword) : '';
    const finalUrl = urlTemplate.replace('SEARCHTERM', searchTerm);
    window.open(finalUrl, '_blank');
}

// ═══════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════
async function initApp() {
    if (!SESSION_TOKEN) {
        document.getElementById('productsContainer').innerHTML = 
            '<div class="no-results">⚠️ Session error. Please logout and login again.</div>';
        return;
    }

    loadFavorites();
    setupEventListeners();
    await loadProducts();
    renderProducts(allProducts);
    updateTrendChart();
    renderHotNiches();
}

async function loadProducts() {
    try {
        const container = document.getElementById('productsContainer');
        container.innerHTML = '<div class="loading">Loading products...</div>';
        
        allProducts = await fetchProductsFromWorker();
        
        allProducts.sort((a, b) => {
            if (!a.parsedDate && !b.parsedDate) return 0;
            if (!a.parsedDate) return 1;
            if (!b.parsedDate) return -1;
            return b.parsedDate - a.parsedDate;
        });
        
        document.getElementById('product-count').textContent = allProducts.length;
        filteredProducts = [...allProducts];
        
    } catch (error) {
        console.error('Error loading products:', error);
        document.getElementById('productsContainer').innerHTML = 
            '<div class="no-results">⚠️ Failed to load products. Please try again later.</div>';
    }
}

function setupEventListeners() {
    // Keyword search
    document.getElementById('searchKeywordBtn').addEventListener('click', () => {
        currentKeywordSearch = document.getElementById('keywordSearch').value.trim();
        applyAllFilters();
    });
    
    document.getElementById('clearKeywordBtn').addEventListener('click', () => {
        document.getElementById('keywordSearch').value = '';
        currentKeywordSearch = '';
        applyAllFilters();
    });
    
    document.getElementById('keywordSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentKeywordSearch = document.getElementById('keywordSearch').value.trim();
            applyAllFilters();
        }
    });
    
    // Hot niches apply button
    document.getElementById('applyWordLengthBtn').addEventListener('click', applyNicheControls);
    document.getElementById('wordLengthInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyNicheControls();
    });
    document.getElementById('nichesPeriod').addEventListener('change', renderHotNiches);
    document.getElementById('minRepeats').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyNicheControls();
    });
    
    // Modal close
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('analysisModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('analysisModal')) {
            closeModal();
        }
    });
    
    // Live filters
    document.getElementById('sortSelect').addEventListener('change', applyAllFilters);
    document.getElementById('dateFilter').addEventListener('change', applyAllFilters);
    document.getElementById('searchMode').addEventListener('change', () => {
        if (currentKeywordSearch) applyAllFilters();
    });
    document.getElementById('bsrMin').addEventListener('change', applyAllFilters);
    document.getElementById('bsrMax').addEventListener('change', applyAllFilters);
    document.getElementById('bsrMin').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyAllFilters();
    });
    document.getElementById('bsrMax').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyAllFilters();
    });

    // Research modal events
    const rk = document.getElementById('researchKeyword');
    if (rk) {
        rk.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performAmazonSearch();
        });
    }
    const rm = document.getElementById('researchModal');
    if (rm) {
        rm.addEventListener('click', (e) => {
            if (e.target === rm) closeResearchModal();
        });
    }
}

// ═══════════════════════════════════════════════════
// FILTERING & SORTING
// ═══════════════════════════════════════════════════
function applyAllFilters() {
    const kw = document.getElementById('keywordSearch')?.value || '';
    const bMin = parseFloat(document.getElementById('bsrMin')?.value) || 0;
    const bMax = parseFloat(document.getElementById('bsrMax')?.value) || Infinity;
    const dF = document.getElementById('dateFilter')?.value || 'all';
    const sV = document.getElementById('sortSelect')?.value || 'date-desc';
    
    let f = allProducts.filter(p => {
        if (favoritesFilterActive && !isFavorite(p.asin)) return false;
        if (!keywordMatch(p, kw)) return false;
        if (p.bsrNumber < bMin || p.bsrNumber > bMax) return false;
        if (dF !== 'all' && p.parsedDate) {
            const d = (Date.now() - p.parsedDate) / (1000 * 3600 * 24);
            if (dF === 'today' && d > 1) return false;
            if (dF === 'week' && d > 7) return false;
            if (dF === 'month' && d > 30) return false;
        }
        return true;
    });
    
    f.sort((a, b) => {
        if (sV === 'date-desc') return (b.parsedDate || 0) - (a.parsedDate || 0);
        if (sV === 'date-asc') return (a.parsedDate || 0) - (b.parsedDate || 0);
        if (sV === 'bsr-asc') return a.bsrNumber - b.bsrNumber;
        if (sV === 'bsr-desc') return b.bsrNumber - a.bsrNumber;
        return 0;
    });
    
    filteredProducts = f;
    renderProducts(f);
}

function resetAll() {
    ['keywordSearch', 'bsrMin', 'bsrMax'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilter) dateFilter.value = 'all';
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = 'date-desc';
    const searchMode = document.getElementById('searchMode');
    if (searchMode) searchMode.value = 'normal';
    currentKeywordSearch = '';
    if (favoritesFilterActive) toggleFavoritesFilter();
    applyAllFilters();
}

// ═══════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════
function renderProducts(products) {
    const container = document.getElementById('productsContainer');
    
    if (products.length === 0) {
        container.innerHTML = '<div class="no-results">📭 No products found matching your criteria</div>';
        return;
    }
    
    document.getElementById('product-count').innerText = products.length;
    
    let html = '<div class="products-grid">';
    
    products.forEach(product => {
        const favActive = isFavorite(product.asin) ? 'active' : '';
        const favIcon = isFavorite(product.asin) ? 'fas fa-heart' : 'far fa-heart';
        const dateDisplay = product.parsedDate ? formatDate(product.parsedDate) : product.dateAddedRaw || 'N/A';
        const safeAsin = product.asin.replace(/'/g, "\\'");
        
        html += `
            <div class="product-card">
                <button class="favorite-btn ${favActive}" data-asin="${safeAsin}" onclick="window.toggleFavorite('${safeAsin}'); return false;" title="Add to favorites">
                    <i class="${favIcon}"></i>
                </button>
                <img class="product-image" src="${product.imageUrl}" alt="${escHtmlSafe(product.designTitle) || 'Product'}" loading="lazy" onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
                <div class="product-info">
                    ${product.bsrDisplay ? `<div class="bsr-tag">📊 ${product.bsrDisplay}</div>` : ''}
                    <div class="product-title">${escHtmlSafe(product.designTitle) || 'Untitled Design'}</div>
                    ${product.brand ? `<div style="font-size:0.7rem;color:#64748b;margin-bottom:4px;">🏷️ ${escHtmlSafe(product.brand)}</div>` : ''}
                    <div class="product-date">📅 ${dateDisplay}</div>
                    <div class="card-actions">
                        <a href="${product.link}" target="_blank" class="amazon-btn" onclick="event.stopPropagation();">
                            <i class="fab fa-amazon"></i> Amazon
                        </a>
                        <a href="https://www.amazon.com/dp/${product.asin}" target="_blank" class="amazon-btn" onclick="event.stopPropagation();" style="flex:0.5;">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        <button class="analyze-btn" data-asin="${safeAsin}" onclick="event.stopPropagation(); window.analyzeProduct('${safeAsin}');">
                            <i class="fas fa-chart-line"></i> Analyze
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// HOT NICHES RENDERING
// ═══════════════════════════════════════════════════
function renderHotNiches() {
    const container = document.getElementById('hotNichesContainer');
    const pd = parseInt(document.getElementById('nichesPeriod')?.value || '7');
    const mr = Math.max(1, parseInt(document.getElementById('minRepeats')?.value || '2'));
    const niches = calculateHotNiches(currentWordLength, pd, mr);
    
    if (!niches.length) {
        container.innerHTML = '<div class="niche-item" style="text-align:center;color:#94a3b8;">No results</div>';
        return;
    }
    
    const max = niches[0].count;
    container.innerHTML = niches.map((n, i) => {
        const bw = Math.round((n.count / max) * 100);
        const rc = i === 0 ? '#e95e2e' : i < 3 ? '#f59e0b' : i < 10 ? '#3b82f6' : '#64748b';
        return `<div class="niche-item" onclick="searchByKeyword('${escHtmlJS(n.keyword)}')">
            <div class="niche-main-row">
                <div class="niche-left">
                    <span class="niche-rank" style="background:${rc}22;color:${rc};">#${i + 1}</span>
                    <span class="niche-keyword" title="${escHtmlJS(n.exampleTitle)}">${escHtmlSafe(n.keyword)}</span>
                </div>
                <div class="niche-stats">
                    <span class="niche-count" style="background:${rc};">${n.count}×</span>
                    <span class="niche-bsr">avg:${n.avgBSR.toLocaleString()}</span>
                    <span class="niche-bsr">🏆${n.minBSR.toLocaleString()}</span>
                    <span class="niche-action">
                        <button class="amazon-search-btn" onclick="event.stopPropagation();openAmazonSearch('${escHtmlJS(n.keyword)}')">
                            <i class="fab fa-amazon"></i> Search
                        </button>
                    </span>
                </div>
            </div>
            <div class="niche-bar-bg">
                <div class="niche-bar-fill" style="width:${bw}%;background:${rc};"></div>
            </div>
        </div>`;
    }).join('');
}

function applyNicheControls() {
    const input = document.getElementById('wordLengthInput');
    let len = parseInt(input.value);
    if (isNaN(len)) len = 3;
    len = Math.max(2, Math.min(6, len));
    input.value = len;
    currentWordLength = len;
    renderHotNiches();
}

function openAmazonSearch(kw) {
    window.open(`https://www.amazon.com/s?k=${encodeURIComponent(kw)}`, '_blank');
}

function searchByKeyword(kw) {
    const i = document.getElementById('keywordSearch');
    if (i) {
        i.value = kw;
        currentKeywordSearch = kw;
        applyAllFilters();
        document.querySelector('.keyword-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ═══════════════════════════════════════════════════
// HTML ESCAPE FUNCTIONS
// ═══════════════════════════════════════════════════
function escHtmlSafe(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escHtmlJS(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '\\n');
}

// ═══════════════════════════════════════════════════
// PRODUCT ANALYSIS MODAL
// ═══════════════════════════════════════════════════
function analyzeProduct(asin) {
    const product = allProducts.find(p => p.asin === asin);
    if (!product) return;

    const modal = document.getElementById('analysisModal');
    const body = document.getElementById('modalBody');

    const allText = [product.designTitle, product.featureBullet1, product.featureBullet2, product.brand]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);

    const wordFreq = {};
    allText.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });

    const keywords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));

    const titleWords = (product.designTitle || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
    let longtailPhrases = [];
    if (titleWords.length >= 3) {
        for (let i = 0; i <= titleWords.length - 3; i++) {
            longtailPhrases.push(titleWords.slice(i, i + 3).join(' '));
        }
    }
    longtailPhrases = [...new Set(longtailPhrases)].slice(0, 5);

    const dd = product.parsedDate
        ? formatDate(product.parsedDate)
        : (product.dateAddedRaw ? product.dateAddedRaw.replace(/^:\s*/, '') : 'N/A');

    body.innerHTML = `
        <div style="text-align:center;">
            <img class="modal-img" src="${product.imageUrl}" alt="${escHtmlSafe(product.designTitle)}" onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
        </div>

        <div class="detail-block">
            <strong>📌 Title:</strong><br>
            ${escHtmlSafe(product.designTitle) || '<em style="color:#94a3b8;">N/A</em>'}
        </div>

        <div class="detail-block">
            <strong>🏷️ Brand:</strong><br>
            ${escHtmlSafe(product.brand) || '<em style="color:#94a3b8;">N/A</em>'}
        </div>

        <div class="detail-block">
            <strong>✨ Feature 1:</strong><br>
            ${escHtmlSafe(product.featureBullet1) || '<em style="color:#94a3b8;">N/A</em>'}
        </div>

        <div class="detail-block">
            <strong>✨ Feature 2:</strong><br>
            ${escHtmlSafe(product.featureBullet2) || '<em style="color:#94a3b8;">N/A</em>'}
        </div>

        <div class="detail-block">
            <strong>📊 BSR:</strong> ${product.bsrDisplay}<br>
            <strong>📅 Date Added:</strong> ${dd}<br>
            <strong>🔗 ASIN:</strong> ${product.asin}
        </div>

        <div class="detail-block">
            <strong>🔑 Top Keywords:</strong>
            <div class="keyword-list">
                ${keywords.length
                    ? keywords.map(k => `<span class="keyword-badge">${escHtmlSafe(k.word)} (${k.count})</span>`).join('')
                    : '<em style="color:#94a3b8;">None</em>'}
            </div>
        </div>

        ${longtailPhrases.length > 0 ? `
        <div class="detail-block">
            <strong>🎯 Long-Tail Phrases:</strong>
            <div class="keyword-list">
                ${longtailPhrases.map(p => `<span class="keyword-badge longtail-badge">${escHtmlSafe(p)}</span>`).join('')}
            </div>
        </div>` : ''}

        <hr style="margin:14px 0;border:none;border-top:1px solid #eef2f8;">

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <a href="${product.link}" target="_blank" class="amazon-btn" style="flex:1;text-decoration:none;padding:10px;text-align:center;background:#ff9900;color:white;border-radius:40px;font-weight:600;">
                <i class="fab fa-amazon"></i> View on Amazon
            </a>
            <a href="https://www.amazon.com/dp/${product.asin}" target="_blank" class="amazon-btn" style="flex:1;text-decoration:none;padding:10px;text-align:center;background:#232f3e;color:white;border-radius:40px;font-weight:600;">
                <i class="fas fa-external-link-alt"></i> Direct Link
            </a>
        </div>
    `;

    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('analysisModal').classList.remove('active');
}

// ═══════════════════════════════════════════════════
// TREND CHART
// ═══════════════════════════════════════════════════
function updateTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    const days = [];
    const counts = [];
    
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        days.push(d);
        
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const count = allProducts.filter(p => {
            return p.parsedDate && p.parsedDate >= d && p.parsedDate < nextDay;
        }).length;
        
        counts.push(count);
    }
    
    const labels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    
    if (trendChart) {
        trendChart.destroy();
    }
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Products Added',
                data: counts,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#667eea',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    cornerRadius: 8,
                    padding: 10
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: { size: 11 }
                    },
                    grid: {
                        color: '#f1f5f9'
                    }
                },
                x: {
                    ticks: {
                        font: { size: 10 },
                        maxRotation: 45
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════
// INITIAL LOAD & EVENT BINDING
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    // ── Login Page Events ──
    document.getElementById('loginBtn').addEventListener('click', verifyAccessCode);
    
    document.getElementById('accessCode').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyAccessCode();
    });

    // ── Logout Button ──
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // ── Research Button & Modal ──
    document.getElementById('researchBtn').addEventListener('click', openResearchModal);
    document.getElementById('closeResearchModalBtn').addEventListener('click', closeResearchModal);
    document.getElementById('researchModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('researchModal')) closeResearchModal();
    });
    document.getElementById('researchSearchBtn').addEventListener('click', performAmazonSearch);
    document.getElementById('researchKeyword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performAmazonSearch();
    });

    // ── Favorites ──
    document.getElementById('favoritesToggleBtn').addEventListener('click', toggleFavoritesFilter);
    document.getElementById('exportCsvBtn').addEventListener('click', exportFavoritesToCSV);

    // ── Filters ──
    document.getElementById('applyFiltersBtn').addEventListener('click', applyAllFilters);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetAll);

    // ── Keyword Search ──
    document.getElementById('searchKeywordBtn').addEventListener('click', () => {
        currentKeywordSearch = document.getElementById('keywordSearch').value.trim();
        applyAllFilters();
    });
    document.getElementById('clearKeywordBtn').addEventListener('click', () => {
        document.getElementById('keywordSearch').value = '';
        currentKeywordSearch = '';
        applyAllFilters();
    });
    document.getElementById('keywordSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentKeywordSearch = document.getElementById('keywordSearch').value.trim();
            applyAllFilters();
        }
    });

    // ── Hot Niches ──
    document.getElementById('applyWordLengthBtn').addEventListener('click', applyNicheControls);
    document.getElementById('wordLengthInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyNicheControls();
    });
    document.getElementById('nichesPeriod').addEventListener('change', renderHotNiches);
    document.getElementById('minRepeats').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyNicheControls();
    });

    // ── Analysis Modal ──
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('analysisModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('analysisModal')) closeModal();
    });

    // ── Live Filters ──
    document.getElementById('sortSelect').addEventListener('change', applyAllFilters);
    document.getElementById('dateFilter').addEventListener('change', applyAllFilters);
    document.getElementById('searchMode').addEventListener('change', () => {
        if (currentKeywordSearch) applyAllFilters();
    });
    document.getElementById('bsrMin').addEventListener('change', applyAllFilters);
    document.getElementById('bsrMax').addEventListener('change', applyAllFilters);
    document.getElementById('bsrMin').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyAllFilters();
    });
    document.getElementById('bsrMax').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyAllFilters();
    });

    // ── Load Session or Show Login ──
    const hasSession = await loadSession();
    if (hasSession) {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('mainApp').classList.add('show');
        document.getElementById('currentCode').textContent = currentAccessCode;
        updateExpiryBadge();
        startPeriodicCheck();
        await initApp();
    } else {
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('mainApp').classList.remove('show');
    }
});

// ═══════════════════════════════════════════════════
// GLOBAL EXPOSURE
// ═══════════════════════════════════════════════════
window.toggleFavoritesFilter = toggleFavoritesFilter;
window.toggleFavorite = toggleFavorite;
window.exportFavoritesToCSV = exportFavoritesToCSV;
window.applyAllFilters = applyAllFilters;
window.resetAll = resetAll;
window.logout = logout;
window.openAmazonSearch = openAmazonSearch;
window.searchByKeyword = searchByKeyword;
window.verifyAccessCode = verifyAccessCode;
window.openResearchModal = openResearchModal;
window.closeResearchModal = closeResearchModal;
window.performAmazonSearch = performAmazonSearch;
window.analyzeProduct = analyzeProduct;
window.closeModal = closeModal;
