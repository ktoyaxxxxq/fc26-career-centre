const aliases = {
  playerid: 'playerId', playeridentifier: 'playerId', teamid: 'teamId',
  passes: 'passes', passattempts: 'passes', totalpasses: 'passes',
  completedpasses: 'completedPasses', passescompleted: 'completedPasses', passesontarget: 'completedPasses',
  dribbles: 'dribbles', dribbleattempts: 'dribbles', completeddribbles: 'completedDribbles', dribblescompleted: 'completedDribbles',
  successfuldribbles: 'completedDribbles', shots: 'shots', totalshots: 'shots', shotsontarget: 'shotsOnTarget',
  tackles: 'tackles', totaltackles: 'tackles', xg: 'xg', expectedgoals: 'xg', xa: 'xa', expectedassists: 'xa',
};
export const extraStats = [
  ['passes', 'Пасы'], ['completedPasses', 'Точные пасы'], ['dribbles', 'Обводки'],
  ['completedDribbles', 'Удачные обводки'], ['shots', 'Удары'], ['shotsOnTarget', 'В створ'],
  ['tackles', 'Отборы'], ['xg', 'xG'], ['xa', 'xA'],
];
const normalizedKey = key => key.toLowerCase().replace(/[^a-z0-9]/g, '');
const matchValues = (text, delimiter) => {
  const rows = [[]];
  let result = '', quoted = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { result += c; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === delimiter || c === '\n' || c == null)) {
      rows.at(-1).push(result.trim());
      result = '';
      if (c === '\n') rows.push([]);
    } else if (c != null) result += c;
  }
  return rows.filter(row => row.some(Boolean));
};

export function parseMatchTelemetry(input) {
  const text = input.replace(/^\uFEFF/, '').trim();
  let values;
  if (text.startsWith('[') || text.startsWith('{')) {
    const parsed = JSON.parse(text);
    values = Array.isArray(parsed) ? parsed : (parsed.players ?? [
      ...(parsed.home?.players ?? []).map(p => ({ teamId: parsed.home.teamId, ...p })),
      ...(parsed.away?.players ?? []).map(p => ({ teamId: parsed.away.teamId, ...p })),
    ]);
  } else {
    const header = text.split('\n', 1)[0];
    const delimiter = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',';
    const [fields = [], ...rows] = matchValues(text.replace(/\r\n/g, '\n'), delimiter);
    values = rows.map(row => Object.fromEntries(fields.map((name, i) => [name, row[i]])));
  }
  if (!Array.isArray(values) || values.length > 80) return [];
  const normalized = values.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const p = Object.fromEntries(Object.entries({ ...value, ...(value.stats ?? {}) }).map(([name, input]) => {
      const inputKey = normalizedKey(name);
      const key = Object.hasOwn(aliases, inputKey) ? aliases[inputKey] : null;
      const raw = typeof input === 'string' ? input.trim() : input;
      return [key, raw === '' || raw == null || typeof raw === 'boolean' ? NaN : Number(String(raw).replace(',', '.'))];
    }).filter(([key, n]) => key && Number.isFinite(n) && n >= 0 && n <= (key.endsWith('Id') ? 999999999 : 1000)));
    return Number.isSafeInteger(p.playerId) && p.playerId > 0 && extraStats.some(([field]) => p[field] != null) ? [p] : [];
  });
  return [...new Map(normalized.map(p => [p.playerId, p])).values()];
}

export function telemetryKey(season, m) {
  return `${season}/${m.competitionId}/${m.date}/${m.homeId}/${m.awayId}`;
}
