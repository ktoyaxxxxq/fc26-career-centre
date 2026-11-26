import { demo } from './demo.mjs';
import { buildTable, formFor, leaderRows, mergeStats, rankTable, resultFor, totals, traits } from './core.mjs';
import { action, blank, dateLabel, fmt, h, icon, local } from './ui.mjs';
import { competitionCoverage, filterWorld, playerLeaders, rateTeams } from './world.mjs';
import { europeanKind, forecastMatch, orderCompetitions, summaryForPlayer } from './analytics.mjs';
import { academyPage, europeanPage, honoursPage, transfersPage } from './career-views.mjs';
import { extraStats, parseMatchTelemetry, telemetryKey } from './telemetry.mjs';
import { nextFixture, simulateMatch, tournamentHistory } from './kickoff.mjs';
import { advanceSimulation, matchday, newSimulation, playSimulation, suggestLineup, validateLineup } from './season-sim.mjs';
import { careerFixture, deskHome, deskInbox, deskMarket, deskMatch, deskMessages, deskNews, deskReport, deskResults, deskSync } from './desk-views.mjs';
import { readDesk, writeDesk } from './desk-store.mjs';
import { money, rosterWithOffers, submitOffer } from './desk-market.mjs';
import { estimatedStatFields, estimatePlayerStats } from './estimate.mjs';
import { menCareer } from './men-career.mjs';

const element = document.querySelector('#app');
const api = window.careerDesktop;
let source = { state: 'demo' };
let data = demo;
let teams, players, archivePlayers, competitions, worldMemo;
const deskRecords = new Map();
let scenarioCache;
const news = { loading: false, items: [], error: '', checked: false };
const state = {
  page: 'overview', lastPage: 'players', player: null, profileTab: 'stats', comp: null, group: null,
  metric: 'goals', dateFilter: 'all', query: '', team: 'club', order: 'ovr', limit: 36, menu: false,
  compare: [], scope: null, history: null, demoMode: 'manager', playerSearch: '', clubView: null, clubReturn: 'overview',
  worldTab: 'players', worldKind: 'all', worldComp: null, worldMetric: 'goals', worldClubMetric: 'power',
  worldQuery: '', worldLimit: 25, worldYoung: false, profileKind: 'all',
  matchId: null, matchReturn: 'matches', calendarTeam: 'club',
  calendarMode: 'mine', calendarClub: null, calendarMonth: '', calendarSeason: null, calendarLimit: 42, matchSeason: null,
  profileSeason: null, profileComp: null, clubSeason: null, clubTab: 'overview',
  euroComp: null, euroView: 'overview', euroAll: false,
  radarPosition: '', radarAge: '', radarView: 'targets', radarSearch: '', radarLimit: 25,
  awardKind: 'ballon', awardSeason: null, awardPeriod: 'season', awardDate: null, awardExpanded: false,
  searchType: 'all',
  kickoffResult: null, gameToken: 0,
  academyView: 'own', academyClub: null, academyComp: null, academyMetric: 'potential', academyLimit: 24,
};
const favorites = local('career:favorites', {});
const portraits = local('career:portraits', {});
const customAwards = local('career:awards', {});
const navigation = [
  ['overview', 'home', 'Карьера'], ['matchday', 'ball', 'День матча'], ['briefing', 'world', 'Новости'], ['inbox', 'inbox', 'Сообщения'], ['market', 'radar', 'Трансферы'], ['world', 'world', 'Мировая статистика'], ['europe', 'trophy', 'Еврокубки'], ['competitions', 'league', 'Соревнования'], ['players', 'users', 'Игроки'],
  ['matches', 'calendar', 'Матчи'], ['awards', 'trophy', 'Награды'], ['academy', 'academy', 'Академия'], ['radar', 'radar', 'Трансферный радар'], ['compare', 'compare', 'Сравнение'],
  ['history', 'clock', 'История сезонов'],
];
const metrics = [['goals', 'Голы'], ['assists', 'Ассисты'], ['contributions', 'Гол + пас'], ['cleanSheets', 'Сухие матчи'], ['averageRating', 'Оценка с учётом матчей']];
const groups = [['all', 'Все команды'], ['club', 'Клубы'], ['national', 'Сборные']];
const worldMetrics = [
  ['goals', 'Голы'], ['assists', 'Ассисты'], ['contributions', 'Гол + пас'],
  ['goalsPer90', 'Голы за 90'], ['assistsPer90', 'Ассисты за 90'], ['contributionsPer90', 'Гол + пас за 90'],
  ['averageRating', 'Оценка с учётом матчей'], ['manOfTheMatch', 'Игрок матча'], ['cleanSheets', 'Сухие матчи'],
  ['saves', 'Сейвы'], ['minutes', 'Минуты'], ['ovr', 'ОВР в FC 26'], ['potential', 'Потенциал'],
];
const teamMetrics = [['power', 'Рейтинг силы'], ['ovr', 'ОВР в FC 26'], ['winRate', 'Победы, %'], ['goalsFor', 'Забито'], ['goalDiff', 'Разница голов']];
const ratingInfo = 'От 3 матчей с оценкой и 270 минут. При малом числе матчей оценка в рейтинге ближе к средней по выборке.';
const ratingDisplay = row => `${fmt(row.ratingScore)}<small class="under">Ср. ${fmt(row.averageRating)} · ${fmt(row.ratedMatches)} с оценкой</small>`;
const ages = new Intl.PluralRules('ru');
const screen = page => navigation.find(([id]) => id === page)?.[2] ?? 'Настройки';
const club = () => teams.get(data.clubId);
const teamName = id => teams.get(id)?.name ?? (id == null ? 'Клуб неизвестен' : `Клуб #${id}`);
const leagueLabels = { 13: 'АПЛ', 53: 'Ла Лига', 19: 'Бундеслига', 31: 'Серия А', 16: 'Лига 1' };
const compName = id => leagueLabels[competitions.get(id)?.leagueId] ?? competitions.get(id)?.name ?? `Турнир #${id}`;
const playerById = id => players.get(id) ?? archivePlayers.get(id);
const playerName = id => playerById(id)?.name ?? `Игрок #${id}`;
const formBadge = mark => `<span class="form-mark ${mark === 'В' ? 'win' : mark === 'Н' ? 'draw' : 'loss'}" aria-label="${{ В: 'Победа', Н: 'Ничья', П: 'Поражение' }[mark]}">${mark}</span>`;
const modeName = () => ({ manager: 'Карьера тренера', player: 'Карьера игрока', unknown: 'Карьера FC 26' })[data.mode];
const matchesClub = (id = data.clubId) => data.fixtures.filter(m => [m.homeId, m.awayId].includes(id));
const portraitKey = id => `${data.key}/${id}`;
const shortlist = () => favorites[data.key] ?? [];
const playerBtn = (id, label = playerName(id), classes = 'player-name') => `<button type="button" class="${classes}" data-player="${id}">${h(label)}</button>`;
const clubBtn = (id, classes = 'td-team') => `<button type="button" class="${classes}" data-club="${id}">${crest(id)}${h(teamName(id))}</button>`;
const switcher = (key, options, selected, label) => `<div class="seg" role="group" aria-label="${h(label)}">${options.map(([id, text]) => `<button type="button" data-${key}="${h(id)}" aria-pressed="${id === selected}">${h(text)}</button>`).join('')}</div>`;
const select = (key, options, selected, label) => `<label class="selection"><span>${h(label)}</span><select data-select="${key}">${options.map(([id, text]) => `<option value="${h(id)}"${id === selected ? ' selected' : ''}>${h(text)}</option>`).join('')}</select></label>`;
const compOptions = (withAll = true, list = data.competitions) => [...(withAll ? [['', 'Все соревнования']] : []), ...orderCompetitions(list).map(c => [String(c.id), compName(c.id)])];
const filterStats = (comp = null) => comp == null ? data.stats : data.stats.filter(r => r.competitionId === comp);
const seasonNames = () => [...new Set([data.season, ...Object.keys(data.history ?? {})].filter(Boolean))].sort().reverse();
const seasonData = season => season && season !== data.season ? data.history?.[season] ?? data : data.seasonArchive ?? data;
const activeSeason = choice => seasonNames().includes(choice) ? choice : data.season;
const rankedTeams = () => memoWorld('match-ratings', () => rateTeams(data.teams, data.fixtures));
function telemetryEntries(season, competition = null) {
  return Object.entries(data.telemetry ?? {}).flatMap(([key, rows]) => {
    const [year, comp, date, home, away] = key.split('/');
    if ((season !== 'all' && year !== season) || (competition != null && Number(comp) !== competition)) return [];
    const candidates = [Number(home), Number(away)];
    return rows.map(row => {
      const player = playerById(row.playerId);
      const fallback = [player?.teamId, ...(player?.nationalIds ?? [])].find(id => candidates.includes(id));
      return { ...row, teamId: row.teamId ?? fallback ?? null, date: Number(date) };
    });
  });
}
const context = () => ({ data, state, heading, section, select, switcher, matchList, teamName, clubBtn, playerBtn, playerById, playerName, portrait,
  rankedTeams, compName, clubName: club()?.name, memo: memoWorld });
const deskKey = () => `${data.key}/${data.season ?? 'undated'}`;

function deskRecord() {
  const key = deskKey();
  if (!deskRecords.has(key)) {
    const basis = data;
    const record = { value: { sim: newSimulation(data), listed: [], deals: [], read: [], pending: null } };
    deskRecords.set(key, record);
    record.ready = readDesk(key).then(value => {
      if (value?.sim?.version === record.value.sim.version) {
        const women = new Set(basis.excludedPlayers), teams = new Set(basis.excludedTeams);
        const results = Object.fromEntries(Object.entries(value.sim.results ?? {}).filter(([, m]) => !teams.has(m.homeId) && !teams.has(m.awayId)).map(([id, match]) => [id, {
          ...match, players: (match.players ?? []).filter(p => !women.has(p.id)), events: (match.events ?? []).filter(event => !women.has(event.playerId) && !women.has(event.assistId)),
        }]));
        record.value = { ...record.value, ...value, sim: { ...value.sim, results, lineup: (value.sim.lineup ?? []).map(id => women.has(id) ? null : id) }, listed: (value.listed ?? []).filter(id => !women.has(id)), deals: (value.deals ?? []).filter(offer => !women.has(offer.playerId)) };
      }
      if (key === deskKey() && !checkGameReport() && ['overview', 'matchday', 'report', 'briefing', 'inbox', 'market', 'sync'].includes(state.page)) render();
    }).catch(() => announce('Локальное хранилище карьеры недоступно.'));
  }
  return deskRecords.get(key);
}
function saveDesk(change) {
  saveDeskFor(deskKey(), deskRecord(), change);
}
function saveDeskFor(key, record, change) {
  record.value = { ...record.value, ...change };
  void writeDesk(key, record.value).catch(() => announce('Не удалось сохранить прогресс симуляции.'));
}
function deskContext() {
  const session = deskRecord().value;
  if (scenarioCache?.career !== data || scenarioCache?.deals !== session.deals) scenarioCache = { career: data, deals: session.deals, view: rosterWithOffers(data, session.deals) };
  const live = data.kind === 'save' && Boolean(api) && session.mode !== 'model';
  const sim = live ? { ...session.sim, date: data.date, results: {}, lastMatchId: null } : session.sim;
  return { ...context(), data: live ? data : scenarioCache.view, career: data, session, sim, playerName, crest, matchOdds, news, game: source.game, native: Boolean(api), live };
}
function checkGameReport() {
  const session = deskRecord().value;
  if (session.pending?.kind === 'calendar' && data.date > session.pending.date) {
    saveDesk({ pending: null });
    const next = nextFixture(data);
    navigate(next?.date === data.date ? 'matchday' : 'overview');
    void api?.reveal().catch(() => {});
    announce(`Сейв обновлён · ${dateLabel(data.date, 'full')}`);
    return true;
  }
  if (!session.pending || session.pending.kind === 'calendar') return false;
  let match = careerFixture(data, session.pending), season = data.season;
  if (!match?.played) for (const [year, bank] of Object.entries(data.history ?? {})) {
    const observed = careerFixture(bank, session.pending);
    if (observed?.played) { match = observed; season = year; break; }
  }
  if (!match?.played || match.homeGoals == null || match.awayGoals == null) return false;
  saveDesk({ pending: null });
  navigate('match', match.id, season);
  void api?.reveal().catch(() => {});
  return true;
}

async function loadWorldNews() {
  if (news.loading) return;
  news.loading = true;
  news.checked = true;
  render();
  try {
    const result = await api?.worldNews();
    if (!result?.xml) throw new Error(result?.error || 'Мировая лента доступна в настольной панели.');
    const xml = new DOMParser().parseFromString(result.xml, 'application/xml');
    const field = (item, tag) => item.querySelector(tag)?.textContent?.trim() ?? '';
    news.items = Array.from(xml.querySelectorAll('item')).slice(0, 32).map(item => {
      const date = new Date(field(item, 'pubDate'));
      return { title: field(item, 'title'), summary: field(item, 'description').replace(/<[^>]*>/g, '').slice(0, 420), url: field(item, 'link'), date: Number.isFinite(date.getTime()) ? date.toLocaleDateString('ru-RU') : '' };
    }).filter(item => item.title && item.url && !/\bwomen(?:’s|'s)?\b|\bwsl\b|lionesses|womens[-_]/i.test(`${item.title} ${item.summary} ${item.url}`));
    news.error = news.items.length ? '' : 'В мировой ленте пока нет публикаций.';
  } catch (error) { news.error = error.message; }
  finally {
    news.loading = false;
    if (state.page === 'briefing') render();
  }
}

function setData(next) {
  if (data !== next || !worldMemo) worldMemo = new Map();
  data = menCareer(next);
  teams = new Map(data.teams.map(t => [t.id, t]));
  players = new Map(data.players.map(p => [p.id, p]));
  const snapshots = Object.values(data.history ?? {}).concat(data.seasonArchive ?? []);
  archivePlayers = new Map(snapshots.flatMap(s => (s.players ?? []).map(p => [p.id, p])));
  for (const s of snapshots) for (const team of s.teams ?? []) if (!teams.has(team.id)) teams.set(team.id, team);
  competitions = new Map([...snapshots.flatMap(s => s.competitions ?? []), ...data.competitions].map(c => [c.id, c]));
}
setData(demo);

function artUrl(kind, id) {
  return api && data.kind === 'save' && Number.isInteger(id) && id > 0 && id <= 999999999 ? `./media/${kind}/${id}.png?v=${source.artwork?.generation ?? 0}` : '';
}
function artwork(url, alt = '') {
  return url ? `<img class="artwork" alt="${h(alt)}" src="${h(url)}" loading="lazy" decoding="async">` : '';
}
function portrait(p, large = false) {
  const image = portraits[portraitKey(p.id)];
  const initials = p.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  if (image?.startsWith('data:image/jpeg;base64,')) return `<img class="portrait ${large ? 'large' : ''}" src="${h(image)}" alt="${h(p.name)}">`;
  if (Number.isInteger(p.portrait)) return `<span role="img" aria-label="${h(p.name)}" class="portrait sprite ${large ? 'large' : ''}" style="--x:${p.portrait % 4 * 100 / 3}%;--y:${p.portrait < 4 ? 0 : 100}%"></span>`;
  return `<span role="img" aria-label="${h(p.name)}" class="portrait initials ${large ? 'large' : ''}"><span aria-hidden="true">${h(initials)}</span>${artwork(artUrl('players', p.id))}</span>`;
}
function crest(id, classes = '') {
  const t = teams.get(id);
  const color = /^#[\da-f]{6}$/i.test(t?.color ?? '') ? t.color : '#273d35';
  return `<span class="crest ${classes}" style="--team:${color}" aria-hidden="true"><span>${h(t?.short ?? t?.name?.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('') ?? '—')}</span>${artwork(artUrl('teams', t?.assetId ?? id))}</span>`;
}
function heading(title, detail = '', options = '') {
  return `<div class="page-heading"><div><h1>${h(title)}</h1>${detail ? `<p>${h(detail)}</p>` : ''}</div>${options || ''}</div>`;
}
function section(title, end = '') {
  return `<div class="section-head"><h2>${h(title)}</h2>${end}</div>`;
}
function score(m) {
  if (!m.played) return '—';
  if ([m.homeGoals, m.awayGoals].some(n => n == null)) return '—';
  const pens = m.homePen != null && m.awayPen != null && m.decision === 'penalties' ? `<small>пен. ${m.homePen}:${m.awayPen}</small>` : '';
  return `${m.homeGoals} : ${m.awayGoals}${pens}`;
}
function chances(m) {
  const byTeam = memoWorld('match-ratings-index', () => new Map(rankedTeams().map(t => [t.id, t])));
  return forecastMatch(byTeam.get(m.homeId), byTeam.get(m.awayId));
}
function matchOdds(m, detail = false) {
  const p = chances(m);
  const points = [p.win, p.draw, p.loss].map(n => n * 100);
  const rounded = points.map(Math.floor);
  const remainders = points.map((value, index) => [value - rounded[index], index]).sort((a, b) => b[0] - a[0]);
  for (let i = 0, missing = 100 - rounded.reduce((sum, n) => sum + n, 0); i < missing; i++) rounded[remainders[i][1]]++;
  const labels = detail ? ['Победа хозяев', 'Ничья', 'Победа гостей'] : ['Хозяева', 'Ничья', 'Гости'];
  return `<div class="match-odds ${detail ? 'detailed' : ''}" aria-label="Прогноз панели">${rounded.map((n, i) => `<span><small>${labels[i]}</small><strong>${n}%</strong></span>`).join('')}</div>`;
}
function matchList(items, season = data.season) {
  if (!items.length) return blank('В этой выборке матчей пока нет.');
  return `<div class="matches-list">${items.map(m => `<div class="match-line">
    <div class="match-date">${h(dateLabel(m.date))}<small>${h(compName(m.competitionId))}</small></div>
    ${clubBtn(m.homeId, 'match-team home')}
    <button type="button" class="score match-score" data-match="${m.id}" data-match-season="${h(season)}" aria-label="Карточка матча ${h(teamName(m.homeId))} — ${h(teamName(m.awayId))}">${score(m)}</button>
    ${clubBtn(m.awayId, 'match-team away')}
    ${m.played === false && season === data.season ? matchOdds(m) : ''}
  </div>`).join('')}</div>`;
}
function standingsFor(comp, groupId = null) {
  const official = data.standings.filter(r => r.competitionId === comp && (groupId == null || r.groupId === groupId));
  if (official.length) return rankTable(official);
  return competitions.get(comp)?.type === 'Лига' ? buildTable(data.fixtures.filter(m => m.competitionId === comp)) : [];
}
function tableMarkup(rows, compId, compact = false) {
  if (!rows.length) return blank('Таблица для этого этапа недоступна. Счёт матчей смотри в календаре.');
  const fixtures = data.fixtures.filter(m => m.competitionId === compId);
  return `<div class="table-scroll"><table class="standings"><thead><tr><th scope="col">#</th><th scope="col">Команда</th><th scope="col" title="Матчи">М</th>${compact ? '' : '<th scope="col">В</th><th scope="col">Н</th><th scope="col">П</th><th scope="col">Голы</th>'}<th scope="col" title="Разница голов">РГ</th><th scope="col">Форма</th><th scope="col" title="Очки">О</th></tr></thead><tbody>${rows.map((r, index) => `<tr class="${r.teamId === data.clubId ? 'club-row' : ''}"><td>${index + 1}</td><th scope="row">${clubBtn(r.teamId)}</th><td>${r.played}</td>${compact ? '' : `<td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gf}:${r.ga}</td>`}<td>${r.gf > r.ga ? '+' : ''}${r.gf - r.ga}</td><td><div class="form">${formFor(fixtures, r.teamId).map(formBadge).join('') || '—'}</div></td><td><strong>${r.points}</strong></td></tr>`).join('')}</tbody></table></div>`;
}
function leaders(rows, metric, max = 8) {
  const rating = metric === 'averageRating';
  const list = (metric === 'contributions' || rating ? playerLeaders(rows, metric).map(r => ({ ...r, teamId: r.teamIds[0] })) : leaderRows(rows, metric)).slice(0, max);
  const rule = rating ? `<p class="fine">${ratingInfo}</p>` : '';
  if (!list.length) return rule + blank('Для этого фильтра пока нет показателей.');
  return rule + `<ol class="leader-list">${list.map((r, i) => {
    const player = playerById(r.id) ?? { id: r.id, name: playerName(r.id) };
    return `<li><button type="button" data-player="${r.id}" class="leader-row"><span class="rank">${String(i + 1).padStart(2, '0')}</span>${portrait(player)}<span class="leader-name"><strong>${h(player.name)}</strong><small>${h(teamName(r.teamId))}</small></span><b>${rating ? ratingDisplay(r) : fmt(r[metric])}</b></button></li>`;
  }).join('')}</ol>`;
}

function clubOverview() {
  const nextMatch = nextFixture(data);
  const opponent = nextMatch ? nextMatch.homeId === data.clubId ? nextMatch.awayId : nextMatch.homeId : null;
  const recent = matchesClub().filter(m => m.played).sort((a, b) => b.date - a.date).slice(0, 4);
  const seasonRows = standingsFor(data.primaryId, data.standings.find(r => r.competitionId === data.primaryId && r.teamId === data.clubId)?.groupId);
  const standing = seasonRows.findIndex(r => r.teamId === data.clubId);
  const own = seasonRows[standing];
  const hero = players.get(data.heroId);
  const title = data.mode === 'player' && hero ? hero.name : club()?.name ?? 'Моя карьера';
  const stats = mergeStats(data.stats.filter(r => r.playerId === data.heroId));
  const activeComp = state.scope;
  const leaderRowsSource = filterStats(activeComp);
  const subtitle = [club()?.name, modeName(), data.season ? `Сезон ${data.season}` : null].filter(Boolean).join('  ·  ');
  return heading('Обзор карьеры', subtitle, `<div class="heading-actions"><div class="page-date" title="${data.dateBasis === 'match' ? 'Дата последнего матча клуба' : 'Дата карьеры'}">${icon('calendar', 16)}${data.dateBasis === 'match' ? 'Последний матч · ' : ''}${h(dateLabel(data.date, 'full'))}</div>${data.competitions.some(c => europeanKind(c) === 'ucl') ? action('Лига чемпионов', 'europe', 'button secondary', 'trophy') : ''}${action('Мировая статистика', 'world', 'button secondary', 'up')}</div>`)
    + `<div class="dashboard">
      <div class="main-column">
        <section class="hero">
          <div class="hero-copy">
            <div class="hero-info">${crest(data.clubId)}<span>${h(data.primaryId == null ? modeName() : compName(data.primaryId))}</span></div>
            <h2>${h(title)}</h2>
            <p>${nextMatch ? `Следующий матч · ${h(teamName(nextMatch.homeId === data.clubId ? nextMatch.awayId : nextMatch.homeId))} · ${h(dateLabel(nextMatch.date))}` : 'Следующий матч пока неизвестен'}</p>
            <div class="kickoff-actions">${nextMatch ? action('Следующий матч', 'kickoff', 'button primary', 'arrow') : action('Календарь матчей', 'matches', 'button primary')}
            ${data.mode === 'player' && hero ? playerBtn(hero.id, 'Профиль игрока', 'button ghost') : opponent != null ? `<button type="button" class="button ghost" data-club="${opponent}">Разбор соперника</button>` : ''}</div>
          </div>
        </section>
        <div class="strip">
          ${(data.mode === 'player' ? [[stats.appearances, 'Матчи'], [stats.goals, 'Голы'], [stats.assists, 'Ассисты'], [stats.averageRating, 'Ср. оценка']] : [[standing >= 0 ? standing + 1 : null, 'Место в лиге'], [own?.points, 'Очки'], [own?.won, 'Победы'], [own?.gf, 'Голы команды']]).map(([v, label]) => `<div><strong>${fmt(v)}</strong><small>${h(label)}</small></div>`).join('')}
        </div>
        <section class="box">${section('Турнирная таблица', action('Соревнования', 'competitions'))}${tableMarkup(seasonRows.slice(0, 8), data.primaryId, true)}</section>
      </div>
      <div class="side-column">
        <section class="box leader-box">${section('Бомбардиры', icon('ball', 20))}
          <div class="box-controls">${select('scope', compOptions(), String(activeComp ?? ''), 'Турнир')}</div>
          ${leaders(leaderRowsSource, 'goals', 5)}
          <div class="box-footer">${action('Все лидеры', 'competitions')}</div>
        </section>
        <section class="box recent-box">${section('Последние матчи', action('Календарь', 'matches'))}
          ${recent.length ? `<ul class="recent">${recent.map(m => {
            const home = m.homeId === data.clubId;
            const other = home ? m.awayId : m.homeId;
            return `<li>${formBadge(resultFor(m, data.clubId))}${crest(other)}<span>${h(teamName(other))}<small>${h(dateLabel(m.date))} · ${home ? 'дома' : 'в гостях'}</small></span><b>${score(m)}</b></li>`;
          }).join('')}</ul>` : blank('Сыгранных матчей пока нет.')}
        </section>
        ${(data.nationalId != null || data.manager?.confidence > 0 || data.manager?.reputation > 0) ? `<section class="box career-office">${section('Карьера тренера')}
        ${keyValues([['Доверие руководства', fmt(data.manager?.confidence)], ['Репутация', fmt(data.manager?.reputation)]].filter(([, value]) => value !== '—'))}
        ${data.nationalId != null ? `<div class="box-footer">${clubBtn(data.nationalId)}<span class="row-count">Моя сборная</span></div>` : ''}</section>` : ''}
      </div>
    </div>`;
}

function kickoffPage() {
  const match = nextFixture(data);
  const last = matchesClub().filter(m => m.played && m.homeGoals != null && m.awayGoals != null).sort((a, b) => b.date - a.date || b.id - a.id)[0];
  const lastResult = last ? `<section class="box next-box">${section('Последний результат из сейва')}${matchList([last])}</section>` : '';
  const game = source.game;
  const headingText = game?.ready ? 'Окно FC 26 доступно' : game?.pid ? 'FC 26 запускается' : '';
  const open = api ? `<button type="button" class="button primary" data-open-game>${icon('panel', 17)} ${game?.ready ? 'Вернуться в FC 26' : game?.pid ? 'Открыть FC 26' : 'Запустить FC 26'}</button>` : '';
  if (!match) return heading('Следующий матч', headingText, open) + blank('В календаре пока нет предстоящего матча твоей команды.') + action('Календарь', 'matches', 'button secondary') + lastResult;
  const { date, homeId, awayId, competitionId } = match;
  const score = state.kickoffResult?.key === kickoffKey(match) ? state.kickoffResult.score : null;
  const opponent = homeId === data.clubId ? awayId : homeId;
  const side = (id, label) => `<div class="kickoff-side"><small>${label}</small>${clubBtn(id, 'kickoff-team')}<div class="form" aria-label="Форма команды">${formFor(data.fixtures, id).map(formBadge).join('') || '—'}</div></div>`;
  return heading('Следующий матч', headingText, open)
    + `<section class="kickoff-hero">
      <div class="kickoff-meta"><span>${icon('trophy', 17)}${h(compName(competitionId))}</span><span>${icon('calendar', 17)}${h(dateLabel(date, 'full'))}</span></div>
      <div class="kickoff-sides">${side(homeId, 'Дома')}<div class="kickoff-score" aria-live="polite">${score ? `<strong>${score.join(' : ')}</strong><small>Симуляция панели</small>` : '<strong>VS</strong>'}</div>${side(awayId, 'В гостях')}</div>
    </section>
    <div class="profile-grid next-box">
      <section class="box">${section('Прогноз матча')}${matchOdds(match, true)}
        <div class="box-footer kickoff-actions"><button type="button" class="button secondary" data-simulate>${icon('ball', 16)}${score ? 'Симулировать ещё раз' : 'Симулировать в панели'}</button><p>Пробный результат на основе силы и формы команд.</p></div></section>
      <section class="box">${section('Подготовка к игре')}<div class="kickoff-links">
        <button type="button" class="text-btn" data-match="${match.id}" data-match-season="${h(data.season)}">Карточка матча ${icon('arrow', 16)}</button>
        <button type="button" class="text-btn" data-club="${opponent}">Разбор соперника ${icon('arrow', 16)}</button>
        <button type="button" class="text-btn" data-tournament="${competitionId}">Соревнование ${icon('arrow', 16)}</button>
        ${action('Календарь карьеры', 'matches')}</div></section>
    </div>${lastResult}`;
}

const kickoffKey = match => `${data.key}/${data.season}/${match.id}/${match.date}/${match.homeId}/${match.awayId}`;

function clubPage() {
  const id = state.clubView;
  const team = teams.get(id);
  const seasons = seasonNames().filter(year => year === data.season || seasonData(year).teams?.some(t => t.id === id));
  const season = activeSeason(state.clubSeason);
  const bank = seasonData(season);
  const rows = (bank.stats ?? []).filter(r => r.teamId === id && (state.scope == null || r.competitionId === state.scope));
  const clubFixtures = (bank.fixtures ?? []).filter(m => [m.homeId, m.awayId].includes(id));
  const fixtures = clubFixtures.filter(m => state.scope == null || m.competitionId === state.scope);
  const played = fixtures.filter(m => m.played && m.homeGoals != null && m.awayGoals != null).sort((a, b) => b.date - a.date);
  const next = fixtures.filter(m => !m.played && (data.date == null || m.date >= data.date)).sort((a, b) => a.date - b.date);
  const last = played.slice(0, 5);
  const goals = last.reduce((sum, m) => sum + (m.homeId === id ? m.homeGoals : m.awayGoals), 0);
  const conceded = last.reduce((sum, m) => sum + (m.homeId === id ? m.awayGoals : m.homeGoals), 0);
  const options = `<div class="heading-actions">${seasons.length ? select('club-season', seasons.map(y => [y, y]), season, 'Сезон') : ''}${select('scope', compOptions(true, [...new Set(clubFixtures.map(m => m.competitionId))].map(id => competitions.get(id)).filter(Boolean)), String(state.scope ?? ''), 'Турнир')}</div>`;
  const trophyRows = (bank.honours ?? data.honours ?? []).filter(r => r.teamId === id);
  const roster = (season === data.season ? data.players : (bank.players ?? [])).filter(p => p.teamId === id || p.nationalIds?.includes(id)).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
  const tab = state.clubTab;
  let display;
  if (tab === 'roster') {
    display = `<section class="box">${section('Состав', `<span class="row-count">${fmt(roster.length)} игроков</span>`)}
    ${roster.length ? `<div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Позиция</th><th>ОВР</th><th>М</th><th>Г</th><th>А</th><th>Г+А</th></tr></thead><tbody>
    ${roster.map(p => {
      const s = summaryForPlayer(rows.filter(r => r.playerId === p.id));
      return `<tr><th scope="row"><button class="person-cell" type="button" data-player="${p.id}" data-player-season="${h(season)}">${portrait(p)}<strong>${h(p.name)}</strong></button></th><td>${h(p.position || '—')}</td><td>${fmt(p.ovr)}</td><td>${fmt(s.appearances)}</td><td>${fmt(s.goals)}</td><td>${fmt(s.assists)}</td><td class="metric-score">${fmt(s.contributions)}</td></tr>`;
    }).join('')}</tbody></table></div>` : blank('В архиве нет состава за выбранный сезон.')}</section>`;
  } else if (tab === 'tactics') {
    const tactics = season === data.season ? data.tactics?.[id] : bank.tactics?.[id];
    display = `<section class="box">${section(tactics?.name || 'Расстановка')}
    ${tactics ? `<p class="fine">${h(tactics.source)}</p><div class="pitch">${tactics.slots.filter(s => Number.isFinite(s.x) && Number.isFinite(s.y)).map(s => {
      const x = Math.min(94, Math.max(6, s.x * 100));
      const y = Math.min(92, Math.max(8, (1 - s.y) * 100));
      return `<div class="pitch-token" style="--pitch-x:${x}%;--pitch-y:${y}%">${s.playerId ? playerBtn(s.playerId) : ''}<span>${h(s.position || '—')}</span></div>`;
    }).join('')}</div>` : blank('Для этой команды и сезона схема в архиве отсутствует.')}</section>`;
  } else if (tab === 'trophies') {
    display = `<section class="box">${section('Трофеи клуба')}${trophyRows.length ? `<ul class="scout-list">${trophyRows.map(r => `<li><strong>${h(compName(r.competitionId))}</strong><small>${h(season)}</small></li>`).join('')}</ul>` : blank('В этом сезоне в архиве нет трофеев клуба.')}</section>`;
  } else if (tab === 'history') {
    display = `<section class="box">${section('Итоги по сезонам')}${seasons.length ? `<div class="table-scroll"><table><thead><tr><th>Сезон</th><th>М</th><th>В</th><th>Н</th><th>П</th><th>Голы</th><th>Трофеи</th></tr></thead><tbody>
    ${seasons.map(y => {
      const archive = seasonData(y);
      const played = (archive.fixtures ?? []).filter(m => m.played && [m.homeId, m.awayId].includes(id));
      const markers = played.map(m => resultFor(m, id));
      const goals = played.reduce((sum, m) => sum + ((m.homeId === id ? m.homeGoals : m.awayGoals) ?? 0), 0);
      return `<tr><th scope="row"><button type="button" class="player-name" data-club-year="${h(y)}">${h(y)}</button></th><td>${played.length}</td>
       ${['В', 'Н', 'П'].map(mark => `<td>${markers.filter(m => m === mark).length}</td>`).join('')}<td>${goals}</td><td>${(archive.honours ?? []).filter(r => r.teamId === id).length}</td></tr>`;
    }).join('')}</tbody></table></div>` : blank('Архив сезонов команды ещё пуст.')}</section>`;
  } else {
    const detailed = telemetryEntries(season, state.scope).filter(r => r.teamId === id);
    display = `<div class="dashboard"><div class="main-column">
      <section class="box">${section('Последние пять матчей', `<div class="form">${formFor(fixtures, id).map(formBadge).join('')}</div>`)}
      ${last.length ? keyValues([['Забито', fmt(goals)], ['Пропущено', fmt(conceded)]]) : ''}${matchList(last, season)}</section>
      <section class="box">${section('Предстоящие матчи', `<button type="button" class="text-btn" data-calendar-club="${id}">Календарь ${icon('arrow', 14)}</button>`)}${matchList(next.slice(0, 5), season)}</section>
      </div><div class="side-column">
      <section class="box">${section('Главные бомбардиры')}${leaders(rows, 'goals', 5)}
      <div class="box-footer"><button type="button" class="text-btn" data-club-tab="roster">Посмотреть состав ${icon('arrow', 16)}</button></div></section>
      <section class="box">${section('Лучшие по гол + пас')}${leaders(rows, 'contributions', 5)}</section>
      ${detailed.length ? `<section class="box">${section('Расширенная статистика', '<span class="tag">Импорт</span>')}${keyValues(extraStats.flatMap(([k, label]) => {
        const observed = detailed.map(row => row[k]).filter(Number.isFinite);
        return observed.length ? [[label, fmt(observed.reduce((sum, n) => sum + n, 0))]] : [];
      }))}</section>` : ''}
      </div></div>`;
  }
  return `<button type="button" class="text-btn back" data-nav="${state.clubReturn}">${icon('left', 17)} Назад</button>`
    + `<section class="club-hero">${crest(id)}${heading(teamName(id), team?.kind === 'national' ? 'Сборная' : (team?.league || 'Клуб'), options)}</section>`
    + (team?.ovr ? `<div class="strip team-strip">${[['ovr', 'ОВР команды'], ['attack', 'Атака'], ['midfield', 'Полузащита'], ['defense', 'Защита']].map(([key, label]) => `<div><strong>${fmt(team[key])}</strong><small>${label}</small></div>`).join('')}</div>` : '')
    + `<div class="page-tabs">${switcher('club-tab', [['overview', 'Обзор'], ['roster', 'Состав'], ['tactics', 'Схема'], ['trophies', 'Трофеи'], ['history', 'История']], tab, 'Страница клуба')}${team?.kind === 'club' ? `<button type="button" class="button secondary" data-academy-club="${id}">${id === data.clubId ? 'Академия' : 'Таланты U21'} ${icon('arrow', 15)}</button>` : ''}</div>${display}`;
}

function memoWorld(key, calculate) {
  if (!worldMemo.has(key)) {
    if (worldMemo.size >= 8) worldMemo.delete(worldMemo.keys().next().value);
    worldMemo.set(key, calculate());
  }
  return worldMemo.get(key);
}

function worldPage() {
  const { worldKind: kind, worldComp: competition, worldTab: tab, worldLimit: limit, worldQuery, worldYoung } = state;
  const key = `${kind}/${competition ?? ''}`;
  const filtered = memoWorld(key, () => filterWorld(data, kind, competition));
  const coverage = memoWorld(`${key}/coverage`, () => competitionCoverage(filtered.competitions, filtered.fixtures, filtered.stats));
  const relevant = coverage.filter(row => competition == null || competition === row.id);
  const allStats = filtered.stats;
  const imported = telemetryEntries(data.season, competition).filter(r => kind === 'all' || teams.get(r.teamId)?.kind === kind);
  const modeled = estimatedStatFields.filter(([id]) => ['passes', 'passAccuracy', 'dribbles', 'dribbleAccuracy'].includes(id));
  const metricOptions = [...worldMetrics, ...modeled.map(([id, name]) => [`model-${id}`, `${name} · оценка модели`]), ...extraStats.filter(([key]) => imported.some(r => r[key] != null)).map(([key, name]) => [key, `${name} · импорт`])];
  const seen = new Set(allStats.map(row => row.playerId));
  const query = worldQuery.trim().toLowerCase();
  const summary = [
    [relevant.length, 'Турниры'], [relevant.reduce((n, row) => n + row.played, 0), 'Сыгранные матчи'],
    [relevant.reduce((n, row) => n + row.goals, 0), 'Голы по результатам'], [new Set(allStats.filter(r => r.appearances > 0).map(r => r.playerId)).size, 'Игроки со статистикой'],
  ];
  let tableTitle, body, size, info;
  if (tab === 'players') {
    const metric = metricOptions.some(([key]) => key === state.worldMetric) ? state.worldMetric : 'goals';
    const isImported = extraStats.some(([key]) => key === metric);
    const isModel = metric.startsWith('model-');
    const staticRating = metric === 'ovr' || metric === 'potential';
    const useOnlyCompetition = competition != null;
    const merged = memoWorld(`${key}/players/${metric}`, () => {
      const ranks = playerLeaders(allStats, isModel ? 'ovr' : metric);
      if (!isModel) return ranks;
      return ranks.filter(row => row.minutes >= 270).map(row => ({ ...row, [metric]: estimatePlayerStats(players.get(row.id) ?? {}, {}, row)[metric.slice(6)] }))
        .filter(row => Number.isFinite(row[metric])).sort((a, b) => b[metric] - a[metric] || b.minutes - a.minutes);
    });
    const allowed = p => {
      if (kind === 'club' && !p.teamId) return false;
      if (kind === 'national' && !seen.has(p.id) && !p.nationalIds?.length) return false;
      return !useOnlyCompetition || seen.has(p.id);
    };
    const mergedById = staticRating ? new Map(merged.map(r => [r.id, r])) : null;
    const importedRanks = new Map();
    if (isImported) for (const row of imported) {
      if (!Number.isFinite(row[metric])) continue;
      const r = importedRanks.get(row.playerId) ?? { id: row.playerId, appearances: 0, teamIds: [], [metric]: 0 };
      r.appearances++;
      r[metric] += row[metric];
      if (row.teamId != null && !r.teamIds.includes(row.teamId)) r.teamIds.push(row.teamId);
      importedRanks.set(r.id, r);
    }
    const ranked = isImported ? [...importedRanks.values()].sort((a, b) => b[metric] - a[metric]) : staticRating ? data.players.filter(allowed).filter(p => Number.isFinite(p[metric]))
      .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name))
      .map(p => ({ ...mergedById.get(p.id), id: p.id, [metric]: p[metric] })) : merged;
    const matching = ranked.filter(r => {
      const p = players.get(r.id);
      return (!worldYoung || Number.isFinite(p?.age) && p.age <= 23) && (!query || [playerName(r.id), p?.position, p?.country, teamName(p?.teamId)].some(v => v?.toLowerCase().includes(query)));
    });
    const metricLabel = metricOptions.find(([id]) => id === metric)[1];
    const columns = (isImported ? [['appearances', 'Матчи с данными']] : [['appearances', 'М'], ['minutes', 'Мин'], ['goals', 'Г'], ['assists', 'А']]).filter(([id]) => id !== metric);
    tableTitle = 'Рейтинг игроков';
    size = matching.length;
    info = isModel ? 'Оценка по позиции, атрибутам FC 26, минутам и форме. От 270 минут.' : isImported ? 'Только матчи с импортированными данными.' : metric === 'averageRating' ? ratingInfo : metric.endsWith('Per90') ? 'От 270 минут в выбранной статистике.' : staticRating ? 'Текущие значения из базы сохранения.' : '';
    body = matching.length ? `<div class="table-scroll"><table class="world-table world-player-table"><thead><tr><th>#</th><th>Игрок</th><th>Команда</th>${columns.map(([, heading]) => `<th>${heading}</th>`).join('')}<th>${h(metricLabel)}</th></tr></thead><tbody>${matching.slice(0, limit).map((r, i) => {
      const p = players.get(r.id) ?? { id: r.id, name: playerName(r.id) };
      const ids = r.teamIds ?? [];
      const displayTeam = kind === 'national' ? (ids.find(id => teams.get(id)?.kind === 'national') ?? p.nationalIds?.[0])
        : competition != null ? (ids[0] ?? p.teamId) : (p.teamId ?? ids[0]);
      const extra = kind === 'all' && ids.some(id => teams.get(id)?.kind === 'national');
      return `<tr><td>${i + 1}</td><th scope="row"><button type="button" data-player="${p.id}" class="person-cell">${portrait(p)}<span><strong>${h(p.name)}</strong><small>${h([p.position, p.age, p.country].filter(Boolean).join(' · '))}</small></span></button></th>
        <td>${displayTeam != null ? clubBtn(displayTeam) : '—'}${extra ? '<small class="under">Есть матчи за сборную</small>' : ''}</td>
        ${columns.map(([id]) => `<td>${fmt(r[id])}</td>`).join('')}<td class="metric-score">${metric === 'averageRating' ? ratingDisplay(r) : fmt(r[metric])}</td></tr>`;
    }).join('')}</tbody></table></div>` : blank('По выбранным условиям игроки не найдены.');
  } else if (tab === 'teams') {
    const metric = state.worldClubMetric;
    const compTeams = new Set(filtered.fixtures.flatMap(m => [m.homeId, m.awayId]).concat(allStats.map(row => row.teamId)));
    const eligible = competition != null ? filtered.teams.filter(t => compTeams.has(t.id)) : filtered.teams;
    const rows = memoWorld(`${key}/teams`, () => rateTeams(eligible, filtered.fixtures));
    const rank = rows.filter(t => (metric === 'ovr' ? t.ovr > 0 : t.played > 0) && (!query || [t.name, t.league].some(v => v?.toLowerCase().includes(query))))
      .sort((a, b) => b[metric] - a[metric] || b.played - a.played || a.name.localeCompare(b.name));
    tableTitle = 'Рейтинг команд';
    size = rank.length;
    info = metric === 'power' ? 'Рейтинг силы рассчитывается по методу Эло. Старт зависит от ОВР, дальше учитываются результаты матчей выбранной выборки.' : '';
    body = rank.length ? `<div class="table-scroll"><table class="world-table"><thead><tr><th>#</th><th>Команда</th><th>ОВР</th><th>М</th><th>В–Н–П</th><th>Голы</th><th>Форма</th><th>${h(teamMetrics.find(([id]) => id === metric)[1])}</th></tr></thead><tbody>
      ${rank.slice(0, limit).map((t, i) => `<tr><td>${i + 1}</td><th scope="row">${clubBtn(t.id)}<small class="under">${h(t.kind === 'national' ? 'Сборная' : t.league)}</small></th>
      <td>${fmt(t.ovr)}</td><td>${fmt(t.played)}</td><td>${t.won}–${t.drawn}–${t.lost}</td><td>${t.goalsFor}:${t.goalsAgainst}</td><td><div class="form">${t.recent.map(formBadge).join('') || '—'}</div></td><td class="metric-score">${fmt(t[metric])}</td></tr>`).join('')}</tbody></table></div>` : blank('В этой выборке нет команд с подходящими данными. Для сборных без матчей выбери ОВР в FC 26.');
  } else {
    const rank = relevant.filter(row => !query || row.name.toLowerCase().includes(query)).sort((a, b) => b.played - a.played || b.players - a.players || a.name.localeCompare(b.name));
    tableTitle = 'Турниры в сейве';
    size = rank.length;
    info = 'Наличие матчей в календаре и наличие статистики игроков указаны отдельно.';
    body = rank.length ? `<div class="table-scroll"><table class="world-table"><thead><tr><th>#</th><th>Соревнование</th><th>Команды</th><th>Сыграно</th><th>Предстоит</th><th>Голы</th><th>Игроки со стат.</th></tr></thead><tbody>${rank.slice(0, limit).map((r, i) => `<tr><td>${i + 1}</td><th scope="row"><button type="button" class="player-name" data-tournament="${r.id}">${h(r.name)} ${icon('up', 13)}</button><small class="under">${r.kind === 'national' ? 'Сборные' : h(r.type)}</small></th><td>${r.teams}</td><td>${r.played}</td><td>${r.scheduled}</td><td>${r.goals}</td><td class="metric-score">${r.players || '—'}</td></tr>`).join('')}</tbody></table></div>` : blank('Соревнования для этой выборки не найдены.');
  }
  const compSelect = select('world-comp', compOptions(true, filtered.competitions), String(competition ?? ''), 'Соревнование');
  const metricSelect = tab === 'teams' ? select('world-club-metric', teamMetrics, state.worldClubMetric, 'Ранжирование') : tab === 'players' ? select('world-metric', metricOptions, state.worldMetric, 'Ранжирование') : '';
  return heading('Мировая статистика', data.season ? `Сезон ${data.season} · Матчи и статистика из сохранения` : 'Матчи и статистика из сохранения')
    + `<div class="world-toolbar">${switcher('world-tab', [['players', 'Игроки'], ['teams', 'Команды'], ['tournaments', 'Турниры']], tab, 'Раздел статистики')}${switcher('world-kind', groups, kind, 'Тип команд')}</div>
    <div class="strip world-strip">${summary.map(([value, name]) => `<div><strong>${fmt(value)}</strong><small>${name}</small></div>`).join('')}</div>
    <section class="box world-box">${section(tableTitle, `<span class="row-count">${fmt(size)} в выборке</span>`)}
      <div class="filters world-filters">${compSelect}${metricSelect}<label class="inline-search">${icon('search', 16)}<input id="world-filter" placeholder="${tab === 'players' ? 'Игрок, клуб или страна' : 'Поиск по названию'}" aria-label="Поиск в мировой статистике" value="${h(worldQuery)}"></label>
      ${tab === 'players' ? `<button type="button" class="button secondary" data-world-young aria-pressed="${worldYoung}">До 23 лет</button>` : ''}</div>
      ${info ? `<p class="world-note">${h(info)}</p>` : ''}${body}
      ${size > limit ? '<div class="box-footer"><button type="button" class="button secondary" data-world-more>Показать ещё</button></div>' : ''}
    </section>`;
}

function competitionsPage() {
  const comp = state.comp || data.primaryId || data.competitions[0]?.id;
  const groups = [...new Map(data.standings.filter(r => r.competitionId === comp).map(r => [r.groupId, r.groupName])).entries()];
  const clubGroup = data.standings.find(r => r.competitionId === comp && r.teamId === data.clubId)?.groupId;
  const group = groups.some(([id]) => state.group === id) ? state.group : clubGroup ?? groups[0]?.[0];
  const matches = data.fixtures.filter(m => m.competitionId === comp && m.played).sort((a, b) => b.date - a.date).slice(0, 10);
  return heading('Соревнования', 'Таблицы, результаты и лидеры турниров', select('comp', compOptions(false), String(comp ?? ''), 'Соревнование'))
    + `<div class="dashboard">
      <div class="main-column">
        <section class="box">${section(comp == null ? 'Турнирная таблица' : compName(comp), groups.length > 1 ? select('group', groups.map(([id, name], i) => [String(id), name || `Группа ${i + 1}`]), String(group), 'Этап') : '')}
          ${tableMarkup(standingsFor(comp, group), comp)}
        </section>
        <section class="box">${section('Последние результаты', comp != null ? `<button type="button" class="text-btn" data-calendar-comp="${comp}">Календарь ${icon('arrow', 14)}</button>` : '')}${matchList(matches)}
        ${comp != null ? `<div class="box-footer"><button type="button" class="text-btn" data-bracket-comp="${comp}">Этапы и шансы ${icon('arrow', 14)}</button></div>` : ''}</section>
      </div>
      <section class="box leader-box">${section('Лидеры')}${select('scope', compOptions(), String(state.scope ?? ''), 'Турнир для рейтинга')}
        ${switcher('metric', metrics, state.metric, 'Показатель')}
        ${leaders(filterStats(state.scope), state.metric, 20)}
        ${state.scope == null ? `<details class="details"><summary>Соревнования в рейтинге</summary><div>${data.competitions.filter(c => data.stats.some(r => r.competitionId === c.id)).map(c => h(c.name)).join(' · ') || 'Нет данных'}</div></details>` : ''}
      </section>
    </div>`;
}

function playersPage() {
  const filter = state.query.trim().toLowerCase();
  const available = data.players.filter(p =>
    (state.team === 'all' || state.team === 'club' && p.teamId === data.clubId || state.team === 'saved' && shortlist().includes(p.id) || state.team === String(p.teamId) || p.nationalIds?.includes(Number(state.team))) &&
    (!filter || `${p.name} ${p.position ?? ''} ${teamName(p.teamId)}`.toLowerCase().includes(filter)));
  const statMap = new Map();
  for (const row of data.stats) {
    if (!statMap.has(row.playerId)) statMap.set(row.playerId, []);
    statMap.get(row.playerId).push(row);
  }
  const ranked = available.map(p => ({ ...p, season: mergeStats(statMap.get(p.id) ?? []) }))
    .sort((a, b) => (state.order === 'name' ? a.name.localeCompare(b.name, 'ru') : ((b[state.order] ?? b.season[state.order] ?? -1) - (a[state.order] ?? a.season[state.order] ?? -1))) || a.id - b.id);
  const top = ranked.slice(0, state.limit);
  const teamOptions = [['all', 'Все игроки'], ...(data.clubId == null ? [] : [['club', 'Мой клуб']]), ['saved', 'Избранные'], ...[...data.teams].sort((a, b) => a.name.localeCompare(b.name)).map(t => [String(t.id), t.name])];
  return heading('Игроки', `${fmt(available.length)} в выборке`, data.heroId && data.mode === 'player' ? playerBtn(data.heroId, 'Мой профиль', 'button primary') : '')
    + `<section class="box"><div class="filters">
      <label class="inline-search">${icon('search')}<input id="player-filter" placeholder="Имя, позиция или клуб" aria-label="Фильтр игроков" value="${h(state.query)}"></label>
      ${select('team', teamOptions, state.team, 'Список')}${select('order', [['ovr', 'Общий рейтинг'], ['potential', 'Потенциал'], ['goals', 'Голы'], ['assists', 'Ассисты'], ['name', 'Имя']], state.order, 'Сортировка')}
    </div>
    ${top.length ? `<div class="table-scroll"><table class="player-table"><thead><tr><th scope="col">Игрок</th><th scope="col">Клуб</th><th scope="col">Амплуа</th><th scope="col">ОВР</th><th scope="col">Пот.</th><th scope="col">М</th><th scope="col">Г</th><th scope="col">А</th><th scope="col">Оценка</th><th scope="col"><span class="sr-only">Сравнение</span></th></tr></thead><tbody>
    ${top.map(p => `<tr><th scope="row"><button class="person-cell" type="button" data-player="${p.id}">${portrait(p)}<strong>${h(p.name)}</strong>${shortlist().includes(p.id) ? icon('heart', 14) : ''}</button></th><td>${h(teamName(p.teamId))}</td><td>${h(p.position || '—')}</td><td><b class="number-accent">${fmt(p.ovr)}</b></td><td>${fmt(p.potential)}</td><td>${fmt(p.season.appearances)}</td><td>${fmt(p.season.goals)}</td><td>${fmt(p.season.assists)}</td><td>${fmt(p.season.averageRating)}</td><td><button type="button" class="quiet-icon" data-compare="${p.id}" aria-label="Сравнить ${h(p.name)}" aria-pressed="${state.compare.includes(p.id)}">${icon('compare', 17)}</button></td></tr>`).join('')}</tbody></table></div>` : blank('По этому фильтру игроков нет.')}
    ${ranked.length > top.length ? '<div class="box-footer"><button type="button" class="button secondary" data-more>Показать ещё</button></div>' : ''}</section>`;
}

function matchesPage() {
  const season = activeSeason(state.calendarSeason);
  const archive = seasonData(season);
  const world = state.calendarMode === 'all';
  const teamId = world ? state.calendarClub : state.calendarTeam === 'national' && data.nationalId != null ? data.nationalId : data.clubId;
  const candidates = (archive.fixtures ?? []).filter(m => (teamId == null || [m.homeId, m.awayId].includes(teamId)) && (state.scope == null || m.competitionId === state.scope));
  const months = [...new Set(candidates.map(m => String(m.date).slice(0, 6)))].sort();
  const values = candidates.filter(m => (!state.calendarMonth || String(m.date).startsWith(state.calendarMonth)) && (state.dateFilter === 'all' || (state.dateFilter === 'played' ? m.played : !m.played)));
  values.sort((a, b) => state.dateFilter === 'next' ? a.date - b.date : b.date - a.date);
  const distinctTeams = [...new Set((archive.fixtures ?? []).filter(m => state.scope == null || m.competitionId === state.scope).flatMap(m => [m.homeId, m.awayId]))].sort((a, b) => teamName(a).localeCompare(teamName(b)));
  return heading('Матчи', teamId == null ? 'Все клубы и сборные' : teamName(teamId))
    + `<div class="page-tabs">${switcher('calendar-mode', [['mine', 'Мой календарь'], ['all', 'Все команды']], state.calendarMode, 'Календарь')}</div>
    <section class="box">${data.nationalId != null && !world ? switcher('calendar-team', [['club', 'Клуб'], ['national', 'Сборная']], state.calendarTeam, 'Календарь команды') : ''}
      <div class="filters">
      ${seasonNames().length ? select('calendar-season', seasonNames().map(y => [y, y]), season, 'Сезон') : ''}
      ${select('scope', compOptions(true, archive.competitions ?? data.competitions), String(state.scope ?? ''), 'Соревнование')}
      ${world ? select('calendar-club', [['', 'Все команды'], ...distinctTeams.map(id => [String(id), teamName(id)])], String(state.calendarClub ?? ''), 'Клуб или сборная') : ''}
      ${select('calendar-month', [['', 'Все месяцы'], ...months.map(m => [m, `${m.slice(4)}.${m.slice(0, 4)}`])], state.calendarMonth, 'Месяц')}</div>
      ${switcher('date-filter', [['all', 'Все матчи'], ['played', 'Сыграны'], ['next', 'Предстоящие']], state.dateFilter, 'Статус матча')}
      ${matchList(values.slice(0, state.calendarLimit), season)}
      ${values.length > state.calendarLimit ? '<div class="box-footer"><button type="button" class="button secondary" data-calendar-more>Показать ещё</button></div>' : ''}</section>`;
}

function matchPage() {
  const season = activeSeason(state.matchSeason);
  const bank = seasonData(season);
  const match = (bank.fixtures ?? []).find(m => m.id === state.matchId);
  if (!match) return heading('Матч') + blank('Этот матч больше не доступен в выбранном сейве.');
  const meetings = (bank.fixtures ?? []).filter(m => m.played && m.date < match.date && (
    m.homeId === match.homeId && m.awayId === match.awayId || m.homeId === match.awayId && m.awayId === match.homeId
  )).sort((a, b) => b.date - a.date).slice(0, 5);
  const detailed = new Map((data.telemetry?.[telemetryKey(season, match)] ?? []).map(row => [row.playerId, row]));
  const playerRows = id => {
    const rows = new Map((bank.stats ?? []).filter(r => r.competitionId === match.competitionId && r.teamId === id).flatMap(r => {
      const performance = r.recentMatches?.find(m => m.date === match.date && m.played);
      return performance ? [[r.playerId, { ...performance, id: r.playerId }]] : [];
    }));
    if (id === data.clubId) for (const r of bank.ratings ?? data.clubRatings ?? []) {
      if (r.date === match.date && (rows.has(r.playerId) || playerById(r.playerId)?.teamId === id)) {
        rows.set(r.playerId, { ...r, ...rows.get(r.playerId), id: r.playerId });
      }
    }
    for (const [idPlayer, row] of detailed) {
      if (rows.has(idPlayer) || row.teamId === id || row.teamId == null && playerById(idPlayer)?.teamId === id) {
        rows.set(idPlayer, { ...rows.get(idPlayer), ...row, id: idPlayer });
      }
    }
    return [...rows.values()].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.minutes ?? 0) - (a.minutes ?? 0));
  };
  const performance = id => {
    const rows = playerRows(id).map(row => ({ ...row, estimate: estimatePlayerStats(playerById(row.id) ?? {}, row, {}) }));
    const fields = [...estimatedStatFields, ...extraStats.filter(([k]) => !estimatedStatFields.some(([field]) => field === k))].filter(([k]) => rows.some(row => (row.estimate[k] ?? row[k]) != null));
    return `<section class="box">${section(teamName(id), crest(id))}
    ${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Мин</th><th>Г</th><th>Оценка</th>${fields.map(([, title]) => `<th>${title}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => `<tr><th scope="row">${playerBtn(r.id)}</th><td>${fmt(r.minutes)}</td><td>${fmt(r.goals)}</td><td class="metric-score">${fmt(r.rating)}</td>${fields.map(([k]) => `<td${r.estimate.estimated.has(k) ? ' class="desk-estimate" title="Оценка модели"' : ''}>${r.estimate.estimated.has(k) ? '≈ ' : ''}${fmt(r.estimate[k] ?? r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : blank(match.played ? 'Сейв не содержит оценок игроков за этот матч.' : 'Матч ещё не сыгран.')}</section>`;
  };
  return `<button type="button" class="text-btn back" data-nav="${state.matchReturn}">${icon('left', 17)} Назад</button>`
    + heading('Карточка матча', `${compName(match.competitionId)} · ${dateLabel(match.date, 'full')}`)
    + `<section class="match-hero">${clubBtn(match.homeId)}<strong>${score(match)}</strong>${clubBtn(match.awayId)}</section>
    ${!match.played && season === data.season ? `<section class="box match-forecast">${section('Прогноз матча', '<span class="tag">Модель панели</span>')}${matchOdds(match, true)}</section>` : ''}
    ${match.played && api && season === data.season && data.kind === 'save' ? `<div class="telemetry-line"><span>${detailed.size ? `Данные импорта: ${detailed.size} игрок(ов) · ≈ оценка модели` : '≈ Оценка пасов и обводок. CSV или JSON добавит реальные показатели.'}</span>
    <button class="button secondary" type="button" data-telemetry>Импорт CSV или JSON</button><input hidden type="file" id="telemetry-file" accept=".csv,.tsv,.json,text/csv,application/json"></div>` : ''}
     <div class="profile-grid match-grid">${performance(match.homeId)}${performance(match.awayId)}</div>
     ${meetings.length ? `<section class="box next-box">${section('Очные встречи')}${matchList(meetings, season)}</section>` : ''}`;
}

function playerSeason(id) {
  const history = memoWorld(`player-career/${id}`, () => tournamentHistory(data, id));
  const played = new Set(history.map(r => r.season));
  const seasons = seasonNames().filter(year => year === data.season || played.has(year));
  const season = seasons.includes(state.profileSeason) ? state.profileSeason : 'all';
  const rows = history.filter(r => (season === 'all' || r.season === season) && (state.profileKind === 'all' || teams.get(r.teamId)?.kind === state.profileKind));
  const choices = [...new Set(rows.map(r => r.competitionId))].filter(id => id != null).map(id => competitions.get(id) ?? { id, name: compName(id) });
  const selected = choices.some(c => c.id === state.profileComp) ? state.profileComp : null;
  return { seasons, season, history, choices, selected, related: rows.filter(r => selected == null || r.competitionId === selected) };
}

function playerProfile() {
  const { seasons, season, history, choices, selected, related } = playerSeason(state.player);
  const historical = season !== 'all' && season !== data.season ? seasonData(season).players?.find(p => p.id === state.player) : null;
  const currentPlayer = playerById(state.player) ?? { id: state.player, name: playerName(state.player) };
  const p = { ...currentPlayer, ...historical, attributes: { ...currentPlayer.attributes, ...historical?.attributes } };
  const summary = summaryForPlayer(related);
  const detail = [p.position, p.age ? `${p.age} ${({ one: 'год', few: 'года' })[ages.select(p.age)] ?? 'лет'}` : null, p.country, p.foot ? `${p.foot.toLowerCase()} нога` : null].filter(Boolean).join(' · ');
  const profileAwards = awardRows().filter(r => r.playerId === p.id);
  const roles = traits.filter(([key]) => p.position === 'ВР' || !key.startsWith('gk'));
  const latest = related.flatMap(r => (r.recentMatches ?? []).filter(m => m.played).map(m => ({ ...m, competitionId: r.competitionId }))).sort((a, b) => b.date - a.date).slice(0, 10);
  let body = '';
  if (state.profileTab === 'stats') {
    const tournamentRows = Map.groupBy(related, r => `${r.season}/${r.competitionId}/${r.teamId}`);
    const cells = s => ['appearances', 'minutes', 'goals', 'assists', 'contributions', 'averageRating'].map(key => `<td${key === 'contributions' ? ' class="metric-score"' : ''}>${fmt(s[key])}</td>`).join('');
    body = `<div class="profile-grid"><section class="box">${section('Статистика по турнирам', select('profile-comp', compOptions(true, choices), String(selected ?? ''), 'Турнир игрока'))}
      ${related.length ? `<div class="table-scroll"><table class="player-tournaments"><thead><tr><th>Турнир</th><th>М</th><th>Мин</th><th>Г</th><th>А</th><th>Г+А</th><th>Оценка</th></tr></thead><tbody>
      ${[...tournamentRows.values()].map(rows => {
        const { competitionId, teamId, season: year } = rows[0];
        return `<tr><th scope="row">${h(compName(competitionId))}<small class="under">${h([teamName(teamId), season === 'all' ? year : null].filter(Boolean).join(' · '))}</small></th>${cells(summaryForPlayer(rows))}</tr>`;
      }).join('')}</tbody><tfoot><tr><th scope="row">Итого</th>${cells(summary)}</tr></tfoot></table></div>` : blank('Статистика для этого игрока в сейве не найдена.')}
      </section><section class="box">${section('Показатели')}${keyValues([['Голы за 90 минут', fmt(summary.per90)], ['Гол + пас', fmt(summary.goals == null && summary.assists == null ? null : (summary.goals ?? 0) + (summary.assists ?? 0))], ...totals.filter(([key]) => !['goals', 'appearances', 'assists'].includes(key)).map(([key, label]) => [label, fmt(summary[key])])])}</section></div>`;
  } else if (state.profileTab === 'attributes') {
    body = `<div class="profile-grid"><section class="box">${section('Атрибуты')}${roles.some(([key]) => Number.isFinite(p.attributes[key])) ? `<div class="attributes">${roles.map(([key, label]) => {
      const n = p.attributes[key];
      return `<div class="attribute"><span>${h(label)}</span>${Number.isFinite(n) ? `<meter min="0" max="99" value="${n}" aria-label="${h(label)}"></meter>` : '<span></span>'}<b>${fmt(n)}</b></div>`;
    }).join('')}</div>` : blank('Атрибуты в сейве не найдены.')}</section>
      <section class="box">${section('Личные данные')}${keyValues([
        ['Клуб', teamName(p.teamId)], ['Сборные в сейве', p.nationalIds?.map(teamName).join(', ') || '—'],
        ['Рост', p.height ? `${p.height} см` : '—'], ['Вес', p.weight ? `${p.weight} кг` : '—'],
        ['Рабочая нога', p.foot ?? '—'], ['Гражданство', p.country ?? '—'],
        ['Финты', p.skillMoves > 0 ? `${p.skillMoves}/5` : '—'], ['Слабая нога', p.weakFoot > 0 ? `${p.weakFoot}/5` : '—'],
        ['Контракт до', fmt(p.contractUntil)], ['Зарплата по сейву', fmt(p.wage)],
      ])}</section></div>`;
  } else if (state.profileTab === 'form') {
    body = `<section class="box">${section('Последние выступления', select('profile-comp', compOptions(true, choices), String(selected ?? ''), 'Турнир игрока'))}
    ${latest.length ? `<div class="table-scroll"><table><thead><tr><th>Дата</th><th>Турнир</th><th>Минуты</th><th>Голы</th><th>Оценка</th></tr></thead><tbody>${latest.map(m => `<tr><th scope="row">${h(dateLabel(m.date))}</th><td>${h(compName(m.competitionId))}</td><td>${fmt(m.minutes)}</td><td>${fmt(m.goals)}</td><td><b>${fmt(m.rating)}</b></td></tr>`).join('')}</tbody></table></div>` : blank('Матчи игрока для этого фильтра недоступны.')}</section>`;
  } else if (state.profileTab === 'history') {
    const records = seasons.map(year => {
      const archive = seasonData(year);
      const rows = history.filter(r => r.season === year);
      const player = archive.players?.find(r => r.id === p.id);
      return { year, player, s: summaryForPlayer(rows), competitions: new Set(rows.map(r => r.competitionId)).size };
    });
    body = `<section class="box">${section('История игрока по сезонам')}
    ${records.length ? `<div class="table-scroll"><table><thead><tr><th>Сезон</th><th>Клуб</th><th>ОВР</th><th>Турниры</th><th>М</th><th>Мин</th><th>Г</th><th>А</th><th>Г+А</th><th>Оценка</th><th>ЖК</th><th>КК</th></tr></thead><tbody>
    ${records.map(({ year, player, s, competitions }) => `<tr><th><button type="button" class="player-name" data-profile-year="${h(year)}">${h(year)}</button></th><td>${h(teamName(player?.teamId))}</td><td>${fmt(player?.ovr)}</td><td>${competitions}</td>
    ${['appearances','minutes','goals','assists','contributions','averageRating','yellowCards','redCards'].map(k => `<td class="${k === 'contributions' ? 'metric-score' : ''}">${fmt(s[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : blank('Для игрока ещё нет сохранённых сезонов.')}</section>`;
  } else if (state.profileTab === 'advanced') {
    const imported = telemetryEntries(season, selected).filter(r => r.playerId === p.id && (state.profileKind === 'all' || teams.get(r.teamId)?.kind === state.profileKind));
    const heroData = p.id === data.heroId ? data.playerMeta ?? [] : [];
    const fields = extraStats.filter(([key]) => imported.some(r => r[key] != null));
    const estimate = estimatePlayerStats(p, {}, summary);
    body = `<section class="box">${section('Пасы и обводки за период', select('profile-comp', compOptions(true, choices), String(selected ?? ''), 'Турнир игрока'))}
    ${estimate.source !== 'unavailable' ? `<p class="fine">Оценка за ${fmt(estimate.minutes)} минут по позиции, атрибутам FC 26 и средней оценке матчей.</p>${keyValues(estimatedStatFields.map(([key, title]) => [title, `≈ ${fmt(estimate[key])}`]))}` : blank('Для оценки пока недостаточно данных о сыгранных минутах.')}</section>
    <section class="box next-box">${section('Фактическая статистика из импорта')}
    ${imported.length ? `<div class="table-scroll"><table><thead><tr><th>Матч</th>${fields.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>
    ${imported.sort((a,b) => b.date-a.date).map(r => `<tr><th scope="row">${h(dateLabel(r.date))}</th>${fields.map(([key]) => `<td>${fmt(r[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : blank('Добавь CSV или JSON послематчевой статистики в карточке сыгранной встречи.')}</section>`
    + (heroData.length ? `<section class="box next-box">${section('Сезонные записи карьеры игрока')}
    <div class="table-scroll"><table><thead><tr><th>Сезон игры</th><th>Клуб</th><th>Пасы</th><th>Точные</th><th>Удары</th><th>В створ</th><th>Отборы</th></tr></thead><tbody>
    ${heroData.map(r => `<tr><th scope="row">${fmt(r.season)}</th><td>${h(teamName(r.teamid))}</td>${['totalpasses','passesontarget','totalshots','shotsontarget','totaltackles'].map(key => `<td>${fmt(r[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : '');
  } else {
    body = `<section class="box">${section('Награды игрока')}${awardList(profileAwards)}</section>`;
  }
  return `<button type="button" class="text-btn back" data-nav="${state.lastPage}">${icon('left', 17)} Назад</button>
    <section class="profile-hero">
      <div class="profile-photo">${portrait(p, true)}<button type="button" class="quiet-icon photo-action" aria-label="Добавить фото игрока" data-photo>${icon('camera')}</button><input hidden id="photo-file" type="file" accept="image/png,image/jpeg,image/webp"></div>
      <div class="profile-details"><div class="profile-club">${p.teamId != null ? clubBtn(p.teamId) : h(teamName(p.teamId))}${p.number != null ? `<span>· №${p.number}</span>` : ''}</div>
        <h1>${h(p.name)}</h1><p>${h(detail || 'Карточка игрока')}</p>
        <div class="profile-actions"><button type="button" class="button ghost" data-favorite="${p.id}" aria-pressed="${shortlist().includes(p.id)}">${icon('heart', 16)}${shortlist().includes(p.id) ? 'В избранном' : 'В избранное'}</button>
        <button type="button" data-compare="${p.id}" aria-pressed="${state.compare.includes(p.id)}" class="button ghost">${icon('compare', 16)} Сравнить</button>
        <button type="button" data-export="${p.id}" class="button ghost">${icon('camera', 16)} Карточка PNG</button>${data.clubId != null && players.has(p.id) && !p.academy ? `<button type="button" data-desk-offer="${p.id}" class="button ghost">${icon('radar', 16)} Предложение</button>` : ''}</div>
      </div>
      <div class="profile-ovr"><strong>${fmt(p.ovr)}</strong><span>Общий рейтинг</span><small>Потенциал <b>${fmt(p.potential)}</b></small></div>
    </section>
    <div class="strip profile-strip">${[['appearances', 'Матчи'], ['goals', 'Голы'], ['assists', 'Ассисты'], ['contributions', 'Гол + пас'], ['averageRating', 'Ср. оценка']].map(([key, label]) => `<div><strong>${fmt(summary[key])}</strong><small>${label}</small></div>`).join('')}</div>
    <div class="profile-tabs">${switcher('profile-tab', [['stats', 'Статистика'], ['history', 'История'], ['form', 'Матчи'], ['advanced', 'Пасы и обводки'], ['attributes', 'Атрибуты'], ['awards', 'Награды']], state.profileTab, 'Вкладки футболиста')}
    ${seasons.length ? select('profile-season', [['all', 'Вся карьера'], ...seasons.map(y => [y, y])], season, 'Сезон') : ''}
    ${['stats', 'form', 'advanced'].includes(state.profileTab) ? switcher('profile-kind', groups, state.profileKind, 'Клубы и сборные игрока') : ''}</div>
    ${body}`;
}

function keyValues(rows) {
  return `<dl class="key-values">${rows.map(([k, v]) => `<div><dt>${h(k)}</dt><dd>${h(v)}</dd></div>`).join('')}</dl>`;
}
function awardRows() {
  const imported = Object.values(data.history ?? {}).flatMap(s => s.awards ?? []).concat(data.awards ?? []);
  const unique = new Map(imported.map(a => [`${a.playerId}/${a.teamId}/${a.season}/${a.type ?? a.title}`, a]));
  return [...unique.values(), ...(customAwards[data.key] ?? []).filter(row => row.playerId == null || playerById(row.playerId))];
}
function awardList(rows) {
  if (!rows.length) return blank('В этой карьере пока нет записанных наград.');
  return `<ul class="awards-list">${rows.map(a => `<li><span class="award-icon">${icon('trophy')}</span><div><strong>${h(a.title ?? `Игровая награда · код ${a.type}`)}</strong>
    <small>${typeof a.season === 'number' ? `Сезон #${a.season}` : h(a.season || 'Сезон неизвестен')}${a.manual ? ' · Добавлено вручную' : ''}</small></div>
    ${a.playerId == null ? `<b>${h(a.winner || '—')}</b>` : playerBtn(a.playerId)}
    ${a.count > 1 ? `<b>×${a.count}</b>` : ''}</li>`).join('')}</ul>`;
}
function awardsPage() {
  const honourRows = new Map((data.honours ?? []).concat(...Object.values(data.history ?? {}).map(s => s.honours ?? [])).map(r => [`${r.teamId}/${r.competitionId}/${r.season}`, r]));
  const records = `
    <section class="box">${section('Индивидуальные награды')}
      ${awardList(awardRows())}
      <details class="details"><summary>Записать награду вручную</summary>
      <form id="award-form" class="filters award-form"><label class="selection"><span>Награда</span><input name="award" required maxlength="60" placeholder="Золотой мяч"></label><label class="selection"><span>Имя победителя</span><input name="winner" required maxlength="80" placeholder="Имя игрока"></label>
      <button type="submit" class="button secondary">Записать</button></form></details>
    </section>
    <section class="box">${section('Командные трофеи')}
      ${honourRows.size ? `<ul class="awards-list">${[...honourRows.values()].map(r => `<li><span class="award-icon">${icon('trophy')}</span><div><strong>${h(compName(r.competitionId))}</strong><small>${h(typeof r.season === 'number' ? `Сезон #${r.season}` : r.season)}</small></div>${clubBtn(r.teamId)}</li>`).join('')}</ul>` : blank('Командные трофеи в сейве пока не найдены.')}</section>`;
  return honoursPage(context(), records);
}

function comparison() {
  const people = state.compare.map(id => players.get(id)).filter(Boolean);
  const rows = people.map(p => mergeStats(data.stats.filter(r => p.id === r.playerId && (state.scope == null || state.scope === r.competitionId))));
  const labels = [['ovr', 'Общий рейтинг'], ['potential', 'Потенциал'], ['minutes', 'Минуты'], ['goals', 'Голы'], ['assists', 'Ассисты'], ['per90', 'Голы за 90 минут'], ['averageRating', 'Средняя оценка']];
  return heading('Сравнение игроков', 'До двух футболистов в одной выборке', select('scope', compOptions(), String(state.scope ?? ''), 'Турнир'))
    + `<section class="box"><div class="compare-people">${[0, 1].map(index => {
      const p = people[index];
      return p ? `<div>${portrait(p, true)}<h2>${playerBtn(p.id)}</h2><p>${h(teamName(p.teamId))}</p><button data-compare="${p.id}" class="text-btn" type="button">Убрать ${icon('close', 14)}</button></div>`
        : `<div class="compare-empty">${icon('compare', 32)}<h2>Место для игрока</h2>${action('Выбрать в списке', 'players', 'button secondary')}</div>`;
    }).join('')}</div>${people.length ? `<div class="table-scroll"><table><thead><tr><th>Показатель</th>${people.map(p => `<th>${h(p.name)}</th>`).join('')}</tr></thead><tbody>${labels.map(([key, label]) => {
      const values = people.map((p, i) => p[key] ?? rows[i][key]);
      return `<tr><th scope="row">${label}</th>${values.map((n, i) => `<td class="${values.length === 2 && n != null && values[1 - i] != null && n > values[1 - i] ? 'number-accent' : ''}">${fmt(n)}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table></div>` : ''}</section>`;
}

function historyPage() {
  const years = Array.from(new Set([...Object.keys(data.history ?? {}), ...(data.season ? [data.season] : [])])).sort().reverse();
  const year = years.includes(state.history) ? state.history : years[0];
  const archive = year === data.season ? data.seasonArchive : data.history?.[year];
  const rows = archive?.stats ?? (year === data.season ? data.stats : []);
  const scorers = leaderRows(rows, 'goals').slice(0, 12);
  const playerHistory = data.playerMeta ?? [];
  return heading('История сезонов', 'Статистика из сохранений, которые открывала панель', `<div class="heading-actions">${years.length ? select('year', years.map(y => [y, y]), year, 'Сезон') : ''}
    ${api && data.archiveId ? '<button type="button" class="button secondary" data-import-archive>Добавить старые сейвы</button>' : ''}</div>`)
    + `<section class="box">${section('Бомбардиры сезона')}
    ${scorers.length ? `<div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Матчи</th><th>Минуты</th><th>Голы</th><th>Ассисты</th><th>Оценка</th></tr></thead><tbody>${scorers.map(r => `<tr><th scope="row"><button type="button" class="player-name" data-player="${r.id}" data-player-season="${h(year)}">${h(playerName(r.id))}</button></th><td>${fmt(r.appearances)}</td><td>${fmt(r.minutes)}</td><td><b>${fmt(r.goals)}</b></td><td>${fmt(r.assists)}</td><td>${fmt(r.averageRating)}</td></tr>`).join('')}</tbody></table></div>` : blank('История появится после первого доступного сейва.')}
    ${archive?.date ? `<p class="fine">Последнее сохранение за сезон: ${h(dateLabel(archive.date, 'full'))}.</p>` : ''}</section>`
    + (playerHistory.length ? `<section class="box next-box">${section('История карьеры игрока')}
      <div class="table-scroll"><table><thead><tr><th>Клуб</th><th>Сезон</th><th>Матчи</th><th>Голы</th><th>Ассисты</th><th>Удары</th><th>Сейвы</th></tr></thead><tbody>
      ${playerHistory.map(r => `<tr><th scope="row">${h(teamName(r.teamid))}</th><td>${fmt(r.season)}</td><td>${fmt(r.appearances)}</td><td>${fmt(r.goals)}</td><td>${fmt(r.assists)}</td><td>${fmt(r.totalshots)}</td><td>${fmt(r.saves)}</td></tr>`).join('')}</tbody></table></div></section>` : '')
    + (api && data.saveKey && (source.archives ?? []).some(a => a.id !== data.archiveId) ? `<details class="details archive-link"><summary>Продолжить существующий архив с этого сейва</summary>
    <form id="link-archive" class="filters"><label class="selection"><span>Архив</span><select name="archive" required><option value="">Выбрать архив</option>
    ${source.archives.filter(a => a.id !== data.archiveId).map(a => `<option value="${h(a.id)}">${h([a.title, a.season, dateLabel(a.date, 'full')].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>
    <button class="button secondary" type="submit">Привязать сейв</button></form></details>` : '');
}

function settings() {
  return heading('Настройки') + `<div class="main-column settings">
    <section class="box">${section('Источник данных')}${keyValues([['Режим', data.kind === 'demo' ? 'Демоданные' : modeName()], ['Файл', source.source ?? 'Сейв пока не выбран'], ['Автообновление', source.followLatest ? 'Последний сейв в стандартной папке' : source.source ? 'После записи выбранного сейва' : 'Ожидание сейва'], ['Последняя синхронизация', data.modified ? new Date(data.modified).toLocaleString('ru-RU') : '—']])}
    ${api ? `<div class="filters"><button type="button" class="button primary" data-connect>${icon('upload', 17)} Выбрать сейв</button><button type="button" class="button secondary" data-resume>Найти последний сейв</button></div>` : '<p class="fine">Открой настольную версию, чтобы подключить сейв FC 26.</p>'}</section>
    <section class="box">${section('Портреты и эмблемы')}${keyValues([['Онлайн-источник', 'Публичные изображения EA'], ['Локальный экспорт', source.artwork?.folder ?? 'Папка не выбрана'], ['Найдено в папке', source.artwork?.folder ? `${source.artwork.players} портретов · ${source.artwork.teams} эмблем` : '—']])}
    ${api ? `<div class="filters"><button type="button" class="button secondary" data-images>${icon('camera', 16)} Папка экспорта FC 26</button></div>` : ''}</section>
    <section class="box">${section('Панель поверх игры')}${keyValues([['Горячая клавиша', api && !source.hotkey ? 'F10 в панели · глобально доступ через трей' : 'F10'], ['Режим экрана в FC 26', 'Оконный без рамки']])}
    ${api ? `<label class="settings-toggle"><input type="checkbox" data-startup${source.startup ? ' checked' : ''}> Запускать свёрнутой вместе с Windows</label>` : ''}</section>
    ${api ? `<section class="box">${section('Связь с EA SPORTS FC 26')}${keyValues([['Состояние', source.game?.ready ? 'Окно доступно' : source.game?.pid ? 'Запускается' : 'Игра закрыта']])}
    <label class="settings-toggle"><input type="checkbox" data-game-auto${source.game?.autoOpen !== false ? ' checked' : ''}> Открывать следующий матч при запуске FC 26</label>
    <form id="game-launcher" class="filters"><label class="inline-search game-path">${icon('panel', 16)}<input id="game-path" name="path" aria-label="Путь к файлу или ярлыку запуска" placeholder="Путь к файлу или ярлыку" value="${h(source.game?.path ?? '')}" required></label><button type="submit" class="button secondary">Сохранить путь</button></form>
    <div class="filters"><button type="button" class="button secondary" data-choose-game>Выбрать файл или ярлык</button><button type="button" class="button secondary" data-open-game>${source.game?.ready ? 'Вернуться в FC 26' : 'Запустить FC 26'}</button>${action('Записать кнопки FC 26', 'sync', 'button secondary', 'sliders')}</div></section>` : ''}
    ${data.kind === 'demo' ? `<section class="box">${section('Режим демонстрации')}${switcher('demo-mode', [['manager', 'Карьера тренера'], ['player', 'Карьера игрока']], state.demoMode, 'Режим демонстрации')}</section>` : ''}</div>`;
}

const pages = { overview: () => deskHome(deskContext()), dashboard: clubOverview, matchday: () => deskMatch(deskContext()), report: () => deskReport(deskContext()),
  briefing: () => deskNews(deskContext()), inbox: () => deskInbox(deskContext()), market: () => deskMarket(deskContext()), 'sim-results': () => deskResults(deskContext()),
  sync: () => deskSync(deskContext()),
  kickoff: kickoffPage, world: worldPage, europe: () => europeanPage(context()), competitions: competitionsPage, players: playersPage,
  profile: playerProfile, club: clubPage, matches: matchesPage, match: matchPage, awards: awardsPage, academy: () => academyPage(context()),
  radar: () => transfersPage(context()), compare: comparison, history: historyPage, settings };
function render() {
  const focused = document.activeElement;
  const activeId = focused?.id;
  const selection = activeId && focused instanceof HTMLInputElement && ['search', 'text'].includes(focused.type) ? [focused.selectionStart, focused.selectionEnd] : null;
  const activeSection = { profile: state.lastPage, club: state.clubReturn, match: state.matchReturn, dashboard: 'overview', kickoff: 'matchday', report: 'matchday', 'sim-results': 'overview' };
  const selectedPage = activeSection[activeSection[state.page]] ?? activeSection[state.page] ?? state.page;
  const demoData = data.kind === 'demo';
  const stateLabel = source.state === 'error' ? 'Ошибка сейва' : source.state === 'loading' ? 'Читаем сейв' : demoData ? 'Демоданные' : 'Сейв подключён';
  element.innerHTML = `<aside class="sidebar ${state.menu ? 'open' : ''}">
    <button type="button" class="brand" data-nav="overview"><span class="brand-mark">${icon('mark', 25)}</span><span>Пятый тайм<small>ЦЕНТР КАРЬЕРЫ · FC 26</small></span></button>
    <button type="button" class="current-club"${data.clubId != null ? ` data-club="${data.clubId}"` : ''}>${crest(data.clubId)}<div><strong>${h(club()?.name ?? 'Моя карьера')}</strong><small>${h(modeName())}</small></div></button>
    <nav aria-label="Карьера">${navigation.map(([id, name, label]) => `<button type="button" data-nav="${id}"${selectedPage === id ? ' aria-current="page"' : ''}>${icon(name)}<span>${label}</span>${id === 'compare' && state.compare.length ? `<b class="nav-count">${state.compare.length}</b>` : ''}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><button type="button" data-nav="settings"${selectedPage === 'settings' ? ' aria-current="page"' : ''}>${icon('sliders')}<span>Настройки</span></button>
    <div class="hotkey">${icon('panel', 16)}<div><span>Панель поверх игры</span><kbd>F10</kbd></div></div></div></aside>
    <div class="surface">
    <header class="topbar"><button type="button" class="quiet-icon mobile-menu" data-menu aria-label="Открыть меню" aria-expanded="${state.menu}">${icon('menu')}</button><span class="crumb">Центр карьеры <b>/</b> ${h(({ club: 'Клуб', profile: 'Профиль игрока', match: 'Матч' })[state.page] ?? screen(selectedPage))}</span>
    <div class="top-actions"><div class="global-search"><label class="inline-search">${icon('search', 17)}<input type="search" id="quick-search" placeholder="Игрок, клуб или турнир" autocomplete="off" aria-label="Поиск игрока, клуба или турнира" value="${h(state.playerSearch)}"><kbd>Ctrl K</kbd></label><div id="quick-results" class="quick-results" hidden></div></div>
    <div class="status ${source.state}" title="${h(source.message || stateLabel)}"><i></i>${stateLabel}</div>
    ${api ? `<button class="button secondary top-connect" type="button" data-connect>${icon('upload', 16)}<span>${source.source ? 'Сменить сейв' : 'Подключить сейв'}</span></button><button class="quiet-icon" type="button" data-hide aria-label="Свернуть панель">${icon('close', 18)}</button>` : action('Подключить сейв', 'settings', 'button secondary top-connect', 'upload')}
    </div></header>
    <main id="content" tabindex="-1">
    ${source.message ? `<p class="banner" role="status">${h(source.message)}</p>` : ''}
    ${pages[state.page]()}
    </main></div>`;
  if (state.playerSearch) updateQuickSearch();
  if (activeId) {
    const next = document.getElementById(activeId);
    next?.focus({ preventScroll: true });
    if (next?.type === 'text' && selection) next.setSelectionRange(...selection);
  }
}
function announce(message) {
  const notice = document.querySelector('#notice');
  notice.textContent = message;
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => { notice.textContent = ''; }, 2800);
}
function navigate(page, id, season = null) {
  if (!pages[page]) return;
  if (page === 'profile' && !playerById(id)) return;
  if (state.page !== page) state.deskGuide = null;
  if (page === 'profile') {
    if (state.page !== 'profile') state.lastPage = state.page;
    state.player = id;
    state.profileTab = 'stats';
    state.profileKind = 'all';
    state.profileSeason = season;
    state.profileComp = null;
  }
  if (page === 'club' && id != null) {
    if (state.page !== 'club') state.clubReturn = state.page === 'profile' ? (state.lastPage === 'club' ? 'players' : state.lastPage) : state.page;
    state.clubView = id;
    state.scope = null;
    state.clubTab = 'overview';
    state.clubSeason = season;
  }
  if (page === 'match' && id != null) {
    if (state.page !== 'match') state.matchReturn = state.page;
    state.matchId = id;
    state.matchSeason = season;
  }
  state.page = page;
  state.menu = false;
  state.playerSearch = '';
  render();
  window.scrollTo(0, 0);
  document.querySelector('#content').focus({ preventScroll: true });
}
function acceptStatus(value) {
  const oldKey = deskKey();
  const oldCareer = data.key;
  source = value;
  setData(value.career ?? { ...demo, mode: state.demoMode });
  if (deskKey() !== oldKey) {
    state.compare = [];
    state.comp = state.group = state.scope = state.history = null;
    state.team = data.clubId == null ? 'all' : 'club';
    state.player = null;
    state.calendarTeam = 'club';
    state.calendarMode = 'mine';
    state.calendarClub = state.calendarSeason = state.clubSeason = state.profileSeason = null;
    state.calendarMonth = '';
    state.euroComp = state.awardSeason = null;
    state.worldComp = null;
    state.worldLimit = 25;
    state.academyClub = state.academyComp = null;
    state.academyView = 'own';
    state.academyLimit = 24;
    state.kickoffResult = null;
    state.deskLineup = state.deskGuide = state.deskReport = state.deskMessage = state.deskTransferPlayer = state.deskSlot = null;
    state.deskMarketQuery = '';
    state.page = 'overview';
    const old = deskRecords.get(oldKey);
    if (old?.value.pending && data.key === oldCareer) {
      const key = deskKey();
      void deskRecord().ready.then(() => {
        if (deskKey() !== key || deskRecord().value.pending) return;
        saveDesk({ pending: old.value.pending });
        saveDeskFor(oldKey, old, { pending: null });
        if (!checkGameReport()) render();
      });
    }
  }
  if (value.state === 'synced' && checkGameReport()) return;
  if (openGamePage(value.game)) return;
  render();
}
function openGamePage(game) {
  if (data.kind !== 'save' || !(game?.openToken > state.gameToken)) return false;
  state.gameToken = game.openToken;
  navigate('matchday');
  return true;
}
function acceptGame(game) {
  if (game.openToken < (source.game?.openToken ?? 0)) return;
  source.game = game;
  if (!openGamePage(game) && ['overview', 'kickoff', 'matchday', 'market', 'settings', 'sync'].includes(state.page)) render();
  if (game.message) announce(game.message);
}
function updateQuickSearch() {
  const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const query = normalize(state.playerSearch.trim());
  const box = document.querySelector('#quick-results');
  box.hidden = !query;
  if (!query) return;
  const playerMatches = state.searchType === 'all' || state.searchType === 'players' ? data.players
    .filter(p => p.gender !== 1 && normalize(p.name).includes(query))
    .sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || (b.ovr ?? 0) - (a.ovr ?? 0))
    .slice(0, state.searchType === 'all' ? 6 : 12) : [];
  const clubMatches = state.searchType === 'all' || state.searchType === 'clubs' ? data.teams.filter(t => normalize(t.name).includes(query)).slice(0, state.searchType === 'all' ? 3 : 10) : [];
  const tournamentMatches = state.searchType === 'all' || state.searchType === 'cups' ? orderCompetitions(data.competitions)
    .filter(t => normalize(`${t.name} ${compName(t.id)}`).includes(query)).slice(0, state.searchType === 'all' ? 2 : 10) : [];
  const results = playerMatches.map(p => `<button class="search-result" type="button" data-player="${p.id}">${portrait(p)}<span><strong>${h(p.name)}</strong><small>${h([p.position, teamName(p.teamId)].filter(Boolean).join(' · '))}</small></span><b>${fmt(p.ovr)}</b></button>`)
    .concat(clubMatches.map(t => `<button class="search-result" type="button" data-club="${t.id}">${crest(t.id)}<span><strong>${h(t.name)}</strong><small>${t.kind === 'national' ? 'Сборная' : 'Клуб'}</small></span>${icon('up', 15)}</button>`),
      tournamentMatches.map(t => `<button class="search-result" type="button" data-tournament="${t.id}">${icon('trophy', 22)}<span><strong>${h(compName(t.id))}</strong><small>Соревнование</small></span>${icon('up', 15)}</button>`));
  box.innerHTML = switcher('search-type', [['all', 'Все'], ['players', 'Игроки'], ['clubs', 'Клубы'], ['cups', 'Турниры']], state.searchType, 'Категория поиска') + (results.join('') || blank('Совпадений не найдено.'));
}
function toggleFavorite(id) {
  const ids = shortlist();
  favorites[data.key] = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
  localStorage.setItem('career:favorites', JSON.stringify(favorites));
  render();
}
function toggleComparison(id) {
  if (!players.has(id)) { announce('Игрока нет в доступной базе сравнения.'); return; }
  if (state.compare.includes(id)) state.compare = state.compare.filter(value => value !== id);
  else {
    if (state.compare.length === 2) { announce('В сравнении уже два игрока. Убери одного в разделе «Сравнение».'); return; }
    state.compare.push(id);
    announce(`Добавлен к сравнению: ${playerName(id)}`);
  }
  render();
}

function offerTerms() {
  const form = document.querySelector('#desk-offer');
  return form?.reportValidity() ? Object.fromEntries(new FormData(form)) : null;
}
async function handoffToGame(text) {
  try {
    if (!await api.copyPlan(text)) { announce('Не удалось скопировать план.'); return; }
    announce('План скопирован.');
    if (source.game?.ready) acceptGame(await api.returnGame());
    else announce('План скопирован. Открой FC 26 привычным способом.');
  } catch { announce('Не удалось передать план.'); }
}
async function sendCareerAction(command) {
  const key = deskKey();
  await deskRecord().ready;
  if (key !== deskKey()) return;
  const ctx = deskContext();
  if (!ctx.live || ctx.session.pending && command !== 'tactics') return;
  if (!source.game?.actions?.includes(command)) { state.controlFocus = command; navigate('sync'); return; }
  if (state.liveSending) return;
  const next = nextFixture(data);
  if (['play', 'sim'].includes(command) && (!next || data.date !== next.date)) { announce('Сначала перейди к дате матча в FC 26.'); return; }
  const pending = command === 'tactics' ? null : ['day', 'next'].includes(command) ? { kind: 'calendar', date: data.date } : {
    kind: 'match', date: next.date, competitionId: next.competitionId, homeId: next.homeId, awayId: next.awayId,
  };
  state.liveSending = true;
  try {
    if (pending) { saveDesk({ pending }); render(); }
    const update = await api.gameAction(command);
    if (key === deskKey() && pending && !update.sent && deskRecord().value.pending === pending) saveDesk({ pending: null });
    acceptGame(update);
    if (update.sent && pending) checkGameReport();
  } catch {
    if (key === deskKey() && pending && deskRecord().value.pending === pending) saveDesk({ pending: null });
    announce('Не удалось передать команду в FC 26.'); render();
  } finally { state.liveSending = false; }
}
async function runDesk(command) {
  await deskRecord().ready;
  const ctx = deskContext();
  const { data: scenario, sim, session } = ctx;
  if (command === 'cancel-bind' || command === 'live-focus') {
    try { acceptGame(await (command === 'cancel-bind' ? api.cancelBinding() : api.returnGame())); }
    catch { announce('Не удалось связаться с окном FC 26.'); }
    return;
  }
  if (command === 'cancel-live') { saveDesk({ pending: null }); if (source.game?.awaitingFocus) acceptGame(await api.cancelBinding()); else render(); return; }
  if (['day', 'skip', 'skip-match'].includes(command)) {
    const next = advanceSimulation(scenario, sim, command === 'day' ? 1 : Infinity);
    saveDesk({ sim: next });
    if (matchday(scenario, next)?.date === next.date) navigate('matchday');
    else render();
    return;
  }
  if (command === 'auto') {
    const lineup = suggestLineup(scenario, { ...sim, lineup: [] });
    state.deskLineup = lineup;
    saveDesk({ sim: { ...session.sim, lineup } });
  } else if (command === 'play') {
    const next = playSimulation(scenario, sim);
    if (next === sim || next.lastMatchId == null) { announce('Подготовь состав и перейди к дате матча.'); return; }
    saveDesk({ sim: next });
    state.deskReport = next.lastMatchId;
    navigate('report');
    return;
  } else if (command === 'top') {
    state.worldTab = 'players'; state.worldMetric = 'averageRating'; state.worldKind = 'all'; state.worldComp = null; state.worldQuery = ''; state.worldLimit = 25;
    navigate('world');
    return;
  } else if (command === 'read-all') {
    saveDesk({ read: [...new Set([...session.read, ...deskMessages(ctx).map(message => message.id)])] });
  } else if (command === 'news-refresh') {
    await loadWorldNews();
    return;
  } else if (command === 'results-more') {
    state.deskResultLimit = (state.deskResultLimit ?? 30) + 30;
  } else if (command === 'guide-offer') {
    const terms = offerTerms();
    if (!terms) return;
    state.deskOfferTerms = terms;
    state.deskGuide = 'offer';
  } else if (command === 'guide-play' || command === 'guide-sim') {
    state.deskGuide = command === 'guide-sim' ? 'sim' : 'play';
  } else if (command === 'handoff-match') {
    const match = matchday(scenario, sim);
    if (!careerFixture(data, match)) return;
    const lineup = validateLineup(scenario, state.deskLineup ?? (sim.lineup.length ? sim.lineup : suggestLineup(scenario, sim)));
    saveDesk({ pending: { kind: 'match', date: match.date, homeId: match.homeId, awayId: match.awayId, competitionId: match.competitionId } });
    await handoffToGame(`${teamName(match.homeId)} — ${teamName(match.awayId)} · ${dateLabel(match.date, 'full')}\n${lineup.map((id, i) => `${i + 1}. ${playerName(id)}`).join('\n')}`);
    return;
  } else if (command === 'handoff-offer') {
    const terms = offerTerms();
    const player = scenario.players.find(p => p.id === state.deskTransferPlayer);
    if (!terms || !player) return;
    const destination = player.teamId === data.clubId ? state.deskBuyer : data.clubId;
    await handoffToGame([player.name, `${teamName(player.teamId)} → ${teamName(destination)}`, `Трансфер ${money(+terms.fee)}`, `Зарплата ${money(+terms.wage)} в неделю`, `Контракт ${terms.years} лет`].join('\n'));
    return;
  }
  render();
}
async function storePhoto(file, id) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    announce('Выбери PNG, JPG или WebP до 12 МБ.');
    return;
  }
  const key = portraitKey(id);
  try {
    const image = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const crop = Math.min(image.width, image.height);
    canvas.getContext('2d').drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop, 0, 0, 256, 256);
    image.close();
    const updated = { ...portraits, [key]: canvas.toDataURL('image/jpeg', .84) };
    localStorage.setItem('career:portraits', JSON.stringify(updated));
    portraits[key] = updated[key];
    render();
    announce('Фото добавлено.');
  } catch { announce('Фото не удалось сохранить. Попробуй другой файл.'); }
}

async function exportPlayer(id) {
  const p = playerById(id) ?? { id, name: playerName(id) };
  const { season, related, selected } = playerSeason(id);
  const stats = summaryForPlayer(related);
  const move = document.createElement('canvas');
  move.width = 1020;
  move.height = 600;
  const ctx = move.getContext('2d');
  await document.fonts.ready;
  const rectangle = (color, x, y, width, height) => { ctx.fillStyle = color; ctx.fillRect(x, y, width, height); };
  const line = (string, x, y, color, font, max) => { ctx.fillStyle = color; ctx.font = font; ctx.fillText(string, x, y, max); };
  rectangle('#101512', 0, 0, 1020, 600);
  rectangle('#1a2a20', 0, 0, 1020, 380);
  rectangle('#b6ff62', 0, 0, 1020, 7);
  rectangle('#263c31', 44, 116, 213, 213);
  const attached = portraits[portraitKey(id)] || artUrl('players', id);
  if (attached || Number.isInteger(p.portrait)) {
    const picture = new Image();
    picture.src = attached || './assets/portraits.png';
    try {
      await picture.decode();
      if (attached) ctx.drawImage(picture, 44, 116, 213, 213);
      else {
        const w = picture.naturalWidth / 4, h = picture.naturalHeight / 2;
        ctx.drawImage(picture, p.portrait % 4 * w, Math.floor(p.portrait / 4) * h, w, h, 44, 116, 213, 213);
      }
    } catch { line(p.name.slice(0, 1), 130, 248, '#f4f8f2', '780 72px Golos', 175); }
  } else line(p.name.slice(0, 1), 130, 248, '#f4f8f2', '780 72px Golos', 175);
  line(data.kind === 'demo' ? 'ПЯТЫЙ ТАЙМ · ДЕМОДАННЫЕ' : 'ПЯТЫЙ ТАЙМ · FC 26', 44, 72, '#b6ff62', '690 23px Golos', 900);
  line(teamName(p.teamId), 288, 162, '#a9debd', '660 27px Golos', 500);
  line(p.name, 288, 235, '#f4f8f2', '800 62px Golos', 526);
  line([p.position, p.country, season === 'all' ? 'Вся карьера' : season].filter(Boolean).join(' · '), 290, 282, '#d5e8dc', '520 23px Golos', 530);
  line(fmt(p.ovr), 850, 235, '#b6ff62', '810 68px Golos', 125);
  line('Рейтинг', 852, 272, '#d5e8dc', '560 21px Golos', 120);
  for (const [index, [key, label]] of [['appearances', 'Матчи'], ['goals', 'Голы'], ['assists', 'Ассисты'], ['contributions', 'Гол + пас'], ['averageRating', 'Ср. оценка']].entries()) {
    line(fmt(stats[key]), 48 + index * 194, 480, '#f4f8f2', '770 51px Golos', 170);
    line(label, 48 + index * 194, 523, '#afc2b5', '550 22px Golos', 170);
  }
  line([selected == null ? 'Все соревнования' : compName(selected), state.profileKind === 'all' ? '' : groups.find(([id]) => id === state.profileKind)?.[1]].filter(Boolean).join(' · '), 48, 573, '#afc2b5', '520 16px Golos', 900);
  const file = document.createElement('a');
  file.download = `FC26-${id}.png`;
  file.href = move.toDataURL('image/png');
  file.click();
}

element.addEventListener('click', async event => {
  const b = event.target.closest('button');
  if (!b) {
    if (!event.target.closest('.global-search') && state.playerSearch) {
      state.playerSearch = '';
      document.querySelector('#quick-search').value = '';
      updateQuickSearch();
    }
    return;
  }
  const d = b.dataset;
  const focus = () => {
    const key = Object.keys(d)[0];
    const attr = key?.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    if (attr) element.querySelector(`[data-${attr}="${CSS.escape(d[key])}"]`)?.focus({ preventScroll: true });
  };
  if (d.nav) {
    if (d.nav === 'europe') { state.euroAll = false; state.euroView = 'overview'; state.euroComp = null; }
    navigate(d.nav);
    return;
  }
  if (d.desk) { await runDesk(d.desk); return; }
  if (d.fcAction) { await sendCareerAction(d.fcAction); return; }
  if (d.fcBind) {
    try { acceptGame(await api.bindGame(d.fcBind)); } catch { announce('Не удалось записать кнопку FC 26.'); }
    return;
  }
  if (d.deskMode) { await deskRecord().ready; saveDesk({ mode: d.deskMode }); state.deskGuide = null; render(); focus(); return; }
  if (d.deskSpot != null) { state.deskSlot = Number(d.deskSpot); render(); focus(); return; }
  if (d.deskPick) {
    await deskRecord().ready;
    const { data: scenario, sim } = deskContext();
    const chosen = Number(d.deskPick);
    if (!validateLineup(scenario, [chosen]).length) return;
    const slot = state.deskSlot ?? 0;
    const initial = state.deskLineup ?? (sim.lineup.length ? sim.lineup : suggestLineup(scenario, sim));
    const lineup = Array.from({ length: 11 }, (_, i) => initial[i] ?? null);
    const from = lineup.indexOf(chosen);
    if (from >= 0 && from !== slot) lineup[from] = lineup[slot];
    lineup[slot] = chosen;
    state.deskLineup = lineup;
    saveDesk({ sim: { ...deskRecord().value.sim, lineup } });
    render(); focus(); return;
  }
  if (d.deskReport) { state.deskReport = Number(d.deskReport); navigate('report'); return; }
  if (d.deskStory != null) {
    const url = news.items[Number(d.deskStory)]?.url;
    if (url && !await api?.openNews(url)) announce('Ссылка на статью недоступна.');
    return;
  }
  if (d.deskNews) {
    state.deskNewsTab = d.deskNews;
    if (d.deskNews === 'world' && !news.checked) await loadWorldNews(); else render();
    focus();
    return;
  }
  if (d.deskMarket) { state.deskMarketTab = d.deskMarket; state.deskMarketQuery = ''; state.deskGuide = null; render(); focus(); return; }
  if (d.deskOffer) {
    state.deskTransferPlayer = Number(d.deskOffer);
    state.deskBuyer = state.deskOfferId = state.deskGuide = state.deskOfferTerms = null;
    if (state.page !== 'market') navigate('market'); else render();
    document.querySelector('#desk-offer input')?.focus();
    return;
  }
  if (d.deskMessage || d.deskList || d.deskAccept) {
    await deskRecord().ready;
    const session = deskRecord().value;
    if (d.deskMessage) {
      state.deskMessage = d.deskMessage;
      if (!session.read.includes(d.deskMessage)) saveDesk({ read: [...session.read, d.deskMessage] });
    } else if (d.deskList) {
      const id = Number(d.deskList);
      saveDesk({ listed: session.listed.includes(id) ? session.listed.filter(item => item !== id) : [...session.listed, id] });
    } else {
      saveDesk({ deals: session.deals.map(deal => deal.id === d.deskAccept && deal.status === 'counter' ? { ...deal, status: 'accepted', fee: deal.counterFee, wage: deal.counterWage, counterFee: null, counterWage: null } : deal) });
      state.deskLineup = null;
    }
    render(); focus(); return;
  }
  if (d.player) { navigate('profile', Number(d.player), d.playerSeason || null); return; }
  if (d.club) { navigate('club', Number(d.club)); return; }
  if (d.academyClub) {
    const id = Number(d.academyClub);
    state.academyView = id === data.clubId ? 'own' : 'clubs';
    state.academyClub = id === data.clubId ? null : id;
    state.academyComp = null;
    state.academyLimit = 24;
    navigate('academy');
    return;
  }
  if (d.match) { navigate('match', Number(d.match), d.matchSeason || null); return; }
  if (d.calendarComp || d.calendarClub) {
    state.calendarMode = 'all';
    state.calendarClub = d.calendarClub ? Number(d.calendarClub) : null;
    state.scope = d.calendarComp ? Number(d.calendarComp) : null;
    state.calendarSeason = d.calendarClub ? state.clubSeason : null;
    state.calendarMonth = '';
    state.dateFilter = 'next';
    navigate('matches');
    return;
  }
  if (d.bracketComp) {
    state.euroAll = true;
    state.euroComp = Number(d.bracketComp);
    state.euroView = 'bracket';
    navigate('europe');
    return;
  }
  if (d.tournament) {
    state.comp = state.scope = Number(d.tournament);
    state.group = null;
    navigate('competitions');
    return;
  }
  if (d.squad) { state.team = d.squad; state.query = ''; state.limit = 36; navigate('players'); return; }
  if (d.export) { await exportPlayer(Number(d.export)); return; }
  if (d.compare) { toggleComparison(Number(d.compare)); focus(); return; }
  if (d.favorite) { toggleFavorite(Number(d.favorite)); focus(); return; }
  if (d.photo != null) { document.querySelector('#photo-file').click(); return; }
  if (d.telemetry != null) { document.querySelector('#telemetry-file').click(); return; }
  if (d.hide != null) { await api.hide(); return; }
  if (d.openGame != null || d.chooseGame != null) {
    try { acceptGame(await (d.openGame != null ? api.openGame() : api.chooseGame())); }
    catch { announce('Не удалось связаться с FC 26.'); }
    return;
  }
  if (d.simulate != null) {
    const match = nextFixture(data);
    if (match) state.kickoffResult = { key: kickoffKey(match), score: simulateMatch(chances(match).expected) };
  }
  if (d.images != null) {
    try { acceptStatus(await api.images()); } catch { announce('Не удалось открыть папку изображений.'); }
    return;
  }
  if (d.importArchive != null) {
    try { acceptStatus(await api.importArchive()); } catch { announce('Не удалось импортировать старые сейвы.'); }
    return;
  }
  if (d.connect != null || d.resume != null) {
    try { acceptStatus(await (d.connect != null ? api.choose() : api.resume())); }
    catch { announce('Не удалось открыть диалог выбора сейва.'); }
    return;
  }
  if (d.menu != null) state.menu = !state.menu;
  if (d.more != null) state.limit += 36;
  if (d.worldMore != null) state.worldLimit += 25;
  if (d.worldYoung != null) { state.worldYoung = !state.worldYoung; state.worldLimit = 25; }
  if (d.worldTab) { state.worldTab = d.worldTab; state.worldQuery = ''; state.worldLimit = 25; }
  if (d.worldKind) { state.worldKind = d.worldKind; state.worldComp = null; state.worldLimit = 25; }
  if (d.metric) state.metric = d.metric;
  if (d.profileTab) state.profileTab = d.profileTab;
  if (d.profileKind) state.profileKind = d.profileKind;
  if (d.dateFilter) state.dateFilter = d.dateFilter;
  if (d.calendarTeam) { state.calendarTeam = d.calendarTeam; state.scope = null; }
  if (d.calendarMode) { state.calendarMode = d.calendarMode; state.calendarClub = null; state.calendarMonth = ''; }
  if (d.calendarMore != null) state.calendarLimit += 42;
  if (d.euroView) state.euroView = d.euroView;
  if (d.radarView) { state.radarView = d.radarView; state.radarLimit = 25; }
  if (d.radarMore != null) state.radarLimit += 25;
  if (d.academyView) { state.academyView = d.academyView; state.academyLimit = 24; }
  if (d.academyMore != null) state.academyLimit += 24;
  if (d.clubTab) state.clubTab = d.clubTab;
  if (d.clubYear) { state.clubSeason = d.clubYear; state.scope = null; state.clubTab = 'overview'; }
  if (d.profileYear) { state.profileSeason = d.profileYear; state.profileComp = null; state.profileTab = 'stats'; }
  if (d.awardPeriod) { state.awardPeriod = d.awardPeriod; state.awardDate = null; state.awardExpanded = false; }
  if (d.awardExpand != null) state.awardExpanded = !state.awardExpanded;
  if (d.searchType) { state.searchType = d.searchType; updateQuickSearch(); document.querySelector('#quick-search')?.focus(); return; }
  if (d.demoMode) { state.demoMode = d.demoMode; setData({ ...demo, mode: state.demoMode }); }
  render();
  focus();
});

element.addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'photo-file') { await storePhoto(target.files[0], state.player); return; }
  if (target.id === 'telemetry-file') {
    const file = target.files[0];
    if (!file || file.size > 2_000_000) { announce('Выбери CSV или JSON до 2 МБ.'); return; }
    try {
      const rows = parseMatchTelemetry(await file.text());
      if (!rows.length) { announce('В файле не найдены ID игроков и поддерживаемые показатели.'); return; }
      acceptStatus(await api.telemetry(state.matchId, rows));
    } catch { announce('Не удалось прочитать файл статистики матча.'); }
    return;
  }
  if (target.matches('[data-startup]')) {
    try { acceptStatus(await api.startup(target.checked)); } catch { announce('Настройка автозапуска недоступна.'); }
    return;
  }
  if (target.matches('[data-game-auto]')) {
    try { acceptGame(await api.gameAuto(target.checked)); } catch { target.checked = !target.checked; announce('Не удалось сохранить настройку.'); }
    return;
  }
  const key = target.dataset.select;
  const value = target.value;
  if (key === 'desk-comp') { state.deskResultComp = Number(value); state.deskResultLimit = 30; render(); return; }
  if (key === 'desk-buyer') { state.deskBuyer = value ? Number(value) : null; return; }
  if (['academy-club', 'academy-comp', 'academy-metric'].includes(key)) {
    if (key === 'academy-club') { state.academyClub = value ? Number(value) : null; state.academyComp = null; }
    if (key === 'academy-comp') state.academyComp = value ? Number(value) : null;
    if (key === 'academy-metric') state.academyMetric = value;
    state.academyLimit = 24;
    render();
    element.querySelector(`[data-select="${key}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (key === 'comp') { state.comp = +value; state.group = null; }
  else if (key === 'scope' || key === 'group') {
    state[key] = value ? Number(value) : null;
    if (state.page === 'matches') { state.calendarMonth = ''; state.calendarClub = null; state.calendarLimit = 42; }
  }
  else if (key === 'year') state.history = value;
  else if (key === 'profile-season') { state.profileSeason = value; state.profileComp = null; }
  else if (key === 'profile-comp') state.profileComp = value ? Number(value) : null;
  else if (key === 'club-season') { state.clubSeason = value; state.scope = null; }
  else if (key === 'euro-comp') state.euroComp = Number(value);
  else if (key === 'award-date') { state.awardDate = Number(value); state.awardExpanded = false; }
  else if (key === 'award-season' || key === 'award-kind') {
    state[key === 'award-season' ? 'awardSeason' : 'awardKind'] = value;
    if (key === 'award-season') state.awardDate = null;
    state.awardExpanded = false;
  } else if (key === 'radar-position' || key === 'radar-age') {
    state[key === 'radar-position' ? 'radarPosition' : 'radarAge'] = value;
    state.radarLimit = 25;
  } else if (key === 'calendar-club' || key === 'calendar-season' || key === 'calendar-month') {
    if (key === 'calendar-club') state.calendarClub = value ? Number(value) : null;
    else if (key === 'calendar-month') state.calendarMonth = value;
    else { state.calendarSeason = value; state.scope = null; state.calendarClub = null; }
    if (key !== 'calendar-month') state.calendarMonth = '';
    state.calendarLimit = 42;
  }
  else if (key === 'world-comp') { state.worldComp = value ? Number(value) : null; state.worldLimit = 25; }
  else if (key === 'world-metric' || key === 'world-club-metric') {
    state[key === 'world-metric' ? 'worldMetric' : 'worldClubMetric'] = value;
    state.worldLimit = 25;
  }
  else if (key === 'team' || key === 'order') { state[key] = value; state.limit = 36; }
  else return;
  render();
  element.querySelector(`[data-select="${key}"]`)?.focus({ preventScroll: true });
});

element.addEventListener('input', event => {
  if (event.target.id === 'player-filter') {
    state.query = event.target.value;
    state.limit = 36;
    render();
  } else if (event.target.id === 'quick-search') {
    state.playerSearch = event.target.value;
    updateQuickSearch();
  } else if (event.target.id === 'world-filter') {
    state.worldQuery = event.target.value;
    state.worldLimit = 25;
    render();
  } else if (event.target.id === 'radar-filter') {
    state.radarSearch = event.target.value;
    state.radarLimit = 25;
    render();
  } else if (event.target.id === 'desk-market-filter') {
    state.deskMarketQuery = event.target.value;
    render();
  }
});

element.addEventListener('load', event => {
  if (event.target.matches?.('img.artwork')) event.target.parentElement.dataset.artLoaded = '';
}, true);
element.addEventListener('error', event => {
  if (event.target.matches?.('img.artwork')) event.target.remove();
}, true);

element.addEventListener('submit', async event => {
  if (event.target.id === 'desk-offer') {
    event.preventDefault();
    const terms = offerTerms();
    if (!terms) return;
    await deskRecord().ready;
    const { data: scenario, sim, session } = deskContext();
    const player = scenario.players.find(p => p.id === state.deskTransferPlayer);
    const mine = player?.teamId === scenario.clubId;
    const offer = submitOffer(terms, player, mine ? 'sell' : 'buy', mine ? state.deskBuyer : scenario.clubId, sim.date);
    if (!offer) { announce('Проверь условия и выбери клуб-покупатель.'); return; }
    saveDesk({ deals: [offer, ...session.deals] });
    state.deskOfferId = offer.id;
    state.deskOfferTerms = state.deskGuide = state.deskLineup = null;
    state.deskMarketTab = 'offers';
    state.deskTransferPlayer = null;
    render();
    return;
  }
  if (event.target.id === 'game-launcher') {
    event.preventDefault();
    try { acceptGame(await api.chooseGame(new FormData(event.target).get('path'))); }
    catch { announce('Не удалось сохранить путь запуска.'); }
    return;
  }
  if (event.target.id === 'link-archive') {
    event.preventDefault();
    const archive = new FormData(event.target).get('archive');
    if (archive) {
      try { await api.linkArchive(archive); announce('Сейв привязан к выбранному архиву.'); }
      catch { announce('Не удалось привязать архив.'); }
    }
    return;
  }
  if (event.target.id !== 'award-form') return;
  event.preventDefault();
  const values = new FormData(event.target);
  const title = String(values.get('award')).trim();
  const winner = String(values.get('winner')).trim();
  if (!title || !winner) { announce('Укажи название награды и победителя.'); return; }
  const exact = data.players.filter(p => p.name.toLowerCase() === winner.toLowerCase());
  customAwards[data.key] = [...(customAwards[data.key] ?? []), { title, winner, playerId: exact.length === 1 ? exact[0].id : null, season: activeSeason(state.awardSeason), count: 1, manual: true }];
  localStorage.setItem('career:awards', JSON.stringify(customAwards));
  render();
  announce('Награда записана.');
});

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    document.querySelector('#quick-search').focus();
  }
  if (event.target.id !== 'quick-search') return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    document.querySelector('#quick-results .search-result')?.focus();
  } else if (event.key === 'Enter') {
    document.querySelector('#quick-results .search-result')?.click();
  } else if (event.key === 'Escape') {
    state.playerSearch = '';
    event.target.value = '';
    updateQuickSearch();
  }
});

render();
if (api) {
  api.subscribe(acceptStatus);
  api.subscribeGame(acceptGame);
  api.state().then(acceptStatus).catch(() => announce('Связь с настольным приложением недоступна.'));
}
