// 무기 데이터: 서버와 클라이언트가 같은 파일을 사용합니다.
// slot: main(주무기) / side(보조무기) / melee(근접무기)
// dmg=한 발 피해, pellets=한 번에 나가는 탄 수, delay=발사 간격(초), mag=탄창, reload=재장전(초), spread=탄퍼짐(도), speed=이동속도 배율
// reserve=여분 탄약(안 적으면 탄창 3개), range=사거리(m, 근접무기), zoom=조준경 배율, s=[화력,연사,정확,기동] 별점, gun=1인칭 총 크기
(function(){
const W=[
 {id:'rifle',slot:'main',name:'돌격소총',cls:'만능',desc:'뭐든 무난하게 잘하는 기본 무기',dmg:22,pellets:1,delay:.11,mag:30,reload:1.6,spread:2.2,speed:1,zoom:1.8,s:[3,4,3,3],gun:[.08,.1,.5]},
 {id:'carbine',slot:'main',name:'카빈',cls:'경량',desc:'가볍고 빨라서 움직이며 싸우기 좋아요',dmg:18,pellets:1,delay:.09,mag:28,reload:1.4,spread:2.8,speed:1.06,zoom:1.6,s:[2,4,3,4],gun:[.07,.09,.42]},
 {id:'smg',slot:'main',name:'기관단총',cls:'근접',desc:'가까이서 쏟아붓는 연사력',dmg:14,pellets:1,delay:.06,mag:35,reload:1.3,spread:3.6,speed:1.1,zoom:1.4,s:[2,5,2,5],gun:[.07,.1,.34]},
 {id:'shotgun',slot:'main',name:'샷건',cls:'근접',desc:'코앞에서 맞으면 한 방에 쓰러져요',dmg:11,pellets:8,delay:.9,mag:6,reload:2.2,spread:7,speed:1,zoom:1.3,s:[5,1,1,3],gun:[.1,.1,.6]},
 {id:'sniper',slot:'main',name:'저격총',cls:'장거리',desc:'멀리서 정확하게, 한 방의 무게',dmg:90,pellets:1,delay:1.2,mag:5,reload:2.5,spread:.2,speed:.88,zoom:3.5,s:[5,1,5,1],gun:[.06,.08,.85]},
 {id:'dmr',slot:'main',name:'지정사수소총',cls:'중거리',desc:'두세 발이면 끝나는 정밀 반자동',dmg:45,pellets:1,delay:.45,mag:10,reload:1.9,spread:.8,speed:.96,zoom:2.5,s:[4,2,4,2],gun:[.07,.09,.65]},
 {id:'lmg',slot:'main',name:'경기관총',cls:'제압',desc:'큰 탄창으로 길목을 막아요. 무겁고 느려요',dmg:20,pellets:1,delay:.08,mag:80,reload:4.5,spread:3.2,speed:.85,zoom:1.5,s:[4,5,2,1],gun:[.1,.12,.6]},
 {id:'burst',slot:'main',name:'3점사 소총',cls:'중거리',desc:'세 발을 묶어 쏘는 정확한 소총',dmg:24,pellets:3,delay:.35,mag:30,reload:1.6,spread:1.4,speed:1,zoom:1.8,s:[4,3,4,3],gun:[.08,.1,.5]},
 {id:'crossbow',slot:'main',name:'석궁',cls:'특수',desc:'소리 없이 날아가는 강력한 한 발',dmg:75,pellets:1,delay:1,mag:1,reload:1.4,spread:0,speed:1,zoom:2.5,s:[5,1,5,3],gun:[.12,.08,.5]},
 {id:'beam',slot:'main',name:'레이저 빔',cls:'특수',desc:'빛줄기가 거의 흔들리지 않는 연속 사격',dmg:8,pellets:1,delay:.04,mag:100,reload:3,spread:.3,speed:.95,zoom:1.8,s:[3,5,5,2],gun:[.07,.07,.55]},
 {id:'pistol',slot:'side',name:'권총',cls:'보조',desc:'빠르게 뽑고 가볍게 움직여요',dmg:28,pellets:1,delay:.25,mag:12,reload:1.1,spread:1.2,speed:1.08,zoom:1.3,s:[2,3,4,5],gun:[.05,.09,.22]},
 {id:'revolver',slot:'side',name:'리볼버',cls:'보조',desc:'맞추기만 하면 강력한 한 발',dmg:60,pellets:1,delay:.7,mag:6,reload:2,spread:.8,speed:1.04,zoom:1.5,s:[4,2,4,4],gun:[.06,.1,.28]},
 {id:'machpistol',slot:'side',name:'기관권총',cls:'보조',desc:'작지만 빠르게 쏟아내는 연사',dmg:12,pellets:1,delay:.07,mag:20,reload:1.2,spread:4,speed:1.08,zoom:1.3,s:[2,5,2,5],gun:[.05,.09,.25]},
 {id:'handcannon',slot:'side',name:'핸드캐논',cls:'보조',desc:'반동이 크지만 두 발이면 쓰러져요',dmg:55,pellets:1,delay:.6,mag:7,reload:1.8,spread:1,speed:1.02,zoom:1.5,s:[5,2,3,4],gun:[.07,.1,.3]},
 {id:'knife',slot:'melee',name:'단검',cls:'근접',desc:'빠르게 휘두르는 가벼운 칼',melee:true,range:2.4,dmg:35,pellets:1,delay:.35,mag:0,reload:0,spread:0,speed:1.12,zoom:1,s:[2,5,5,5],gun:[.04,.05,.3]},
 {id:'axe',slot:'melee',name:'도끼',cls:'근접',desc:'느리지만 묵직한 한 방',melee:true,range:2.6,dmg:70,pellets:1,delay:.9,mag:0,reload:0,spread:0,speed:1.05,zoom:1,s:[4,2,4,4],gun:[.05,.08,.4]},
 {id:'spear',slot:'melee',name:'창',cls:'근접',desc:'멀리서 찌르는 긴 사거리',melee:true,range:3.6,dmg:50,pellets:1,delay:.7,mag:0,reload:0,spread:0,speed:1.02,zoom:1,s:[3,3,4,4],gun:[.04,.04,.7]}
];
if(typeof module!=='undefined')module.exports=W;else window.WEAPONS=W;
})();
