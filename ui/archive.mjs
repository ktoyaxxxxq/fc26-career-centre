const byKey = (rows, key) => new Map((rows ?? []).map(row => [key(row), row]));
const mergeRows = (old, latest, key) => [...new Map([...byKey(old, key), ...byKey(latest, key)]).values()];
const statKey = r => `${r.playerId}/${r.teamId}/${r.competitionId}`;
const foundMatch = r => `${r.competitionId}/${r.homeId}/${r.awayId}/${r.date}/${r.homeGoals}/${r.awayGoals}`;
const fixtureKey = r => `${r.competitionId}/${r.homeId}/${r.awayId}/${r.round}/${r.date}`;
const awardKey = r => `${r.season}/${r.playerId}/${r.teamId}/${r.type ?? r.title}`;
const entryDate = r => r.date ?? 0;
const observedTraits = ['shortpassing', 'longpassing', 'vision', 'ballcontrol', 'dribbling', 'agility'];

export function snapshot(career, previous) {
  const old = previous ?? {};
  const newer = (career.date ?? 0) >= (old.date ?? 0);
  const combine = (earlier, later, key) => newer ? mergeRows(earlier, later, key) : mergeRows(later, earlier, key);
  const latestStats = byKey(career.stats, statKey);
  const stats = byKey(combine(old.stats, career.stats, statKey), statKey);
  for (const oldRow of old.stats ?? []) {
    const key = statKey(oldRow);
    const recent = combine(oldRow.recentMatches, latestStats.get(key)?.recentMatches, entryDate);
    if (recent.length) stats.set(key, { ...stats.get(key), recentMatches: recent });
  }
  const keep = new Set([...stats.values()].map(r => r.playerId));
  for (const p of career.players) if (p.teamId === career.clubId || p.academy) keep.add(p.id);
  const priorPlayers = byKey(old.players, r => r.id);
  const players = career.players.filter(p => keep.has(p.id)).map(({ id, name, ovr, potential, teamId, nationalIds, position, age, gender, academy, attributes }) => {
    const previous = priorPlayers.get(id);
    const modeledTraits = Object.fromEntries(observedTraits.filter(key => Number.isFinite(attributes?.[key])).map(key => [key, attributes[key]]));
    return { id, name, ovr, potential, teamId, nationalIds, position, age, gender, academy, attributes: { ...previous?.attributes, ...modeledTraits }, firstOvr: previous?.firstOvr ?? previous?.ovr ?? ovr, academySeen: Boolean(academy || previous?.academySeen || previous?.academy) };
  });
  const olderMatches = (old.fixtures ?? []).filter(m => m.played);
  return {
    date: newer ? career.date : old.date,
    players: combine(old.players, players, r => r.id),
    teams: combine(old.teams, career.teams, r => r.id),
    competitions: combine(old.competitions, career.competitions, r => r.id),
    fixtures: newer ? mergeRows(olderMatches, career.fixtures, fixtureKey)
      : mergeRows(career.fixtures.filter(m => m.played), old.fixtures, fixtureKey),
    standings: newer ? career.standings : (old.standings ?? career.standings),
    tactics: newer ? { ...(old.tactics ?? {}), ...career.tactics } : { ...career.tactics, ...(old.tactics ?? {}) },
    stats: [...stats.values()],
    honours: combine(old.honours, career.honours, r => `${r.teamId}/${r.competitionId}/${r.season}`),
    awards: combine(old.awards, career.awards, awardKey),
    teamOfWeek: combine(old.teamOfWeek, career.teamOfWeek, r => `${r.playerId}/${r.month}`),
    ratings: combine(old.ratings, career.clubRatings, r => `${r.playerId}/${r.date}`),
  };
}

export function findArchive(index, career) {
  if (index.paths?.[career.key]) return index.paths[career.key];
  if (!career.archiveSignature || !career.season) return null;
  const matches = new Set(career.fixtures.filter(m => m.played && [m.homeId, m.awayId].includes(career.clubId)).map(foundMatch));
  const fixtureOf = key => key.split('/').slice(0, 4).join('/');
  const gameByKey = new Map([...matches].map(m => [fixtureOf(m), m]));
  const candidates = Object.entries(index.careers ?? {}).filter(([, old]) => old.signature === career.archiveSignature && old.season === career.season);
  if (matches.size < 4) return null;
  const visible = candidates.filter(([, older]) => !(older.sample ?? []).some(m => gameByKey.has(fixtureOf(m)) && !matches.has(m)))
    .map(([id, older]) => ({ id, overlap: (older.sample ?? []).filter(result => matches.has(result)).length }))
    .filter(item => item.overlap >= 4).sort((a, b) => b.overlap - a.overlap);
  return visible[0] && visible[0].overlap > (visible[1]?.overlap ?? 0) ? visible[0].id : null;
}

export function rememberArchive(index, id, career) {
  index.paths ??= {};
  index.careers ??= {};
  index.paths[career.key] = id;
  const latest = index.careers[id];
  if (latest?.date && career.date && latest.date > career.date) return;
  index.careers[id] = {
    title: career.teams.find(t => t.id === career.clubId)?.name ?? 'Карьера FC 26',
    signature: career.archiveSignature, season: career.season, date: career.date,
    sample: career.fixtures.filter(m => m.played && [m.homeId, m.awayId].includes(career.clubId)).map(foundMatch),
  };
}
