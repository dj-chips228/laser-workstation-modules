// Модуль: positioning.js
// Позиционирование и работа с макетами

(function() {
    'use strict';
    
    // Защита от повторного выполнения модуля
    if (window._positioningModuleLoaded) {
        console.warn('⚠️ Модуль positioning уже загружен, пропускаем повторную загрузку');
        return;
    }
    window._positioningModuleLoaded = true;
    
    const addLog = window.addLog || console.log;
    const getCurrentIp = () => window.currentIp;
    const getIsConnected = () => window.isConnected;
    const getFlowState = () => window.flowState;

    const updateChecklist = window.updateChecklist || (() => {});
    const updateTabStatuses = window.updateTabStatuses || (() => {});
    const saveStateToLocalStorage = window.saveStateToLocalStorage || (() => {});
    const activateKeyboardHandler = window.activateKeyboardHandler || (() => {});
    const deactivateKeyboardHandler = window.deactivateKeyboardHandler || (() => {});
    const escapeHtml = window.escapeHtml || ((text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });
    
    // Все функции объявляем внутри IIFE
    async function loadSets() {
    if (!window.supabaseClient) {
        addLog('warning', 'Supabase не инициализирован, наборы не загружены');
        return;
    }
    
    try {
        addLog('info', 'Загрузка наборов...');
        
        const { data, error } = await window.supabaseClient
            .from('sets')
            .select('*')
            .eq('is_active', true)
            .or('is_special.is.null,is_special.eq.false')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Фильтруем специальные наборы
        window.allSets = (data || []).filter(set => set.is_special !== true);
        renderSets();
        
        if (window.allSets.length === 0) {
            addLog('info', 'Нет доступных наборов дизайнов');
        } else {
            addLog('success', `Загружено наборов: ${window.allSets.length}`);
        }
    } catch (error) {
        console.error('Ошибка загрузки наборов:', error);
        addLog('error', `Ошибка загрузки наборов: ${error.message}`);
        const container = document.getElementById('setsContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #dc3545;">
                    Ошибка загрузки наборов. Проверьте подключение к интернету.
                </div>
            `;
        }
    }
}

// Отображение наборов
function renderSets() {
    const container = document.getElementById('setsContainer');
    if (!container) return;
    
    if (window.allSets.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #999;">
                Нет доступных наборов дизайнов
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    // Загружаем количество файлов для каждого набора
    Promise.all(window.allSets.map(async (set) => {
        if (!window.supabaseClient) return { ...set, fileCount: 0 };
        const { count } = await window.supabaseClient
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('set_id', set.id);
        return { ...set, fileCount: count || 0 };
    })).then(setsWithCounts => {
        setsWithCounts.forEach(set => {
            const card = document.createElement('div');
            card.className = 'set-card';
            card.dataset.setId = set.id;
            
            const isSelected = window.selectedSets.has(set.id);
            if (isSelected) {
                card.classList.add('selected');
            }
            
            const hasPassword = set.password && set.password !== null;
            card.innerHTML = `
                <label style="display: flex; align-items: start; cursor: pointer; margin: 0;">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="toggleSet('${set.id.replace(/'/g, "\\'")}')" 
                           style="margin-top: 5px; margin-right: 10px;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 5px 0;">${escapeHtml(set.name)} ${hasPassword ? '🔒' : ''}</h4>
                        ${set.description ? `<p style="margin: 0 0 5px 0; color: #666; font-size: 0.9em;">${escapeHtml(set.description)}</p>` : ''}
                        <div style="color: #999; font-size: 0.85em;">Файлов: ${set.fileCount} ${hasPassword ? '<span style="color: #667eea;">• Защищен паролем</span>' : ''}</div>
                    </div>
                </label>
            `;
            
            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
                    toggleSet(set.id);
                }
            });
            
            container.appendChild(card);
        });
    });
}

// Переключение выбора набора
function toggleSet(setId) {
    if (window.selectedSets.has(setId)) {
        window.selectedSets.delete(setId);
        window.setPasswords.delete(setId);
    } else {
        window.selectedSets.add(setId);
        const set = window.allSets.find(s => s.id === setId);
        if (set && set.password) {
            // Если набор защищен паролем, запрашиваем его
            const password = prompt(`Введите пароль для набора "${set.name}":`);
            if (password) {
                window.setPasswords.set(setId, password);
            } else {
                window.selectedSets.delete(setId);
                return;
            }
        }
    }
    renderSets();
    addLog('info', `Выбрано наборов: ${window.selectedSets.size}`);
}

// escapeHtml уже объявлен выше внутри IIFE

const STANDARD_X = 79.84;
const STANDARD_Y = 78.64;
const FRAMING_WIDTH = 53.98;
const FRAMING_HEIGHT = 85.6;
window.currentX = STANDARD_X;
window.currentY = STANDARD_Y;
window.framingActive = false;
window.framingStarting = false; // Флаг, что фрейминг запускается/перезапускается

// Debounce для накопления команд перемещения
window.moveDebounceTimer = null;
const MOVE_DEBOUNCE_DELAY = 1000; // 1 секунда задержки

async function startFraming() {
    if (!getCurrentIp()) {
        addLog('error', 'Не подключено к устройству!');
        return false;
    }
    
    // Устанавливаем флаг, что фрейминг запускается
    window.framingStarting = true;
    
    try {
        // Сначала останавливаем текущий процесс (выключаем фрейминг)
        // Передаем true, чтобы не сбрасывать window.framingActive (это перезапуск)
        addLog('info', '⏹ Остановка текущего процесса перед запуском фрейминга...');
        await stopFraming(true);
        
        // Ждем 1 секунду перед включением
        addLog('info', '⏳ Ожидание 1 секунда...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const x1 = window.currentX;
        const y1 = window.currentY;
        const x2 = window.currentX + FRAMING_WIDTH;
        const y2 = window.currentY + FRAMING_HEIGHT;
        
        addLog('info', `Параметры: X=${window.currentX.toFixed(2)}mm, Y=${window.currentY.toFixed(2)}mm, Ширина=${FRAMING_WIDTH.toFixed(2)}mm, Высота=${FRAMING_HEIGHT.toFixed(2)}mm`);
        addLog('info', `Координаты прямоугольника:`);
        addLog('info', `  Левый верхний: (${x1.toFixed(3)}, ${y1.toFixed(3)})`);
        addLog('info', `  Правый верхний: (${x2.toFixed(3)}, ${y1.toFixed(3)})`);
        addLog('info', `  Правый нижний: (${x2.toFixed(3)}, ${y2.toFixed(3)})`);
        addLog('info', `  Левый нижний: (${x1.toFixed(3)}, ${y2.toFixed(3)})`);
        
        const gcodeHeader = `\n# GS002 HEAD\nG0 F180000\nM4 S0\nG1 F180000\n\n\nM114 S1\n\n\n\n\n\n\n\n\n\n\n\n\n# GS002 VECTOR HEAD\n# motion_start\n\nG21\nG90\nG0Q30\n\n# blockConfig`;
        const blockConfig = `{"powerFactor": 0.064, "isVector": true, "crossDot": false} `;
        const gcodeBody = `G0X${x1.toFixed(3)}Y${y1.toFixed(3)}\nG1X${x2.toFixed(3)}Y${y1.toFixed(3)}S64F1440000\nG1X${x2.toFixed(3)}Y${y2.toFixed(3)}\nG1X${x1.toFixed(3)}Y${y2.toFixed(3)}\nG1X${x1.toFixed(3)}Y${y1.toFixed(3)}\n# END`;
        const gcodeTail = `\n# GS002 TAIL\n\n\n\n\n\n\nG90\nG0 S0\nG0 F180000\nG1 F180000\nM536 U0\nM6 P1\n\n`;
        const fullGcode = gcodeHeader + blockConfig + gcodeBody + gcodeTail;
        
        const url = `http://${getCurrentIp()}:8080/processing/upload?gcodeType=frame&fileType=txt&autoStart=1&loopPrint=1`;
        
        addLog('info', `📡 Отправка запроса на: ${url}`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': fullGcode.length.toString(),
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-GB',
                'Connection': 'keep-alive'
            },
            body: fullGcode
        });
        
        const responseText = await response.text();
        
        if (response.ok) {
            try {
                const responseJson = JSON.parse(responseText);
                if (responseJson.code === 0) {
                    window.framingActive = true;
                    window.framingStarting = false; // Сбрасываем флаг после успешного запуска
                    
                    // Обновляем кнопку переключения
                    const toggleBtn = document.getElementById('toggleFramingBtn');
                    if (toggleBtn) {
                        toggleBtn.textContent = '⏹️ Выключить фрейминг';
                    }
                    
                    addLog('success', '✅ Framing успешно запущен!');
                    return true;
                } else {
                    window.framingStarting = false; // Сбрасываем флаг при ошибке
                    throw new Error(`Код ошибки ${responseJson.code}: ${responseJson.msg || responseText}`);
                }
            } catch (e) {
                if (responseText.includes('code') && responseText.includes('103')) {
                    throw new Error('Устройство занято. Попробуйте остановить текущий процесс и повторить попытку.');
                }
                throw new Error(`Неожиданный ответ: ${responseText}`);
            }
        } else {
            throw new Error(`HTTP ${response.status}: ${responseText}`);
        }
    } catch (error) {
        window.framingStarting = false; // Сбрасываем флаг при ошибке
        window.framingActive = false;
        addLog('error', `Ошибка при запуске Framing: ${error.message}`);
        return false;
    }
}

async function stopFraming(skipFramingActiveReset = false) {
    if (!getCurrentIp()) return;
    
    try {
        addLog('info', '⏹ Остановка текущего процесса...');
        
        // Пробуем остановить через /processing/stop
        try {
            const stopResponse = await fetch(`http://${getCurrentIp()}:8080/processing/stop`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            
            if (stopResponse.ok) {
                const stopData = await stopResponse.text();
                addLog('info', `✅ Процесс остановлен: ${stopData}`);
            }
        } catch (e) {
            addLog('warning', `⚠️ Не удалось остановить через /processing/stop: ${e.message}`);
        }
        
        // Также отправляем команду M112 (аварийная остановка)
        try {
            await fetch(`http://${getCurrentIp()}:8080/cnc/cmd?cmd=M112&dest=33&wait=false&force=0`, {
                method: 'GET',
                mode: 'cors'
            });
            addLog('info', '✅ Отправлена команда M112 (аварийная остановка)');
        } catch (e) {
            addLog('warning', `⚠️ Не удалось отправить M112: ${e.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Сбрасываем window.framingActive только если это не перезапуск (skipFramingActiveReset = true)
        if (!skipFramingActiveReset) {
            window.framingActive = false;
            window.framingStarting = false;
            // Обновляем кнопку переключения
            const toggleBtn = document.getElementById('toggleFramingBtn');
            if (toggleBtn) {
                toggleBtn.textContent = '▶️ Включить фрейминг';
            }
            
            // Деактивируем обработчик клавиатуры при остановке фрейминга
            deactivateKeyboardHandler();
        }
    } catch (error) {
        addLog('warning', `⚠️ Ошибка при остановке процесса: ${error.message}`);
    }
}

async function startPositioning() {
    if (!getIsConnected()) {
        addLog('error', 'Сначала подключитесь к лазеру');
        return;
    }
    
    // Загружаем предыдущие смещения
    loadPreviousOffsets();
    
    // Показываем элементы управления
    document.getElementById('position-controls').style.display = 'block';
    document.getElementById('toggleFramingBtn').disabled = false;
    updateCoordinatesDisplay();
    
    // Если фрейминг еще не запущен, запускаем его
    if (!window.framingActive) {
        await toggleFraming();
    }
}

async function toggleFraming() {
    if (!getIsConnected()) {
        addLog('error', 'Сначала подключитесь к лазеру');
        return;
    }
    
    const btn = document.getElementById('toggleFramingBtn');
    btn.disabled = true;
    btn.classList.add('loading');
    
    try {
        if (window.framingActive) {
            // Выключаем фрейминг
            addLog('info', 'Остановка фрейминга...');
            await stopFraming(false); // false = полная остановка (не перезапуск)
            btn.textContent = '▶️ Включить фрейминг';
            document.getElementById('position-status').textContent = '⏸️ Фрейминг остановлен';
            deactivateKeyboardHandler();
        } else {
            // Включаем фрейминг
            addLog('info', 'Запуск фрейминга...');
            const success = await startFraming();
            
            if (success) {
                btn.textContent = '⏹️ Выключить фрейминг';
                document.getElementById('position-status').textContent = '✅ Фрейминг активен. Используйте стрелки для перемещения.';
                
                // Активируем обработчик клавиатуры, если активна вкладка позиционирования
                const positionTab = document.getElementById('tab-position');
                if (positionTab && positionTab.classList.contains('active')) {
                    activateKeyboardHandler();
                }
            } else {
                throw new Error('Не удалось запустить фрейминг');
            }
        }
    } catch (error) {
        addLog('error', `Ошибка: ${error.message}`);
        document.getElementById('position-status').textContent = `❌ Ошибка: ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

function moveFraming(deltaX, deltaY) {
    if (!getCurrentIp()) {
        addLog('error', 'Не подключено к устройству!');
        return;
    }
    
    // Блокируем повторные вызовы во время перезапуска фрейминга
    if (window.framingStarting) {
        return;
    }
    
    // Накопление изменений координат
    window.currentX += deltaX;
    window.currentY += deltaY;
    
    // Округляем до 2 знаков после запятой
    window.currentX = Math.round(window.currentX * 100) / 100;
    window.currentY = Math.round(window.currentY * 100) / 100;
    
    updateCoordinatesDisplay();
    
    addLog('info', `Перемещение: X=${deltaX >= 0 ? '+' : ''}${deltaX.toFixed(2)}mm, Y=${deltaY >= 0 ? '+' : ''}${deltaY.toFixed(2)}mm`);
    addLog('info', `Новые координаты: X=${window.currentX.toFixed(2)}mm, Y=${window.currentY.toFixed(2)}mm`);
    
    const offsetX = window.currentX - STANDARD_X;
    const offsetY = window.currentY - STANDARD_Y;
    addLog('info', `Смещение от стандартных: X=${offsetX >= 0 ? '+' : ''}${offsetX.toFixed(2)}mm, Y=${offsetY >= 0 ? '+' : ''}${offsetY.toFixed(2)}mm`);
    
    // Очищаем предыдущий таймер
    if (window.moveDebounceTimer) {
        clearTimeout(window.moveDebounceTimer);
    }
    
    // Устанавливаем новый таймер для применения изменений
    window.moveDebounceTimer = setTimeout(async () => {
        if (window.framingActive && !window.framingStarting) {
            addLog('info', '⏳ Применение накопленных изменений...');
            await startFraming();
        }
        window.moveDebounceTimer = null;
    }, MOVE_DEBOUNCE_DELAY);
}

async function resetFraming() {
    window.currentX = STANDARD_X;
    window.currentY = STANDARD_Y;
    updateCoordinatesDisplay();
    addLog('info', 'Сброс к стандартным координатам');
    if (window.framingActive) {
        await startFraming();
    }
}

function updateCoordinatesDisplay() {
    document.getElementById('current-x').textContent = window.currentX.toFixed(2);
    document.getElementById('current-y').textContent = window.currentY.toFixed(2);
    
    const offsetX = window.currentX - STANDARD_X;
    const offsetY = window.currentY - STANDARD_Y;
    document.getElementById('offset-x').textContent = (offsetX >= 0 ? '+' : '') + offsetX.toFixed(2);
    document.getElementById('offset-y').textContent = (offsetY >= 0 ? '+' : '') + offsetY.toFixed(2);
}

function loadPreviousOffsets() {
    try {
        const saved = localStorage.getItem('framingOffsets');
        if (saved) {
            const offsets = JSON.parse(saved);
            window.currentX = STANDARD_X + (offsets.x || 0);
            window.currentY = STANDARD_Y + (offsets.y || 0);
            addLog('info', `Загружены предыдущие смещения: X=${offsets.x || 0}, Y=${offsets.y || 0}`);
        }
    } catch (error) {
        console.error('Ошибка загрузки смещений:', error);
    }
}

    async function savePositioning() {
        const offsetX = window.currentX - STANDARD_X;
        const offsetY = window.currentY - STANDARD_Y;
        
        // Сохраняем локально
        localStorage.setItem('framingOffsets', JSON.stringify({ x: offsetX, y: offsetY }));
    }
    
    // Экспортируем функции
    if (typeof window !== 'undefined') {
        window.loadSets = loadSets;
        window.renderSets = renderSets;
        window.toggleSet = toggleSet;
        window.startFraming = startFraming;
        window.stopFraming = stopFraming;
        window.startPositioning = startPositioning;
        window.toggleFraming = toggleFraming;
        window.moveFraming = moveFraming;
        window.resetFraming = resetFraming;
        window.updateCoordinatesDisplay = updateCoordinatesDisplay;
        window.loadPreviousOffsets = loadPreviousOffsets;
        window.savePositioning = savePositioning;
        window.uploadCalibratedTemplatesToMemory = uploadCalibratedTemplatesToMemory;
        window.downloadCalibratedTemplates = downloadCalibratedTemplates;
        window.escapeHtml = escapeHtml;
    }
})();
