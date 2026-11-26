const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

async function verifyUi(window, loadCareer, publishCareer) {
  const view = window.webContents;
  view.on('console-message', (_event, details) => {
    if (details.level === 'error') console.error(`${details.sourceId}:${details.lineNumber} ${details.message}`);
  });
  const run = async script => {
    try { return await view.executeJavaScript(script, true); }
    catch (error) { throw new Error(`Renderer script failed: ${script.slice(0, 150)}`, { cause: error }); }
  };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const choose = (key, value) => run(`(() => {
    const control = document.querySelector(${JSON.stringify(`[data-select="${key}"]`)});
    control.value = ${JSON.stringify(value)}; control.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const body = () => run('document.body.innerText');
  const waitFor = (predicate, label) => run(`new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = setInterval(() => {
      if (${predicate}) { clearInterval(tick); resolve(true); }
      else if (performance.now() - start > 9000) { clearInterval(tick); reject([${JSON.stringify(label)}, document.querySelector('h1')?.innerText, document.querySelector('#notice')?.innerText, window.verifyRejection].filter(Boolean).join(' | ')); }
    }, 25);
  })`);
  const dashboard = async () => { await click('nav [data-nav="overview"]'); await click('.heading-actions [data-nav="dashboard"]'); };
  const capture = async name => {
    await run('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))');
    const image = await view.capturePage();
    assert(!image.isEmpty());
    await writeFile(join(__dirname, 'preview', name + '.png'), image.toPNG());
  };
  await mkdir(join(__dirname, 'preview'), { recursive: true });
  await run(`new Promise((resolve, reject) => {
    const started = performance.now();
    const interval = setInterval(() => {
      if (document.querySelector('h1')) { clearInterval(interval); resolve(true); }
      else if (performance.now() - started > 3000) { clearInterval(interval); reject('Missing dashboard'); }
    }, 20);
  })`);
  assert.match(await body(), /Обзор карьеры.*Демоданные|Демоданные.*Обзор карьеры/s);
  await run(`window.addEventListener('unhandledrejection', event => { window.verifyRejection = event.reason?.stack ?? String(event.reason); })`);
  assert.equal(await run('Boolean(window.careerDesktop?.subscribe)'), true);
  await capture('overview');
  assert.match(await body(), /Календарь симуляции.*Лента карьеры/s);
  const firstDate = await run('document.querySelector(".desk-hero h2").innerText');
  await click('[data-desk="day"]');
  await waitFor(`document.querySelector('.desk-hero h2')?.innerText !== ${JSON.stringify(firstDate)}`, 'Calendar did not advance');
  if (await run('Boolean(document.querySelector(\'[data-desk="skip"]\'))')) await click('[data-desk="skip"]');
  await waitFor('document.querySelectorAll("[data-desk-spot]").length === 11', 'Starting lineup did not open');
  await click('[data-desk-spot="1"]');
  await click('[data-desk-pick]');
  await waitFor('Boolean(document.querySelector("[data-desk-pick][aria-pressed=true]"))', 'Player did not move into the selected position');
  await capture('match-day-demo');
  await click('[data-desk="play"]');
  await waitFor('document.querySelector("h1")?.innerText === "Отчёт о матче"', 'Simulation did not produce a report');
  assert.match(await body(), /Симуляция панели.*Владение.*Оценки и показатели игроков/s);
  assert(await run(`import('./desk-store.mjs').then(module => module.readDesk('demo/2025/26')).then(result => Boolean(result?.sim.results[result?.sim.lastMatchId]))`));
  await capture('match-report-demo');
  await click('[data-nav="sim-results"]');
  assert.match(await body(), /Таблица на дату симуляции/);
  await click('nav [data-nav="inbox"]');
  await click('[data-desk-message]');
  await waitFor('Boolean(document.querySelector("[data-desk-message][aria-pressed=true]"))', 'Inbox did not open a message');
  await click('nav [data-nav="market"]');
  await click('[data-desk-list]');
  await waitFor('Boolean(document.querySelector("[data-desk-list][aria-pressed=true]"))', 'Sale list was not updated');
  await click('[data-desk-offer]');
  const buyer = await run('document.querySelector("[data-select=desk-buyer]").options[1].value');
  await choose('desk-buyer', buyer);
  await run('document.querySelector("#desk-offer").requestSubmit()');
  await waitFor('Boolean(document.querySelector(\'[data-desk-market="offers"][aria-pressed=true]\'))', 'Transfer offer did not advance');
  assert.match(await body(), /Согласовано/);
  await click('nav [data-nav="briefing"]');
  assert.match(await body(), /Новости карьеры/);
  if (process.env.FC26_VERIFY_NEWS) {
    await click('[data-desk-news="world"]');
    await waitFor('Boolean(document.querySelector("[data-desk-story]"))', 'Live BBC feed did not render');
  }
  await dashboard();
  await click('.hero [data-nav="kickoff"]');
  assert.match(await body(), /Следующий матч.*Прогноз матча.*Разбор соперника/s);
  assert.match(await body(), /Последний результат из сейва/);
  await click('[data-simulate]');
  assert.match(await run('document.querySelector(".kickoff-score").innerText'), /\d+ : \d+.*Симуляция панели/s);
  await click('.kickoff-links [data-match]');
  assert.match(await body(), /Карточка матча/);
  await click('.sidebar [data-nav="settings"]');
  assert.match(await body(), /Связь с EA SPORTS FC 26.*Выбрать файл или ярлык/s);
  assert.equal(await run('window.careerDesktop.gameAuto(false).then(value => value.autoOpen)'), false);
  assert.equal(await run('window.careerDesktop.gameAuto(true).then(value => value.autoOpen)'), true);
  assert.match(await run('window.careerDesktop.chooseGame("bad path").then(value => value.message)'), /ярлык Steam/);
  await click('nav [data-nav="world"]');
  assert.match(await body(), /Мировая статистика.*Рейтинг игроков.*Лео Морено/s);
  await choose('world-metric', 'contributions');
  assert.match(await run('document.querySelector(".world-player-table thead").innerText'), /Гол \+ пас/);
  await choose('world-metric', 'averageRating');
  assert.match(await body(), /От 3 матчей с оценкой и 270 минут/);
  await choose('world-metric', 'contributions');
  await click('[data-world-kind="national"]');
  assert.match(await body(), /Рейтинг игроков.*Испания/s);
  await click('[data-world-tab="teams"]');
  assert.match(await body(), /Рейтинг команд.*Испания/s);
  await click('[data-world-tab="tournaments"]');
  assert.match(await body(), /Турниры в сейве.*Кубок сборных/s);
  await click('[data-tournament="88"]');
  assert.match(await body(), /Соревнования.*Кубок сборных/s);
  await dashboard();
  await run(`(() => {
    const select = document.querySelector('[data-select="scope"]');
    select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await click('.hero [data-club]');
  assert.match(await body(), /Последние пять матчей.*Главные бомбардиры/s);
  await click('[data-club-tab="roster"]');
  assert.match(await body(), /Ким Джунхо/);
  await click('[data-club-tab="history"]');
  assert.match(await body(), /Итоги по сезонам/);
  await click('nav [data-nav="europe"]');
  assert.match(await body(), /Лига чемпионов/);
  await click('[data-euro-view="prediction"]');
  assert(await run('document.querySelectorAll(".odds-list meter").length') > 0);
  await click('nav [data-nav="academy"]');
  assert.match(await body(), /Нико Алвес.*Португалия/s);
  await click('[data-academy-view="clubs"]');
  assert.match(await body(), /Рейтинг талантов U21.*Г\+А/s);
  const clubId = await run('document.querySelector(".academy-ranking tbody [data-club]").dataset.club');
  await click('.academy-ranking tbody [data-club]');
  await click('[data-academy-club]');
  assert.equal(await run('document.querySelector("[data-select=academy-club]").value'), clubId);
  await click('nav [data-nav="radar"]');
  await click('[data-radar-view="rumours"]');
  assert.match(await body(), /Возможные переходы/);
  await dashboard();

  await click('.leader-list [data-player="101"]');
  assert.match(await body(), /Лео Морено/);
  assert.equal(await run('document.querySelector(".profile-photo .portrait").getAttribute("aria-label")'), 'Лео Морено');
  await capture('player');
  assert.equal(await run('document.querySelector("[data-select=profile-season]").value'), 'all');
  assert.match(await run('document.querySelector(".player-tournaments").innerText'), /2025\/26.*2024\/25.*Итого/s);
  assert(await run('[...document.querySelector("[data-select=profile-comp]").options].some(o => o.text === "Лига чемпионов")'));
  await choose('profile-season', '2024/25');
  assert.equal(await run('[...document.querySelector("[data-select=profile-comp]").options].some(o => o.text === "Лига чемпионов")'), false);
  await click('[data-profile-tab="history"]');
  assert.match(await body(), /История игрока по сезонам.*2024\/25/s);
  await choose('profile-season', '2025/26');
  await click('[data-profile-tab="advanced"]');
  assert.match(await body(), /Точность пасов.*≈/s);
  await click('[data-profile-tab="stats"]');
  const downloaded = new Promise((resolve, reject) => view.session.once('will-download', (_event, item) => {
    assert.equal(item.getFilename(), 'FC26-101.png');
    item.setSavePath(join(__dirname, 'preview', 'player-card.png'));
    item.once('done', (_download, state) => state === 'completed' ? resolve() : reject(new Error(state)));
  }));
  await click('[data-export="101"]');
  let timer;
  try {
    await Promise.race([downloaded, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('PNG export timed out')), 5000); })]);
  } finally {
    clearTimeout(timer);
  }
  await click('[data-profile-tab="attributes"]');
  assert.match(await body(), /Ускорение/);
  await click('[data-profile-tab="awards"]');
  assert.match(await body(), /Игрок сезона/);
  await click('[data-favorite="101"]');
  assert.match(await body(), /В избранном/);
  await click('[data-compare="101"]');
  await click('nav [data-nav="players"]');
  await run(`const s = document.querySelector('[data-select="team"]');
    s.value = 'all'; s.dispatchEvent(new Event('change', { bubbles: true }));`);
  await click('[data-compare="102"]');
  await click('nav [data-nav="compare"]');
  assert.match(await body(), /Сравнение игроков.*Лео Морено.*Идрис Камара/s);
  await click('nav [data-nav="competitions"]');
  await click('[data-metric="contributions"]');
  assert.match(await run('document.querySelector(".leader-list li").innerText'), /Лео Морено/);
  await click('[data-metric="assists"]');
  assert.match(await run('document.querySelector(".leader-list li").innerText'), /Оуэн Бёрнс/);

  await click('nav [data-nav="awards"]');
  assert.match(await body(), /Золотой мяч.*Прогноз/s);
  await click('[data-award-period="week"]');
  assert.match(await body(), /Команда недели/);
  assert(await run('document.querySelector("[data-select=award-date]").options.length') > 1);
  await click('[data-award-period="season"]');
  await run(`const f = document.querySelector('#award-form');
    f.award.value = 'Тестовая награда';
    f.winner.value = 'Лео Морено';
    f.requestSubmit();`);
  assert.match(await body(), /Тестовая награда/);
  await click('nav [data-nav="history"]');
  assert.match(await body(), /История сезонов.*Бомбардиры сезона/s);
  await click('nav [data-nav="matches"]');
  await click('[data-date-filter="played"]');
  await click('.match-line [data-match]');
  assert.match(await body(), /Карточка матча/);
  await click('.back');
  await click('[data-date-filter="next"]');
  assert.match(await body(), /Предстоящие/);
  assert.equal(await run('document.querySelectorAll(".match-line").length'), 3);
  assert(await run('document.querySelectorAll(".match-odds").length') === 3);
  await click('[data-calendar-mode="all"]');
  await choose('scope', '3');
  assert.match(await body(), /Лига чемпионов/);
  await run(`(() => {
    const search = document.querySelector('#quick-search');
    search.value = 'лео морено'; search.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  assert.deepEqual(await run('[...document.querySelectorAll("#quick-results [data-player]")].map(b => b.dataset.player)'), ['101']);
  await run(`const q = document.querySelector('#quick-search');
    q.value = 'камара'; q.dispatchEvent(new Event('input', { bubbles: true }));`);
  await click('#quick-results [data-player="102"]');
  assert.equal(await run('document.querySelector("h1").innerText'), 'Идрис Камара');
  await click('.sidebar-bottom [data-nav="settings"]');
  await click('[data-demo-mode="player"]');
  await click('nav [data-nav="overview"]');
  assert.match(await body(), /Карьера игрока.*Профиль игрока/s);
  await click('.sidebar-bottom [data-nav="settings"]');
  await click('[data-demo-mode="manager"]');
  await click('nav [data-nav="overview"]');
  await run('document.querySelector("#notice").textContent = ""');

  window.setMinimumSize(360, 450);
  window.setContentSize(410, 820);
  await capture('compact');
  assert.equal(await run('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
  await click('[data-menu]');
  await click('nav [data-nav="players"]');
  assert.equal(await run('document.querySelector("h1").innerText'), 'Игроки');
  assert.equal(await run('document.querySelector(".sidebar").classList.contains("open")'), false);
  await click('[data-menu]');
  await click('nav [data-nav="world"]');
  assert.equal(await run('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);

  await run('localStorage.clear()');
  console.log('Desktop UI passed: dashboard, profiles, favorites, comparison, tournament filters, awards, history, matches, search, both demo modes and narrow layout.');
  if (loadCareer) {
    window.setContentSize(1424, 921);
    const data = await loadCareer();
    assert(data.clubId != null);
    assert(data.players.length > 1000);
    assert(data.stats.length > 1000);
    assert(data.standings.some(row => row.competitionId === data.primaryId && row.teamId === data.clubId));
    assert(data.players.some(player => player.teamId === data.clubId && !player.name.startsWith('Игрок #')));
    const nationalTeams = data.teams.filter(t => t.kind === 'national');
    const nationalIds = new Set(nationalTeams.map(t => t.id));
    const national = data.stats.filter(row => nationalIds.has(row.teamId));
    assert(nationalTeams.length >= 10);
    assert(data.players.some(player => player.nationalIds.length));
    assert(data.players.some(player => player.academy));
    assert(data.tactics[data.clubId]?.slots.length === 11);
    await run(`new Promise((resolve, reject) => {
      const start = performance.now();
      const ticket = setInterval(() => {
        if (document.querySelector('.status')?.innerText === 'Сейв подключён') { clearInterval(ticket); resolve(true); }
        else if (performance.now() - start > 3000) { clearInterval(ticket); reject('Save did not reach UI'); }
      }, 10);
    })`);
    assert.match(await body(), /Сейв подключён/);
    assert.doesNotMatch(await body(), /Атлас Юнайтед/);
    assert(data.players.every(player => player.gender !== 1));
    await click('[data-fc-action="day"]');
    await waitFor('document.querySelector("h1")?.innerText === "Управление FC 26"', 'Missing binding did not open setup');
    assert(await run('document.querySelectorAll("[data-fc-bind]").length === 5'));
    await click('nav [data-nav="overview"]');
    if (process.env.FC26_VERIFY_ART) {
      assert(await run(`Promise.all(['players/231747', 'teams/243', 'teams/242', 'teams/1335'].map(async path => {
        const answer = await fetch('./media/' + path + '.png');
        return answer.ok && answer.headers.get('content-type') === 'image/png' && (await answer.blob()).size > 1000;
      })).then(results => results.every(Boolean))`), 'EA portrait and crest must be available');
      await run(`Promise.race([Promise.allSettled([...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).map(i => i.decode())), new Promise(r => setTimeout(r, 5000))])`);
    }
    await capture('live');
    view.send('career:game-update', { pid: 123, ready: true, autoOpen: true, openToken: 1 });
    assert.equal(await run('document.querySelector("h1").innerText'), 'Подготовка к матчу');
    if (process.env.FC26_VERIFY_ART) await run(`Promise.race([Promise.allSettled([...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).map(i => i.decode())), new Promise(r => setTimeout(r, 5000))])`);
    await capture('match-day');
    await click('[data-desk-mode="model"]');
    await waitFor('Boolean(document.querySelector(\'[data-desk-mode="model"][aria-pressed=true]\'))', 'Model calendar did not open');
    if (await run('Boolean(document.querySelector(\'[data-desk="skip-match"]\'))')) await click('[data-desk="skip-match"]');
    await waitFor('Boolean(document.querySelector(\'[data-desk="play"]:not(:disabled)\'))', 'Real FC 26 lineup did not validate');
    await click('[data-desk="play"]');
    await waitFor('document.querySelector("h1")?.innerText === "Отчёт о матче"', 'Real career simulation did not complete');
    await capture('match-report');
    await click('nav [data-nav="overview"]');
    view.send('career:game-update', { pid: 123, ready: true, autoOpen: true, openToken: 1 });
    assert.equal(await run('document.querySelector("h1").innerText'), 'Обзор карьеры');
    await dashboard();
    await click('.leader-list [data-player]');
    assert.doesNotMatch(await run('document.querySelector("h1").innerText'), /^Игрок #/);
    assert(await run('document.querySelectorAll(".profile-grid tbody tr").length') > 0);
    await click('nav [data-nav="world"]');
    await click('[data-world-kind="all"]');
    await click('[data-world-tab="players"]');
    if (process.env.FC26_VERIFY_ART) await run(`Promise.race([Promise.allSettled([...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).map(i => i.decode())), new Promise(r => setTimeout(r, 5000))])`);
    await capture('world');
    await click('nav [data-nav="europe"]');
    assert.match(await body(), /Лига чемпионов/);
    await capture('europe');
    await click('[data-euro-view="bracket"]');
    assert(await run('Boolean(document.querySelector(".bracket .match-line"))'));
    await click('[data-euro-view="prediction"]');
    assert(await run('document.querySelectorAll(".odds-list meter").length') >= 10);
    await click('nav [data-nav="awards"]');
    await click('[data-award-expand]');
    assert(await run('document.querySelectorAll(".leader-list li").length') === 30);
    await capture('awards');
    await click('.current-club');
    await click('[data-club-tab="tactics"]');
    assert(await run('document.querySelectorAll(".pitch-token").length') === 11);
    await capture('tactics');
    await click('nav [data-nav="academy"]');
    assert.match(await body(), /Игроки академии.*Миссии скаутов/s);
    await capture('academy');
    await click('[data-academy-view="clubs"]');
    await choose('academy-metric', 'contributions');
    assert(await run('document.querySelectorAll(".academy-ranking tbody tr").length') > 0);
    await capture('talents');
    await click('nav [data-nav="world"]');
    await click('[data-world-kind="national"]');
    await click('[data-world-tab="teams"]');
    assert.match(await body(), /Рейтинг команд/);
    const report = data.fixtures.find(m => m.played && m.homeId === data.clubId);
    const athlete = data.players.find(p => p.teamId === data.clubId);
    const added = await run(`window.careerDesktop.telemetry(${report.id}, [{ playerId: ${athlete.id}, teamId: ${data.clubId}, passes: 41, completedPasses: 37, dribbles: 5 }])
      .then(status => Object.values(status.career.telemetry).flat().some(row => row.passes === 41 && row.dribbles === 5))`);
    assert(added);
    await click('nav [data-nav="matchday"]');
    const actualTarget = data.fixtures.filter(m => !m.played && [m.homeId, m.awayId].includes(data.clubId) && m.date >= data.date).sort((a, b) => a.date - b.date)[1];
    assert(actualTarget);
    view.send('career:game-update', { pid: null, ready: false, openToken: 1 });
    await click('[data-desk="guide-sim"]');
    await waitFor('Boolean(document.querySelector(\'[data-desk="handoff-match"]\'))', 'Manual FC 26 handoff did not open');
    await click('[data-desk="handoff-match"]');
    await waitFor('document.querySelector("#notice").innerText.includes("План скопирован")', 'FC 26 plan was not copied');
    const updated = data.fixtures.map(m => m.id === actualTarget.id ? { ...m, played: true, homeGoals: 5, awayGoals: 2 } : m);
    publishCareer({ ...data, date: actualTarget.date, fixtures: updated, seasonArchive: { ...data.seasonArchive, date: actualTarget.date, fixtures: updated } });
    await waitFor('document.querySelector("h1")?.innerText === "Карточка матча"', 'Saved match did not open automatically');
    assert.match(await run('document.querySelector(".match-hero strong").innerText'), /5\s*:\s*2/);
    console.log(`Local ${data.mode} save passed: ${data.players.length} players, ${data.stats.length} statistics rows, ${data.fixtures.length} fixtures, ${nationalTeams.length} national teams, ${national.length} national-team statistics rows.`);
  }
}

module.exports = { verifyUi };
