import assert from 'node:assert/strict';
import test from 'node:test';
import { estimatePlayerStats as estimate } from './ui/estimate.mjs';

const attributes = { shortpassing: 80, longpassing: 78, vision: 82, composure: 82, dribbling: 83, ballcontrol: 80, agility: 79 };
const player = { position: 'ЦП', ovr: 81, attributes };

test('passing and dribbling volume depend on role and playing time', () => {
  const central = estimate(player, {}, { minutes: 90, averageRating: 7 });
  const winger = estimate({ ...player, position: 'ЛН' }, {}, { minutes: 90, averageRating: 7 });
  const sub = estimate(player, { minutes: 30 }, { minutes: 90, averageRating: 7 });
  assert(central.passes > winger.passes);
  assert(winger.dribbles > central.dribbles);
  assert(Math.abs(central.passes - sub.passes * 3) <= 2);
  assert.equal(sub.minutes, 30);
  assert.equal(central.source, 'estimated');
});

test('a recorded numeric match position takes precedence over the usual position', () => {
  const inMidfield = estimate(player, { minutes: 90, position: 14 });
  const onWing = estimate(player, { minutes: 90, position: 27 });
  assert(inMidfield.passes > onWing.passes);
  assert(onWing.dribbles > inMidfield.dribbles);
});

test('better ball skills and match ratings improve modeled completions', () => {
  const lower = { ...player, attributes: Object.fromEntries(Object.keys(attributes).map(key => [key, 55])) };
  const cold = estimate(player, { minutes: 900, rating: 61 });
  const warm = estimate(player, { minutes: 900, rating: 8.6 });
  const lessTechnical = estimate(lower, { minutes: 900, rating: 8.6 });
  assert(warm.completedPasses > cold.completedPasses);
  assert(warm.passAccuracy > lessTechnical.passAccuracy);
  assert(warm.completedDribbles > lessTechnical.completedDribbles);
  assert(warm.completedPasses <= warm.passes);
  assert(warm.completedDribbles <= warm.dribbles);
});

test('actual counts and observed zero attempts are preserved with their provenance', () => {
  const observed = estimate(player, { minutes: 90, totalpasses: 41, passesontarget: 31, dribbles: 0 });
  assert.deepEqual([observed.passes, observed.completedPasses, observed.passAccuracy], [41, 31, 76]);
  assert.deepEqual([observed.dribbles, observed.completedDribbles, observed.dribbleAccuracy], [0, 0, null]);
  assert.equal(observed.source, 'observed');
  assert.deepEqual([...observed.estimated], []);
});

test('modeling only missing fields flags every dependent metric', () => {
  const stats = estimate(player, { minutes: 90, passes: 25, completedDribbles: 8 });
  assert.equal(stats.source, 'mixed');
  assert.equal(stats.passes, 25);
  assert.equal(stats.completedDribbles, 8);
  assert(stats.dribbles >= 8);
  assert.deepEqual([...stats.estimated], ['completedPasses', 'passAccuracy', 'dribbles', 'dribbleAccuracy']);
});

test('no qualifying minutes leave absent counts unavailable', () => {
  const unavailable = estimate(player, { minutes: 0 }, { minutes: 90 });
  assert.equal(unavailable.minutes, 0);
  assert.equal(unavailable.passes, null);
  assert.equal(unavailable.completedDribbles, null);
  assert.equal(unavailable.source, 'unavailable');
  const observed = estimate(player, { passes: 12, completedPasses: 9 });
  assert.equal(observed.passAccuracy, 75);
  assert.equal(observed.dribbles, null);
  assert.equal(observed.source, 'observed');
});
