const participantes = [
    { nombre: 'Galar', tag: 'dead' },
    { nombre: 'Luth', tag: 'GALAR' },
    { nombre: 'GexitoIsCrying', tag: 'CRY' },
    { nombre: 'GexitoIsDead', tag: 'DEAD' },
    { nombre: 'DaveMoo12', tag: 'DVM12' },
    { nombre: 'DvM12', tag: 'LAN' },
    { nombre: 'WdeNeto', tag: '044' }
];

const tbody = document.getElementById('leaderboard-body');
const status = document.getElementById('refresh-status');
const refreshButton = document.getElementById('refresh-button');
const refreshIntervalMs = 5 * 60 * 1000;

function profileUrl(player) {
    return `https://op.gg/lol/summoners/lan/${encodeURIComponent(player.nombre)}-${encodeURIComponent(player.tag)}`;
}

function addCell(row, content, className = '') {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = content;
    row.append(cell);
    return cell;
}

function renderPlayers(players, placeholder = false) {
    tbody.replaceChildren();
    const list = players.length ? players : participantes.map((player) => ({ ...player, url: profileUrl(player) }));

    list.forEach((player, index) => {
        const row = document.createElement('tr');
        addCell(row, placeholder || player.error ? '--' : String(index + 1), 'position');

        const nameCell = document.createElement('td');
        nameCell.className = 'summoner-name';
        const link = document.createElement('a');
        link.href = player.url || profileUrl(player);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `${player.nombre} #${player.tag}`;
        nameCell.append(link);
        row.append(nameCell);

        const rankCell = document.createElement('td');
        const rank = document.createElement('span');
        rank.className = `rank${player.rango && player.rango !== 'No disponible' && player.rango !== 'Sin clasificatoria' ? ` rank-${player.rango.split(' ')[0].toLowerCase()}` : ''}`;
        rank.textContent = player.rango || (placeholder ? 'Esperando datos' : 'No disponible');
        rankCell.append(rank);
        row.append(rankCell);

        addCell(row, Number.isInteger(player.lp) ? `${player.lp} LP` : '--');
        addCell(row, Number.isInteger(player.winrate) ? `${player.winrate}%` : '--');
        tbody.append(row);
    });
}

function formatUpdateTime(value) {
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

async function loadLeaderboard(manual = false) {
    refreshButton.disabled = true;
    refreshButton.classList.add('is-loading');
    if (manual) status.textContent = 'Consultando Riot...';

    try {
        const response = await fetch(`/api/leaderboard${manual ? '?refresh=1' : ''}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('No se pudo conectar con el servicio de Riot.');
        const data = await response.json();

        if (!data.configured) {
            renderPlayers([], true);
            status.textContent = 'Configura RIOT_API_KEY en el servidor para activar los rangos en vivo.';
            return;
        }

        renderPlayers(data.participants || []);
        const timestamp = data.fetchedAt ? `Última actualización: ${formatUpdateTime(data.fetchedAt)}` : 'Esperando la primera actualización';
        const participants = data.participants || [];
        const failedCount = participants.filter((player) => player.error).length;
        const hasUnauthorizedKey = participants.some((player) => player.error?.includes('401'));
        status.textContent = hasUnauthorizedKey
            ? 'Riot rechazó la API key (401). Actualiza RIOT_API_KEY en Render con una key vigente y vuelve a desplegar.'
            : failedCount ? `${timestamp} · ${failedCount} cuenta(s) no disponibles` : timestamp;
    } catch (error) {
        status.textContent = error.message;
        if (!tbody.children.length) renderPlayers([], true);
    } finally {
        refreshButton.disabled = false;
        refreshButton.classList.remove('is-loading');
    }
}

refreshButton.addEventListener('click', () => loadLeaderboard(true));
document.addEventListener('DOMContentLoaded', () => {
    renderPlayers([], true);
    loadLeaderboard();
    window.setInterval(() => loadLeaderboard(), refreshIntervalMs);
});
