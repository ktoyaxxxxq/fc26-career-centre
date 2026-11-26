import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceSimulation, lineupPositions, matchday, newSimulation, playSimulation, simulationNews, suggestLineup, validateLineup } from './ui/season-sim.mjs';

const squadPositions = ['ВР', 'ПЗ', 'ЦЗ', 'ЛЦЗ', 'ЛЗ', 'ОП', 'ЦП', 'АП', 'ПН', 'НАП', 'ЛН'];
const fixture = (id, date, homeId, awayId, extra = {}) => ({ id, date, homeId, awayId, played: false, competitionId: 8, ...extra });

function career() {
  return {
    clubId: 1, date: 20280228,
    teams: Array.from({ length: 4 }, (_, index) => ({ id: index + 1, name: `Клуб ${index + 1}`, ovr: 79, gender: 0 })),
    competitions: [{ id: 8, name: 'Лига' }],
    players: [1, 2, 3, 4].flatMap(teamId => squadPositions.map((position, index) => ({
      id: teamId * 100 + index, teamId, position, name: `Игрок ${teamId}-${index}`, ovr: 77 + index % 6, gender: 0,
    }))).concat([
      { id: 119, teamId: 1, position: 'НАП', name: 'Запасной', ovr: 80, gender: 0 },
      { id: 120, teamId: 1, position: 'НАП', name: 'Академия', ovr: 99, academy: {}, gender: 0 },
      { id: 121, teamId: 1, position: 'НАП', name: 'Другая команда', ovr: 99, gender: 1 },
    ]),
    fixtures: [fixture(106, 20280302, 4, 1), fixture(105, 20280301, 3, 4), fixture(104, 20280301, 2, 1, { time: 2000 }),
      fixture(103, 20280301, 1, 2, { time: 1500 }), fixture(102, 20280229, 3, 4), fixture(101, 20280228, 4, 3),
      fixture(100, 20280228, 1, 2, { played: true, homeGoals: 2, awayGoals: 1 }), fixture(99, 20280202, 1, 2)],
    stats: [],
  };
}

test('advances across leap day, models elapsed world fixtures and stops on the first own match', () => {
  const data = career();
  const initial = newSimulation(data);
  assert.equal(initial.date, 20280228);
  assert.deepEqual(initial.results, {});
  assert.strictEqual(playSimulation(data, initial), initial);
  const leapDay = advanceSimulation(data, initial);
  assert.equal(leapDay.date, 20280229);
  assert.deepEqual(Object.keys(leapDay.results), ['101']);
  const gameDay = advanceSimulation(data, initial, Infinity);
  assert.equal(gameDay.date, 20280301);
  assert.equal(matchday(data, gameDay).id, 103);
  assert.deepEqual(Object.keys(gameDay.results), ['101', '102']);
  assert.deepEqual(gameDay, advanceSimulation(data, leapDay));
  assert.strictEqual(advanceSimulation(data, gameDay, Infinity), gameDay);
  assert.deepEqual(JSON.parse(JSON.stringify(gameDay)), gameDay);
});

test('picks an ordered positional lineup and validates an edited selection', () => {
  const data = career();
  const lineup = suggestLineup(data, newSimulation(data));
  assert.equal(lineup.length, 11);
  assert.equal(lineup[0], 100);
  assert.equal(lineup[9], 109);
  assert.equal(new Set(lineup).size, 11);
  assert.equal(lineupPositions(data).length, 11);
  assert.deepEqual(validateLineup(data, ['119', 119, 219, 120, 121, 100, null, '']), [119, 100]);
  assert.deepEqual(validateLineup(data, [200, 100], 2), [200]);
});

test('kickoff uses the edited XI, produces consistent stats and preserves the imported career', () => {
  const data = career();
  const original = structuredClone(data);
  const gameDay = advanceSimulation(data, newSimulation(data), Infinity);
  const lineup = suggestLineup(data, gameDay).map(id => id === 109 ? 119 : id);
  const edited = { ...gameDay, lineup };
  const played = playSimulation(data, edited);
  const report = played.results[103];
  assert.equal(played.date, 20280301);
  assert.equal(matchday(data, played).id, 104);
  assert.equal(report.played, true);
  assert.equal(played.results[105].played, true);
  assert(played.results[103].players.some(p => p.id === 119));
  assert(!played.results[103].players.some(p => p.id === 109));
  assert.equal(report.home.possession + report.away.possession, 100);
  for (const [side, club] of [['home', 1], ['away', 2]]) {
    const rows = report.players.filter(p => p.teamId === club);
    assert.equal(rows.length, 11);
    assert.equal(rows.reduce((total, p) => total + p.passes, 0), report[side].passes);
    assert.equal(rows.reduce((total, p) => total + p.goals, 0), report[`${side}Goals`]);
    assert.equal(rows.reduce((total, p) => total + p.shotsOnTarget, 0), report[side].shotsOnTarget);
    assert(report[side].shotsOnTarget <= report[side].shots);
    assert(rows.every(p => p.completedPasses <= p.passes && p.completedDribbles <= p.dribbles && p.rating >= 1 && p.rating <= 10));
  }
  assert.equal(report.events.filter(e => e.type === 'goal').length, report.homeGoals + report.awayGoals);
  assert.deepEqual(playSimulation(data, edited), played);
  assert(!edited.results[103]);
  assert.deepEqual(data, original);
  assert.equal(playSimulation(data, played).results[104].played, true);
});

test('published simulation news is deterministic and refers to played fixtures only', () => {
  const data = career();
  const gameDay = advanceSimulation(data, newSimulation(data), Infinity);
  const played = playSimulation(data, gameDay);
  const news = simulationNews(data, played);
  assert(news.length >= 3);
  assert(news.some(item => item.clubId === data.clubId && item.kind === 'match' && item.date === 20280301));
  assert.equal(news[0].date, 20280301);
  assert.equal(new Set(news.map(item => item.id)).size, news.length);
  assert.deepEqual(news, simulationNews(data, JSON.parse(JSON.stringify(played))));
  assert(news.every(item => item.title && item.body && item.date <= played.date));
});

test('supports a sparse squad and a missing career date', () => {
  const data = { clubId: 4, players: [], fixtures: [fixture(1, 20260603, 5, 4)] };
  const state = newSimulation(data);
  assert.equal(state.date, 20260603);
  assert.deepEqual(state.lineup, []);
  assert.equal(matchday(data, state).id, 1);
  const result = playSimulation(data, state).results[1];
  assert(result.played);
  assert(result.home.shots >= result.homeGoals && result.away.shots >= result.awayGoals);
  assert.deepEqual(result.players, []);
});
