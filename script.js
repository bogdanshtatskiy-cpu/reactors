// Draconic Evolution Math Data
const DATA = {
    6500: { m: -28557, c: 3332740, shield: 141331, rate: 0.000275 },
    7000: { m: -30205, c: 3520893, shield: 148577, rate: 0.000277 },
    7500: { m: -31647, c: 3685093, shield: 154828, rate: 0.000275 },
    8000: { m: -32925, c: 3829279, shield: 160160, rate: 0.000277 },
    8500: { m: -33143, c: 3874247, shield: 265051, rate: 0.000291 }
};

// State: Fixed 5 slots. null = empty.
// Object: { temp: 8000, fuel: 100, simTime: 60 }
let slots = [null, null, null, null, null];
let useTicks = false;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadData(); // Load from LocalStorage
    render();
});

// View Switching
window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    
    // Simple logic based on tab name
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
    render(); // Re-render numbers
}

// Logic: Add/Remove
window.addReactor = function(index) {
    slots[index] = { temp: 8000, fuel: 100, simTime: 60 }; // Default
    saveAndRender();
}

window.removeReactor = function(index) {
    if(confirm('Удалить реактор #' + (index + 1) + '?')) {
        slots[index] = null;
        saveAndRender();
    }
}

// Logic: Updates
window.updateSlot = function(index, field, value) {
    if (!slots[index]) return;
    
    let val = parseFloat(value);
    
    if (field === 'fuel') val = Math.max(0, Math.min(100, val));
    if (field === 'temp') val = Math.max(6500, Math.min(8500, val));
    
    slots[index][field] = val;
    saveAndRender();
}

// Separate helper for buttons to avoid inline JS mess
window.adjustTemp = function(index, delta) {
    if(!slots[index]) return;
    let newT = slots[index].temp + delta;
    newT = Math.max(6500, Math.min(8500, newT));
    slots[index].temp = newT;
    saveAndRender();
}

// Rendering
function render() {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';
    
    let totalGen = 0, totalShield = 0, totalNet = 0;
    let activeCount = 0;

    slots.forEach((slot, index) => {
        if (slot === null) {
            // Empty Slot
            container.innerHTML += `
                <div class="empty-slot" onclick="addReactor(${index})">
                    <span class="add-text">+ Слот ${index + 1}</span>
                </div>
            `;
        } else {
            // Active Reactor
            activeCount++;
            const stats = calcStats(slot);
            
            // Add to totals
            totalGen += stats.currentGen;
            totalShield += stats.shieldCost;
            totalNet += stats.currentNet;

            const html = `
                <div class="reactor-card">
                    <div class="card-header">
                        <span class="reactor-name">Реактор #${index + 1}</span>
                        <button class="delete-btn" onclick="removeReactor(${index})" title="Удалить">
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
                                <button class="mini-btn" onclick="adjustTemp(${index}, 1000)">+1k</button>
                                <button class="mini-btn" onclick="adjustTemp(${index}, 100)">+100</button>
                                <button class="mini-btn" onclick="adjustTemp(${index}, 10)">+10</button>
                            </div>
                        </div>
                    </div>

                    <div class="control-row">
                        <span class="label">Топливо</span>
                        <div class="control-body fuel-wrapper">
                            <div class="slider-container">
                                <input type="range" min="0" max="100" step="0.1" value="${slot.fuel}" 
                                    oninput="updateSlot(${index}, 'fuel', this.value)">
                                <span class="fuel-val">${slot.fuel.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>

                    <div class="control-row">
                        <span class="label">Симуляция</span>
                        <div class="control-body">
                            <input type="number" class="sim-time-input" value="${slot.simTime}" 
                                onchange="updateSlot(${index}, 'simTime', this.value)">
                            <div style="font-size: 0.7rem; color: #8e8e93; margin-top:2px">минут</div>
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
                            <span class="st-head">Прибыль за ${slot.simTime} мин</span>
                            <span class="st-val net" style="font-size: 1.1rem">+${fmtLarge(stats.simTotalNet)}</span>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += html;
        }
    });

    // Update Summary View
    document.getElementById('sum-count').innerText = `${activeCount}/5`;
    document.getElementById('sum-gen').innerText = fmt(totalGen);
    document.getElementById('sum-shield').innerText = fmt(totalShield);
    document.getElementById('sum-net').innerText = fmt(totalNet);
    
    // Simple efficiency bar (Net / Gen)
    let eff = totalGen > 0 ? (totalNet / totalGen) * 100 : 0;
    document.getElementById('sum-bar').style.width = Math.max(0, eff) + "%";
}

// Math Core
function calcStats(slot) {
    const p = getInterp(slot.temp);
    
    // 1. Instant
    const gen = (p.m * slot.fuel) + p.c;
    const shield = p.shield;
    const net = gen - shield;
    const remSec = slot.fuel / p.rate;
    
    // 2. Sim
    const simSec = slot.simTime * 60;
    const consumed = p.rate * simSec;
    let endFuel = slot.fuel - consumed;
    
    let effectiveSec = simSec;
    if(endFuel < 0) {
        endFuel = 0;
        effectiveSec = slot.fuel / p.rate;
    }
    
    const genStart = (p.m * slot.fuel) + p.c;
    const genEnd = (p.m * endFuel) + p.c;
    const avgGen = (genStart + genEnd) / 2;
    
    const totalTicks = effectiveSec * 20;
    const totalNet = (avgGen * totalTicks) - (shield * totalTicks);
    
    return {
        currentGen: gen,
        shieldCost: shield,
        currentNet: net,
        timeRemainingSec: remSec,
        simTotalNet: totalNet
    };
}

function getInterp(t) {
    // Interpolation logic between known points
    const points = Object.keys(DATA).map(Number).sort((a,b)=>a-b);
    let low = points[0], high = points[points.length-1];
    
    for(let i=0; i<points.length-1; i++){
        if(t >= points[i] && t <= points[i+1]){
            low = points[i]; high = points[i+1]; break;
        }
    }
    
    if(low === high) return DATA[low];
    const r = (t - low)/(high - low);
    const p1 = DATA[low], p2 = DATA[high];
    
    return {
        m: lerp(p1.m, p2.m, r),
        c: lerp(p1.c, p2.c, r),
        shield: lerp(p1.shield, p2.shield, r),
        rate: lerp(p1.rate, p2.rate, r)
    };
}
function lerp(a,b,t){ return a*(1-t)+b*t; }

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
    if(sec <= 0) return "0м";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    
    let str = "";
    if(d > 0) str += `${d}д `;
    if(h > 0) str += `${h}ч `;
    str += `${m}м`;
    
    // Total hours in parens
    const totalH = (sec / 3600).toFixed(1);
    return `${str} (${totalH}ч)`;
}

// Storage
function saveAndRender() {
    localStorage.setItem('draconic_slots_v2', JSON.stringify(slots));
    render();
}
function loadData() {
    const d = localStorage.getItem('draconic_slots_v2');
    if(d) {
        try { slots = JSON.parse(d); } catch(e) {}
    }
    // Ensure size 5
    while(slots.length < 5) slots.push(null);
    slots = slots.slice(0, 5);
}
