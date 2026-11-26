import { action, blank, dateLabel, fmt, h, icon } from './ui.mjs';
import { eligibleSquad, lineupPositions, matchday, simulationNews, suggestLineup } from './season-sim.mjs';
import { money, suggestedOffer } from './desk-market.mjs';
import { buildTable } from './core.mjs';

const button = (command, label, style = 'secondary', glyph = 'arrow') => `<button type="button" class="button ${style}" data-desk="${command}">${h(label)}${glyph ? icon(glyph, 16) : ''}</button>`;
const dateAt = value => new Date(Date.UTC(Math.floor(value / 10000), Math.floor(value / 100) % 100 - 1, value % 100));
const stamp = dt => Number(dt.toISOString().slice(0, 10).replaceAll('-', ''));
function dateOffset(value, days) {
  const date = dateAt(value);
  date.setUTCDate(date.getUTCDate() + days);
  return stamp(date);
}
const opponent = (match, own) => match.homeId === own ? match.awayId : match.homeId;
const shortDay = new Intl.DateTimeFormat('ru', { weekday: 'short', timeZone: 'UTC' });
const longDay = new Intl.DateTimeFormat('ru', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const dealStatus = { counter: 'Встречное предложение', accepted: 'Согласовано', rejected: 'Отклонено' };
export const fcActions = {
  day: ['На день вперёд', 'Открой календарь и наведи курсор на кнопку, которая продвигает игру на один день.'],
  next: ['До следующего матча', 'Открой календарь и наведи курсор на кнопку перехода к следующему матчу.'],
  play: ['Играть матч', 'Открой меню дня матча и наведи курсор на пункт «Играть матч».'],
  sim: ['Симулировать матч', 'Открой меню дня матча и наведи курсор на пункт нужного вида симуляции.'],
  tactics: ['Управление составом', 'Наведи курсор на кнопку, открывающую состав твоей команды.'],
};

function syncMode(ctx) {
  if (ctx.career.kind !== 'save' || !ctx.native) return '';
  return ctx.switcher('desk-mode', [['live', 'Карьера FC 26'], ['model', 'Симуляция панели']], ctx.live ? 'live' : 'model', 'Режим календаря');
}

function syncBanner(ctx) {
  const pending = ctx.session.pending;
  if (ctx.game?.awaitingFocus) return `<div class="desk-sync-banner" role="status"><div><strong>Переключись в FC 26 через Alt + Tab</strong><p>Открой записанный экран и нажми F9 в течение 30 секунд.</p></div>${button('cancel-live', 'Отменить команду', 'secondary', '')}</div>`;
  if (!pending || !ctx.live) return '';
  return `<div class="desk-sync-banner" role="status"><div><strong>${pending.kind === 'calendar' ? 'Ждём новую дату из FC 26' : 'Ждём результат из FC 26'}</strong><p>Сохрани карьеру в игре, если дата или результат не обновились автоматически.</p></div>${button('cancel-live', 'Снять ожидание', 'secondary', '')}</div>`;
}

export function deskSync(ctx) {
  const { heading, section, game, state } = ctx;
  const target = state.controlFocus;
  const row = ([id, [label, help]]) => `<article class="desk-bind-row${id === target ? ' is-target' : ''}"><div><h3>${h(label)}</h3><p>${h(help)}</p></div><div class="desk-actions"><small>${game?.binding === id ? 'Ждём F8' : game?.actions?.includes(id) ? 'Записано' : 'Требуется запись'}</small><button type="button" class="button secondary" data-fc-bind="${id}">${game?.actions?.includes(id) ? 'Перезаписать' : 'Записать'}</button></div></article>`;
  return heading('Управление FC 26', 'Однократная настройка кнопок игрового меню', action('В штаб', 'overview', 'button secondary', 'left'))
    + `<section class="box desk-sync">${section(game?.ready ? 'Окно FC 26 обнаружено' : 'Сначала открой карьеру в FC 26', game?.ready ? button('live-focus', 'Перейти в игру', 'secondary', 'up') : '')}
      <p class="fine">В FC 26 включи оконный режим без рамки. Выбери действие здесь, наведи мышь на текст кнопки в игре и нажми F8. Для запуска команды открой тот же игровой экран.</p>
      ${game?.binding ? `<div class="desk-sync-banner"><div><strong>Запись кнопки · ${h(fcActions[game.binding]?.[0])}</strong><p>Наведи курсор в окне FC 26 и нажми F8.</p></div>${button('cancel-bind', 'Отменить', 'secondary', '')}</div>` : ''}
      ${Object.entries(fcActions).map(row).join('')}</section>`;
}

function article(entry, ctx) {
  return `<article class="desk-story"><span class="desk-story-icon">${icon(entry.kind === 'player' ? 'users' : entry.kind === 'world' ? 'world' : 'ball')}</span><div><small>${h(entry.date ? dateLabel(entry.date) : 'Карьера')}</small><h3>${h(entry.title)}</h3><p>${h(entry.body)}</p>${entry.playerId ? ctx.playerBtn(entry.playerId, 'Профиль игрока') : ''}</div></article>`;
}

export function deskStories(ctx) {
  const { data, sim, teamName, compName, career } = ctx;
  const seen = new Set();
  const actual = career.fixtures.filter(m => m.played && m.homeGoals != null && m.awayGoals != null)
    .sort((a, b) => b.date - a.date || Number([b.homeId, b.awayId].includes(data.clubId)) - Number([a.homeId, a.awayId].includes(data.clubId)))
    .filter(m => { if (seen.has(m.competitionId)) return false; seen.add(m.competitionId); return true; }).slice(0, 12)
    .map(m => ({ id: `save/${m.id}`, kind: 'world', date: m.date, title: `${teamName(m.homeId)} ${m.homeGoals}:${m.awayGoals} ${teamName(m.awayId)}`, body: `${compName(m.competitionId)} · Результат из сейва` }));
  return [...simulationNews(data, sim), ...actual].sort((a, b) => b.date - a.date);
}

export function deskMessages(ctx) {
  const { data, session, playerName, teamName, sim } = ctx;
  const results = simulationNews(data, sim).filter(item => item.kind === 'player' && item.clubId === data.clubId).slice(0, 30).map(item => ({
    ...item, title: `${playerName(item.playerId)} · После матча`, body: `«Рад, что смог помочь команде. Посмотрю разбор перед следующей игрой». Сообщение симуляции. ${item.body}`,
  }));
  const deals = session.deals.map(d => ({ id: `deal/${d.id}/${d.status}`, date: d.date, title: `${teamName(d.clubId === data.clubId ? d.originId : d.clubId)} · ${dealStatus[d.status]}`, body: `${playerName(d.playerId)} · ${money(d.counterFee ?? d.fee)}. Ответ смоделирован в панели.`, playerId: d.playerId }));
  const updates = (data.shortlist ?? []).slice(0, 6).map((row, i) => ({ id: `game-offer/${row.playerId}/${row.teamId}/${i}`, date: data.date, title: `Запись трансферного отдела · ${playerName(row.playerId)}`, body: `Данные из сейва. ${teamName(row.teamId)}${row.fee ? ` · ${money(row.fee)}` : ''}`, playerId: row.playerId }));
  const fixture = matchday(data, sim);
  const notes = fixture ? [{ id: `match/${fixture.id}/${fixture.date}`, date: sim.date, title: 'Штаб · Подготовка к матчу', body: `Ближайший соперник — ${teamName(opponent(fixture, data.clubId))}. Состав и план доступны на экране матча.` }] : [];
  return [...deals, ...results, ...notes, ...updates].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}

export function deskHome(ctx) {
  const { data, career, sim, heading, section, crest, clubBtn, playerBtn, compName, teamName } = ctx;
  const fixture = matchday(data, sim);
  const today = fixture?.date === sim.date;
  const last = sim.results[sim.lastMatchId];
  const stories = deskStories(ctx).slice(0, 3);
  const unread = deskMessages(ctx).filter(row => !ctx.session.read.includes(row.id)).length;
  const calendar = data.fixtures.filter(m => !m.played && [m.homeId, m.awayId].includes(data.clubId) && !sim.results[m.id]);
  const validDate = Number.isInteger(sim.date) && sim.date > 19000000;
  const dates = validDate ? Array.from({ length: 7 }, (_, index) => dateOffset(sim.date, index)) : [];
  const manage = data.mode === 'player' && data.heroId ? playerBtn(data.heroId, 'Профиль игрока', 'button secondary') : action('Статистика клуба', 'dashboard', 'button secondary', 'world');
  const commands = ctx.live ? `<button type="button" class="button primary" data-fc-action="day"${ctx.session.pending ? ' disabled' : ''}>+1 день в FC 26 ${icon('arrow', 16)}</button>${fixture ? `<button type="button" class="button ghost" data-fc-action="next"${ctx.session.pending ? ' disabled' : ''}>До матча ${icon('arrow', 16)}</button>` : ''}` : `${validDate && fixture ? button('day', '+1 день', 'primary') : ''}${fixture ? button('skip', 'До матча') : ''}`;
  return heading('Обзор карьеры', ctx.clubName ?? 'Штаб', `<div class="heading-actions">${manage}${button('top', 'Рейтинг по оценке', 'secondary', 'world')}</div>`)
    + `<div class="desk-mode">${syncMode(ctx)}${ctx.live ? action('Управление FC 26', 'sync', 'text-btn', 'sliders') : ''}</div>${syncBanner(ctx)}`
    + `<section class="desk-hero" aria-label="Календарь карьеры"><div class="desk-hero-copy"><div class="desk-context">${icon('calendar', 17)} <span>${ctx.live ? 'Календарь из сейва FC 26' : 'Календарь симуляции'}</span></div>
      <h2>${h(validDate ? longDay.format(dateAt(sim.date)) : 'Календарь недоступен')}</h2><p>${h([data.season ? `Сезон ${data.season}` : '', career.date ? `Дата сейва ${dateLabel(career.date)}` : ''].filter(Boolean).join(' · '))}</p>
      <div class="desk-actions">${today ? action('Открыть матч', 'matchday', 'button primary', 'ball') : commands}${last ? `<button type="button" class="button ghost" data-desk-report="${last.id}">Последний отчёт ${icon('up', 15)}</button>` : ''}</div></div>
      ${fixture ? `<div class="desk-hero-fixture"><small>${today ? 'День матча' : h(dateLabel(fixture.date, 'full'))} · ${h(compName(fixture.competitionId))}</small><div>${crest(fixture.homeId)}<span>–</span>${crest(fixture.awayId)}</div><h3>${h(teamName(fixture.homeId))} <span>—</span> ${h(teamName(fixture.awayId))}</h3>${action('Подготовка к матчу', 'matchday')}</div>` : ''}</section>
      ${dates.length ? `<div class="desk-calendar" aria-label="Ближайшие семь дней">${dates.map((date, i) => { const match = calendar.find(m => m.date === date); return `<div class="desk-day${i === 0 ? ' current' : ''}${match ? ' has-game' : ''}"><small>${h(shortDay.format(dateAt(date)))}</small><strong>${date % 100}</strong>${match ? `<button type="button" data-match="${match.id}" aria-label="Матч с ${h(teamName(opponent(match, data.clubId)))}">${crest(opponent(match, data.clubId))}</button>` : '<span class="desk-day-dot"></span>'}</div>`; }).join('')}</div>` : ''}
      <div class="dashboard desk-dashboard"><section class="box">${section('Лента карьеры', action('Все новости', 'briefing'))}${stories.map(item => article(item, ctx)).join('') || blank('Новости появятся после матчей.')}</section>
      <aside class="desk-side"><section class="box">${section('Почта клуба', action(unread ? `Открыть · ${unread} новых` : 'Открыть', 'inbox'))}${deskMessages(ctx).slice(0, 3).map(item => `<div class="desk-message-preview"><b>${h(item.title)}</b><small>${h(dateLabel(item.date))}</small></div>`).join('') || blank('Новых сообщений пока нет.')}</section><section class="box">${section('Трансферный центр', action('Перейти', 'market'))}<p class="desk-note">Управляй списком на продажу и готовь условия сделок.</p>${data.clubId != null ? clubBtn(data.clubId) : ''}</section><section class="box">${section('Результаты симуляции', action('Таблицы', 'sim-results'))}</section></aside></div>`;
}

export function boardPositions(tactic) {
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  if (tactic?.slots?.length === 11 && tactic.slots.every(slot => Number.isFinite(slot.x) && Number.isFinite(slot.y) && slot.x >= 0 && slot.x <= 1 && slot.y >= 0 && slot.y <= 1) && new Set(tactic.slots.map(slot => `${slot.x}/${slot.y}`)).size === 11) {
    return tactic.slots.map(slot => /^(ВР|GK)$/.test(slot.position ?? '') ? [50, 91] : [clamp(slot.x * 100, 13, 87), clamp((1 - slot.y) * 100, 9, 77)]);
  }
  return [[50, 89], [82, 69], [61, 73], [39, 73], [18, 69], [50, 54], [29, 42], [70, 41], [82, 20], [50, 13], [18, 20]];
}

function formationBoard(ctx, roster, lookup, lineup, positions) {
  const { data, state, portrait } = ctx;
  const tactic = data.tactics?.[data.clubId];
  const spot = state.deskSlot ?? 0;
  const position = positions[spot] ?? `Место ${spot + 1}`;
  const candidates = [...roster].sort((a, b) => Number(b.position === position) - Number(a.position === position) || (b.ovr ?? 0) - (a.ovr ?? 0));
  return `<div class="desk-formation"><div class="desk-pitch" role="group" aria-label="Стартовый состав на поле"><i class="desk-pitch-lines" aria-hidden="true"></i>${boardPositions(tactic).map(([x, y], i) => {
    const p = lookup.get(lineup[i]);
    const label = positions[i] ?? `Место ${i + 1}`;
    return `<button type="button" class="desk-pitch-player" style="--board-x:${x}%;--board-y:${y}%" data-desk-spot="${i}" aria-pressed="${spot === i}" aria-label="${h(label)}${p ? ` · ${h(p.name)}` : ' · выбрать игрока'}"><span class="desk-slot-role">${h(label)}</span>${p ? portrait(p) : '<span class="desk-slot-add" aria-hidden="true">+</span>'}<strong title="${h(p?.name ?? 'Выбрать игрока')}">${h(p?.name ?? 'Выбрать')}</strong>${p?.ovr ? `<small>${fmt(p.ovr)}</small>` : ''}</button>`;
  }).join('')}</div><div class="desk-pick"><div class="desk-pick-head"><b>Кого поставить</b><span>${h(position)}</span></div><div class="desk-bench" role="group" aria-label="Кандидаты на ${h(position)}">${candidates.map(p => {
    const active = lineup.indexOf(p.id);
    return `<button type="button" data-desk-pick="${p.id}" aria-pressed="${lineup[spot] === p.id}">${portrait(p)}<span><strong>${h(p.name)}</strong><small>${h(p.position ?? '—')}${active >= 0 ? ` · ${h(positions[active] ?? 'На поле')}` : ''}</small></span><b>${fmt(p.ovr)}</b></button>`;
  }).join('') || blank('В сейве нет доступного состава.')}</div></div></div>`;
}

export function deskMatch(ctx) {
  const { data, sim, state, heading, section, crest, portrait, teamName, compName, game, native, matchOdds } = ctx;
  const match = matchday(data, sim);
  if (!match) return heading('Подготовка к матчу') + blank('Доступные матчи этого сезона сыграны.') + action('Календарь', 'overview', 'button secondary');
  const roster = eligibleSquad(data).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
  const lookup = new Map(roster.map(player => [player.id, player]));
  const lineup = state.deskLineup ?? (sim.lineup.length ? sim.lineup : suggestLineup(data, sim));
  const positions = lineupPositions(data);
  const today = sim.date === match.date;
  const guide = state.deskGuide;
  const confirmed = lineup.filter(id => lookup.has(id)).length === Math.min(11, roster.length);
  const scheme = data.tactics?.[data.clubId]?.slots?.length === 11 ? data.tactics[data.clubId].name : '4–3–3';
  const gameLabel = game?.ready ? 'Скопировать состав и вернуться' : 'Скопировать состав';
  return heading('Подготовка к матчу', dateLabel(match.date, 'full'), action('Календарь', 'overview', 'button secondary', 'left'))
    + `<div class="desk-mode">${syncMode(ctx)}${ctx.live ? action('Управление FC 26', 'sync', 'text-btn', 'sliders') : ''}</div>${syncBanner(ctx)}`
    + `<div class="desk-match-banner"><div>${crest(match.homeId)}<h2>${h(teamName(match.homeId))}</h2></div><span><small>${h(compName(match.competitionId))}</small><strong>—</strong></span><div>${crest(match.awayId)}<h2>${h(teamName(match.awayId))}</h2></div></div>
      <div class="dashboard desk-dashboard desk-match-layout"><section class="box">${section('Стартовый состав', `<div class="desk-actions">${scheme ? `<span class="tag">${h(scheme)}</span>` : ''}${button('auto', 'Подобрать состав', 'secondary', 'users')}</div>`)}${formationBoard(ctx, roster, lookup, lineup, positions)}</section>
      <div class="desk-side"><section class="box">${section('Прогноз на матч')}${matchOdds(match, true)}</section><section class="box">${section(today ? 'День матча' : 'Матч впереди')}<div class="desk-box-actions">
      ${ctx.live ? today ? `<button type="button" class="button primary" data-fc-action="play"${ctx.session.pending ? ' disabled' : ''}>Играть в FC 26 ${icon('ball', 16)}</button><button type="button" class="button secondary" data-fc-action="sim"${ctx.session.pending ? ' disabled' : ''}>Симулировать в FC 26 ${icon('arrow', 16)}</button>` : `<button type="button" class="button primary" data-fc-action="next"${ctx.session.pending ? ' disabled' : ''}>К дате матча в FC 26 ${icon('arrow', 16)}</button>` : today ? `<button type="button" class="button primary" data-desk="play"${confirmed ? '' : ' disabled'}>Симулировать в панели ${icon('ball', 16)}</button>` : button('skip-match', 'Перейти к дате матча', 'primary')}
      ${ctx.live ? `<button type="button" class="button secondary" data-fc-action="tactics">Состав в FC 26 ${icon('users', 16)}</button>${button('guide-play', 'Ручной переход', 'ghost')}` : native && careerFixture(ctx.career, match) ? button('guide-sim', 'Перейти в FC 26') : ''}</div>
      ${ctx.live ? '<p class="desk-note">Выбор на поле сохраняет план состава. Изменения игрового состава подтверждаются в FC 26.</p>' : ''}
      ${guide ? `<div class="desk-guide"><b>${guide === 'sim' ? 'Симуляция в игре' : 'Подготовка в игре'}</b><p>${game?.ready ? '' : 'Запусти FC 26 привычным способом. '}${guide === 'sim' ? 'В карьере открой ближайший матч, проверь состав и запусти игровую симуляцию.' : 'В карьере открой ближайший матч и выставь состав по плану панели.'} После сохранения FC 26 панель откроет отчёт.</p>${button('handoff-match', gameLabel, 'primary', 'up')}</div>` : ''}</section></div></div>`;
}

export function careerFixture(career, match) {
  if (!match) return null;
  return (career.fixtures ?? []).find(m => m.date === match.date && m.competitionId === match.competitionId && m.homeId === match.homeId && m.awayId === match.awayId);
}

export function deskReport(ctx) {
  const { sim, state, heading, section, crest, teamName, compName, playerBtn } = ctx;
  const m = sim.results[state.deskReport ?? sim.lastMatchId];
  if (!m) return heading('Отчёт о матче') + blank('Сыграй матч в симуляции, чтобы открыть отчёт.');
  const metrics = [['xg', 'Ожидаемые голы'], ['possession', 'Владение, %'], ['shots', 'Удары'], ['shotsOnTarget', 'В створ'], ['passes', 'Пасы'], ['passAccuracy', 'Точность пасов, %'], ['dribbles', 'Обводки']];
  const ordered = [...(m.players ?? [])].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return heading('Отчёт о матче', `${dateLabel(m.date, 'full')} · Симуляция панели`, `<div class="heading-actions">${action('Таблицы', 'sim-results', 'button secondary')}${action('В штаб', 'overview', 'button primary', 'left')}</div>`)
    + `<div class="desk-match-banner"><div>${crest(m.homeId)}<h2>${h(teamName(m.homeId))}</h2></div><span><small>${h(compName(m.competitionId))}</small><strong>${fmt(m.homeGoals)} : ${fmt(m.awayGoals)}</strong></span><div>${crest(m.awayId)}<h2>${h(teamName(m.awayId))}</h2></div></div>
    <div class="profile-grid desk-dashboard"><section class="box">${section('Ход матча')}${(m.events ?? []).length ? `<ol class="desk-events">${m.events.map(event => `<li><b>${event.minute}′</b><span>${event.playerId ? playerBtn(event.playerId) : h(teamName(event.teamId))}<small>${h(teamName(event.teamId))}${event.assistId ? ` · пас ${h(ctx.playerName(event.assistId))}` : ''}</small></span>${icon('ball', 15)}</li>`).join('')}</ol>` : blank('Матч завершился без голов.')}</section>
    <section class="box">${section('Статистика команд')}<div class="desk-metrics">${metrics.map(([key, label]) => {
    const lhs = m.home?.[key], rhs = m.away?.[key];
    const share = lhs + rhs > 0 ? 100 * lhs / (lhs + rhs) : 50;
    return `<div class="desk-metric"><div><b>${fmt(lhs)}</b><span>${label}</span><b>${fmt(rhs)}</b></div><div class="desk-meter" style="--share:${share}%"></div></div>`;
  }).join('')}</div></section></div>
    <section class="box desk-dashboard">${section('Оценки и показатели игроков', ordered[0] ? `<span class="tag">Игрок матча · ${h(ordered[0].name ?? ctx.playerName(ordered[0].id))}</span>` : '')}${ordered.length ? `<div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Мин</th><th>Г</th><th>А</th><th>Пасы</th><th>Точные</th><th>Обводки</th><th>Успешные</th><th>Оценка</th></tr></thead><tbody>${ordered.map(r => `<tr><th scope="row">${r.id ? playerBtn(r.id, r.name ?? ctx.playerName(r.id)) : h(r.name)}<small class="under">${h(teamName(r.teamId))}</small></th>${[r.minutes, r.goals, r.assists, r.passes, r.completedPasses, r.dribbles, r.completedDribbles].map(n => `<td>${fmt(n)}</td>`).join('')}<td class="metric-score">${fmt(r.rating)}</td></tr>`).join('')}</tbody></table></div>` : blank('Личная статистика недоступна.')}</section>`;
}

export function deskResults(ctx) {
  const { data, sim, state, heading, section, select, compName, clubBtn } = ctx;
  const modeled = Object.values(sim.results).sort((a, b) => b.date - a.date || b.id - a.id);
  const options = [...new Set(modeled.map(m => m.competitionId))];
  if (data.primaryId != null && !options.includes(data.primaryId)) options.unshift(data.primaryId);
  const comp = options.includes(state.deskResultComp) ? state.deskResultComp : options[0];
  const results = modeled.filter(m => m.competitionId === comp);
  const key = m => `${m.competitionId}/${m.homeId}/${m.awayId}/${m.date}`;
  const league = data.competitions.find(c => c.id === comp)?.type === 'Лига';
  const combined = league ? [...new Map([...results, ...data.fixtures.filter(m => m.played && m.competitionId === comp && m.date <= sim.date)].map(m => [key(m), m])).values()] : [];
  const table = buildTable(combined);
  return heading('Результаты симуляции', dateLabel(sim.date, 'full'), action('В штаб', 'overview', 'button secondary', 'left'))
    + `<div class="page-tabs">${options.length ? select('desk-comp', options.map(id => [String(id), compName(id)]), String(comp), 'Турнир') : ''}</div>
    <div class="profile-grid"><section class="box">${section('Матчи симуляции')}${results.length ? `<ul class="desk-results">${results.slice(0, state.deskResultLimit ?? 30).map(m => `<li><small>${h(dateLabel(m.date))}</small>${clubBtn(m.homeId)}<button type="button" class="button secondary" data-desk-report="${m.id}">${fmt(m.homeGoals)} : ${fmt(m.awayGoals)}</button>${clubBtn(m.awayId)}</li>`).join('')}</ul>${results.length > (state.deskResultLimit ?? 30) ? `<div class="box-footer">${button('results-more', 'Ещё матчи')}</div>` : ''}` : blank('Здесь появятся матчи после продвижения календаря.')}</section>
    <section class="box">${section('Таблица на дату симуляции')}${table.length ? `<p class="fine">Сыгранные матчи из сейва и результаты симуляции.</p><div class="table-scroll"><table><thead><tr><th>№</th><th>Команда</th><th>М</th><th>Г</th><th>Очки</th></tr></thead><tbody>${table.map((r, i) => `<tr><td>${i + 1}</td><th scope="row">${clubBtn(r.teamId)}</th><td>${r.played}</td><td>${r.gf}:${r.ga}</td><td class="metric-score">${r.points}</td></tr>`).join('')}</tbody></table></div>` : blank('Для турнира доступен список результатов.')}</section></div>`;
}

export function deskNews(ctx) {
  const { heading, section, state, switcher, news } = ctx;
  const global = state.deskNewsTab === 'world';
  return heading('Новости', global ? 'Мировой футбол · BBC Sport' : 'События твоей карьеры') + `<div class="page-tabs">${switcher('desk-news', [['career', 'Новости карьеры'], ['world', 'Мировой футбол']], global ? 'world' : 'career', 'Ленты новостей')}</div>
    <section class="box desk-feed">${section(global ? 'Мировая лента' : 'Лента карьеры', global ? button('news-refresh', 'Обновить', 'secondary', '') : '')}${global ? news.items.length ? news.items.map((item, index) => `<article class="desk-story"><span class="desk-story-icon">${icon('world')}</span><div><small>${h(item.date)}</small><h3>${h(item.title)}</h3><p>${h(item.summary)}</p><button type="button" class="text-btn" data-desk-story="${index}">Читать на BBC Sport ${icon('up', 15)}</button></div></article>`).join('') : blank(news.error || (news.loading ? 'Загружаем мировую ленту…' : 'Нажми «Обновить», чтобы загрузить мировую ленту.')) : deskStories(ctx).slice(0, 28).map(item => article(item, ctx)).join('') || blank('Новостей пока нет.')}</section>`;
}

export function deskInbox(ctx) {
  const { heading, section, state, session, playerBtn } = ctx;
  const messages = deskMessages(ctx);
  const selected = messages.find(item => item.id === state.deskMessage);
  return heading('Сообщения', 'Штаб, игроки и трансферный отдел', button('read-all', 'Прочитать все', 'secondary', '')) + `<div class="profile-grid"><section class="box">${section('Входящие')}${messages.map(item => `<button type="button" class="desk-message" data-desk-message="${h(item.id)}" aria-pressed="${item.id === selected?.id}"><i class="${session.read.includes(item.id) ? '' : 'unread'}"></i><span><strong>${h(item.title)}</strong><small>${h(dateLabel(item.date))}</small></span>${icon('arrow', 15)}</button>`).join('') || blank('Сообщений пока нет.')}</section>
    <section class="box">${section(selected?.title ?? 'Сообщение')}${selected ? `<div class="desk-note"><small>${h(dateLabel(selected.date, 'full'))}</small><p>${h(selected.body)}</p>${selected.playerId ? playerBtn(selected.playerId, 'Профиль игрока') : ''}</div>` : blank('Выбери сообщение во входящих.')}</section></div>`;
}

export function deskMarket(ctx) {
  const { data, state, session, heading, section, switcher, portrait, playerBtn, teamName, select, native } = ctx;
  const tab = state.deskMarketTab ?? 'squad';
  const query = (state.deskMarketQuery ?? '').trim().toLowerCase();
  const roster = eligibleSquad(data).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
  const candidate = data.players.find(p => p.id === state.deskTransferPlayer);
  const own = candidate?.teamId === data.clubId;
  const currentOffer = state.deskOfferId && session.deals.find(deal => deal.id === state.deskOfferId);
  const values = state.deskOfferTerms ?? currentOffer ?? (candidate ? suggestedOffer(candidate) : null);
  const clubs = data.teams.filter(t => t.kind === 'club' && t.id !== data.clubId).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const opposite = currentOffer ? currentOffer.kind === 'sell' ? currentOffer.clubId : currentOffer.originId : candidate?.teamId;
  const draft = values && candidate ? `<section class="box desk-transfer-form">${section('Условия предложения', native ? button('guide-offer', 'В FC 26', 'secondary', 'up') : '')}
    <form id="desk-offer"><div class="desk-offer-player">${portrait(candidate)}<div><b>${h(candidate.name)}</b><small>${h(teamName(candidate.teamId))} · ${h(candidate.position)}</small></div></div>
    <div class="desk-offer-grid">${own ? select('desk-buyer', [['', 'Клуб-покупатель'], ...clubs.map(t => [String(t.id), t.name])], String(state.deskBuyer ?? opposite ?? ''), 'Клуб-покупатель') : ''}
    <label class="selection"><span>Сумма, €</span><input type="number" name="fee" min="0" max="999000000" value="${h(values.fee)}" required></label><label class="selection"><span>Зарплата в неделю, €</span><input type="number" name="wage" min="0" max="5000000" value="${h(values.wage)}" required></label><label class="selection"><span>Контракт, лет</span><input type="number" name="years" min="1" max="7" value="${h(values.years)}" required></label></div>
    <div class="desk-box-actions"><button type="submit" class="button primary"${data.clubId == null ? ' disabled' : ''}>Отправить в симуляции ${icon('arrow', 16)}</button></div></form>
    ${state.deskGuide === 'offer' ? `<div class="desk-guide"><b>Перенос условий в FC 26</b><p>${own ? 'Открой «Состав» → «Центр состава» → выбери игрока или входящее предложение.' : 'Открой «Трансферы» → «Поиск игроков» → найди футболиста и начни переговоры.'} Панель скопирует имя и условия сделки.</p>${button('handoff-offer', ctx.game?.ready ? 'Скопировать условия и вернуться' : 'Скопировать условия', 'primary', 'up')}</div>` : ''}</section>` : '';
  const matching = tab === 'targets' ? query.length >= 2 ? data.players.filter(p => p.teamId !== data.clubId && p.gender !== 1 && !p.academy && p.name.toLowerCase().includes(query)).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0)).slice(0, 36) : [] : roster.filter(p => !query || p.name.toLowerCase().includes(query));
  const rows = tab === 'offers' ? session.deals.map(d => `<article class="desk-story"><span class="desk-story-icon">${icon('radar')}</span><div><small>${h(dateLabel(d.date))}</small><h3>${playerBtn(d.playerId)} · ${h(dealStatus[d.status])}</h3><p>${h(teamName(d.originId))} → ${h(teamName(d.clubId))} · ${money(d.fee)}${d.status === 'counter' ? ` · Запрос ${money(d.counterFee)}` : ''}</p>${d.status === 'counter' ? `<button type="button" class="button secondary" data-desk-accept="${h(d.id)}">Принять · ${money(d.counterFee)}</button>` : ''}</div></article>`).join('') || blank('Предложений в симуляции ещё нет.')
    : matching.length ? `<div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Позиция</th><th>ОВР</th><th>${tab === 'targets' ? 'Клуб' : 'Список продажи'}</th><th></th></tr></thead><tbody>${matching.map(p => `<tr><th scope="row"><button type="button" class="person-cell" data-player="${p.id}">${portrait(p)}<strong>${h(p.name)}</strong></button></th><td>${h(p.position ?? '—')}</td><td class="metric-score">${fmt(p.ovr)}</td><td>${tab === 'targets' ? h(teamName(p.teamId)) : `<button type="button" class="button ghost" aria-pressed="${session.listed.includes(p.id)}" data-desk-list="${p.id}">${session.listed.includes(p.id) ? 'В списке' : 'Выставить'}</button>`}</td><td><button type="button" class="text-btn" data-desk-offer="${p.id}">Предложение ${icon('arrow', 15)}</button></td></tr>`).join('')}</tbody></table></div>` : blank(tab === 'targets' && query.length < 2 ? 'Введи имя игрока, чтобы подготовить предложение.' : 'Игроки не найдены.');
  return heading('Трансферный центр', 'Состав и переговоры в симуляции', action('Трансферный радар', 'radar', 'button secondary')) + `<div class="page-tabs">${switcher('desk-market', [['squad', 'Мой состав'], ['targets', 'Поиск игроков'], ['offers', 'Предложения']], tab, 'Разделы трансферов')}</div>
    ${draft}<section class="box desk-market-results">${section({ squad: 'Мои игроки', targets: 'Цели для трансфера', offers: 'Трансферные предложения' }[tab] ?? 'Трансферы')}${tab !== 'offers' ? `<div class="filters"><label class="inline-search">${icon('search', 16)}<input type="search" id="desk-market-filter" aria-label="Поиск игрока" placeholder="Имя игрока" value="${h(state.deskMarketQuery ?? '')}"></label></div>` : ''}${rows}</section>`;
}
