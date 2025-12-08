// Модуль: utils.js
// Базовые утилиты и функции логирования

// Функция логирования
function addLog(type, message) {
    const logContent = document.getElementById('logContent');
    if (!logContent) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Экспортируем функции в глобальную область
if (typeof window !== 'undefined') {
    window.addLog = addLog;
}

