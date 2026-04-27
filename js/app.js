/**
 * 디바이스 대여/반납 시스템 - 메인 애플리케이션
 */

function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVH();
window.addEventListener('resize', setVH);

class DeviceRentalApp {
    constructor() {
        this._rentStatusDevice = null;
        this._selectionMode = false;
        this._selectedIds = new Set();
        this._searchQuery = '';
        this._bulkRentMode = false;
        this._bulkRentDevices = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkApiConfig();
        this.handleQrDeepLink();
        this.loadRentedDashboard();
    }

    /**
     * 현재 대여 중인 디바이스를 가져와 홈 대시보드 + PC 패널에 렌더
     */
    async loadRentedDashboard(animate = false) {
        const refreshBtn = document.getElementById('refreshHomeDashBtn');
        if (animate && refreshBtn) {
            refreshBtn.classList.add('rotating');
            setTimeout(() => refreshBtn.classList.remove('rotating'), 600);
        }

        try {
            const response = await this.callApi({ action: 'getStatus' });
            if (response && response.success) {
                const rented = (response.devices || []).filter(d => d.status === 'rented');
                this._renderRentedDashboard(rented);
            }
        } catch (err) {
            console.error('대시보드 로드 실패:', err);
        }
    }

    _renderRentedDashboard(rented) {
        const homeList = document.getElementById('homeRentedList');
        const pcList = document.getElementById('pcRentedList');
        const homeCount = document.getElementById('homeRentedCount');
        const pcCount = document.getElementById('pcRentedCount');

        if (homeCount) homeCount.textContent = rented.length;
        if (pcCount) pcCount.textContent = rented.length;

        if (rented.length === 0) {
            const empty = '<div class="home-rented-empty">대여 중인 디바이스가 없습니다.</div>';
            if (homeList) homeList.innerHTML = empty;
            if (pcList) pcList.innerHTML = empty;
            return;
        }

        const esc = (s) => this._escapeHtml(s);
        const cardHtml = (d) => {
            const rentTime = this.formatDate(d.rentDate);
            return `<div class="rent-card" data-device-id="${esc(d.deviceId)}">
                <div class="rent-card-name">${esc(d.deviceName || d.deviceId)}</div>
                <div class="rent-card-meta">
                    <span class="rent-card-cell">${esc(d.cell || '-')}</span>
                    <span class="rent-card-renter">${esc(d.renter || '-')}</span>
                </div>
                <div class="rent-card-time">${esc(rentTime)}</div>
            </div>`;
        };

        const html = rented.map(cardHtml).join('');
        if (homeList) homeList.innerHTML = html;
        if (pcList) pcList.innerHTML = html;

        // 카드 클릭 → 반납 모달
        const bindCard = (card) => {
            card.addEventListener('click', () => {
                const id = card.dataset.deviceId;
                const device = rented.find(d => d.deviceId === id);
                if (device) this.showDeviceAction(device);
            });
        };
        if (homeList) homeList.querySelectorAll('.rent-card').forEach(bindCard);
        if (pcList) pcList.querySelectorAll('.rent-card').forEach(bindCard);
    }

    /**
     * QR 스캔으로 진입한 경우(?id=... 파라미터) 자동으로 대여/반납 모달 표시
     */
    async handleQrDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const deviceId = params.get('d') || params.get('id');
        if (!deviceId) return;

        const deviceName = params.get('name') || '';
        history.replaceState(null, '', window.location.pathname);

        await this.openDeviceActionById(deviceId, deviceName);
    }

    /**
     * deviceId로 현재 상태 조회 후 대여/반납 모달 표시 (QR 스캔 공통)
     * 저장된 이름·셀이 있으면 모달 없이 바로 진행
     */
    async openDeviceActionById(deviceId, deviceName) {
        this.showLoading(true);
        try {
            const response = await this.callApi({ action: 'getStatus' });
            this.showLoading(false);

            if (!response || !response.success) {
                alert('디바이스 정보를 불러오지 못했습니다.');
                return;
            }

            const device = (response.devices || []).find(d => d.deviceId === deviceId);
            if (!device) {
                alert(`등록되지 않은 디바이스입니다: ${deviceName || deviceId}`);
                return;
            }

            if (this._hasAutoRent()) {
                await this._autoRentOrReturn(device);
                return;
            }

            this.showDeviceAction(device);
        } catch (error) {
            this.showLoading(false);
            alert('오류 발생: ' + (error.message || error));
        }
    }

    _hasAutoRent() {
        return localStorage.getItem('rentAutoSkip') === '1'
            && !!localStorage.getItem('rentRenterName')
            && !!localStorage.getItem('rentRenterCell');
    }

    async _autoRentOrReturn(device) {
        const isRented = device.status === 'rented';
        const name = localStorage.getItem('rentRenterName');
        const cell = localStorage.getItem('rentRenterCell');
        const label = device.deviceName || device.deviceId;

        this.showLoading(true);
        try {
            const payload = isRented
                ? { action: 'return', deviceId: device.deviceId, deviceName: device.deviceName }
                : { action: 'rent', deviceId: device.deviceId, deviceName: device.deviceName, renterName: name, cell: cell };
            const response = await this.callApi(payload);
            this.showLoading(false);

            if (response && response.success) {
                alert(`${label} ${isRented ? '반납' : '대여'} 완료 (${isRented ? '' : cell + ' · '}${name})`);
                if (document.getElementById('mainScreen').classList.contains('active')) {
                    this.loadDevices();
                } else {
                    this.loadRentedDashboard();
                }
            } else {
                alert((isRented ? '반납' : '대여') + ' 실패: ' + ((response && response.message) || '알 수 없는 오류'));
            }
        } catch (err) {
            this.showLoading(false);
            alert('오류: ' + (err.message || err));
        }
    }

    /**
     * 촬영된 이미지에서 QR 디코딩 → 대여/반납 모달 열기
     */
    /**
     * 라이브 스캐너 시작 — getUserMedia 직접 호출 + BarcodeDetector/jsQR 디코딩 루프
     */
    async startLiveScanner() {
        this.showScreen('qrScanScreen');
        const statusEl = document.getElementById('qrScanStatus');
        const video = document.getElementById('qrVideo');

        statusEl.textContent = '카메라를 여는 중...';
        await this.stopLiveScanner();
        this._qrDetected = false;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });
            this._qrStream = stream;
            video.srcObject = stream;
            await video.play();

            const track = stream.getVideoTracks()[0];
            const { width, height } = track.getSettings();
            statusEl.textContent = `QR을 중앙에 맞추면 자동 인식됩니다. (${width}×${height})`;

            // BarcodeDetector 우선, 없으면 jsQR
            const hasDetector = 'BarcodeDetector' in window;
            const detector = hasDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;

            this._qrCanvas = document.createElement('canvas');
            this._qrCtx = this._qrCanvas.getContext('2d', { willReadFrequently: true });

            const loop = async () => {
                if (!this._qrStream || this._qrDetected) return;
                if (video.readyState >= 2) {
                    try {
                        const decoded = await this._scanVideoFrame(video, detector);
                        if (decoded) {
                            this._qrDetected = true;
                            await this.stopLiveScanner();
                            this.showScreen('homeScreen');
                            await this._handleDecodedQr(decoded);
                            return;
                        }
                    } catch (e) {
                        console.warn('scan error:', e);
                    }
                }
                this._qrRafId = requestAnimationFrame(loop);
            };
            this._qrRafId = requestAnimationFrame(loop);
        } catch (err) {
            console.error('getUserMedia failed:', err);
            statusEl.textContent = '카메라 시작 실패: ' + (err.message || err);
        }
    }

    async stopLiveScanner() {
        if (this._qrRafId) {
            cancelAnimationFrame(this._qrRafId);
            this._qrRafId = null;
        }
        if (this._qrStream) {
            this._qrStream.getTracks().forEach(t => t.stop());
            this._qrStream = null;
        }
        const video = document.getElementById('qrVideo');
        if (video) { video.pause(); video.srcObject = null; }
    }

    async _scanVideoFrame(video, detector) {
        // BarcodeDetector가 있으면 video 요소 직접 사용 (빠름)
        if (detector) {
            try {
                const results = await detector.detect(video);
                if (results && results.length > 0) return results[0].rawValue;
                return null;
            } catch (e) {
                // iOS 등에서 video 직접 입력 실패 시 canvas 경유
            }
        }

        // canvas로 프레임 캡처
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return null;

        // 긴 변 800px로 다운스케일 (성능)
        const scale = Math.min(1, 800 / Math.max(vw, vh));
        const w = Math.round(vw * scale);
        const h = Math.round(vh * scale);
        this._qrCanvas.width = w;
        this._qrCanvas.height = h;
        this._qrCtx.drawImage(video, 0, 0, w, h);

        if (detector) {
            try {
                const results = await detector.detect(this._qrCanvas);
                if (results && results.length > 0) return results[0].rawValue;
            } catch {}
        }

        if (typeof jsQR !== 'undefined') {
            const imageData = this._qrCtx.getImageData(0, 0, w, h);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
            });
            if (code) return code.data;
        }
        return null;
    }

    async _handleDecodedQr(decoded) {
        let deviceId = '';
        let deviceName = '';
        try {
            const url = new URL(decoded);
            deviceId = url.searchParams.get('d') || url.searchParams.get('id') || '';
            deviceName = url.searchParams.get('name') || '';
        } catch {
            deviceId = decoded.trim();
        }

        if (!deviceId) {
            alert('인식된 QR에 디바이스 정보가 없습니다.\n내용: ' + decoded);
            return;
        }

        await this.openDeviceActionById(deviceId, deviceName);
    }

    checkApiConfig() {
        if (CONFIG.API_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
            console.warn('⚠️ Google Apps Script URL이 설정되지 않았습니다.');
        }
    }

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

    bindEvents() {
        // 햄버거 메뉴
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const sidebarClose = document.getElementById('sidebarClose');

        const openSidebar = () => {
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('open');
            hamburgerBtn.classList.add('open');
        };
        const closeSidebar = () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('open');
            hamburgerBtn.classList.remove('open');
        };

        hamburgerBtn.addEventListener('click', () => {
            if (sidebar.classList.contains('open')) closeSidebar();
            else openSidebar();
        });
        sidebarClose.addEventListener('click', closeSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);

        // 사이드바 메뉴: 디바이스 관리 → 홈
        document.getElementById('homeMenuBtn').addEventListener('click', () => {
            closeSidebar();
            if (this._selectionMode) this.exitSelectionMode();
            this.showScreen('homeScreen');
        });

        // 사이드바 메뉴: 저장 정보 초기화
        document.getElementById('clearSavedBtn').addEventListener('click', () => {
            closeSidebar();
            if (!confirm('저장된 이름과 셀을 초기화합니다. 다음 대여 시 다시 입력이 필요합니다.')) return;
            localStorage.removeItem('rentRenterName');
            localStorage.removeItem('rentRenterCell');
            localStorage.removeItem('rentAutoSkip');
            alert('초기화되었습니다.');
        });

        // 홈 → 대여 및 반납
        document.getElementById('enterRentalBtn').addEventListener('click', () => {
            this.showScreen('mainScreen');
            this.loadDevices();
        });

        // 홈 → QR 인식: 라이브 스캐너 시작
        document.getElementById('enterScanBtn').addEventListener('click', () => {
            this.startLiveScanner();
        });

        // QR 스캔 → 홈
        document.getElementById('backFromScanBtn').addEventListener('click', async () => {
            await this.stopLiveScanner();
            this.showScreen('homeScreen');
        });

        // 디바이스 현황 → 홈
        document.getElementById('backToHomeBtn').addEventListener('click', () => {
            if (this._selectionMode) this.exitSelectionMode();
            this.showScreen('homeScreen');
        });

        // 메인 새로고침
        document.getElementById('refreshMainBtn').addEventListener('click', () => this.loadDevices(true));

        // 홈 대시보드 새로고침
        document.getElementById('refreshHomeDashBtn').addEventListener('click', () => this.loadRentedDashboard(true));

        // 다중 선택 토글
        document.getElementById('selectModeBtn').addEventListener('click', () => this.toggleSelectionMode());

        // 검색
        const searchInput = document.getElementById('searchInput');
        const searchBar = searchInput.closest('.search-bar');
        searchInput.addEventListener('input', () => {
            this._searchQuery = searchInput.value;
            searchBar.classList.toggle('has-value', !!this._searchQuery);
            if (this._allDevices) this._rerender();
        });
        document.getElementById('searchClearBtn').addEventListener('click', () => {
            searchInput.value = '';
            this._searchQuery = '';
            searchBar.classList.remove('has-value');
            if (this._allDevices) this._rerender();
            searchInput.focus();
        });

        // 다중 대여/반납
        document.getElementById('bulkRentBtn').addEventListener('click', () => this.openBulkRent());
        document.getElementById('bulkReturnBtn').addEventListener('click', () => this.processBulkReturn());

        // 디바이스 액션 모달
        document.getElementById('closeDeviceActionModal').addEventListener('click', () => {
            document.getElementById('deviceActionModal').classList.remove('active');
        });
        // 외부 클릭으로 닫지 않음 — X 버튼으로만 닫기

        // 대여 정보 입력 모달
        const closeRentModal = () => {
            document.getElementById('rentFromStatusModal').classList.remove('active');
            this._bulkRentMode = false;
            this._bulkRentDevices = [];
            const title = document.querySelector('#rentFromStatusModal .modal-header h2');
            if (title) title.textContent = '대여 정보 입력';
        };
        document.getElementById('closeRentFromStatusModal').addEventListener('click', closeRentModal);
        // 외부 클릭으로 닫지 않음 — X 또는 취소 버튼으로만 닫기
        document.getElementById('cancelRentFromStatus').addEventListener('click', closeRentModal);
        document.getElementById('rentCell1Btn').addEventListener('click', () => this.confirmRentFromStatus('1셀'));
        document.getElementById('rentCell2Btn').addEventListener('click', () => this.confirmRentFromStatus('2셀'));
        document.getElementById('modalRenterName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.confirmRentFromStatus('1셀');
        });
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
        if (screenId === 'homeScreen') this.loadRentedDashboard();
    }

    /**
     * 디바이스 목록 로드 및 메인 화면 렌더링
     */
    async loadDevices(animate = false) {
        const container = document.getElementById('mainDeviceList');
        const refreshBtn = document.getElementById('refreshMainBtn');

        if (animate) {
            refreshBtn.classList.add('rotating');
            setTimeout(() => refreshBtn.classList.remove('rotating'), 600);
        }

        if (!container.querySelector('.device-row')) {
            container.innerHTML = '<div class="status-loading">불러오는 중...</div>';
        }

        try {
            const response = await this.callApi({ action: 'getStatus' });
            if (response && response.success && response.devices) {
                this.renderDeviceList(response.devices);
                this._renderRentedDashboard(response.devices.filter(d => d.status === 'rented'));
            } else {
                container.innerHTML = '<div class="status-empty">데이터를 불러올 수 없습니다.</div>';
            }
        } catch (error) {
            console.error('현황 조회 오류:', error);
            container.innerHTML = '<div class="status-empty">서버 연결에 실패했습니다.</div>';
        }
    }

    _escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    renderDeviceList(devices) {
        const container = document.getElementById('mainDeviceList');

        if (!devices || devices.length === 0) {
            container.innerHTML = '<div class="status-empty">등록된 디바이스가 없습니다.</div>';
            this._allDevices = [];
            this.updateSelectionBar();
            return;
        }

        this._allDevices = devices;

        // 이전 선택이 존재하지 않는 디바이스를 가리키면 제거
        const existingIds = new Set(devices.map(d => d.deviceId));
        for (const id of [...this._selectedIds]) {
            if (!existingIds.has(id)) this._selectedIds.delete(id);
        }

        this._rerender();
    }

    _rerender() {
        const devices = this._allDevices || [];
        const getCat = d => (d.category && d.category.trim()) || '기타';

        const categoryOrder = [];
        const seen = new Set();
        devices.forEach(d => {
            const c = getCat(d);
            if (!seen.has(c)) { seen.add(c); categoryOrder.push(c); }
        });

        const rentedCount = devices.filter(d => d.status === 'rented').length;

        const tabs = [];
        if (rentedCount > 0) tabs.push({ key: 'rented', label: '대여 중', count: rentedCount });
        categoryOrder.forEach(cat => {
            const count = devices.filter(d => getCat(d) === cat).length;
            tabs.push({ key: 'cat:' + cat, label: cat, count });
        });

        if (!this._selectedTab || !tabs.find(t => t.key === this._selectedTab)) {
            this._selectedTab = tabs.length > 0 ? tabs[0].key : null;
        }

        this._renderTabsAndList(tabs);
        this.updateSelectionBar();
    }

    _renderTabsAndList(tabs) {
        const container = document.getElementById('mainDeviceList');
        const devices = this._allDevices;
        const selected = this._selectedTab;
        const getCat = d => (d.category && d.category.trim()) || '기타';
        const esc = (s) => this._escapeHtml(s);
        const q = (this._searchQuery || '').trim().toLowerCase();
        const isSearching = q.length > 0;

        let filtered;
        if (isSearching) {
            filtered = devices.filter(d => {
                const name = (d.deviceName || d.deviceId || '').toLowerCase();
                return name.includes(q);
            });
        } else if (selected === 'rented') {
            filtered = devices.filter(d => d.status === 'rented');
        } else if (selected && selected.startsWith('cat:')) {
            const cat = selected.substring(4);
            filtered = devices.filter(d => getCat(d) === cat);
        } else {
            filtered = devices;
        }

        const rented = filtered.filter(d => d.status === 'rented');
        const available = filtered.filter(d => d.status !== 'rented');

        const rowHtml = (device) => {
            const name = device.deviceName || device.deviceId;
            const subtitle = device.category || '';
            const showSub = subtitle && subtitle !== name;
            const isSelected = this._selectionMode && this._selectedIds.has(device.deviceId);
            const checkbox = this._selectionMode ? `
                <div class="device-row-checkbox">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>` : '';
            return `
            <div class="device-row${this._selectionMode ? ' selectable' : ''}${isSelected ? ' selected' : ''}" data-device-id="${esc(device.deviceId)}">
                ${checkbox}
                <div class="device-row-left">
                    <span class="device-row-name">${esc(name)}</span>
                    ${showSub ? `<span class="device-row-id">${esc(subtitle)}</span>` : ''}
                </div>
                <div class="device-row-right">
                    ${device.status === 'rented' ? `<span class="device-row-renter">${esc(device.renter || '')}</span>` : ''}
                    <span class="status-badge ${device.status === 'rented' ? 'rented' : 'available'}">${device.status === 'rented' ? '대여 중' : '사용 가능'}</span>
                </div>
            </div>`;
        };

        const tabsHtml = isSearching ? '' : `
            <div class="category-tabs">
                ${tabs.map(t => `
                    <button class="category-tab${t.key === selected ? ' active' : ''}" data-tab-key="${esc(t.key)}">
                        <span>${esc(t.label)}</span><span class="tab-count">${t.count}</span>
                    </button>
                `).join('')}
            </div>
        `;

        let listHtml = '';
        if (filtered.length === 0) {
            listHtml = `<div class="status-empty">${isSearching ? '검색 결과가 없습니다.' : '해당 탭에 디바이스가 없습니다.'}</div>`;
        } else if (!isSearching && selected === 'rented') {
            listHtml = `<div class="device-section">
                <div class="device-section-header"><span>대여 중</span><span class="device-section-count">${rented.length}</span></div>
                <div class="device-section-body">${rented.map(rowHtml).join('')}</div>
            </div>`;
        } else {
            if (rented.length > 0) {
                listHtml += `<div class="device-section">
                    <div class="device-section-header"><span>대여 중</span><span class="device-section-count">${rented.length}</span></div>
                    <div class="device-section-body">${rented.map(rowHtml).join('')}</div>
                </div>`;
            }
            listHtml += `<div class="device-section">
                <div class="device-section-header"><span>사용 가능</span><span class="device-section-count">${available.length}</span></div>
                <div class="device-section-body">${available.length > 0 ? available.map(rowHtml).join('') : '<div class="status-empty">사용 가능한 디바이스가 없습니다.</div>'}</div>
            </div>`;
        }

        container.innerHTML = tabsHtml + listHtml;

        const tabsEl = container.querySelector('.category-tabs');
        if (tabsEl) {
            this._enableTabDragAndWheel(tabsEl);
            tabsEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.category-tab');
                if (!btn || !tabsEl.contains(btn)) return;
                if (tabsEl.dataset.dragged === '1') {
                    tabsEl.dataset.dragged = '0';
                    e.preventDefault();
                    return;
                }
                this._selectedTab = btn.dataset.tabKey;
                this._renderTabsAndList(tabs);
            });
        }

        container.querySelectorAll('.device-row').forEach(row => {
            row.addEventListener('click', () => {
                const deviceId = row.dataset.deviceId;
                const device = this._allDevices.find(d => d.deviceId === deviceId);
                if (!device) return;
                if (this._selectionMode) {
                    this.toggleDeviceSelection(deviceId);
                } else {
                    this.showDeviceAction(device);
                }
            });
        });
    }

    _enableTabDragAndWheel(tabsEl) {
        tabsEl.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
                e.preventDefault();
                tabsEl.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        let isDown = false;
        let startX = 0;
        let startScroll = 0;
        let moved = 0;

        const onMove = (e) => {
            if (!isDown) return;
            const dx = e.clientX - startX;
            moved = Math.abs(dx);
            if (moved > 3) {
                tabsEl.scrollLeft = startScroll - dx;
                e.preventDefault();
            }
        };

        const onUp = () => {
            if (!isDown) return;
            isDown = false;
            tabsEl.classList.remove('dragging');
            if (moved > 5) tabsEl.dataset.dragged = '1';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        tabsEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDown = true;
            moved = 0;
            startX = e.clientX;
            startScroll = tabsEl.scrollLeft;
            tabsEl.classList.add('dragging');
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    toggleSelectionMode() {
        this._selectionMode = !this._selectionMode;
        this._selectedIds.clear();
        document.getElementById('selectModeBtn').classList.toggle('active', this._selectionMode);
        this._rerender();
    }

    exitSelectionMode() {
        this._selectionMode = false;
        this._selectedIds.clear();
        document.getElementById('selectModeBtn').classList.remove('active');
        this._rerender();
    }

    toggleDeviceSelection(deviceId) {
        if (this._selectedIds.has(deviceId)) this._selectedIds.delete(deviceId);
        else this._selectedIds.add(deviceId);
        this._rerender();
    }

    updateSelectionBar() {
        const bar = document.getElementById('selectionBar');
        if (!this._selectionMode) {
            bar.classList.remove('active');
            return;
        }
        bar.classList.add('active');

        const selectedDevices = [...this._selectedIds]
            .map(id => (this._allDevices || []).find(d => d.deviceId === id))
            .filter(Boolean);
        const availableCount = selectedDevices.filter(d => d.status !== 'rented').length;
        const rentedCount = selectedDevices.filter(d => d.status === 'rented').length;

        document.getElementById('selectedCount').textContent = selectedDevices.length;
        document.getElementById('bulkRentCount').textContent = availableCount;
        document.getElementById('bulkReturnCount').textContent = rentedCount;
        document.getElementById('bulkRentBtn').disabled = availableCount === 0;
        document.getElementById('bulkReturnBtn').disabled = rentedCount === 0;
    }

    openBulkRent() {
        const selected = [...this._selectedIds]
            .map(id => this._allDevices.find(d => d.deviceId === id))
            .filter(d => d && d.status !== 'rented');
        if (selected.length === 0) {
            alert('대여 가능한 디바이스가 선택되지 않았습니다.');
            return;
        }
        this._bulkRentMode = true;
        this._bulkRentDevices = selected;
        const title = document.querySelector('#rentFromStatusModal .modal-header h2');
        if (title) title.textContent = `${selected.length}개 디바이스 대여`;

        const nameInput = document.getElementById('modalRenterName');
        const rememberCheck = document.getElementById('rememberNameCheck');
        const saved = localStorage.getItem('rentRenterName') || '';
        nameInput.value = saved;
        if (rememberCheck) {
            rememberCheck.checked = localStorage.getItem('rentAutoSkip') === '1';
        }

        document.getElementById('rentFromStatusModal').classList.add('active');
        if (!saved) nameInput.focus();
    }

    async confirmBulkRent(cell) {
        const name = document.getElementById('modalRenterName').value.trim();
        if (!name) {
            alert(CONFIG.MESSAGES.ERROR_NO_NAME);
            document.getElementById('modalRenterName').focus();
            return;
        }

        const rememberCheck = document.getElementById('rememberNameCheck');
        if (rememberCheck && rememberCheck.checked) {
            localStorage.setItem('rentRenterName', name);
            localStorage.setItem('rentRenterCell', cell);
            localStorage.setItem('rentAutoSkip', '1');
        } else {
            localStorage.removeItem('rentRenterName');
            localStorage.removeItem('rentRenterCell');
            localStorage.removeItem('rentAutoSkip');
        }

        const devices = this._bulkRentDevices;

        document.getElementById('rentFromStatusModal').classList.remove('active');
        this.showLoading(true);

        let success = 0, failed = 0;
        const failedNames = [];
        for (const device of devices) {
            try {
                const response = await this.callApi({
                    action: 'rent',
                    deviceId: device.deviceId,
                    deviceName: device.deviceName,
                    renterName: name,
                    cell: cell
                });
                if (response && response.success) success++;
                else { failed++; failedNames.push(device.deviceName || device.deviceId); }
            } catch {
                failed++; failedNames.push(device.deviceName || device.deviceId);
            }
        }

        this.showLoading(false);
        this._bulkRentMode = false;
        this._bulkRentDevices = [];
        const title = document.querySelector('#rentFromStatusModal .modal-header h2');
        if (title) title.textContent = '대여 정보 입력';

        if (failed === 0) alert(`${success}개 디바이스 대여 완료`);
        else alert(`대여 ${success}건 성공, ${failed}건 실패\n실패: ${failedNames.join(', ')}`);

        this.exitSelectionMode();
        this.loadDevices();
    }

    async processBulkReturn() {
        const selected = [...this._selectedIds]
            .map(id => this._allDevices.find(d => d.deviceId === id))
            .filter(d => d && d.status === 'rented');
        if (selected.length === 0) {
            alert('반납할 디바이스가 선택되지 않았습니다.');
            return;
        }
        if (!confirm(`${selected.length}개 디바이스를 반납하시겠습니까?`)) return;

        this.showLoading(true);

        let success = 0, failed = 0;
        const failedNames = [];
        for (const device of selected) {
            try {
                const response = await this.callApi({
                    action: 'return',
                    deviceId: device.deviceId,
                    deviceName: device.deviceName
                });
                if (response && response.success) success++;
                else { failed++; failedNames.push(device.deviceName || device.deviceId); }
            } catch {
                failed++; failedNames.push(device.deviceName || device.deviceId);
            }
        }

        this.showLoading(false);

        if (failed === 0) alert(`${success}개 디바이스 반납 완료`);
        else alert(`반납 ${success}건 성공, ${failed}건 실패\n실패: ${failedNames.join(', ')}`);

        this.exitSelectionMode();
        this.loadDevices();
    }

    showDeviceAction(device) {
        const modal = document.getElementById('deviceActionModal');
        const title = document.getElementById('deviceActionTitle');
        const info = document.getElementById('deviceActionInfo');
        const buttons = document.getElementById('deviceActionButtons');
        const isRented = device.status === 'rented';
        const esc = (s) => this._escapeHtml(s);

        title.textContent = device.deviceName || device.deviceId;

        let infoHtml = '';
        if (device.category) {
            infoHtml += `
            <div class="detail-row">
                <span class="detail-label">카테고리</span>
                <span class="detail-value">${esc(device.category)}</span>
            </div>`;
        }
        infoHtml += `
            <div class="detail-row">
                <span class="detail-label">상태</span>
                <span class="detail-value">${isRented ? '대여 중' : '사용 가능'}</span>
            </div>
        `;

        if (isRented) {
            infoHtml += `
                <div class="detail-row">
                    <span class="detail-label">대여자</span>
                    <span class="detail-value">${esc(device.renter || '')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">셀</span>
                    <span class="detail-value">${esc(device.cell || '-')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">대여일시</span>
                    <span class="detail-value">${esc(this.formatDate(device.rentDate))}</span>
                </div>
            `;
        }
        info.innerHTML = infoHtml;

        if (isRented) {
            buttons.innerHTML = `<button class="action-return-btn">반납</button>`;
            buttons.querySelector('.action-return-btn').addEventListener('click', () => {
                this.processReturnFromStatus(device);
            });
        } else {
            buttons.innerHTML = `<button class="action-rent-btn">대여</button>`;
            buttons.querySelector('.action-rent-btn').addEventListener('click', () => {
                this.openRentFromStatus(device);
            });
        }

        modal.classList.add('active');
    }

    openRentFromStatus(device) {
        this._rentStatusDevice = device;
        this._bulkRentMode = false;
        this._bulkRentDevices = [];
        const title = document.querySelector('#rentFromStatusModal .modal-header h2');
        if (title) title.textContent = device.deviceName || device.deviceId;
        document.getElementById('deviceActionModal').classList.remove('active');

        const nameInput = document.getElementById('modalRenterName');
        const rememberCheck = document.getElementById('rememberNameCheck');
        const saved = localStorage.getItem('rentRenterName') || '';
        nameInput.value = saved;
        if (rememberCheck) {
            rememberCheck.checked = localStorage.getItem('rentAutoSkip') === '1';
        }

        document.getElementById('rentFromStatusModal').classList.add('active');
        if (!saved) nameInput.focus();
    }

    async confirmRentFromStatus(cell) {
        if (this._bulkRentMode) return this.confirmBulkRent(cell);
        const name = document.getElementById('modalRenterName').value.trim();
        if (!name) {
            alert(CONFIG.MESSAGES.ERROR_NO_NAME);
            document.getElementById('modalRenterName').focus();
            return;
        }

        const rememberCheck = document.getElementById('rememberNameCheck');
        if (rememberCheck && rememberCheck.checked) {
            localStorage.setItem('rentRenterName', name);
            localStorage.setItem('rentRenterCell', cell);
            localStorage.setItem('rentAutoSkip', '1');
        } else {
            localStorage.removeItem('rentRenterName');
            localStorage.removeItem('rentRenterCell');
            localStorage.removeItem('rentAutoSkip');
        }

        const device = this._rentStatusDevice;

        document.getElementById('rentFromStatusModal').classList.remove('active');
        this.showLoading(true);

        try {
            const response = await this.callApi({
                action: 'rent',
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                renterName: name,
                cell: cell
            });

            this.showLoading(false);

            if (response && response.success) {
                alert(`${device.deviceName || device.deviceId} 대여가 완료되었습니다.`);
                this.loadDevices();
            } else {
                alert('대여 실패: ' + ((response && response.message) || '알 수 없는 오류'));
            }
        } catch (error) {
            this.showLoading(false);
            alert('오류 발생: ' + (error.message || error));
        }
    }

    async processReturnFromStatus(device) {
        if (!confirm(`${device.deviceName || device.deviceId}을(를) 반납하시겠습니까?`)) {
            return;
        }

        document.getElementById('deviceActionModal').classList.remove('active');
        this.showLoading(true);

        try {
            const response = await this.callApi({
                action: 'return',
                deviceId: device.deviceId,
                deviceName: device.deviceName
            });

            this.showLoading(false);

            if (response && response.success) {
                alert(`${device.deviceName || device.deviceId} 반납이 완료되었습니다.`);
                this.loadDevices();
            } else {
                alert('반납 실패: ' + ((response && response.message) || '알 수 없는 오류'));
            }
        } catch (error) {
            this.showLoading(false);
            alert('오류 발생: ' + (error.message || error));
        }
    }

    /**
     * API 호출
     */
    async callApi(data) {
        if (CONFIG.API_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
            return this.simulateApiResponse(data);
        }
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('API 호출 오류:', error);
            throw error;
        }
    }

    simulateApiResponse(data) {
        console.log('📌 테스트 모드:', data);
        const now = new Date().toLocaleString('ko-KR');

        if (data.action === 'getStatus') {
            return {
                success: true,
                devices: [
                    { deviceId: 'DEV001', deviceName: 'iPhone 15 Pro', status: 'available', renter: '', cell: '', rentDate: '' },
                    { deviceId: 'DEV002', deviceName: 'Galaxy S24', status: 'rented', renter: '홍길동', cell: '1셀', rentDate: '2026-04-13 10:00:00' },
                    { deviceId: 'DEV003', deviceName: 'iPad Pro 12.9', status: 'available', renter: '', cell: '', rentDate: '' }
                ]
            };
        }
        if (data.action === 'rent') {
            return { success: true, message: `${data.deviceId} 대여 완료`, data: { ...data, rentDate: now } };
        }
        if (data.action === 'return') {
            return { success: true, message: `${data.deviceId} 반납 완료`, data: { ...data, returnDate: now } };
        }
        return { success: false, message: '알 수 없는 액션' };
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) overlay.classList.add('active');
        else overlay.classList.remove('active');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new DeviceRentalApp();
});
