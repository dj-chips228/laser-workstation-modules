// Модуль: ui.js
// UI функции и вспомогательные функции

(function() {
    'use strict';
    
    const addLog = window.addLog || console.log;
    const getIsConnected = () => {
        const connected = window.isConnected && window.currentIp;
        if (!connected && (window.isConnected || window.currentIp)) {
            console.warn('⚠️ Частичное подключение:', { isConnected: window.isConnected, currentIp: window.currentIp });
        }
        return connected;
    };
    const getFlowState = () => window.flowState;
    const getActiveShift = () => window.activeShift;
    const getFramingActive = () => window.framingActive;
    const getMoveFraming = () => window.moveFraming;
    // activateKeyboardHandler и deactivateKeyboardHandler объявляются как функции ниже
    
    // Все функции объявляем внутри IIFE
    function switchTab(tabName) {
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    // Убираем активный класс у всех элементов чеклиста
    document.querySelectorAll('.checklist-item').forEach(item => {
        item.classList.remove('active');
    });
    // Показываем выбранную вкладку
    document.getElementById(`tab-${tabName}`).classList.add('active');
    // Активируем соответствующий элемент чеклиста
    const checklistItem = document.getElementById(`checklist-${tabName}`);
    if (checklistItem) {
        checklistItem.classList.add('active');
    }
    // Активируем/деактивируем обработчик клавиатуры для вкладки позиционирования
    if (tabName === 'position') {
        window.activateKeyboardHandler();
    } else {
        deactivateKeyboardHandler();
    }
    window.updateTabStatuses();
}

    function activateKeyboardHandler() {
    if (window.window.window.window.keyboardHandlerActive) return;
    window.window.keyboardHandler = (event) => {
        // Работаем только если активна вкладка позиционирования
        const positionTab = document.getElementById('tab-position');
        if (!positionTab || !positionTab.classList.contains('active')) {
            return;
        }
        // Работаем только если фрейминг активен
        // (window.moveFraming сам проверит framingStarting и заблокирует повторные вызовы)
        if (!getFramingActive()) {
            return;
        }
        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                getMoveFraming()(0, -0.1);
                break;
            case 'ArrowDown':
                event.preventDefault();
                getMoveFraming()(0, 0.1);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                getMoveFraming()(-0.1, 0);
                break;
            case 'ArrowRight':
                event.preventDefault();
                getMoveFraming()(0.1, 0);
                break;
        }
    };
    document.addEventListener('keydown', window.window.keyboardHandler);
    window.window.window.window.keyboardHandlerActive = true;
    addLog('info', '⌨️ Управление клавиатурой активировано (стрелки ←→↑↓)');
}

    function deactivateKeyboardHandler() {
    if (!window.window.window.window.keyboardHandlerActive || !window.window.keyboardHandler) return;
    document.removeEventListener('keydown', window.window.keyboardHandler);
    window.window.window.window.keyboardHandlerActive = false;
    window.window.keyboardHandler = null;
}

    function updateTabStatuses() {
    // Статус вкладки "Смена"
    const shiftStatus = document.getElementById('shift-status');
    if (!getIsConnected()) {
        shiftStatus.textContent = 'Подключитесь к лазеру для работы со сменами';
    } else if (getFlowState().shiftOpened) {
        if (getActiveShift()) {
            const startTime = new Date(getActiveShift().startTime).toLocaleString('ru-RU');
            shiftStatus.textContent = `✅ Смена открыта: ${startTime}`;
        } else {
            shiftStatus.textContent = '✅ Смена открыта';
        }
    } else {
        shiftStatus.textContent = 'Готово к открытию смены';
    }
    // Статус вкладки "Автофокус"
    const focusStatus = document.getElementById('focus-status');
    if (!getIsConnected()) {
        focusStatus.textContent = 'Подключитесь к лазеру для выполнения автофокусировки';
    } else if (getFlowState().autofocusCompleted) {
        focusStatus.textContent = '✅ Автофокусировка выполнена';
    } else {
        focusStatus.textContent = 'Готово к выполнению автофокусировки';
    }
    // Статус вкладки "Макеты"
    const positionStatus = document.getElementById('position-status');
    if (!getIsConnected()) {
        positionStatus.textContent = 'Подключитесь к лазеру для работы с макетами';
    } else if (getFlowState().positioningCompleted) {
        positionStatus.textContent = '✅ Позиционирование завершено';
    } else {
        positionStatus.textContent = 'Готово к работе с макетами';
    }
    // Статус вкладки "Загрузка"
    const uploadStatus = document.getElementById('upload-status');
    if (!getIsConnected()) {
        uploadStatus.textContent = 'Подключитесь к лазеру для загрузки макетов';
    } else if (getFlowState().templatesUploaded) {
        uploadStatus.textContent = '✅ Макеты загружены в память';
    } else {
        uploadStatus.textContent = 'Выберите архивы с откалиброванными макетами';
    }
}

function updateChecklist(item, completed) {
    const checklistItem = document.getElementById(`checklist-${item}`);
    if (completed) {
        checklistItem.classList.add('completed');
        checklistItem.querySelector('.check-icon').textContent = '✅';
    } else {
        checklistItem.classList.remove('completed');
        checklistItem.querySelector('.check-icon').textContent = '⭕';
    }
}

function getGoogleSheetsConfig() {
    // Хардкод настроек Google Sheets - не используем localStorage, так как программа используется на разных компьютерах
    const sheetsId = '1yI8zjx0MpuxKxnFpihGNR7-LziZZRiJ0TEf78LZW0S4';
    const sheetName = '[АВТО] Гравёры_отчёты';
    const scriptUrl = 'https://script.google.com/macros/s/AKfycby6bduqcJ-RmTuaNG22qz1hTy38dMcTC-yothPGEgUwCaqD78LnBDc8o_jdx9Grqw6Iow/exec';
    return { sheetsId, sheetName, scriptUrl };
}

async function checkGoogleSheetsConnection() {
    const config = getGoogleSheetsConfig();
    const scriptUrl = config.scriptUrl;
    if (!scriptUrl) {
        addLog('warning', 'Google Sheets Script URL не настроен');
        return;
    }
    try {
        addLog('info', '=== ПРОВЕРКА ПОДКЛЮЧЕНИЯ К GOOGLE SHEETS ===');
        addLog('warning', '⚠️ ВАЖНО: Скрипт работает с таблицей, в которой он был создан!');
        addLog('warning', '⚠️ Если скрипт создан в таблице A, а ты открываешь таблицу B - строки будут в таблице A!');
        // Проверяем через doGet (должен работать даже со старым скриптом)
        const getResponse = await fetch(scriptUrl);
        const getResult = await getResponse.json();
        addLog('info', `doGet ответ: ${JSON.stringify(getResult, null, 2)}`);
        if (getResult.spreadsheet_id) {
            addLog('success', `✅ Скрипт работает с таблицей: ${getResult.spreadsheet_name || 'неизвестно'}`);
            addLog('info', `ID таблицы: ${getResult.spreadsheet_id}`);
            addLog('info', `URL таблицы: ${getResult.spreadsheet_url || 'не указан'}`);
            addLog('warning', `🔍 Открой эту таблицу и проверь, есть ли там лист "[АВТО] Гравёры_отчёты"`);
            addLog('warning', `🔍 Если это не та таблица - нужно создать скрипт в правильной таблице!`);
        } else {
            addLog('warning', '⚠️ Скрипт не возвращает информацию о таблице (старая версия)');
            addLog('warning', '⚠️ Обнови скрипт в Google Apps Script на версию с отладкой!');
            addLog('info', '📝 Инструкция:');
            addLog('info', '   1. Открой таблицу → Расширения → Apps Script');
            addLog('info', '   2. Замени код на версию из файла google_apps_script_with_debug.js');
            addLog('info', '   3. Сохрани и разверни заново');
        }
        // Пробуем через doPost с action=get_info (если скрипт обновлен)
        try {
            const formData = new URLSearchParams({
                action: 'get_info'
            });
            const postResponse = await fetch(scriptUrl, {
                method: 'POST',
                body: formData
            });
            const postResult = await postResponse.json();
            if (postResult.success && postResult.spreadsheet_id) {
                addLog('success', `✅ Скрипт работает с таблицей: ${postResult.spreadsheet_name}`);
                addLog('info', `ID таблицы: ${postResult.spreadsheet_id}`);
                addLog('info', `URL таблицы: ${postResult.spreadsheet_url}`);
                addLog('info', `Листы в таблице: ${postResult.sheets.map(s => `${s.name} (${s.last_row} строк)`).join(', ')}`);
            }
        } catch (e) {
            // Игнорируем, если action не поддерживается
        }
    } catch (error) {
        addLog('error', `Ошибка проверки подключения: ${error.message}`);
        console.error('Детали ошибки:', error);
    }
}
    
    // Экспортируем функции
    if (typeof window !== 'undefined') {
        window.switchTab = switchTab;
        window.activateKeyboardHandler = activateKeyboardHandler;
        window.deactivateKeyboardHandler = deactivateKeyboardHandler;
        window.updateTabStatuses = updateTabStatuses;
        window.updateChecklist = updateChecklist;
        window.getGoogleSheetsConfig = getGoogleSheetsConfig;
        window.checkGoogleSheetsConnection = checkGoogleSheetsConnection;
    }
})();
