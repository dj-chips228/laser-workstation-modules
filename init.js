// Модуль: init.js
// Инициализация приложения

(function() {
    'use strict';
    
    const addLog = window.addLog || console.log;
    
    // Константы Supabase
    const SUPABASE_URL = 'https://dnvkgezmdmszchaxutlv.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudmtnZXptZG1zemNoYXh1dGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwODA2OTIsImV4cCI6MjA3ODY1NjY5Mn0.qG0rFfDE2qqo_-Np_UjfQDlZlKSIPaRW8PJJ_UDgRik';
    
    // Все функции объявляем внутри IIFE
    function initSupabase() {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        addLog('info', 'Supabase инициализирован');
        return true;
    }
    return false;
}

    function waitForSupabase(maxAttempts = 20) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.supabaseClient) {
                clearInterval(checkInterval);
                resolve(window.supabaseClient);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                reject(new Error('Таймаут инициализации Supabase'));
            }
        }, 100);
    });
}

    function saveStateToLocalStorage() {
    const state = {
        currentIp: window.currentIp,
        deviceInfo: window.deviceInfo,
        isConnected: window.isConnected,
        flowState: window.flowState
    };
    localStorage.setItem('laserWorkstationState', JSON.stringify(state));
}

    function loadStateFromLocalStorage() {
    try {
        const saved = localStorage.getItem('laserWorkstationState');
        if (saved) {
            const state = JSON.parse(saved);
            // Загружаем только IP адрес (для удобства пользователя)
            if (state.currentIp) {
                document.getElementById('deviceIp').value = state.currentIp;
            }
            // НЕ загружаем window.flowState при загрузке страницы - статусы должны быть сброшены
            // Они будут восстановлены только после подключения к устройству
        }
    } catch (error) {
        console.error('Ошибка загрузки состояния:', error);
    }
}

// Инициализируем Supabase сразу при загрузке модуля
initSupabase();

window.addEventListener('load', () => {
    // Сбрасываем все статусы при загрузке страницы
    window.flowState.shiftOpened = false;
    window.flowState.autofocusCompleted = false;
    window.flowState.positioningCompleted = false;
    window.flowState.templatesUploaded = false;
    // Сбрасываем чеклист
    window.updateChecklist('shift', false);
    window.updateChecklist('focus', false);
    window.updateChecklist('position', false);
    window.updateChecklist('upload', false);
    // Скрываем детали смены и формы
    const shiftDetails = document.getElementById('shift-details');
    if (shiftDetails) shiftDetails.style.display = 'none';
    const closeShiftForm = document.getElementById('closeShiftForm');
    if (closeShiftForm) closeShiftForm.classList.remove('active');
    // Деактивируем кнопки до подключения
    document.getElementById('openShiftBtn').disabled = true;
    document.getElementById('closeShiftBtn').disabled = true;
    document.getElementById('autofocusBtn').disabled = true;
    document.getElementById('positionBtn').disabled = true;
    document.getElementById('toggleFramingBtn').disabled = true;
    // Загружаем только IP из localStorage (не статусы)
    window.loadStateFromLocalStorage();
    // Обновляем статусы вкладок (покажут "Подключитесь к лазеру...")
    window.updateTabStatuses();
    // Автоматически обновляем URL скрипта на правильный
    const correctScriptUrl = 'https://script.google.com/macros/s/AKfycbyAMCwnycprSlT9rFO5vkSfGUJpoQoEDH3QGV6P_nNShRyveQXInPXedrb6Zu9Kf5K87A/exec';
    const currentUrl = localStorage.getItem('googleSheetsScriptUrl');
    if (currentUrl !== correctScriptUrl) {
        localStorage.setItem('googleSheetsScriptUrl', correctScriptUrl);
        addLog('info', 'URL скрипта Google Sheets обновлен на правильный');
    }
    // Загружаем наборы после инициализации Supabase и загрузки всех модулей
    // Вызов loadSets будет в основном загрузчике модулей после загрузки positioning.js
    
    // Экспортируем функции
    if (typeof window !== 'undefined') {
        window.initSupabase = initSupabase;
        window.waitForSupabase = waitForSupabase;
        window.saveStateToLocalStorage = saveStateToLocalStorage;
        window.loadStateFromLocalStorage = loadStateFromLocalStorage;
    }
});

})();
