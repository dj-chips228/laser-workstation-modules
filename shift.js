// Модуль: shift.js
// Работа со сменами

(function() {
    'use strict';
    
    // Используем глобальные переменные
    const addLog = window.addLog || console.log;
    const updateChecklist = window.updateChecklist || (() => {});
    const updateTabStatuses = window.updateTabStatuses || (() => {});
    const saveStateToLocalStorage = window.saveStateToLocalStorage || (() => {});
    // getGoogleSheetsConfig должна быть доступна из ui.js (загружается раньше)
    const getGoogleSheetsConfig = window.getGoogleSheetsConfig;
    if (!getGoogleSheetsConfig) {
        console.error('❌ getGoogleSheetsConfig не найдена! ui.js должен загружаться раньше shift.js');
    }
    
    // Доступ к глобальным переменным через window
    const getCurrentIp = () => window.currentIp;
    const getIsConnected = () => window.isConnected && window.currentIp;
    const getCurrentStats = () => window.currentStats;
    const getDeviceInfo = () => window.deviceInfo;
    const getActiveShift = () => window.activeShift;
    const setActiveShift = (shift) => { window.activeShift = shift; };
    const getFlowState = () => window.flowState;
    const setCurrentStats = (stats) => { window.currentStats = stats; };
    
    async function fetchWorkingInfo(ip) {
        try {
            const response = await fetch(`http://${ip}:8080/device/workingInfo`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                return data.data || data;
            } catch (e) {
                throw new Error(`Ответ не в формате JSON: ${text.substring(0, 100)}`);
            }
        } catch (error) {
            throw new Error(`Не удалось получить статистику: ${error.message}`);
        }
    }
    
    function validateStats(stats) {
        if (!stats) return { valid: false, error: 'Статистика отсутствует' };
        
        const offline = stats.numOfflineWorking || 0;
        const online = stats.numOnlineWorking || 0;
        
        if (offline < 0 || online < 0) {
            return {
                valid: false,
                error: `Обнаружены отрицательные значения: offline=${offline}, online=${online}`
            };
        }
        
        return { valid: true };
    }
    
    async function openShift() {
        if (!getIsConnected() || !getDeviceInfo()) {
            console.error('❌ openShift: не подключено', { isConnected: window.isConnected, currentIp: window.currentIp, hasStats: !!getCurrentStats(), hasDeviceInfo: !!getDeviceInfo() });
            addLog('error', 'Сначала подключитесь к лазеру');
            return;
        }
        
        // Если статистика отсутствует, получаем её
        if (!getCurrentStats()) {
            addLog('info', 'Получение статистики устройства...');
            try {
                const stats = await fetchWorkingInfo(getCurrentIp());
                setCurrentStats(stats);
                addLog('success', 'Статистика устройства получена');
            } catch (error) {
                addLog('error', `Не удалось получить статистику устройства: ${error.message}`);
                return;
            }
        }
        
        // Проверяем валидность статистики
        const validation = validateStats(getCurrentStats());
        if (!validation.valid) {
            addLog('error', validation.error);
            return;
        }
        
        const btn = document.getElementById('openShiftBtn');
        btn.disabled = true;
        btn.classList.add('loading');
        
        try {
            if (!validation.valid) {
                alert(`Ошибка валидации: ${validation.error}`);
                addLog('error', validation.error);
                btn.disabled = false;
                btn.classList.remove('loading');
                return;
            }
            
            const currentIp = getCurrentIp();
            setCurrentStats(await fetchWorkingInfo(currentIp));
            const currentStats = getCurrentStats();
            const deviceInfo = getDeviceInfo();
            
            const total = (currentStats.numOfflineWorking || 0) + (currentStats.numOnlineWorking || 0);
            
            let serial = deviceInfo.snCode || deviceInfo.deviceSN;
            if (!serial) {
                const deviceName = deviceInfo.deviceName || '';
                const model = deviceInfo.model || '';
                const productID = deviceInfo.productID || '';
                serial = `${deviceName}_${model}_${productID}`.replace(/\s+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
                addLog('info', `Серийный номер не найден, используется составной идентификатор: ${serial}`);
            }
            
            const newShiftId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
            
            const shift = {
                id: newShiftId,
                deviceSerial: serial,
                deviceModel: deviceInfo.model || deviceInfo.deviceName || 'N/A',
                startTime: new Date().toISOString(),
                startEngravingsCount: total,
                status: 'active'
            };
            
            setActiveShift(shift);
            
            await saveActiveShiftToGoogleSheets();
            
            const flowState = getFlowState();
            flowState.shiftOpened = true;
            updateChecklist('shift', true);
            updateTabStatuses();
            saveStateToLocalStorage();
            
            document.getElementById('shift-status').textContent = `✅ Смена открыта. Гравировок на начало: ${total}`;
            document.getElementById('closeShiftBtn').disabled = false;
            
            const detailsDiv = document.getElementById('shift-details');
            if (detailsDiv) {
                detailsDiv.style.display = 'block';
                document.getElementById('shift-start-time').textContent = new Date(shift.startTime).toLocaleString('ru-RU');
                document.getElementById('shift-start-count').textContent = shift.startEngravingsCount;
                document.getElementById('shift-current-count').textContent = total;
                document.getElementById('shift-diff-count').textContent = 0;
            }
            
            addLog('success', `Смена открыта. Гравировок на начало: ${total}`);
            
        } catch (error) {
            addLog('error', `Ошибка открытия смены: ${error.message}`);
            alert(`Ошибка открытия смены: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }
    
    async function showCloseShiftForm() {
        if (!getActiveShift()) {
            addLog('error', 'Смена не открыта');
            return;
        }
        
        try {
            const currentIp = getCurrentIp();
            setCurrentStats(await fetchWorkingInfo(currentIp));
            const currentStats = getCurrentStats();
            const activeShift = getActiveShift();
            
            const total = (currentStats.numOfflineWorking || 0) + (currentStats.numOnlineWorking || 0);
            const diff = total - activeShift.startEngravingsCount;
            
            document.getElementById('finalEngravingsCount').textContent = diff;
            
            const form = document.getElementById('closeShiftForm');
            form.classList.add('active');
            
            document.getElementById('eventName').value = '';
            document.getElementById('testEngravings').value = '0';
            document.getElementById('shiftComment').value = '';
            
            document.getElementById('eventName').focus();
            
        } catch (error) {
            addLog('error', `Ошибка при подготовке формы: ${error.message}`);
        }
    }
    
    function cancelCloseShift() {
        const form = document.getElementById('closeShiftForm');
        form.classList.remove('active');
        
        document.getElementById('eventName').value = '';
        document.getElementById('testEngravings').value = '0';
        document.getElementById('shiftComment').value = '';
    }
    
    async function submitReport() {
        if (!getActiveShift()) {
            addLog('error', 'Смена не открыта');
            return;
        }
        
        const eventNameEl = document.getElementById('eventName');
        const eventName = eventNameEl.value.trim();
        
        if (!eventName) {
            alert('Пожалуйста, укажите название мероприятия!');
            eventNameEl.focus();
            return;
        }
        
        const btn = document.getElementById('submitReportBtn');
        btn.disabled = true;
        btn.classList.add('loading');
        
        try {
            const currentIp = getCurrentIp();
            setCurrentStats(await fetchWorkingInfo(currentIp));
            const currentStats = getCurrentStats();
            const activeShift = getActiveShift();
            const deviceInfo = getDeviceInfo();
            
            const total = (currentStats.numOfflineWorking || 0) + (currentStats.numOnlineWorking || 0);
            const diff = total - activeShift.startEngravingsCount;
            
            const testEngravings = parseInt(document.getElementById('testEngravings').value) || 0;
            const comment = document.getElementById('shiftComment').value.trim();
            
            let deviceSerial = activeShift.deviceSerial;
            if (deviceSerial === 'unknown' && deviceInfo) {
                deviceSerial = deviceInfo.snCode || deviceInfo.deviceSN || deviceInfo.deviceName || 'unknown';
                addLog('warning', `Исправлен deviceSerial с 'unknown' на '${deviceSerial}'`);
            }
            
            const report = {
                id: activeShift.id,
                deviceSerial: deviceSerial,
                deviceModel: activeShift.deviceModel || (deviceInfo ? (deviceInfo.model || deviceInfo.deviceName) : 'N/A'),
                startTime: activeShift.startTime,
                endTime: new Date().toISOString(),
                startEngravingsCount: activeShift.startEngravingsCount,
                endEngravingsCount: total,
                engravingsCount: diff,
                testEngravings: testEngravings,
                actualEngravings: Math.max(0, diff - testEngravings),
                eventName: eventName,
                comment: comment
            };
            
            const reports = JSON.parse(localStorage.getItem('shiftReports') || '[]');
            reports.push(report);
            localStorage.setItem('shiftReports', JSON.stringify(reports));
            
            await saveReportToGoogleSheets(report);
            await closeActiveShiftInGoogleSheets();
            
            setActiveShift(null);
            const flowState = getFlowState();
            flowState.shiftOpened = false;
            updateChecklist('shift', false);
            updateTabStatuses();
            saveStateToLocalStorage();
            
            document.getElementById('closeShiftForm').classList.remove('active');
            document.getElementById('shift-details').style.display = 'none';
            
            document.getElementById('shift-status').textContent = 'Смена закрыта. Отчет сохранен.';
            document.getElementById('openShiftBtn').disabled = false;
            
            addLog('success', `Смена закрыта. Отчет сохранен: ${eventName}, гравировок: ${diff}`);
            
        } catch (error) {
            addLog('error', `Ошибка закрытия смены: ${error.message}`);
            alert(`Ошибка закрытия смены: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }
    
    async function loadActiveShift() {
        addLog('info', '🔍 loadActiveShift() вызвана');
        if (!getIsConnected() || !getDeviceInfo()) {
            addLog('warning', `loadActiveShift: не подключено или нет deviceInfo. isConnected=${getIsConnected()}, hasDeviceInfo=${!!getDeviceInfo()}`);
            return;
        }
        
        // Показываем состояние загрузки
        const shiftStatus = document.getElementById('shift-status');
        const openShiftBtn = document.getElementById('openShiftBtn');
        if (shiftStatus) {
            shiftStatus.textContent = '⏳ Проверка активной смены...';
            shiftStatus.className = 'status processing';
            addLog('info', 'Статус установлен: ⏳ Проверка активной смены...');
        }
        if (openShiftBtn) {
            openShiftBtn.disabled = true;
            openShiftBtn.classList.add('loading');
            addLog('info', 'Кнопка "Открыть смену" заблокирована и помечена как loading');
        }
        
        const deviceInfo = getDeviceInfo();
        let serial = deviceInfo?.snCode || deviceInfo?.deviceSN;
        if (!serial) {
            const deviceName = deviceInfo?.deviceName || '';
            const model = deviceInfo?.model || '';
            const productID = deviceInfo?.productID || '';
            serial = `${deviceName}_${model}_${productID}`.replace(/\s+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
            addLog('info', `Серийный номер не найден, используется составной: ${serial}`);
        } else {
            addLog('info', `Найден серийный номер: ${serial}`);
        }
        
        try {
            addLog('info', `Проверяю активную смену для устройства: ${serial}`);
            const shiftFromSheets = await getActiveShiftFromGoogleSheets(serial);
            if (shiftFromSheets) {
                addLog('success', `✅ Найдена активная смена: ID=${shiftFromSheets.id}`);
                const shift = {
                    id: shiftFromSheets.id,
                    deviceSerial: shiftFromSheets.device_serial,
                    deviceModel: shiftFromSheets.device_model,
                    startTime: shiftFromSheets.start_time,
                    startEngravingsCount: shiftFromSheets.start_engravings_count,
                    status: 'active'
                };
                
                setActiveShift(shift);
                const flowState = getFlowState();
                flowState.shiftOpened = true;
                addLog('info', `flowState.shiftOpened установлен в true`);
                updateChecklist('shift', true);
                addLog('info', 'Чеклист обновлен: shift = true');
                
                const startTime = new Date(shift.startTime).toLocaleString('ru-RU');
                // Убираем состояние загрузки
                if (openShiftBtn) {
                    openShiftBtn.disabled = true;
                    openShiftBtn.classList.remove('loading');
                    addLog('info', 'Кнопка "Открыть смену" разблокирована (смена найдена)');
                }
                if (shiftStatus) {
                    shiftStatus.className = 'status success';
                }
                document.getElementById('closeShiftBtn').disabled = false;
                
                const currentStats = getCurrentStats();
                if (currentStats) {
                    const total = (currentStats.numOfflineWorking || 0) + (currentStats.numOnlineWorking || 0);
                    const diff = total - shift.startEngravingsCount;
                    const detailsDiv = document.getElementById('shift-details');
                    if (detailsDiv) {
                        detailsDiv.style.display = 'block';
                        document.getElementById('shift-start-time').textContent = startTime;
                        document.getElementById('shift-start-count').textContent = shift.startEngravingsCount;
                        document.getElementById('shift-current-count').textContent = total;
                        document.getElementById('shift-diff-count').textContent = diff;
                    }
                }
                
                addLog('success', `Найдена активная смена в Google Sheets: ${startTime}`);
                if (window.updateTabStatuses) {
                    updateTabStatuses();
                    addLog('info', 'updateTabStatuses() вызван после загрузки смены');
                } else {
                    addLog('warning', 'updateTabStatuses не найден!');
                }
            } else {
                addLog('info', 'Активная смена не найдена в Google Sheets');
                setActiveShift(null);
                const flowState = getFlowState();
                flowState.shiftOpened = false;
                updateChecklist('shift', false);
                // Убираем состояние загрузки и активируем кнопку
                if (openShiftBtn) {
                    openShiftBtn.disabled = false;
                    openShiftBtn.classList.remove('loading');
                    addLog('info', 'Кнопка "Открыть смену" разблокирована (смена не найдена)');
                }
                if (shiftStatus) {
                    shiftStatus.className = 'status info';
                }
                if (window.updateTabStatuses) {
                    updateTabStatuses();
                }
            }
        } catch (error) {
            addLog('error', `Ошибка проверки активной смены в Google Sheets: ${error.message}`);
            setActiveShift(null);
            const flowState = getFlowState();
            flowState.shiftOpened = false;
            updateChecklist('shift', false);
            // Убираем состояние загрузки и активируем кнопку даже при ошибке
            const openShiftBtn = document.getElementById('openShiftBtn');
            const shiftStatus = document.getElementById('shift-status');
            if (openShiftBtn) {
                openShiftBtn.disabled = false;
                openShiftBtn.classList.remove('loading');
                addLog('info', 'Кнопка "Открыть смену" разблокирована (ошибка проверки)');
            }
            if (shiftStatus) {
                shiftStatus.className = 'status error';
            }
            if (window.updateTabStatuses) {
                updateTabStatuses();
            }
        }
    }
    
    async function getActiveShiftFromGoogleSheets(deviceSerial) {
        const config = getGoogleSheetsConfig();
        const scriptUrl = config.scriptUrl;
        if (!scriptUrl) {
            addLog('warning', 'Google Sheets Script URL не настроен');
            return null;
        }
        
        try {
            const sheetName = config.sheetName || '[АВТО] Гравёры_отчёты';
            addLog('info', `Проверка активной смены в Google Sheets для устройства: ${deviceSerial}`);
            
            const formData = new URLSearchParams({
                action: 'get_active_shift',
                sheet_name: sheetName,
                device_serial: deviceSerial
            });
            
            const response = await fetch(scriptUrl, {
                method: 'POST',
                body: formData
            });
            
            const responseText = await response.text();
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                addLog('warning', `Ответ от Google Sheets не в формате JSON: ${responseText.substring(0, 100)}`);
                return null;
            }
            
            if (result.success && result.shift) {
                addLog('success', `Найдена активная смена в Google Sheets: ID=${result.shift.id}`);
                return result.shift;
            } else {
                addLog('info', 'Активная смена в Google Sheets не найдена');
                return null;
            }
        } catch (error) {
            addLog('warning', `Ошибка получения активной смены из Google Sheets: ${error.message}`);
            return null;
        }
    }
    
    async function saveActiveShiftToGoogleSheets() {
        const activeShift = getActiveShift();
        if (!activeShift) return;
        
        const config = getGoogleSheetsConfig();
        const scriptUrl = config.scriptUrl;
        if (!scriptUrl) {
            addLog('warning', 'Google Sheets Script URL не настроен, смена сохранена только локально');
            return;
        }
        
        try {
            const sheetName = config.sheetName || '[АВТО] Гравёры_отчёты';
            
            addLog('info', `=== ОТПРАВКА ОТКРЫТИЯ СМЕНЫ ===`);
            addLog('info', `URL: ${scriptUrl}`);
            addLog('info', `Конфиг: ${JSON.stringify(config)}`);
            addLog('info', `Используемый лист: "${sheetName}"`);
            
            const shiftData = {
                id: activeShift.id,
                device_serial: activeShift.deviceSerial,
                device_model: activeShift.deviceModel,
                start_time: activeShift.startTime,
                start_engravings_count: activeShift.startEngravingsCount,
                status: 'active'
            };
            
            addLog('info', `Данные: ${JSON.stringify(shiftData, null, 2)}`);
            
            const formData = new URLSearchParams({
                action: 'save_shift',
                sheet_name: sheetName,
                data: JSON.stringify(shiftData)
            });
            
            const response = await fetch(scriptUrl, {
                method: 'POST',
                body: formData
            });
            
            const responseText = await response.text();
            addLog('info', `HTTP статус: ${response.status}`);
            addLog('info', `Ответ (текст): ${responseText}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${responseText}`);
            }
            
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                addLog('error', `Ошибка парсинга JSON: ${e.message}`);
                throw new Error(`Не удалось распарсить ответ: ${responseText}`);
            }
            
            if (result.success) {
                addLog('success', `Смена сохранена в Google Sheets: ${result.message || 'успешно'}`);
            } else {
                throw new Error(result.error || 'Неизвестная ошибка');
            }
        } catch (error) {
            addLog('error', `ОШИБКА сохранения смены в Google Sheets: ${error.message}`);
            console.error('Детали ошибки saveActiveShiftToGoogleSheets:', error);
        }
    }
    
    async function closeActiveShiftInGoogleSheets() {
        const activeShift = getActiveShift();
        if (!activeShift) {
            addLog('warning', 'Попытка закрыть смену в Google Sheets, но activeShift = null');
            return;
        }
        
        const config = getGoogleSheetsConfig();
        const scriptUrl = config.scriptUrl;
        if (!scriptUrl) {
            addLog('warning', 'Google Sheets Script URL не настроен');
            return;
        }
        
        addLog('info', `Закрытие смены в Google Sheets: ID=${activeShift.id}, deviceSerial=${activeShift.deviceSerial}`);
        
        try {
            const sheetName = config.sheetName || '[АВТО] Гравёры_отчёты';
            const formData = new URLSearchParams({
                action: 'close_shift',
                sheet_name: sheetName,
                shift_id: activeShift.id,
                device_serial: activeShift.deviceSerial
            });
            
            const response = await fetch(scriptUrl, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            if (result.success) {
                if (result.message && (result.message.includes('уже') || result.message.includes('не критично'))) {
                    addLog('info', `Смена в Google Sheets: ${result.message}`);
                } else {
                    addLog('success', `Смена закрыта в Google Sheets. Закрыта строка ${result.closed_row || 'N/A'}`);
                }
            } else {
                addLog('warning', `Смена в Google Sheets: ${result.error || 'не найдена (возможно уже закрыта)'}`);
            }
        } catch (error) {
            addLog('warning', `Ошибка закрытия смены в Google Sheets: ${error.message}`);
        }
    }
    
    async function saveReportToGoogleSheets(report) {
        const config = getGoogleSheetsConfig();
        const scriptUrl = config.scriptUrl;
        if (!scriptUrl) {
            addLog('warning', 'Google Sheets Script URL не настроен, отчет сохранен только локально');
            return;
        }
        
        try {
            const sheetName = config.sheetName || '[АВТО] Гравёры_отчёты';
            const reportData = {
                id: report.id,
                device_serial: report.deviceSerial,
                device_model: report.deviceModel,
                start_time: report.startTime,
                end_time: report.endTime,
                start_engravings_count: report.startEngravingsCount,
                end_engravings_count: report.endEngravingsCount,
                engravings_count: report.engravingsCount,
                test_engravings: report.testEngravings,
                actual_engravings: report.actualEngravings,
                event_name: report.eventName,
                comment: report.comment || ''
            };
            
            const formData = new URLSearchParams({
                action: 'save_report',
                sheet_name: sheetName,
                data: JSON.stringify(reportData)
            });
            
            const response = await fetch(scriptUrl, {
                method: 'POST',
                body: formData
            });
            
            const responseText = await response.text();
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${responseText}`);
            }
            
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                throw new Error(`Не удалось распарсить ответ: ${responseText}`);
            }
            
            if (result.success) {
                addLog('success', `Отчет сохранен в Google Sheets: ${result.message || 'успешно'}`);
            } else {
                throw new Error(result.error || 'Неизвестная ошибка');
            }
        } catch (error) {
            addLog('error', `ОШИБКА сохранения отчета в Google Sheets: ${error.message}`);
            console.error('Детали ошибки saveReportToGoogleSheets:', error);
        }
    }
    
    // Экспорт функций
    if (typeof window !== 'undefined') {
        window.fetchWorkingInfo = fetchWorkingInfo;
        window.validateStats = validateStats;
        window.openShift = openShift;
        window.showCloseShiftForm = showCloseShiftForm;
        window.cancelCloseShift = cancelCloseShift;
        window.submitReport = submitReport;
        window.loadActiveShift = loadActiveShift;
        window.getActiveShiftFromGoogleSheets = getActiveShiftFromGoogleSheets;
        window.saveActiveShiftToGoogleSheets = saveActiveShiftToGoogleSheets;
        window.closeActiveShiftInGoogleSheets = closeActiveShiftInGoogleSheets;
        window.saveReportToGoogleSheets = saveReportToGoogleSheets;
    }
})();

