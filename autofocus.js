// Модуль: autofocus.js
// Все функции автофокусировки

(function() {
    'use strict';
    
    // Защита от повторного выполнения модуля
    if (window._autofocusModuleLoaded) {
        console.warn('⚠️ Модуль autofocus уже загружен, пропускаем повторную загрузку');
        return;
    }
    window._autofocusModuleLoaded = true;
    
    // Используем глобальные функции
    const addLog = window.addLog || console.log;
    const updateChecklist = window.updateChecklist || (() => {});
    const updateTabStatuses = window.updateTabStatuses || (() => {});
    const saveStateToLocalStorage = window.saveStateToLocalStorage || (() => {});
    
    // Доступ к глобальным переменным
    const getCurrentIp = () => window.currentIp;
    const getIsConnected = () => window.isConnected && window.currentIp;
    const getFlowState = () => window.flowState;
    
    // Локальные переменные модуля (внутри IIFE)
    let currentZ = 0;
    const FOCUS_TOLERANCE = 3;
    
    // Экспортируем currentZ для доступа из других модулей
    Object.defineProperty(window, 'currentZ', {
        get: () => currentZ,
        set: (val) => { currentZ = val; },
        enumerable: true,
        configurable: true
    });
    
    // Все функции объявляем внутри IIFE для доступа к currentZ
    async function setFillLight(value) {
    try {
        const response = await fetch(`http://${getCurrentIp()}:8080/peripheral/fill_light`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set_bri', idx: 0, value: value })
        });
        if (response.ok) {
            addLog('success', `✅ Подсветка установлена: ${value}`);
            await new Promise(resolve => setTimeout(resolve, 300));
            return true;
        } else {
            const altResponse = await fetch(`http://${getCurrentIp()}:8080/peripheral/fill_light`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: value })
            });
            if (altResponse.ok) {
                addLog('success', `✅ Подсветка установлена (альтернативный формат): ${value}`);
                await new Promise(resolve => setTimeout(resolve, 300));
                return true;
            }
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        addLog('warning', `Не удалось установить подсветку: ${error.message}`);
        return false;
    }
}

async function setExposure(value) {
    try {
        const response = await fetch(`http://${getCurrentIp()}:8329/camera/exposure?stream=0`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: value })
        });
        if (response.ok) {
            addLog('success', `✅ Экспозиция установлена: ${value}`);
            await new Promise(resolve => setTimeout(resolve, 300));
            return true;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        addLog('warning', `Не удалось установить экспозицию: ${error.message}`);
        return false;
    }
}

async function moveToBottom() {
    addLog('info', 'Перемещение в нижнее положение (z=0mm)...');
    try {
        const response = await fetch(`http://${getCurrentIp()}:8080/focus/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'goTo', z: 0, stopFirst: 1, F: 500 })
        });
        if (response.ok) {
            addLog('success', '✅ Команда перемещения отправлена');
            await new Promise(resolve => setTimeout(resolve, 4000));
            addLog('success', '✅ Модуль в нижнем положении');
            return true;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        addLog('error', `❌ Ошибка перемещения: ${error.message}`);
        return false;
    }
}

async function moveZAxis(z) {
    try {
        const response = await fetch(`http://${getCurrentIp()}:8080/focus/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'goTo', z: z, stopFirst: 1, F: 500 })
        });
        if (response.ok) {
            const waitTime = Math.max(2000, Math.abs(z) * 400);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return true;
        }
        return false;
    } catch (error) {
        addLog('error', `Ошибка перемещения Z: ${error.message}`);
        return false;
    }
}

async function moveZAxisRelative(offset) {
    const oldZ = currentZ || 0;
    const newZ = oldZ + offset;
    addLog('info', `Относительное перемещение Z-оси: ${offset > 0 ? '+' : ''}${offset.toFixed(2)}mm (${oldZ.toFixed(2)}mm → ${newZ.toFixed(2)}mm)`);
    const result = await moveZAxis(newZ);
    if (result) {
        currentZ = newZ;
        addLog('info', `✅ Позиция обновлена: ${currentZ.toFixed(2)}mm`);
    }
    return result;
}

// Константы и вспомогательные функции для автофокуса через две точки
// FOCUS_TOLERANCE уже объявлен выше в модуле

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((sorted.length - 1) * p / 100);
    return sorted[index];
}

function morphologicalOpen(mask, width, height, kernelSize = 3) {
    const result = new Uint8Array(width * height);
    const halfKernel = Math.floor(kernelSize / 2);
    const eroded = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            let minVal = 255;
            for (let ky = -halfKernel; ky <= halfKernel; ky++) {
                for (let kx = -halfKernel; kx <= halfKernel; kx++) {
                    const nx = x + kx, ny = y + ky;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nIdx = ny * width + nx;
                        if (mask[nIdx] < minVal) minVal = mask[nIdx];
                    }
                }
            }
            eroded[idx] = minVal;
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            let maxVal = 0;
            for (let ky = -halfKernel; ky <= halfKernel; ky++) {
                for (let kx = -halfKernel; kx <= halfKernel; kx++) {
                    const nx = x + kx, ny = y + ky;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nIdx = ny * width + nx;
                        if (eroded[nIdx] > maxVal) maxVal = eroded[nIdx];
                    }
                }
            }
            result[idx] = maxVal;
        }
    }
    return result;
}

function calculateCentroid(contour) {
    if (contour.length === 0) return null;
    let sumX = 0, sumY = 0;
    contour.forEach(([x, y]) => { sumX += x; sumY += y; });
    return { x: sumX / contour.length, y: sumY / contour.length, area: contour.length };
}

function floodFill(mask, visited, startX, startY, width, height) {
    const pixels = [];
    const stack = [[startX, startY]];
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (visited[idx] === 1 || mask[idx] === 0) continue;
        visited[idx] = 1;
        pixels.push([x, y]);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return pixels;
}

function detectLaserPoints(img, minContourArea = 10, maxContourArea = 2000, whitenessThreshold = 240, roiTopPercent = 70) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    const centerXMin = Math.floor(width * 0.4);
    const centerXMax = Math.floor(width * 0.6);
    const centerYMin = Math.floor(height * 0.4);
    const centerYMax = Math.floor(height * 0.6);
    const redness = [];
    const blueness = [];
    for (let y = centerYMin; y < centerYMax; y++) {
        for (let x = centerXMin; x < centerXMax; x++) {
            const dataIdx = (y * width + x) * 4;
            const r = data[dataIdx], g = data[dataIdx + 1], b = data[dataIdx + 2];
            redness.push(Math.max(0, r - g - b));
            blueness.push(Math.max(0, b - r - g));
        }
    }
    const redThreshold = percentile(redness, 99.9);
    const blueThreshold = percentile(blueness, 99.9);
    const redMask = new Uint8Array(width * height);
    const blueMask = new Uint8Array(width * height);
    let redPixelCount = 0;
    let bluePixelCount = 0;
    let pixelIndex = 0;
    for (let y = centerYMin; y < centerYMax; y++) {
        for (let x = centerXMin; x < centerXMax; x++) {
            const idx = y * width + x;
            const red = redness[pixelIndex];
            const blue = blueness[pixelIndex];
            pixelIndex++;
            if (red > redThreshold) {
                redMask[idx] = 255;
                redPixelCount++;
            }
            if (blue > blueThreshold) {
                blueMask[idx] = 255;
                bluePixelCount++;
            }
        }
    }
    const cleanedRedMask = morphologicalOpen(redMask, width, height, 3);
    const cleanedBlueMask = morphologicalOpen(blueMask, width, height, 3);
    const redContours = [];
    const blueContours = [];
    const visitedRed = new Uint8Array(width * height);
    const visitedBlue = new Uint8Array(width * height);
    for (let y = centerYMin; y < centerYMax; y++) {
        for (let x = centerXMin; x < centerXMax; x++) {
            const idx = y * width + x;
            if (cleanedRedMask[idx] === 255 && visitedRed[idx] === 0) {
                const contour = floodFill(cleanedRedMask, visitedRed, x, y, width, height);
                if (contour && contour.length >= minContourArea && contour.length <= maxContourArea) {
                    redContours.push(contour);
                }
            }
            if (cleanedBlueMask[idx] === 255 && visitedBlue[idx] === 0) {
                const contour = floodFill(cleanedBlueMask, visitedBlue, x, y, width, height);
                if (contour && contour.length >= minContourArea && contour.length <= maxContourArea) {
                    blueContours.push(contour);
                }
            }
        }
    }
    const redContoursWithData = redContours.map(contour => {
        const centroid = calculateCentroid(contour);
        let sumBrightness = 0;
        contour.forEach(([px, py]) => {
            const pDataIdx = (py * width + px) * 4;
            sumBrightness += (data[pDataIdx] + data[pDataIdx + 1] + data[pDataIdx + 2]) / 3;
        });
        return { contour, centroid, area: contour.length, avgBrightness: sumBrightness / contour.length };
    });
    const blueContoursWithData = blueContours.map(contour => {
        const centroid = calculateCentroid(contour);
        let sumBrightness = 0;
        contour.forEach(([px, py]) => {
            const pDataIdx = (py * width + px) * 4;
            sumBrightness += (data[pDataIdx] + data[pDataIdx + 1] + data[pDataIdx + 2]) / 3;
        });
        return { contour, centroid, area: contour.length, avgBrightness: sumBrightness / contour.length };
    });
    redContoursWithData.sort((a, b) => b.avgBrightness - a.avgBrightness);
    blueContoursWithData.sort((a, b) => b.avgBrightness - a.avgBrightness);
    const redPoint = redContoursWithData.length > 0 ? redContoursWithData[0].centroid : null;
    const bluePoint = blueContoursWithData.length > 0 ? blueContoursWithData[0].centroid : null;
    if (redPoint === null || bluePoint === null) {
        const combinedMask = new Uint8Array(width * height);
        for (let i = 0; i < combinedMask.length; i++) {
            combinedMask[i] = Math.max(cleanedRedMask[i], cleanedBlueMask[i]);
        }
        return {
            point1: redPoint,
            point2: bluePoint,
            distance: null,
            contoursOverlap: false,
            brightPixelCount: redPixelCount + bluePixelCount,
            allContours: []
        };
    }
    const yDiff = Math.abs(redPoint.y - bluePoint.y);
    if (yDiff > 20) {
        const combinedMask = new Uint8Array(width * height);
        for (let i = 0; i < combinedMask.length; i++) {
            combinedMask[i] = Math.max(cleanedRedMask[i], cleanedBlueMask[i]);
        }
        return {
            point1: redPoint,
            point2: null,
            distance: null,
            contoursOverlap: false,
            brightPixelCount: redPixelCount + bluePixelCount,
            allContours: []
        };
    }
    // Расстояние по X (как в autofocus_test.html)
    const distance = Math.abs(redPoint.x - bluePoint.x);
    const redContour = redContoursWithData.length > 0 ? redContoursWithData[0].contour : null;
    const blueContour = blueContoursWithData.length > 0 ? blueContoursWithData[0].contour : null;
    let contoursOverlap = false;
    if (redContour && blueContour) {
        const redPixels = new Set();
        redContour.forEach(([x, y]) => redPixels.add(`${x},${y}`));
        for (const [x, y] of blueContour) {
            if (redPixels.has(`${x},${y}`)) {
                contoursOverlap = true;
                break;
            }
        }
    }
    return {
        point1: redPoint,
        point2: bluePoint,
        distance: distance,
        contoursOverlap: contoursOverlap,
        brightPixelCount: redPixelCount + bluePixelCount,
        allContours: [...redContoursWithData, ...blueContoursWithData].map(c => ({
            contour: c.contour,
            centroid: c.centroid,
            area: c.area
        }))
    };
}

class FocusDetector {
    constructor(k = 5, distanceTolerance = 3) {
        this.buffer = [];
        this.k = k;
        this.distanceTolerance = distanceTolerance;
    }
    addMeasurement(point1, point2, distance, contoursOverlap, point1Area = null) {
        this.buffer.push({
            hasBothPoints: !!(point1 && point2),
            distance: distance || 0,
            contoursOverlap: contoursOverlap || false,
            point1, point2,
            point1Area: point1Area || (point1 ? point1.area : null),
            point2Area: point2 ? point2.area : null,
            timestamp: Date.now()
        });
        if (this.buffer.length > this.k * 2) this.buffer.shift();
    }
    isFocused() {
        if (this.buffer.length === 0) return false;
        const last = this.buffer[this.buffer.length - 1];
        if (last.hasBothPoints) {
            if (this.buffer.length < this.k) return false;
            return this.buffer.slice(-this.k).every(m => 
                m.hasBothPoints && m.distance <= this.distanceTolerance && m.contoursOverlap
            );
        }
        if (!last.hasBothPoints && last.point1) {
            return this.checkPointsMerged();
        }
        return false;
    }
    checkPointsMerged() {
        if (this.buffer.length < 3) return false;
        const lastMeasurement = this.buffer[this.buffer.length - 1];
        if (lastMeasurement.hasBothPoints || !lastMeasurement.point1) return false;
        const previousMeasurements = this.buffer.slice(-4, -1);
        if (previousMeasurements.length < 2) return false;
        const hadBothPointsBefore = previousMeasurements.every(m => m.hasBothPoints);
        if (!hadBothPointsBefore) return false;
        const lastWithBothPoints = previousMeasurements[previousMeasurements.length - 1];
        if (!lastWithBothPoints || lastWithBothPoints.distance >= 50) return false;
        const avgPreviousArea = previousMeasurements.reduce((sum, m) => {
            return sum + (m.point1Area || 0) + (m.point2Area || 0);
        }, 0) / (previousMeasurements.length * 2);
        const currentArea = lastMeasurement.point1Area || 0;
        return currentArea >= avgPreviousArea * 0.9;
    }
}

class DirectionFinder {
    constructor() {
        this.lastDistance = null;
        this.lastDirection = null;
        this.testCompleted = false;
    }
    async findDirection(currentZ, testStep, moveZAxis, captureImage, detectLaserPoints) {
        if (this.testCompleted) return this.lastDirection;
        addLog('info', '🧪 Тестовое движение для определения направления...');
        const imgBefore = await captureImage();
        const resultBefore = detectLaserPoints(imgBefore, 10, 2000, 240, 70);
        if (!resultBefore.point1 || !resultBefore.point2) {
            addLog('warning', '⚠️ Не удалось найти точки для тестового движения');
            return null;
        }
        const distanceBefore = Math.abs(resultBefore.point1.x - resultBefore.point2.x);
        addLog('info', `📏 Расстояние до движения: ${distanceBefore.toFixed(1)}px`);
        const testZ = currentZ + testStep;
        addLog('info', `🧪 Тестовое движение ВВЕРХ: ${currentZ.toFixed(2)}mm → ${testZ.toFixed(2)}mm`);
        await moveZAxis(testZ);
        await new Promise(resolve => setTimeout(resolve, 500));
        const imgAfter = await captureImage();
        const resultAfter = detectLaserPoints(imgAfter, 10, 2000, 240, 70);
        if (!resultAfter.point1 || !resultAfter.point2) {
            addLog('warning', '⚠️ Не удалось найти точки после тестового движения');
            await moveZAxis(currentZ);
            return null;
        }
        const distanceAfter = Math.abs(resultAfter.point1.x - resultAfter.point2.x);
        addLog('info', `📏 Расстояние после движения: ${distanceAfter.toFixed(1)}px`);
        await moveZAxis(currentZ);
        await new Promise(resolve => setTimeout(resolve, 500));
        if (distanceAfter < distanceBefore) {
            this.lastDirection = 1;
            addLog('success', `✅ Точки приблизились при движении ВВЕРХ (${distanceBefore.toFixed(1)}px → ${distanceAfter.toFixed(1)}px)`);
            addLog('info', `🧭 Правильное направление: ВВЕРХ`);
        } else if (distanceAfter > distanceBefore) {
            this.lastDirection = -1;
            addLog('info', `⚠️ Точки отдалились при движении ВВЕРХ (${distanceBefore.toFixed(1)}px → ${distanceAfter.toFixed(1)}px)`);
            addLog('info', `🧭 Правильное направление: ВНИЗ`);
        } else {
            this.lastDirection = null;
            addLog('warning', `⚠️ Расстояние не изменилось`);
        }
        this.testCompleted = true;
        this.lastDistance = distanceBefore;
        return this.lastDirection;
    }
    reset() {
        this.lastDistance = null;
        this.lastDirection = null;
        this.testCompleted = false;
    }
}

async function captureImage() {
    try {
        const url = `http://${getCurrentIp()}:8329/camera/snap?width=4656&height=3496&timeOut=30000&t=${Date.now()}`;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.timeout = 15000;
        return new Promise((resolve, reject) => {
            xhr.onload = () => {
                if (xhr.status === 200 && xhr.response && xhr.response.size > 0) {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
                    img.src = URL.createObjectURL(xhr.response);
                } else {
                    reject(new Error(`HTTP ${xhr.status}`));
                }
            };
            xhr.onerror = () => reject(new Error('Ошибка сети'));
            xhr.ontimeout = () => reject(new Error('Таймаут запроса'));
            xhr.send();
        });
    } catch (error) {
        throw error;
    }
}

async function getCurrentZPosition() {
    try {
        const response = await fetch(`http://${getCurrentIp()}:8080/focus/control?action=status`, { method: 'GET' });
        if (response.ok) {
            const data = await response.json();
            return data?.data?.value || data?.value || 0;
        }
        return 0;
    } catch (error) {
        return 0;
    }
}

async function performAutofocus() {
    if (!getIsConnected()) {
        addLog('error', 'Сначала подключитесь к лазеру');
        return;
    }
    
    const btn = document.getElementById('autofocusBtn');
    btn.disabled = true;
    btn.classList.add('loading');
    document.getElementById('focus-status').textContent = 'Выполнение автофокусировки...';
    
    let autofocusAborted = false;
    
    try {
        addLog('info', '=== НАЧАЛО АВТОФОКУСА ===');
        
        const focusDetector = new FocusDetector(2, FOCUS_TOLERANCE);
        const directionFinder = new DirectionFinder();
        const MAX_ITERATIONS = 20;
        let iteration = 0;
        currentZ = 0;
        let minDistance = Infinity;
        let minDistanceIteration = 0;
        let distanceHistory = [];
        
        // ШАГ 1: Перемещение в нижнее положение
        addLog('info', 'ШАГ 1: Перемещение в нижнее положение');
        await moveToBottom();
        currentZ = await getCurrentZPosition();
        addLog('info', `Текущая позиция Z: ${currentZ.toFixed(2)}mm`);
        
        if (autofocusAborted) {
            throw new Error('Прервано пользователем');
        }
        
        // ШАГ 2: Отключение подсветки
        addLog('info', 'ШАГ 2: Отключение подсветки рабочей зоны');
        await setFillLight(0);
        
        // ШАГ 3: Установка низкой экспозиции
        addLog('info', 'ШАГ 3: Установка экспозиции');
        await setExposure(20);
        
        // ШАГ 4: Основной цикл автофокуса
        addLog('info', 'ШАГ 4: Начало цикла автофокуса');
        
        while (iteration < MAX_ITERATIONS && !focusDetector.isFocused() && !autofocusAborted) {
            iteration++;
            addLog('info', `--- Итерация ${iteration} ---`);
            document.getElementById('focus-status').textContent = `Итерация ${iteration}/${MAX_ITERATIONS}...`;
            
            // Делаем фото
            const img = await captureImage();
            
            if (autofocusAborted) break;
            
            // Определяем точки
            const result = detectLaserPoints(img, 10, 2000, 240, 70);
            
            // Добавляем измерение
            focusDetector.addMeasurement(
                result.point1,
                result.point2,
                result.distance || 0,
                result.contoursOverlap || false,
                result.point1 ? result.point1.area : null
            );
            
            // Проверяем, найдены ли обе точки
            if (!result.point1 || !result.point2) {
                let reason = '';
                if (!result.point1 && !result.point2) {
                    reason = 'обе точки не найдены';
                } else if (!result.point1) {
                    reason = 'точка 1 не найдена';
                } else {
                    reason = 'точка 2 не найдена';
                }
                addLog('warning', `Итерация ${iteration}: ${reason}`);
                
                const focused = focusDetector.isFocused();
                if (focused) {
                    addLog('success', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    addLog('success', '✅✅✅ ФОКУС ДОСТИГНУТ! (ТОЧКИ ОБЪЕДИНИЛИСЬ) ✅✅✅');
                    addLog('success', `  Финальная позиция Z: ${currentZ.toFixed(2)}mm`);
                    addLog('success', `  Точки объединились в одну!`);
                    break;
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            
            // Анализ и проверка фокуса
            const distance = result.distance || Math.abs(result.point1.x - result.point2.x);
            
            addLog('info', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            addLog('info', `📊 ИТЕРАЦИЯ ${iteration} - АНАЛИЗ:`);
            addLog('info', `  💡 Точка 1 (красная): X=${result.point1.x.toFixed(1)}px, Y=${result.point1.y.toFixed(1)}px`);
            addLog('info', `  💡 Точка 2 (синяя): X=${result.point2.x.toFixed(1)}px, Y=${result.point2.y.toFixed(1)}px`);
            addLog('info', `  📏 Расстояние по X между точками: ${distance.toFixed(1)}px`);
            addLog('info', `  🔗 Контуры перекрываются: ${result.contoursOverlap ? '✅ Да' : '❌ Нет'}`);
            
            const hasBothPoints = !!(result.point1 && result.point2);
            const distanceOk = distance <= FOCUS_TOLERANCE;
            
            if (hasBothPoints) {
                addLog('info', `  📐 Расстояние по X <= ${FOCUS_TOLERANCE}px: ${distanceOk ? '✅' : '❌'} (${distance.toFixed(1)}px)`);
            }
            
            const focusedByDetector = focusDetector.isFocused();
            const focusedByCurrentDistance = hasBothPoints && distanceOk;
            const focused = focusedByDetector || focusedByCurrentDistance;
            const focusStatus = focused ? '✅ СФОКУСИРОВАНО' : '⚠️ Не сфокусировано';
            
            addLog('info', `  🎯 Статус фокуса: ${focusStatus}`);
            
            if (focusedByCurrentDistance && !focusedByDetector) {
                addLog('success', `  🎉 Расстояние по X <= ${FOCUS_TOLERANCE}px достигнуто! Фокус достигнут!`);
            }
            
            if (focused && !hasBothPoints) {
                addLog('success', `  🎉 Точки объединились! Фокус достигнут!`);
            }
            
            if (focused) {
                addLog('success', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                addLog('success', '✅✅✅ ФОКУС ДОСТИГНУТ! ✅✅✅');
                addLog('success', `  Финальная позиция Z: ${currentZ.toFixed(2)}mm`);
                addLog('success', `  Расстояние по X между точками: ${distance.toFixed(1)}px`);
                break;
            }
            
            // Отслеживаем минимальное расстояние
            distanceHistory.push(distance);
            if (distanceHistory.length > 3) {
                distanceHistory.shift();
            }
            
            if (distance < minDistance) {
                minDistance = distance;
                minDistanceIteration = iteration;
                addLog('info', `  📉 Новое минимальное расстояние: ${minDistance.toFixed(1)}px (итерация ${iteration})`);
            }
            
            // Проверяем тренд: если расстояние увеличилось на 2 итерации подряд
            let shouldChangeDirection = false;
            if (distanceHistory.length >= 2) {
                const lastTwo = distanceHistory.slice(-2);
                const increasing = lastTwo[1] > lastTwo[0];
                const aboveMinThreshold = distance > minDistance + 3;
                
                if (increasing && aboveMinThreshold) {
                    shouldChangeDirection = true;
                }
            }
            
            if (shouldChangeDirection) {
                addLog('warning', `  ⚠️ Точки начали расходиться! Минимальное расстояние было ${minDistance.toFixed(1)}px на итерации ${minDistanceIteration}, сейчас ${distance.toFixed(1)}px`);
                addLog('info', `  🔄 Меняем направление движения`);
                if (directionFinder.lastDirection !== null) {
                    directionFinder.lastDirection = -directionFinder.lastDirection;
                    minDistance = distance;
                    minDistanceIteration = iteration;
                    addLog('info', `  🔄 Минимальное расстояние сброшено, начинаем поиск нового минимума в новом направлении`);
                }
            }
            
            // Определяем направление движения
            let direction = directionFinder.lastDirection;
            
            if (direction === null && iteration === 1) {
                direction = await directionFinder.findDirection(
                    currentZ,
                    1.0,
                    moveZAxis,
                    captureImage,
                    detectLaserPoints
                );
                
                if (direction === null) {
                    addLog('error', '❌ Не удалось определить направление движения');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
            }
            
            if (direction === null) {
                addLog('warning', '⚠️ Направление не определено, пропускаем итерацию');
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            
            const directionText = direction > 0 ? 'ВВЕРХ' : 'ВНИЗ';
            addLog('info', `  🧭 Направление движения: ${directionText}`);
            
            // Вычисляем шаг движения динамически
            let calculatedStep;
            if (distance > 50) {
                calculatedStep = distance / 5;
            } else if (distance > 20) {
                calculatedStep = distance / 6;
            } else if (distance > 10) {
                calculatedStep = distance / 8;
            } else {
                calculatedStep = distance / 10;
            }
            const step = Math.max(0.1, Math.min(calculatedStep, distance > 50 ? 10 : distance > 20 ? 5 : distance > 10 ? 2 : 0.5));
            
            const finalOffset = step * direction;
            
            addLog('info', `  📏 Шаг движения: ${step.toFixed(2)}mm`);
            addLog('info', `  📐 Смещение: ${finalOffset > 0 ? '+' : ''}${finalOffset.toFixed(2)}mm`);
            
            // Проверяем границы перед перемещением
            const oldZ = currentZ;
            const newZ = currentZ + finalOffset;
            const MIN_Z = 0;
            const MAX_Z = 50;
            
            addLog('info', `  📍 Текущая позиция Z: ${currentZ.toFixed(2)}mm`);
            addLog('info', `  📍 Целевая позиция Z: ${newZ.toFixed(2)}mm`);
            
            if (newZ < MIN_Z) {
                addLog('warning', `⚠️ Попытка движения ниже минимума (${MIN_Z}mm). Ограничиваем до ${MIN_Z}mm`);
                currentZ = MIN_Z;
            } else if (newZ > MAX_Z) {
                addLog('warning', `⚠️ Попытка движения выше максимума (${MAX_Z}mm). Ограничиваем до ${MAX_Z}mm`);
                currentZ = MAX_Z;
            } else {
                currentZ = newZ;
            }
            
            if (Math.abs(currentZ - oldZ) < 0.01) {
                addLog('warning', `⚠️ Позиция не изменилась (${oldZ.toFixed(2)}mm). Возможно, достигнута граница диапазона.`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            
            addLog('info', `  🚀 Перемещение: ${oldZ.toFixed(2)}mm → ${currentZ.toFixed(2)}mm`);
            addLog('info', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            
            const offset = currentZ - oldZ;
            const moveSuccess = await moveZAxisRelative(offset);
            
            if (autofocusAborted) break;
            
            const actualZ = await getCurrentZPosition();
            const positionDiff = Math.abs(actualZ - currentZ);
            
            if (positionDiff > 0.5) {
                addLog('warning', `⚠️ Расхождение позиций: запрошено ${currentZ.toFixed(2)}mm, получено ${actualZ.toFixed(2)}mm (разница ${positionDiff.toFixed(2)}mm)`);
                if (moveSuccess) {
                    addLog('info', `✅ Используем вычисленную позицию: ${currentZ.toFixed(2)}mm (движение было успешным)`);
                } else {
                    currentZ = actualZ;
                    addLog('info', `✅ Используем реальную позицию: ${currentZ.toFixed(2)}mm`);
                }
            } else {
                currentZ = actualZ;
                addLog('info', `✅ Реальная позиция после перемещения: ${currentZ.toFixed(2)}mm`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (autofocusAborted) {
            addLog('warning', 'Автофокус прерван пользователем');
        } else if (iteration >= MAX_ITERATIONS) {
            addLog('warning', `Достигнуто максимальное количество итераций (${MAX_ITERATIONS})`);
        } else {
            addLog('success', 'Автофокус завершен успешно!');
        }
        
    } catch (error) {
        addLog('error', `Ошибка автофокуса: ${error.message}`);
        document.getElementById('focus-status').textContent = `❌ Ошибка: ${error.message}`;
    } finally {
        // ШАГ 5: Включаем подсветку обратно
        addLog('info', 'ШАГ 5: Включение подсветки обратно');
        await setFillLight(100);
        
        getFlowState().autofocusCompleted = true;
        updateChecklist('focus', true);
        updateTabStatuses();
        saveStateToLocalStorage();
        
        document.getElementById('focus-status').textContent = '✅ Автофокусировка выполнена';
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

function skipAutofocus() {
    getFlowState().autofocusCompleted = true;
    updateChecklist('focus', true);
    updateTabStatuses();
    saveStateToLocalStorage();
    document.getElementById('focus-status').textContent = '⏭️ Автофокусировка пропущена';
    addLog('info', 'Автофокусировка пропущена');
}
    
    // Экспортируем функции
    if (typeof window !== 'undefined') {
        window.setFillLight = setFillLight;
        window.setExposure = setExposure;
        window.moveToBottom = moveToBottom;
        window.moveZAxis = moveZAxis;
        window.moveZAxisRelative = moveZAxisRelative;
        window.percentile = percentile;
        window.morphologicalOpen = morphologicalOpen;
        window.calculateCentroid = calculateCentroid;
        window.floodFill = floodFill;
        window.detectLaserPoints = detectLaserPoints;
        window.FocusDetector = FocusDetector;
        window.DirectionFinder = DirectionFinder;
        window.captureImage = captureImage;
        window.getCurrentZPosition = getCurrentZPosition;
        window.performAutofocus = performAutofocus;
        window.skipAutofocus = skipAutofocus;
    }
})();
