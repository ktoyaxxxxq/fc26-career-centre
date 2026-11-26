import assert from 'node:assert/strict';
import test from 'node:test';
import { competitionCoverage, filterWorld, playerLeaders, rateTeams } from './ui/world.mjs';
import { decodeDds, identifyAsset } from './images.cjs';

const teams = [
  { id: 1, name: 'Club A', kind: 'club', ovr: 70 },
  { id: 2, name: 'Club B', kind: 'club', ovr: 70 },
  { id: 7, name: 'Nation A', kind: 'national', ovr: 70 },
  { id: 8, name: 'Nation B', kind: 'national', ovr: 70 },
];
const stats = [
  { playerId: 1, teamId: 1, competitionId: 10, goals: 3, assists: 1, appearances: 4, minutes: 360, averageRating: 8 },
  { playerId: 1, teamId: 7, competitionId: 20, goals: 1, assists: 2, appearances: 1, minutes: 90, averageRating: 6 },
  { playerId: 2, teamId: 2, competitionId: 10, goals: 3, assists: 4, appearances: 1, minutes: 90, averageRating: 10 },
];
const fixture = (id, competitionId, homeId, awayId, homeGoals, awayGoals, options = {}) => ({
  id, competitionId, homeId, awayId, homeGoals, awayGoals, date: 20251001 + id, played: true, ...options,
});
const fixtures = [
  fixture(1, 10, 1, 2, 2, 0),
  fixture(2, 20, 7, 8, 1, 1, { homePen: 3, awayPen: 4, decision: 'penalties' }),
  fixture(3, 10, 2, 1, 0, 0, { played: false }),
];
const competitions = [{ id: 10, name: 'League', kind: 'club' }, { id: 20, name: 'National Cup', kind: 'national' }];
const world = { teams, competitions, stats, fixtures };

test('world filters preserve club and national appearances of the same player independently', () => {
  assert.equal(playerLeaders(filterWorld(world, 'all').stats, 'contributions')[0].contributions, 7);
  assert.deepEqual(filterWorld(world, 'national').stats.map(s => [s.teamId, s.goals]), [[7, 1]]);
  assert.equal(filterWorld(world, 'club', 20).stats.length, 0);
});

test('per 90 and match-rating leaderboards require at least 270 minutes', () => {
  assert.deepEqual(playerLeaders(stats, 'goalsPer90').map(row => [row.id, row.goalsPer90]), [[1, 0.8]]);
  assert.deepEqual(playerLeaders(stats, 'averageRating').map(row => [row.id, row.averageRating]), [[1, 7.6]]);
});

test('team strength starts from game OVR, updates chronologically and distinguishes penalties', () => {
  const rated = new Map(rateTeams(teams, fixtures).map(t => [t.id, t]));
  assert.equal(rated.get(1).played, 1);
  assert.equal(rated.get(1).goalsFor, 2);
  assert(rated.get(1).power > rated.get(2).power);
  assert(rated.get(8).power > rated.get(7).power);
  assert.equal(rated.get(8).won, 1);
});

test('tournament coverage exposes missing player data and ignores future results', () => {
  assert.deepEqual(competitionCoverage([...competitions, { id: 30 }], fixtures, stats).map(x => [x.id, x.played, x.scheduled, x.players]), [[10, 1, 1, 2], [20, 1, 0, 1], [30, 0, 0, 0]]);
});

test('game exports keep player and team IDs independent and reject unrelated files', () => {
  assert.deepEqual(identifyAsset('data/ui/imgAssets/heads/p231747.dds'), { kind: 'players', id: 231747, priority: 0 });
  assert.deepEqual(identifyAsset('crests/l243.png'), { kind: 'teams', id: 243, priority: 1 });
  assert.equal(identifyAsset('unrelated/231747.png'), null);
});

test('exported DDS portraits retain their RGB and alpha channel', () => {
  const bytes = Buffer.alloc(144);
  bytes.write('DDS ');
  bytes.writeUInt32LE(124, 4);
  bytes.writeUInt32LE(4, 12);
  bytes.writeUInt32LE(4, 16);
  bytes.write('DXT5', 84);
  bytes[128] = 128;
  bytes.writeUInt16LE(0xf800, 136);
  const result = decodeDds(bytes);
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
  assert.deepEqual([...result.pixels.subarray(0, 4)], [0, 0, 128, 128]);
  assert.equal(decodeDds(bytes.subarray(0, 142)), null);
});
