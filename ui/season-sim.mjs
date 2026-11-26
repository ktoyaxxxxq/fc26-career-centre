import { forecastMatch } from './analytics.mjs';
import { simulateMatch } from './kickoff.mjs';
import { rateTeams } from './world.mjs';

const defaultPositions = ['ВР', 'ПЗ', 'ЦЗ', 'ЛЦЗ', 'ЛЗ', 'ОП', 'ЦП', 'АП', 'ПН', 'НАП', 'ЛН'];
const positions = {
  ВР: ['ВР', 'GK'], ПЗ: ['ПЗ', 'ПФЗ', 'RB', 'RWB'], ПЦЗ: ['ПЦЗ', 'RCB'],
  ЦЗ: ['ЦЗ', 'СВ', 'CB', 'SW'], ЛЦЗ: ['ЛЦЗ', 'LCB'], ЛЗ: ['ЛЗ', 'ЛФЗ', 'LB', 'LWB'],
  ОП: ['ОП', 'ПОП', 'ЛОП', 'CDM', 'RDM', 'LDM'], ЦП: ['ЦП', 'ПЦП', 'ЛЦП', 'CM', 'RCM', 'LCM'],
  АП: ['АП', 'ПАП', 'ЛАП', 'CAM', 'RAM', 'LAM'], ПП: ['ПП', 'RM'], ЛП: ['ЛП', 'LM'],
  ПН: ['ПН', 'ПФА', 'RW', 'RF'], НАП: ['НАП', 'ПНАП', 'ЛНАП', 'ЦФ', 'ST', 'CF', 'RS', 'LS'], ЛН: ['ЛН', 'ЛФА', 'LW', 'LF'],
};
const aliases = new Map(Object.entries(positions).flatMap(([key, names]) => names.map(name => [name, key])));
const role = new Map(Object.entries({
  keeper: ['ВР'], defender: ['ПЗ', 'ПЦЗ', 'ЦЗ', 'ЛЦЗ', 'ЛЗ'],
  midfield: ['ОП', 'ЦП', 'АП', 'ЛП', 'ПП'], attack: ['ПН', 'НАП', 'ЛН'],
}).flatMap(([group, names]) => names.map(position => [position, group])));
const closePositions = [
  ['ПЦЗ', 'ЦЗ', 'ЛЦЗ'], ['ПЗ', 'ПП', 'ПН'], ['ЛЗ', 'ЛП', 'ЛН'], ['ОП', 'ЦП', 'АП'], ['АП', 'ПН', 'НАП', 'ЛН'],
];
const cache = new WeakMap();
const dayLength = 86400000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (n, precision = 1) => Math.round(n * precision) / precision;
const hasTeam = (fixture, id) => id != null && (fixture.homeId === id || fixture.awayId === id);

function dayNumber(value) {
  if (!Number.isInteger(value) || value < 10000101 || value > 99991231) return null;
  const year = Math.floor(value / 10000), month = Math.floor(value / 100) % 100, day = value % 100;
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time / dayLength : null;
}

function fromDay(day) {
  const date = new Date(day * dayLength);
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

const fixtureOrder = (a, b) => a.date - b.date || (a.time ?? 0) - (b.time ?? 0) || a.id - b.id;

function indexCareer(data) {
  if (cache.has(data)) return cache.get(data);
  const teams = new Map((data.teams ?? []).map(team => [team.id, team]));
  const players = new Map((data.players ?? []).map(player => [player.id, player]));
  const sourceDate = dayNumber(data.date) != null ? data.date : null;
  const fixtures = (data.fixtures ?? []).filter(match => !match.played && match.id != null && match.homeId != null &&
    match.awayId != null && match.homeId !== match.awayId && dayNumber(match.date) != null).sort(fixtureOrder);
  const ownFixtures = fixtures.filter(match => hasTeam(match, data.clubId));
  const rosters = new Map();
  const history = new Map();
  const add = (teamId, player) => {
    if (teamId == null) return;
    const gender = teams.get(teamId)?.gender ?? (teamId === data.clubId ? players.get(data.heroId)?.gender : null) ?? 0;
    if (player.gender != null && player.gender !== gender) return;
    if (!rosters.has(teamId)) rosters.set(teamId, new Map());
    rosters.get(teamId).set(player.id, player);
  };
  for (const player of players.values()) {
    if (player.academy || player.id == null) continue;
    add(player.teamId, player);
    for (const nationalId of player.nationalIds ?? []) add(nationalId, player);
  }
  for (const row of data.stats ?? []) {
    if (!Number.isFinite(row.averageRating) || row.averageRating <= 0 || !(row.appearances > 0)) continue;
    if (!history.has(row.teamId)) history.set(row.teamId, new Map());
    const stats = history.get(row.teamId);
    const old = stats.get(row.playerId) ?? [0, 0];
    stats.set(row.playerId, [old[0] + row.averageRating * row.appearances, old[1] + row.appearances]);
  }
  const ratings = new Map(rateTeams([...teams.values()], (data.fixtures ?? []).filter(match => !sourceDate || match.date <= sourceDate))
    .map(team => [team.id, team]));
  const competitions = new Map((data.competitions ?? []).map(competition => [competition.id, competition.name]));
  const index = { teams, players, rosters, ratings, history, fixtures, ownFixtures, sourceDate, competitions };
  cache.set(data, index);
  return index;
}

export function lineupPositions(data, teamId = data.clubId) {
  const slots = data.tactics?.[teamId]?.slots;
  return slots?.length === 11 && slots.every(slot => aliases.has(slot.position)) ? slots.map(slot => slot.position) : [...defaultPositions];
}

export function eligibleSquad(data, teamId = data.clubId) {
  return [...(indexCareer(data).rosters.get(teamId)?.values() ?? [])];
}

export function validateLineup(data, ids, teamId = data.clubId) {
  const roster = indexCareer(data).rosters.get(teamId);
  const valid = new Set();
  for (const value of Array.isArray(ids) ? ids : []) {
    if (value == null || String(value).trim() === '') continue;
    const id = roster?.has(value) ? value : Number(value);
    if (roster?.has(id)) valid.add(id);
    if (valid.size === 11) break;
  }
  return [...valid];
}

function addRecent(recent, result) {
  for (const teamId of [result.homeId, result.awayId]) {
    if (!recent.has(teamId)) recent.set(teamId, []);
    const list = recent.get(teamId);
    list.push(result);
    if (list.length > 6) list.shift();
  }
}

function recentMatches(sim) {
  const recent = new Map();
  for (const result of Object.values(sim.results ?? {}).filter(result => result?.played).sort(fixtureOrder)) addRecent(recent, result);
  return recent;
}

function positionFit(player, rawPosition) {
  const target = aliases.get(rawPosition), natural = aliases.get(player.position), alternate = aliases.get(player.lineupPosition);
  if (target === natural) return player.position === rawPosition ? 0 : -1;
  if (target === 'ВР' || natural === 'ВР') return -40;
  if (target === alternate) return -3;
  if (closePositions.some(group => group.includes(natural) && group.includes(target))) return -5;
  if (role.get(natural) === role.get(target)) return -9;
  return natural ? -16 : -13;
}

function selectLineup(data, index, recent, date, teamId, chosen = []) {
  const available = new Map(index.rosters.get(teamId));
  const options = lineupPositions(data, teamId);
  const named = data.tactics?.[teamId]?.slots;
  const recentPlayers = new Map();
  const now = dayNumber(date);
  for (const game of recent.get(teamId) ?? []) {
    const daysAgo = now != null ? now - dayNumber(game.date) : 0;
    if (daysAgo <= 0) continue;
    for (const player of game.players ?? []) {
      if (player.teamId !== teamId || !available.has(player.id)) continue;
      const record = recentPlayers.get(player.id) ?? { form: 0, games: 0, fatigue: 0 };
      record.form += player.rating ?? 6.5;
      record.games++;
      if (daysAgo < 5) record.fatigue += (5 - daysAgo) * (player.minutes ?? 90) / 90;
      recentPlayers.set(player.id, record);
    }
  }
  const priorities = new Map();
  for (const player of available.values()) {
    const saved = index.history.get(teamId)?.get(player.id);
    const recent = recentPlayers.get(player.id);
    const form = recent ? recent.form / recent.games : saved ? saved[0] / saved[1] : 6.5;
    const stamina = player.attributes?.stamina || 70;
    priorities.set(player.id, playerOverall(player) + clamp((form - 6.5) * 1.45, -4, 4) - (recent?.fatigue ?? 0) * (1.9 - stamina / 100));
  }
  const lineup = Array(11).fill(null);
  chosen.forEach((id, slot) => {
    if (available.has(id)) {
      lineup[slot] = id;
      available.delete(id);
    }
  });
  const vacant = options.map((position, slot) => ({ slot, position, specialists: [...available.values()].filter(player => positionFit(player, position) >= -1).length }));
  vacant.sort((a, b) => Number(aliases.get(b.position) === 'ВР') - Number(aliases.get(a.position) === 'ВР') ||
    (a.specialists || Infinity) - (b.specialists || Infinity) || a.slot - b.slot);
  for (const { slot, position } of vacant) {
    if (lineup[slot] != null || !available.size) continue;
    let best = null, bestScore = -Infinity;
    for (const player of available.values()) {
      const namedBonus = named?.[slot]?.position === position && named[slot].playerId === player.id ? 2 : 0;
      const score = priorities.get(player.id) + positionFit(player, position) * 1.5 + namedBonus;
      if (score > bestScore || (score === bestScore && player.id < best.id)) { best = player; bestScore = score; }
    }
    lineup[slot] = best.id;
    available.delete(best.id);
  }
  return lineup;
}

export function suggestLineup(data, sim, teamId = data.clubId) {
  return selectLineup(data, indexCareer(data), recentMatches(sim ?? {}), sim?.date ?? data.date, teamId).filter(id => id != null);
}

export function newSimulation(data) {
  const index = indexCareer(data);
  const date = index.sourceDate ?? index.ownFixtures[0]?.date ?? index.fixtures[0]?.date ?? null;
  return { version: 1, date, results: {}, lineup: [] };
}

export function matchday(data, sim) {
  return indexCareer(data).ownFixtures.find(match => (sim.date == null || match.date >= sim.date) && !sim.results?.[match.id]) ?? null;
}

function seededRandom(match) {
  let seed = 2166136261;
  for (const char of `${match.id}/${match.date}/${match.homeId}/${match.awayId}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const playerOverall = player => player.ovr > 0 ? player.ovr : 68;
const trait = (player, key) => player.attributes?.[key] > 0 ? player.attributes[key] : playerOverall(player);
const isKeeper = entry => entry.role === 'keeper';

function teamStrength(index, recent, match, teamId, lineup) {
  const team = index.ratings.get(teamId) ?? index.teams.get(teamId) ?? {};
  const defaultOvr = team.ovr || 70;
  const adjustment = lineup.length >= 7 ? lineup.reduce((sum, entry) => sum + playerOverall(entry.player) + positionFit(entry.player, entry.position) * .23, 0) / lineup.length - defaultOvr : 0;
  const observed = (recent.get(teamId) ?? []).filter(game => game.date < match.date).map(game => {
    const leads = (game.homeGoals - game.awayGoals) * (game.homeId === teamId ? 1 : -1);
    return leads > 0 ? 'В' : leads < 0 ? 'П' : 'Н';
  });
  return { ...team, power: (team.power ?? (1500 + (defaultOvr - 70) * 14)) + adjustment * 16,
    recent: [...team.recent ?? [], ...observed].slice(-5), midfield: (team.midfield || defaultOvr) + adjustment };
}

function createParticipants(index, teamId, ids, options) {
  return ids.flatMap((id, slot) => {
    const player = index.players.get(id);
    if (!player) return [];
    return [{ id, teamId, player, position: options[slot], role: role.get(aliases.get(options[slot])) ?? 'midfield' }];
  });
}

function pickPlayer(rows, minute, random, weight) {
  const candidates = rows.filter(row => row.from <= minute && row.through >= minute);
  const weights = candidates.map(weight);
  let target = random() * weights.reduce((sum, value) => sum + value, 0);
  return candidates.find((_, index) => (target -= weights[index]) < 0) ?? null;
}

function modelSide(teamId, entries, goals, xg, possession, outcome, conceded, random) {
  const events = [];
  const rows = entries.map(entry => ({ ...entry, from: 1, through: 90, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0 }));
  const target = Math.max(goals, Math.round(xg * 2.5 + 1 + random() * 4));
  const shots = target + Math.round(3 + xg * 2 + random() * 7);
  const scoringWeight = entry => ({ keeper: .07, defender: .55, midfield: 1.45, attack: 3.6 })[entry.role] * trait(entry.player, 'finishing') / 65;
  for (let shot = 0; shot < shots; shot++) {
    const minute = 1 + Math.floor(random() * 90);
    const shooter = pickPlayer(rows, minute, random, scoringWeight);
    if (shooter) {
      shooter.shots++;
      if (shot < target) shooter.shotsOnTarget++;
    }
    if (shot >= goals) continue;
    if (shooter) shooter.goals++;
    const assist = random() < .74 ? pickPlayer(rows, minute, random, row => row === shooter || isKeeper(row) ? 0 :
      ({ defender: .8, midfield: 2.3, attack: 1.8 })[row.role] * trait(row.player, 'shortpassing') / 70) : null;
    if (assist) assist.assists++;
    events.push({ minute, type: 'goal', teamId, playerId: shooter?.id ?? null, assistId: assist?.id ?? null });
  }
  const players = rows.map(({ id, player, role, from, through, goals, assists, shots, shotsOnTarget }) => {
    const minutes = through - from + 1;
    const passes = Math.round(({ keeper: 20, defender: 41, midfield: 51, attack: 28 })[role] * possession / 50 * (.73 + random() * .55) * minutes / 90);
    const completedPasses = Math.round(passes * clamp(.59 + trait(player, 'shortpassing') / 330 + random() * .15 - (role === 'attack' ? .035 : 0), .55, .97));
    const dribbles = Math.round(({ keeper: .3, defender: 2, midfield: 5, attack: 7 })[role] * (.5 + random()) * minutes / 90);
    const completedDribbles = Math.round(dribbles * clamp(.24 + trait(player, 'dribbling') / 210 + random() * .22, .24, .92));
    const defensiveBonus = role === 'defender' || role === 'keeper' ? .4 - Math.min(conceded, 4) * .22 : 0;
    const rating = round(clamp(6.2 + (random() - .5) * 1.55 + goals * .88 + assists * .6 + outcome * .35 + defensiveBonus, 3.5, 10), 10);
    return { id, teamId, name: player.name ?? `Игрок #${id}`, minutes, goals, assists, rating,
      passes, completedPasses, dribbles, completedDribbles, shots, shotsOnTarget };
  });
  const totals = players.reduce((total, player) => ({ passes: total.passes + player.passes, completed: total.completed + player.completedPasses,
    dribbles: total.dribbles + player.dribbles }), { passes: 0, completed: 0, dribbles: 0 });
  return { players, events, summary: { shots, shotsOnTarget: target, possession, passes: totals.passes,
    passAccuracy: totals.passes ? round(totals.completed * 100 / totals.passes, 10) : 0, dribbles: totals.dribbles,
    xg: round(xg, 100) } };
}

function modelFixture(data, index, recent, match, ownLineup = []) {
  const random = seededRandom(match);
  const teamEntries = teamId => createParticipants(index, teamId,
    selectLineup(data, index, recent, match.date, teamId, teamId === data.clubId ? ownLineup : []), lineupPositions(data, teamId));
  const home = teamEntries(match.homeId), away = teamEntries(match.awayId);
  const homePower = teamStrength(index, recent, match, match.homeId, home), awayPower = teamStrength(index, recent, match, match.awayId, away);
  const { expected } = forecastMatch(homePower, awayPower, match.neutral === true);
  const [homeGoals, awayGoals] = simulateMatch(expected, random);
  const possession = clamp(Math.round(50 + (homePower.midfield - awayPower.midfield) * .65 + (random() - .5) * 16), 29, 71);
  const outcome = Math.sign(homeGoals - awayGoals);
  const homeReport = modelSide(match.homeId, home, homeGoals, expected[0], possession, outcome, awayGoals, random);
  const awayReport = modelSide(match.awayId, away, awayGoals, expected[1], 100 - possession, -outcome, homeGoals, random);
  const events = [...homeReport.events, ...awayReport.events].sort((a, b) => a.minute - b.minute);
  return { ...match, played: true, homeGoals, awayGoals, home: homeReport.summary, away: awayReport.summary,
    players: [...homeReport.players, ...awayReport.players], events };
}

function modelPassedDates(data, index, sim, date, throughDay, ownMatch = null) {
  const results = { ...sim.results };
  const recent = recentMatches(sim);
  const lineup = ownMatch ? validateLineup(data, sim.lineup) : [];
  const play = match => {
    const result = modelFixture(data, index, recent, match, lineup);
    results[match.id] = result;
    addRecent(recent, result);
  };
  for (const match of index.fixtures) {
    if (match.date < sim.date || results[match.id]) continue;
    if (match.date > date || (!throughDay && match.date === date)) break;
    if (!hasTeam(match, data.clubId) || match === ownMatch) play(match);
  }
  return results;
}

export function advanceSimulation(data, sim, days = 1) {
  if (sim.date == null || days < 1 || (days !== Infinity && !Number.isFinite(days))) return sim;
  const index = indexCareer(data);
  const next = matchday(data, sim);
  if (days === Infinity && !next) return sim;
  const date = days === Infinity ? next.date : Math.min(next?.date ?? Infinity, fromDay(dayNumber(sim.date) + Math.floor(days)));
  if (date <= sim.date || dayNumber(date) == null) return sim;
  return { ...sim, date, results: modelPassedDates(data, index, sim, date, false) };
}

export function playSimulation(data, sim) {
  const match = matchday(data, sim);
  if (!match || match.date !== sim.date) return sim;
  const index = indexCareer(data);
  return { ...sim, results: modelPassedDates(data, index, sim, sim.date, true, match), lastMatchId: match.id };
}

export function simulationNews(data, sim) {
  const index = indexCareer(data);
  if (index.news && index.news.results === sim.results && index.news.date === sim.date) return index.news.items;
  const name = id => index.teams.get(id)?.name ?? `Команда #${id}`;
  const items = Object.values(sim.results ?? {}).filter(match => match?.played && match.date <= sim.date).flatMap(match => {
    const own = hasTeam(match, data.clubId), ownAtHome = data.clubId === match.homeId;
    const home = name(match.homeId), away = name(match.awayId);
    const score = `${match.homeGoals}:${match.awayGoals}`;
    const competition = index.competitions.get(match.competitionId);
    const outcome = (match.homeGoals - match.awayGoals) * (ownAtHome ? 1 : -1);
    const clubOutcome = outcome > 0 ? 'победа' : outcome < 0 ? 'поражение' : 'ничья';
    const headline = own ? `${ownAtHome ? home : away} · ${clubOutcome}` : `${home} — ${away} · ${score}`;
    const summary = `${home} — ${away} · ${score}.${competition ? ` Турнир — ${competition}.` : ''}`;
    const items = [{ id: `match-${match.id}`, kind: own ? 'match' : 'world', title: headline, body: summary, date: match.date, clubId: own ? data.clubId : match.homeId }];
    const star = (match.players ?? []).reduce((best, player) => !best || player.rating > best.rating || player.rating === best.rating && player.goals + player.assists > best.goals + best.assists ? player : best, null);
    if (star && (own || star.goals >= 3)) items.push({ id: `player-${match.id}-${star.id}`, kind: 'player', title: `${star.name} — лучший игрок матча`,
      body: `${summary} Оценка — ${String(star.rating).replace('.', ',')}. Голы — ${star.goals}, передачи — ${star.assists}.`,
      date: match.date, playerId: star.id, clubId: star.teamId });
    return items;
  }).sort((a, b) => b.date - a.date || Number(b.kind === 'match') - Number(a.kind === 'match') || a.id.localeCompare(b.id));
  index.news = { results: sim.results, date: sim.date, items };
  return items;
}
