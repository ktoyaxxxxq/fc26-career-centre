export const estimatedStatFields = [
  ['passes', 'Пасы'], ['completedPasses', 'Точные пасы'], ['passAccuracy', 'Точность пасов, %'],
  ['dribbles', 'Обводки'], ['completedDribbles', 'Удачные обводки'], ['dribbleAccuracy', 'Удачные обводки, %'],
];

const positions = 'ВР СВ ПФЗ ПЗ ПЦЗ ЦЗ ЛЦЗ ЛЗ ЛФЗ ПОП ОП ЛОП ПП ПЦП ЦП ЛЦП ЛП ПАП АП ЛАП ПФА ЦФ ЛФА ПН ПНАП НАП ЛНАП ЛН'.split(' ');

// Position baselines per 90 minutes and expected completion percentages at neutral form.
const roles = [
  ['ВР GK',                            [22, 69, .2, 44]],
  ['СВ ПЦЗ ЦЗ ЛЦЗ SW RCB CB LCB',      [49, 86, .7, 51]],
  ['ПФЗ ПЗ ЛЗ ЛФЗ RWB RB LB LWB',      [43, 80, 2.2, 54]],
  ['ПОП ОП ЛОП RDM CDM LDM',          [57, 85, 1.8, 55]],
  ['ПЦП ЦП ЛЦП RCM CM LCM',            [57, 83, 2.8, 56]],
  ['ПАП АП ЛАП RAM CAM LAM',          [43, 78, 4.3, 55]],
  ['ПП ЛП ПФА ЛФА ПН ЛН RM LM RF LF RW LW', [35, 74, 5.6, 54]],
  ['ЦФ ПНАП НАП ЛНАП CF RS ST LS',     [23, 71, 2.9, 50]],
];
const roleByPosition = new Map(roles.flatMap(([names, values]) => names.split(' ').map(name => [name, values])));
const genericRole = [37, 77, 2.7, 53];
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const valid = (value, min = 0, max = Infinity) => Number.isFinite(value) && value >= min && value <= max;
const positionKey = value => Number.isInteger(value) ? positions[value] : value?.toUpperCase?.();

function modelCounts(player, observed, reference, minutes) {
  const position = [observed.position, reference.position, player?.position, player?.lineupPosition]
    .map(positionKey).find(key => roleByPosition.has(key));
  const [passVolume, passSuccess, dribbleVolume, dribbleSuccess] = roleByPosition.get(position) ?? genericRole;
  const keeper = position === 'ВР' || position === 'GK';
  const fallback = valid(player?.ovr, 1, 99) ? player.ovr : 68;
  const attribute = (key, defaultValue = fallback) => valid(player?.attributes?.[key], 1, 99) ? player.attributes[key] : defaultValue;
  const passing = keeper ? attribute('gkkicking') * .7 + attribute('longpassing') * .2 + attribute('composure') * .1
    : attribute('shortpassing') * .47 + attribute('longpassing') * .22 + attribute('vision') * .19 + attribute('composure') * .12;
  const dribbling = attribute('dribbling', keeper ? 38 : fallback) * .5 + attribute('ballcontrol', keeper ? 45 : fallback) * .26
    + attribute('agility') * .14 + attribute('balance') * .1;
  const recorded = [observed.rating, observed.averageRating, reference.rating, reference.averageRating].find(value => valid(value, 1, 100));
  const rating = recorded > 10 ? recorded / 10 : recorded ?? 6.7;
  const form = clamp(rating - 6.7, -2.5, 3.3);
  const time = minutes / 90;
  const involvement = 1 + form * .05;
  return {
    passes: Math.round(time * passVolume * clamp(1 + (passing - 70) * .009, .57, 1.3) * involvement),
    passAccuracy: clamp(passSuccess + (passing - 70) * .32 + form * 1.8, 42, 96),
    dribbles: Math.round(time * dribbleVolume * clamp(1 + (dribbling - 70) * .018, .22, 1.55) * involvement),
    dribbleAccuracy: clamp(dribbleSuccess + (dribbling - 70) * .55 + form * 2.7, 14, 82),
  };
}

const count = (...values) => {
  const value = values.find(value => valid(value));
  return value == null ? null : Math.round(value);
};

export function estimatePlayerStats(player, observed = {}, referenceStats = {}) {
  const minutes = [observed.minutes, referenceStats.minutes].find(value => valid(value)) ?? null;
  const model = minutes > 0 ? modelCounts(player, observed, referenceStats, minutes) : null;
  const results = {
    minutes,
    passes: count(observed.passes, observed.totalpasses),
    completedPasses: count(observed.completedPasses, observed.passesontarget),
    passAccuracy: valid(observed.passAccuracy, 0, 100) ? Math.round(observed.passAccuracy) : null,
    dribbles: count(observed.dribbles),
    completedDribbles: count(observed.completedDribbles),
    dribbleAccuracy: valid(observed.dribbleAccuracy, 0, 100) ? Math.round(observed.dribbleAccuracy) : null,
  };
  const hasObservations = estimatedStatFields.some(([key]) => results[key] != null);
  const estimated = new Set();
  const fill = (key, value) => {
    results[key] = value;
    estimated.add(key);
  };
  for (const [attempts, completed, accuracy] of [['passes', 'completedPasses', 'passAccuracy'], ['dribbles', 'completedDribbles', 'dribbleAccuracy']]) {
    if (model && results[attempts] == null) {
      const successes = results[completed];
      const recordedRate = results[accuracy];
      const expectedMisses = Math.round(model[attempts] * (100 - model[accuracy]) / 100);
      let volume = model[attempts];
      if (successes != null) {
        // Use the modeled number of misses when only successful actions were recorded.
        volume = recordedRate > 0 ? Math.round(successes * 100 / recordedRate) : successes + expectedMisses;
      }
      fill(attempts, volume);
    }
    if (results[completed] == null) {
      if (results[attempts] === 0 && !estimated.has(attempts)) results[completed] = 0;
      else if (model) fill(completed, Math.round(results[attempts] * (results[accuracy] ?? model[accuracy]) / 100));
    }
    if (results[accuracy] == null && results[attempts] > 0 && results[completed] != null && results[completed] <= results[attempts]) {
      const percentage = Math.round(results[completed] * 100 / results[attempts]);
      if (estimated.has(attempts) || estimated.has(completed)) fill(accuracy, percentage);
      else results[accuracy] = percentage;
    }
  }
  const source = estimated.size ? (hasObservations ? 'mixed' : 'estimated') : (hasObservations ? 'observed' : 'unavailable');
  return { ...results, estimated, source };
}
