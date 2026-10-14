// 무기 데이터: 서버와 클라이언트가 같은 파일을 사용합니다. (3단계에서 사격에 쓰이는 수치도 미리 넣어 두었어요)
// dmg=한 발 피해, pellets=한 번에 나가는 탄 수, delay=발사 간격(초), mag=탄창, reload=재장전(초), spread=탄퍼짐(도),
// speed=이동속도 배율, s=[화력,연사,정확,기동] 별점(1~5), gun=1인칭 총 크기 [가로,세로,길이]
(function(){
const W=[
 {id:'rifle',name:'돌격소총',cls:'만능',desc:'뭐든 무난하게 잘하는 기본 무기',dmg:22,pellets:1,delay:.11,mag:30,reload:1.6,spread:2.2,speed:1,s:[3,4,3,3],gun:[.08,.1,.5]},
 {id:'carbine',name:'카빈',cls:'경량',desc:'가볍고 빨라서 움직이며 싸우기 좋아요',dmg:18,pellets:1,delay:.09,mag:28,reload:1.4,spread:2.8,speed:1.06,s:[2,4,3,4],gun:[.07,.09,.42]},
 {id:'smg',name:'기관단총',cls:'근접',desc:'가까이서 쏟아붓는 연사력',dmg:14,pellets:1,delay:.06,mag:35,reload:1.3,spread:3.6,speed:1.1,s:[2,5,2,5],gun:[.07,.1,.34]},
 {id:'shotgun',name:'샷건',cls:'근접',desc:'코앞에서 맞으면 한 방에 쓰러져요',dmg:11,pellets:8,delay:.9,mag:6,reload:2.2,spread:7,speed:1,s:[5,1,1,3],gun:[.1,.1,.6]},
 {id:'sniper',name:'저격총',cls:'장거리',desc:'멀리서 정확하게, 한 방의 무게',dmg:90,pellets:1,delay:1.2,mag:5,reload:2.5,spread:.2,speed:.88,s:[5,1,5,1],gun:[.06,.08,.85]},
 {id:'dmr',name:'지정사수소총',cls:'중거리',desc:'두세 발이면 끝나는 정밀 반자동',dmg:45,pellets:1,delay:.45,mag:10,reload:1.9,spread:.8,speed:.96,s:[4,2,4,2],gun:[.07,.09,.65]},
 {id:'lmg',name:'경기관총',cls:'제압',desc:'큰 탄창으로 길목을 막아요. 무겁고 느려요',dmg:20,pellets:1,delay:.08,mag:80,reload:4.5,spread:3.2,speed:.85,s:[4,5,2,1],gun:[.1,.12,.6]},
 {id:'pistol',name:'권총',cls:'보조',desc:'빠르게 뽑고 가볍게 움직여요',dmg:28,pellets:1,delay:.25,mag:12,reload:1.1,spread:1.2,speed:1.08,s:[2,3,4,5],gun:[.05,.09,.22]},
 {id:'revolver',name:'리볼버',cls:'보조',desc:'맞추기만 하면 강력한 한 발',dmg:60,pellets:1,delay:.7,mag:6,reload:2,spread:.8,speed:1.04,s:[4,2,4,4],gun:[.06,.1,.28]},
 {id:'burst',name:'3점사 소총',cls:'중거리',desc:'세 발을 묶어 쏘는 정확한 소총',dmg:24,pellets:3,delay:.35,mag:30,reload:1.6,spread:1.4,speed:1,s:[4,3,4,3],gun:[.08,.1,.5]},
 {id:'crossbow',name:'석궁',cls:'특수',desc:'소리 없이 날아가는 강력한 한 발',dmg:75,pellets:1,delay:1,mag:1,reload:1.4,spread:0,speed:1,s:[5,1,5,3],gun:[.12,.08,.5]},
 {id:'beam',name:'레이저 빔',cls:'특수',desc:'빛줄기가 거의 흔들리지 않는 연속 사격',dmg:8,pellets:1,delay:.04,mag:100,reload:3,spread:.3,speed:.95,s:[3,5,5,2],gun:[.07,.07,.55]}
];
if(typeof module!=='undefined')module.exports=W;else window.WEAPONS=W;
})();
