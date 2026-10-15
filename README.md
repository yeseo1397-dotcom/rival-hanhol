# Arena (2단계, 폴더 없는 버전)

파일이 전부 한 폴더에 있습니다. (index.html, game.js, maps.js, weapons.js, combat.js, room.js, config.js, server.js, package.json)

## 내 컴퓨터에서 실행
```
npm install
DEV_PASSWORD=원하는비밀번호 node server.js
```
(Windows PowerShell: `$env:DEV_PASSWORD="비밀번호"; node server.js`) 후 http://localhost:3000 접속

## Render에 올리기
- Build Command: `npm install`
- Start Command: `node server.js`
- Environment Variables: `DEV_PASSWORD` = 개발자 비밀번호

## 개발자 로그인
닉네임 `19` + 서버 환경변수 `DEV_PASSWORD`. 환경변수가 없으면 아무도 `19`로 로그인할 수 없습니다.

## 경기 규칙 (서버 환경변수로 조절 가능, 안 정하면 기본값)
- 5라운드 녹아웃: 한 라운드는 상대팀을 모두 처치하면 끝나요. 죽으면 그 라운드가 끝날 때까지 부활하지 않고, 다음 라운드에 체력 150으로 모두 새로 시작해요.
- 한 라운드는 `ROUND_SECS`(기본 120초). 시간이 끝나도 안 끝났으면 생존 인원 → 남은 체력 합계 순으로 승패를 정하고, 같으면 무승부예요.
- 5라운드(`ROUNDS`)를 모두 치른 뒤 라운드 승수가 많은 팀이 승리. 결과표에 개인별 킬/데스/헤드샷/피해량이 나와요.
- `NOKILL_SECS`(기본 120초) 동안 킬이 하나도 나오지 않으면 맵의 장애물이 모두 사라져요. 킬이 없는 시간은 라운드를 넘어서 누적돼요.
- 개발자(닉네임 19)는 대기실에서 "혼자 연습하기"로 다른 사람들과 상관없이 따로 게임할 수 있어요.
- 기타: `RESULT_SECS`(결과 화면 시간), `ROUND_END_SECS`, `VOTE_SECS`, `WEAPON_SECS`, `MAX_HP`
