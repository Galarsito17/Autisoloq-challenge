const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.RIOT_API_KEY?.trim();
const refreshIntervalMs = 5 * 60 * 1000;
const profiles = [
    { nombre: 'Galar', tag: 'dead' },
    { nombre: 'Luth', tag: 'GALAR' },
    { nombre: 'GexitoIsCrying', tag: 'CRY' },
    { nombre: 'GexitoIsDead', tag: 'DEAD' },
    { nombre: 'DaveMoo12', tag: 'DVM12' },
    { nombre: 'DvM12', tag: 'LAN' },
    { nombre: 'WdeNeto', tag: '044' }
];

const tiers = {
    IRON: { label: 'Hierro', order: 0 },
    BRONZE: { label: 'Bronce', order: 1 },
    SILVER: { label: 'Plata', order: 2 },
    GOLD: { label: 'Oro', order: 3 },
    PLATINUM: { label: 'Platino', order: 4 },
    EMERALD: { label: 'Esmeralda', order: 5 },
    DIAMOND: { label: 'Diamante', order: 6 },
    MASTER: { label: 'Maestro', order: 7 },
    GRANDMASTER: { label: 'Gran Maestro', order: 8 },
    CHALLENGER: { label: 'Challenger', order: 9 }
};

let cache = null;
let cacheAt = 0;
let refreshInProgress = null;
let lastForcedRefreshAt = 0;

async function riotGet(url) {
    const response = await fetch(url, {
        headers: { 'X-Riot-Token': apiKey },
        signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
        throw new Error(`Riot API respondió ${response.status}`);
    }

    return response.json();
}

async function getParticipant(profile) {
    const riotIdUrl = new URL(
        `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(profile.nombre)}/${encodeURIComponent(profile.tag)}`
    );
    const account = await riotGet(riotIdUrl);
    const entriesUrl = new URL(
        `https://la1.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(account.puuid)}`
    );
    const entries = await riotGet(entriesUrl);
    const soloQueue = entries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5');

    if (!soloQueue) {
        return {
            ...profile,
            url: opggUrl(profile),
            rango: 'Sin clasificatoria',
            tier: null,
            division: null,
            lp: null,
            winrate: null,
            order: -1
        };
    }

    const tier = tiers[soloQueue.tier] || { label: soloQueue.tier, order: -1 };
    const divisionOrder = { I: 3, II: 2, III: 1, IV: 0 }[soloQueue.rank] || 0;
    const isApexTier = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(soloQueue.tier);
    const rankLabel = isApexTier ? tier.label : `${tier.label} ${soloQueue.rank}`;

    return {
        ...profile,
        url: opggUrl(profile),
        rango: rankLabel,
        tier: soloQueue.tier,
        division: isApexTier ? null : soloQueue.rank,
        lp: soloQueue.leaguePoints,
        winrate: Math.round((soloQueue.wins / (soloQueue.wins + soloQueue.losses)) * 100),
        order: tier.order * 100000 + (isApexTier ? 0 : divisionOrder * 1000) + soloQueue.leaguePoints
    };
}

function opggUrl(profile) {
    return `https://op.gg/lol/summoners/lan/${encodeURIComponent(profile.nombre)}-${encodeURIComponent(profile.tag)}`;
}

async function loadLeaderboard() {
    const participants = await Promise.all(profiles.map(async (profile) => {
        try {
            return await getParticipant(profile);
        } catch (error) {
            return {
                ...profile,
                url: opggUrl(profile),
                rango: 'No disponible',
                tier: null,
                division: null,
                lp: null,
                winrate: null,
                error: error.message,
                order: -1
            };
        }
    }));

    participants.sort((first, second) => second.order - first.order);
    return { configured: true, fetchedAt: new Date().toISOString(), refreshIntervalMs, participants };
}

async function getLeaderboard(forceRefresh) {
    const now = Date.now();
    if (forceRefresh && cache && now - lastForcedRefreshAt < 60 * 1000) return cache;
    if (cache && now - cacheAt < refreshIntervalMs && !forceRefresh) return cache;
    if (refreshInProgress) return refreshInProgress;
    if (forceRefresh) lastForcedRefreshAt = now;

    refreshInProgress = loadLeaderboard()
        .then((data) => {
            cache = data;
            cacheAt = Date.now();
            return data;
        })
        .finally(() => {
            refreshInProgress = null;
        });

    return refreshInProgress;
}

function sendJson(response, status, data) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(data));
}

function serveFile(response, filePath) {
    const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.png': 'image/png'
    };
    fs.readFile(filePath, (error, content) => {
        if (error) {
            response.writeHead(404);
            response.end('No encontrado');
            return;
        }
        response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
        response.end(content);
    });
}

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    if (requestUrl.pathname === '/api/leaderboard') {
        if (!apiKey) {
            sendJson(response, 200, { configured: false, refreshIntervalMs, participants: [] });
            return;
        }
        try {
            sendJson(response, 200, await getLeaderboard(requestUrl.searchParams.has('refresh')));
        } catch {
            sendJson(response, 502, { error: 'No se pudo consultar la API de Riot.' });
        }
        return;
    }

    const requestedPath = requestUrl.pathname === '/' ? '/soloqchallenge.html' : decodeURIComponent(requestUrl.pathname);
    const filePath = path.resolve(root, `.${requestedPath}`);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403);
        response.end('Prohibido');
        return;
    }
    serveFile(response, filePath);
});

server.listen(port, () => {
    console.log(`SoloQ Challenge disponible en http://localhost:${port}`);
    if (!apiKey) console.log('Falta RIOT_API_KEY; configura la variable de entorno para cargar rangos en vivo.');
});
