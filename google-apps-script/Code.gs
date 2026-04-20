/**
 * 디바이스 대여/반납 관리 시스템 - Google Apps Script
 * 이 코드를 Google Spreadsheet의 Apps Script에 붙여넣으세요.
 */

// 스프레드시트 설정
const SHEET_NAME = '대여기록';
const DEVICE_SHEET_NAME = '디바이스목록';

// 스크립트 속성에서 값을 읽음 (프로젝트 설정 > 스크립트 속성에서 등록)
// - KAKAOWORK_WEBHOOK_URL: 카카오워크 Incoming Webhook URL
// - RENTAL_STATUS_URL: 알림 버튼이 열 대여 현황 페이지 URL (미설정 시 버튼 숨김)
function getConfig_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/**
 * 웹 앱 초기 설정 - GET 요청 처리
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: '디바이스 대여/반납 API가 정상 작동 중입니다.'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST 요청 처리 - 대여/반납 기록
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action; // 'rent' 또는 'return'

    let result;
    if (action === 'rent') {
      result = processRent(data);
    } else if (action === 'return') {
      result = processReturn(data);
    } else if (action === 'getDeviceInfo') {
      result = getDeviceInfo(data.deviceId);
    } else if (action === 'getStatus') {
      result = getAllDeviceStatus();
    } else {
      result = { success: false, message: '알 수 없는 액션입니다.' };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: '오류가 발생했습니다: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 대여 처리
 */
function processRent(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  // 시트가 없으면 생성
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // 헤더 추가
    sheet.getRange(1, 1, 1, 7).setValues([[
      '번호', '디바이스ID', '디바이스명', '대여자', '셀', '대여일시', '반납일시'
    ]]);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const deviceName = data.deviceName || data.deviceId;

  // 현재 대여 중인지 확인
  const currentRental = findCurrentRental(data.deviceId);
  if (currentRental.isRented) {
    return {
      success: false,
      message: `이 디바이스는 현재 ${currentRental.renter}님이 대여 중입니다. (${currentRental.rentDate})`
    };
  }

  // 새 행 번호 계산
  const lastRow = sheet.getLastRow();
  const newRowNum = lastRow; // 헤더 제외한 행 수

  // 현재 시간
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  // 새 행 추가
  sheet.appendRow([
    newRowNum,
    data.deviceId,
    deviceName,
    data.renterName,
    data.cell,
    dateStr,
    ''  // 반납일시는 비워둠
  ]);

  sendKakaoWorkNotification('rent', {
    deviceName: deviceName,
    renterName: data.renterName,
    cell: data.cell,
    rentDate: dateStr
  });

  return {
    success: true,
    message: `${deviceName} 대여가 완료되었습니다.`,
    data: {
      deviceId: data.deviceId,
      deviceName: deviceName,
      renterName: data.renterName,
      cell: data.cell,
      rentDate: dateStr
    }
  };
}

/**
 * 반납 처리
 */
function processReturn(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return { success: false, message: '대여 기록이 없습니다.' };
  }

  // 현재 대여 중인 행 찾기
  const currentRental = findCurrentRental(data.deviceId);

  if (!currentRental.isRented) {
    return { success: false, message: '이 디바이스는 현재 대여 중이 아닙니다.' };
  }

  // 반납일시 기록
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  sheet.getRange(currentRental.row, 7).setValue(dateStr);

  sendKakaoWorkNotification('return', {
    deviceName: currentRental.deviceName,
    renterName: currentRental.renter,
    cell: currentRental.cell,
    rentDate: currentRental.rentDate,
    returnDate: dateStr
  });

  return {
    success: true,
    message: `${currentRental.deviceName} 반납이 완료되었습니다.`,
    data: {
      deviceId: data.deviceId,
      deviceName: currentRental.deviceName,
      renterName: currentRental.renter,
      rentDate: currentRental.rentDate,
      returnDate: dateStr
    }
  };
}

/**
 * 현재 대여 중인 기록 찾기
 */
function findCurrentRental(deviceId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return { isRented: false };
  }

  const data = sheet.getDataRange().getValues();

  // 아래서부터 위로 검색 (최신 기록부터)
  for (let i = data.length - 1; i >= 1; i--) {
    const rowDeviceId = String(data[i][1]).trim();
    const returnDate = data[i][6];

    // 반납일시가 비어있는지 확인 (빈 문자열, null, undefined 모두 체크)
    const isNotReturned = !returnDate || String(returnDate).trim() === '';

    if (rowDeviceId === String(deviceId).trim() && isNotReturned) {
      // 디바이스ID가 일치하고 반납일시가 비어있으면 대여 중
      return {
        isRented: true,
        row: i + 1,
        deviceName: data[i][2],
        renter: data[i][3],
        cell: data[i][4],
        rentDate: data[i][5]
      };
    }
  }

  return { isRented: false };
}

/**
 * 디바이스 정보 가져오기
 */
function getDeviceInfo(deviceId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DEVICE_SHEET_NAME);

  // 디바이스 목록 시트가 없으면 생성
  if (!sheet) {
    sheet = ss.insertSheet(DEVICE_SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([['디바이스ID', '디바이스명', '설명']]);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    sheet.setFrozenRows(1);

    // 샘플 데이터 추가
    sheet.getRange(2, 1, 3, 3).setValues([
      ['DEV001', 'iPhone 15 Pro', '테스트용 iOS 디바이스'],
      ['DEV002', 'Galaxy S24', '테스트용 Android 디바이스'],
      ['DEV003', 'iPad Pro 12.9', '테스트용 태블릿']
    ]);

    return { success: false, message: '디바이스 목록이 생성되었습니다. 디바이스를 등록해주세요.' };
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === deviceId) {
      return {
        success: true,
        deviceId: data[i][0],
        deviceName: data[i][1],
        description: data[i][2]
      };
    }
  }

  return { success: false, message: '등록되지 않은 디바이스입니다.', deviceId: deviceId };
}

/**
 * 현재 대여 현황 조회
 */
function getCurrentRentals() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return { success: true, rentals: [] };
  }

  const data = sheet.getDataRange().getValues();
  const rentals = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][6] === '') {
      rentals.push({
        deviceId: data[i][1],
        deviceName: data[i][2],
        renter: data[i][3],
        cell: data[i][4],
        rentDate: data[i][5]
      });
    }
  }

  return { success: true, rentals: rentals };
}

/**
 * 시트 값을 읽되, 병합된 셀의 값을 병합 범위 내 모든 셀로 펼쳐서 반환
 */
function getExpandedValues(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  const mergedRanges = range.getMergedRanges();
  const baseRow = range.getRow();
  const baseCol = range.getColumn();

  for (const mr of mergedRanges) {
    const rOffset = mr.getRow() - baseRow;
    const cOffset = mr.getColumn() - baseCol;
    const numRows = mr.getNumRows();
    const numCols = mr.getNumColumns();
    const value = values[rOffset][cOffset];

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        values[rOffset + r][cOffset + c] = value;
      }
    }
  }
  return values;
}

/**
 * 전체 디바이스 현황 조회 (대여 중 + 미대여 디바이스 모두)
 */
function getAllDeviceStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rentSheet = ss.getSheetByName(SHEET_NAME);
  const deviceSheet = ss.getSheetByName(DEVICE_SHEET_NAME);

  const devices = [];
  const rentedMap = {};

  // 대여 기록에서 현재 대여 중인 디바이스 수집
  if (rentSheet) {
    const rentData = rentSheet.getDataRange().getValues();
    for (let i = 1; i < rentData.length; i++) {
      const deviceId = String(rentData[i][1]).trim();
      const returnDate = rentData[i][6];
      const isNotReturned = !returnDate || String(returnDate).trim() === '';

      if (isNotReturned && deviceId) {
        rentedMap[deviceId] = {
          deviceId: deviceId,
          deviceName: rentData[i][2],
          renter: rentData[i][3],
          cell: rentData[i][4],
          rentDate: rentData[i][5],
          status: 'rented'
        };
      }
    }
  }

  // 디바이스 목록 시트에서 전체 디바이스 수집 (병합 셀 펼쳐서 읽기)
  // A열: 카테고리 (예: 애플(33개)), B열: 디바이스명 — 디바이스명을 식별자로 사용
  if (deviceSheet) {
    const devData = getExpandedValues(deviceSheet);
    for (let i = 1; i < devData.length; i++) {
      const category = String(devData[i][0]).trim();
      const deviceName = String(devData[i][1]).trim();
      if (!deviceName) continue;

      const deviceId = deviceName;

      if (rentedMap[deviceId]) {
        const r = rentedMap[deviceId];
        r.category = category;
        devices.push(r);
        delete rentedMap[deviceId];
      } else {
        devices.push({
          deviceId: deviceId,
          deviceName: deviceName,
          category: category,
          renter: '',
          cell: '',
          rentDate: '',
          status: 'available'
        });
      }
    }
  }

  // 디바이스 목록에 없지만 대여 중인 디바이스도 포함
  for (const id in rentedMap) {
    devices.push(rentedMap[id]);
  }

  return { success: true, devices: devices };
}

/**
 * 카카오워크 Incoming Webhook 알림 전송 (Block Kit)
 */
function sendKakaoWorkNotification(action, info) {
  const webhookUrl = getConfig_('KAKAOWORK_WEBHOOK_URL');
  if (!webhookUrl) return;
  const rentalStatusUrl = getConfig_('RENTAL_STATUS_URL');

  const formatDate = (v) => {
    if (!v) return '-';
    if (v instanceof Date) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
    return String(v);
  };

  const rentDateStr = formatDate(info.rentDate);
  const returnDateStr = formatDate(info.returnDate);

  const isRent = action === 'rent';
  const headerText = isRent ? '디바이스 대여' : '디바이스 반납';
  const fallbackText = isRent
    ? `[대여] ${info.deviceName} — ${info.renterName} (${info.cell})`
    : `[반납] ${info.deviceName} — ${info.renterName}`;

  const descriptions = [
    { type: 'description', term: '디바이스', content: { type: 'text', text: String(info.deviceName), markdown: false }, accent: true },
    { type: 'description', term: isRent ? '대여자' : '반납자', content: { type: 'text', text: String(info.renterName), markdown: false }, accent: true },
    { type: 'description', term: '셀', content: { type: 'text', text: String(info.cell || '-'), markdown: false }, accent: true },
    { type: 'description', term: '대여일시', content: { type: 'text', text: rentDateStr, markdown: false }, accent: true }
  ];

  if (!isRent) {
    descriptions.push({
      type: 'description',
      term: '반납일시',
      content: { type: 'text', text: returnDateStr, markdown: false },
      accent: true
    });
  }

  const blocks = [
    { type: 'header', text: headerText, style: isRent ? 'blue' : 'yellow' },
    { type: 'divider' },
    ...descriptions
  ];

  if (rentalStatusUrl) {
    blocks.push({
      type: 'button',
      text: '대여 현황 보기',
      style: 'default',
      action_type: 'open_system_browser',
      value: rentalStatusUrl
    });
  }

  const payload = { text: fallbackText, blocks: blocks };

  try {
    const response = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    Logger.log('KakaoWork webhook status: ' + response.getResponseCode());
    Logger.log('KakaoWork webhook body: ' + response.getContentText());
  } catch (err) {
    Logger.log('KakaoWork webhook failed: ' + err);
  }
}

/**
 * 웹훅 디버깅용 - Apps Script 에디터에서 직접 실행
 * 1) testKakaoWorkPlain — 단순 text만 전송 (가장 기본)
 * 2) testKakaoWorkBlocks — Block Kit 전송
 * 실행 후 '실행 기록(Executions)'에서 상태코드/응답 확인
 */
function testKakaoWorkPlain() {
  const webhookUrl = getConfig_('KAKAOWORK_WEBHOOK_URL');
  if (!webhookUrl) {
    Logger.log('KAKAOWORK_WEBHOOK_URL 스크립트 속성이 설정되지 않았습니다.');
    return;
  }
  const res = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: JSON.stringify({ text: '디바이스 알림 테스트 (plain)' }),
    muteHttpExceptions: true
  });
  Logger.log('status=' + res.getResponseCode() + ' body=' + res.getContentText());
}

function testKakaoWorkBlocks() {
  sendKakaoWorkNotification('rent', {
    deviceName: '테스트 디바이스',
    renterName: '홍길동',
    cell: '1셀',
    rentDate: '2026-04-20 10:00:00'
  });
}

/**
 * 초기 설정 함수 - 처음 한 번만 실행
 */
function initialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 대여기록 시트 생성
  let rentSheet = ss.getSheetByName(SHEET_NAME);
  if (!rentSheet) {
    rentSheet = ss.insertSheet(SHEET_NAME);
    rentSheet.getRange(1, 1, 1, 7).setValues([[
      '번호', '디바이스ID', '디바이스명', '대여자', '셀', '대여일시', '반납일시'
    ]]);
    rentSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    rentSheet.setFrozenRows(1);

    // 열 너비 조정
    rentSheet.setColumnWidth(1, 60);
    rentSheet.setColumnWidth(2, 100);
    rentSheet.setColumnWidth(3, 150);
    rentSheet.setColumnWidth(4, 100);
    rentSheet.setColumnWidth(5, 60);
    rentSheet.setColumnWidth(6, 160);
    rentSheet.setColumnWidth(7, 160);
  }

  // 디바이스목록 시트 생성
  let deviceSheet = ss.getSheetByName(DEVICE_SHEET_NAME);
  if (!deviceSheet) {
    deviceSheet = ss.insertSheet(DEVICE_SHEET_NAME);
    deviceSheet.getRange(1, 1, 1, 3).setValues([['디바이스ID', '디바이스명', '설명']]);
    deviceSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    deviceSheet.setFrozenRows(1);

    // 열 너비 조정
    deviceSheet.setColumnWidth(1, 120);
    deviceSheet.setColumnWidth(2, 200);
    deviceSheet.setColumnWidth(3, 300);
  }

  SpreadsheetApp.getUi().alert('초기 설정이 완료되었습니다!');
}
