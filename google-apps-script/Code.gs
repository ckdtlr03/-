/**
 * 디바이스 대여/반납 관리 시스템 - Google Apps Script
 * 이 코드를 Google Spreadsheet의 Apps Script에 붙여넣으세요.
 */

// 스프레드시트 설정
const SHEET_NAME = '대여기록';
const DEVICE_SHEET_NAME = '디바이스목록';

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

  // 디바이스 이름: QR 코드에서 전달받은 값 우선 사용
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
