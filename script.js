/* Draconic Reactor Physics Engine
   Калибровка произведена точно по конфигам OpenComputers Lua Script
*/

const CONSTANTS = {
    // Высчитано из 1.142 MRF/t при 8000C (S = 0.5)
    BASE_MAX_RFT: 1302880,  
    
    // Базовое потребление щита до 8000C
    BASE_SHIELD: 160000,    
    
    // Константа скорости сгорания. Высчитана так, чтобы при S=0.5 
    // 100% топлива сгорали РОВНО за 12 дней 3 часа 43 минуты
    BASE_FUEL_RATE: 0.0000095218 
};

// Стейт (состояние 5 слотов)
let slots = [null, null, null, null, null];
let useTicks = false;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    render();
});

// --- UI Навигация и Управление ---

window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    
    if(tabName === 'reactors') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('view-reactors').classList.add('active');
    } else {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('view-summary').classList.add('active');
    }
}

window.toggleUnit = function(isTicks) {
    useTicks = isTicks;
    render();
}

window.addReactor = function(index) {
    slots[index] = { temp: 8000, fuel: 100, timeD: 0, timeH: 1, timeM: 0 };
    saveAndRender();
}

window.removeReactor = function(index) {
    if(confirm('Удалить реактор #' + (index + 1) + '?')) {
        slots[index] = null;
        saveAndRender();
    }
}

window.updateSlot = function(index, field, value) {
    if (!slots[index]) return;
    let val = parseFloat(value) || 0;

    if (field === 'fuel') val = Math.max(0, Math.min(100, val));
    if (field === 'temp') val = Math.max(2000, Math.min(10000, val));
    
    if (field === 'timeD' || field === 'timeH' || field === 'timeM') {
        val = Math.max(0, val);
    }

    slots[index][field] = val;
    saveAndRender();
}

window.adjustTemp = function(index, delta) {
    if(!slots[index]) return;
    let newT = slots[index].temp + delta;
    newT = Math.max(2000, Math.min(10000, newT));
    slots[index].temp = newT;
    saveAndRender();
}

// --- ФИЗИЧЕСКИЙ ДВИЖОК DRACONIC EVOLUTION ---

// Множитель расхода поля (и топлива) в зависимости от температуры
function getTempDrainFactor(t) {
    if (t > 8000) return 1 + Math.pow(t - 8000, 2) * 0.0000025;
    if (t > 2000) return 1;
    if (t > 1000) return (t - 1000) / 1000;
    return 0;
}

// Эмуляция поведения Lua-скрипта (Saturation Target)
function getScriptSaturation(t) {
    if (t <= 8000) {
        // Стандартный профиль: 12 дней (Target Saturation = 0.5)
        return 0.50; 
    } else if (t <= 8115) {
        // Профиль максимальной выработки: интерполяция от S=0.5 к S=0.07 (как в логах 8115C)
        return 0.50 - ((t - 8000) / 115) * 0.43;
    } else {
        // Выше 8115C скрипты держат Насыщение около нуля для агрессивного сжигания
        return Math.max(0, 0.07 - ((t - 8115) / 885) * 0.07); 
    }
}

function calcStats(slot) {
    const T = slot.temp;
    const FuelPct = slot.fuel; 
    
    // В моде конверсия идет от 0 (топлива 100%) до 1 (топлива 0%)
    const conv = 1 - (FuelPct / 100);

    const S = getScriptSaturation(T);
    const drainFactor = getTempDrainFactor(T);

    // 1. Текущая генерация: maxRFt = baseMaxRFt * (1 + conv * 2)
    const maxRFt = CONSTANTS.BASE_MAX_RFT * (1 + conv * 2);
    const currentGen = (1 - S) * maxRFt;

    // 2. Расход щита
    const shieldCost = CONSTANTS.BASE_SHIELD * drainFactor;
    const currentNet = currentGen - shieldCost;

    // 3. Скорость расхода топлива (% в тик -> % в сек)
    const fuelRateTick = drainFactor * (1 - S) * CONSTANTS.BASE_FUEL_RATE;
    const fuelRateSec = fuelRateTick * 20;

    // 4. Оставшееся время до 0%
    const timeRemainingSec = (fuelRateSec > 0) ? (FuelPct / fuelRateSec) : 0;

    // --- СИМУЛЯЦИЯ ЗА ПЕРИОД ---
    const simMinutes = (slot.timeD * 1440) + (slot.timeH * 60) + slot.timeM;
    const simSec = simMinutes * 60;

    const consumedPct = fuelRateSec * simSec;
    let endFuel = FuelPct - consumedPct;
    let effectiveSec = simSec;
    
    if (endFuel < 0) {
        endFuel = 0;
        effectiveSec = (fuelRateSec > 0) ? (FuelPct / fuelRateSec) : 0;
    }

    // Вычисляем генерацию в конце периода (т.к. conv вырастет)
    const endConv = 1 - (endFuel / 100);
    const endMaxRFt = CONSTANTS.BASE_MAX_RFT * (1 + endConv * 2);
    const endGen = (1 - S) * endMaxRFt;

    // Линейное усреднение генерации за выбранный период
    const avgGen = (currentGen + endGen) / 2;
    const totalTicks = effectiveSec * 20;
    
    // Итоговая чистая прибыль
    const simTotalNet = (avgGen * totalTicks) - (shieldCost * totalTicks);

    return {
        currentGen,
        shieldCost,
        currentNet,
        timeRemainingSec,
        simTotalNet
    };
}

// --- РЕНДЕРИНГ ИНТЕРФЕЙСА ---

function render() {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';
    
    let totalGen = 0, totalShield = 0, totalNet = 0;
    let activeCount = 0;

    slots.forEach((slot, index) => {
        if (slot === null) {
            container.innerHTML += `
                <div class="empty-slot" onclick="addReactor(${index})">
                    <span class="add-text">+ Слот ${index + 1}</span>
                </div>
            `;
        } else {
            activeCount++;
            const stats = calcStats(slot);
            
            totalGen += stats.currentGen;
            totalShield += stats.shieldCost;
            totalNet += stats.currentNet;

            const html = `
                <div class="reactor-card">
                    <div class="card-header">
                        <span class="reactor-name">Реактор #${index + 1}</span>
                        <button class="delete-btn" onclick="removeReactor(${index})">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    <div class="control-row">
                        <span class="label">Температура</span>
                        <div class="control-body temp-wrapper">
                            <div class="t-btn-group">
                                <button class="mini-btn" onclick="adjustTemp(${index}, -1000)">-1k</button>
                                <button class="mini-btn" onclick="adjustTemp(${index}, -100)">-100</button>
                                <button class="mini-btn" onclick="adjustTemp(${index}, -10)">-10</button>
                            </div>
                            <div class="temp-display">${slot.temp}</div>
                             <div class="t-btn-group">
                                <button class="mini-btn" onclick="adjustTemp(${index}, 10)">+10</button>
                                <button class="mini-btn" onclick="adjustTemp(${index}, 100)">+100</button>
                                <button class="mini-btn" onclick="adjustTemp(${index}, 1000)">+1k</button>
                            </div>
                        </div>
                    </div>

                    <div class="control-row">
                        <span class="label">Топливо</span>
                        <div class="control-body slider-container">
                            <input type="range" min="0" max="100" step="0.1" value="${slot.fuel}" 
                                oninput="updateSlot(${index}, 'fuel', this.value)">
                            <span class="fuel-val">${slot.fuel.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div class="control-row">
                        <span class="label">Симуляция</span>
                        <div class="time-inputs-group">
                            <div class="time-field">
                                <input type="number" value="${slot.timeD}" onchange="updateSlot(${index}, 'timeD', this.value)">
                                <span>дней</span>
                            </div>
                            <div class="time-field">
                                <input type="number" value="${slot.timeH}" onchange="updateSlot(${index}, 'timeH', this.value)">
                                <span>часов</span>
                            </div>
                            <div class="time-field">
                                <input type="number" value="${slot.timeM}" onchange="updateSlot(${index}, 'timeM', this.value)">
                                <span>минут</span>
                            </div>
                        </div>
                    </div>

                    <div class="stats-table">
                        <div class="st-item">
                            <span class="st-head">Текущая добыча</span>
                            <span class="st-val">${fmt(stats.currentGen)}</span>
                        </div>
                        <div class="st-item">
                            <span class="st-head">Расход щитов</span>
                            <span class="st-val shield">${fmt(stats.shieldCost)}</span>
                        </div>
                        <div class="st-item">
                            <span class="st-head">Чистыми (Сейчас)</span>
                            <span class="st-val net">${fmt(stats.currentNet)}</span>
                        </div>
                         <div class="st-item">
                            <span class="st-head">До 0% топлива</span>
                            <span class="st-val">${fmtTimeDetailed(stats.timeRemainingSec)}</span>
                        </div>
                        <div class="st-item" style="grid-column: span 2; border-top: 1px solid rgba(255,255,255,0.1); padding-top:8px">
                            <span class="st-head">Прибыль за выбранное время</span>
                            <span class="st-val net" style="font-size: 1.1rem">+${fmtLarge(stats.simTotalNet)}</span>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += html;
        }
    });

    // Сводка (Summary View)
    document.getElementById('sum-count').innerText = `${activeCount}/5`;
    document.getElementById('sum-gen').innerText = fmt(totalGen);
    document.getElementById('sum-shield').innerText = fmt(totalShield);
    document.getElementById('sum-net').innerText = fmt(totalNet);
    let eff = totalGen > 0 ? (totalNet / totalGen) * 100 : 0;
    document.getElementById('sum-bar').style.width = Math.max(0, eff) + "%";
}

// Утилиты форматирования
function fmt(num) {
    if(useTicks) return Math.round(num).toLocaleString() + " RF/t";
    return fmtLarge(num * 20) + "/s";
}

function fmtLarge(num) {
    if(num > 1e12) return (num/1e12).toFixed(2)+" TRF";
    if(num > 1e9) return (num/1e9).toFixed(2)+" BRF";
    if(num > 1e6) return (num/1e6).toFixed(2)+" MRF";
    if(num > 1e3) return (num/1e3).toFixed(1)+" kRF";
    return Math.round(num).toLocaleString() + " RF";
}

function fmtTimeDetailed(sec) {
    if(sec <= 0 || !isFinite(sec)) return "∞";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    
    let str = "";
    if(d > 0) str += `${d}д `;
    if(h > 0) str += `${h}ч `;
    str += `${m}м`;
    
    const totalH = (sec / 3600).toFixed(1);
    return `${str} (${totalH}ч)`;
}

// Сохранение и загрузка (LocalStorage)
function saveAndRender() {
    localStorage.setItem('draconic_slots_physics_v1', JSON.stringify(slots));
    render();
}

function loadData() {
    const d = localStorage.getItem('draconic_slots_physics_v1');
    if(d) {
        try { slots = JSON.parse(d); } catch(e) {}
    }
    while(slots.length < 5) slots.push(null);
    slots = slots.slice(0, 5);
}
