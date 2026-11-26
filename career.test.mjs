import assert from 'node:assert/strict';
import test from 'node:test';
import { findArchive, rememberArchive, snapshot } from './ui/archive.mjs';
import { forecastMatch, forecastTournament, orderCompetitions, periodRange, teamOfPeriod, awardLeaders } from './ui/analytics.mjs';
import { parseMatchTelemetry } from './ui/telemetry.mjs';

const fixtures = Array.from({ length: 6 }, (_, i) => ({ id: i, competitionId: 3, homeId: 1, awayId: i + 2, homeGoals: 2, awayGoals: 0, round: i, played: true, date: 20250901 + i }));
const career = { key: 'old', clubId: 1, season: '2025/26', date: 20250910, archiveSignature: 'identity', fixtures, awards: [], standings: [], honours: [], players: [{ id: 8, teamId: 1, name: 'Test' }], teams: [{ id: 1, name: 'Club' }], competitions: [], stats: [{ playerId: 8, teamId: 1, competitionId: 3, goals: 3, recentMatches: [{ date: 20250907, rating: 9 }] }] };

test('season archive retains transferred players, match entries and newer totals', () => {
  const saved = snapshot(career);
  const old = { ...career, date: 20250908, stats: [{ ...career.stats[0], goals: 1, recentMatches: [{ date: 20250905, rating: 7 }] }] };
  const updated = snapshot(old, saved);
  assert.equal(updated.stats[0].goals, 3);
  assert.equal(updated.stats[0].recentMatches.length, 2);
  const transferred = snapshot({ ...career, date: 20250914, stats: [], players: [] }, updated);
  assert.equal(transferred.players[0].name, 'Test');
  assert.equal(transferred.stats[0].goals, 3);
  assert.equal(transferred.fixtures.length, 6);
});

test('new slot links only when nearby results establish the same career', () => {
  const index = {};
  rememberArchive(index, 'career', career);
  assert.equal(findArchive(index, { ...career, key: 'new' }), 'career');
  assert.equal(findArchive(index, { ...career, key: 'new', fixtures: fixtures.map(row => ({ ...row, homeGoals: 3 })) }), null);
  assert.equal(findArchive(index, { ...career, key: 'branch', fixtures: fixtures.map((row, i) => i === 0 ? { ...row, homeGoals: 0 } : row) }), null);
});

test('match and title probabilities sum to one and favor the stronger team', () => {
  const home = { id: 1, power: 1750, kind: 'club' }, away = { id: 2, power: 1450, kind: 'club' };
  const probs = forecastMatch(home, away);
  assert(Math.abs(probs.win + probs.draw + probs.loss - 1) < 1e-8);
  assert(probs.win > probs.loss);
  const titles = forecastTournament([home, away], []);
  assert(Math.abs(titles.reduce((sum, t) => sum + t.chance, 0) - 1) < 1e-8);
  assert.equal(titles[0].id, 1);
});

test('competition selectors put the requested top leagues first', () => {
  assert.deepEqual(orderCompetitions([{ id: 1, leagueId: 19 }, { id: 2, leagueId: 13 }, { id: 3, leagueId: 53 }]).map(c => c.id), [2, 3, 1]);
});

test('weekly awards and teams use games in the target period and avoid duplicate players', () => {
  assert.deepEqual(periodRange(20260109, 'week'), [20260105, 20260111]);
  const people = new Map([[1, { position: 'ВР', age: 26 }], [2, { position: 'НАП', age: 21 }]]);
  const players = awardLeaders([
    { playerId: 1, minutes: 360, appearances: 4, goals: 0, cleanSheets: 1, averageRating: 7 },
    { playerId: 2, minutes: 450, appearances: 5, goals: 3, averageRating: 8.4 },
  ], people, 'glove');
  assert.deepEqual(players.map(p => p.id), [1]);
  assert.equal(teamOfPeriod([{ id: 1, score: 10, ...people.get(1) }, { id: 2, score: 9, ...people.get(2) }]).length, 2);
});

test('telemetry imports only observed numeric counters and accepts wrapped CSV and JSON', () => {
  assert.deepEqual(parseMatchTelemetry('PlayerID;TeamID;Passes;Dribbles;XG\n123;12;41;;1,2'), [{ playerId: 123, teamId: 12, passes: 41, xg: 1.2 }]);
  assert.deepEqual(parseMatchTelemetry('{"home":{"teamId":12,"players":[{"playerId":123,"stats":{"completed_passes":32,"constructor":9}}]}}'), [{ playerId: 123, teamId: 12, completedPasses: 32 }]);
  assert.deepEqual(parseMatchTelemetry('PlayerID,Passes\n567,'), []);
});
