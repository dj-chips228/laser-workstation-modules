// Модуль: upload.js
// Загрузка файлов в память лазера

(function() {
    'use strict';
    
    const addLog = window.addLog || console.log;
    const getCurrentIp = () => window.currentIp;
    const getIsConnected = () => window.isConnected && window.currentIp;
    const getFlowState = () => window.flowState;
    const getDeviceInfo = () => window.deviceInfo;
    
    // Все функции объявляем внутри IIFE
    function sanitizeFileName(fileName) {
    // Убираем расширение
    let projectName = fileName.replace(/\.xf$/i, '');
    
    // Транслитерация кириллицы в латиницу
    const translitMap = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
        'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
        'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
        'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
        'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
        'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    };
    
    // Транслитерируем кириллицу
    projectName = projectName.split('').map(char => translitMap[char] || char).join('');
    
    // Заменяем пробелы на подчеркивания
    projectName = projectName.replace(/\s+/g, '_');
    
    // Убираем все спецсимволы, оставляем только буквы, цифры и подчеркивания
    projectName = projectName.replace(/[^a-zA-Z0-9_]/g, '');
    
    // Убираем множественные подчеркивания
    projectName = projectName.replace(/_+/g, '_');
    
    // Убираем подчеркивания в начале и конце
    projectName = projectName.replace(/^_+|_+$/g, '');
    
    // Если имя пустое после очистки, используем "project"
    if (!projectName || projectName.length === 0) {
        projectName = 'project';
    }
    
    return projectName;
}

async function saveGcodeToLocalMemory(ip, fileData, projectName, fileType = 'xf', onProgress = null) {
    try {
        if (onProgress) {
            onProgress({ status: 'uploading', progress: 0, message: 'Загрузка проекта в контроллер...' });
        }
        
        // Преобразуем данные в ArrayBuffer, если это Uint8Array
        // ВАЖНО: создаем полную копию данных, чтобы избежать проблем с общими буферами
        let arrayBuffer;
        if (fileData instanceof Uint8Array) {
            // Создаем полную копию через slice(0) - это гарантирует новый ArrayBuffer
            arrayBuffer = fileData.slice(0).buffer;
        } else if (fileData instanceof ArrayBuffer) {
            // Создаем копию ArrayBuffer
            arrayBuffer = fileData.slice(0);
        } else {
            // Если это строка (для обратной совместимости с текстовым G-code)
            const encoder = new TextEncoder();
            arrayBuffer = encoder.encode(fileData).buffer;
        }
        
        // Логируем размер для отладки
        console.log(`Загрузка файла "${projectName}": размер ${arrayBuffer.byteLength} байт`);
        
        // Генерируем taskId в формате, как в XCS
        // Добавляем случайное число для уникальности при пакетной загрузке
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 10000);
        const deviceSerial = window.deviceInfo?.snCode || window.deviceInfo?.deviceSN || 'unknown';
        const taskId = deviceSerial !== 'unknown'
            ? `PC_F1Ultra_${deviceSerial}_${timestamp}_${randomSuffix}`
            : `PC_F1Ultra_${timestamp}_${randomSuffix}`;
        
        const uploadUrl = `http://${ip}:8080/processing/upload?gcodeType=processing&fileType=${fileType}&taskId=${taskId}&autoStart=0`;
        
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': arrayBuffer.byteLength.toString(),
                'Accept': 'application/json, text/plain, */*'
            },
            body: arrayBuffer
        });
        
        const uploadResponseText = await uploadResponse.text();
        
        if (!uploadResponse.ok) {
            throw new Error(`Ошибка загрузки: HTTP ${uploadResponse.status}: ${uploadResponseText}`);
        }
        
        if (onProgress) {
            onProgress({ status: 'saving', progress: 50, message: 'Сохранение в локальную память...' });
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const backupUrl = `http://${ip}:8080/processing/backup`;
        const backupResponse = await fetch(backupUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify({
                filename: projectName,
                filetype: fileType
            })
        });
        
        const backupResponseText = await backupResponse.text();
        
        if (backupResponse.ok) {
            try {
                const backupJson = JSON.parse(backupResponseText);
                if (backupJson.code === 0) {
                    if (onProgress) {
                        onProgress({ status: 'completed', progress: 100, message: 'Проект успешно сохранен!' });
                    }
                    return { success: true, message: 'Проект успешно сохранен' };
                } else {
                    // Если backup не сработал с кодом 4, пробуем альтернативный подход
                    if (backupJson.code === 4) {
                        try {
                            // Запускаем файл
                            await fetch(`http://${ip}:8080/processing/start`, {
                                method: 'POST',
                                mode: 'cors',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json, text/plain, */*'
                                }
                            });
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // Останавливаем
                            await fetch(`http://${ip}:8080/processing/stop`, {
                                method: 'POST',
                                mode: 'cors',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json, text/plain, */*'
                                }
                            });
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            
                            // Пробуем backup еще раз
                            const retryBackupResponse = await fetch(backupUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json, text/plain, */*'
                                },
                                body: JSON.stringify({
                                    filename: projectName,
                                    filetype: fileType
                                })
                            });
                            
                            const retryBackupText = await retryBackupResponse.text();
                            if (retryBackupResponse.ok) {
                                try {
                                    const retryBackupJson = JSON.parse(retryBackupText);
                                    if (retryBackupJson.code === 0) {
                                        if (onProgress) {
                                            onProgress({ status: 'completed', progress: 100, message: 'Проект успешно сохранен!' });
                                        }
                                        return { success: true, message: 'Проект успешно сохранен (после повторной попытки)' };
                                    }
                                } catch (e) {
                                    // Игнорируем ошибки парсинга
                                }
                            }
                        } catch (e) {
                            // Игнорируем ошибки альтернативного подхода
                        }
                    }
                    throw new Error(`Код ошибки ${backupJson.code}: ${backupJson.msg || backupResponseText}`);
                }
            } catch (e) {
                if (backupResponse.status === 200) {
                    if (onProgress) {
                        onProgress({ status: 'completed', progress: 100, message: 'Проект успешно сохранен!' });
                    }
                    return { success: true, message: 'Проект успешно сохранен' };
                }
                throw e;
            }
        } else {
            throw new Error(`HTTP ${backupResponse.status}: ${backupResponseText}`);
        }
    } catch (error) {
        if (onProgress) {
            onProgress({ status: 'error', progress: 0, message: error.message });
        }
        return { success: false, message: error.message };
    }
}

async function extractZipArchive(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                // Используем JSZip для распаковки
                if (typeof JSZip === 'undefined') {
                    // Если JSZip не загружен, пробуем использовать встроенный способ
                    reject(new Error('JSZip не загружен. Добавьте скрипт JSZip в HTML'));
                    return;
                }
                
                const zip = await JSZip.loadAsync(e.target.result);
                const files = [];
                
                // Собираем все .xf файлы
                const xfFileEntries = [];
                zip.forEach((relativePath, zipEntry) => {
                    if (relativePath.endsWith('.xf') && !zipEntry.dir) {
                        xfFileEntries.push({ relativePath, zipEntry });
                    }
                });
                
                // Извлекаем каждый файл отдельно, создавая новую копию данных
                for (const { relativePath, zipEntry } of xfFileEntries) {
                    try {
                        // Читаем данные напрямую как Uint8Array
                        const uint8Array = await zipEntry.async('uint8array');
                        // Создаем ПОЛНУЮ копию через конструктор (гарантируем независимую копию)
                        const content = new Uint8Array(uint8Array);
                        
                        const fileName = relativePath.split('/').pop();
                        files.push({
                            name: fileName,
                            data: content
                        });
                        
                        // Логируем размер и первые байты для отладки
                        const firstBytes = Array.from(content.slice(0, Math.min(10, content.length)))
                            .map(b => b.toString(16).padStart(2, '0')).join(' ');
                        console.log(`Извлечен файл: ${fileName}, размер: ${content.length} байт, первые байты: ${firstBytes}`);
                    } catch (error) {
                        addLog('warning', `Ошибка извлечения файла ${relativePath}: ${error.message}`);
                    }
                }
                
                resolve(files);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsArrayBuffer(file);
    });
}

async function handleArchiveSelection() {
    const files = document.getElementById('archiveInput').files;
    if (files.length === 0) return;
    
    if (!getIsConnected()) {
        console.error('❌ handleArchiveSelection: не подключено', { isConnected: window.isConnected, currentIp: window.currentIp });
        addLog('error', 'Сначала подключитесь к лазеру');
        return;
    }
    
    addLog('info', `Обработка ${files.length} архивов...`);
    
    const progressContainer = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    
    progressContainer.style.display = 'block';
    
    try {
        let totalFiles = 0;
        let processedFiles = 0;
        const allXfFiles = [];
        
        // Собираем все .xf файлы из архивов
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.name.endsWith('.zip')) {
                addLog('info', `Распаковка архива: ${file.name}`);
                try {
                    const xfFiles = await extractZipArchive(file);
                    allXfFiles.push(...xfFiles);
                    addLog('success', `Найдено ${xfFiles.length} .xf файлов в ${file.name}`);
                } catch (error) {
                    addLog('error', `Ошибка распаковки ${file.name}: ${error.message}`);
                }
            } else if (file.name.endsWith('.xf')) {
                const arrayBuffer = await file.arrayBuffer();
                allXfFiles.push({
                    name: file.name,
                    data: new Uint8Array(arrayBuffer)
                });
            }
        }
        
        totalFiles = allXfFiles.length;
        
        if (totalFiles === 0) {
            addLog('error', 'Не найдено .xf файлов в архивах');
            progressContainer.style.display = 'none';
            return;
        }
        
        addLog('info', `Найдено ${totalFiles} .xf файлов. Начинаю загрузку...`);
        
        // КРИТИЧНО: Останавливаем процесс перед началом загрузки (один раз для всех файлов)
        try {
            addLog('info', '🔄 Остановка текущего процесса перед началом загрузки...');
            await fetch(`http://${getCurrentIp()}:8080/processing/stop`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            addLog('info', '✅ Процесс остановлен');
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            addLog('warning', `⚠️ Не удалось остановить процесс: ${e.message}`);
        }
        
        // Загружаем каждый файл по очереди
        for (let i = 0; i < allXfFiles.length; i++) {
            const file = allXfFiles[i];
            const progress = Math.round(((i + 1) / totalFiles) * 100);
            
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${progress}% (${i + 1}/${totalFiles})`;
            
            addLog('info', `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            addLog('info', `📄 Файл ${i + 1}/${totalFiles}: ${file.name} (${file.data.length} байт)`);
            addLog('info', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            
            // КРИТИЧНО: Останавливаем процесс перед КАЖДЫМ файлом
            // Это очищает временную память контроллера, чтобы новый файл заменил предыдущий
            try {
                await fetch(`http://${getCurrentIp()}:8080/processing/stop`, {
                    method: 'POST',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, text/plain, */*'
                    }
                });
                addLog('info', `🔄 Остановлен процесс перед загрузкой файла ${i + 1} (очистка временной памяти)`);
                // Даем время контроллеру очистить временную память
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                addLog('warning', `⚠️ Не удалось остановить процесс: ${e.message}`);
                // Продолжаем даже если stop не сработал
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Очищаем имя файла (транслитерация кириллицы, удаление спецсимволов)
            const originalName = file.name.replace(/\.xf$/i, '');
            const projectName = sanitizeFileName(file.name);
            
            if (originalName !== projectName) {
                addLog('info', `Имя файла изменено: "${originalName}" → "${projectName}"`);
            }
            
            // Создаем полную копию данных перед передачей (на всякий случай)
            const fileDataCopy = new Uint8Array(file.data);
            
            // Передаем бинарные данные напрямую (Uint8Array)
            const result = await saveGcodeToLocalMemory(
                window.currentIp,
                fileDataCopy, // Полная копия Uint8Array с бинарными данными
                projectName,
                'xf',
                (progressData) => {
                    addLog('info', `${file.name}: ${progressData.message}`);
                }
            );
            
            if (result.success) {
                processedFiles++;
                addLog('success', `✅ Файл ${i + 1}/${totalFiles} успешно сохранен: ${file.name}`);
            } else {
                failedFiles.push({
                    file: file,
                    index: i,
                    error: result.message
                });
                addLog('error', `❌ Ошибка загрузки ${file.name}: ${result.message}`);
            }
            
            // Небольшая задержка между файлами
            if (i < allXfFiles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        // Финальная остановка процесса после загрузки всех файлов
        try {
            addLog('info', '🔄 Финальная остановка процесса...');
            await fetch(`http://${getCurrentIp()}:8080/processing/stop`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            addLog('info', '✅ Процесс остановлен');
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (e) {
            addLog('warning', `⚠️ Не удалось выполнить финальную остановку: ${e.message}`);
        }
        
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        
        window.flowState.templatesUploaded = true;
        window.updateChecklist('upload', true);
        window.updateTabStatuses();
        window.saveStateToLocalStorage();
        
        addLog('success', `Загрузка завершена: ${processedFiles}/${totalFiles} файлов успешно загружены`);
        
        // Скрываем прогресс-бар через 1 секунду
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 1000);
        
        // Показываем статус
        const uploadStatus = document.getElementById('upload-status');
        if (processedFiles === totalFiles) {
            uploadStatus.textContent = `✅ Макеты загружены в память: ${processedFiles}/${totalFiles} файлов`;
            uploadStatus.className = 'status success';
            window.failedUploadFiles = []; // Очищаем список неудачных файлов
        } else {
            // Сохраняем неудачные файлы для возможности повтора
            window.failedUploadFiles = failedFiles;
            uploadStatus.textContent = `⚠️ Загружено: ${processedFiles}/${totalFiles} файлов. Ошибок: ${failedFiles.length}`;
            uploadStatus.className = 'status error';
            addLog('warning', `Не удалось загрузить ${failedFiles.length} файл(ов). Можно повторить загрузку.`);
        }
        
    } catch (error) {
        addLog('error', `Ошибка обработки архивов: ${error.message}`);
        progressContainer.style.display = 'none';
        
        // Показываем ошибку в статусе
        const uploadStatus = document.getElementById('upload-status');
        uploadStatus.textContent = `❌ Ошибка загрузки: ${error.message}`;
        uploadStatus.className = 'status error';
        window.failedUploadFiles = []; // Очищаем список при общей ошибке
    }
}

    // Функция для повторной загрузки неудачных файлов
    async function retryFailedUploads() {
        if (!window.failedUploadFiles || window.failedUploadFiles.length === 0) {
            addLog('warning', 'Нет файлов для повторной загрузки');
            alert('Нет файлов для повторной загрузки');
            return;
        }
    }
    
    // Функция для загрузки откалиброванных макетов в память устройства
    async function uploadCalibratedTemplatesToMemory() {
        if (!getCurrentIp()) {
            addLog('error', 'Не подключено к устройству!');
            return;
        }
        
        if (!window.selectedSets || window.selectedSets.size === 0) {
            addLog('error', 'Не выбрано ни одного набора дизайнов!');
            alert('Выберите хотя бы один набор дизайнов перед загрузкой');
            return;
        }
        
        // Получаем смещения
        const STANDARD_X = 79.84;
        const STANDARD_Y = 78.64;
        const offsetX = (window.currentX || STANDARD_X) - STANDARD_X;
        const offsetY = (window.currentY || STANDARD_Y) - STANDARD_Y;
        
        if (!window.supabaseClient) {
            addLog('error', 'Supabase не инициализирован!');
            return;
        }
        
        const progressContainer = document.getElementById('calibration-upload-progress');
        const progressBar = document.getElementById('calibration-upload-progress-bar');
        const progressText = document.getElementById('calibration-upload-progress-text');
        const successDiv = document.getElementById('calibration-upload-success');
        
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        if (successDiv) successDiv.style.display = 'none';
        
        try {
            addLog('info', `📦 Начинаю загрузку ${window.selectedSets.size} наборов с калибровкой: X=${offsetX.toFixed(2)}mm, Y=${offsetY.toFixed(2)}mm`);
            
            const selectedSetsArray = Array.from(window.selectedSets);
            
            // Разбиваем наборы на части, чтобы не превысить лимиты Edge Function
            // Обрабатываем по 3 набора за раз (можно изменить при необходимости)
            const BATCH_SIZE = 3;
            const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudmtnZXptZG1zemNoYXh1dGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwODA2OTIsImV4cCI6MjA3ODY1NjY5Mn0.qG0rFfDE2qqo_-Np_UjfQDlZlKSIPaRW8PJJ_UDgRik';
            const calibrateUrl = 'https://dnvkgezmdmszchaxutlv.supabase.co/functions/v1/calibrate-set';
            
            // Собираем все архивы из всех батчей
            const allArchives = [];
            let successCount = 0;
            let errorCount = 0;
            let totalFilesProcessed = 0;
            let totalFilesExpected = 0;
            
            // Обрабатываем наборы батчами
            for (let batchStart = 0; batchStart < selectedSetsArray.length; batchStart += BATCH_SIZE) {
                const batchEnd = Math.min(batchStart + BATCH_SIZE, selectedSetsArray.length);
                const batchSets = selectedSetsArray.slice(batchStart, batchEnd);
                
                addLog('info', `🔄 Обработка батча ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(selectedSetsArray.length / BATCH_SIZE)}: наборы ${batchStart + 1}-${batchEnd} из ${selectedSetsArray.length}`);
                
                try {
                    const calibrateResponse = await fetch(calibrateUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                            'apikey': SUPABASE_ANON_KEY
                        },
                        body: JSON.stringify({
                            setIds: batchSets,
                            xOffset: offsetX,
                            yOffset: offsetY
                        })
                    });
                    
                    if (!calibrateResponse.ok) {
                        const errorText = await calibrateResponse.text();
                        throw new Error(`Ошибка калибровки батча: ${errorText}`);
                    }
                    
                    const calibrateResult = await calibrateResponse.json();
                    
                    if (!calibrateResult.success || !calibrateResult.archives || !Array.isArray(calibrateResult.archives)) {
                        throw new Error(calibrateResult.error || 'Ошибка калибровки: неверный формат ответа');
                    }
                    
                    addLog('success', `✅ Батч обработан: получено ${calibrateResult.archives.length} архивов`);
                    allArchives.push(...calibrateResult.archives);
                    
                    // Небольшая задержка между батчами
                    if (batchEnd < selectedSetsArray.length) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                } catch (batchError) {
                    addLog('error', `❌ Ошибка обработки батча: ${batchError.message}`);
                    errorCount++;
                }
            }
            
            if (allArchives.length === 0) {
                throw new Error('Не удалось получить ни одного архива из всех батчей');
            }
            
            addLog('info', `📦 Всего получено ${allArchives.length} архивов из ${selectedSetsArray.length} наборов`);
            
            // Получаем все файлы из всех наборов
            const { data: allFiles, error: filesError } = await window.supabaseClient
                .from('files')
                .select('*')
                .in('set_id', selectedSetsArray);
            
            if (filesError) {
                throw new Error(`Ошибка получения файлов: ${filesError.message}`);
            }
            
            if (!allFiles || allFiles.length === 0) {
                throw new Error('Не найдено файлов в выбранных наборах');
            }
            
            addLog('info', `Найдено ${allFiles.length} файлов для загрузки`);
            
            // Загружаем архивы и извлекаем файлы
            for (let archiveIndex = 0; archiveIndex < allArchives.length; archiveIndex++) {
                const archive = allArchives[archiveIndex];
                try {
                    addLog('info', `Загрузка архива: ${archive.name} (${archive.url})`);
                    
                    // Загружаем архив с повторными попытками и альтернативными методами
                    let archiveArrayBuffer = null;
                    let retryCount = 0;
                    const maxRetries = 3;
                    
                    // Функция загрузки через fetch
                    const loadViaFetch = async (url) => {
                        const response = await fetch(url, {
                            method: 'GET',
                            cache: 'no-cache',
                            headers: {
                                'Accept': 'application/zip, application/octet-stream, */*'
                            }
                        });
                        
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }
                        
                        const blob = await response.blob();
                        return await blob.arrayBuffer();
                    };
                    
                    // Функция загрузки через XMLHttpRequest (fallback)
                    const loadViaXHR = (url) => {
                        return new Promise((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.open('GET', url, true);
                            xhr.responseType = 'arraybuffer';
                            
                            xhr.onload = () => {
                                if (xhr.status === 200) {
                                    resolve(xhr.response);
                                } else {
                                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                                }
                            };
                            
                            xhr.onerror = () => {
                                reject(new Error('Network error'));
                            };
                            
                            xhr.ontimeout = () => {
                                reject(new Error('Timeout'));
                            };
                            
                            xhr.timeout = 60000; // 60 секунд
                            xhr.send();
                        });
                    };
                    
                    while (retryCount < maxRetries && !archiveArrayBuffer) {
                        try {
                            if (retryCount > 0) {
                                addLog('info', `🔄 Повторная попытка загрузки архива (${retryCount}/${maxRetries})...`);
                                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                            }
                            
                            // Пробуем сначала через fetch
                            try {
                                archiveArrayBuffer = await loadViaFetch(archive.url);
                                addLog('success', `✅ Архив ${archive.name} успешно загружен через fetch (${(archiveArrayBuffer.byteLength / 1024 / 1024).toFixed(2)} МБ)`);
                                break;
                            } catch (fetchError) {
                                // Если fetch не сработал, пробуем через XHR
                                if (fetchError.message.includes('QUIC') || fetchError.message.includes('Failed to fetch')) {
                                    addLog('info', `⚠️ Fetch не сработал, пробую через XMLHttpRequest...`);
                                    archiveArrayBuffer = await loadViaXHR(archive.url);
                                    addLog('success', `✅ Архив ${archive.name} успешно загружен через XMLHttpRequest (${(archiveArrayBuffer.byteLength / 1024 / 1024).toFixed(2)} МБ)`);
                                    break;
                                } else {
                                    throw fetchError; // Другие ошибки пробрасываем дальше
                                }
                            }
                            
                        } catch (error) {
                            retryCount++;
                            addLog('warning', `⚠️ Ошибка загрузки архива (попытка ${retryCount}/${maxRetries}): ${error.message}`);
                            
                            if (retryCount >= maxRetries) {
                                throw new Error(`Не удалось загрузить архив после ${maxRetries} попыток: ${error.message}`);
                            }
                        }
                    }
                    
                    if (!archiveArrayBuffer) {
                        throw new Error('Не удалось загрузить архив');
                    }
                    
                    // Извлекаем файлы из архива
                    addLog('info', `📦 Извлечение файлов из архива ${archive.name}...`);
                    const extractedFiles = await extractZipArchive(new File([archiveArrayBuffer], archive.name, { type: 'application/zip' }));
                    
                    addLog('info', `🔍 Результат extractZipArchive: тип=${typeof extractedFiles}, isArray=${Array.isArray(extractedFiles)}, длина=${extractedFiles?.length || 'N/A'}`);
                    
                    // extractZipArchive возвращает массив объектов {name, data}
                    if (!Array.isArray(extractedFiles)) {
                        addLog('error', `❌ extractZipArchive вернул не массив! Тип: ${typeof extractedFiles}, значение:`, extractedFiles);
                        throw new Error('Неверный формат данных из архива');
                    }
                    
                    addLog('info', `📋 Всего файлов в архиве: ${extractedFiles.length}`);
                    
                    // Фильтруем только .xf файлы
                    const xfFiles = extractedFiles.filter(f => {
                        const isXf = f && f.name && f.name.toLowerCase().endsWith('.xf');
                        if (!isXf && f && f.name) {
                            addLog('info', `⏭️ Пропущен файл (не .xf): ${f.name}`);
                        }
                        return isXf;
                    });
                    
                    addLog('info', `📦 Найдено ${xfFiles.length} .xf файлов в архиве ${archive.name}`);
                    
                    if (xfFiles.length === 0) {
                        addLog('warning', `⚠️ В архиве ${archive.name} не найдено .xf файлов`);
                        continue;
                    }
                    
                    // Подсчитываем общее количество файлов (только при первом архиве)
                    if (archiveIndex === 0) {
                        // Пробуем оценить общее количество файлов
                        // Если архив один, используем текущее количество
                        if (calibrateResult.archives.length === 1) {
                            totalFilesExpected = xfFiles.length;
                        } else {
                            // Для нескольких архивов будем считать по мере обработки
                            totalFilesExpected = xfFiles.length; // Начальная оценка
                        }
                    } else {
                        // Обновляем общее количество при обработке следующих архивов
                        totalFilesExpected += xfFiles.length;
                    }
                    
                    addLog('info', `🚀 Начинаю загрузку ${xfFiles.length} файлов в память лазера...`);
                    
                    // Загружаем каждый файл в память устройства
                    let filesUploaded = 0;
                    let filesFailed = 0;
                    
                    for (let i = 0; i < xfFiles.length; i++) {
                        const file = xfFiles[i];
                        const fileName = file.name;
                        const fileData = file.data;
                        
                        try {
                            const projectName = sanitizeFileName(fileName);
                            const uint8Array = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
                            
                            addLog('info', `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                            addLog('info', `📄 Файл ${i + 1}/${xfFiles.length}: ${fileName} (${uint8Array.length} байт) → ${projectName}`);
                            addLog('info', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                            
                            // Останавливаем процесс перед загрузкой каждого файла
                            try {
                                await fetch(`http://${getCurrentIp()}:8080/processing/stop`, {
                                    method: 'POST',
                                    mode: 'cors',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Accept': 'application/json, text/plain, */*'
                                    }
                                });
                                addLog('info', `🔄 Остановлен процесс перед загрузкой файла ${i + 1}`);
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } catch (e) {
                                addLog('warning', `⚠️ Не удалось остановить процесс: ${e.message}`);
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                            
                            const result = await saveGcodeToLocalMemory(
                                getCurrentIp(),
                                uint8Array,
                                projectName,
                                'xf',
                                (progress) => {
                                    // Прогресс: 0-10% загрузка архивов, 10-95% загрузка файлов, 95-100% финализация
                                    const archiveProgress = (archiveIndex / allArchives.length) * 10;
                                    const fileProgressInArchive = ((i + 1) / xfFiles.length) * (85 / allArchives.length);
                                    const totalProgress = Math.min(95, archiveProgress + fileProgressInArchive);
                                    
                                    if (progressBar) progressBar.style.width = `${totalProgress}%`;
                                    if (progressText) progressText.textContent = `${Math.round(totalProgress)}% (${totalFilesProcessed + i + 1}/${totalFilesExpected || '?'})`;
                                    addLog('info', `${fileName}: ${progress.message}`);
                                }
                            );
                            
                            if (result && result.success) {
                                addLog('success', `✅ Файл ${i + 1}/${xfFiles.length} успешно загружен в память: ${fileName} → ${projectName}`);
                                filesUploaded++;
                                totalFilesProcessed++;
                            } else {
                                const errorMsg = result?.message || result?.error?.message || 'Неизвестная ошибка';
                                addLog('error', `❌ Ошибка загрузки файла ${fileName}: ${errorMsg}`);
                                filesFailed++;
                                errorCount++;
                            }
                            
                            // Задержка между файлами
                            if (i < xfFiles.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        } catch (fileError) {
                            addLog('error', `❌ Ошибка загрузки файла ${fileName}: ${fileError.message}`);
                            filesFailed++;
                            errorCount++;
                        }
                    }
                    
                    addLog('info', `📊 Архив ${archive.name}: загружено ${filesUploaded}/${xfFiles.length} файлов`);
                    
                    // Финальная остановка процесса
                    try {
                        await fetch(`http://${getCurrentIp()}:8080/processing/stop`, {
                            method: 'POST',
                            mode: 'cors',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json, text/plain, */*'
                            }
                        });
                        addLog('info', '✅ Финальная остановка процесса');
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (e) {
                        addLog('warning', `⚠️ Не удалось выполнить финальную остановку: ${e.message}`);
                    }
                    
                    addLog('info', `📊 Архив ${archive.name}: загружено ${filesUploaded}/${xfFiles.length} файлов`);
                    
                    successCount++;
                } catch (archiveError) {
                    addLog('error', `Ошибка обработки архива ${archive.name}: ${archiveError.message}`);
                    errorCount++;
                }
                
                // Обновляем прогресс после обработки архива
                const archiveProgress = ((archiveIndex + 1) / calibrateResult.archives.length) * 95;
                if (progressBar) progressBar.style.width = `${Math.min(95, archiveProgress)}%`;
                if (progressText) progressText.textContent = `${Math.round(Math.min(95, archiveProgress))}%`;
            }
            
            // Обновляем состояние
            getFlowState().templatesUploaded = true;
            if (window.updateChecklist) window.updateChecklist('upload', true);
            if (window.updateTabStatuses) window.updateTabStatuses();
            if (window.saveStateToLocalStorage) window.saveStateToLocalStorage();
            
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
            
            addLog('success', `✅ Загрузка завершена: ${successCount} наборов успешно, ${errorCount} ошибок`);
            
            if (successDiv) {
                successDiv.style.display = 'block';
                successDiv.innerHTML = `
                    <div style="background: #d4edda; padding: 15px; border-radius: 8px; color: #155724;">
                        <h4>✅ Загрузка завершена</h4>
                        <p>Успешно загружено: ${successCount} наборов</p>
                        ${errorCount > 0 ? `<p style="color: #856404;">Ошибок: ${errorCount}</p>` : ''}
                    </div>
                `;
            }
            
            // Скрываем прогресс через 2 секунды
            setTimeout(() => {
                if (progressContainer) progressContainer.style.display = 'none';
            }, 2000);
            
        } catch (error) {
            addLog('error', `Ошибка при загрузке откалиброванных макетов: ${error.message}`);
            if (progressContainer) progressContainer.style.display = 'none';
        }
    }
    
    // Функция для скачивания архива откалиброванных макетов
    async function downloadCalibratedTemplates() {
        if (!window.selectedSets || window.selectedSets.size === 0) {
            addLog('error', 'Не выбрано ни одного набора дизайнов!');
            alert('Выберите хотя бы один набор дизайнов перед скачиванием');
            return;
        }
        
        // Получаем смещения
        const STANDARD_X = 79.84;
        const STANDARD_Y = 78.64;
        const offsetX = (window.currentX || STANDARD_X) - STANDARD_X;
        const offsetY = (window.currentY || STANDARD_Y) - STANDARD_Y;
        
        if (!window.supabaseClient) {
            addLog('error', 'Supabase не инициализирован!');
            return;
        }
        
        addLog('info', '📥 Подготовка архива откалиброванных макетов...');
        // TODO: Реализовать скачивание архива
        addLog('info', 'Функция скачивания архива будет реализована позже');
    }
    
    // Экспортируем функции
    if (typeof window !== 'undefined') {
        window.sanitizeFileName = sanitizeFileName;
        window.saveGcodeToLocalMemory = saveGcodeToLocalMemory;
        window.extractZipArchive = extractZipArchive;
        window.handleArchiveSelection = handleArchiveSelection;
        window.retryFailedUploads = retryFailedUploads;
        window.uploadCalibratedTemplatesToMemory = uploadCalibratedTemplatesToMemory;
        window.downloadCalibratedTemplates = downloadCalibratedTemplates;
    }
})();
