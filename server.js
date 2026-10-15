// Arena 서버: 접속/닉네임/개발자 인증 + 방 관리. 게임 규칙은 room.js, 전투 규칙은 combat.js에 있습니다.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { MAPS, spawnsOf } = require('./maps.js');
const WEAPONS = require('./weapons.js');
const Combat = require('./combat.js');
const { createRoom } = require('./room.js');

const PORT = process.env.PORT || 3000;
const DEV_NICK = '19';
const DEV_PW = process.env.DEV_PASSWORD || '';        // 개발자 비밀번호는 코드가 아니라 환경변수로만 보관
const PUBLIC_FILES = new Set(['index.html', 'game.js', 'maps.js', 'weapons.js', 'combat.js', 'config.js']);   // 브라우저에 내보낼 파일만 허용
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

// 시간/라운드 수 등은 환경변수로 바꿀 수 있어요 (안 정하면 기본값: 120초 라운드, 5라운드 ...)
const cfg = {};
for (const k of ['ROUND_SECS', 'ROUNDS', 'ROUND_END_SECS', 'RESULT_SECS', 'NOKILL_SECS', 'VOTE_SECS', 'WEAPON_SECS', 'MAX_HP'])
  if (process.env[k]) cfg[k] = +process.env[k];

const server = http.createServer((req, res) => {
  const name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//, '') || 'index.html';
  if (!PUBLIC_FILES.has(name)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, name), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream' });
    res.end(data);
  });
});

let nextId = 1;
const env = { MAPS, WEAPONS, Combat, spawnsOf, cfg, nextId: () => nextId++ };
const main = createRoom(env);                         // 모두가 모이는 메인 방
const nicks = new Set();                              // 접속 중인 닉네임 (중복 방지)
const digest = s => crypto.createHash('sha256').update(String(s)).digest();
const wss = new WebSocketServer({ server, maxPayload: 2048 });

wss.on('connection', ws => {
  const conn = { nick: '', dev: false, send: s => { if (ws.readyState === 1) ws.send(s); }, room: null, p: null };
  let joined = false;
  const enter = room => { conn.room = room; conn.p = room.join(conn); };
  const fail = msg => { ws.send(JSON.stringify({ t: 'err', msg })); ws.close(); };

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'join') {
      if (joined) return;
      const nick = String(m.nick || '').normalize('NFKC').replace(/[\u0000-\u001f<>&]/g, '').trim();
      if (nick.length < 2 || nick.length > 12) return fail('닉네임은 2~12자로 입력하세요.');
      if (main.full()) return fail('방이 가득 찼습니다.');
      if (nicks.has(nick.toLowerCase())) return fail('이미 사용 중인 닉네임입니다.');
      let dev = false;
      if (nick === DEV_NICK) {
        if (!DEV_PW || !crypto.timingSafeEqual(digest(m.pw || ''), digest(DEV_PW))) return fail('비밀번호가 맞지 않습니다. 이 닉네임은 사용할 수 없습니다.');
        dev = true;
      }
      conn.nick = nick; conn.dev = dev; nicks.add(nick.toLowerCase()); joined = true;
      enter(main);
      return;
    }
    if (!joined) return;

    if (m.t === 'solo' && conn.dev && conn.room === main) {             // 개발자: 다른 사람들과 상관없이 혼자 따로 하는 방
      main.remove(conn.p);
      enter(createRoom({ ...env, solo: true }));
      return;
    }
    if (m.t === 'tomain' && conn.room !== main) {                       // 연습방에서 메인 대기실로 돌아가기
      if (main.full()) return conn.send(JSON.stringify({ t: 'err', msg: '메인 방이 가득 찼습니다.' }));
      conn.room.destroy(); enter(main);
      return;
    }
    conn.room.handle(conn.p, m);
  });

  ws.on('close', () => {
    if (!joined) return;
    nicks.delete(conn.nick.toLowerCase());
    conn.room.remove(conn.p);
    if (conn.room !== main) conn.room.destroy();
  });
});

server.listen(PORT, () => console.log(`Arena 서버 실행 중: http://localhost:${PORT}` + (DEV_PW ? '' : '  (DEV_PASSWORD 미설정: 개발자 로그인 비활성)')));
