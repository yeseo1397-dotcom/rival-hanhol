// 전투 규칙 (서버와 미리보기 가상서버가 같은 코드를 사용): 발사 판정, 피해, 사망(녹아웃), 무기 슬롯 교체, 탄약/재장전
(function(){
function create(o){
  const m=o.map,S=m.size,hh=S/2+.5,WP=o.weapons,now=o.now||Date.now,emit=(to,msg)=>o.emit(to,msg),r2=v=>+v.toFixed(2);
  const MAXHP=o.maxHp||150,SLOTS=['main','side','melee'];
  const walls=[[0,-hh,S+2,1,8],[0,hh,S+2,1,8],[-hh,0,1,S+2,8],[hh,0,1,S+2,8]];
  const conv=a=>a.map(([x,z,w,d,top,c,y0=0])=>({a:[x-w/2,y0,z-d/2],b:[x+w/2,top,z+d/2]}));
  let bx=conv(m.boxes.concat(walls));
  const clearObstacles=()=>{bx=conv(walls)};            // 맵 바깥 벽만 남기고 장애물을 모두 없앰
  const score={red:0,blue:0},wOf=e=>WP.find(w=>w.id===e.weapon),byId=id=>WP.find(w=>w.id===id);

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

  // 지연 보정: 상대 위치를 최근 0.7초 동안 기록해 두고, 쏜 사람이 본 시점의 위치로 맞았는지 판정 (쏘자마자 맞는 느낌)
  const hist=new Map();
  function record(){const t=now();for(const e of o.ents()){let h=hist.get(e.id);if(!h){h=[];hist.set(e.id,h)}h.push([t,e.x,e.y,e.z]);while(h.length&&h[0][0]<t-700)h.shift()}}
  function posAt(e,tt){
    const h=hist.get(e.id);if(!h||!h.length||tt>=h[h.length-1][0])return e;
    if(tt<=h[0][0])return{x:h[0][1],y:h[0][2],z:h[0][3]};
    for(let i=h.length-1;i>0;i--)if(h[i-1][0]<=tt){const a=h[i-1],b=h[i],k=(tt-a[0])/Math.max(1,b[0]-a[0]);
      return{x:a[1]+(b[1]-a[1])*k,y:a[2]+(b[2]-a[2])*k,z:a[3]+(b[3]-a[3])*k}}
    return e}

  // ---------- 무기 슬롯 / 탄약 ----------
  const ammoMsg=e=>{const w=wOf(e);if(!w)return;
    emit(e,{t:'ammo',a:e.ammo,m:w.melee?0:w.mag,res:e.reserve,r:now()<e.reloadUntil?1:0,inf:w.melee?1:0})};
  function stockInit(e){                      // 슬롯마다 탄창/여분 탄약을 따로 가짐
    e.stock={};const L=e.loadout||{};
    for(const s of SLOTS){const w=byId(L[s]);e.stock[s]=w?{a:w.melee?0:w.mag,res:w.melee?0:(w.reserve!=null?w.reserve:w.mag*3)}:null}
    e.slot='main';if(L.main)e.weapon=L.main;const st=e.stock.main;e.ammo=st?st.a:0;e.reserve=st?st.res:0}
  const saveStock=e=>{if(e.stock&&e.stock[e.slot]){e.stock[e.slot].a=e.ammo;e.stock[e.slot].res=e.reserve}};
  function revive(e){
    Object.assign(e,{hp:MAXHP,alive:true,inv:0,cd:0,reloadUntil:0});stockInit(e);
    emit(e,{t:'hp',hp:MAXHP,max:MAXHP,dmg:0});
    if(wOf(e)){emit(e,{t:'equip',slot:e.slot,id:e.weapon});ammoMsg(e)}}
  function init(e){Object.assign(e,{kills:0,deaths:0,heads:0,dmg:0});revive(e)}
  const flags=e=>(e.alive?1:0)|(now()<e.inv?2:0);
  const start=()=>o.ents().forEach(init);
  function resetRound(){hist.clear();o.ents().forEach(e=>{revive(e);emit(e,{t:'respawn',x:e.x,y:0,z:e.z,yaw:e.yaw})})}
  function equip(e,slot){                     // 무기 교체 (0.35초 동안 발사 불가, 재장전은 취소)
    if(!e.alive||!e.stock||!e.stock[slot]||slot===e.slot)return false;
    saveStock(e);e.slot=slot;e.weapon=e.loadout[slot];const st=e.stock[slot];
    e.ammo=st.a;e.reserve=st.res;e.reloadUntil=0;e.cd=now()+350;
    emit(e,{t:'equip',slot,id:e.weapon});ammoMsg(e);return true}

  function shoot(e,msg){
    const w=wOf(e),t=now(),mel=w&&w.melee;
    if(!w||!e.alive||t<e.cd)return false;
    if(!mel&&(e.ammo<=0||t<e.reloadUntil))return false;
    e.cd=t+w.delay*850;                                        // 발사 간격 검증(약간의 여유)
    if(!mel)e.ammo=Math.max(0,e.ammo-(w.id==='burst'?3:1));
    const near=Math.hypot((+msg.x||0)-e.x,(+msg.z||0)-e.z)<2;  // 클라이언트 위치가 서버 기록과 가까우면 그대로 사용
    const px=near?+msg.x:e.x,py=near?Math.max(0,+msg.y||0):e.y,pz=near?+msg.z:e.z;
    const yaw=+msg.yaw||0,pit=Math.max(-1.5,Math.min(1.5,+msg.pitch||0)),tt=t-Math.max(0,Math.min(250,+msg.lat||0));
    // 총알은 항상 조준점(화면 가운데)이 가리키는 방향, 눈 높이에서 나간다
    const O=[px,py+1.6,pz],base=[-Math.sin(yaw)*Math.cos(pit),Math.sin(pit),-Math.cos(yaw)*Math.cos(pit)];
    const rg=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-rg[2]*base[1],rg[2]*base[0]-rg[0]*base[2],rg[0]*base[1]];
    const tan=Math.tan(w.spread*Math.PI/180),dm=new Map(),ends=[],range=w.range||120;
    for(let i=0;i<w.pellets;i++){
      const r=Math.sqrt(Math.random())*tan,a=Math.random()*6.283,sx=Math.cos(a)*r,sy=Math.sin(a)*r;
      let D=[0,1,2].map(k=>base[k]+rg[k]*sx+up[k]*sy);const L=Math.hypot(D[0],D[1],D[2]);D=D.map(v=>v/L);
      let tw=Math.min(rayBox(O,D),range),hit=null;
      for(const v of o.ents()){
        if(v===e||!v.alive||v.team===e.team||t<v.inv)continue;  // 아군/사망자/무적은 맞지 않음
        const h=hitEnt(O,D,posAt(v,tt));if(h&&h.t<tw){tw=h.t;hit={v,head:h.head}}}
      ends.push([0,1,2].map(k=>r2(O[k]+D[k]*tw)));
      if(hit){const c=dm.get(hit.v)||{d:0,head:false};c.d+=w.dmg*(hit.head?2:1);c.head=c.head||hit.head;dm.set(hit.v,c)}}
    emit('all',{t:'shot',id:e.id,from:O.map(r2),ends,team:e.team,mel:mel?1:0});
    if(!mel)ammoMsg(e);
    let kill=false,head=false;
    for(const [v,c] of dm){if(damage(e,v,c.d,c.head))kill=true;head=head||c.head}
    if(dm.size)emit(e,{t:'hit',head:head?1:0,kill:kill?1:0});
    if(!mel&&e.ammo===0)reload(e);
    return true}

  function damage(a,v,d,head){
    a.dmg+=Math.min(d,v.hp);v.hp-=d;emit(v,{t:'hp',hp:Math.max(0,v.hp),max:MAXHP,dmg:d});
    if(v.hp>0)return false;
    v.alive=false;v.hp=0;v.deaths++;a.kills++;if(head)a.heads++;score[a.team]++;
    emit('all',{t:'kill',k:a.id,v:v.id,head:head?1:0});
    emit(v,{t:'died',by:a.id,secs:0});                       // 녹아웃: 이번 라운드가 끝날 때까지 부활하지 않음
    if(o.onKill)o.onKill(a,v,score);
    return true}

  function reload(e){
    const w=wOf(e),t=now();
    if(!w||w.melee||!e.alive||t<e.reloadUntil||e.ammo>=w.mag||e.reserve<=0)return;
    e.reloadUntil=t+w.reload*1000;ammoMsg(e);const slot=e.slot;
    o.later(w.reload*1000,()=>{
      if(!e.alive||e.slot!==slot||!e.reloadUntil||now()<e.reloadUntil-5)return;
      const take=Math.min(w.mag-e.ammo,e.reserve);e.ammo+=take;e.reserve-=take;e.reloadUntil=0;ammoMsg(e)})}

  return{score,start,shoot,reload,equip,flags,resetRound,clearObstacles,record}
}
const api={create};
if(typeof module!=='undefined')module.exports=api;else window.Combat=api;
})();
