# Arena (2단계, 폴더 없는 버전)

파일이 전부 한 폴더에 있습니다. (index.html, game.js, maps.js, weapons.js, combat.js, config.js, server.js, package.json)

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
- 먼저 5킬을 한 팀이 승리. 5킬이 안 나오면 `ROUND_SECS`(기본 180초)가 끝났을 때 킬이 더 많은 팀이 승리(같으면 무승부)
- `NOKILL_SECS`(기본 120초) 동안 킬이 하나도 나오지 않으면 맵의 장애물이 모두 사라짐
- 경기가 끝나면 결과(승리 팀, 개인별 킬/데스)를 보여주고 10초 뒤 모두 대기실로 이동
