import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menCareer } from './ui/men-career.mjs';

test('men’s career strips women from active, archived and attached records', () => {
  const fixtures = [{ id: 1, competitionId: 10, homeId: 11, awayId: 12 }, { id: 2, competitionId: 20, homeId: 21, awayId: 22 }];
  const stats = [{ playerId: 101, teamId: 11, competitionId: 10 }, { playerId: 201, teamId: 11, competitionId: 10 }, { playerId: 999, teamId: 11, competitionId: 10 }];
  const career = { players: [{ id: 101, gender: 0, teamId: 11 }, { id: 201, gender: 1, teamId: 11 }], teams: [{ id: 11 }, { id: 12 }, { id: 21, gender: 1 }, { id: 22, gender: 1 }],
    competitions: [{ id: 10, name: 'League' }, { id: 20, name: 'WSL' }], fixtures, stats, history: { before: { players: [{ id: 102, teamId: 12 }, { id: 201, teamId: 11 }], stats, fixtures } },
    shortlist: stats, teamOfWeek: stats, awards: stats, telemetry: { match: stats }, tactics: { 11: { slots: [{ playerId: 201 }, { playerId: 101 }] } } };
  const result = menCareer(career);
  for (const rows of [result.stats, result.history.before.stats, result.awards, result.shortlist, result.teamOfWeek, result.telemetry.match]) assert.deepEqual(rows.map(r => r.playerId), [101]);
  assert.deepEqual(result.players.map(p => p.id), [101]);
  assert.deepEqual(result.history.before.players.map(p => p.id), [102]);
  assert.deepEqual(result.fixtures.map(m => m.id), [1]);
  assert.deepEqual(result.competitions.map(c => c.id), [10]);
  assert.deepEqual(result.tactics[11].slots.map(slot => slot.playerId), [null, 101]);
  assert.equal(career.players.length, 2);
});

test('known excluded player ids survive a second pass after loading old archives', () => {
  const input = { excludedPlayers: [201], players: [{ id: 101 }], history: { before: { players: [{ id: 201 }, { id: 101 }] } } };
  assert.deepEqual(menCareer(input).history.before.players.map(p => p.id), [101]);
});
