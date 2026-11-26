import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { parentPort } from 'node:worker_threads';
import { loadTemplateMetadata, parseCareerData, parseEaFile, readTemplateDatabase } from 'eafc-db-kit';
import { normalizeCareer } from './ui/core.mjs';
import { menCareer } from './ui/men-career.mjs';

const tables = [
  'career_users', 'career_calendar', 'career_playerawards', 'career_competitionprogress',
  'career_playasplayerhistory', 'career_managerinfo', 'career_playercontract', 'teams',
  'leagues', 'leagueteamlinks', 'players', 'teamplayerlinks', 'nations', 'playernames',
  'dcplayernames', 'editedplayernames', 'career_playasplayer', 'career_managerhistory',
  'career_teamofweek', 'career_youthplayers', 'career_youthplayerhistory', 'career_scouts',
  'career_scoutmission', 'career_presignedcontract', 'career_playermatchratinghistory',
  'formations', 'teamsheets', 'teamformationteamstylelinks',
];
const version = 'FC 26';
const all = (db, name) => db.databases.flatMap(m => m.tables.filter(t => t.name === name).flatMap(t => t.records));
let reference;
function references() {
  reference ??= Promise.all([
    readTemplateDatabase({ version, tables: ['playernames', 'dcplayernames', 'nations'] }),
    readTemplateDatabase({ version, database: 'localization' }),
    loadTemplateMetadata(version),
  ]).then(([base, loc, metadata]) => ({
    metadata,
    records: {
      defaultNames: [...all(base, 'playernames'), ...all(base, 'dcplayernames')],
      defaultNations: all(base, 'nations'),
      localized: loc.databases.flatMap(db => db.tables.filter(t => t.name.startsWith('LanguageStrings')).flatMap(t => t.records)),
    },
  })).catch(error => {
    reference = null;
    throw error;
  });
  return reference;
}

parentPort.on('message', async ({ file, key }) => {
  try {
    const before = await stat(file);
    if (before.size > 128 * 1024 * 1024 || before.size < 128) throw new Error('Размер файла не соответствует сейву FC 26.');
    const bytes = await readFile(file);
    const after = await stat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) {
      parentPort.postMessage({ retry: true });
      return;
    }
    const fileName = basename(file);
    const referenceData = await references();
    const data = parseCareerData(bytes, { fileName });
    const database = parseEaFile(bytes, { metadata: referenceData.metadata, tables, fileName });
    const records = Object.fromEntries(tables.map(name => [name, all(database, name)]));
    if (!records.players.length || !records.teams.length) throw new Error('В файле не найдены игроки и клубы FC 26.');
    records.playernames.push(...records.dcplayernames);
    Object.assign(records, referenceData.records);
    const career = normalizeCareer(data, records, { fileName, key, kind: 'save', modified: after.mtime.toISOString() });
    const owner = records.career_users.find(row => row.clubteamid > 0);
    if (owner) {
      const biography = [owner.firstname, owner.surname, owner.commonname].filter(Boolean).join(' ').trim().toLowerCase();
      const initialClub = [...records.career_managerhistory].sort((a, b) => a.season - b.season).find(r => r.teamid > 0)?.teamid ?? owner.clubteamid;
      career.archiveSignature = createHash('sha256').update(JSON.stringify([career.mode, biography, initialClub])).digest('hex').slice(0, 32);
    }
    parentPort.postMessage({ career: menCareer(career), fingerprint: createHash('sha256').update(bytes).digest('hex'), mtime: after.mtimeMs, size: after.size });
  } catch (error) {
    parentPort.postMessage({ error: String(error.message ?? error), code: error.code });
  }
});
