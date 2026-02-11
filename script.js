/* Data from Analysis (Interpolation Points) */
// Format: Temp: { m: slope, c: intercept, shield: cost, rate: burn_rate_per_sec }
// Burn rates: 6500-8000 ~0.000276, 8500 ~0.000291
// Shield: Smooth rise 6500-8000, Jump at 8500
const DATA_POINTS = {
    6500: { m: -28557, c: 3332740, shield: 141331, rate: 0.000275 },
    7000: { m: -30205, c: 3520893, shield: 148577, rate: 0.000277 },
    7500: { m: -31647, c: 3685093, shield: 154828, rate: 0.000275 },
    8000: { m: -32925, c: 3829279, shield: 160160, rate: 0.000277 },
    8500: { m: -33143, c: 3874247, shield: 265051, rate: 0.000291 }
};

let reactors = []; // Stores state: { id, temp, fuel, simTime }
let useTicks = false;

document.addEventListener('DOMContentLoaded', () => {
    // Event Listeners
    document.getElementById('addReactorBtn').addEventListener('click', addReactor);
    document.getElementById('globalStatsBtn').addEventListener('click', showGlobalStats);
    document.getElementById('closeModal').addEventListener('click', () => document.getElementById('globalModal').classList.add('hidden'));
    document.getElementById('unitToggle').addEventListener('change', (e) => {
        useTicks = e.target.checked;
        renderReactors();
        updateGlobalStats();
    });
});

/* Core Logic: Interpolation */
function getReactorStats(temp) {
    // Find closest lower and upper bound
    const temps = Object.keys(DATA_POINTS).map(Number).sort((a,b) => a-b);
    let lower = temps[0], upper = temps[temps.length-1];

    for (let i = 0; i < temps.length - 1; i++) {
        if (temp >= temps[i] && temp <= temps[i+1]) {
            lower = temps[i];
            upper = temps[i+1];
            break;
        }
    }

    if (lower === upper) return DATA_POINTS[lower];

    // Linear Interpolation
    const ratio = (temp - lower) / (upper - lower);
    const p1 = DATA_POINTS[lower];
    const p2 = DATA_POINTS[upper];

    return {
        m: lerp(p1.m, p2.m, ratio),
        c: lerp(p1.c, p2.c, ratio),
        shield: lerp(p1.shield, p2.shield, ratio),
        rate: lerp(p1.rate, p2.rate, ratio)
    };
}

function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

/* Reactor Management */
function addReactor() {
    if (reactors.length >= 5) {
        alert("Максимум 5 реакторов!");
        return;
    }
    const id = Date.now();
    reactors.push({ id, temp: 6500, fuel: 100, simTime: 60 });
    renderReactors();
    updateGlobalStats();
}

function removeReactor(id) {
    reactors = reactors.filter(r => r.id !== id);
    renderReactors();
    updateGlobalStats();
}

function updateReactorState(id, key, value) {
    const r = reactors.find(r => r.id === id);
    if (r) {
        r[key] = value;
        // Constraints
        if (key === 'temp') r.temp = Math.max(6500, Math.min(8500, r.temp));
        if (key === 'fuel') r.fuel = Math.max(0, Math.min(100, r.fuel));
        renderReactors(); // Re-render to update stats
        updateGlobalStats();
    }
}

/* Rendering */
function renderReactors() {
    const grid = document.getElementById('reactorsGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (reactors.length === 0) {
        grid.innerHTML = '';
        grid.appendChild(emptyState);
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';
    grid.innerHTML = ''; // Clear (not efficient but safe)

    reactors.forEach((r, index) => {
        const stats = calculateSimulation(r);
        const card = document.createElement('div');
        card.className = 'reactor-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">Reactor #${index + 1}</span>
                <button class="glass-btn danger-btn" onclick="removeReactor(${r.id})">✕</button>
            </div>

            <div class="control-group">
                <span class="control-label">Температура ядра</span>
                <div class="temp-control">
                    <div class="temp-buttons">
                        <button class="t-btn" onclick="adjustTemp(${r.id}, -1000)">-1000</button>
                        <button class="t-btn" onclick="adjustTemp(${r.id}, -100)">-100</button>
                        <button class="t-btn" onclick="adjustTemp(${r.id}, -10)">-10</button>
                    </div>
                    <div class="temp-display">${r.temp}°C</div>
                    <div class="temp-buttons">
                        <button class="t-btn" onclick="adjustTemp(${r.id}, 10)">+10</button>
                        <button class="t-btn" onclick="adjustTemp(${r.id}, 100)">+100</button>
                        <button class="t-btn" onclick="adjustTemp(${r.id}, 1000)">+1000</button>
                    </div>
                </div>
            </div>

            <div class="input-row control-group">
                <div class="input-wrap">
                    <span class="control-label">Топливо (%)</span>
                    <input type="number" value="${r.fuel}" onchange="updateReactorState(${r.id}, 'fuel', parseFloat(this.value))" step="0.1">
                </div>
                <div class="input-wrap">
                    <span class="control-label">Симуляция (мин)</span>
                    <input type="number" value="${r.simTime}" onchange="updateReactorState(${r.id}, 'simTime', parseFloat(this.value))">
                </div>
            </div>

            <div class="stats-section">
                <div class="stats-title">ТЕКУЩЕЕ СОСТОЯНИЕ</div>
                <div class="stat-row">
                    <span class="s-label">Выработка</span>
                    <span class="s-value">${fmtVal(stats.currentGen)}</span>
                </div>
                <div class="stat-row">
                    <span class="s-label">Щиты</span>
                    <span class="s-value shield">-${fmtVal(stats.shieldCost)}</span>
                </div>
                <div class="stat-row">
                    <span class="s-label">Чистая прибыль</span>
                    <span class="s-value net">${fmtVal(stats.currentNet)}</span>
                </div>
                <div class="stat-row">
                    <span class="s-label">Работает уже</span>
                    <span class="s-value">${fmtTime(stats.timeWorkedSec)}</span>
                </div>
                <div class="stat-row">
                    <span class="s-label">Осталось работать</span>
                    <span class="s-value">${fmtTime(stats.timeRemainingSec)}</span>
                </div>
                 <div class="fuel-bar-bg">
                    <div class="fuel-bar-fill" style="width: ${r.fuel}%"></div>
                </div>
            </div>

            <div class="stats-section">
                <div class="stats-title">ЗА ${r.simTime} МИНУТ</div>
                <div class="stat-row">
                    <span class="s-label">Всего добыто</span>
                    <span class="s-value">${fmtLarge(stats.simTotalGen)}</span>
                </div>
                 <div class="stat-row">
                    <span class="s-label">Потрачено на щит</span>
                    <span class="s-value">${fmtLarge(stats.simTotalShield)}</span>
                </div>
                <div class="stat-row">
                    <span class="s-label">Заработок (Чистыми)</span>
                    <span class="s-value net">+${fmtLarge(stats.simTotalNet)}</span>
                </div>
                 <div class="stat-row">
                    <span class="s-label">Расход топлива</span>
                    <span class="s-value">-${stats.simFuelConsumed.toFixed(2)}%</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function adjustTemp(id, delta) {
    const r = reactors.find(r => r.id === id);
    if (r) {
        updateReactorState(id, 'temp', r.temp + delta);
    }
}

/* Math Logic */
function calculateSimulation(r) {
    const params = getReactorStats(r.temp);
    
    // 1. Current State Stats
    // Gen = m * Fuel + c
    const currentGen = (params.m * r.fuel) + params.c;
    const shieldCost = params.shield;
    const currentNet = currentGen - shieldCost;

    // Time calculations
    // How long to burn 1%? = 1 / rate
    // Time Worked: (100 - fuel) / rate
    const timeWorkedSec = (100 - r.fuel) / params.rate;
    // Time Remaining: fuel / rate
    const timeRemainingSec = r.fuel / params.rate;

    // 2. Period Simulation
    const simSeconds = r.simTime * 60;
    
    // Fuel at end of sim
    // consumption = rate * seconds
    const fuelConsumed = params.rate * simSeconds;
    let endFuel = r.fuel - fuelConsumed;
    let effectiveSeconds = simSeconds;
    
    if (endFuel < 0) {
        endFuel = 0;
        effectiveSeconds = r.fuel / params.rate; // Time until it actually stopped
    }

    // Average Generation over this period
    // GenStart = m*Start + c
    // GenEnd = m*End + c
    const genStart = (params.m * r.fuel) + params.c;
    const genEnd = (params.m * endFuel) + params.c;
    const avgGen = (genStart + genEnd) / 2;

    const totalTicks = effectiveSeconds * 20;
    
    const simTotalGen = avgGen * totalTicks;
    const simTotalShield = shieldCost * totalTicks;
    const simTotalNet = simTotalGen - simTotalShield;

    return {
        currentGen,
        shieldCost,
        currentNet,
        timeWorkedSec,
        timeRemainingSec,
        simTotalGen,
        simTotalShield,
        simTotalNet,
        simFuelConsumed: (r.fuel - endFuel)
    };
}

/* Global Stats */
function showGlobalStats() {
    updateGlobalStats();
    document.getElementById('globalModal').classList.remove('hidden');
}

function updateGlobalStats() {
    let totalNet = 0;
    let totalGen = 0;
    let totalShield = 0;

    reactors.forEach(r => {
        const stats = calculateSimulation(r);
        totalGen += stats.currentGen; // Showing current instant output sum
        totalShield += stats.shieldCost;
        totalNet += stats.currentNet;
    });

    document.getElementById('g-count').textContent = reactors.length;
    document.getElementById('g-gen').textContent = fmtVal(totalGen);
    document.getElementById('g-shield').textContent = fmtVal(totalShield);
    document.getElementById('g-net').textContent = fmtVal(totalNet);
}

/* Formatters */
function fmtVal(val) {
    if (useTicks) return Math.round(val).toLocaleString() + " RF/t";
    return fmtLarge(val * 20) + "/s";
}

function fmtLarge(num) {
    if (num > 1e12) return (num / 1e12).toFixed(2) + " T";
    if (num > 1e9) return (num / 1e9).toFixed(2) + " B";
    if (num > 1e6) return (num / 1e6).toFixed(2) + " M";
    if (num > 1e3) return (num / 1e3).toFixed(1) + " k";
    return Math.round(num).toLocaleString();
}

function fmtTime(seconds) {
    if (seconds <= 0) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    // const s = Math.floor(seconds % 60);
    return `${h}ч ${m}м`;
}
