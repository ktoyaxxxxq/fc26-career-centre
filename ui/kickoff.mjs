import { summaryForPlayer } from './analytics.mjs';
import { applyRatingConfidence } from './world.mjs';

export function nextFixture(career, clubId = career.clubId) {
  if (clubId == null) return null;
  return (career.fixtures ?? []).filter(m => !m.played && m.homeId != null && m.awayId != null && m.date > 0 &&
    (m.homeId === clubId || m.awayId === clubId) && (!career.date || m.date >= career.date))
    .sort((a, b) => a.date - b.date || (a.time ?? 0) - (b.time ?? 0) || a.id - b.id)[0] ?? null;
}

export function simulateMatch(expected, random = Math.random) {
  return expected.map(lambda => {
    if (!Number.isFinite(lambda) || lambda <= 0) return 0;
    const stop = Math.exp(-Math.min(12, lambda));
    let product = 1, goals = 0;
    while (product > stop && goals < 30) { product *= random(); goals++; }
    return Math.max(0, goals - 1);
  });
}

export function tournamentHistory(career, playerId) {
  const seasons = new Map(Object.entries(career.history ?? {}));
  if (career.season) seasons.set(career.season, career.seasonArchive ?? career);
  if (!seasons.size) seasons.set(null, career);
  return [...seasons].sort(([a], [b]) => String(b ?? '').localeCompare(String(a ?? '')))
    .flatMap(([season, bank]) => (bank.stats ?? []).filter(r => r.playerId === playerId && (r.appearances > 0 || r.minutes > 0))
      .map(r => ({ ...r, season })));
}

export function academyTalents(data, { team = null, metric = 'potential', competition = null } = {}) {
  const clubs = new Set(data.teams.filter(t => t.kind === 'club' && !/\bYouth Squad\b|DO NOT USE/i.test(t.name ?? '')).map(t => t.id));
  const kids = data.players.filter(p => !p.academy && p.age >= 14 && p.age <= 21 && clubs.has(p.teamId) && p.teamId !== data.clubId &&
    (team == null || team === p.teamId));
  const currentClubs = new Map(kids.map(p => [p.id, p.teamId]));
  const rows = new Map();
  for (const stat of data.stats) {
    if (stat.teamId !== currentClubs.get(stat.playerId) || (competition != null && stat.competitionId !== competition)) continue;
    if (!rows.has(stat.playerId)) rows.set(stat.playerId, []);
    rows.get(stat.playerId).push(stat);
  }
  const scored = kids.map(p => ({ ...p, ...summaryForPlayer(rows.get(p.id) ?? []), competitionCount: new Set((rows.get(p.id) ?? []).filter(s => s.appearances > 0).map(s => s.competitionId)).size }));
  const available = metric === 'averageRating' ? applyRatingConfidence(scored) : scored;
  const rank = metric === 'averageRating' ? 'ratingScore' : metric;
  const requiresMatches = competition != null || !['potential', 'ovr'].includes(metric);
  return available.filter(p => (!requiresMatches || p.appearances > 0) && (rank !== 'ratingScore' || p.ratingScore != null))
    .sort((a, b) => (b[rank] ?? -1) - (a[rank] ?? -1) || (b.appearances ?? 0) - (a.appearances ?? 0) || (b.potential ?? -1) - (a.potential ?? -1) || a.id - b.id);
}
