# 디바이스 대여/반납 시스템 설정 가이드

## 1. Google Spreadsheet 설정

### 1-1. 새 스프레드시트 생성
1. [Google Sheets](https://sheets.google.com)에 접속
2. **빈 스프레드시트** 생성
3. 스프레드시트 이름을 "디바이스 대여 관리"로 변경

### 1-2. Apps Script 설정
1. 메뉴에서 **확장 프로그램 > Apps Script** 클릭
2. 기존 코드를 모두 삭제
3. `google-apps-script/Code.gs` 파일 내용을 붙여넣기
4. **저장** (Ctrl + S)
5. **함수 선택** 드롭다운에서 `initialSetup` 선택 후 **실행**
6. 권한 승인 팝업이 뜨면 승인

### 1-3. 웹 앱 배포
1. Apps Script 편집기에서 **배포 > 새 배포** 클릭
2. **유형 선택** 옆 톱니바퀴 > **웹 앱** 선택
3. 설정:
   - **설명**: 디바이스 대여 API
   - **다음 사용자 인증 정보로 실행**: 나
   - **액세스 권한이 있는 사용자**: 모든 사용자
4. **배포** 클릭
5. **웹 앱 URL 복사** (중요!)

예시 URL:
```
https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxx/exec
```

---

## 2. 웹 프론트엔드 설정

### 2-1. API URL 설정
1. `js/config.js` 파일 열기
2. `API_URL` 값을 복사한 웹 앱 URL로 변경:

```javascript
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
    // ...
};
```

### 2-2. 웹 호스팅 (선택지)

#### 옵션 A: GitHub Pages (무료, 추천)
1. GitHub 저장소 생성
2. 모든 파일 업로드
3. Settings > Pages > Source: main branch
4. URL: `https://username.github.io/repository-name`

#### 옵션 B: 로컬 서버
```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve
```
브라우저에서 `http://localhost:8000` 접속

#### 옵션 C: Netlify (무료)
1. [Netlify](https://netlify.com) 가입
2. 폴더를 드래그 앤 드롭으로 배포

> **중요**: QR 스캔(카메라)은 HTTPS 환경에서만 작동합니다!
> localhost는 예외적으로 HTTP에서도 작동합니다.

---

## 3. 디바이스 QR 코드 생성

### 3-1. QR 코드 생성
1. `qr-generator.html` 파일을 브라우저에서 열기
2. 디바이스 ID와 이름 입력
3. QR 코드 생성 및 다운로드

### 3-2. 일괄 생성
여러 디바이스를 한 번에 생성할 수 있습니다:
```
DEV001,iPhone 15 Pro
DEV002,Galaxy S24
DEV003,iPad Pro 12.9
```

### 3-3. QR 코드 부착
- 생성된 QR 코드를 인쇄
- 디바이스 뒷면에 부착
- 권장 크기: 2cm x 2cm 이상

---

## 4. 디바이스 목록 등록

스프레드시트의 **"디바이스목록"** 시트에 디바이스 정보 입력:

| 디바이스ID | 디바이스명 | 설명 |
|-----------|-----------|------|
| DEV001 | iPhone 15 Pro | iOS 테스트용 |
| DEV002 | Galaxy S24 | Android 테스트용 |

---

## 5. 사용 방법

### 대여하기
1. 웹 앱 접속
2. **대여** 버튼 클릭
3. 셀 선택 (1셀/2셀)
4. 이름 입력
5. QR 코드 스캔
6. 완료!

### 반납하기
1. 웹 앱 접속
2. **반납** 버튼 클릭
3. QR 코드 스캔
4. 완료!

---

## 6. 스프레드시트 구조

### 대여기록 시트
| 번호 | 디바이스ID | 디바이스명 | 대여자 | 셀 | 대여일시 | 반납일시 |
|-----|-----------|-----------|--------|-----|---------|---------|
| 1 | DEV001 | iPhone 15 | 홍길동 | 1셀 | 2026-01-26 10:00 | 2026-01-26 18:00 |
| 2 | DEV002 | Galaxy S24 | 김철수 | 2셀 | 2026-01-26 11:00 | |

- 반납일시가 비어있으면 = 현재 대여 중
- 모든 기록이 히스토리로 유지됨

---

## 7. 문제 해결

### 카메라가 작동하지 않음
- HTTPS 환경인지 확인
- 브라우저 카메라 권한 확인
- 다른 앱에서 카메라 사용 중인지 확인

### API 연결 실패
- config.js의 API_URL이 올바른지 확인
- Apps Script가 웹 앱으로 배포되었는지 확인
- 접근 권한이 "모든 사용자"로 설정되었는지 확인

### QR 코드 인식 안됨
- 조명이 충분한지 확인
- QR 코드가 깨끗한지 확인
- 카메라와 QR 코드 거리 조절

---

## 8. 비용

| 항목 | 비용 |
|-----|-----|
| Google Spreadsheet | 무료 |
| Google Apps Script | 무료 |
| GitHub Pages 호스팅 | 무료 |
| QR 코드 생성 | 무료 |
| html5-qrcode 라이브러리 | 무료 (MIT) |

**총 비용: 0원**

---

## 9. 파일 구조

```
Device/
├── index.html              # 메인 웹 앱
├── qr-generator.html       # QR 코드 생성 도구
├── SETUP_GUIDE.md          # 이 문서
├── css/
│   └── style.css           # 스타일시트
├── js/
│   ├── config.js           # 설정 파일
│   └── app.js              # 메인 로직
└── google-apps-script/
    └── Code.gs             # Google Apps Script 코드
```
