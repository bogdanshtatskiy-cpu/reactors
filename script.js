/* Draconic Reactor Physics Engine v2.3 */

const CONSTANTS = {
    BASE_MAX_RFT: 1302880,  
    BASE_SHIELD: 160000,    
    BASE_FUEL_RATE: 0.0000095218 
};

let slots = [null, null, null, null, null];
let useTicks = false;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    render();
});

// UI Utils
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
    let val = parseFloat(value);
    if (isNaN(val)) val = 0;

    if (field === 'fuel') val = Math.max(0, Math.min(100, val));
    if (field === 'temp') val = Math.max(2000, Math.min(10000, val));
    if (['timeD', 'timeH', 'timeM'].includes(field)) val = Math.max(0, val);

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

// --- PHYSICS ---
function getTempDrainFactor(t) {
    if (t > 8000) return 1 + Math.pow(t - 8000, 2) * 0.0000025;
    if (t > 2000) return 1;
    if (t > 1000) return (t - 1000) / 1000;
    return 0;
}

function getScriptSaturation(t) {
    if (t <= 8000) return 0.50; 
    else if (t <= 8115) return 0.50 - ((t - 8000) / 115) * 0.43;
    else return Math.max(0, 0.07 - ((t - 8115) / 885) * 0.07); 
}

function calcStats(slot) {
    const T = slot.temp;
    const FuelPct = slot.fuel; 
    const conv = 1 - (FuelPct / 100);
    const S = getScriptSaturation(T);
    const drainFactor = getTempDrainFactor(T);

    // 1. Instant Rates
    const maxRFt = CONSTANTS.BASE_MAX_RFT * (1 + conv * 2);
    const currentGen = (1 - S) * maxRFt;
    const shieldCost = CONSTANTS.BASE_SHIELD * drainFactor;
    const currentNet = currentGen - shieldCost;

    // Fuel Rate
    const fuelRateTick = drainFactor * (1 - S) * CONSTANTS.BASE_FUEL_RATE;
    const fuelRateSec = fuelRateTick * 20;

    // --- PROJECTION 1: UNTIL EMPTY (0%) ---
    const timeToEmptySec = (fuelRateSec > 0) ? (FuelPct / fuelRateSec) : 0;
    const ticksToEmpty = timeToEmptySec * 20;
    
    // Average Gen for full burn (Conv goes from current to 1.0)
    const endConvFull = 1.0; 
    const endMaxRFtFull = CONSTANTS.BASE_MAX_RFT * (1 + endConvFull * 2);
    const endGenFull = (1 - S) * endMaxRFtFull;
    const avgGenFull = (currentGen + endGenFull) / 2;
    
    const totalNetFull = (avgGenFull * ticksToEmpty) - (shieldCost * ticksToEmpty);
    const totalShieldFull = shieldCost * ticksToEmpty;

    // --- PROJECTION 2: SELECTED TIME (User Input) ---
    const userMin = (slot.timeD * 1440) + (slot.timeH * 60) + slot.timeM;
    const userSec = userMin * 60;
    const userTicks = userSec * 20;

    // Fuel used in this time
    const consumedPct = fuelRateSec * userSec;
    const endFuelUser = Math.max(0, FuelPct - consumedPct);
    const endConvUser = 1 - (endFuelUser / 100);
    
    const endMaxRFtUser = CONSTANTS.BASE_MAX_RFT * (1 + endConvUser * 2);
    const endGenUser = (1 - S) * endMaxRFtUser;
    const avgGenUser = (currentGen + endGenUser) / 2;

    const totalNetUser = (avgGenUser * userTicks) - (shieldCost * userTicks);
    const totalShieldUser = shieldCost * userTicks;

    return {
        currentGen,
        shieldCost,
        currentNet,
        timeToEmptySec,
        totalNetFull,
        totalShieldFull,
        totalNetUser,
        totalShieldUser
    };
}

// --- RENDER ---
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
                </div>`;
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    <div class="control-row">
                        <span class="label">Температура</span>
                        <div class="temp-row-container">
                            <button class="temp-btn" onclick="adjustTemp(${index}, -1000)">-1k</button>
                            <button class="temp-btn" onclick="adjustTemp(${index}, -100)">-100</button>
                            <button class="temp-btn" onclick="adjustTemp(${index}, -10)">-10</button>
                            <div class="temp-val-box">${slot.temp}</div>
                            <button class="temp-btn" onclick="adjustTemp(${index}, 10)">+10</button>
                            <button class="temp-btn" onclick="adjustTemp(${index}, 100)">+100</button>
                            <button class="temp-btn" onclick="adjustTemp(${index}, 1000)">+1k</button>
                        </div>
                    </div>

                    <div class="control-row">
                        <span class="label">Топливо</span>
                        <div class="slider-container">
                            <input type="range" min="0" max="100" step="0.1" value="${slot.fuel}" 
                                oninput="updateSlot(${index}, 'fuel', this.value)">
                            <span class="fuel-val">${slot.fuel.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div class="control-row">
                        <span class="label">Выбрать время симуляции</span>
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
                            <span class="st-head">Текущий чистый выход</span>
                            <span class="st-val net">${fmt(stats.currentNet)}</span>
                        </div>

                        <div class="st-item full-width">
                            <span class="st-head">Время до 0% топлива</span>
                            <span class="st-val">${fmtTimeDetailed(stats.timeToEmptySec)}</span>
                            <div class="sub-data">
                                Прибыль: <span class="sub-val n">+${fmtLarge(stats.totalNetFull)}</span><br>
                                Щиты: <span class="sub-val">-${fmtLarge(stats.totalShieldFull)}</span>
                            </div>
                        </div>

                        <div class="st-item full-width" style="border-top: none; margin-top:0; padding-top:0">
                            <span class="st-head">Прибыль за выбранное время</span>
                            <span class="st-val net" style="font-size: 1.2rem">+${fmtLarge(stats.totalNetUser)}</span>
                             <div class="sub-data">
                                Щиты: <span class="sub-val">-${fmtLarge(stats.totalShieldUser)}</span><br>
                                Чистыми за период
                            </div>
                        </div>
                    </div>
                </div>`;
            container.innerHTML += html;
        }
    });

    // Summary Update
    document.getElementById('sum-count').innerText = `${activeCount}/5`;
    document.getElementById('sum-gen').innerText = fmt(totalGen);
    document.getElementById('sum-shield').innerText = fmt(totalShield);
    document.getElementById('sum-net').innerText = fmt(totalNet);
    let eff = totalGen > 0 ? (totalNet / totalGen) * 100 : 0;
    document.getElementById('sum-bar').style.width = Math.max(0, eff) + "%";
}

function fmt(num) {
    if(useTicks) return Math.round(num).toLocaleString() + " RF/t";
    return fmtLarge(num * 20) + "/s";
}
function fmtLarge(num) {
    if(num > 1e12) return (num/1e12).toFixed(2)+" T";
    if(num > 1e9) return (num/1e9).toFixed(2)+" B";
    if(num > 1e6) return (num/1e6).toFixed(2)+" M";
    if(num > 1e3) return (num/1e3).toFixed(1)+" k";
    return Math.round(num).toLocaleString();
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

function saveAndRender() {
    localStorage.setItem('draconic_slots_v5', JSON.stringify(slots));
    render();
}
function loadData() {
    const d = localStorage.getItem('draconic_slots_v5');
    if(d) try { slots = JSON.parse(d); } catch(e) {}
    while(slots.length < 5) slots.push(null);
    slots = slots.slice(0, 5);
}
