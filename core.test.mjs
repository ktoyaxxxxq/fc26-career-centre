import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTable, formFor, mergeStats, normalizeCareer, seasonKey } from './ui/core.mjs';

const fixtures = [
  { id: 1, competitionId: 1, homeId: 1, awayId: 2, homeGoals: 2, awayGoals: 0, played: true, date: 20251005 },
  { id: 2, competitionId: 1, homeId: 2, awayId: 1, homeGoals: 1, awayGoals: 1, played: true, date: 20251009 },
  { id: 3, competitionId: 1, homeId: 1, awayId: 3, homeGoals: null, awayGoals: null, played: false, date: 20251013 },
];

test('a table omits unplayed matches but includes teams with zero games', () => {
  const table = buildTable(fixtures, [1, 2, 3]);
  assert.deepEqual(table.map(({ teamId, played, points }) => [teamId, played, points]), [[1, 2, 4], [2, 2, 1], [3, 0, 0]]);
  assert.deepEqual(formFor(fixtures, 1), ['В', 'Н']);
});

test('overall stats sum competitions and use appearances to weight ratings', () => {
  const rows = [
    { playerId: 5, goals: 2, appearances: 2, minutes: 120, averageRating: 8 },
    { playerId: 5, goals: 1, appearances: 1, minutes: 60, averageRating: 5 },
  ];
  assert.equal(mergeStats(rows).averageRating, 7);
  assert.equal(mergeStats(rows).goals, 3);
  assert.equal(mergeStats([]).goals, null);
});

test('season is derived from the in-game date and unknown stays unknown', () => {
  assert.equal(seasonKey(20260630), '2025/26');
  assert.equal(seasonKey(20260701), '2026/27');
  assert.equal(seasonKey(null), null);
});

test('career normalization preserves standings and hides unobserved hero identity', () => {
  const raw = {
    competitions: [{ id: 10, level: 'competition', code: 'C13' }, { id: 12, level: 'stage', parentId: 10 }, { id: 13, level: 'group', parentId: 12 }],
    standings: [{ groupId: 13, teamId: 1, points: 7, home: { wins: 1 }, away: {} }],
    fixtures: [], playerStats: [],
  };
  const tables = { career_users: [{ clubteamid: 1, primarycompobjid: 10 }], leagues: [{ leagueid: 13, leaguename: 'Test League' }], teams: [{ teamid: 1, teamname: 'Testing FC' }] };
  const data = normalizeCareer(raw, tables, { fileName: 'CmProFake' });
  assert.equal(data.mode, 'player');
  assert.equal(data.heroId, null);
  assert.equal(data.competitions[0].name, 'Test League');
  assert.equal(data.standings[0].points, 7);
  assert.equal(data.teams[0].name, 'Testing FC');
});
