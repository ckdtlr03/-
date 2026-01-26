/**
 * 설정 파일
 * Google Apps Script 웹 앱 URL을 여기에 입력하세요.
 */

const CONFIG = {
    // Google Apps Script 웹 앱 URL (배포 후 생성되는 URL을 입력)
    // 예: 'https://script.google.com/macros/s/AKfycb.../exec'
    API_URL: 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE',

    // QR 스캐너 설정
    QR_SCANNER: {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    },

    // 메시지
    MESSAGES: {
        RENT_SUCCESS: '대여가 완료되었습니다!',
        RETURN_SUCCESS: '반납이 완료되었습니다!',
        ERROR_NO_NAME: '이름을 입력해주세요.',
        ERROR_API: 'API 연결에 실패했습니다. 설정을 확인해주세요.',
        ERROR_CAMERA: '카메라 접근에 실패했습니다. 권한을 확인해주세요.',
        ERROR_ALREADY_RENTED: '이 디바이스는 이미 대여 중입니다.',
        ERROR_NOT_RENTED: '이 디바이스는 현재 대여 중이 아닙니다.'
    }
};
