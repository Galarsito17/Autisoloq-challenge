const leaderboardBody = document.querySelector('#leaderboard-body');
const refreshButton = document.querySelector('#refresh-button');
const refreshStatus = document.querySelector('#refresh-status');
const refreshIntervalMs = 5 * 60 * 1000;

function createCell(className, text) {
	const cell = document.createElement('td');
	if (className) cell.className = className;
	cell.textContent = text;
	return cell;
}

function renderParticipant(participant, index) {
	const row = document.createElement('tr');
	row.style.animationDelay = `${Math.min(index, 8) * 35}ms`;
	row.append(createCell('position', String(index + 1)));

	const summonerCell = document.createElement('td');
	summonerCell.className = 'summoner-name';
	if (participant.profileIconUrl) {
		const profileIcon = document.createElement('img');
		profileIcon.className = 'profile-icon';
		profileIcon.src = participant.profileIconUrl;
		profileIcon.alt = '';
		profileIcon.loading = 'lazy';
		profileIcon.addEventListener('error', () => profileIcon.remove(), { once: true });
		summonerCell.append(profileIcon);
	}
	const summonerLabel = document.createElement('span');
	summonerLabel.textContent = `${participant.nombre} #${participant.tag}`;
	summonerCell.append(summonerLabel);
	row.append(summonerCell);

	const rankCell = document.createElement('td');
	rankCell.className = 'rank-cell';
	const rankInfo = document.createElement('span');
	rankInfo.className = 'rank-info';
	if (participant.tier) {
		const emblem = document.createElement('img');
		emblem.className = 'rank-emblem';
		emblem.src = `/rangos/emblem-${participant.tier.toLowerCase()}.png`;
		emblem.alt = `Emblema ${participant.rango}`;
		emblem.loading = 'lazy';
		emblem.addEventListener('error', () => emblem.remove(), { once: true });
		rankInfo.append(emblem);
	}
	const rankLabel = document.createElement('span');
	rankLabel.className = 'rank';
	rankLabel.textContent = participant.rango;
	rankInfo.append(rankLabel);
	rankCell.append(rankInfo);
	row.append(rankCell);

	row.append(createCell('points', participant.lp === null ? '--' : `${participant.lp} LP`));
	row.append(createCell('winrate', participant.winrate === null ? '--' : `${participant.winrate}%`));

	const statsCell = document.createElement('td');
	const opggLink = document.createElement('a');
	opggLink.className = 'opgg-link';
	opggLink.href = participant.url;
	opggLink.target = '_blank';
	opggLink.rel = 'noopener noreferrer';
	opggLink.textContent = 'OP.GG';
	opggLink.setAttribute('aria-label', `Ver a ${participant.nombre} en OP.GG`);
	statsCell.append(opggLink);
	row.append(statsCell);

	return row;
}

function showMessage(message) {
	const row = document.createElement('tr');
	const cell = createCell('loading-row', message);
	cell.colSpan = 6;
	row.append(cell);
	leaderboardBody.replaceChildren(row);
}

async function loadLeaderboard(forceRefresh = false) {
	refreshButton.disabled = true;
	refreshButton.classList.add('is-loading');
	refreshStatus.textContent = 'Consultando Riot...';

	try {
		const response = await fetch(`/api/leaderboard${forceRefresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'No se pudo cargar la clasificación.');

		if (!data.configured) {
			showMessage('Configura RIOT_API_KEY en el servidor para activar los rangos en vivo.');
			refreshStatus.textContent = 'API de Riot sin configurar';
			return;
		}

		if (!data.participants.length) {
			showMessage('No hay participantes para mostrar.');
		} else {
			leaderboardBody.replaceChildren(...data.participants.map(renderParticipant));
		}
		const updatedAt = new Date(data.fetchedAt);
		refreshStatus.textContent = `Actualizado ${updatedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
	} catch (error) {
		showMessage('No se pudo cargar la clasificación. Intenta actualizar en un momento.');
		refreshStatus.textContent = error.message;
	} finally {
		refreshButton.disabled = false;
		refreshButton.classList.remove('is-loading');
	}
}

refreshButton.addEventListener('click', () => loadLeaderboard(true));
loadLeaderboard();
window.setInterval(() => loadLeaderboard(), refreshIntervalMs);
