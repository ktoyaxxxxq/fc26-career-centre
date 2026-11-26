import assert from 'node:assert/strict';
import test from 'node:test';
import { academyTalents, nextFixture, simulateMatch, tournamentHistory } from './ui/kickoff.mjs';
import { playerLeaders } from './ui/world.mjs';

test('rating leaderboard needs several rated matches and rewards a consistent sample', () => {
  const stat = (playerId, appearances, averageRating) => ({ playerId, appearances, averageRating, minutes: appearances * 90 });
  const ranking = playerLeaders([stat(1,1,10), stat(2,3,9.1), stat(3,30,8.2), stat(4,50,6.9)], 'averageRating');
  assert.equal(ranking.some(row => row.id === 1), false);
  assert.equal(ranking[0].id, 3);
  assert.equal(ranking[0].averageRating, 8.2);
  assert(ranking[0].ratingScore < ranking[0].averageRating);
});

test('career tournament breakdown uses a separate observed row for every team and season', () => {
  const sample = { playerId: 1, appearances: 5, goals: 3, minutes: 450, competitionId: 13, teamId: 22 };
  const rows = tournamentHistory({ season: '2026/27', stats: [sample, { ...sample, competitionId: 16, appearances: 0, minutes: 0 }], history: { '2025/26': { stats: [{ ...sample, teamId: 19 }] } } }, 1);
  assert.deepEqual(rows.map(r => [r.season, r.teamId, r.competitionId]), [['2026/27', 22, 13], ['2025/26', 19, 13]]);
});

test('other club talents use registered youth and actual tournament exposure', () => {
  const data = { clubId: 1, teams: [{ id: 1, kind: 'club' }, { id: 2, kind: 'club' }], players: [
    { id: 11, teamId: 2, age: 19, potential: 90 }, { id: 12, teamId: 2, age: 26, potential: 94 }, { id: 13, teamId: 1, age: 20, potential: 85 },
  ], stats: [{ playerId: 11, teamId: 2, appearances: 2, goals: 1, assists: 2 }] };
  const list = academyTalents(data, { team: 2, metric: 'contributions' });
  assert.deepEqual(list.map(p => [p.id, p.contributions]), [[11, 3]]);
});

test('next match picks closest scheduled club game and simulation is separate and reproducible', () => {
  const data = { clubId: 1, date: 20260110, fixtures: [
    { id: 1, homeId: 2, awayId: 4, date: 20260110, played: false },
    { id: 2, homeId: 1, awayId: 2, date: 20260111, played: false },
    { id: 3, homeId: 3, awayId: 1, date: 20260109, played: false },
  ] };
  const before = structuredClone(data);
  assert.equal(nextFixture(data).id, 2);
  assert.deepEqual(simulateMatch([1.4, .9], () => .5), [2, 1]);
  assert.deepEqual(data, before);
});
