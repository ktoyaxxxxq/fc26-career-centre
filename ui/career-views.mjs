import { action, blank, dateLabel, fmt, h, icon } from './ui.mjs';
import { awardLeaders, europeanKind, forecastLeague, forecastTournament, orderCompetitions, periodRange, teamOfPeriod, transferTargets } from './analytics.mjs';
import { playerLeaders } from './world.mjs';
import { academyTalents } from './kickoff.mjs';

const honoursOptions = [
  ['ballon', 'Золотой мяч', 'Средняя оценка, голы, ассисты и награды игрока матча. От 450 минут.'],
  ['scorer', 'Золотая бутса', 'Голы во включённых турнирах'],
  ['playmaker', 'Лучший плеймейкер', 'Ассисты во включённых турнирах'],
  ['glove', 'Золотая перчатка', 'Сухие матчи вратарей'],
  ['young', 'Лучший молодой игрок', 'Игроки до 21 года включительно. От 450 минут.'],
  ['defender', 'Лучший защитник', 'Средняя оценка и сухие матчи защитников. От 450 минут.'],
  ['contributions', 'Лучший по гол + пас', 'Сумма голов и ассистов'],
  ['matchStar', 'Игрок матча', 'Число наград за лучший матч'],
];
const euroNames = { ucl: 'Лига чемпионов', uel: 'Лига Европы', uecl: 'Лига конференций', super: 'Суперкубок УЕФА' };
const percent = n => `${Math.round(100 * n)}%`;

export function europeanPage(ctx) {
  const { data, state, heading, section, select, switcher, matchList, teamName, clubBtn, playerBtn, rankedTeams, compName, memo } = ctx;
  const available = orderCompetitions(data.competitions.filter(c => state.euroAll || europeanKind(c)), true);
  const c = available.find(c => c.id === state.euroComp) ?? available[0];
  if (!c) return heading('Еврокубки') + blank('В выбранном сейве нет данных о турнирах УЕФА.');
  const fixtures = data.fixtures.filter(m => m.competitionId === c.id).sort((a, b) => a.date - b.date);
  const rows = data.stats.filter(r => r.competitionId === c.id);
  const goals = playerLeaders(rows, 'contributions').slice(0, 12);
  const done = fixtures.filter(m => m.played);
  const remaining = fixtures.filter(m => !m.played);
  const teams = new Set(fixtures.flatMap(m => [m.homeId, m.awayId]).concat(rows.map(r => r.teamId)));
  const stageGroups = new Map();
  const pending = (data.pendingFixtures ?? []).filter(m => m.competitionId === c.id);
  for (const m of [...fixtures, ...pending].sort((a, b) => a.date - b.date)) {
    const key = m.stageId ?? m.groupId ?? 0;
    if (!stageGroups.has(key)) stageGroups.set(key, { name: m.stageName || (key ? `Этап ${stageGroups.size + 1}` : c.type), games: [], upcoming: [] });
    stageGroups.get(key)[m.homeId != null && m.awayId != null ? 'games' : 'upcoming'].push(m);
  }
  const kind = europeanKind(c);
  const finals = [...stageGroups.values()].find(s => /^(?:(?:grand|cup) )?final$/i.test(s.name.trim()) && s.games.length === 1 && s.games[0].played);
  const latestGroup = [...stageGroups.values()].filter(s => s.games.some(m => !m.played)).at(-1);
  const knockout = latestGroup && /knockout|play.?off|quarter|semi|round of|final/i.test(latestGroup.name);
  const participants = knockout ? new Set(latestGroup.games.flatMap(m => [m.homeId, m.awayId])) : teams;
  const domesticLeague = c.type === 'Лига' && !kind;
  const declared = data.standings.filter(row => row.competitionId === c.id);
  const leagueGroup = declared.find(row => row.teamId === data.clubId)?.groupId ?? declared[0]?.groupId;
  const leagueRows = declared.filter(row => row.groupId === leagueGroup);
  const leagueIds = new Set(leagueRows.map(row => row.teamId));
  const forecast = state.euroView === 'prediction' && !finals ? memo(`cup-forecast/${c.id}`, () => domesticLeague && leagueRows.length ?
    forecastLeague(rankedTeams().filter(t => leagueIds.has(t.id)), fixtures, leagueRows)
    : forecastTournament(rankedTeams().filter(t => participants.has(t.id)), knockout ? latestGroup.games.filter(m => !m.played) : [])) : [];
  let content;
  if (state.euroView === 'bracket') {
    const stages = [...stageGroups.values()];
    content = `<div class="bracket ${stages.length > 1 ? 'bracket-columns' : ''}">${stages.map(stage => {
      const max = stages.length > 1 ? 6 : 16;
      const games = stage.games.filter(m => !m.played).slice(0, max).concat(stage.games.filter(m => m.played).slice(-max)).slice(0, max);
      return `<section class="box">${section(stage.name)}
      ${games.length ? matchList(games) : ''}
      ${stage.upcoming.length ? `<ul class="scout-list"><li><strong>Пары ещё формируются</strong><small>${fmt(stage.upcoming.length)} матчей · с ${h(dateLabel(stage.upcoming[0].date))}</small></li></ul>` : ''}
      ${stage.games.length > max ? `<div class="box-footer"><button type="button" class="text-btn" data-calendar-comp="${c.id}">Полный календарь ${icon('arrow', 15)}</button></div>` : ''}</section>`;
    }).join('') || blank('Сетка появится, когда в сейве будут определены участники.')}</div>`;
  } else if (state.euroView === 'prediction') {
    content = `<section class="box">${section('Шансы на титул')}
      ${finals ? matchList(finals.games) : forecast.length ? `<p class="fine">${domesticLeague && leagueRows.length ? '1 200 симуляций до конца календаря по текущим очкам и прогнозам оставшихся матчей выбранной группы.' : '1 200 симуляций по рейтингу команд. Известные пары плей-офф учитываются, будущие пары моделируются. До объявления сетки учитывается весь видимый состав участников.'}</p>
      <div class="odds-list">${forecast.slice(0, 30).map((f, i) => `<div><span>${i + 1}</span>${clubBtn(f.id)}<meter min="0" max="1" value="${f.chance}" aria-label="Шанс титула ${h(teamName(f.id))}"></meter><b>${percent(f.chance)}</b></div>`).join('')}</div>` : blank('В сейве пока недостаточно участников для прогноза.')}</section>`;
  } else {
    content = `<div class="dashboard"><div class="main-column">
      <section class="box">${section('Ближайшие матчи', `<button type="button" class="text-btn" data-calendar-comp="${c.id}">Календарь ${icon('arrow', 15)}</button>`)}
      ${matchList(remaining.slice(0, 8))}</section>
      <section class="box">${section('Последние результаты')}${matchList(done.slice(-8).reverse())}</section>
      </div><section class="box">${section('Гол + пас')}
      ${goals.length ? `<div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Г</th><th>А</th><th>Г+А</th></tr></thead><tbody>${goals.map(p => `<tr><th scope="row">${playerBtn(p.id)}</th><td>${fmt(p.goals)}</td><td>${fmt(p.assists)}</td><td class="metric-score">${fmt(p.contributions)}</td></tr>`).join('')}</tbody></table></div>` : blank('Сейв пока не содержит личной статистики этого турнира.')}
      <div class="box-footer"><button type="button" class="text-btn" data-tournament="${c.id}">Таблица турнира ${icon('arrow', 15)}</button></div></section></div>`;
  }
  return heading(state.euroAll ? 'Сетки и прогнозы' : 'Еврокубки', data.season ? `Сезон ${data.season}` : '')
    + `<section class="euro-hero"><div>${icon('trophy', 40)}<h2>${h(euroNames[kind] ?? compName(c.id))}</h2><p>${fmt(teams.size)} команд · ${fmt(done.length)} сыгранных матчей</p></div>
      ${select('euro-comp', available.map(t => [String(t.id), euroNames[europeanKind(t)] ?? compName(t.id)]), String(c.id), 'Соревнование')}</section>
    <div class="page-tabs">${switcher('euro-view', [['overview', 'Обзор'], ['bracket', 'Этапы и сетка'], ['prediction', 'Шансы на титул']], state.euroView, 'Еврокубки')}</div>${content}`;
}

export function academyPage(ctx) {
  const { data, state, heading, section, switcher, portrait, playerName, playerBtn, clubName, clubBtn } = ctx;
  const tabs = `<div class="page-tabs">${switcher('academy-view', [['own', 'Моя академия'], ['clubs', 'Таланты других клубов U21']], state.academyView, 'Академия и таланты')}</div>`;
  if (state.academyView === 'clubs') return heading('Академия', data.season ? `Сезон ${data.season}` : '') + tabs + talentsPage(ctx);
  const academy = data.players.filter(p => p.academy).sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0));
  const age = list => list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : null;
  const old = Object.values(data.history ?? {}).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
  const history = new Map(old?.players?.map(p => [p.id, p]));
  const current = new Map(data.seasonArchive?.players?.map(p => [p.id, p]));
  const graduates = data.players.filter(p => !p.academy && p.teamId === data.clubId && (current.get(p.id)?.academySeen || history.get(p.id)?.academy || history.get(p.id)?.academySeen));
  const scouts = data.youthScouts ?? [];
  return heading('Академия', clubName, data.clubId != null ? clubBtn(data.clubId) : '')
    + tabs + `<div class="strip world-strip">${[[academy.length, 'Воспитанники'], [age(academy.map(p => p.age).filter(Number.isFinite)), 'Средний возраст'], [academy[0]?.potential, 'Лучший потенциал'], [scouts.length, 'Миссии скаутов']].map(([value, label]) => `<div><strong>${fmt(value)}</strong><small>${label}</small></div>`).join('')}</div>
    <div class="dashboard"><div class="main-column"><section class="box">${section('Игроки академии')}
    ${academy.length ? `<div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Возраст</th><th>ОВР</th><th>Пот.</th><th>Рост ОВР</th><th>Мес.</th><th>М</th><th>Г</th></tr></thead><tbody>
    ${academy.map(p => {
      const previous = history.get(p.id)?.ovr ?? current.get(p.id)?.firstOvr;
      return `<tr><th scope="row"><button type="button" class="person-cell" data-player="${p.id}">${portrait(p)}<span><strong>${h(playerName(p.id))}</strong><small>${h(p.position || '—')}</small></span></button></th>
      <td>${fmt(p.age)}</td><td>${fmt(p.ovr)}</td><td class="metric-score">${fmt(p.potential)}</td><td>${fmt(previous == null ? null : p.ovr - previous)}</td>
      <td>${fmt(p.academy.months)}</td><td>${fmt(p.academy.appearances)}</td><td>${fmt(p.academy.goals)}</td></tr>`;
    }).join('')}</tbody></table></div>` : blank('В выбранном сейве нет воспитанников академии.')}</section>
    ${graduates.length ? `<section class="box">${section('Выпускники в первой команде')}<ul class="scout-list">${graduates.map(p => `<li>${playerBtn(p.id)}<small>${h(p.position)} · ОВР ${fmt(p.ovr)}</small></li>`).join('')}</ul></section>` : ''}</div>
    <section class="box">${section('Миссии скаутов')}
    ${scouts.length ? `<ul class="scout-list">${scouts.map(s => `<li><strong>${h(s.country || s.name || 'Миссия')}</strong><small>${h([s.name, s.position, dateLabel(s.date)].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>` : blank('Данные о миссиях скаутов отсутствуют.')}</section></div>`;
}

function talentsPage(ctx) {
  const { data, state, section, select, portrait, teamName, clubBtn, compName, memo } = ctx;
  const all = memo('academy/all', () => academyTalents(data));
  const clubIds = [...new Set(all.map(p => p.teamId))];
  if (state.academyClub != null && !clubIds.includes(state.academyClub)) clubIds.push(state.academyClub);
  const clubOptions = clubIds.sort((a, b) => teamName(a).localeCompare(teamName(b), 'ru')).map(id => [String(id), teamName(id)]);
  const ids = new Map(all.filter(p => state.academyClub == null || p.teamId === state.academyClub).map(p => [p.id, p.teamId]));
  const observed = new Set(data.stats.filter(r => ids.get(r.playerId) === r.teamId && r.appearances > 0).map(r => r.competitionId));
  const compOptions = orderCompetitions(data.competitions.filter(c => observed.has(c.id))).map(c => [String(c.id), compName(c.id)]);
  const currentClub = state.academyClub;
  const competition = state.academyComp;
  const metric = state.academyMetric;
  const options = [['potential', 'Потенциал'], ['ovr', 'ОВР'], ['appearances', 'Матчи'], ['goals', 'Голы'], ['assists', 'Ассисты'], ['contributions', 'Гол + пас'], ['averageRating', 'Оценка с учётом матчей']];
  const ranked = memo(`academy/rank/${currentClub}/${competition}/${metric}`, () => academyTalents(data, { team: currentClub, competition, metric }));
  const rating = metric === 'averageRating';
  const headers = [['age', 'Возраст'], ['ovr', 'ОВР'], ['potential', 'Пот.'], ['appearances', 'М'], ['minutes', 'Мин'], ['goals', 'Г'], ['assists', 'А'], ['contributions', 'Г+А'], ...(rating ? [['ratingScore', 'Рейтинг']] : [])];
  return `<section class="box academy-ranking">${section(currentClub == null ? 'Рейтинг талантов U21' : `Таланты U21 · ${teamName(currentClub)}`, `<span class="row-count">${fmt(ranked.length)} игроков</span>`)}
    <p class="fine">Игроки до 21 года из зарегистрированных составов. Матчи и голы учитываются за текущий клуб. Данные о закрытых академиях других клубов зависят от сейва.</p>
    <div class="filters">${select('academy-club', [['', 'Все клубы'], ...clubOptions], String(currentClub ?? ''), 'Клуб')}
    ${select('academy-comp', [['', 'Все соревнования'], ...compOptions], String(competition ?? ''), 'Турнир')}
    ${select('academy-metric', options, metric, 'Сортировка')}</div>
    ${rating ? '<p class="fine">В рейтинге от 3 матчей с оценкой и 270 минут.</p>' : ''}
    ${ranked.length ? `<div class="table-scroll"><table><thead><tr><th>#</th><th>Игрок</th><th>Клуб</th>${headers.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>
      ${ranked.slice(0, state.academyLimit).map((p, i) => `<tr><td>${i + 1}</td><th scope="row"><button type="button" class="person-cell" data-player="${p.id}">${portrait(p)}<span><strong>${h(p.name)}</strong><small>${h(p.position || '—')}</small></span></button></th><td>${clubBtn(p.teamId)}</td>
      ${headers.map(([key]) => `<td${key === metric || key === 'ratingScore' ? ' class="metric-score"' : ''}>${fmt(p[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : blank('В этой выборке нет игроков с подходящими данными.')}
    ${ranked.length > state.academyLimit ? '<div class="box-footer"><button class="button secondary" type="button" data-academy-more>Показать ещё</button></div>' : ''}</section>`;
}

export function transfersPage(ctx) {
  const { data, state, heading, section, select, switcher, portrait, teamName, playerName, playerBtn, memo } = ctx;
  const positions = [...new Set(data.players.map(p => p.position).filter(Boolean))];
  const maxAge = state.radarAge ? Number(state.radarAge) : Infinity;
  const targets = memo(`radar/${state.radarPosition}/${maxAge}`, () => transferTargets(data, state.radarPosition, maxAge));
  const search = state.radarSearch.trim().toLowerCase();
  const suggestions = targets.filter(p => !search || `${p.name} ${teamName(p.teamId)}`.toLowerCase().includes(search));
  const modelRumours = suggestions.filter(p => p.contract || p.gain > 2).slice(0, 18);
  const recorded = data.shortlist ?? [];
  const view = state.radarView;
  const list = view === 'rumours' ? modelRumours : suggestions.slice(0, state.radarLimit);
  return heading('Трансферный радар', data.season ? `Сезон ${data.season}` : '')
    + `<div class="page-tabs">${switcher('radar-view', [['targets', 'Кандидаты'], ['rumours', 'Слухи панели'], ['recorded', 'Записи игры']], view, 'Трансферы')}</div>
    <section class="box">${section({ targets: 'Подбор усиления', rumours: 'Возможные переходы', recorded: 'Договорённости из сейва' }[view])}
    ${view !== 'recorded' ? `<div class="filters">${select('radar-position', [['', 'Все позиции'], ...positions.map(p => [p, p])], state.radarPosition, 'Позиция')}${select('radar-age', [['', 'Любой возраст'], ['21', 'До 21'], ['23', 'До 23'], ['28', 'До 28']], state.radarAge, 'Возраст')}
    <label class="inline-search">${icon('search', 16)}<input id="radar-filter" aria-label="Поиск игроков для трансфера" placeholder="Имя или клуб" value="${h(state.radarSearch)}"></label></div>
    ${view === 'rumours' ? '<p class="fine">Сценарии панели по сроку контракта или возможному усилению позиции клуба.</p>' : ''}
    ${list.length ? `<div class="table-scroll"><table class="radar-table"><thead><tr><th>Игрок</th><th>Клуб</th><th>Поз.</th><th>ОВР</th><th>Пот.</th><th>Контракт</th><th>Почему в списке</th></tr></thead><tbody>
    ${list.map(p => `<tr><th scope="row"><button type="button" data-player="${p.id}" class="person-cell">${portrait(p)}<span><strong>${h(p.name)}</strong><small>${p.age ? fmt(p.age) : ''}</small></span></button></th>
    <td>${h(teamName(p.teamId))}</td><td>${h(p.position)}</td><td>${fmt(p.ovr)}</td><td class="metric-score">${fmt(p.potential)}</td><td>${fmt(p.contractUntil)}</td><td>${h(p.reason)}</td></tr>`).join('')}</tbody></table></div>` : blank('Кандидатов по выбранным условиям пока нет.')}
    ${view === 'targets' && suggestions.length > list.length ? '<div class="box-footer"><button type="button" class="button secondary" data-radar-more>Показать ещё</button></div>' : ''}`
      : recorded.length ? `<div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Команда</th><th>Предложивший клуб</th><th>Сумма</th><th>Зарплата</th></tr></thead><tbody>${recorded.map(r => `<tr><th scope="row">${playerBtn(r.playerId, playerName(r.playerId))}</th><td>${h(teamName(r.teamId))}</td><td>${h(teamName(r.offerTeamId))}</td><td>${fmt(r.fee)}</td><td>${fmt(r.wage)}</td></tr>`).join('')}</tbody></table></div>` : blank('Сейв пока не содержит таких договорённостей.')}</section>`;
}

export function honoursPage(ctx, records) {
  const { data, state, heading, section, select, switcher, playerById, portrait, playerName, teamName } = ctx;
  const options = Object.keys(data.history ?? {}).concat(data.season ?? []).sort().reverse();
  const season = options.includes(state.awardSeason) ? state.awardSeason : data.season;
  const bank = season === data.season ? (data.seasonArchive ?? data) : data.history?.[season] ?? data;
  const recordedPlayers = new Map(bank.players?.map(p => [p.id, p]));
  const people = { get: id => recordedPlayers.get(id) ?? playerById(id) };
  const mode = state.awardPeriod;
  const rules = honoursOptions.find(option => option[0] === state.awardKind) ?? honoursOptions[0];
  const played = (bank.fixtures ?? []).filter(m => m.played && m.date).map(m => m.date);
  const anchor = bank.date ?? data.date;
  const dates = mode === 'season' ? [] : [...new Set([...played, anchor].filter(Boolean).map(date => periodRange(date, mode)[0]).filter(Boolean))].sort((a, b) => b - a);
  const current = periodRange(anchor, mode)[0];
  const activeDate = dates.includes(state.awardDate) ? state.awardDate : dates.includes(current) ? current : dates[0];
  const interval = mode === 'season' ? null : periodRange(activeDate, mode);
  const periodTitle = { week: 'Игроки недели', month: 'Игроки месяца', year: 'Игроки года' }[mode];
  const rows = mode === 'year' ? Object.values(data.history ?? {}).flatMap(s => s.stats ?? []).concat(season === data.season ? bank.stats ?? [] : (data.seasonArchive ?? data).stats ?? []) : bank.stats ?? [];
  const ranking = awardLeaders(rows, people, mode === 'season' ? rules[0] : 'ballon', interval);
  const xi = teamOfPeriod(!interval && rules[0] !== 'ballon' ? awardLeaders(rows, people, 'ballon') : ranking);
  const focus = ranking.slice(0, state.awardExpanded ? 30 : 5);
  return heading('Награды', season ? `Сезон ${season}` : '', options.length ? select('award-season', options.map(y => [y, y]), season, 'Сезон') : '')
    + `<div class="page-tabs">${switcher('award-period', [['season', 'Сезон'], ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']], mode, 'Период наград')}</div>
    <div class="dashboard"><div class="main-column"><section class="box">
    ${section(periodTitle ?? rules[1], `<span class="tag">${periodTitle ? 'Расчёт панели' : 'Прогноз панели'}</span>`)}
    ${mode === 'season' ? `<div class="filters">${select('award-kind', honoursOptions.map(([id, name]) => [id, name]), rules[0], 'Награда')}</div>`
      : dates.length ? `<div class="filters">${select('award-date', dates.map(date => [String(date), mode === 'year' ? String(Math.floor(date / 10000)) : dateLabel(date, 'full')]), String(activeDate), 'Начало периода')}</div>` : ''}
    <p class="fine">${interval?.[0] ? `${h(dateLabel(interval[0]))} — ${h(dateLabel(interval[1], 'full'))}. По сохранённым оценкам, голам и минутам.` : h(rules[2])}</p>
    ${focus.length ? `<ol class="leader-list">${focus.map((r, i) => `<li><button type="button" data-player="${r.id}" class="leader-row"><span class="rank">${String(i + 1).padStart(2, '0')}</span>
      ${portrait(playerById(r.id) ?? { id: r.id, name: playerName(r.id) })}<span class="leader-name"><strong>${h(playerName(r.id))}</strong><small>${h(r.teamIds?.length ? teamName(r.teamIds[0]) : '')}</small></span><b>${fmt(r.score)}</b></button></li>`).join('')}</ol>` : blank('За этот период пока мало статистики для рейтинга.')}
    ${ranking.length > 5 ? `<div class="box-footer"><button type="button" class="button secondary" data-award-expand aria-pressed="${state.awardExpanded}">${state.awardExpanded ? 'Свернуть' : `Показать топ-${Math.min(30, ranking.length)}`}</button></div>` : ''}
    </section></div>
    <div class="side-column"><section class="box">${section({ season: 'Команда сезона', week: 'Команда недели', month: 'Команда месяца', year: 'Команда года' }[mode], '<span class="tag">4–3–3</span>')}
    ${xi.length ? `<ul class="scout-list">${xi.map(p => `<li><button type="button" data-player="${p.id}" class="person-cell">${portrait(playerById(p.id) ?? { id: p.id, name: playerName(p.id) })}<span><strong>${h(playerName(p.id))}</strong><small>${h(p.position || '—')} · ${fmt(p.score)}</small></span></button></li>`).join('')}</ul>` : blank('Пока нет игроков для сборной периода.')}</section>
    ${bank.teamOfWeek?.length ? `<section class="box">${section('Команда недели · записи FC 26')}<ul class="scout-list">${bank.teamOfWeek.slice(0, 30).map(r => `<li><strong>${h(playerName(r.playerId))}</strong><small>${r.count} попаданий · месяц ${r.month}</small></li>`).join('')}</ul></section>` : ''}${records}</div></div>`;
}
