/**
 * 디바이스 대여/반납 시스템 - 메인 애플리케이션
 */

class DeviceRentalApp {
    constructor() {
        this.currentMode = null; // 'rent' 또는 'return'
        this.qrScanner = null;
        this.rentInfo = {
            cell: '1셀',
            renterName: ''
        };

        this.init();
    }

    /**
     * 초기화
     */
    init() {
        this.bindEvents();
        this.checkApiConfig();
    }

    /**
     * API 설정 확인
     */
    checkApiConfig() {
        if (CONFIG.API_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
            console.warn('⚠️ Google Apps Script URL이 설정되지 않았습니다. config.js 파일을 확인해주세요.');
        }
    }

    /**
     * 날짜 형식 변환
     */
    formatDate(dateString) {
        if (!dateString) return '-';

        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');

            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch {
            return dateString;
        }
    }

    /**
     * 이벤트 바인딩
     */
    bindEvents() {
        // 메인 화면 버튼
        document.getElementById('rentBtn').addEventListener('click', () => this.startRent());
        document.getElementById('returnBtn').addEventListener('click', () => this.startReturn());
        document.getElementById('historyBtn').addEventListener('click', () => this.openHistory());

        // 대여 정보 화면 버튼
        document.getElementById('backToMainFromRent').addEventListener('click', () => this.showScreen('mainScreen'));
        document.getElementById('goToScanFromRent').addEventListener('click', () => this.goToRentScan());

        // 셀 선택
        document.querySelectorAll('input[name="cell"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.rentInfo.cell = e.target.value;
            });
        });

        // 스캔 화면 버튼
        document.getElementById('backFromScan').addEventListener('click', () => this.cancelScan());

        // 결과 화면 버튼
        document.getElementById('backToMain').addEventListener('click', () => this.showScreen('mainScreen'));

        // 이름 입력 엔터 키
        document.getElementById('renterName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.goToRentScan();
            }
        });

        // QR 생성 관련 버튼
        document.getElementById('menuBtn').addEventListener('click', () => this.openQrGenerator());
        document.getElementById('backFromGenerator').addEventListener('click', () => this.showScreen('mainScreen'));
        document.getElementById('backFromBatch').addEventListener('click', () => this.showScreen('mainScreen'));
        document.getElementById('generateQrBtn').addEventListener('click', () => this.generateQrCode());
        document.getElementById('downloadQrBtn').addEventListener('click', () => this.downloadGeneratedQr());
        document.getElementById('generateBatchBtn').addEventListener('click', () => this.generateBatchQrCodes());

        // 탭 전환
        document.getElementById('tabSingle').addEventListener('click', () => this.switchTab('single'));
        document.getElementById('tabBatch').addEventListener('click', () => this.switchTab('batch'));

        // QR 생성 입력 엔터 키
        document.getElementById('genDeviceId').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.generateQrCode();
        });
    }

    /**
     * 화면 전환
     */
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    /**
     * 대여 시작
     */
    startRent() {
        this.currentMode = 'rent';
        this.rentInfo = { cell: '1셀', renterName: '' };
        document.getElementById('renterName').value = '';
        document.querySelector('input[name="cell"][value="1셀"]').checked = true;
        this.showScreen('rentInfoScreen');
        document.getElementById('renterName').focus();
    }

    /**
     * 반납 시작
     */
    startReturn() {
        this.currentMode = 'return';
        document.getElementById('scanTitle').textContent = '반납 - QR 스캔';
        document.getElementById('scanInstruction').textContent = '반납할 디바이스의 QR 코드를 스캔하세요';
        document.getElementById('scanInfo').innerHTML = '';
        this.showScreen('scanScreen');
        this.startQrScanner();
    }

    /**
     * 대여 이력 열기
     */
    openHistory() {
        if (CONFIG.SPREADSHEET_URL && !CONFIG.SPREADSHEET_URL.includes('여기에_스프레드시트_ID_입력')) {
            window.open(CONFIG.SPREADSHEET_URL, '_blank');
        } else {
            alert('스프레드시트 URL이 설정되지 않았습니다. config.js를 확인해주세요.');
        }
    }

    /**
     * 대여 스캔 화면으로 이동
     */
    goToRentScan() {
        const name = document.getElementById('renterName').value.trim();

        if (!name) {
            alert(CONFIG.MESSAGES.ERROR_NO_NAME);
            document.getElementById('renterName').focus();
            return;
        }

        this.rentInfo.renterName = name;

        document.getElementById('scanTitle').textContent = '대여 - QR 스캔';
        document.getElementById('scanInstruction').textContent = '대여할 디바이스의 QR 코드를 스캔하세요';
        document.getElementById('scanInfo').innerHTML = `
            <p><strong>대여자:</strong> ${this.rentInfo.renterName}</p>
            <p><strong>셀:</strong> ${this.rentInfo.cell}</p>
        `;

        this.showScreen('scanScreen');
        this.startQrScanner();
    }

    /**
     * QR 스캐너 시작
     */
    async startQrScanner() {
        try {
            this.qrScanner = new Html5Qrcode('qrReader');

            await this.qrScanner.start(
                { facingMode: 'environment' },
                CONFIG.QR_SCANNER,
                (decodedText) => {
                    // 콜백을 try-catch로 감싸고 async 처리
                    try {
                        this.onQrCodeScanned(decodedText).catch(err => {
                            console.error('[DEBUG] async 오류:', err);
                            alert('처리 오류: ' + (err.message || err));
                        });
                    } catch (callbackError) {
                        console.error('[DEBUG] 콜백 오류:', callbackError);
                        alert('스캔 콜백 오류: ' + (callbackError.message || callbackError));
                    }
                },
                (errorMessage) => {
                    // 스캔 중 에러는 무시 (스캔 실패시 계속 시도)
                }
            );
        } catch (err) {
            console.error('카메라 시작 실패:', err);
            alert(CONFIG.MESSAGES.ERROR_CAMERA);
            this.showScreen('mainScreen');
        }
    }

    /**
     * QR 스캐너 중지
     */
    async stopQrScanner() {
        if (this.qrScanner && this.qrScanner.isScanning) {
            try {
                await this.qrScanner.stop();
            } catch (err) {
                console.error('스캐너 중지 실패:', err);
            }
        }
    }

    /**
     * QR 코드 내용 파싱 (ID|이름 형식)
     * URL 인코딩된 형식과 일반 형식 모두 지원
     */
    parseQrContent(qrContent) {
        try {
            // null/undefined 체크
            if (!qrContent || typeof qrContent !== 'string') {
                console.error('QR 내용이 비어있음:', qrContent);
                return { deviceId: 'UNKNOWN', deviceName: 'UNKNOWN' };
            }

            let content = qrContent.trim();
            console.log('원본 QR 내용:', content);

            // URL 인코딩 여부 확인 (%로 시작하는 인코딩 패턴)
            if (content.includes('%')) {
                try {
                    content = decodeURIComponent(content);
                    console.log('URL 디코딩 완료:', content);
                } catch (e) {
                    console.log('URL 디코딩 실패, 원본 사용');
                }
            }

            // 다양한 BOM 형태 제거
            content = content
                .replace(/^\uFEFF/, '')           // UTF-16 BOM
                .replace(/^\xEF\xBB\xBF/, '')     // UTF-8 BOM (raw bytes)
                .replace(/^ï»¿/, '')              // UTF-8 BOM as Latin-1
                .replace(/^ï»/, '')               // 부분 BOM
                .replace(/^�ｿ/, '')              // BOM 깨진 형태 1
                .replace(/^�/, '')               // BOM 깨진 형태 2
                .replace(/[\r\n\t\u0000-\u001F]/g, '')  // 제어문자 제거
                .trim();

            // 앞쪽의 깨진 문자들 제거 (첫 번째 영숫자나 한글이 나올 때까지)
            content = content.replace(/^[^\w\uAC00-\uD7AF]+/, '');

            console.log('정제된 QR 내용:', content);

            if (content.includes('|')) {
                const parts = content.split('|');
                const deviceId = (parts[0] || '').trim();
                const deviceName = (parts[1] || parts[0] || '').trim();
                return {
                    deviceId: deviceId || 'UNKNOWN',
                    deviceName: deviceName || 'UNKNOWN'
                };
            }
            // 기존 QR 코드 호환 (ID만 있는 경우)
            return {
                deviceId: content,
                deviceName: content
            };
        } catch (error) {
            console.error('QR 파싱 오류:', error);
            return { deviceId: 'UNKNOWN', deviceName: 'UNKNOWN' };
        }
    }

    /**
     * QR 코드 스캔 완료
     */
    async onQrCodeScanned(qrContent) {
        // 디버깅 모드: 각 단계마다 alert 표시
        const DEBUG_ALERT = false;

        try {
            if (DEBUG_ALERT) alert('1. QR 인식됨: ' + qrContent);

            await this.stopQrScanner();
            if (DEBUG_ALERT) alert('2. 스캐너 중지 완료');

            const deviceInfo = this.parseQrContent(qrContent);
            if (DEBUG_ALERT) alert('3. 파싱 완료: ID=' + deviceInfo.deviceId + ', 이름=' + deviceInfo.deviceName);

            if (this.currentMode === 'rent') {
                if (DEBUG_ALERT) alert('4. 대여 처리 시작');
                await this.processRent(deviceInfo);
                if (DEBUG_ALERT) alert('5. 대여 처리 완료');
            } else if (this.currentMode === 'return') {
                if (DEBUG_ALERT) alert('4. 반납 처리 시작');
                await this.processReturn(deviceInfo);
                if (DEBUG_ALERT) alert('5. 반납 처리 완료');
            }
        } catch (error) {
            alert('오류 발생: ' + (error.message || error.toString()));
            this.showResult(false, '오류 발생', 'QR 코드 처리 중 오류가 발생했습니다: ' + (error.message || ''));
        }
    }

    /**
     * 스캔 취소
     */
    async cancelScan() {
        await this.stopQrScanner();

        if (this.currentMode === 'rent') {
            this.showScreen('rentInfoScreen');
        } else {
            this.showScreen('mainScreen');
        }
    }

    /**
     * 대여 처리
     */
    async processRent(deviceInfo) {
        this.showLoading(true);

        try {
            const response = await this.callApi({
                action: 'rent',
                deviceId: deviceInfo.deviceId,
                deviceName: deviceInfo.deviceName,
                renterName: this.rentInfo.renterName,
                cell: this.rentInfo.cell
            });

            if (response && response.success) {
                const data = response.data || {};
                this.showResult(true, CONFIG.MESSAGES.RENT_SUCCESS, response.message || '대여 완료', {
                    '디바이스 ID': deviceInfo.deviceId,
                    '디바이스명': deviceInfo.deviceName,
                    '대여자': data.renterName || this.rentInfo.renterName,
                    '셀': data.cell || this.rentInfo.cell,
                    '대여일시': this.formatDate(data.rentDate)
                });
            } else {
                this.showResult(false, '대여 실패', (response && response.message) || '알 수 없는 오류');
            }
        } catch (error) {
            console.error('대여 처리 오류:', error);
            this.showResult(false, '오류 발생', CONFIG.MESSAGES.ERROR_API);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 반납 처리
     */
    async processReturn(deviceInfo) {
        this.showLoading(true);

        try {
            const response = await this.callApi({
                action: 'return',
                deviceId: deviceInfo.deviceId,
                deviceName: deviceInfo.deviceName
            });

            if (response && response.success) {
                const data = response.data || {};
                this.showResult(true, CONFIG.MESSAGES.RETURN_SUCCESS, response.message || '반납 완료', {
                    '디바이스 ID': deviceInfo.deviceId,
                    '디바이스명': deviceInfo.deviceName,
                    '대여자': data.renterName || '-',
                    '대여일시': this.formatDate(data.rentDate),
                    '반납일시': this.formatDate(data.returnDate)
                });
            } else {
                this.showResult(false, '반납 실패', (response && response.message) || '알 수 없는 오류');
            }
        } catch (error) {
            console.error('반납 처리 오류:', error);
            this.showResult(false, '오류 발생', CONFIG.MESSAGES.ERROR_API);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * API 호출
     */
    async callApi(data) {
        if (CONFIG.API_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
            // 테스트 모드 - API 미설정시 시뮬레이션
            return this.simulateApiResponse(data);
        }

        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('API 호출 오류:', error);
            throw error;
        }
    }

    /**
     * API 시뮬레이션 (테스트용)
     */
    simulateApiResponse(data) {
        console.log('📌 테스트 모드 - API 호출 시뮬레이션:', data);

        const now = new Date().toLocaleString('ko-KR');

        if (data.action === 'rent') {
            return {
                success: true,
                message: `${data.deviceId} 대여가 완료되었습니다.`,
                data: {
                    deviceId: data.deviceId,
                    deviceName: data.deviceId,
                    renterName: data.renterName,
                    cell: data.cell,
                    rentDate: now
                }
            };
        } else if (data.action === 'return') {
            return {
                success: true,
                message: `${data.deviceId} 반납이 완료되었습니다.`,
                data: {
                    deviceId: data.deviceId,
                    deviceName: data.deviceId,
                    renterName: '테스트 사용자',
                    rentDate: '2026-01-26 09:00:00',
                    returnDate: now
                }
            };
        }

        return { success: false, message: '알 수 없는 액션' };
    }

    /**
     * 결과 화면 표시
     */
    showResult(isSuccess, title, message, details = null) {
        const resultIcon = document.getElementById('resultIcon');
        const resultTitle = document.getElementById('resultTitle');
        const resultMessage = document.getElementById('resultMessage');
        const resultDetails = document.getElementById('resultDetails');

        resultIcon.textContent = isSuccess ? '✅' : '❌';
        resultIcon.className = `result-icon ${isSuccess ? 'success' : 'error'}`;
        resultTitle.textContent = title;
        resultMessage.textContent = message;

        if (details) {
            let detailsHtml = '';
            for (const [label, value] of Object.entries(details)) {
                detailsHtml += `
                    <div class="detail-row">
                        <span class="detail-label">${label}</span>
                        <span class="detail-value">${value}</span>
                    </div>
                `;
            }
            resultDetails.innerHTML = detailsHtml;
            resultDetails.style.display = 'block';
        } else {
            resultDetails.style.display = 'none';
        }

        this.showScreen('resultScreen');
    }

    /**
     * 로딩 표시
     */
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }

    /**
     * QR 생성 화면 열기
     */
    openQrGenerator() {
        document.getElementById('genDeviceId').value = '';
        document.getElementById('genDeviceName').value = '';
        document.getElementById('qrResultArea').classList.remove('active');
        document.getElementById('qrCodeDisplay').innerHTML = '';
        this.showScreen('qrGeneratorScreen');
        document.getElementById('genDeviceId').focus();
    }

    /**
     * QR 코드 생성
     */
    generateQrCode() {
        const deviceId = document.getElementById('genDeviceId').value.trim();
        const deviceName = document.getElementById('genDeviceName').value.trim() || deviceId;

        if (!deviceId) {
            alert('디바이스 ID를 입력해주세요.');
            document.getElementById('genDeviceId').focus();
            return;
        }

        const qrContainer = document.getElementById('qrCodeDisplay');
        qrContainer.innerHTML = '';

        // QR 코드에 URL 인코딩하여 저장 (한글 등 특수문자 안전하게 처리)
        const qrContent = encodeURIComponent(`${deviceId}|${deviceName}`);
        console.log('생성된 QR 내용 (인코딩):', qrContent);

        new QRCode(qrContainer, {
            text: qrContent,
            width: 200,
            height: 200,
            colorDark: '#2c3e50',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });

        document.getElementById('qrResultId').textContent = deviceId;
        document.getElementById('qrResultName').textContent = deviceName;
        document.getElementById('qrResultArea').classList.add('active');
    }

    /**
     * 생성된 QR 코드 다운로드
     */
    downloadGeneratedQr() {
        const qrContainer = document.getElementById('qrCodeDisplay');
        const img = qrContainer.querySelector('img');
        const canvas = qrContainer.querySelector('canvas');
        const deviceId = document.getElementById('qrResultId').textContent;

        const link = document.createElement('a');
        link.download = `QR_${deviceId}.png`;

        if (canvas) {
            link.href = canvas.toDataURL('image/png');
        } else if (img) {
            link.href = img.src;
        }

        link.click();
    }

    /**
     * 탭 전환
     */
    switchTab(tab) {
        document.getElementById('tabSingle').classList.remove('active');
        document.getElementById('tabBatch').classList.remove('active');
        document.getElementById('singleGenSection').classList.remove('active');
        document.getElementById('batchGenSection').classList.remove('active');

        if (tab === 'single') {
            document.getElementById('tabSingle').classList.add('active');
            document.getElementById('singleGenSection').classList.add('active');
        } else {
            document.getElementById('tabBatch').classList.add('active');
            document.getElementById('batchGenSection').classList.add('active');
        }
    }

    /**
     * 일괄 QR 코드 생성
     */
    generateBatchQrCodes() {
        const input = document.getElementById('batchInput').value.trim();

        if (!input) {
            alert('디바이스 목록을 입력해주세요.');
            return;
        }

        // 줄바꿈으로 분리 (Windows/Mac/Linux 모두 지원)
        const lines = input.split(/\r?\n/).filter(line => line.trim());
        const resultsContainer = document.getElementById('batchResultArea');
        resultsContainer.innerHTML = '';

        lines.forEach((line, index) => {
            const parts = line.split(',').map(p => p.trim());
            const deviceId = (parts[0] || '').trim();
            const deviceName = (parts[1] || deviceId).trim();

            if (!deviceId) return;

            const card = document.createElement('div');
            card.className = 'qr-card';

            const qrWrapper = document.createElement('div');
            qrWrapper.className = 'qr-wrapper';
            qrWrapper.id = `qrBatch_${index}`;

            const idText = document.createElement('div');
            idText.className = 'device-id';
            idText.textContent = deviceId;

            const nameText = document.createElement('div');
            nameText.className = 'device-name';
            nameText.textContent = deviceName;

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'download-btn';
            downloadBtn.textContent = '다운로드';
            downloadBtn.onclick = () => this.downloadBatchQr(qrWrapper, deviceId);

            card.appendChild(qrWrapper);
            card.appendChild(idText);
            card.appendChild(nameText);
            card.appendChild(downloadBtn);

            resultsContainer.appendChild(card);

            // QR 코드에 URL 인코딩하여 저장 (한글 등 특수문자 안전하게 처리)
            const qrContent = encodeURIComponent(`${deviceId}|${deviceName}`);
            console.log('생성된 QR 내용 (인코딩):', qrContent);

            new QRCode(qrWrapper, {
                text: qrContent,
                width: 120,
                height: 120,
                colorDark: '#2c3e50',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        });
    }

    /**
     * 일괄 QR 다운로드
     */
    downloadBatchQr(qrWrapper, deviceId) {
        const img = qrWrapper.querySelector('img');
        const canvas = qrWrapper.querySelector('canvas');

        const link = document.createElement('a');
        link.download = `QR_${deviceId}.png`;

        if (canvas) {
            link.href = canvas.toDataURL('image/png');
        } else if (img) {
            link.href = img.src;
        }

        link.click();
    }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DeviceRentalApp();
});
