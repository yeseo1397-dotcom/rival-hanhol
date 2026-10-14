// Arena 서버 (2단계): 대기실 · 방장 · 맵 투표 · 팀 배정 · 이동 동기화
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { MAPS, spawnsOf } = require('./maps.js');
const WEAPONS = require('./weapons.js');
const Combat = require('./combat.js');

const PORT = process.env.PORT || 3000;
const DEV_NICK = '19';
const DEV_PW = process.env.DEV_PASSWORD || '';        // 개발자 비밀번호는 코드가 아니라 환경변수로만 보관
const MAX_PLAYERS = 10, VOTE_SECS = 15, WEAPON_SECS = 15, REVEAL_SECS = 3, COUNT_SECS = 3, TICK_MS = 50;
const PUBLIC_FILES = new Set(['index.html', 'game.js', 'maps.js', 'weapons.js', 'combat.js', 'config.js']);   // 브라우저에 내보낼 파일만 허용 (server.js 등은 비공개)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

// ---------- 정적 파일 (화면 파일을 같이 제공) ----------
const server = http.createServer((req, res) => {
  let name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//, '') || 'index.html';
  if (!PUBLIC_FILES.has(name)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, name), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 게임 상태 (방 1개) ----------
const players = new Map();            // id -> player (들어온 순서 유지)
let nextId = 1, phase = 'lobby', mapIdx = 0, timers = [], round = null, combat = null, dummies = [];
const wss = new WebSocketServer({ server, maxPayload: 2048 });

const send = (p, o) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(o)); };
const broadcast = (o, only) => { const s = JSON.stringify(o); for (const p of players.values()) if ((!only || only(p)) && p.ws.readyState === 1) p.ws.send(s); };
const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const hostId = () => players.keys().next().value;
const inGame = () => [...players.values()].filter(p => p.inGame);
// 2명 이상이면 시작할 수 있고, 개발자 1명뿐이면 혼자서도 가능
const enough = list => list.length >= 2 || (list.length === 1 && list[0].dev);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const digest = s => crypto.createHash('sha256').update(String(s)).digest();

function sendLobby() {
  broadcast({
    t: 'lobby', phase, host: hostId(),
    players: [...players.values()].map(p => ({ id: p.id, nick: p.nick, dev: p.dev, inGame: p.inGame }))
  });
}

// ---------- 진행: 투표 → 팀 공개 → 카운트다운 → 경기 ----------
function startVote() {
  phase = 'vote';
  for (const p of players.values()) { p.inGame = true; p.vote = -1; p.team = null; p.weapon = null; }
  broadcast({ t: 'phase', phase: 'vote', secs: VOTE_SECS });
  sendLobby();
  later(VOTE_SECS * 1000, resolveVote);
}
function sendVotes() {
  const counts = MAPS.map((_, i) => inGame().filter(p => p.vote === i).length);
  broadcast({ t: 'votes', counts }, p => p.inGame);
}
function resolveVote() {
  if (phase !== 'vote') return;
  clearTimers();
  const list = inGame();
  if (!enough(list)) return backToLobby();
  const counts = MAPS.map((_, i) => list.filter(p => p.vote === i).length), mx = Math.max(...counts);
  const pool = counts.map((c, i) => i).filter(i => mx === 0 || counts[i] === mx);
  mapIdx = pool[Math.floor(Math.random() * pool.length)];
  // 무작위로 섞어서 번갈아 배정 → 인원이 균등 (홀수면 레드가 1명 많음)
  const teams = {}, spawns = {}, sp = spawnsOf(MAPS[mapIdx]);
  const side = { red: shuffle(sp.slice(0, 4)), blue: shuffle(sp.slice(4)) }, used = { red: 0, blue: 0 };
  shuffle(list.slice()).forEach((p, i) => {
    p.team = i % 2 === 0 ? 'red' : 'blue';
    const k = used[p.team]++, base = side[p.team][k % 4];
    spawns[p.id] = [base[0] + (k >= 4 ? 1.2 : 0), base[1]];       // 자리가 모자라면 옆으로 살짝 비켜 줌
    p.x = spawns[p.id][0]; p.z = spawns[p.id][1]; p.y = 0; p.yaw = p.z > 0 ? 0 : Math.PI;
    teams[p.id] = { team: p.team, nick: p.nick };
  });
  round = { teams, spawns };
  startWeapons();
}

// ---------- 무기 선택 (15초, 전원이 고르면 바로 진행. 같은 무기를 여러 명이 골라도 돼요) ----------
function startWeapons() {
  phase = 'weapons';
  for (const p of inGame()) p.weapon = null;
  broadcast({ t: 'phase', phase: 'weapons', secs: WEAPON_SECS, map: mapIdx }, p => p.inGame);
  sendPicks();
  later(WEAPON_SECS * 1000, startReveal);
}
function sendPicks() {
  const l = inGame();
  broadcast({ t: 'picks', n: l.filter(p => p.weapon).length, total: l.length }, p => p.inGame);
}
function checkAllPicked() {
  if (phase === 'weapons' && inGame().every(p => p.weapon)) { clearTimers(); later(800, startReveal); }
}
function startReveal() {
  if (phase !== 'weapons') return;
  clearTimers();
  const weapons = {};
  for (const p of inGame()) { if (!p.weapon) p.weapon = WEAPONS[0].id; weapons[p.id] = p.weapon; }   // 못 고른 사람은 기본 무기
  // 개발자 혼자일 때는 연습용 표적(움직이지 않고, 쓰러지면 5초 뒤 다시 나타남) 3개를 세운다
  dummies = [];
  const only = inGame();
  if (only.length === 1 && only[0].dev) {
    const blue = spawnsOf(MAPS[mapIdx]).slice(4);
    [0, 1, 2].forEach(i => {
      const s = blue[i], d = { id: 1000 + i, nick: '표적', team: 'blue', dummy: true, weapon: null, x: s[0], y: 0, z: s[1], yaw: Math.PI };
      dummies.push(d); round.teams[d.id] = { team: 'blue', nick: '표적' }; round.spawns[d.id] = [s[0], s[1]];
    });
  }
  phase = 'reveal';
  broadcast({ t: 'teams', map: mapIdx, teams: round.teams, spawns: round.spawns, weapons, secs: REVEAL_SECS }, p => p.inGame);
  combat = Combat.create({
    map: MAPS[mapIdx], weapons: WEAPONS, spawns: spawnsOf(MAPS[mapIdx]), later,
    ents: () => [...inGame(), ...dummies],
    emit: (to, msg) => { if (to === 'all') broadcast(msg, p => p.inGame); else if (to.ws) send(to, msg); },
  });
  combat.start();
  later(REVEAL_SECS * 1000, () => {
    phase = 'countdown'; broadcast({ t: 'phase', phase: 'countdown', secs: COUNT_SECS }, p => p.inGame);
    later(COUNT_SECS * 1000, () => { phase = 'play'; broadcast({ t: 'phase', phase: 'play' }, p => p.inGame); });
  });
}
function backToLobby() {
  clearTimers(); phase = 'lobby'; combat = null; dummies = [];
  for (const p of players.values()) { p.inGame = false; p.team = null; }
  sendLobby();
}

// 경기 중 위치 방송 (초당 20회)
setInterval(() => {
  if (phase !== 'play' && phase !== 'countdown') return;
  const list = [...inGame(), ...dummies].map(p => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), combat ? combat.flags(p) : 1]);
  broadcast({ t: 'state', p: list }, p => p.inGame);
}, TICK_MS);

// ---------- 접속 처리 ----------
wss.on('connection', ws => {
  let me = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'join') {
      if (me) return;
      const nick = String(m.nick || '').normalize('NFKC').replace(/[\u0000-\u001f<>&]/g, '').trim();
      const fail = msg => { ws.send(JSON.stringify({ t: 'err', msg })); ws.close(); };
      if (nick.length < 2 || nick.length > 12) return fail('닉네임은 2~12자로 입력하세요.');
      if (players.size >= MAX_PLAYERS) return fail('방이 가득 찼습니다.');
      if ([...players.values()].some(p => p.nick.toLowerCase() === nick.toLowerCase())) return fail('이미 사용 중인 닉네임입니다.');
      let dev = false;
      if (nick === DEV_NICK) {
        if (!DEV_PW || !crypto.timingSafeEqual(digest(m.pw || ''), digest(DEV_PW))) return fail('비밀번호가 맞지 않습니다. 이 닉네임은 사용할 수 없습니다.');
        dev = true;
      }
      me = { ws, id: nextId++, nick, dev, inGame: false, team: null, vote: -1, x: 0, y: 0, z: 0, yaw: 0, lastMove: 0 };
      players.set(me.id, me);
      send(me, { t: 'welcome', id: me.id, nick, dev });
      sendLobby();
      return;
    }
    if (!me) return;

    switch (m.t) {
      case 'start':                                   // 방장만, 최소 2명
        if (phase === 'lobby' && me.id === hostId() && enough([...players.values()])) startVote();
        break;
      case 'vote':
        if (phase === 'vote' && me.inGame && Number.isInteger(m.map) && m.map >= 0 && m.map < MAPS.length) {
          me.vote = m.map; sendVotes();
          if (inGame().every(p => p.vote >= 0)) { clearTimers(); later(800, resolveVote); }   // 전원 투표하면 빨리 마감
        }
        break;
      case 'shoot': if (phase === 'play' && combat) combat.shoot(me, m); break;
      case 'reload': if (phase === 'play' && combat) combat.reload(me); break;
      case 'weapon':
        if (phase === 'weapons' && me.inGame && WEAPONS.some(w => w.id === m.id)) { me.weapon = m.id; sendPicks(); checkAllPicked(); }
        break;
      case 'move': {
        if (phase !== 'play' || !me.inGame || !combat || !me.alive) break;
        const now = Date.now(), dt = Math.max((now - me.lastMove) / 1000, .03); me.lastMove = now;
        const half = MAPS[mapIdx].size / 2 - .4, c = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
        const nx = c(m.x, -half, half), nz = c(m.z, -half, half), ny = c(m.y, 0, me.dev ? 40 : 12);
        const maxD = (me.dev ? 22 : 11) * dt + .5;               // 이동 속도 상한 검증
        if (Math.hypot(nx - me.x, nz - me.z) > maxD) { send(me, { t: 'correct', x: me.x, y: me.y, z: me.z }); break; }
        me.x = nx; me.y = ny; me.z = nz; me.yaw = Number(m.yaw) || 0;
        break;
      }
      case 'lobby':                                   // 방장이 대기실로 (4단계에서 자동 복귀로 대체)
        if (me.id === hostId() && phase !== 'lobby') backToLobby();
        break;
      case 'ping': send(me, { t: 'pong', ts: m.ts }); break;
    }
  });
  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id);
    if (phase !== 'lobby' && !enough(inGame())) backToLobby();
    else { sendLobby(); if (phase === 'weapons') { sendPicks(); checkAllPicked(); } if (phase === 'vote') { sendVotes(); if (inGame().every(p => p.vote >= 0)) { clearTimers(); later(800, resolveVote); } } }
  });
});

server.listen(PORT, () => console.log(`Arena 서버 실행 중: http://localhost:${PORT}` + (DEV_PW ? '' : '  (DEV_PASSWORD 미설정: 개발자 로그인 비활성)')));
