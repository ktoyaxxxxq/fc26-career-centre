const { readFile, readdir, mkdir, stat, writeFile } = require('node:fs/promises');
const { dirname, join } = require('node:path');

function identifyAsset(path) {
  const parts = path.toLowerCase().split(/[\\/]/);
  const file = parts.pop();
  const image = /^([pl]?)(\d{1,9})\.(png|dds|jpe?g|webp)$/.exec(file);
  if (!image || Number(image[2]) === 0) return null;
  const priority = image[3] === 'dds' ? 0 : 1;
  const kind = image[1] === 'p' ? 'players' : image[1] === 'l' ? 'teams'
    : parts.some(p => ['heads', 'youthheads', 'players'].includes(p)) ? 'players'
      : parts.some(p => ['crests', 'clubs', 'teams'].includes(p)) ? 'teams' : null;
  return kind ? { kind, id: Number(image[2]), priority } : null;
}

async function scanImages(root) {
  const files = new Map();
  async function visit(dir, parts) {
    if (parts.length > 11) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path, [...parts, entry.name]);
      } else if (entry.isFile()) {
        const asset = identifyAsset([root.split(/[\\/]/).at(-1), ...parts, entry.name].join('/'));
        if (!asset) continue;
        const key = `${asset.kind}/${asset.id}`;
        if (!files.has(key) || files.get(key).priority < asset.priority) files.set(key, { path, priority: asset.priority });
      }
    }
  }
  await visit(root, []);
  return files;
}

function decodeDds(bytes) {
  if (bytes.length < 128 || bytes.toString('ascii', 0, 4) !== 'DDS ' || bytes.readUInt32LE(4) !== 124) return null;
  const height = bytes.readUInt32LE(12), width = bytes.readUInt32LE(16);
  const codec = bytes.toString('ascii', 84, 88);
  if (!width || !height || width > 1024 || height > 1024 || !['DXT1', 'DXT3', 'DXT5'].includes(codec)) return null;
  const pixels = Buffer.alloc(width * height * 4);
  const step = codec === 'DXT1' ? 8 : 16;
  const size = Math.ceil(width / 4) * Math.ceil(height / 4) * step;
  if (bytes.length < 128 + size) return null;
  const color = n => [Math.round((n & 31) * 255 / 31), Math.round((n >> 5 & 63) * 255 / 63), Math.round((n >> 11) * 255 / 31)];
  const blend = (a, b, left, right) => a.map((v, i) => Math.round((v * left + b[i] * right) / (left + right)));
  let offset = 128;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4, offset += step) {
      const colorOffset = offset + step - 8;
      const color0 = bytes.readUInt16LE(colorOffset), color1 = bytes.readUInt16LE(colorOffset + 2);
      const first = color(color0), second = color(color1);
      const three = codec === 'DXT1' && color0 <= color1;
      const colors = [first, second, blend(first, second, three ? 1 : 2, 1), three ? [0, 0, 0] : blend(first, second, 1, 2)];
      const selectors = bytes.readUInt32LE(colorOffset + 4);
      const alpha = [bytes[offset], bytes[offset + 1]];
      let alphaBits = 0;
      if (codec === 'DXT5') {
        const denominator = alpha[0] > alpha[1] ? 7 : 5;
        for (let i = 1; i < denominator; i++) alpha.push(Math.round(((denominator - i) * alpha[0] + i * alpha[1]) / denominator));
        if (denominator === 5) alpha.push(0, 255);
        alphaBits = bytes.readUIntLE(offset + 2, 6);
      }
      for (let pixel = 0; pixel < 16; pixel++) {
        const px = x + (pixel % 4), py = y + Math.floor(pixel / 4);
        if (px >= width || py >= height) continue;
        const selection = (selectors >>> (pixel * 2)) & 3;
        const opacity = codec === 'DXT5' ? alpha[Math.floor(alphaBits / (2 ** (pixel * 3))) % 8]
          : codec === 'DXT3' ? ((bytes[offset + Math.floor(pixel / 2)] >> (pixel % 2 * 4)) & 15) * 17
            : three && selection === 3 ? 0 : 255;
        const p = (py * width + px) * 4;
        for (let c = 0; c < 3; c++) pixels[p + c] = Math.round(colors[selection][c] * opacity / 255);
        pixels[p + 3] = opacity;
      }
    }
  }
  return { pixels, width, height };
}

const crestHost = 'https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256';
const portraitHost = 'https://ratings-images-prod.pulse.ea.com/FC25/full/player-portraits';
const crestIndex = 'https://drop-api.ea.com/rating/ea-sports-fc/filters?locale=en';
function officialUrl(kind, id) {
  // The official FC 26 ratings site reuses the FC25 portrait namespace.
  return kind === 'players' ? `${portraitHost}/p${id}.png?padding=0.7&width=240` : `${crestHost}/l${id}.png`;
}

function createImageStore({ cache, fetch, nativeImage }) {
  let local = new Map();
  let folder;
  const inFlight = new Map();
  const retryAt = new Map();
  const waiters = [];
  let active = 0;
  let generation = 0;
  let crestCatalog;
  let crestRetryAt = 0;

  async function catalogCrest(id) {
    if (!crestCatalog && crestRetryAt <= Date.now()) {
      crestCatalog = fetch(crestIndex, { signal: AbortSignal.timeout(5000), redirect: 'error' }).then(async response => {
        if (!response.ok || Number(response.headers.get('content-length')) > 3_000_000) throw new Error();
        const body = await response.text();
        if (body.length > 3_000_000) throw new Error();
        const groups = JSON.parse(body).teamGroups;
        const map = new Map();
        for (const group of Array.isArray(groups) ? groups : []) {
          for (const team of Array.isArray(group.teams) ? group.teams : []) {
            if (typeof team.imageUrl === 'string' && /^https:\/\/drop-assets\.ea\.com\/images\/[a-zA-Z0-9]+\/[a-f0-9]+\/l\d+\.png$/i.test(team.imageUrl)) {
              map.set(Number(team.id), team.imageUrl);
            }
          }
        }
        return map;
      }).catch(() => {
        crestCatalog = null;
        crestRetryAt = Date.now() + 300_000;
        return new Map();
      });
    }
    return (await crestCatalog)?.get(id);
  }

  async function setFolder(path) {
    if (!path) { local = new Map(); folder = undefined; generation++; return; }
    local = await scanImages(path);
    folder = path;
    generation++;
  }

  function decode(bytes, path = '') {
    if (!bytes?.length) return null;
    if (!path.toLowerCase().endsWith('.dds')) return nativeImage.createFromBuffer(bytes);
    const data = decodeDds(bytes);
    return data && nativeImage.createFromBitmap(data.pixels, { width: data.width, height: data.height, scaleFactor: 1 });
  }

  async function download(kind, id, path, key) {
    if ((retryAt.get(key) ?? 0) > Date.now()) return null;
    if (active >= 5) await new Promise(resolve => waiters.push(resolve));
    else active++;
    try {
      const options = () => ({ signal: AbortSignal.timeout(8000), redirect: 'error' });
      const catalogUrl = kind === 'teams' ? await catalogCrest(id) : null;
      let response = catalogUrl ? await fetch(catalogUrl, options()).catch(() => null) : null;
      if (!response?.ok) response = await fetch(officialUrl(kind, id), options());
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png') || Number(response.headers.get('content-length')) > 2_000_000) throw new Error();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 2_000_000 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error();
      const picture = decode(bytes);
      if (!picture || picture.isEmpty()) throw new Error();
      const max = 240;
      const { width, height } = picture.getSize();
      const buffer = (width >= height && width > max ? picture.resize({ width: max, quality: 'best' })
        : height > max ? picture.resize({ height: max, quality: 'best' }) : picture).toPNG();
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer).catch(() => {});
      return buffer;
    } catch {
      retryAt.set(key, Date.now() + 300_000);
      return null;
    } finally {
      const next = waiters.shift();
      if (next) next(); else active--;
    }
  }

  async function image(kind, id) {
    const key = `${kind}/${id}`;
    const path = join(cache, kind, `${id}.png`);
    const selected = local.get(key)?.path;
    if (selected) {
      try {
        const size = await stat(selected);
        if (size.size <= 12_000_000) {
          const picture = decode(await readFile(selected), selected);
          if (picture && !picture.isEmpty()) return picture.toPNG();
        }
      } catch {}
    }
    const saved = await readFile(path).catch(() => null);
    if (saved?.length) return saved;
    if (kind === 'players' && id >= 400000) return null;
    if (!inFlight.has(key)) inFlight.set(key, download(kind, id, path, key).finally(() => inFlight.delete(key)));
    return inFlight.get(key);
  }

  return {
    image, setFolder,
    status: () => ({ folder, players: [...local.keys()].filter(key => key.startsWith('players/')).length, teams: [...local.keys()].filter(key => key.startsWith('teams/')).length, generation }),
  };
}

module.exports = { createImageStore, identifyAsset, decodeDds };
