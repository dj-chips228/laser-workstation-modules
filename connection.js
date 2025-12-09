// Модуль: connection.js
// Функции подключения к устройству

(function() {
    'use strict';
    
    // Защита от повторного выполнения модуля
    if (window._connectionModuleLoaded) {
        console.warn('⚠️ Модуль connection уже загружен, пропускаем повторную загрузку');
        return;
    }
    window._connectionModuleLoaded = true;
    
    // Используем функции из глобальной области
    const addLog = window.addLog || console.log;
    
    // Все функции объявляем внутри IIFE
    async function searchForDevice() {
        const btn = document.getElementById('searchBtn');
        if (!btn) return;
        
        btn.disabled = true;
        btn.classList.add('loading');
        updateConnectionStatus('info', '🔍 Поиск устройства...');
        addLog('info', 'Начинаю поиск устройства в локальной сети...');
        
        const commonIPs = [
            '201.234.4.1',
            '201.234.3.1',
            '192.168.1.100',
            '192.168.0.100'
        ];
        
        for (const ip of commonIPs) {
            try {
                const response = await fetch(`http://${ip}:8080/device/info`, {
                    method: 'GET',
                    timeout: 2000
                });
                
                if (response.ok) {
                    document.getElementById('deviceIp').value = ip;
                    updateConnectionStatus('ready', `✅ Устройство найдено: ${ip}`);
                    addLog('success', `Устройство найдено: ${ip}`);
                    btn.disabled = false;
                    btn.classList.remove('loading');
                    await connectToDevice();
                    return;
                }
            } catch (error) {
                // Продолжаем поиск
            }
        }
        
        updateConnectionStatus('error', '❌ Устройство не найдено автоматически');
        addLog('warning', 'Устройство не найдено автоматически. Введите IP вручную.');
        btn.disabled = false;
        btn.classList.remove('loading');
    }
    
    async function connectToDevice() {
        const ip = document.getElementById('deviceIp').value.trim();
        if (!ip) {
            addLog('error', 'Введите IP адрес устройства');
            return;
        }
        
        const btn = document.getElementById('connectBtn');
        btn.disabled = true;
        btn.classList.add('loading');
        updateConnectionStatus('info', 'Подключение к устройству...');
        addLog('info', `Подключение к устройству ${ip}...`);
        
        try {
            // Получаем информацию об устройстве
            let deviceInfoResponse = null;
            const endpoints = ['/device/machineInfo', '/device/info', '/device/status'];
            
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(`http://${ip}:8080${endpoint}`);
                    if (response.ok) {
                        const text = await response.text();
                        try {
                            const data = JSON.parse(text);
                            window.deviceInfo = data.data || data;
                            addLog('success', `Информация об устройстве получена через ${endpoint}`);
                            deviceInfoResponse = response;
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!window.deviceInfo) {
                throw new Error('Не удалось получить информацию об устройстве');
            }
            
            // Устанавливаем переменные подключения синхронно
            window.currentIp = ip;
            window.isConnected = true;
            
            // Убеждаемся, что обе переменные установлены
            if (!window.currentIp || !window.isConnected) {
                throw new Error('Ошибка установки состояния подключения');
            }
            
            // Получаем статистику устройства для работы со сменами
            try {
                const statsResponse = await fetch(`http://${ip}:8080/device/workingInfo`);
                if (statsResponse.ok) {
                    const statsText = await statsResponse.text();
                    try {
                        const statsData = JSON.parse(statsText);
                        window.currentStats = statsData.data || statsData;
                        addLog('info', 'Статистика устройства получена');
                    } catch (e) {
                        addLog('warning', 'Не удалось распарсить статистику устройства');
                    }
                }
            } catch (statsError) {
                addLog('warning', `Не удалось получить статистику устройства: ${statsError.message}`);
            }
            
            updateConnectionStatus('connected', `✅ Подключено: ${ip}`);
            addLog('success', `Подключено к устройству: ${ip}`);
            
            // Сохраняем IP
            localStorage.setItem('deviceIp', ip);
            
            // Активируем кнопки
            document.getElementById('openShiftBtn').disabled = false;
            document.getElementById('closeShiftBtn').disabled = false;
            document.getElementById('autofocusBtn').disabled = false;
            document.getElementById('positionBtn').disabled = false;
            document.getElementById('toggleFramingBtn').disabled = false;
            
            // Обновляем статусы вкладок с небольшой задержкой, чтобы убедиться, что все переменные установлены
            if (window.updateTabStatuses) {
                setTimeout(() => {
                    updateTabStatuses();
                }, 100);
            }
            
        } catch (error) {
            addLog('error', `Ошибка подключения: ${error.message}`);
            updateConnectionStatus('error', `❌ Ошибка: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }
    
    function updateConnectionStatus(type, message) {
        const statusEl = document.getElementById('connectionStatus');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `connection-status ${type}`;
    }
    
    // Экспортируем функции
    if (typeof window !== 'undefined') {
        window.searchForDevice = searchForDevice;
        window.connectToDevice = connectToDevice;
        window.updateConnectionStatus = updateConnectionStatus;
    }
})();
