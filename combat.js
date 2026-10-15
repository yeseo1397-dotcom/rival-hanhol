// 전투 규칙 (서버와 미리보기 가상서버가 같은 코드를 사용): 발사 판정, 피해, 사망, 5초 부활, 킬 집계
(function(){
function create(o){
  const m=o.map,S=m.size,hh=S/2+.5,WP=o.weapons,now=o.now||Date.now,emit=(to,msg)=>o.emit(to,msg),r2=v=>+v.toFixed(2);
  const walls=[[0,-hh,S+2,1,8],[0,hh,S+2,1,8],[-hh,0,1,S+2,8],[hh,0,1,S+2,8]];
  const conv=a=>a.map(([x,z,w,d,top,c,y0=0])=>({a:[x-w/2,y0,z-d/2],b:[x+w/2,top,z+d/2]}));
  let bx=conv(m.boxes.concat(walls));
  const clearObstacles=()=>{bx=conv(walls)};            // 맵 바깥 벽만 남기고 장애물을 모두 없앰
  const MAXHP=o.maxHp||150;
  const score={red:0,blue:0},wOf=e=>WP.find(w=>w.id===e.weapon);

  function rayBox(O,D){                       // 광선이 벽/상자에 처음 닿는 거리
    let best=Infinity;
    for(const b of bx){let t0=0,t1=Infinity,ok=true;
      for(let i=0;i<3&&ok;i++){
        if(Math.abs(D[i])<1e-9){if(O[i]<b.a[i]||O[i]>b.b[i])ok=false}
        else{let u=(b.a[i]-O[i])/D[i],v=(b.b[i]-O[i])/D[i];if(u>v)[u,v]=[v,u];t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>t1)ok=false}}
      if(ok&&t0<best)best=t0}
    return best}
  function hitEnt(O,D,e){                     // 몸통(원기둥) 또는 머리(구)에 맞는지
    let tc=null,ts=null;
    const ox=O[0]-e.x,oz=O[2]-e.z,a=D[0]*D[0]+D[2]*D[2];
    if(a>1e-9){const b=2*(ox*D[0]+oz*D[2]),c=ox*ox+oz*oz-.16,disc=b*b-4*a*c;
      if(disc>=0){const sq=Math.sqrt(disc);
        for(const t of [(-b-sq)/(2*a),(-b+sq)/(2*a)]){if(t>0){const y=O[1]+D[1]*t;if(y>=e.y&&y<=e.y+1.4){tc=t;break}}}}}
    const sx=O[0]-e.x,sy=O[1]-(e.y+1.65),sz=O[2]-e.z,b2=sx*D[0]+sy*D[1]+sz*D[2],d2=b2*b2-(sx*sx+sy*sy+sz*sz-.0676);
    if(d2>=0){const t=-b2-Math.sqrt(d2);if(t>0)ts=t}
    if(tc===null&&ts===null)return null;
    if(ts!==null&&(tc===null||ts<=tc))return{t:ts,head:true};
    return{t:tc,head:false}}

  function init(e){const w=wOf(e);Object.assign(e,{hp:MAXHP,alive:true,inv:0,kills:0,deaths:0,heads:0,dmg:0,cd:0,reloadUntil:0,ammo:w?w.mag:0})}
  const flags=e=>(e.alive?1:0)|(now()<e.inv?2:0);
  function start(){
    o.ents().forEach(init);
    o.ents().forEach(e=>{const w=wOf(e);emit(e,{t:'hp',hp:MAXHP,max:MAXHP,dmg:0});if(w)emit(e,{t:'ammo',a:w.mag,m:w.mag,r:0})})}

  function shoot(e,msg){
    const w=wOf(e),t=now();
    if(!w||!e.alive||t<e.cd||e.ammo<=0||t<e.reloadUntil)return false;
    e.cd=t+w.delay*850;                                        // 발사 간격 검증(약간의 여유)
    e.ammo=Math.max(0,e.ammo-(w.id==='burst'?3:1));
    const near=Math.hypot((+msg.x||0)-e.x,(+msg.z||0)-e.z)<2;  // 클라이언트 위치가 서버 기록과 가까우면 그대로 사용
    const px=near?+msg.x:e.x,py=near?Math.max(0,+msg.y||0):e.y,pz=near?+msg.z:e.z;
    const yaw=+msg.yaw||0,pit=Math.max(-1.5,Math.min(1.5,+msg.pitch||0));
    const O=[px,py+1.6,pz],base=[-Math.sin(yaw)*Math.cos(pit),Math.sin(pit),-Math.cos(yaw)*Math.cos(pit)];
    const rg=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-rg[2]*base[1],rg[2]*base[0]-rg[0]*base[2],rg[0]*base[1]];
    const tan=Math.tan(w.spread*Math.PI/180),dm=new Map(),ends=[];
    for(let i=0;i<w.pellets;i++){
      const r=Math.sqrt(Math.random())*tan,a=Math.random()*6.283,sx=Math.cos(a)*r,sy=Math.sin(a)*r;
      let D=[0,1,2].map(k=>base[k]+rg[k]*sx+up[k]*sy);const L=Math.hypot(D[0],D[1],D[2]);D=D.map(v=>v/L);
      let tw=Math.min(rayBox(O,D),120),hit=null;
      for(const v of o.ents()){
        if(v===e||!v.alive||v.team===e.team||t<v.inv)continue;  // 아군/사망자/무적은 맞지 않음
        const h=hitEnt(O,D,v);if(h&&h.t<tw){tw=h.t;hit={v,head:h.head}}}
      ends.push([0,1,2].map(k=>r2(O[k]+D[k]*tw)));
      if(hit){const c=dm.get(hit.v)||{d:0,head:false};c.d+=w.dmg*(hit.head?2:1);c.head=c.head||hit.head;dm.set(hit.v,c)}}
    emit('all',{t:'shot',id:e.id,from:O.map(r2),ends,team:e.team});
    emit(e,{t:'ammo',a:e.ammo,m:w.mag,r:0});
    let kill=false,head=false;
    for(const [v,c] of dm){if(damage(e,v,c.d,c.head))kill=true;head=head||c.head}
    if(dm.size)emit(e,{t:'hit',head:head?1:0,kill:kill?1:0});
    if(e.ammo===0)reload(e);
    return true}

  function damage(a,v,d,head){
    a.dmg+=Math.min(d,v.hp);v.hp-=d;emit(v,{t:'hp',hp:Math.max(0,v.hp),max:MAXHP,dmg:d});
    if(v.hp>0)return false;
    v.alive=false;v.hp=0;v.deaths++;a.kills++;if(head)a.heads++;score[a.team]++;
    emit('all',{t:'kill',k:a.id,v:v.id,head:head?1:0});
    emit(v,{t:'died',by:a.id,secs:0});                       // 녹아웃: 이번 라운드가 끝날 때까지 부활하지 않음
    if(o.respawnMs>0)o.later(o.respawnMs,()=>respawn(v));
    if(o.onKill)o.onKill(a,v,score);
    return true}

  function respawn(e){                         // 5초 뒤, 적에게서 먼 스폰 중 무작위
    const foes=o.ents().filter(v=>v!==e&&v.alive&&v.team!==e.team);
    const ranked=o.spawns.map(s=>[foes.length?Math.min(...foes.map(v=>Math.hypot(v.x-s[0],v.z-s[1]))):0,s]).sort((p,q)=>q[0]-p[0]);
    const s=ranked[Math.floor(Math.random()*Math.min(3,ranked.length))][1],w=wOf(e);
    Object.assign(e,{x:s[0],y:0,z:s[1],yaw:s[1]>0?0:Math.PI,hp:MAXHP,alive:true,inv:now()+2000,ammo:w?w.mag:0,reloadUntil:0});
    emit(e,{t:'respawn',x:e.x,y:0,z:e.z,yaw:e.yaw});emit(e,{t:'hp',hp:MAXHP,max:MAXHP,dmg:0});
    if(w)emit(e,{t:'ammo',a:w.mag,m:w.mag,r:0})}

  function resetRound(){                       // 새 라운드: 전원 체력/탄약 회복 (위치는 서버가 미리 지정)
    o.ents().forEach(e=>{const w=wOf(e);Object.assign(e,{hp:MAXHP,alive:true,inv:0,cd:0,reloadUntil:0,ammo:w?w.mag:0});
      emit(e,{t:'respawn',x:e.x,y:0,z:e.z,yaw:e.yaw});emit(e,{t:'hp',hp:MAXHP,max:MAXHP,dmg:0});if(w)emit(e,{t:'ammo',a:w.mag,m:w.mag,r:0})})}

  function reload(e){
    const w=wOf(e),t=now();
    if(!w||!e.alive||t<e.reloadUntil||e.ammo>=w.mag)return;
    e.reloadUntil=t+w.reload*1000;emit(e,{t:'ammo',a:e.ammo,m:w.mag,r:1});
    o.later(w.reload*1000,()=>{if(e.alive&&e.reloadUntil&&now()>=e.reloadUntil-5){e.ammo=w.mag;e.reloadUntil=0;emit(e,{t:'ammo',a:w.mag,m:w.mag,r:0})}})}

  return{score,start,shoot,reload,flags,respawn,resetRound,clearObstacles}
}
const api={create};
if(typeof module!=='undefined')module.exports=api;else window.Combat=api;
})();
