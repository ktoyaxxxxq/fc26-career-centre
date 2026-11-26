const female = record => Number(record?.gender) === 1;
const womenCompetition = /\b(?:women(?:'s|’s)?|frauen|f[eé]minin[ea]?|wsl|nwsl|wucl|liga f)\b|женск/iu;

export function menCareer(career) {
  const seasons = [career, ...Object.values(career.history ?? {}), career.seasonArchive].filter(Boolean);
  const excludedPlayers = new Set(career.excludedPlayers ?? []);
  const excludedTeams = new Set(career.excludedTeams ?? []);
  const catalog = new Set();
  const members = new Map();
  for (const bank of seasons) {
    for (const team of bank.teams ?? []) if (female(team)) excludedTeams.add(team.id);
    for (const player of bank.players ?? []) {
      catalog.add(player.id);
      if (female(player)) excludedPlayers.add(player.id);
      if (player.teamId != null) {
        const entry = members.get(player.teamId) ?? { women: 0, men: 0 };
        entry[female(player) ? 'women' : 'men']++;
        members.set(player.teamId, entry);
      }
    }
  }
  for (const [id, squad] of members) if (squad.women > 0 && squad.men === 0) excludedTeams.add(id);
  for (const bank of seasons) for (const player of bank.players ?? []) if (excludedTeams.has(player.teamId)) excludedPlayers.add(player.id);
  const allowedTeam = id => !excludedTeams.has(Number(id));
  const allowedPlayer = id => catalog.has(id) && !excludedPlayers.has(id);
  const keepPlayerRow = row => allowedPlayer(row.playerId) && allowedTeam(row.teamId) && allowedTeam(row.offerTeamId);
  const keepMatch = row => allowedTeam(row.homeId) && allowedTeam(row.awayId);

  function clean(bank) {
    const comps = new Set((bank.competitions ?? []).filter(c => female(c) || womenCompetition.test(c.name ?? '')).map(c => c.id));
    const mixed = new Map();
    for (const match of bank.fixtures ?? []) mixed.set(match.competitionId, Boolean(mixed.get(match.competitionId) || keepMatch(match)));
    for (const [id, hasMen] of mixed) if (!hasMen) comps.add(id);
    const allowCompetition = row => !comps.has(row.competitionId);
    const filters = {
      players: p => allowedPlayer(p.id), teams: t => allowedTeam(t.id), competitions: c => !comps.has(c.id),
      stats: r => keepPlayerRow(r) && allowCompetition(r), fixtures: r => keepMatch(r) && allowCompetition(r),
      pendingFixtures: r => keepMatch(r) && allowCompetition(r), standings: r => allowedTeam(r.teamId) && allowCompetition(r),
      awards: r => (r.playerId == null || allowedPlayer(r.playerId)) && allowedTeam(r.teamId),
      honours: r => allowedTeam(r.teamId) && allowCompetition(r), shortlist: keepPlayerRow,
      ratings: keepPlayerRow, clubRatings: keepPlayerRow, teamOfWeek: keepPlayerRow,
      playerMeta: r => allowedTeam(r.teamid),
    };
    const result = { ...bank };
    for (const [key, filter] of Object.entries(filters)) if (Array.isArray(bank[key])) result[key] = bank[key].filter(filter);
    if (bank.tactics) result.tactics = Object.fromEntries(Object.entries(bank.tactics).filter(([id]) => allowedTeam(id)).map(([id, tactic]) => [id, {
      ...tactic, slots: (tactic.slots ?? []).map(slot => !slot.playerId || allowedPlayer(slot.playerId) ? slot : { ...slot, playerId: null }),
    }]));
    if (bank.telemetry) result.telemetry = Object.fromEntries(Object.entries(bank.telemetry).map(([key, rows]) => [key, rows.filter(keepPlayerRow)]));
    for (const key of ['clubId', 'nationalId']) if (!allowedTeam(bank[key])) result[key] = null;
    if (bank.heroId != null && !allowedPlayer(bank.heroId)) { result.heroId = null; result.playerMeta = []; }
    if (comps.has(bank.primaryId)) result.primaryId = null;
    return result;
  }

  return { ...clean(career), excludedPlayers: [...excludedPlayers], excludedTeams: [...excludedTeams],
    ...(career.history && { history: Object.fromEntries(Object.entries(career.history).map(([season, bank]) => [season, clean(bank)])) }),
    ...(career.seasonArchive && { seasonArchive: clean(career.seasonArchive) }),
  };
}
