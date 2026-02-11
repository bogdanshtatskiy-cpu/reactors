/* Draconic Reactor Physics Engine
   Based on TileReactorCore.java logic provided by user.
   
   Calibration Constants (Derived from logs 25.01-27.01):
   - Base Field Cost: ~160,000 RF/t (at <8000C)
   - Max Generation Multiplier: Tuned to match ~1.09M RF/t at 8000C/83% Fuel
   - Fuel Usage Multiplier: Tuned to match ~0.000145 %/s at 8000C
*/

const CONSTANTS = {
    BASE_FIELD_COST: 160400, // Matches the ~160k baseline in logs
    GEN_MULTIPLIER: 575000,  // Calibrated to match log generation
    FUEL_USE_CONST: 0.00072, // Calibrated to match log burn rate (~9 days runtime)
    MIN_TEMP: 2000,          // Physics break down below start temp
    MAX_TEMP: 10000
};

// State Management
let slots = [null, null, null, null, null];
let useTicks = false;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    render();
});

// --- UI Logic (Tabs, Units, etc) ---

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
    if (field === 'temp') val = Math.max(CONSTANTS.MIN_TEMP, Math.min(CONSTANTS.MAX_TEMP, val));
    
    // Time fields
    if (field === 'timeD') val = Math.max(0, val);
    if (field === 'timeH') val = Math.max(0, val);
    if (field === 'timeM') val = Math.max(0, val);

    slots[index][field] = val;
    saveAndRender();
}

window.adjustTemp = function(index, delta) {
    if(!slots[index]) return;
    let newT = slots[index].temp + delta;
    newT = Math.max(CONSTANTS.MIN_TEMP, Math.min(CONSTANTS.MAX_TEMP, newT));
    slots[index].temp = newT;
    saveAndRender();
}

// --- PHYSICS ENGINE ---

function solveSaturation(targetTemp, conversion) {
    // Inverse problem: Find 'Saturation' (S) that results in a stable 'targetTemp'.
    // Formula from prompt: 
    // Rise = (Expo - Resist * (1-conv) + conv*1000) / 10000
    // For stable temp, Rise should be 0 (Equilibrium).
    // Therefore: Expo = Resist * (1 - conv) - conv * 1000
    
    // 1. Calculate Resist based on Temp
    // Tn = (Temp / MaxTemp) * 50
    // Resist = Tn^4 / (100 - Tn)
    const maxReactTemp = 10000;
    const tn = (targetTemp / maxReactTemp) * 50;
    if (tn >= 100) return 0; // Singularity
    const resist = Math.pow(tn, 4) / (100 - tn);

    // 2. Calculate Required Expo
    const conv = conversion; // 0 to 1
    let requiredExpo = resist * (1 - conv) - (conv * 1000);
    
    // 3. Solve S for Expo
    // Expo = (Si^3 / (100 - Si)) + 444.7
    // Si^3 / (100 - Si) = requiredExpo - 444.7
    const targetVal = requiredExpo - 444.7;

    if (targetVal <= 0) return 0.99; // High saturation (cold reactor)

    // Binary search for Si (0 to 99)
    let low = 0, high = 99;
    let si = 0;
    for(let i=0; i<20; i++) { // 20 iterations is enough precision
        let mid = (low + high) / 2;
        let val = Math.pow(mid, 3) / (100 - mid);
        if(val < targetVal) low = mid;
        else high = mid;
        si = mid;
    }

    // Si = (1 - S) * 99  => S = 1 - (Si / 99)
    let s = 1 - (si / 99);
    return Math.max(0, Math.min(1, s));
}

function getTempDrainFactor(temp) {
    if (temp > 8000) {
        return 1 + Math.pow(temp - 8000, 2) * 0.0000025; 
    } else if (temp > 2000) {
        return 1;
    } else if (temp > 1000) {
        return (temp - 1000) / 1000;
    }
    return 0;
}

function calcStats(slot) {
    // 1. Inputs
    const T = slot.temp;
    const FuelPct = slot.fuel; 
    
    // "Conversion" in logic is ratio of Used/Total.
    // Slider is "Fuel Remaining %". So Conv = 1 - (Fuel/100)
    // However, the formula conv range is likely 0 to 1 approx.
    const conv = 1 - (FuelPct / 100);

    // 2. Solve Physics State
    const S = solveSaturation(T, conv);
    const drainFactor = getTempDrainFactor(T);

    // 3. Calculate Rates
    // Formula 3: MaxRFt
    // baseMax = ... * 1.5
    // maxRFt = baseMax * (1 + conv * 2)
    const baseMaxRFt = CONSTANTS.GEN_MULTIPLIER; 
    const maxRFt = baseMaxRFt * (1 + conv * 2);

    // Formula 4: Generation
    // generationRate = (1 - S) * maxRFt
    const currentGen = (1 - S) * maxRFt;

    // Formula 5: Field Drain
    // Logs show ~160k base. Logic has formula for multiplier.
    const shieldCost = CONSTANTS.BASE_FIELD_COST * drainFactor;
    const currentNet = currentGen - shieldCost;

    // Formula 6: Fuel Use
    // fuelUseRate = tempDrainFactor * (1 - S) * CONST
    const fuelConsumptionRate = drainFactor * (1 - S) * CONSTANTS.FUEL_USE_CONST; 
    // Note: This rate is in "% per tick" (approx, adjusted by constant)
    // We need % per second for display
    const fuelRatePerSec = fuelConsumptionRate * 20;

    // --- Simulation ---
    const simMinutes = (slot.timeD * 1440) + (slot.timeH * 60) + slot.timeM;
    const simSec = simMinutes * 60;

    // Fuel consumed in simulation
    const consumedPct = fuelRatePerSec * simSec;
    let endFuel = FuelPct - consumedPct;
    
    let effectiveSec = simSec;
    if (endFuel < 0) {
        endFuel = 0;
        effectiveSec = (FuelPct / fuelRatePerSec);
    }

    // Time until empty (from current)
    const timeRemainingSec = (fuelRatePerSec > 0) ? (FuelPct / fuelRatePerSec) : 0;

    // Average Generation during simulation
    // As fuel burns, 'conv' increases.
    // 'conv' increasing -> 'maxRFt' increases -> Gen increases.
    // However, 'S' might shift slightly to maintain Temp. 
    // For specific simulation, we average start and end states.
    
    const endConv = 1 - (endFuel / 100);
    const endS = solveSaturation(T, endConv);
    const endMaxRFt = baseMaxRFt * (1 + endConv * 2);
    const endGen = (1 - endS) * endMaxRFt;

    const avgGen = (currentGen + endGen) / 2;
    const totalTicks = effectiveSec * 20;
    
    const simTotalNet = (avgGen * totalTicks) - (shieldCost * totalTicks);

    return {
        currentGen,
        shieldCost,
        currentNet,
        timeRemainingSec,
        simTotalNet
    };
}

// --- RENDERER ---

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
                        <button class="delete-btn" onclick="removeReactor(${index})">×</button>
                    </div>

                    <div class="control-row">
                        <span class="label">Температура</span>
                        <div class="control-body temp-wrapper">
                            <div class="t-btn-group">
                                <button class="mini-btn" onclick="adjustTemp(${index}, -1000)">-1k</button>
                                <button class="mini-btn" onclick="adjustTemp(${index}, -100)">-100</button>
                            </div>
                            <div class="temp-display">${slot.temp}</div>
                             <div class="t-btn-group">
                                <button class="mini-btn" onclick="adjustTemp(${index}, 1000)">+1k</button>
                                <button class="mini-btn" onclick="adjustTemp(${index}, 100)">+100</button>
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

    // Summary Update
    document.getElementById('sum-count').innerText = `${activeCount}/5`;
    document.getElementById('sum-gen').innerText = fmt(totalGen);
    document.getElementById('sum-shield').innerText = fmt(totalShield);
    document.getElementById('sum-net').innerText = fmt(totalNet);
    let eff = totalGen > 0 ? (totalNet / totalGen) * 100 : 0;
    document.getElementById('sum-bar').style.width = Math.max(0, eff) + "%";
}

// Utils
function fmt(num) {
    if(useTicks) return Math.round(num).toLocaleString() + " RF/t";
    return fmtLarge(num * 20) + "/s";
}
function fmtLarge(num) {
    if(num > 1e12) return (num/1e12).toFixed(2)+"T";
    if(num > 1e9) return (num/1e9).toFixed(2)+"B";
    if(num > 1e6) return (num/1e6).toFixed(2)+"M";
    if(num > 1e3) return (num/1e3).toFixed(1)+"k";
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
    return str;
}

// Storage
function saveAndRender() {
    localStorage.setItem('draconic_slots_v4', JSON.stringify(slots));
    render();
}
function loadData() {
    const d = localStorage.getItem('draconic_slots_v4');
    if(d) {
        try { slots = JSON.parse(d); } catch(e) {}
    }
    while(slots.length < 5) slots.push(null);
    slots = slots.slice(0, 5);
}
