export const totals = [
  ['appearances', 'Матчи'], ['minutes', 'Минуты'], ['goals', 'Голы'],
  ['assists', 'Ассисты'], ['yellowCards', 'Жёлтые'], ['redCards', 'Красные'],
  ['manOfTheMatch', 'Игрок матча'], ['cleanSheets', 'Сухие матчи'],
  ['goalsConceded', 'Пропущено'], ['saves', 'Сейвы'],
];

export const traits = [
  ['acceleration', 'Ускорение'], ['sprintspeed', 'Скорость'], ['finishing', 'Завершение'],
  ['shotpower', 'Сила удара'], ['longshots', 'Дальние удары'], ['positioning', 'Выбор позиции'],
  ['shortpassing', 'Короткий пас'], ['longpassing', 'Длинный пас'], ['vision', 'Видение поля'],
  ['crossing', 'Навесы'], ['dribbling', 'Дриблинг'], ['ballcontrol', 'Контроль мяча'],
  ['agility', 'Ловкость'], ['balance', 'Баланс'], ['composure', 'Хладнокровие'],
  ['stamina', 'Выносливость'], ['strength', 'Сила'], ['jumping', 'Прыжки'],
  ['interceptions', 'Перехваты'], ['standingtackle', 'Отбор'], ['slidingtackle', 'Подкат'],
  ['defensiveawareness', 'Игра в защите'], ['gkdiving', 'Прыжки вратаря'],
  ['gkreflexes', 'Рефлексы вратаря'], ['gkhandling', 'Ловля мяча'], ['gkkicking', 'Удар вратаря'],
  ['gkpositioning', 'Позиция вратаря'], ['reactions', 'Реакция'], ['curve', 'Подкрутка'],
  ['freekickaccuracy', 'Штрафные'], ['headingaccuracy', 'Игра головой'], ['penalties', 'Пенальти'],
  ['volleys', 'Удары с лёта'], ['aggression', 'Агрессия'],
];

const positions = ['ВР', 'СВ', 'ПФЗ', 'ПЗ', 'ПЦЗ', 'ЦЗ', 'ЛЦЗ', 'ЛЗ', 'ЛФЗ', 'ПОП', 'ОП', 'ЛОП', 'ПП', 'ПЦП', 'ЦП', 'ЛЦП', 'ЛП', 'ПАП', 'АП', 'ЛАП', 'ПФА', 'ЦФ', 'ЛФА', 'ПН', 'ПНАП', 'НАП', 'ЛНАП', 'ЛН'];

export function buildTable(fixtures, teamIds = []) {
  const rows = new Map();
  const row = id => {
    if (!rows.has(id)) rows.set(id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    return rows.get(id);
  };
  teamIds.forEach(row);
  for (const m of fixtures) {
    if (!m.played || m.homeId == null || m.awayId == null || m.homeGoals == null || m.awayGoals == null) continue;
    for (const [id, gf, ga] of [[m.homeId, m.homeGoals, m.awayGoals], [m.awayId, m.awayGoals, m.homeGoals]]) {
      const r = row(id);
      r.played++;
      r.gf += gf;
      r.ga += ga;
      if (gf > ga) { r.won++; r.points += 3; }
      else if (gf === ga) { r.drawn++; r.points++; }
      else r.lost++;
    }
  }
  return rankTable([...rows.values()]);
}

export function rankTable(rows) {
  return [...rows].sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || (a.slot ?? 0) - (b.slot ?? 0));
}

export function formFor(fixtures, id) {
  return fixtures.filter(m => m.played && m.homeGoals != null && m.awayGoals != null && (m.homeId === id || m.awayId === id))
    .sort((a, b) => a.date - b.date || a.id - b.id).slice(-5).map(m => resultFor(m, id));
}

export function resultFor(match, teamId) {
  const penalties = match.decision === 'penalties' && Number.isFinite(match.homePen) && Number.isFinite(match.awayPen) ? match.homePen - match.awayPen : 0;
  const difference = ((match.homeGoals - match.awayGoals) || penalties) * (teamId === match.homeId ? 1 : -1);
  return difference > 0 ? 'В' : difference === 0 ? 'Н' : 'П';
}

export function mergeStats(rows) {
  const result = Object.fromEntries(totals.map(([key]) => {
    const values = rows.map(r => r[key]).filter(Number.isFinite);
    return [key, values.length ? values.reduce((a, b) => a + b, 0) : null];
  }));
  const rated = rows.filter(r => Number.isFinite(r.averageRating) && r.averageRating > 0 && r.appearances > 0);
  const games = rated.reduce((sum, r) => sum + r.appearances, 0);
  result.ratedMatches = games;
  result.averageRating = games ? Math.round(100 * rated.reduce((sum, r) => sum + (Number.isFinite(r.ratingTotal) ? r.ratingTotal / 10 : r.averageRating * r.appearances), 0) / games) / 100 : null;
  result.per90 = result.minutes > 0 && result.goals != null ? Math.round(result.goals * 9000 / result.minutes) / 100 : null;
  return result;
}

export function leaderRows(rows, metric) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.playerId)) groups.set(row.playerId, []);
    groups.get(row.playerId).push(row);
  }
  return [...groups].map(([id, r]) => ({ id, teamId: r.at(-1).teamId, ...mergeStats(r) }))
    .filter(r => r[metric] > 0)
    .sort((a, b) => b[metric] - a[metric] || (a.minutes ?? Infinity) - (b.minutes ?? Infinity) || a.id - b.id);
}

export function seasonKey(date) {
  if (!Number.isInteger(date) || date < 19000101 || date > 22001231) return null;
  const month = Math.floor(date / 100) % 100;
  if (month < 1 || month > 12) return null;
  const year = Math.floor(date / 10000) - (month < 7 ? 1 : 0);
  return `${year}/${String(year + 1).slice(-2)}`;
}

function ageAt(birth, date) {
  if (!Number.isInteger(birth) || birth < 100000 || birth > 300000 || !date) return null;
  const birthday = new Date(Date.UTC(1582, 9, 14) + birth * 86400000);
  const monthDay = (birthday.getUTCMonth() + 1) * 100 + birthday.getUTCDate();
  const age = Math.floor(date / 10000) - birthday.getUTCFullYear() - (date % 10000 < monthDay ? 1 : 0);
  return age >= 12 && age <= 90 ? age : null;
}

export function normalizeCareer(raw, tables, meta) {
  const user = tables.career_users?.find(record => record.clubteamid > 0) ?? {};
  const mode = /^(cmpro|cmplr|playercareer)/i.test(meta.fileName ?? '') ? 'player' : /^(cmmgr|managercareer)/i.test(meta.fileName ?? '') ? 'manager' : 'unknown';
  const nodes = new Map(raw.competitions.map(node => [node.id, node]));
  const ancestor = (key, level) => {
    let node = nodes.get(key);
    for (let depth = 0; node && depth < 6; depth++, node = nodes.get(node.parentId)) {
      if (node.level === level) return node.id;
    }
    return null;
  };
  const leagues = new Map(tables.leagues?.map(r => [r.leagueid, r]));
  const teamLeagues = new Map(tables.leagueteamlinks?.map(r => [r.teamid, r.leagueid]));
  const isNational = id => !!leagues.get(teamLeagues.get(id))?.isinternationalleague || [78, 2136].includes(teamLeagues.get(id));
  const nations = new Map([...(tables.defaultNations ?? []), ...(tables.nations ?? [])].map(r => [r.nationid, r.nationname]));
  const locale = new Map(tables.localized?.map(r => [r.stringid?.toLowerCase(), r.sourcetext]));
  const competitionKinds = new Map();
  const observe = (competitionId, teamId) => {
    if (competitionId == null || teamId == null) return;
    const kind = isNational(teamId) ? 'national' : 'club';
    const recorded = competitionKinds.get(competitionId);
    competitionKinds.set(competitionId, recorded && recorded !== kind ? 'mixed' : kind);
  };
  for (const fixture of raw.fixtures) {
    observe(fixture.competitionId, fixture.home?.teamId);
    observe(fixture.competitionId, fixture.away?.teamId);
  }
  for (const r of raw.playerStats) observe(r.competitionId, r.teamId);
  for (const r of raw.standings) observe(ancestor(r.groupId, 'competition'), r.teamId);
  const competitions = raw.competitions.filter(n => n.level === 'competition' && (competitionKinds.has(n.id) || n.id === user.primarycompobjid))
    .map(n => {
      const league = leagues.get(Number(n.code?.slice(1)));
      const name = league?.leaguename || locale.get(n.nameKey?.toLowerCase()) || `Турнир ${n.code || n.id}`;
      return { id: n.id, name, code: n.code, leagueId: league?.leagueid ?? null, kind: competitionKinds.get(n.id) ?? 'club', type: league ? 'Лига' : 'Турнир' };
    });
  const schedule = raw.fixtures.map(m => ({
    id: m.index, competitionId: m.competitionId, groupId: m.groupId, round: m.round, date: m.date,
    stageId: ancestor(m.groupId, 'stage'), stageName: locale.get(nodes.get(ancestor(m.groupId, 'stage'))?.nameKey?.toLowerCase()) || '',
    homeId: m.home?.teamId, awayId: m.away?.teamId, homeGoals: m.home?.goals, awayGoals: m.away?.goals,
    homePen: m.home?.penalties, awayPen: m.away?.penalties, decision: m.decision, played: m.played,
  }));
  const fixtures = schedule.filter(m => m.homeId != null && m.awayId != null);
  const pendingFixtures = schedule.filter(m => !m.played && m.date >= 20250701 && (m.homeId == null || m.awayId == null));
  const ownFixtures = fixtures.filter(m => [m.homeId, m.awayId].includes(user.clubteamid) && m.date >= 20250701);
  const latestMatch = ownFixtures.filter(m => m.played).reduce((latest, m) => Math.max(latest, m.date), 0) || null;
  const firstMatch = ownFixtures.reduce((first, m) => Math.min(first, m.date), Infinity);
  const gameDate = tables.career_calendar?.map(r => r.currdate).find(d => d >= 20250701 && seasonKey(d) != null) ?? null;
  const date = gameDate ?? latestMatch;
  const dateBasis = gameDate != null ? 'calendar' : latestMatch != null ? 'match' : null;
  const standings = raw.standings.filter(r => r.teamId != null).map(r => {
    const sum = name => (r.home?.[name] ?? 0) + (r.away?.[name] ?? 0);
    const won = sum('wins'), drawn = sum('draws'), lost = sum('losses');
    return { teamId: r.teamId, competitionId: ancestor(r.groupId, 'competition'), groupId: r.groupId, groupName: locale.get(nodes.get(r.groupId)?.nameKey?.toLowerCase()) ?? '', slot: r.slot, played: won + drawn + lost, won, drawn, lost, gf: sum('goalsFor'), ga: sum('goalsAgainst'), points: r.points };
  });
  const teams = (tables.teams ?? []).map(r => ({
    id: r.teamid, assetId: r.assetid || r.teamid, name: r.teamname || locale.get(`teamname_${r.teamid}`) || `Команда #${r.teamid}`,
    kind: isNational(r.teamid) ? 'national' : 'club', gender: r.gender,
    league: leagues.get(teamLeagues.get(r.teamid))?.leaguename ?? null,
    ovr: r.overallrating || null, attack: r.attackrating || null, midfield: r.midfieldrating || null, defense: r.defenserating || null,
    stadiumCapacity: r.teamstadiumcapacity || null,
  }));
  const names = new Map([...tables.defaultNames ?? [], ...tables.playernames ?? []].map(r => [r.nameid, r.name]));
  const edited = new Map(tables.editedplayernames?.map(r => [r.playerid, r]));
  const links = new Map();
  const internationalLinks = new Map();
  for (const r of tables.teamplayerlinks ?? []) {
    if (isNational(r.teamid)) {
      if (!internationalLinks.has(r.playerid)) internationalLinks.set(r.playerid, new Set());
      internationalLinks.get(r.playerid).add(r.teamid);
    } else if (!links.has(r.playerid) || r.teamid === user.clubteamid) links.set(r.playerid, r);
  }
  const contracts = new Map(tables.career_playercontract?.map(r => [`${r.playerid}/${r.teamid}`, r]));
  const academyRows = new Map(tables.career_youthplayers?.map(r => [r.playerid, r]));
  const academyHistory = new Map(tables.career_youthplayerhistory?.map(r => [r.playerid, r]));
  const stats = raw.playerStats;
  const playerMeta = mode === 'player' ? tables.career_playasplayerhistory?.filter(r => r.userid === user.userid) ?? [] : [];
  const players = (tables.players ?? []).map(r => {
    const nameEdit = edited.get(r.playerid);
    const name = nameEdit?.commonname || [nameEdit?.firstname, nameEdit?.surname].filter(Boolean).join(' ') ||
      names.get(r.commonnameid) || [names.get(r.firstnameid), names.get(r.lastnameid)].filter(Boolean).join(' ') || `Игрок #${r.playerid}`;
    const link = links.get(r.playerid);
    const contract = contracts.get(`${r.playerid}/${link?.teamid}`);
    return {
      id: r.playerid, name, teamId: link?.teamid ?? null, nationalIds: [...(internationalLinks.get(r.playerid) ?? [])],
      gender: r.gender ?? 0, lineupPosition: positions[link?.position] ?? null,
      number: link?.jerseynumber, position: positions[r.preferredposition1] ?? null, ovr: r.overallrating, potential: r.potential,
      age: ageAt(r.birthdate, date ?? firstMatch), country: nations.get(r.nationality) ?? locale.get(`nationname_${r.nationality}`) ?? null,
      foot: r.preferredfoot === 1 ? 'Правая' : r.preferredfoot === 2 ? 'Левая' : null,
      height: r.height, weight: r.weight, skillMoves: r.skillmoves, weakFoot: r.weakfootability,
      contractUntil: r.contractvaliduntil >= 2025 && r.contractvaliduntil < 2100 ? r.contractvaliduntil : null,
      wage: contract?.wage > 0 ? contract.wage : null,
      academy: academyRows.has(r.playerid) ? { months: academyRows.get(r.playerid).monthsinsquad, appearances: academyHistory.get(r.playerid)?.appearances ?? null, goals: academyHistory.get(r.playerid)?.goals ?? null } : null,
      attributes: Object.fromEntries(traits.map(([key]) => [key, r[key]])),
    };
  });
  const heroName = user.commonname || [user.firstname, user.surname].filter(Boolean).join(' ');
  const heroMatches = mode === 'player' && heroName ? players.filter(p => p.teamId === user.clubteamid && p.name.toLowerCase() === heroName.toLowerCase()) : [];
  const heroRecordId = mode === 'player' ? tables.career_playasplayer?.find(r => r.userid === user.userid && r.playerid > 0)?.playerid : null;
  const manager = tables.career_managerinfo?.find(r => r.userid === user.userid);
  const teamSheets = new Map();
  for (const r of tables.teamsheets ?? []) {
    if (!teamSheets.has(r.teamid) || r.isfavourite) teamSheets.set(r.teamid, r);
  }
  const formations = new Map(tables.formations?.map(r => [r.formationid, r]));
  const formationByTeam = new Map(tables.formations?.filter(r => r.teamid > 0).map(r => [r.teamid, r]));
  const formationLinks = new Map(tables.teamformationteamstylelinks?.map(r => [r.teamid, r.formationid]));
  const lineups = new Map();
  for (const [playerId, r] of links) {
    if (!positions[r.position]) continue;
    if (!lineups.has(r.teamid)) lineups.set(r.teamid, new Map());
    if (!lineups.get(r.teamid).has(r.position)) lineups.get(r.teamid).set(r.position, playerId);
  }
  const tactics = {};
  for (const t of teams) {
    const sheet = teamSheets.get(t.id);
    const formation = formations.get(sheet?.sourceformationid) ?? formations.get(formationLinks.get(t.id)) ?? formationByTeam.get(t.id);
    if (!formation) continue;
    const slots = Array.from({ length: 11 }, (_, i) => {
      const pos = formation[`position${i}`];
      return {
        position: positions[pos], playerId: sheet?.[`playerid${i}`] || lineups.get(t.id)?.get(pos) || null,
        x: formation[`offset${i}x`], y: formation[`offset${i}y`],
      };
    });
    tactics[t.id] = { name: formation.formationname, slots, source: sheet ? 'Именованный состав из сейва' : 'Схема и назначения позиций из сейва' };
  }
  const youthScouts = (tables.career_scoutmission ?? []).map(r => {
    const scout = tables.career_scouts?.find(s => s.scoutid === r.scoutid);
    return { id: r.scoutid, name: [scout?.firstname, scout?.lastname].filter(Boolean).join(' '), country: nations.get(r.nationality), position: positions[r.preferredposition1], date: r.returningdate };
  });
  const clubRatings = (tables.career_playermatchratinghistory ?? []).filter(r => r.date >= 20250701 && r.minsplayed > 0).map(r => ({ playerId: r.playerid, date: r.date, minutes: r.minsplayed, rating: r.rating > 0 ? r.rating : null, position: positions[r.position] }));
  const shortlist = (tables.career_presignedcontract ?? []).filter(r => r.playerid > 0).map(r => ({ playerId: r.playerid, teamId: r.teamid, offerTeamId: r.offerteamid, fee: r.offeredfee, wage: r.offeredwage, signed: r.signeddate, date: r.completedate }));
  return { ...meta, mode, clubId: user.clubteamid ?? null, nationalId: isNational(user.nationalteamid) ? user.nationalteamid : null, primaryId: user.primarycompobjid ?? null, heroId: heroRecordId ?? (heroMatches.length === 1 ? heroMatches[0].id : null), date, dateBasis, season: seasonKey(date ?? firstMatch), competitions, teams, players, fixtures, pendingFixtures, standings, stats, playerMeta,
    tactics, youthScouts, clubRatings, shortlist, managerHistory: tables.career_managerhistory ?? [],
    teamOfWeek: (tables.career_teamofweek ?? []).filter(r => r.playerid > 0 && r.weekswon > 0).map(r => ({ playerId: r.playerid, month: r.month, rating: r.matchrating, count: r.weekswon })),
    manager: manager ? { confidence: manager.boardconfidence, reputation: manager.managerreputation } : null,
    awards: (tables.career_playerawards ?? []).filter(r => r.count > 0).map(r => ({ playerId: r.playerid, teamId: r.teamid, season: r.season, count: r.count, type: r.typeid })),
    honours: (tables.career_competitionprogress ?? []).filter(r => r.hasteamwon === 1).map(r => ({ teamId: r.teamid, competitionId: r.compobjid, season: r.season })),
  };
}
