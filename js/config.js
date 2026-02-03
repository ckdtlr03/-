/**
 * 설정 파일
 * Google Apps Script 웹 앱 URL을 여기에 입력하세요.
 */

const CONFIG = {
    // Google Apps Script 웹 앱 URL (배포 후 생성되는 URL을 입력)
    // 예: 'https://script.google.com/macros/s/AKfycb.../exec'
    API_URL: 'https://script.google.com/macros/s/AKfycbyTAXbNA-XUvRC3uD6oikBxC32QO7T7EWtZLNlLnNbQNQbX0Nart8gZWp0EzogAnIuE3w/exec',

    // Google 스프레드시트 URL (대여 이력 버튼 클릭 시 열림)
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1k6DktYgAj8QYTMlg5zReOiUiPNkfuxdeRuTqRUc4lMA/edit?gid=651998571#gid=651998571',

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
