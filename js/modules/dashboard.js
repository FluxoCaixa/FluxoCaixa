/**
 * ARQUIVO: js/modules/dashboard.js
 * DESCRIÇÃO: Dashboard com Importação Automática de Gráficos (RESOLVIDO)
 */

// --- IMPORTAÇÃO DIRETA DA BIBLIOTECA DE GRÁFICOS ---
import { Chart, registerables } from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm';

// Registra os componentes necessários para desenhar
Chart.register(...registerables);

let dashboardChartFlow = null;
let dashboardChartPie = null;
let dashboardChartBar = null;
let dashboardChartLine = null;

// Estado
let viewMode = 'real'; // 'real' ou 'forecast'
let allDataCache = [];
let userGoals = JSON.parse(localStorage.getItem('fluxo_goals')) || {};

export function initDashboard() {
    setupDashboardControls();
}

export function updateDashboard(transactions) {
    console.log("📊 Dashboard: Recebidos", transactions.length, "itens.");
    allDataCache = transactions;
    renderDashboard();
}

function setupDashboardControls() {
    const btnReal = document.getElementById('btn-view-real');
    const btnForecast = document.getElementById('btn-view-forecast');
    const btnGoals = document.getElementById('btn-open-goals');
    const monthFilter = document.getElementById('dash-month-filter');

    // Define mês atual se estiver vazio
    if (monthFilter && !monthFilter.value) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        monthFilter.value = `${yyyy}-${mm}`;
    }

    if (btnReal && btnForecast) {
        btnReal.onclick = () => switchMode('real');
        btnForecast.onclick = () => switchMode('forecast');
    }

    if (monthFilter) {
        monthFilter.addEventListener('change', () => renderDashboard());
    }

    if (btnGoals) btnGoals.onclick = openGoalsModal;
    
    // Botões do Modal
    const btnSave = document.getElementById('btn-save-goals');
    const btnClose = document.getElementById('btn-close-goals');
    if(btnSave) btnSave.onclick = saveGoals;
    if(btnClose) btnClose.onclick = () => document.getElementById('modal-goals').classList.add('hidden');
}

function switchMode(mode) {
    console.log("🔄 Trocando modo para:", mode);
    viewMode = mode;
    const btnReal = document.getElementById('btn-view-real');
    const btnForecast = document.getElementById('btn-view-forecast');

    const active = ['bg-indigo-600', 'text-white', 'shadow-lg', 'ring-1', 'ring-indigo-500'];
    const inactive = ['text-slate-400', 'hover:text-white', 'bg-slate-800'];

    if (mode === 'real') {
        btnReal.classList.add(...active);
        btnReal.classList.remove('text-slate-400', 'bg-slate-800');
        
        btnForecast.classList.remove(...active);
        btnForecast.classList.add(...inactive);
    } else {
        btnForecast.classList.add(...active);
        btnForecast.classList.remove('text-slate-400', 'bg-slate-800');

        btnReal.classList.remove(...active);
        btnReal.classList.add(...inactive);
    }

    renderDashboard();
}

function renderDashboard() {
    const monthFilter = document.getElementById('dash-month-filter');
    const selectedMonth = monthFilter ? monthFilter.value : null;

    // 1. FILTRAGEM
    let filteredData = allDataCache.filter(t => {
        if (!t.date || t.date === 'Invalid Date') return false;

        // Filtro Mês
        if (selectedMonth && !t.date.startsWith(selectedMonth)) return false;
        
        // Filtro Status
        const isPaid = t.status === true || t.status === 'true' || t.status === 'Pago';

        if (viewMode === 'real') {
            return isPaid; 
        } else {
            return true; // Previsão pega tudo
        }
    });

    console.log(`🔍 Modo: ${viewMode.toUpperCase()} | Itens filtrados: ${filteredData.length}`);

    // 2. CÁLCULOS KPI
    let totalReceitas = 0;
    let totalDespesas = 0;

    filteredData.forEach(t => {
        const val = Number(t.value) || 0;
        // Verifica variações de escrita para receita
        if (t.type === 'receita' || t.type === 'ENTRADA') totalReceitas += val;
        else totalDespesas += val;
    });

    const saldo = totalReceitas - totalDespesas;

    animateValue("kpi-receitas", totalReceitas);
    animateValue("kpi-despesas", totalDespesas);
    animateValue("kpi-saldo", saldo);
    updateHealthBar(totalReceitas, totalDespesas);
    
    renderGoalsSection(filteredData);
    
    // Chama os gráficos (agora com a biblioteca garantida)
    updateCharts(filteredData, selectedMonth);
}

// --- GRÁFICOS ---
function updateCharts(data, selectedMonth) {
    // Destrói gráficos antigos
    if (dashboardChartFlow) { dashboardChartFlow.destroy(); }
    if (dashboardChartPie) { dashboardChartPie.destroy(); }
    if (dashboardChartBar) { dashboardChartBar.destroy(); }
    if (dashboardChartLine) { dashboardChartLine.destroy(); }

    // Configuração dos Dias
    const year = selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear();
    const month = selectedMonth ? parseInt(selectedMonth.split('-')[1]) : new Date().getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    const daily = {};
    for(let i=1; i<=daysInMonth; i++) daily[i] = { r: 0, d: 0 };

    data.forEach(t => {
        const parts = t.date.split('-');
        if (parts.length === 3) {
            const d = parseInt(parts[2]);
            const val = Number(t.value) || 0;
            if (daily[d]) {
                if (t.type === 'receita' || t.type === 'ENTRADA') daily[d].r += val;
                else daily[d].d += val;
            }
        }
    });

    const labels = Object.keys(daily);
    const dataRec = labels.map(d => daily[d].r);
    const dataDesp = labels.map(d => daily[d].d * -1);

    const colorRec = viewMode === 'real' ? '#10b981' : '#34d399'; 
    const colorDesp = viewMode === 'real' ? '#f43f5e' : '#fb7185'; 

    // 1. Gráfico Fluxo
    const ctxFlow = document.getElementById('chartFlow');
    if (ctxFlow) {
        dashboardChartFlow = new Chart(ctxFlow, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Entradas', data: dataRec, backgroundColor: colorRec, borderRadius: 3 },
                    { label: 'Saídas', data: dataDesp, backgroundColor: colorDesp, borderRadius: 3 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { display: false }, y: { display: false } },
                plugins: { legend: { display: false } }
            }
        });
    }

    // 2. Pizza
    let sumR = 0, sumD = 0;
    data.forEach(t => {
        const val = Number(t.value);
        if (t.type === 'receita' || t.type === 'ENTRADA') sumR += val; else sumD += val;
    });

    const ctxPie = document.getElementById('chartIncomeExpense');
    if (ctxPie) {
        dashboardChartPie = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: ['Entrada', 'Saída'],
                datasets: [{ data: [sumR, sumD], backgroundColor: ['#6366f1', '#f43f5e'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
        });
    }

    // 3. Categorias
    const cats = {};
    data.filter(t => t.type !== 'receita' && t.type !== 'ENTRADA').forEach(t => {
        cats[t.category] = (cats[t.category] || 0) + Number(t.value);
    });
    const sortedCats = Object.entries(cats).sort((a,b) => b[1]-a[1]).slice(0,5);

    const ctxBar = document.getElementById('chartExpenseCat');
    if (ctxBar) {
        dashboardChartBar = new Chart(ctxBar, {
            type: 'doughnut',
            data: {
                labels: sortedCats.map(x=>x[0]),
                datasets: [{ 
                    data: sortedCats.map(x=>x[1]), 
                    backgroundColor: ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6'], 
                    borderWidth: 0 
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font:{size:10}, boxWidth: 10 } } } 
            }
        });
    }

    // 4. Saldo
    let acc = 0;
    const lineData = labels.map(d => {
        acc += (daily[d].r - daily[d].d);
        return acc;
    });

    const ctxLine = document.getElementById('chartBalanceEvolution');
    if (ctxLine) {
        dashboardChartLine = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo',
                    data: lineData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { display: false }, y: { display: false } },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// --- UTILITÁRIOS ---
function animateValue(id, val) {
    const el = document.getElementById(id);
    if(el) {
        el.innerText = val.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        if(id === 'kpi-saldo') el.className = `text-3xl font-bold mt-2 tracking-tight blur-sensitive ${val >= 0 ? 'text-white' : 'text-rose-500'}`;
    }
}

function updateHealthBar(rec, desp) {
    const bar = document.getElementById('health-bar');
    const text = document.getElementById('health-text');
    if(!bar) return;
    if(rec === 0) { bar.style.width='0%'; text.innerText="Sem receitas"; return; }
    const pct = Math.min((desp/rec)*100, 100);
    bar.style.width = `${pct}%`;
    if(pct > 90) { bar.className = "h-full bg-rose-600"; text.innerText = Math.round(pct)+"% (Crítico)"; }
    else if(pct > 70) { bar.className = "h-full bg-amber-500"; text.innerText = Math.round(pct)+"% (Atenção)"; }
    else { bar.className = "h-full bg-emerald-500"; text.innerText = Math.round(pct)+"% (Saudável)"; }
}

function openGoalsModal() {
    const modal = document.getElementById('modal-goals');
    const container = document.getElementById('goals-inputs-container');
    if(!modal || !container) return;
    const cats = [...new Set(allDataCache.filter(t => t.type !== 'receita' && t.type !== 'ENTRADA').map(t => t.category))].sort();
    container.innerHTML = '';
    if(cats.length === 0) container.innerHTML = '<p class="text-slate-500 text-center text-sm">Sem dados para metas.</p>';
    cats.forEach(cat => {
        const val = userGoals[cat] || '';
        const div = document.createElement('div');
        div.className = "flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-700";
        div.innerHTML = `<span class="text-sm text-white font-medium uppercase">${cat}</span><div class="flex items-center gap-2"><span class="text-slate-500 text-xs">R$</span><input type="number" class="goal-input w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-right outline-none focus:border-emerald-500" data-cat="${cat}" value="${val}"></div>`;
        container.appendChild(div);
    });
    modal.classList.remove('hidden');
}

function saveGoals() {
    const inputs = document.querySelectorAll('.goal-input');
    userGoals = {};
    inputs.forEach(i => { if(i.value > 0) userGoals[i.dataset.cat] = parseFloat(i.value); });
    localStorage.setItem('fluxo_goals', JSON.stringify(userGoals));
    document.getElementById('modal-goals').classList.add('hidden');
    renderDashboard();
}

function renderGoalsSection(data) {
    const section = document.getElementById('goals-section');
    const list = document.getElementById('goals-list');
    if(!Object.keys(userGoals).length) { if(section) section.classList.add('hidden'); return; }
    if(section) section.classList.remove('hidden');
    if(list) list.innerHTML = '';
    
    const expenses = {};
    data.filter(t=>t.type !== 'receita' && t.type !== 'ENTRADA').forEach(t => expenses[t.category] = (expenses[t.category]||0) + Number(t.value));

    for(const [cat, lim] of Object.entries(userGoals)) {
        const spent = expenses[cat] || 0;
        const pct = Math.min((spent/lim)*100, 100);
        let color = pct>=100 ? 'bg-rose-500' : (pct>80 ? 'bg-amber-500' : 'bg-emerald-500');
        const el = document.createElement('div');
        el.innerHTML = `<div class="flex justify-between text-xs mb-1"><span class="font-bold text-white uppercase">${cat}</span><span class="text-slate-400">${spent.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} / ${lim.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div><div class="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden"><div class="${color} h-2.5 rounded-full transition-all duration-1000" style="width: ${pct}%"></div></div>`;
        list.appendChild(el);
    }
}