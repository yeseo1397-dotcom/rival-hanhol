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
