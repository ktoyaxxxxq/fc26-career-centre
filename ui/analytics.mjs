import { mergeStats } from './core.mjs';
import { playerLeaders } from './world.mjs';

const topLeagues = [13, 53, 19, 31, 16, 10, 308, 7, 1, 14, 54, 20, 32, 17];
export function europeanKind(c) {
  const code = c.code ?? '';
  const name = c.name ?? '';
  if (code === 'C223' || /(?:uefa )?champions league|лига чемпионов/i.test(name)) return 'ucl';
  if (code === 'C224' || /europa league|лига европы/i.test(name)) return 'uel';
  if (/conference league|лига конференций/i.test(name)) return 'uecl';
  if (code === 'C232' || /uefa super cup|суперкубок уефа/i.test(name)) return 'super';
  return null;
}

export function orderCompetitions(items, eurosFirst = false) {
  const rank = c => {
    const league = topLeagues.indexOf(c.leagueId);
    const euro = ['ucl', 'uel', 'uecl', 'super'].indexOf(europeanKind(c));
    if (euro >= 0) return eurosFirst ? euro : 25 + euro;
    if (league >= 0) return eurosFirst ? 10 + league : league;
    return c.type === 'Лига' ? 35 : c.kind === 'national' ? 55 : 45;
  };
  return [...items].sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? '', 'ru'));
}

const asDate = value => {
  const str = String(value ?? '');
  return /^\d{8}$/.test(str) ? new Date(Date.UTC(+str.slice(0, 4), +str.slice(4, 6) - 1, +str.slice(6))) : null;
};
const toDate = d => Number(d.toISOString().slice(0, 10).replaceAll('-', ''));
export function periodRange(value, period) {
  const date = asDate(value);
  if (!date || Number.isNaN(+date)) return [null, null];
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  if (period === 'month') return [toDate(new Date(Date.UTC(year, month, 1))), toDate(new Date(Date.UTC(year, month + 1, 0)))];
  if (period === 'year') return [year * 10000 + 101, year * 10000 + 1231];
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const start = toDate(date);
  date.setUTCDate(date.getUTCDate() + 6);
  return [start, toDate(date)];
}

const strength = team => team?.power ?? (1500 + ((team?.ovr || 70) - 70) * 14);
const form = team => team?.recent?.length ? team.recent.reduce((s, m) => s + ({ В: 1, Н: 0, П: -1 })[m], 0) / team.recent.length * 35 : 0;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export function forecastMatch(home, away, neutral = false) {
  const difference = strength(home) - strength(away) + form(home) - form(away) + (neutral || home?.kind === 'national' ? 0 : 55);
  const lambda = [clamp(1.34 * Math.exp(difference / 690), .28, 4.8), clamp(1.34 * Math.exp(-difference / 690), .28, 4.8)];
  const goals = lambda.map(value => {
    const p = [Math.exp(-value)];
    for (let g = 1; g < 14; g++) p.push(p[g - 1] * value / g);
    return p;
  });
  let win = 0, draw = 0, loss = 0;
  for (let h = 0; h < goals[0].length; h++) {
    for (let a = 0; a < goals[1].length; a++) {
      const p = goals[0][h] * goals[1][a];
      if (h > a) win += p;
      else if (h === a) draw += p;
      else loss += p;
    }
  }
  const scale = win + draw + loss;
  return { win: win / scale, draw: draw / scale, loss: loss / scale, expected: lambda.map(v => Math.round(v * 10) / 10) };
}

export function forecastTournament(teams, nextPairs = []) {
  if (!teams.length || teams.length > 192) return [];
  const candidates = new Map(teams.map(t => [t.id, t]));
  const pairs = [];
  const paired = new Set();
  for (const match of nextPairs) {
    if (!candidates.has(match.homeId) || !candidates.has(match.awayId) || match.homeId === match.awayId || paired.has(match.homeId) || paired.has(match.awayId)) continue;
    pairs.push([match.homeId, match.awayId]);
    paired.add(match.homeId).add(match.awayId);
  }
  let seed = 38419;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const wins = new Map(teams.map(t => [t.id, 0]));
  const advance = (a, b) => {
    const chanceA = 1 / (1 + 10 ** ((strength(candidates.get(b)) - strength(candidates.get(a))) / 400));
    return random() < chanceA ? a : b;
  };
  for (let run = 0; run < 1200; run++) {
    let alive = [...candidates.keys()].filter(id => !paired.has(id)).concat(pairs.map(([a, b]) => advance(a, b)));
    while (alive.length > 1) {
      for (let i = alive.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [alive[i], alive[j]] = [alive[j], alive[i]];
      }
      const next = [];
      for (let i = 0; i < alive.length; i += 2) next.push(i + 1 < alive.length ? advance(alive[i], alive[i + 1]) : alive[i]);
      alive = next;
    }
    wins.set(alive[0], (wins.get(alive[0]) ?? 0) + 1);
  }
  return [...wins].map(([id, count]) => ({ id, chance: count / 1200 })).sort((a, b) => b.chance - a.chance || a.id - b.id);
}

export function forecastLeague(teams, fixtures, standings = []) {
  const eligible = new Map(teams.map(t => [t.id, t]));
  if (teams.length < 2 || teams.length > 72) return [];
  const starts = new Map(standings.map(row => [row.teamId, row]));
  const future = fixtures.filter(m => !m.played && eligible.has(m.homeId) && eligible.has(m.awayId))
    .map(m => ({ ...m, p: forecastMatch(eligible.get(m.homeId), eligible.get(m.awayId)) }));
  let seed = 142319;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const winCount = new Map(teams.map(t => [t.id, 0]));
  for (let simulation = 0; simulation < 1200; simulation++) {
    const scores = new Map(teams.map(t => [t.id, (starts.get(t.id)?.points ?? 0) + Math.max(-.45, Math.min(.45, ((starts.get(t.id)?.gf ?? 0) - (starts.get(t.id)?.ga ?? 0)) * .004)) + random() * .001]));
    for (const game of future) {
      const value = random();
      scores.set(game.homeId, scores.get(game.homeId) + (value < game.p.win ? 3 : value < game.p.win + game.p.draw ? 1 : 0));
      scores.set(game.awayId, scores.get(game.awayId) + (value < game.p.win ? 0 : value < game.p.win + game.p.draw ? 1 : 3));
    }
    const winner = [...scores].reduce((top, item) => item[1] > top[1] ? item : top);
    winCount.set(winner[0], winCount.get(winner[0]) + 1);
  }
  return [...winCount].map(([id, count]) => ({ id, chance: count / 1200 })).sort((a,b) => b.chance - a.chance);
}

export function positionGroup(pos) {
  if (pos === 'ВР') return 'keeper';
  if (pos && /З$|^СВ$/.test(pos)) return 'defender';
  if (pos && /П$/.test(pos)) return 'midfield';
  return pos ? 'attack' : 'unknown';
}

export function awardLeaders(rows, people, award, period = null) {
  let available = rows;
  if (period) {
    const [from, through] = period;
    if (!from) return [];
    available = rows.map(r => {
      const games = (r.recentMatches ?? []).filter(m => m.played && m.date >= from && m.date <= through);
      const ratings = games.map(m => m.rating).filter(Number.isFinite);
      return {
        playerId: r.playerId, teamId: r.teamId, competitionId: r.competitionId,
        appearances: games.length, minutes: games.reduce((sum, m) => sum + (m.minutes || 0), 0),
        goals: games.reduce((sum, m) => sum + (m.goals || 0), 0), averageRating: ratings.length ? ratings.reduce((sum, n) => sum + n, 0) / ratings.length : null,
      };
    }).filter(r => r.appearances);
  }
  const aggregate = playerLeaders(available, 'ovr');
  return aggregate.flatMap(r => {
    if ((r.appearances ?? 0) <= 0) return [];
    const minimum = period ? 45 : ['ballon', 'defender', 'young'].includes(award) ? 450 : 0;
    if ((r.minutes ?? 0) < minimum) return [];
    const p = people.get(r.id);
    const role = positionGroup(p?.position);
    if ((award === 'glove' && role !== 'keeper') || (award === 'defender' && role !== 'defender') || (award === 'young' && !(p?.age > 0 && p.age <= 21))) return [];
    const performance = (r.averageRating ?? 0) * (period ? 10 : 8) + (r.goals ?? 0) * (period ? 1 : .55) + (r.assists ?? 0) * .4 + (r.manOfTheMatch ?? 0) * .6;
    const score = {
      scorer: r.goals, playmaker: r.assists, glove: r.cleanSheets, defender: (r.averageRating ?? 0) * 7 + (r.cleanSheets ?? 0),
      contributions: r.contributions, matchStar: r.manOfTheMatch,
    }[award] ?? performance;
    return Number.isFinite(score) && score > 0 ? [{ ...r, position: p?.position, role, score: Math.round(score * 100) / 100 }] : [];
  }).sort((a, b) => b.score - a.score || (b.minutes ?? 0) - (a.minutes ?? 0) || a.id - b.id);
}

export function teamOfPeriod(ranking) {
  const slots = { keeper: 1, defender: 4, midfield: 3, attack: 3 };
  const seen = new Set();
  return Object.entries(slots).flatMap(([role, size]) => ranking.filter(p => (p.role ?? positionGroup(p.position)) === role && !seen.has(p.id))
    .filter(p => { seen.add(p.id); return true; }).slice(0, size));
}

export function transferTargets(data, position, maxAge = Infinity) {
  const shortlist = new Map((data.shortlist ?? []).map(r => [r.playerId, r]));
  const year = data.date ? Math.floor(data.date / 10000) : Number(data.season?.slice(0, 4));
  const own = data.players.filter(p => p.teamId === data.clubId);
  const measures = data.players.filter(p => p.gender !== 1 && !p.academy && p.teamId != null && p.teamId !== data.clubId && (!position || p.position === position) && (maxAge === Infinity || p.age && p.age <= maxAge));
  const sorted = measures.map(p => {
    const contract = p.contractUntil != null && p.contractUntil <= year + 1;
    const record = shortlist.get(p.id);
    const peers = own.filter(q => q.position === p.position);
    const gain = peers.length ? p.ovr - Math.max(...peers.map(q => q.ovr || 0)) : null;
    const score = (p.ovr || 0) + Math.max(0, (p.potential || 0) - (p.ovr || 0)) * .6 + (record ? 15 : 0) + (contract ? 7 : 0) + (gain ?? 0) * .35;
    return { ...p, gain, score, record, contract, reason: record ? 'В списке сейва' : contract ? 'Короткий контракт' : gain > 0 ? 'Может усилить позицию' : 'Потенциал роста' };
  });
  return sorted.sort((a, b) => b.score - a.score || a.id - b.id);
}

export function summaryForPlayer(rows) {
  const totals = mergeStats(rows);
  return { ...totals, contributions: totals.goals == null && totals.assists == null ? null : (totals.goals ?? 0) + (totals.assists ?? 0) };
}
