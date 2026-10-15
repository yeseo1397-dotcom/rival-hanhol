// Arena 클라이언트 (2단계): 렌더링/이동은 1단계 코드, 접속/대기실/투표/팀/동기화는 서버와 통신
const $=s=>document.querySelector(s);
const {MAPS,spawnsOf}=ARENA;
const W=window.WEAPONS;
const cfgUrl=(window.ARENA_CONFIG&&ARENA_CONFIG.SERVER_URL)||'';
const others={};   // 다른 플레이어 (렌더 루프가 바로 쓰므로 맨 위에 선언)
let spec=null,dead=false,deadBy=null;const tracers=[];
let zoomK=1;   // 조준경 확대 시 감도 보정
const joy={x:0,y:0};   // 모바일 조이스틱 값 (-1~1)
let sens=1;try{sens=+localStorage.getItem('arena.sens')||1}catch(e){}   // 감도 (저장됨)
const WS_URL=cfgUrl||((location.protocol==='https:'?'wss://':'ws://')+location.host);

// ---------- 3D ----------
const R=new THREE.WebGLRenderer({antialias:true});
R.setSize(innerWidth,innerHeight);R.setPixelRatio(Math.min(devicePixelRatio,2));
R.domElement.className='main';document.body.prepend(R.domElement);
const scene=new THREE.Scene();
const cam=new THREE.PerspectiveCamera(80,innerWidth/innerHeight,.1,160);cam.rotation.order='YXZ';scene.add(cam);
const hemi=new THREE.HemisphereLight(0xbfeee6,0x1a2a30,.95);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0dd,.7);sun.position.set(10,30,8);scene.add(sun);
const gun=new THREE.Mesh(new THREE.BoxGeometry(.08,.1,.5),new THREE.MeshLambertMaterial({color:0x38d6c4}));
gun.position.set(.25,-.22,-.5);cam.add(gun);
const char=new THREE.Group(),cm=new THREE.MeshLambertMaterial({color:0x38d6c4});
[[new THREE.CylinderGeometry(.4,.4,1.4,12),.7,0,0],[new THREE.SphereGeometry(.26,12,10),1.65,0,0],
 [new THREE.BoxGeometry(.3,.1,.2),1.68,0,-.22],[new THREE.BoxGeometry(.08,.1,.5),1.1,.3,-.4]].forEach(([g,y,x,z])=>{
  const m=new THREE.Mesh(g,cm);m.position.set(x,y,z);char.add(m)});
scene.add(char);

let boxes=[],mapObjs=[],spawns=[],pads=[],obst=[],padM=[];
function loadMap(m){
  mapObjs.forEach(o=>scene.remove(o));mapObjs=[];boxes=[];obst=[];padM=[];spawns=spawnsOf(m);
  scene.background=new THREE.Color(m.bg);const L=m.lit||[0xbfeee6,0x1a2a30,.95,0xfff0dd,.7];
  hemi.color.set(L[0]);hemi.groundColor.set(L[1]);hemi.intensity=L[2];sun.color.set(L[3]);sun.intensity=L[4];scene.fog=new THREE.Fog(m.bg,m.size*.4,m.size*1.5);
  const add=o=>{scene.add(o);mapObjs.push(o)},S=m.size,wh=S>50?8:5;
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(S+2,S+2),new THREE.MeshLambertMaterial({color:m.floor}));
  fl.rotation.x=-Math.PI/2;add(fl);
  const gr=new THREE.GridHelper(S+2,(S+2)/2,m.grid||0x38d6c4,0xffffff);gr.material.opacity=.1;gr.material.transparent=true;gr.position.y=.01;add(gr);
  const h=S/2+.5;
  m.boxes.concat([[0,-h,S+2,1,wh,0x1b2a30],[0,h,S+2,1,wh,0x1b2a30],[-h,0,1,S+2,wh,0x1b2a30],[h,0,1,S+2,wh,0x1b2a30]]).forEach(([x,z,w,d,top,c,y0=0,gl],bi)=>{
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,top-y0,d),gl?new THREE.MeshBasicMaterial({color:c}):new THREE.MeshLambertMaterial({color:c}));
    b.position.set(x,(top+y0)/2,z);add(b);if(bi<m.boxes.length)obst.push(b);boxes.push({x,z,w:w/2,d:d/2,h:top,y0});
  });
  pads=m.pads||[];pads.forEach(([x,z,y=0])=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,.12,24),new THREE.MeshBasicMaterial({color:0xffe14a}));p.position.set(x,y+.06,z);add(p);padM.push([p,y])});
  $('#mapname').textContent=`${m.name} (${m.label} ${S}×${S})`;
}
// 충돌: 한 칸 오르는 높이 STEP까지는 계단처럼 자동으로 올라가고, 그보다 높으면 막힙니다.
const STEP=.6,HEAD=1.8;
const over=(b,x,z,r)=>Math.abs(x-b.x)<b.w+r&&Math.abs(z-b.z)<b.d+r;
const blocked=(x,z,y,r)=>boxes.some(b=>y+HEAD>b.y0&&y+STEP<b.h&&over(b,x,z,r));
const ground=(x,z,y)=>boxes.reduce((g,b)=>(b.h<=y+STEP&&over(b,x,z,.3))?Math.max(g,b.h):g,0);

// ---------- 플레이어 ----------
const P={x:0,y:0,z:0,vy:0,yaw:0,pitch:0};
let mode='login',tp=false,dev=false,fly=false,nick='';const keys={};
function spawn(){const s=spawns[Math.floor(Math.random()*spawns.length)];
  P.x=s[0];P.z=s[1];P.y=0;P.vy=0;P.pitch=0;P.yaw=s[1]>0?0:Math.PI;fly=false}
function update(dt){
  fireCd-=dt;if(dead)return;if((firing||(auto&&crosshairOnEnemy(curWeapon.range||Infinity)))&&mode==='play')tryFire();
  if(keys.ArrowLeft)P.yaw+=1.9*sens*zoomK*dt; if(keys.ArrowRight)P.yaw-=1.9*sens*zoomK*dt;
  if(keys.ArrowUp)P.pitch=Math.min(1.2,P.pitch+1.5*sens*zoomK*dt); if(keys.ArrowDown)P.pitch=Math.max(-1.2,P.pitch-1.5*sens*zoomK*dt);
  const f=(keys.KeyW?1:0)-(keys.KeyS?1:0)+joy.y,s=(keys.KeyD?1:0)-(keys.KeyA?1:0)+joy.x;
  let mx=-Math.sin(P.yaw)*f+Math.cos(P.yaw)*s,mz=-Math.cos(P.yaw)*f-Math.sin(P.yaw)*s;
  const l=Math.hypot(mx,mz)||1,v=(fly?12:7)*dt*Math.min(1,l);mx=mx/l*v;mz=mz/l*v;   // 조이스틱은 살짝 밀면 천천히
  if(fly){P.x+=mx;P.z+=mz;P.y=Math.max(0,P.y+((keys.Space?1:0)-(keys.ShiftLeft?1:0))*10*dt);return}
  if(!blocked(P.x+mx,P.z,P.y,.35))P.x+=mx;
  if(!blocked(P.x,P.z+mz,P.y,.35))P.z+=mz;
  const g=ground(P.x,P.z,P.y);
  if(keys.Space&&P.y<=g+.01)P.vy=8;
  if(P.y<=g+.05&&pads.some(([x,z,y=0])=>Math.hypot(P.x-x,P.z-z)<1.2&&Math.abs(P.y-y)<.3))P.vy=14;   // 점프대
  if(P.vy>0){const hy=P.y+HEAD;if(boxes.some(b=>b.y0>0&&b.y0>=hy-.01&&hy+P.vy*dt>b.y0&&over(b,P.x,P.z,.3)))P.vy=0}
  P.vy-=25*dt;P.y+=P.vy*dt;if(P.y<=g){P.y=g;P.vy=0}
}
function render(){
  cam.rotation.set(P.pitch,P.yaw,0);cam.position.set(P.x,P.y+1.6,P.z);
  if(tp){const back=new THREE.Vector3(0,0,1).applyEuler(cam.rotation);cam.position.addScaledVector(back,4);cam.position.y=Math.max(.4,cam.position.y+.3)}
  char.visible=tp;gun.visible=!tp;char.position.set(P.x,P.y,P.z);char.rotation.y=P.yaw;
  if(dead){char.visible=false;gun.visible=false;{const sm=pickSpec();if(sm){cam.position.set(sm.position.x,sm.position.y+1.6,sm.position.z);cam.rotation.set(0,sm.rotation.y,0)}}}   // 사망 중엔 나를 처치한 사람 시점
  R.render(scene,cam);
}
let last=performance.now();
(function loop(now){const dt=Math.min((now-last)/1000,.05);last=now;if(mode==='play'){update(dt);netTick(dt)}updateOthers(dt);render();requestAnimationFrame(loop)})(last);

// ---------- 네트워크 / 화면 ----------
const RED=0xff5a3c,BLUE=0x38d6c4,tcol=t=>t==='red'?RED:BLUE,thex=t=>t==='red'?'#ff5a3c':'#38d6c4',tname=t=>t==='red'?'레드팀':'블루팀';
let ws,myId=null,myTeam=null,hostId=null,gPhase='login',lobbyList=[],myVote=-1,joined=false,timerI,sendT=0,pend=null;
const norm=s=>s.normalize('NFKC').trim();
const send=o=>ws&&ws.readyState===1&&ws.send(JSON.stringify(o));
const show=id=>['login','lobby','vote','weapons'].forEach(k=>$('#'+k).style.display=k===id?'flex':'none');
const big=(t,sub,color)=>{const b=$('#big');b.replaceChildren();if(!t)return;
  const x=document.createElement('b'),y=document.createElement('span');x.textContent=t;y.textContent=sub||'';if(color)x.style.color=color;b.append(x,y)};
const countdown=(secs,fn)=>{clearInterval(timerI);let s=secs;fn(s);timerI=setInterval(()=>{s--;fn(s);if(s<=0)clearInterval(timerI)},1000)};

// 입장
$('#nick').addEventListener('input',()=>{$('#pw').style.display=norm($('#nick').value)==='19'?'':'none';$('#err').textContent=''});
function enter(){
  const n=norm($('#nick').value);
  if(n.length<2||n.length>12)return $('#err').textContent='닉네임은 2~12자로 입력하세요.';
  $('#enter').disabled=true;pend={nick:n,pw:$('#pw').value};
  ws=new WebSocket(WS_URL);
  ws.onopen=()=>send({t:'join',...pend});
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}handle(m)};
  ws.onerror=()=>{};
  ws.onclose=()=>{if(joined)$('#dc').style.display='flex';else{$('#enter').disabled=false;if(!$('#err').textContent)$('#err').textContent='서버에 연결할 수 없습니다.'}};
}
$('#enter').onclick=enter;
$('#login').addEventListener('keydown',e=>{if(e.key==='Enter')enter()});
$('#start').onclick=()=>send({t:'start'});
$('#back').onclick=()=>send({t:'lobby'});
setInterval(()=>send({t:'ping',ts:Date.now()}),2000);

function handle(m){
  switch(m.t){
    case 'err': $('#err').textContent=m.msg;show('login');break;
    case 'welcome':{myId=m.id;dev=m.dev;nick=m.nick;joined=true;break}
    case 'lobby':{
      lobbyList=m.players;hostId=m.host;gPhase=m.phase;inSolo=!!m.solo;
      const meP=lobbyList.find(p=>p.id===myId)||{};
      if(m.phase==='lobby'){leaveGame();show('lobby')}else if(!meP.inGame)show('lobby');
      renderLobby();break}
    case 'phase':
      if(m.phase==='vote'){mode='vote';myVote=-1;paintVotes(MAPS.map(()=>0));show('vote');countdown(m.secs,s=>$('#vinfo').textContent=`남은 시간 ${s}초`)}
      if(m.phase==='weapons'){mode='weapons';myLoadout={...defLoad};ready=false;paintWeapons();show('weapons');$('#wmap').textContent='선택된 맵: '+MAPS[m.map].name;$('#wcount').textContent='';
        countdown(m.secs,s=>$('#winfo').textContent=`남은 시간 ${s}초 · 주무기·보조무기·근접무기를 하나씩 고르고 '선택 완료'를 눌러주세요 (같은 무기도 괜찮아요)`)}
      if(m.phase==='countdown'){mode='countdown';roundNo=m.round;totalRounds=m.total;setWins(m.wins);clearInterval(clockI);$('#timer').textContent=`라운드 ${roundNo}/${totalRounds}`;countdown(m.secs,s=>big(s>0?String(s):'',`라운드 ${m.round}`))}
      if(m.phase==='play'){mode='play';big('');roundNo=m.round;totalRounds=m.total;setWins(m.wins);startClock(m.secs)}
      break;
    case 'votes': paintVotes(m.counts);break;
    case 'picks': $('#wcount').textContent=`${m.n}/${m.total}명 선택 완료`;break;
    case 'teams': startRound(m);break;
    case 'state': applyState(m.p);break;
    case 'correct': P.x=m.x;P.y=m.y;P.z=m.z;break;
    case 'shot':{if(m.mel)break;const mine=m.id===myId;let from;
      if(mine){const cp=Math.cos(P.pitch);from=[P.x-Math.sin(P.yaw)*cp*.3,P.y+1.6+Math.sin(P.pitch)*.3,P.z-Math.cos(P.yaw)*cp*.3]}   // 총알은 조준점(눈 위치)에서 출발
      else from=[m.from[0],m.from[1]-.3,m.from[2]];
      m.ends.forEach(e=>addTracer(from,e,m.team==='red'?0xff9a7a:0x9af2e8));break}
    case 'hit':{const c=$('#ch');c.classList.add('hit');c.classList.toggle('hs',!!m.head);setTimeout(()=>c.classList.remove('hit','hs'),m.kill?220:100);break}
    case 'hp':hp=m.hp;if(m.max)maxHp=m.max;paintHud();if(m.dmg>0){if(navigator.vibrate)navigator.vibrate(40);$('#dmg').style.opacity=1;setTimeout(()=>$('#dmg').style.opacity=0,120)}break;
    case 'ammo':ammo={a:m.a,m:m.m,r:m.r,res:m.res||0,inf:!!m.inf};paintHud();break;
    case 'equip':{slot=m.slot;curWeapon=W.find(x=>x.id===m.id)||curWeapon;gun.scale.set(curWeapon.gun[0]/.08,curWeapon.gun[1]/.1,curWeapon.gun[2]/.5);zoomOn=false;applyZoom();paintSlots();paintHud();break}
    case 'roundend':roundEnd(m);break;
    case 'kill':killLog(m.k,m.v,m.head);break;
    case 'died':{dead=true;firing=false;deadBy=m.by;specIdx=0;zoomOn=false;applyZoom();clearInterval(deadI);paintAlive();
      big('처치당했습니다',`${nickMap[m.by]||''} 님에게 · 같은 팀을 관전해요`,'#ff5a3c');
      setTimeout(()=>{if(dead&&mode==='play')big('')},2200);break}
    case 'respawn':{clearInterval(deadI);dead=false;spec=null;P.x=m.x;P.y=m.y;P.z=m.z;P.vy=0;P.pitch=0;P.yaw=m.yaw;fireCd=0;big('');hideSpec();paintAlive();break}
    case 'clear':removeObstacles();big('장애물이 모두 사라졌습니다!','오랫동안 킬이 나오지 않았어요');setTimeout(()=>{if(mode==='play'&&!dead)big('')},3500);break;
    case 'result':showResult(m);break;
    case 'pong': $('#ping').textContent=`핑 ${Date.now()-m.ts}ms`;break;
  }
}
function renderLobby(){
  const pl=$('#plist');pl.replaceChildren();
  lobbyList.forEach(p=>{const d=document.createElement('div'),a=document.createElement('span'),b=document.createElement('span');
    a.textContent=p.nick;b.textContent=(p.id===hostId?'방장 ':'')+(p.dev?'개발자':'');d.append(a,b);pl.append(d)});
  const host=hostId===myId,playing=gPhase!=='lobby';
  $('#start').style.display=host&&!playing?'':'none';const solo=lobbyList.length===1&&lobbyList[0].dev,ok=lobbyList.length>=2||solo;$('#start').disabled=!ok;
  $('#lmsg').textContent=playing?'경기가 진행 중입니다. 끝나면 대기실에서 함께해요.':
    host?(solo?'개발자 모드: 혼자서도 시작할 수 있어요.':ok?'모두 모였으면 시작하세요.':'최소 2명이 필요합니다.'):'방장이 시작하기를 기다리는 중...';
  if(inSolo)$('#lmsg').textContent='연습방: 다른 사람과 상관없이 혼자 연습해요. 연습용 표적 3개가 나옵니다.';
  $('#lobby h1').textContent=inSolo?'연습방 (개발자)':'대기실';
  $('#solo').style.display=dev&&!inSolo?'':'none';$('#tomain').style.display=inSolo?'':'none';
}

// 맵 투표 카드 (미리보기 + 서버가 보내주는 득표수)
const cards=$('#cards');
MAPS.forEach((m,i)=>{
  const c=document.createElement('div');c.className='card';
  c.innerHTML=`<canvas width="170" height="170"></canvas><b></b><small></small><div class="bar"><i></i></div><div class="cnt">0표</div>`;
  c.querySelector('b').textContent=`${m.name} · ${m.label}`;c.querySelector('small').textContent=m.desc;
  c.onclick=()=>{if(mode==='vote'){myVote=i;send({t:'vote',map:i});paintVotes(lastCounts)}};cards.appendChild(c);
  const g=c.querySelector('canvas').getContext('2d'),k=170/(m.size+2),o=m.size/2+1;
  g.fillStyle='#0b1418';g.fillRect(0,0,170,170);
  [...m.boxes].sort((a,b)=>a[4]-b[4]).forEach(([x,z,w,d,h,col])=>{
    g.fillStyle='#'+col.toString(16).padStart(6,'0');g.fillRect((x-w/2+o)*k,(z-d/2+o)*k,w*k,d*k);
    g.fillStyle=`rgba(255,255,255,${Math.min(h/8,.45)})`;g.fillRect((x-w/2+o)*k,(z-d/2+o)*k,w*k,d*k)});
  g.fillStyle='#38d6c4';spawnsOf(m).forEach(([x,z])=>g.fillRect((x+o)*k-2,(z+o)*k-2,4,4));
  g.fillStyle='#ffe14a';(m.pads||[]).forEach(([x,z])=>{g.beginPath();g.arc((x+o)*k,(z+o)*k,3.5,0,6.3);g.fill()});
});
let lastCounts=MAPS.map(()=>0);
function paintVotes(counts){
  lastCounts=counts;const total=Math.max(1,lobbyList.length);
  [...cards.children].forEach((c,i)=>{c.classList.toggle('sel',myVote===i);
    c.querySelector('.cnt').textContent=counts[i]+'표';c.querySelector('.bar i').style.width=(counts[i]/total*100)+'%'});
}

// 무기 선택: 주무기 / 보조무기 / 근접무기를 하나씩 고르고 '선택 완료'
const SLOTN={main:'주무기',side:'보조무기',melee:'근접무기'},STAT=['화력','연사','정확','기동'];
const defLoad={};['main','side','melee'].forEach(s=>defLoad[s]=W.find(w=>w.slot===s).id);
let myLoadout={...defLoad},ready=false,loadout={...defLoad},slot='main',curWeapon=W.find(w=>w.id===defLoad.main);
const wsec=$('#wsec');
function sendLoadout(r){ready=!!r;send({t:'loadout',...myLoadout,ready:ready});paintWeapons()}
function paintWeapons(){[...wsec.querySelectorAll('.w')].forEach(c=>c.classList.toggle('sel',myLoadout[c.dataset.slot]===c.dataset.id));
  $('#wready').textContent=ready?'선택 완료됨 (바꾸려면 다시 고르세요)':'선택 완료'}
['main','side','melee'].forEach(sl=>{
  const t=document.createElement('div'),g=document.createElement('div');t.className='wtitle';t.textContent=SLOTN[sl];g.className='wgrid';
  W.filter(w=>w.slot===sl).forEach(w=>{
    const c=document.createElement('div');c.className='w';c.dataset.slot=sl;c.dataset.id=w.id;
    const b1=document.createElement('b'),e=document.createElement('em'),d=document.createElement('small');
    b1.textContent=w.name;e.textContent=w.melee?`${w.cls} · ${w.range}m`:w.cls;b1.append(e);d.textContent=w.desc;c.append(b1,d);
    w.s.forEach((v,k)=>{const r=document.createElement('div'),l=document.createElement('span'),bar=document.createElement('i'),u=document.createElement('u');
      r.className='st';l.textContent=STAT[k];u.style.width=(v*20)+'%';bar.append(u);r.append(l,bar);c.append(r)});
    c.onclick=()=>{if(mode==='weapons'){myLoadout[sl]=w.id;sendLoadout(false)}};g.append(c)});
  wsec.append(t,g)});
$('#wready').onclick=()=>{if(mode==='weapons')sendLoadout(true)};

// ---------- 전투: 발사, 체력/탄약 표시, 킬 로그 ----------
let hp=100,ammo={a:0,m:0,r:0,res:0,inf:false},firing=false,fireCd=0,deadI=null,auto=false,maxHp=150,inSolo=false,roundNo=0,totalRounds=5;
function paintAuto(){$('#autoset').checked=auto}
function toggleAuto(){auto=!auto;paintAuto()}
// 오토 발사: 내 조준점(화면 가운데)에 상대가 들어왔을 때만 자동으로 발사. 벽/장애물에 가려진 상대는 해당하지 않음
function rayEnt(O,D,x,y,z){let best=null;const ox=O[0]-x,oz=O[2]-z,a=D[0]*D[0]+D[2]*D[2];
  if(a>1e-9){const b=2*(ox*D[0]+oz*D[2]),c=ox*ox+oz*oz-.25,disc=b*b-4*a*c;
    if(disc>=0){const sq=Math.sqrt(disc);for(const t of [(-b-sq)/(2*a),(-b+sq)/(2*a)])if(t>0){const yy=O[1]+D[1]*t;if(yy>=y&&yy<=y+1.45){best=t;break}}}}
  const sx=O[0]-x,sy=O[1]-(y+1.65),sz=O[2]-z,b2=sx*D[0]+sy*D[1]+sz*D[2],d2=b2*b2-(sx*sx+sy*sy+sz*sz-.1225);
  if(d2>=0){const t=-b2-Math.sqrt(d2);if(t>0&&(best===null||t<best))best=t}
  return best}
function crosshairOnEnemy(range=Infinity){
  const cp=Math.cos(P.pitch),D=[-Math.sin(P.yaw)*cp,Math.sin(P.pitch),-Math.cos(P.yaw)*cp],O=[P.x,P.y+1.6,P.z];
  let tw=Infinity;
  for(const b of boxes){const lo=[b.x-b.w,b.y0,b.z-b.d],hi=[b.x+b.w,b.h,b.z+b.d];let t0=0,t1=Infinity,ok=true;
    for(let i=0;i<3&&ok;i++){if(Math.abs(D[i])<1e-9){if(O[i]<lo[i]||O[i]>hi[i])ok=false}
      else{let u=(lo[i]-O[i])/D[i],v=(hi[i]-O[i])/D[i];if(u>v)[u,v]=[v,u];t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>t1)ok=false}}
    if(ok&&t0<tw)tw=t0}
  for(const id in others){const o=others[id];if(o.alive===false||teamMap[id]===myTeam)continue;
    const e=o.mesh.position,t=rayEnt(O,D,e.x,e.y,e.z);if(t!==null&&t<tw&&t<=range)return true}
  return false}
const teamMap={},nickMap={};
const countdown2=(secs,fn)=>{let s=secs;fn(s);deadI=setInterval(()=>{s--;if(s>=0)fn(s);if(s<=0)clearInterval(deadI)},1000)};
function paintHud(){
  $('#hpnum').textContent=Math.max(0,Math.ceil(hp));$('#hpmax').textContent='/'+maxHp;$('#hpbar i').style.width=Math.max(0,hp/maxHp*100)+'%';
  $('#wname').textContent=`${SLOTN[slot]} · ${curWeapon.name}`;
  $('#ammo').textContent=ammo.inf?'∞':ammo.r?'재장전...':(ammo.a<=0&&ammo.res<=0)?'탄약 없음':`${ammo.a} / ${ammo.res}`;   // 남은 총알 / 전체 남은 총알
}
function scoreEls(r,b){const x=document.createElement('span'),y=document.createElement('span');
  x.className='r';x.textContent=r;y.className='b';y.textContent=b;return[x,document.createTextNode(' : '),y]}
function addTracer(a,b,color){
  const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]),new THREE.LineBasicMaterial({color}));
  scene.add(l);tracers.push({l,t:.07});
}
function tryFire(){
  if(fireCd>0||dead)return;const mel=curWeapon.melee;
  if(!mel&&(ammo.r||ammo.a<=0))return;
  fireCd=curWeapon.delay;if(!mel){ammo.a=Math.max(0,ammo.a-(curWeapon.id==='burst'?3:1));paintHud()}
  send({t:'shoot',x:+P.x.toFixed(2),y:+P.y.toFixed(2),z:+P.z.toFixed(2),yaw:+P.yaw.toFixed(3),pitch:+P.pitch.toFixed(3)});   // 총알은 조준점(화면 가운데) 방향
  gun.position.z=-.42;setTimeout(()=>gun.position.z=-.5,60);
}
// 무기 교체 / 조준경(확대)
let zoomOn=false;
function applyZoom(){const z=zoomOn?(curWeapon.zoom||1.5):1;zoomK=1/z;cam.fov=80/z;cam.updateProjectionMatrix();$('#bscope').classList.toggle('on',zoomOn)}
function toggleZoom(){if(mode!=='play'||dead||curWeapon.melee)return;zoomOn=!zoomOn;applyZoom()}
function paintSlots(){document.querySelectorAll('.bslot').forEach(b=>b.classList.toggle('on',b.dataset.slot===slot))}
function equipSlot(s){if(mode!=='play'||dead||s===slot)return;send({t:'slot',slot:s})}
function killLog(k,v,head){
  const d=document.createElement('div'),a=document.createElement('span'),b=document.createElement('span');
  a.textContent=nickMap[k]||'?';a.style.color=thex(teamMap[k]);b.textContent=nickMap[v]||'?';b.style.color=thex(teamMap[v]);
  d.append(a,document.createTextNode(head?' ★ ':' → '),b);const kl=$('#klog');kl.prepend(d);setTimeout(()=>d.remove(),6000);
  while(kl.children.length>5)kl.lastChild.remove();
}

// ---------- 경기 시계 / 장애물 제거 / 결과 화면 ----------
let clockI=null;
function startClock(secs){clearInterval(clockI);const end=Date.now()+secs*1000;
  const tick=()=>{const s=Math.max(0,Math.ceil((end-Date.now())/1000));$('#timer').textContent=`라운드 ${roundNo}/${totalRounds} · `+Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
  tick();clockI=setInterval(tick,250)}
function removeObstacles(){
  obst.forEach(o=>scene.remove(o));obst=[];boxes=boxes.slice(-4);                       // 바깥 벽 4개만 남김
  padM.forEach(([p,y])=>{if(y>0)scene.remove(p)});pads=pads.filter(q=>!(q[2]>0));       // 위층 점프대도 함께 사라짐
}
function showResult(m){
  mode='ended';firing=false;dead=false;spec=null;clearInterval(deadI);clearInterval(clockI);big('');
  const draw=m.winner==='draw',t=$('#rtitle');
  t.textContent=draw?'무승부':tname(m.winner)+' 승리!';t.style.color=draw?'#e8f1ee':thex(m.winner);
  $('#rscore').textContent=`레드 ${m.red} : ${m.blue} 블루 · 라운드 승리 수`;
  $('#rrounds').textContent=m.rounds.map((w,i)=>`R${i+1} ${w==='draw'?'무':w==='red'?'레드':'블루'}`).join('   ·   ');
  const tb=$('#rtable');tb.replaceChildren();
  const row=(cells,cls)=>{const d=document.createElement('div');d.className='rrow '+(cls||'');cells.forEach(c=>{const s=document.createElement('span');s.textContent=c;d.append(s)});return d};
  tb.append(row(['닉네임','팀','킬','데스','헤드샷','피해량'],'h'));
  [...m.players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths).forEach(p=>{
    const r=row([p.nick,tname(p.team).replace('팀',''),p.kills,p.deaths,p.heads,p.dmg],p.id===myId?'me':'');
    r.children[0].style.color=thex(p.team);r.children[1].style.color=thex(p.team);tb.append(r)});
  $('#result').style.display='flex';
  countdown(m.secs,s=>$('#rwait').textContent=`${s}초 뒤 대기실로 이동합니다`);
}

// ---------- 라운드 표시 / 관전 / 설정창 / 터치로 시점 돌리기 ----------
function setWins(w){const [x,sp,y]=scoreEls(w.red,w.blue);x.classList.toggle('mine',myTeam==='red');y.classList.toggle('mine',myTeam==='blue');$('#score').replaceChildren(x,sp,y)}
function paintAlive(){let r=0,b=0;const add=t=>t==='red'?r++:b++;if(!dead&&myTeam)add(myTeam);
  for(const id in others)if(others[id].alive!==false)add(teamMap[id]);$('#alive').textContent=`생존 ${r} : ${b}`}
let specIdx=0,specShown=null;
function specList(){return Object.entries(others).filter(([id,o])=>o.alive!==false&&teamMap[id]===myTeam).sort((a,b)=>a[0]-b[0])}
function pickSpec(){
  const l=specList();
  if(!l.length){if(specShown!==null){specShown=null;$('#spec').style.display='none'}return null}
  const [id,o]=l[specIdx%l.length];
  if(specShown!==id){specShown=id;const s=$('#spec');s.textContent=`관전: ${nickMap[id]||''} (같은 팀) · 화면을 누르면 다음 팀원`;s.style.display='block'}
  return o.mesh}
const hideSpec=()=>{specShown=null;$('#spec').style.display='none'};
function roundEnd(m){
  mode='roundend';firing=false;zoomOn=false;applyZoom();hideSpec();clearInterval(clockI);setWins(m.wins);
  const draw=m.winner==='draw',why={wipe:'상대팀을 모두 처치했어요',alive:'시간 종료 · 생존 인원이 더 많아요',hp:'시간 종료 · 남은 체력이 더 많아요',draw:'시간 종료 · 무승부'}[m.reason]||'';
  big(`라운드 ${m.n} · ${draw?'무승부':tname(m.winner)+' 승리'}`,`${why}   (레드 ${m.wins.red} : ${m.wins.blue} 블루)`,draw?'#e8f1ee':thex(m.winner));
}
const panels={settings:'#settings',guide:'#guide'};      // 왼쪽 위 '설명' / '설정' 창 (하나가 열리면 다른 하나는 닫힘)
const closePanels=()=>{for(const k in panels)$(panels[k]).style.display='none'};
function openPanel(name){const open=$(panels[name]).style.display==='flex';closePanels();if(!open)$(panels[name]).style.display='flex'}
$('#gear').onclick=e=>{openPanel('settings');e.currentTarget.blur()};
$('#helpbtn').onclick=e=>{openPanel('guide');e.currentTarget.blur()};
$('#setclose').onclick=closePanels;$('#guideclose').onclick=closePanels;
$('#sens').value=sens;$('#sensval').textContent=sens.toFixed(1);
$('#sens').addEventListener('input',e=>{sens=+e.target.value;$('#sensval').textContent=sens.toFixed(1);try{localStorage.setItem('arena.sens',sens)}catch(err){}});
$('#sens').addEventListener('change',e=>e.target.blur());
$('#autoset').onchange=e=>{auto=e.target.checked;paintAuto();e.target.blur()};
$('#tpset').onchange=e=>{tp=e.target.checked;e.target.blur()};
$('#solo').onclick=()=>send({t:'solo'});$('#tomain').onclick=()=>send({t:'tomain'});
// 모바일 화면 조작: 왼쪽 조이스틱(이동) + 오른쪽 버튼(발사/점프/장전) + 화면 끌기(시점)
const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
let tui=isTouch;try{const v=localStorage.getItem('arena.tui');if(v!==null)tui=v==='1'}catch(e){}
function paintTui(){document.body.classList.toggle('tui',tui);$('#tuiset').checked=tui}
paintTui();
$('#tuiset').onchange=e=>{tui=e.target.checked;try{localStorage.setItem('arena.tui',tui?'1':'0')}catch(err){}paintTui();e.target.blur()};
$('#fs').onclick=e=>{try{const el=document.documentElement;(el.requestFullscreen||el.webkitRequestFullscreen).call(el)}catch(err){}e.currentTarget.blur()};
const jb=$('#joy'),kn=$('#knob'),JR=52;let joyId=null;
function joySet(e){const r=jb.getBoundingClientRect();let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
  const JRr=r.width*.34,d=Math.hypot(dx,dy),mm=Math.min(d,JRr);if(d>0){dx=dx/d*mm;dy=dy/d*mm}
  kn.style.transform=`translate(${dx}px,${dy}px)`;const ax=dx/JRr,ay=-dy/JRr;joy.x=Math.abs(ax)<.15?0:ax;joy.y=Math.abs(ay)<.15?0:ay}
jb.addEventListener('pointerdown',e=>{if(joyId!==null)return;joyId=e.pointerId;try{jb.setPointerCapture(e.pointerId)}catch(err){}joySet(e);e.preventDefault()});
jb.addEventListener('pointermove',e=>{if(e.pointerId===joyId)joySet(e)});
const joyEnd=e=>{if(e.pointerId!==joyId)return;joyId=null;joy.x=joy.y=0;kn.style.transform='translate(0,0)'};
jb.addEventListener('pointerup',joyEnd);jb.addEventListener('pointercancel',joyEnd);
const hold=(el,down,up)=>{let id=null;el.addEventListener('pointerdown',e=>{if(id!==null)return;id=e.pointerId;try{el.setPointerCapture(e.pointerId)}catch(err){}down();e.preventDefault()});
  const end=e=>{if(e.pointerId!==id)return;id=null;up()};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end)};
hold($('#bfire'),()=>{firing=true},()=>{firing=false});
hold($('#bjump'),()=>{keys.Space=true},()=>{keys.Space=false});
hold($('#breload'),()=>send({t:'reload'}),()=>{});
hold($('#bscope'),()=>toggleZoom(),()=>{});
document.querySelectorAll('.bslot').forEach(b=>hold(b,()=>equipSlot(b.dataset.slot),()=>{}));
$('#showguide').onclick=()=>openPanel('guide');
let touchId=null,tx=0,ty=0;const cvs=R.domElement;                 // 화면을 손가락으로 끌어 시점 돌리기 (감도 설정 적용)
cvs.addEventListener('touchstart',e=>{if(mode!=='play')return;if(dead){specIdx++;e.preventDefault();return}if(touchId!==null)return;const t=e.changedTouches[0];touchId=t.identifier;tx=t.clientX;ty=t.clientY;e.preventDefault()},{passive:false});
cvs.addEventListener('touchmove',e=>{for(const t of e.changedTouches)if(t.identifier===touchId){
  if(mode==='play'&&!dead){P.yaw-=(t.clientX-tx)*.0045*sens*zoomK;P.pitch=Math.max(-1.2,Math.min(1.2,P.pitch-(t.clientY-ty)*.0045*sens*zoomK))}
  tx=t.clientX;ty=t.clientY;e.preventDefault()}},{passive:false});
const endT=e=>{for(const t of e.changedTouches)if(t.identifier===touchId)touchId=null};
cvs.addEventListener('touchend',endT);cvs.addEventListener('touchcancel',endT);

// 라운드 시작: 팀 공개 → 카운트다운 → 경기
function startRound(m){
  const mp=MAPS[m.map];loadMap(mp);clearOthers();
  myTeam=m.teams[myId].team;cm.color.set(tcol(myTeam));gun.material.color.set(tcol(myTeam));   // 1인칭 총도 팀 색으로
  loadout=(m.loadouts||{})[myId]||{...defLoad};slot='main';curWeapon=W.find(x=>x.id===loadout.main)||W[0];gun.scale.set(curWeapon.gun[0]/.08,curWeapon.gun[1]/.1,curWeapon.gun[2]/.5);zoomOn=false;applyZoom();paintSlots();hideSpec();
  $('#result').style.display='none';clearInterval(clockI);$('#timer').textContent='라운드 1/'+(m.rounds||5);roundNo=1;totalRounds=m.rounds||5;paintAuto();
  maxHp=m.maxHp||150;hp=maxHp;ammo={a:curWeapon.mag,m:curWeapon.mag,r:0,res:curWeapon.reserve!=null?curWeapon.reserve:curWeapon.mag*3,inf:false};dead=false;spec=null;firing=false;fireCd=0;clearInterval(deadI);$('#klog').replaceChildren();
  Object.entries(m.teams).forEach(([id,t])=>{teamMap[id]=t.team;nickMap[id]=t.nick});paintHud();setWins({red:0,blue:0});
  const sp=m.spawns[myId];P.x=sp[0];P.z=sp[1];P.y=0;P.vy=0;P.pitch=0;P.yaw=sp[1]>0?0:Math.PI;fly=false;
  Object.entries(m.teams).forEach(([id,t])=>{if(+id!==myId)others[id]=makeOther(+id,t.team,t.nick,m.spawns[id])});
  const names=t=>Object.values(m.teams).filter(x=>x.team===t).map(x=>x.nick).join(', ');
  show(null);$('#vote').style.display='none';$('#lobby').style.display='none';
  mode='reveal';big(`당신은 ${tname(myTeam)}`,`레드: ${names('red')}  |  블루: ${names('blue')}`,thex(myTeam));
  const me=$('#me');me.replaceChildren(document.createTextNode(nick+' · '+tname(myTeam)));me.style.color=thex(myTeam);
  if(dev){const b=document.createElement('i');b.className='badge';b.textContent='개발자';me.append(b)}
  document.body.classList.add('ingame');paintAlive();['#help','#right','#combat'].forEach(s=>$(s).style.display='');$('#back').style.display=hostId===myId?'':'none';
}
function leaveGame(){mode='lobby';clearOthers();big('');clearInterval(timerI);myTeam=null;tp=false;
  dead=false;spec=null;firing=false;clearInterval(deadI);clearInterval(clockI);$('#result').style.display='none';closePanels();hideSpec();zoomOn=false;applyZoom();document.body.classList.remove('ingame');['#help','#right','#back','#combat'].forEach(s=>$(s).style.display='none')}

// ---------- 다른 플레이어: 위치를 받아서 부드럽게 보간 ----------
function bodyMesh(color){
  const g=new THREE.Group(),mat=new THREE.MeshLambertMaterial({color});
  [[new THREE.CylinderGeometry(.4,.4,1.4,12),.7,0,0],[new THREE.SphereGeometry(.26,12,10),1.65,0,0],
   [new THREE.BoxGeometry(.3,.1,.2),1.68,0,-.22],[new THREE.BoxGeometry(.08,.1,.5),1.1,.3,-.4]].forEach(([geo,y,x,z])=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m)});
  return g;
}
function nameTag(text,color){
  const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');
  g.font='bold 34px sans-serif';g.textAlign='center';g.lineWidth=5;g.strokeStyle='#000';g.fillStyle=color;
  g.strokeText(text,128,44);g.fillText(text,128,44);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true}));
  s.scale.set(2.4,.6,1);s.position.y=2.35;s.renderOrder=9;return s;
}
function makeOther(id,team,name,sp){
  const mesh=bodyMesh(tcol(team));scene.add(mesh);
  if(team===myTeam)mesh.add(nameTag(name,thex(team)));          // 아군만 닉네임 표시, 적은 숨김
  mesh.position.set(sp[0],0,sp[1]);
  return {mesh,tx:sp[0],ty:0,tz:sp[1],tyaw:sp[1]>0?0:Math.PI,alive:true,inv:false};
}
function clearOthers(){for(const k in others){scene.remove(others[k].mesh);delete others[k]}}
function applyState(list){
  for(const [id,x,y,z,yaw,f] of list){const o=others[id];if(o){o.tx=x;o.ty=y;o.tz=z;o.tyaw=yaw;o.alive=!!(f&1);o.inv=!!(f&2)}}
  for(const k in others)if(!list.some(p=>p[0]==k)){scene.remove(others[k].mesh);delete others[k]}   // 나간 사람 제거
  paintAlive();
}
function updateOthers(dt){
  const k=Math.min(1,dt*12);
  for(let i=tracers.length-1;i>=0;i--){tracers[i].t-=dt;if(tracers[i].t<=0){scene.remove(tracers[i].l);tracers.splice(i,1)}}
  for(const id in others){const o=others[id],m=o.mesh;m.visible=o.alive!==false&&(!o.inv||Math.floor(performance.now()/120)%2===0);   // 죽으면 숨김, 무적이면 깜빡임
   
    m.position.x+=(o.tx-m.position.x)*k;m.position.y+=(o.ty-m.position.y)*k;m.position.z+=(o.tz-m.position.z)*k;
    const d=((o.tyaw-m.rotation.y+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;m.rotation.y+=d*k}
}
function netTick(dt){if(dead)return;sendT+=dt;if(sendT>=.05){sendT=0;send({t:'move',x:+P.x.toFixed(2),y:+P.y.toFixed(2),z:+P.z.toFixed(2),yaw:+P.yaw.toFixed(3),pitch:+P.pitch.toFixed(3)})}}

addEventListener('keydown',e=>{
  if(mode==='play'&&(e.code.startsWith('Arrow')||e.code==='Space'))e.preventDefault();
  keys[e.code]=true;
  if(mode==='play'){if(e.code==='KeyV'){tp=!tp;$('#tpset').checked=tp}if(e.code==='KeyT')send({t:'reload'});if(e.code==='Digit1')equipSlot('main');if(e.code==='Digit2')equipSlot('side');if(e.code==='Digit3')equipSlot('melee');if(e.code==='KeyZ'&&!e.repeat)toggleZoom();if(e.code==='KeyG'&&!e.repeat)toggleAuto();if(e.code==='KeyR'||e.code==='KeyJ')firing=true;if(e.code==='KeyF'&&dev){fly=!fly;P.vy=0}}
});
addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='KeyR'||e.code==='KeyJ')firing=false});
addEventListener('resize',()=>{R.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()});
document.addEventListener('mousedown',e=>{if(mode!=='play'||e.target.closest('button,#touchui,.panel'))return;
  if(e.button===2){toggleZoom();return}if(e.button!==0)return;if(dead){specIdx++;return}firing=true});
document.addEventListener('contextmenu',e=>{if(mode==='play')e.preventDefault()});
document.addEventListener('mouseup',()=>firing=false);
addEventListener('blur',()=>firing=false);
loadMap(MAPS[0]);$('#nick').focus();
