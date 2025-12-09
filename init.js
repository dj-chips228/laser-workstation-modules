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

// Инициализируем flowState сразу (до того, как другие модули начнут его использовать)
if (typeof window !== 'undefined') {
    if (!window.flowState) {
        window.flowState = {
            shiftOpened: false,
            autofocusCompleted: false,
            positioningCompleted: false,
            templatesUploaded: false
        };
    }
}

// Экспортируем функции сразу (до load event)
if (typeof window !== 'undefined') {
    window.initSupabase = initSupabase;
    window.waitForSupabase = waitForSupabase;
    window.saveStateToLocalStorage = saveStateToLocalStorage;
    window.loadStateFromLocalStorage = loadStateFromLocalStorage;
}

// Инициализируем Supabase сразу при загрузке модуля
initSupabase();

window.addEventListener('load', () => {
    // НЕ сбрасываем shiftOpened при загрузке - он будет восстановлен из Google Sheets после подключения
    // Сбрасываем только локальные статусы (автофокус, позиционирование, загрузка)
    window.flowState.autofocusCompleted = false;
    window.flowState.positioningCompleted = false;
    window.flowState.templatesUploaded = false;
    // Сбрасываем чеклист (кроме shift - он восстановится после проверки активной смены)
    window.updateChecklist('focus', false);
    window.updateChecklist('position', false);
    window.updateChecklist('upload', false);
    // Скрываем детали смены и формы (они появятся если найдется активная смена)
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
    // НЕ вызываем updateTabStatuses() здесь - он будет вызван после подключения и проверки активной смены
    // window.updateTabStatuses();
    // Настройки Google Sheets теперь хардкодятся в коде, не используем localStorage
    // Загружаем наборы после инициализации Supabase и загрузки всех модулей
    // Вызов loadSets будет в основном загрузчике модулей после загрузки positioning.js
});

})();
