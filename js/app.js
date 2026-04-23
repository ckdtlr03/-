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

            this.showDeviceAction(device);
        } catch (error) {
            this.showLoading(false);
            alert('오류 발생: ' + (error.message || error));
        }
    }

    /**
     * 촬영된 이미지에서 QR 디코딩 → 대여/반납 모달 열기
     */
    async decodeQrFromImage(file) {
        this.showLoading(true);
        try {
            const img = await this._loadImageFromFile(file);

            // 1) BarcodeDetector 우선 (Android Chrome/Edge 하드웨어 가속)
            let decoded = await this._decodeWithBarcodeDetector(img);

            // 2) jsQR 폴백 — 여러 해상도로 시도
            if (!decoded && typeof jsQR !== 'undefined') {
                for (const edge of [1600, 2000, 1200, 800]) {
                    decoded = this._decodeWithJsQR(img, edge);
                    if (decoded) break;
                }
            }

            this.showLoading(false);

            if (!decoded) {
                alert(`QR 코드를 인식하지 못했습니다.\n사진 크기: ${img.naturalWidth}×${img.naturalHeight}\nQR이 화면 중앙에 선명하게 나오도록 다시 찍어주세요.`);
                return;
            }

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
        } catch (err) {
            this.showLoading(false);
            alert('QR 처리 실패: ' + (err.message || err));
        }
    }

    _loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('이미지 로드 실패'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsDataURL(file);
        });
    }

    async _decodeWithBarcodeDetector(img) {
        if (!('BarcodeDetector' in window)) return null;
        try {
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            const bitmap = await createImageBitmap(img);
            const results = await detector.detect(bitmap);
            bitmap.close && bitmap.close();
            if (results && results.length > 0) return results[0].rawValue;
        } catch (e) {
            console.warn('BarcodeDetector failed:', e);
        }
        return null;
    }

    _decodeWithJsQR(img, maxEdge) {
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth'
        });
        return code ? code.data : null;
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

        // 홈 → 대여 및 반납
        document.getElementById('enterRentalBtn').addEventListener('click', () => {
            this.showScreen('mainScreen');
            this.loadDevices();
        });

        // 홈 → QR 인식: 기본 카메라 앱 열기
        document.getElementById('enterScanBtn').addEventListener('click', () => {
            document.getElementById('qrPhotoInput').click();
        });

        // 사진 촬영/선택 후 QR 디코딩
        document.getElementById('qrPhotoInput').addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (file) await this.decodeQrFromImage(file);
        });

        // 디바이스 현황 → 홈
        document.getElementById('backToHomeBtn').addEventListener('click', () => {
            if (this._selectionMode) this.exitSelectionMode();
            this.showScreen('homeScreen');
        });

        // 메인 새로고침
        document.getElementById('refreshMainBtn').addEventListener('click', () => this.loadDevices(true));

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
        document.getElementById('deviceActionModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
        });

        // 대여 정보 입력 모달
        const closeRentModal = () => {
            document.getElementById('rentFromStatusModal').classList.remove('active');
            this._bulkRentMode = false;
            this._bulkRentDevices = [];
            const title = document.querySelector('#rentFromStatusModal .modal-header h2');
            if (title) title.textContent = '대여 정보 입력';
        };
        document.getElementById('closeRentFromStatusModal').addEventListener('click', closeRentModal);
        document.getElementById('rentFromStatusModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeRentModal();
        });
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
        if (rememberCheck) rememberCheck.checked = !!saved;

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
        } else {
            localStorage.removeItem('rentRenterName');
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
        if (rememberCheck) rememberCheck.checked = !!saved;

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
        } else {
            localStorage.removeItem('rentRenterName');
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
