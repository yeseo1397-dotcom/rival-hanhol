// 한 방(대기실 → 맵 투표 → 무기 선택 → 5라운드 녹아웃 → 결과)의 모든 규칙.
// 서버(Node.js)와 채팅 미리보기(브라우저)가 같은 코드를 사용합니다.
(function(){
function createRoom(env){
  const {MAPS,WEAPONS,Combat,spawnsOf}=env,solo=!!env.solo;
  const C=Object.assign({MAX_PLAYERS:10,VOTE_SECS:15,WEAPON_SECS:15,REVEAL_SECS:3,COUNT_SECS:3,ROUND_SECS:120,ROUNDS:5,
    ROUND_END_SECS:4,RESULT_SECS:12,NOKILL_SECS:120,MAX_HP:150,TICK_MS:50},env.cfg||{});
  const players=new Map();                       // id -> 플레이어 (들어온 순서 유지, 첫 사람이 방장)
  let phase='lobby',mapIdx=0,timers=[],teams={},combat=null,dummies=[],roundNo=0,wins={red:0,blue:0},history=[],noKillMs=0,cleared=false;

  const send=(p,o)=>p.conn.send(JSON.stringify(o));
  const broadcast=(o,only)=>{const s=JSON.stringify(o);for(const p of players.values())if(!only||only(p))p.conn.send(s)};
  const later=(ms,fn)=>{timers.push(setTimeout(fn,ms))},clearTimers=()=>{timers.forEach(clearTimeout);timers=[]};
  const hostId=()=>players.keys().next().value,inGame=()=>[...players.values()].filter(p=>p.inGame),ents=()=>[...inGame(),...dummies];
  const enough=l=>l.length>=2||(l.length===1&&l[0].dev);          // 2명 이상, 또는 개발자 혼자
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  const aliveOf=t=>ents().filter(e=>e.team===t&&e.alive);

  function sendLobby(){
    broadcast({t:'lobby',phase,host:hostId(),solo,players:[...players.values()].map(p=>({id:p.id,nick:p.nick,dev:p.dev,inGame:p.inGame}))})}

  // ---------- 맵 투표 ----------
  function startVote(){
    phase='vote';for(const p of players.values()){p.inGame=true;p.vote=-1;p.team=null;p.weapon=null}
    broadcast({t:'phase',phase:'vote',secs:C.VOTE_SECS});sendLobby();later(C.VOTE_SECS*1000,resolveVote)}
  function sendVotes(){broadcast({t:'votes',counts:MAPS.map((_,i)=>inGame().filter(p=>p.vote===i).length)},p=>p.inGame)}
  function checkAllVoted(){if(phase==='vote'&&inGame().every(p=>p.vote>=0)){clearTimers();later(800,resolveVote)}}
  function resolveVote(){
    if(phase!=='vote')return;clearTimers();
    const list=inGame();if(!enough(list))return backToLobby();
    const counts=MAPS.map((_,i)=>list.filter(p=>p.vote===i).length),mx=Math.max(...counts);
    const pool=counts.map((c,i)=>i).filter(i=>mx===0||counts[i]===mx);mapIdx=pool[Math.floor(Math.random()*pool.length)];
    teams={};shuffle(list.slice()).forEach((p,i)=>{p.team=i%2===0?'red':'blue';teams[p.id]={team:p.team,nick:p.nick}});
    startWeapons()}

  // ---------- 무기 선택 (15초, 전원이 고르면 바로 진행, 같은 무기 중복 가능) ----------
  function startWeapons(){
    phase='weapons';for(const p of inGame())p.weapon=null;
    broadcast({t:'phase',phase:'weapons',secs:C.WEAPON_SECS,map:mapIdx},p=>p.inGame);sendPicks();later(C.WEAPON_SECS*1000,startReveal)}
  function sendPicks(){const l=inGame();broadcast({t:'picks',n:l.filter(p=>p.weapon).length,total:l.length},p=>p.inGame)}
  function checkAllPicked(){if(phase==='weapons'&&inGame().every(p=>p.weapon)){clearTimers();later(800,startReveal)}}

  // ---------- 팀 공개 → 라운드 시작 ----------
  function placeAll(){                            // 팀별로 스폰을 무작위로 섞어 배치
    const sp=spawnsOf(MAPS[mapIdx]),side={red:shuffle(sp.slice(0,4)),blue:shuffle(sp.slice(4))},used={red:0,blue:0},out={};
    for(const e of ents()){const k=used[e.team]++,b=side[e.team][k%4];out[e.id]=[b[0]+(k>=4?1.2:0),b[1]];e.x=out[e.id][0];e.z=out[e.id][1];e.y=0;e.yaw=e.z>0?0:Math.PI}
    return out}
  function startReveal(){
    if(phase!=='weapons')return;clearTimers();
    const weapons={};for(const p of inGame()){if(!p.weapon)p.weapon=WEAPONS[0].id;weapons[p.id]=p.weapon}
    dummies=[];const only=inGame();
    if(only.length===1&&only[0].dev)[0,1,2].forEach(i=>{       // 개발자 혼자면 연습용 표적 3개
      const d={id:100000+i,nick:'표적',team:'blue',dummy:true,weapon:null,x:0,y:0,z:0,yaw:Math.PI};dummies.push(d);teams[d.id]={team:'blue',nick:'표적'}});
    const spawns=placeAll();
    phase='reveal';roundNo=0;wins={red:0,blue:0};history=[];noKillMs=0;cleared=false;
    broadcast({t:'teams',map:mapIdx,teams,spawns,weapons,secs:C.REVEAL_SECS,rounds:C.ROUNDS,maxHp:C.MAX_HP},p=>p.inGame);
    combat=Combat.create({map:MAPS[mapIdx],weapons:WEAPONS,spawns:spawnsOf(MAPS[mapIdx]),later,maxHp:C.MAX_HP,respawnMs:0,ents,
      emit:(to,msg)=>{if(to==='all')broadcast(msg,p=>p.inGame);else if(to.conn)send(to,msg)},
      onKill:()=>{noKillMs=0;checkWipe()}});
    combat.start();later(C.REVEAL_SECS*1000,()=>beginRound(1))}

  function beginRound(n){
    roundNo=n;phase='countdown';
    if(n>1){placeAll();combat.resetRound()}      // 새 위치로 옮기고 체력/탄약 회복 (장애물이 없어진 상태는 유지)
    broadcast({t:'phase',phase:'countdown',secs:C.COUNT_SECS,round:n,total:C.ROUNDS,wins},p=>p.inGame);
    later(C.COUNT_SECS*1000,startPlay)}
  function startPlay(){
    phase='play';broadcast({t:'phase',phase:'play',secs:C.ROUND_SECS,round:roundNo,total:C.ROUNDS,wins},p=>p.inGame);
    later(C.ROUND_SECS*1000,()=>endRound(null))}

  // ---------- 라운드 종료: 상대팀 전멸(녹아웃) 또는 120초 경과 시 생존 인원 → 남은 체력 순으로 판정 ----------
  function checkWipe(){
    if(phase!=='play')return;const r=aliveOf('red').length,b=aliveOf('blue').length;if(r&&b)return;
    endRound(!r&&!b?'draw':!r?'blue':'red','wipe')}
  function endRound(forced,why){
    if(phase!=='play')return;clearTimers();phase='roundend';
    let w=forced,reason=why||'wipe';
    if(!forced){const ar=aliveOf('red'),ab=aliveOf('blue');w='draw';reason='draw';
      if(ar.length!==ab.length){w=ar.length>ab.length?'red':'blue';reason='alive'}
      else{const hr=ar.reduce((s,e)=>s+e.hp,0),hb=ab.reduce((s,e)=>s+e.hp,0);if(hr!==hb){w=hr>hb?'red':'blue';reason='hp'}}}
    if(w!=='draw')wins[w]++;history.push(w);
    broadcast({t:'roundend',n:roundNo,winner:w,reason,wins,alive:{red:aliveOf('red').length,blue:aliveOf('blue').length},secs:C.ROUND_END_SECS},p=>p.inGame);
    later(C.ROUND_END_SECS*1000,()=>roundNo>=C.ROUNDS?finish():beginRound(roundNo+1))}
  function finish(){                              // 5라운드가 모두 끝나면 결과표
    phase='ended';const w=wins.red>wins.blue?'red':wins.blue>wins.red?'blue':'draw';
    broadcast({t:'result',winner:w,red:wins.red,blue:wins.blue,rounds:history,secs:C.RESULT_SECS,
      players:inGame().map(p=>({id:p.id,nick:p.nick,team:p.team,kills:p.kills||0,deaths:p.deaths||0,heads:p.heads||0,dmg:Math.round(p.dmg||0)}))},p=>p.inGame);
    later(C.RESULT_SECS*1000,backToLobby)}
  function backToLobby(){
    clearTimers();phase='lobby';combat=null;dummies=[];roundNo=0;wins={red:0,blue:0};history=[];noKillMs=0;cleared=false;
    for(const p of players.values()){p.inGame=false;p.team=null}sendLobby()}

  // 위치 방송(초당 20회) + 오래 킬이 없으면 장애물 제거 (킬 없는 시간은 라운드를 넘어 누적)
  const tickI=setInterval(()=>{
    if(phase==='play'&&combat&&!cleared){noKillMs+=C.TICK_MS;
      if(noKillMs>=C.NOKILL_SECS*1000){cleared=true;combat.clearObstacles();broadcast({t:'clear'},p=>p.inGame)}}
    if(phase!=='play'&&phase!=='countdown')return;
    broadcast({t:'state',p:ents().map(e=>[e.id,+e.x.toFixed(2),+e.y.toFixed(2),+e.z.toFixed(2),+e.yaw.toFixed(3),combat?combat.flags(e):1])},p=>p.inGame)},C.TICK_MS);

  // ---------- 접속 / 퇴장 / 메시지 ----------
  function join(conn){
    const p={conn,id:env.nextId(),nick:conn.nick,dev:conn.dev,inGame:false,team:null,vote:-1,weapon:null,x:0,y:0,z:0,yaw:0,lastMove:0};
    players.set(p.id,p);send(p,{t:'welcome',id:p.id,nick:p.nick,dev:p.dev});sendLobby();return p}
  function remove(p){
    players.delete(p.id);
    if(phase!=='lobby'&&!enough(inGame()))backToLobby();
    else{sendLobby();if(phase==='weapons'){sendPicks();checkAllPicked()}if(phase==='vote'){sendVotes();checkAllVoted()}if(phase==='play')checkWipe()}}
  function handle(p,m){
    switch(m.t){
      case 'start': if(phase==='lobby'&&p.id===hostId()&&enough([...players.values()]))startVote();break;
      case 'vote': if(phase==='vote'&&p.inGame&&Number.isInteger(m.map)&&m.map>=0&&m.map<MAPS.length){p.vote=m.map;sendVotes();checkAllVoted()}break;
      case 'weapon': if(phase==='weapons'&&p.inGame&&WEAPONS.some(w=>w.id===m.id)){p.weapon=m.id;sendPicks();checkAllPicked()}break;
      case 'move':{
        if(phase!=='play'||!p.inGame||!combat||!p.alive)break;
        const now=Date.now(),dt=Math.max((now-p.lastMove)/1000,.03);p.lastMove=now;
        const half=MAPS[mapIdx].size/2-.4,c=(v,lo,hi)=>Math.min(hi,Math.max(lo,Number(v)||0));
        const nx=c(m.x,-half,half),nz=c(m.z,-half,half),ny=c(m.y,0,p.dev?40:12);
        if(Math.hypot(nx-p.x,nz-p.z)>(p.dev?22:11)*dt+.5){send(p,{t:'correct',x:p.x,y:p.y,z:p.z});break}   // 이동 속도 상한 검증
        p.x=nx;p.y=ny;p.z=nz;p.yaw=Number(m.yaw)||0;break}
      case 'shoot': if(phase==='play'&&combat)combat.shoot(p,m);break;
      case 'reload': if(phase==='play'&&combat)combat.reload(p);break;
      case 'lobby': if(p.id===hostId()&&phase!=='lobby')backToLobby();break;      // 방장이 대기실로 (테스트용)
      case 'ping': send(p,{t:'pong',ts:m.ts});break;
    }}
  return{join,remove,handle,solo,size:()=>players.size,full:()=>players.size>=C.MAX_PLAYERS,
    destroy(){clearTimers();clearInterval(tickI)},debug:{ents,phase:()=>phase,wins:()=>wins,combat:()=>combat}}
}
const api={createRoom};
if(typeof module!=='undefined')module.exports=api;else window.Room=api;
})();
