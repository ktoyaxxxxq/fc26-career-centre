import { mergeStats } from './core.mjs';

const rate = (total, minutes) => Number.isFinite(total) && minutes > 0 ? Math.round(total * 9000 / minutes) / 100 : null;
export const ratingMinimum = { matches: 3, minutes: 270, priorMatches: 6 };

export function applyRatingConfidence(players, minimum = ratingMinimum) {
  const observations = players.reduce((a, p) => {
    if (Number.isFinite(p.averageRating) && p.ratedMatches > 0) {
      a.matches += p.ratedMatches;
      a.total += p.averageRating * p.ratedMatches;
    }
    return a;
  }, { matches: 0, total: 0 });
  const mean = observations.matches ? observations.total / observations.matches : null;
  return players.map(p => ({
    ...p,
    ratingScore: mean != null && Number.isFinite(p.averageRating) && p.ratedMatches >= minimum.matches && p.minutes >= minimum.minutes
      ? (p.averageRating * p.ratedMatches + mean * minimum.priorMatches) / (p.ratedMatches + minimum.priorMatches) : null,
  }));
}

export function filterWorld(data, kind = 'all', competition = null) {
  const byKind = kind === 'all' ? data.teams : data.teams.filter(t => t.kind === kind);
  const ids = new Set(byKind.map(t => t.id));
  const available = data.competitions.filter(c => kind === 'all' || c.kind === kind || c.kind === 'mixed');
  return {
    teams: byKind,
    competitions: available,
    stats: data.stats.filter(r => (competition == null || r.competitionId === competition) && (kind === 'all' || ids.has(r.teamId))),
    fixtures: data.fixtures.filter(m => (competition == null || m.competitionId === competition) && (kind === 'all' || ids.has(m.homeId) && ids.has(m.awayId))),
  };
}

export function playerLeaders(rows, metric = 'goals') {
  const players = new Map();
  for (const row of rows) {
    if (!players.has(row.playerId)) players.set(row.playerId, []);
    players.get(row.playerId).push(row);
  }
  const results = [...players].map(([id, source]) => {
    const totals = mergeStats(source);
    const contributions = totals.goals == null && totals.assists == null ? null : (totals.goals ?? 0) + (totals.assists ?? 0);
    const ranked = [...source].filter(r => r.appearances > 0 || r.minutes > 0)
      .sort((a, b) => (b.appearances ?? 0) - (a.appearances ?? 0) || (b.minutes ?? 0) - (a.minutes ?? 0));
    return { id, ...totals, contributions, goalsPer90: rate(totals.goals, totals.minutes), assistsPer90: rate(totals.assists, totals.minutes), contributionsPer90: rate(contributions, totals.minutes), teamIds: [...new Set(ranked.map(r => r.teamId))] };
  });
  const minimum = metric.endsWith('Per90') ? 270 : 0;
  const ranked = metric === 'averageRating' ? applyRatingConfidence(results) : results;
  const key = metric === 'averageRating' ? 'ratingScore' : metric;
  return ranked.filter(p => metric === 'ovr' || metric === 'potential' || Number.isFinite(p[key]) && p[key] > 0 && (p.minutes ?? 0) >= minimum)
    .sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1) || (b.ratedMatches ?? 0) - (a.ratedMatches ?? 0) || (b.minutes ?? 0) - (a.minutes ?? 0) || a.id - b.id);
}

export function competitionCoverage(competitions, fixtures, stats) {
  const result = new Map(competitions.map(c => [c.id, { ...c, played: 0, scheduled: 0, goals: 0, ids: new Set(), teamIds: new Set() }]));
  for (const fixture of fixtures) {
    const c = result.get(fixture.competitionId);
    if (!c) continue;
    c.teamIds.add(fixture.homeId).add(fixture.awayId);
    if (!fixture.played) { c.scheduled++; continue; }
    c.played++;
    c.goals += (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0);
  }
  for (const row of stats) {
    const c = result.get(row.competitionId);
    if (!c) continue;
    c.teamIds.add(row.teamId);
    if (row.appearances > 0 || row.minutes > 0 || row.goals > 0 || row.assists > 0) c.ids.add(row.playerId);
  }
  return [...result.values()].map(({ ids, teamIds, ...row }) => ({ ...row, players: ids.size, teams: teamIds.size }));
}

export function rateTeams(teams, fixtures) {
  const ratings = new Map(teams.map(t => [t.id, {
    ...t, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0,
    power: Number.isFinite(t.ovr) && t.ovr > 0 ? 1500 + (t.ovr - 70) * 14 : 1500,
    recent: [],
  }]));
  const ordered = fixtures.filter(m => m.played && m.homeGoals != null && m.awayGoals != null)
    .sort((a, b) => a.date - b.date || a.id - b.id);
  for (const m of ordered) {
    const home = ratings.get(m.homeId), away = ratings.get(m.awayId);
    if (!home || !away || home.id === away.id) continue;
    const difference = m.homeGoals - m.awayGoals || (m.decision === 'penalties' && Number.isFinite(m.homePen) && Number.isFinite(m.awayPen) ? m.homePen - m.awayPen : 0);
    const outcome = difference > 0 ? 1 : difference < 0 ? 0 : .5;
    const expected = 1 / (1 + 10 ** ((away.power - home.power - (home.kind === 'national' ? 0 : 55)) / 400));
    const change = 28 * (outcome - expected);
    home.power += change;
    away.power -= change;
    for (const [t, scored, conceded, result] of [[home, m.homeGoals, m.awayGoals, outcome], [away, m.awayGoals, m.homeGoals, 1 - outcome]]) {
      t.played++;
      t.goalsFor += scored;
      t.goalsAgainst += conceded;
      if (result === 1) t.won++;
      else if (result === .5) t.drawn++;
      else t.lost++;
      t.recent.push(result === 1 ? 'В' : result === .5 ? 'Н' : 'П');
      if (t.recent.length > 5) t.recent.shift();
    }
  }
  return [...ratings.values()].map(t => ({ ...t, power: Math.round(t.power), winRate: t.played ? Math.round(100 * t.won / t.played) : null, goalDiff: t.goalsFor - t.goalsAgainst }));
}
