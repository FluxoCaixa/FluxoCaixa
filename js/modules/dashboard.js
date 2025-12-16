/**
 * ARQUIVO: js/modules/dashboard.js
 * DESCRIÇÃO: Dashboard Financeiro + Sistema de Metas (Com proteção contra erro de cache).
 */
import 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../config.js'; 
import { safeBind, showToast } from '../utils.js';

const Chart = window.Chart;

// Estado
let charts = { flow: null, expCat: null, resp: null, balW: null, balE: null };
let currentViewMode = 'forecast';
let lastReceivedData = []; 
let userGoals = {}; 

export function initDashboard() {
    const filter = document.getElementById('dash-month-filter');
    if(filter) {
        filter.value = new Date().toISOString().slice(0, 7); 
        filter.addEventListener('change', () => refreshView());
    }

    const btnReal = document.getElementById('btn-view-real');
    const btnForecast = document.getElementById('btn-view-forecast');

    if(btnReal && btnForecast) {
        btnReal.addEventListener('click', () => setViewMode('real'));
        btnForecast.addEventListener('click', () => setViewMode('forecast'));
    }

    // Metas
    loadGoalsFromFirebase();
    safeBind('btn-open-goals', 'click', openGoalsModal);
    safeBind('btn-close-goals', 'click', () => document.getElementById('modal-goals').classList.add('hidden'));
    safeBind('btn-save-goals', 'click', saveGoalsToFirebase);
}

export function updateDashboardData(allData) {
    lastReceivedData = allData;
    refreshView();
}

function setViewMode(mode) {
    currentViewMode = mode;
    const btnReal = document.getElementById('btn-view-real');
    const btnForecast = document.getElementById('btn-view-forecast');
    
    // Proteção se os botões ainda não existirem no HTML cacheado
    if (!btnReal || !btnForecast) return;

    const activeClass = "bg-indigo-600 text-white shadow-lg ring-1 ring-indigo-500";
    const inactiveClass = "text-slate-400 hover:text-white bg-transparent shadow-none ring-0";

    if (mode === 'real') {
        btnReal.className = `px-4 py-2 rounded text-xs font-bold transition ${activeClass}`;
        btnForecast.className = `px-4 py-2 rounded text-xs font-bold transition ${inactiveClass}`;
    } else {
        btnReal.className = `px-4 py-2 rounded text-xs font-bold transition ${inactiveClass}`;
        btnForecast.className = `px-4 py-2 rounded text-xs font-bold transition ${activeClass}`;
    }
    refreshView();
}

function refreshView() {
    if (!lastReceivedData) return;
    const filterEl = document.getElementById('dash-month-filter');
    if (!filterEl) return; // Proteção extra

    const monthInput = filterEl.value;
    
    let filtered = lastReceivedData.filter(d => d.date.startsWith(monthInput));
    if (currentViewMode === 'real') {
        filtered = filtered.filter(d => d.status === true);
    }
    processAndRender(filtered);
}

function processAndRender(data) {
    let receita = 0, despesa = 0;
    const catDespesas = {};
    const respDespesas = {};
    const balancoWellington = { entradas: 0, saidas: 0 };
    const balancoEryka = { entradas: 0, saidas: 0 };

    data.forEach(d => {
        const val = d.value;
        const resp = (d.responsibility || "").toUpperCase();
        
        if (d.type === 'receita') {
            receita += val;
        } else {
            despesa += val;
            catDespesas[d.category || 'OUTROS'] = (catDespesas[d.category || 'OUTROS'] || 0) + val;
            respDespesas[d.responsibility || 'GERAL'] = (respDespesas[d.responsibility || 'GERAL'] || 0) + val;
        }

        const isShared = ["PARTILHADO", "COMPARTILHADO", "AMBOS", "CASAL", "DIVIDIDO"].some(term => resp.includes(term));
        
        if (isShared) {
            const half = val / 2;
            if (d.type === 'receita') { balancoWellington.entradas += half; balancoEryka.entradas += half; } 
            else { balancoWellington.saidas += half; balancoEryka.saidas += half; }
        } else {
            if (resp.includes("WELLINGTON")) {
                if (d.type === 'receita') balancoWellington.entradas += val; else balancoWellington.saidas += val;
            } else if (resp.includes("ERYKA") || resp.includes("ERICA")) {
                if (d.type === 'receita') balancoEryka.entradas += val; else balancoEryka.saidas += val;
            }
        }
    });

    updateKPIs(receita, despesa);
    updateHealthBar(receita, despesa);
    
    renderFlowChart(data);
    renderDoughnutChart('chartExpenseCat', catDespesas, 'expCat', ['#f43f5e', '#fbbf24', '#8b5cf6', '#3b82f6', '#ec4899']);
    renderPersonBalance('chartBalanceWellington', balancoWellington, 'balW', '#3b82f6');
    renderPersonBalance('chartBalanceEryka', balancoEryka, 'balE', '#ec4899');
    
    renderGoalsProgress(catDespesas);
}

// =========================================================
// LÓGICA DE METAS (Com Proteção de DOM)
// =========================================================

async function loadGoalsFromFirebase() {
    try {
        const docRef = doc(db, "settings", "goals");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            userGoals = docSnap.data();
            refreshView(); 
        }
    } catch (e) {
        console.warn("Sem metas salvas/Erro loadGoals:", e);
    }
}

async function saveGoalsToFirebase() {
    const inputs = document.querySelectorAll('.goal-input');
    const newGoals = {};
    inputs.forEach(input => {
        const val = parseFloat(input.value);
        if (val > 0) newGoals[input.dataset.cat] = val;
    });

    try {
        await setDoc(doc(db, "settings", "goals"), newGoals);
        userGoals = newGoals;
        showToast("Metas salvas!");
        document.getElementById('modal-goals').classList.add('hidden');
        refreshView();
    } catch (e) {
        console.error(e);
        showToast("Erro ao salvar.", "error");
    }
}

function openGoalsModal() {
    const container = document.getElementById('goals-inputs-container');
    if (!container) return; // Proteção

    container.innerHTML = '';
    const allCategories = new Set();
    lastReceivedData.forEach(d => {
        if(d.type === 'despesa' && d.category) allCategories.add(d.category);
    });
    Object.keys(userGoals).forEach(c => allCategories.add(c));

    const sortedCats = Array.from(allCategories).sort();

    if (sortedCats.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center text-xs">Adicione despesas primeiro para gerar categorias.</p>';
    }

    sortedCats.forEach(cat => {
        const currentGoal = userGoals[cat] || '';
        const div = document.createElement('div');
        div.className = "flex items-center gap-4 bg-slate-900/50 p-2 rounded border border-slate-700";
        div.innerHTML = `
            <div class="flex-1 font-bold text-slate-300 text-xs uppercase">${cat}</div>
            <div class="w-32">
                <input type="number" step="10" placeholder="R$" 
                       class="goal-input w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-right outline-none focus:border-emerald-500 text-sm" 
                       data-cat="${cat}" value="${currentGoal}">
            </div>
        `;
        container.appendChild(div);
    });

    const modal = document.getElementById('modal-goals');
    if(modal) modal.classList.remove('hidden');
}

function renderGoalsProgress(currentExpenses) {
    const section = document.getElementById('goals-section');
    const list = document.getElementById('goals-list');
    
    // 🛡️ PROTEÇÃO CONTRA O ERRO DE CACHE (NULL)
    // Se o HTML antigo estiver carregado, esses elementos não existem.
    // Retornamos silenciosamente para não quebrar o resto do app.
    if (!section || !list) {
        console.warn("Aviso: Elementos de Metas não encontrados no HTML (Cache antigo?).");
        return; 
    }
    
    if (Object.keys(userGoals).length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    list.innerHTML = '';

    const sortedGoals = Object.keys(userGoals).sort((a, b) => {
        const perA = (currentExpenses[a] || 0) / userGoals[a];
        const perB = (currentExpenses[b] || 0) / userGoals[b];
        return perB - perA;
    });

    sortedGoals.forEach(cat => {
        const limit = userGoals[cat];
        const spent = currentExpenses[cat] || 0;
        const percent = Math.min((spent / limit) * 100, 100);
        
        let color = 'bg-emerald-500';
        if (percent > 75) color = 'bg-yellow-500';
        if (percent >= 100) color = 'bg-rose-500';

        const div = document.createElement('div');
        div.innerHTML = `
            <div class="flex justify-between text-xs font-bold text-slate-300 mb-1">
                <span>${cat}</span>
                <span>R$ ${spent.toLocaleString('pt-BR')} / <span class="text-slate-500">R$ ${limit.toLocaleString('pt-BR')}</span></span>
            </div>
            <div class="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
                <div class="${color} h-2.5 rounded-full transition-all duration-1000 shadow-lg" style="width: ${percent}%"></div>
            </div>
            ${percent >= 100 ? '<p class="text-[10px] text-rose-400 mt-1 font-bold animate-pulse">⚠️ Limite excedido!</p>' : ''}
        `;
        list.appendChild(div);
    });
}

// =========================================================
// RENDERIZAÇÃO GRÁFICOS
// =========================================================

function renderPersonBalance(canvasId, data, chartInstanceKey, colorTheme) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (charts[chartInstanceKey]) charts[chartInstanceKey].destroy();
    charts[chartInstanceKey] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Entradas', 'Saídas'],
            datasets: [{
                label: 'Total',
                data: [data.entradas, data.saidas],
                backgroundColor: ['#10b981', '#f43f5e'],
                borderRadius: 6, barThickness: 40
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#fff' } } } }
    });
}

function renderFlowChart(data) {
    const ctx = document.getElementById('chartFlow');
    if (!ctx) return;
    const dailyMap = {};
    data.forEach(d => {
        const day = d.date.split('-')[2];
        if(!dailyMap[day]) dailyMap[day] = 0;
        dailyMap[day] += (d.type === 'receita' ? d.value : -d.value);
    });
    const labels = Object.keys(dailyMap).sort();
    const values = labels.map(day => dailyMap[day]);
    if (charts.flow) charts.flow.destroy();
    charts.flow = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Saldo', data: values, backgroundColor: (ctx) => ctx.raw >= 0 ? '#10b981' : '#f43f5e', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: (c) => c.tick.value===0?'#94a3b8':'#334155', lineWidth: (c)=>c.tick.value===0?2:1 } } } }
    });
}

function renderDoughnutChart(canvasId, dataObj, chartKey, colors) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (charts[chartKey]) charts[chartKey].destroy();
    const sorted = Object.entries(dataObj).sort((a,b) => b[1] - a[1]);
    charts[chartKey] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: sorted.map(x=>x[0]), datasets: [{ data: sorted.map(x=>x[1]), backgroundColor: colors, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 10 } } } }, layout: { padding: 10 } }
    });
}

function updateKPIs(receita, despesa) {
    const fmt = val => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const elRec = document.getElementById('kpi-receitas');
    const elDesp = document.getElementById('kpi-despesas');
    const elSaldo = document.getElementById('kpi-saldo');

    // Atualiza valores
    if (elRec) elRec.innerText = fmt(receita);
    if (elDesp) elDesp.innerText = fmt(despesa);
    
    if (elSaldo) {
        const saldo = receita - despesa;
        elSaldo.innerText = fmt(saldo);
        
        // LÓGICA DE COR + PRESERVAÇÃO DO BLUR
        // Adicionamos 'blur-sensitive' aqui para garantir que o JS não remova o efeito
        const colorClass = saldo >= 0 ? 'text-emerald-400' : 'text-rose-400';
        elSaldo.className = `text-3xl font-bold mt-2 tracking-tight ${colorClass} blur-sensitive`;
    }
}

function updateHealthBar(receita, despesa) {
    const bar = document.getElementById('health-bar');
    const text = document.getElementById('health-text');
    if (!bar || !text) return; // Proteção

    if(receita === 0) {
        bar.style.width = despesa > 0 ? '100%' : '0%';
        bar.className = 'h-full bg-slate-700';
        text.innerText = 'Sem receitas';
        return;
    }
    const percent = Math.min((despesa / receita) * 100, 100);
    bar.style.width = `${percent}%`;
    let colorClass = 'bg-emerald-500';
    if(percent > 50) colorClass = 'bg-yellow-500';
    if(percent > 80) colorClass = 'bg-orange-500';
    if(percent > 95) colorClass = 'bg-rose-600';
    bar.className = `h-full ${colorClass} transition-all duration-1000`;
    text.innerText = `${percent.toFixed(1)}% Comprometido`;
}