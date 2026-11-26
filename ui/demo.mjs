import { buildTable, traits } from './core.mjs';

const teams = [
  { id: 1, name: 'Атлас Юнайтед', short: 'AT', color: '#5a2ec9' },
  { id: 2, name: 'Нортбридж', short: 'NB', color: '#185c87' },
  { id: 3, name: 'Вестпорт Сити', short: 'WC', color: '#c24a37' },
  { id: 4, name: 'Риджвей', short: 'RW', color: '#26734d' },
  { id: 5, name: 'Саутгейт', short: 'SG', color: '#9b5c14' },
  { id: 6, name: 'Доксайд', short: 'DK', color: '#6a426d' },
  { id: 7, name: 'Эшфорд', short: 'AF', color: '#576235' },
  { id: 8, name: 'Лейквью', short: 'LV', color: '#2a6671' },
].map(team => ({ ...team, kind: 'club', ovr: 78 + team.id % 7 }));
const competitions = [
  { id: 1, name: 'Премьер-лига', type: 'Лига' },
  { id: 2, name: 'Кубок федерации', type: 'Кубок' },
  { id: 3, name: 'Лига чемпионов', code: 'C223', type: 'Кубок' },
].map(competition => ({ ...competition, kind: 'club' }));
const nationalTeams = [
  { id: 91, name: 'Испания', short: 'ES', color: '#8d341d', kind: 'national', ovr: 87, attack: 88, midfield: 89, defense: 84 },
  { id: 92, name: 'Франция', short: 'FR', color: '#294a7a', kind: 'national', ovr: 87, attack: 90, midfield: 86, defense: 85 },
  { id: 93, name: 'Марокко', short: 'MA', color: '#873332', kind: 'national', ovr: 79, attack: 80, midfield: 78, defense: 79 },
];
const international = { id: 88, name: 'Кубок сборных', type: 'Кубок', kind: 'national' };
const players = [
  [101, 'Лео Морено', 1, 9, 'НАП', 87, 92, 24, 'Испания', 'Правая', 183, 77],
  [102, 'Идрис Камара', 2, 10, 'ЛН', 85, 90, 25, 'Франция', 'Левая', 178, 73],
  [103, 'Оуэн Бёрнс', 1, 8, 'ЦП', 83, 86, 26, 'Ирландия', 'Правая', 181, 74],
  [104, 'Амир Нассер', 3, 11, 'НАП', 84, 91, 21, 'Марокко', 'Правая', 185, 78],
  [105, 'Ким Джунхо', 8, 7, 'ПН', 82, 88, 23, 'Южная Корея', 'Левая', 175, 69],
  [106, 'Малик Диалло', 1, 4, 'ЦЗ', 84, 86, 27, 'Сенегал', 'Правая', 190, 84],
  [107, 'Тиаго Рейс', 4, 10, 'АП', 83, 90, 20, 'Португалия', 'Правая', 179, 71],
  [108, 'Виктор Новак', 1, 1, 'ВР', 85, 86, 28, 'Хорватия', 'Правая', 193, 86],
].map(([id, name, teamId, number, position, ovr, potential, age, country, foot, height, weight], portrait) => ({
  id, name, teamId, number, position, ovr, potential, age, country, foot, height, weight, portrait,
  nationalIds: nationalTeams.filter(team => team.name === country).map(team => team.id),
  attributes: Object.fromEntries(traits.map(([key], index) => [key, position === 'ВР' ? (key.startsWith('gk') ? 81 + index % 9 : 30 + index % 35) : key.startsWith('gk') ? 10 + index % 6 : 64 + (index * 13 + id * 3) % 31])),
}));
const day = value => Number(value.toISOString().slice(0, 10).replaceAll('-', ''));
const pool = teams.map(t => t.id);
const fixtures = [];
for (let round = 0; round < 15; round++) {
  for (let pair = 0; pair < 4; pair++) {
    const [a, b] = [pool[pair], pool[7 - pair]];
    const [homeId, awayId] = round % 2 ? [b, a] : [a, b];
    const played = round < 14;
    const score = id => id === 1 ? (round === 12 ? 1 : 2 + round % 2) : (id * 7 + round * 11 + pair) % 4;
    fixtures.push({ id: fixtures.length + 1, competitionId: 1, groupId: 1, date: day(new Date(Date.UTC(2026, 0, 10 + 7 * round))), round: round + 1,
      homeId, awayId, homeGoals: played ? score(homeId) : null, awayGoals: played ? score(awayId) : null, played });
  }
  pool.splice(1, 0, pool.pop());
}
fixtures.push(
  { id: 61, competitionId: 2, date: 20260217, round: 1, homeId: 1, awayId: 3, homeGoals: 3, awayGoals: 1, played: true },
  { id: 62, competitionId: 2, date: 20260318, round: 2, homeId: 4, awayId: 1, homeGoals: 0, awayGoals: 2, played: true },
  { id: 63, competitionId: 2, date: 20260426, round: 3, homeId: 1, awayId: 2, homeGoals: null, awayGoals: null, played: false },
  { id: 64, competitionId: 3, date: 20260312, round: 1, homeId: 1, awayId: 5, homeGoals: 2, awayGoals: 0, played: true },
  { id: 65, competitionId: 3, date: 20260402, round: 2, homeId: 5, awayId: 1, homeGoals: 1, awayGoals: 1, played: true },
  { id: 66, competitionId: 3, date: 20260430, round: 3, homeId: 4, awayId: 1, homeGoals: null, awayGoals: null, played: false },
);
const demoTotals = [[18, 6], [15, 7], [5, 10], [13, 3], [9, 8], [2, 0], [8, 9], [0, 0]];
const stats = players.flatMap((p, index) => competitions.filter(c => c.id === 1 || [1, 2, 4, 5].includes(p.teamId)).map(c => {
  const [goals, assists] = demoTotals[index];
  const games = fixtures.filter(m => m.competitionId === c.id && m.played && [m.homeId, m.awayId].includes(p.teamId));
  if (!games.length) return null;
  const appearances = games.length;
  const averageRating = Math.round((8.4 - (index % 5) * .27 - (c.id - 1) * .1) * 100) / 100;
  const minutes = appearances * (p.position === 'ВР' ? 90 : 90 - (index % 4) * 5);
  return {
    playerId: p.id, teamId: p.teamId, competitionId: c.id, appearances, minutes,
    goals: c.id === 1 ? goals : Math.floor(goals / (5 + c.id)),
    assists: c.id === 1 ? assists : Math.floor(assists / 4),
    averageRating, cleanSheets: Math.min(appearances, 1 + index % 6), yellowCards: c.id === 1 ? index % 4 : 0,
    redCards: 0, manOfTheMatch: Math.min(appearances, index === 0 ? (c.id === 1 ? 7 : 1) : index % 3),
    goalsConceded: games.reduce((sum, m) => sum + (m.homeId === p.teamId ? m.awayGoals : m.homeGoals), 0),
    saves: p.position === 'ВР' ? appearances * 4 : null,
    recentMatches: games.slice(-5).map((m, j) => ({
      date: m.date, played: true, minutes: minutes / appearances, rating: Math.min(10, +(averageRating + (j % 2 ? -.45 : .25)).toFixed(1)),
      goals: p.position === 'НАП' ? j % 3 : 0,
    })),
  };
}).filter(Boolean));

const nationalFixtures = [
  { id: 90, competitionId: 88, groupId: 88, date: 20260324, round: 1, homeId: 91, awayId: 92, homeGoals: 2, awayGoals: 1, played: true },
  { id: 91, competitionId: 88, groupId: 88, date: 20260328, round: 2, homeId: 93, awayId: 91, homeGoals: 1, awayGoals: 1, played: true },
  { id: 92, competitionId: 88, groupId: 88, date: 20260614, round: 3, homeId: 92, awayId: 93, homeGoals: null, awayGoals: null, played: false },
];
const nationalStats = [
  { playerId: 101, teamId: 91, competitionId: 88, appearances: 2, minutes: 174, goals: 2, assists: 1, averageRating: 8.1, yellowCards: 0 },
  { playerId: 102, teamId: 92, competitionId: 88, appearances: 1, minutes: 90, goals: 1, assists: 0, averageRating: 7.4 },
  { playerId: 104, teamId: 93, competitionId: 88, appearances: 1, minutes: 90, goals: 1, assists: 0, averageRating: 7.8 },
];
const prospects = [
  { id: 190, name: 'Нико Алвес', teamId: 1, position: 'ЛН', age: 17, ovr: 64, potential: 87, gender: 0, academy: { months: 5, appearances: 7, goals: 3 }, attributes: {} },
  { id: 191, name: 'Адам Коул', teamId: 1, position: 'ЦП', age: 16, ovr: 60, potential: 84, gender: 0, academy: { months: 4, appearances: 5, goals: 1 }, attributes: {} },
  { id: 192, name: 'Лео Морено', teamId: 1, position: 'НАП', age: 24, ovr: 89, potential: 92, gender: 1, attributes: {} },
];
const prior = {
  date: 20250614, players: players.map(p => ({ ...p, age: p.age - 1, ovr: p.ovr - 2 })),
  stats: stats.filter(r => r.competitionId !== 3).map(r => ({ ...r, goals: Math.floor(r.goals * .82), recentMatches: [] })),
  teams, competitions: competitions.filter(c => c.id !== 3),
  fixtures: fixtures.filter(m => m.played && m.competitionId !== 3).map(m => ({ ...m, date: m.date - 10000 })),
  standings: [], awards: [], honours: [{ teamId: 1, competitionId: 2, season: '2024/25' }],
};

export const demo = {
  kind: 'demo', key: 'demo', mode: 'manager', clubId: 1, heroId: 101, primaryId: 1, season: '2025/26', date: 20260412,
  teams: [...teams, ...nationalTeams], competitions: [...competitions, international], players: [...players, ...prospects],
  fixtures: [...fixtures, ...nationalFixtures], stats: [...stats, ...nationalStats],
  history: { '2024/25': prior },
  youthScouts: [{ id: 1, name: 'Алекс Браун', country: 'Португалия', position: 'ЛН', date: 20260520 }],
  tactics: { 1: { name: '4–3–3', source: 'Демоданные', slots: [
    { x: .5, y: .11, playerId: 108, position: 'ВР' }, { x: .5, y: .28, playerId: 106, position: 'ЦЗ' },
    { x: .45, y: .56, playerId: 103, position: 'ЦП' }, { x: .52, y: .79, playerId: 101, position: 'НАП' },
  ] } },
  standings: [
    ...buildTable(fixtures.filter(m => m.competitionId === 1), teams.map(t => t.id)).map(r => ({ ...r, competitionId: 1, groupId: 1 })),
    ...buildTable(nationalFixtures, nationalTeams.map(t => t.id)).map(r => ({ ...r, competitionId: 88, groupId: 88 })),
  ],
  awards: [{ playerId: 101, season: '2024/25', count: 1, title: 'Игрок сезона' }, { playerId: 102, season: '2024/25', count: 1, title: 'Золотая бутса' }, { playerId: 103, season: '2024/25', count: 1, title: 'Лучший ассистент' }, { playerId: 104, season: '2024/25', count: 1, title: 'Золотой мяч' }],
  honours: [{ teamId: 1, competitionId: 2, season: '2024/25' }],
};
