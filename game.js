// Arena 클라이언트 (2단계): 렌더링/이동은 1단계 코드, 접속/대기실/투표/팀/동기화는 서버와 통신
const $=s=>document.querySelector(s);
const {MAPS,spawnsOf}=ARENA;
const cfgUrl=(window.ARENA_CONFIG&&ARENA_CONFIG.SERVER_URL)||'';
const others={};   // 다른 플레이어 (렌더 루프가 바로 쓰므로 맨 위에 선언)
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

let boxes=[],mapObjs=[],spawns=[],pads=[];
function loadMap(m){
  mapObjs.forEach(o=>scene.remove(o));mapObjs=[];boxes=[];spawns=spawnsOf(m);
  scene.background=new THREE.Color(m.bg);const L=m.lit||[0xbfeee6,0x1a2a30,.95,0xfff0dd,.7];
  hemi.color.set(L[0]);hemi.groundColor.set(L[1]);hemi.intensity=L[2];sun.color.set(L[3]);sun.intensity=L[4];scene.fog=new THREE.Fog(m.bg,m.size*.4,m.size*1.5);
  const add=o=>{scene.add(o);mapObjs.push(o)},S=m.size,wh=S>50?8:5;
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(S+2,S+2),new THREE.MeshLambertMaterial({color:m.floor}));
  fl.rotation.x=-Math.PI/2;add(fl);
  const gr=new THREE.GridHelper(S+2,(S+2)/2,m.grid||0x38d6c4,0xffffff);gr.material.opacity=.1;gr.material.transparent=true;gr.position.y=.01;add(gr);
  const h=S/2+.5;
  m.boxes.concat([[0,-h,S+2,1,wh,0x1b2a30],[0,h,S+2,1,wh,0x1b2a30],[-h,0,1,S+2,wh,0x1b2a30],[h,0,1,S+2,wh,0x1b2a30]]).forEach(([x,z,w,d,top,c,y0=0,gl])=>{
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,top-y0,d),gl?new THREE.MeshBasicMaterial({color:c}):new THREE.MeshLambertMaterial({color:c}));
    b.position.set(x,(top+y0)/2,z);add(b);boxes.push({x,z,w:w/2,d:d/2,h:top,y0});
  });
  pads=m.pads||[];pads.forEach(([x,z,y=0])=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,.12,24),new THREE.MeshBasicMaterial({color:0xffe14a}));p.position.set(x,y+.06,z);add(p)});
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
  if(keys.ArrowLeft)P.yaw+=1.9*dt; if(keys.ArrowRight)P.yaw-=1.9*dt;
  if(keys.ArrowUp)P.pitch=Math.min(1.2,P.pitch+1.5*dt); if(keys.ArrowDown)P.pitch=Math.max(-1.2,P.pitch-1.5*dt);
  const f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  let mx=-Math.sin(P.yaw)*f+Math.cos(P.yaw)*s,mz=-Math.cos(P.yaw)*f-Math.sin(P.yaw)*s;
  const l=Math.hypot(mx,mz)||1,v=(fly?12:7)*dt;mx=mx/l*v;mz=mz/l*v;
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
  R.render(scene,cam);
}
let last=performance.now();
(function loop(now){const dt=Math.min((now-last)/1000,.05);last=now;if(mode==='play'){update(dt);netTick(dt)}updateOthers(dt);render();requestAnimationFrame(loop)})(last);

// ---------- 네트워크 / 화면 ----------
const RED=0xff5a3c,BLUE=0x38d6c4,tcol=t=>t==='red'?RED:BLUE,thex=t=>t==='red'?'#ff5a3c':'#38d6c4',tname=t=>t==='red'?'레드팀':'블루팀';
let ws,myId=null,myTeam=null,hostId=null,gPhase='login',lobbyList=[],myVote=-1,joined=false,timerI,sendT=0,pend=null;
const norm=s=>s.normalize('NFKC').trim();
const send=o=>ws&&ws.readyState===1&&ws.send(JSON.stringify(o));
const show=id=>['login','lobby','vote'].forEach(k=>$('#'+k).style.display=k===id?'flex':'none');
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
      lobbyList=m.players;hostId=m.host;gPhase=m.phase;
      const meP=lobbyList.find(p=>p.id===myId)||{};
      if(m.phase==='lobby'){leaveGame();show('lobby')}else if(!meP.inGame)show('lobby');
      renderLobby();break}
    case 'phase':
      if(m.phase==='vote'){mode='vote';myVote=-1;paintVotes(MAPS.map(()=>0));show('vote');countdown(m.secs,s=>$('#vinfo').textContent=`남은 시간 ${s}초`)}
      if(m.phase==='countdown'){mode='countdown';countdown(m.secs,s=>big(s>0?String(s):''))}
      if(m.phase==='play'){mode='play';big('')}
      break;
    case 'votes': paintVotes(m.counts);break;
    case 'teams': startRound(m);break;
    case 'state': applyState(m.p);break;
    case 'correct': P.x=m.x;P.y=m.y;P.z=m.z;break;
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

// 라운드 시작: 팀 공개 → 카운트다운 → 경기
function startRound(m){
  const mp=MAPS[m.map];loadMap(mp);clearOthers();
  myTeam=m.teams[myId].team;cm.color.set(tcol(myTeam));gun.material.color.set(tcol(myTeam));   // 1인칭 총도 팀 색으로
  const sp=m.spawns[myId];P.x=sp[0];P.z=sp[1];P.y=0;P.vy=0;P.pitch=0;P.yaw=sp[1]>0?0:Math.PI;fly=false;
  Object.entries(m.teams).forEach(([id,t])=>{if(+id!==myId)others[id]=makeOther(+id,t.team,t.nick,m.spawns[id])});
  const names=t=>Object.values(m.teams).filter(x=>x.team===t).map(x=>x.nick).join(', ');
  show(null);$('#vote').style.display='none';$('#lobby').style.display='none';
  mode='reveal';big(`당신은 ${tname(myTeam)}`,`레드: ${names('red')}  |  블루: ${names('blue')}`,thex(myTeam));
  const me=$('#me');me.replaceChildren(document.createTextNode(nick+' · '+tname(myTeam)));me.style.color=thex(myTeam);
  if(dev){const b=document.createElement('i');b.className='badge';b.textContent='개발자';me.append(b)}
  ['#help','#right'].forEach(s=>$(s).style.display='');$('#back').style.display=hostId===myId?'':'none';
}
function leaveGame(){mode='lobby';clearOthers();big('');clearInterval(timerI);myTeam=null;tp=false;
  ['#help','#right','#back'].forEach(s=>$(s).style.display='none')}

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
  return {mesh,tx:sp[0],ty:0,tz:sp[1],tyaw:sp[1]>0?0:Math.PI};
}
function clearOthers(){for(const k in others){scene.remove(others[k].mesh);delete others[k]}}
function applyState(list){
  for(const [id,x,y,z,yaw] of list){const o=others[id];if(o){o.tx=x;o.ty=y;o.tz=z;o.tyaw=yaw}}
  for(const k in others)if(!list.some(p=>p[0]==k)){scene.remove(others[k].mesh);delete others[k]}   // 나간 사람 제거
}
function updateOthers(dt){
  const k=Math.min(1,dt*12);
  for(const id in others){const o=others[id],m=o.mesh;
    m.position.x+=(o.tx-m.position.x)*k;m.position.y+=(o.ty-m.position.y)*k;m.position.z+=(o.tz-m.position.z)*k;
    const d=((o.tyaw-m.rotation.y+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;m.rotation.y+=d*k}
}
function netTick(dt){sendT+=dt;if(sendT>=.05){sendT=0;send({t:'move',x:+P.x.toFixed(2),y:+P.y.toFixed(2),z:+P.z.toFixed(2),yaw:+P.yaw.toFixed(3),pitch:+P.pitch.toFixed(3)})}}

addEventListener('keydown',e=>{
  if(mode==='play'&&(e.code.startsWith('Arrow')||e.code==='Space'))e.preventDefault();
  keys[e.code]=true;
  if(mode==='play'){if(e.code==='KeyV')tp=!tp;if(e.code==='KeyF'&&dev){fly=!fly;P.vy=0}}
});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('resize',()=>{R.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()});
loadMap(MAPS[0]);$('#nick').focus();
