/**
 * ARQUIVO: js/modules/calendar.js
 * DESCRIÇÃO: Módulo de Calendário (Correção: Exibe Pendentes e Realizados + Privacidade).
 */
import { safeBind } from '../utils.js';

let currentDate = new Date();
let calendarData = [];

export function initCalendar() {
    renderCalendar();

    safeBind('cal-prev', 'click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    safeBind('cal-next', 'click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    safeBind('btn-close-day-details', 'click', () => {
        document.getElementById('modal-day-details').classList.add('hidden');
    });
}

export function updateCalendarData(data) {
    calendarData = data;
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('cal-title');
    
    if (!grid || !title) return;

    // Atualiza Título
    title.innerText = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    grid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    // Células Vazias
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = "h-24 bg-slate-900/50 border border-slate-800";
        grid.appendChild(emptyCell);
    }

    // Dias do Mês
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // CORREÇÃO: Removemos o filtro de status. Agora mostra TUDO (Pendente e Realizado)
        const dayTrans = calendarData.filter(d => d.date === dateStr);
        
        let dailyBalance = 0;
        dayTrans.forEach(t => {
            // Soma tudo para o saldo do dia (Se quiser somar só realizados, adicione if(t.status) aqui)
            dailyBalance += (t.type === 'receita' ? t.value : -t.value);
        });

        const cell = document.createElement('div');
        cell.className = "h-24 border border-slate-700 p-2 relative hover:bg-slate-700/50 transition cursor-pointer group flex flex-col justify-between";
        
        const today = new Date().toISOString().split('T')[0];
        const isToday = dateStr === today;
        const dayClass = isToday ? "bg-emerald-600 text-white w-6 h-6 flex items-center justify-center rounded-full font-bold shadow-lg" : "text-slate-400 font-bold";

        // Saldo do Dia (Com classe blur-sensitive)
        let balanceHtml = '';
        if (dayTrans.length > 0) {
            const color = dailyBalance >= 0 ? 'text-emerald-400' : 'text-rose-400';
            balanceHtml = `<span class="text-xs font-mono font-bold ${color} bg-slate-950/50 px-1.5 py-0.5 rounded blur-sensitive">R$ ${Math.abs(dailyBalance).toLocaleString('pt-BR', {minimumFractionDigits: 0})}</span>`;
        }

        // Bolinhas indicadoras
        let dots = '';
        if(dayTrans.length > 0) {
            dots = `<div class="flex gap-1 mt-1 overflow-hidden">
                ${dayTrans.slice(0,4).map(t => `<div class="w-1.5 h-1.5 rounded-full ${t.type==='receita'?'bg-emerald-500':'bg-rose-500'} ${t.status ? '' : 'opacity-40'}"></div>`).join('')}
                ${dayTrans.length > 4 ? '<div class="w-1.5 h-1.5 rounded-full bg-slate-500"></div>' : ''}
            </div>`;
        }

        cell.innerHTML = `
            <div class="flex justify-between items-start">
                <span class="${dayClass} text-sm">${day}</span>
                ${balanceHtml}
            </div>
            ${dots}
        `;

        cell.onclick = () => openDayDetails(dateStr, dayTrans);
        grid.appendChild(cell);
    }
}

function openDayDetails(dateStr, transactions) {
    const modal = document.getElementById('modal-day-details');
    const list = document.getElementById('day-details-list');
    const title = document.getElementById('modal-day-title');
    const balanceEl = document.getElementById('modal-day-balance');

    if(!modal || !list) return;

    const dateObj = new Date(dateStr + 'T12:00:00');
    title.innerText = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    list.innerHTML = '';
    let total = 0;

    if (transactions.length === 0) {
        list.innerHTML = '<p class="text-center text-slate-500 py-8 italic">Nenhuma movimentação.</p>';
    } else {
        transactions.forEach(t => {
            const val = t.type === 'receita' ? t.value : -t.value;
            total += val;
            
            const color = t.type === 'receita' ? 'text-emerald-400' : 'text-rose-400';
            const sign = t.type === 'receita' ? '+' : '-';
            
            const item = document.createElement('div');
            item.className = "flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50";
            
            // Valores da lista com blur-sensitive
            item.innerHTML = `
                <div>
                    <p class="font-bold text-white text-sm">${t.description}</p>
                    <p class="text-[10px] text-slate-500 uppercase">${t.category} • ${t.responsibility||'Geral'}</p>
                </div>
                <div class="text-right">
                    <p class="font-mono font-bold ${color} blur-sensitive">${sign} R$ ${t.value.toFixed(2)}</p>
                    <p class="text-[10px] ${t.status ? 'text-emerald-600' : 'text-slate-600'} font-bold uppercase">${t.status ? 'Realizado' : 'Pendente'}</p>
                </div>
            `;
            list.appendChild(item);
        });
    }

    const totalColor = total >= 0 ? 'text-emerald-400' : 'text-rose-400';
    balanceEl.className = `text-lg font-bold font-mono ${totalColor} blur-sensitive`;
    balanceEl.innerText = `R$ ${Math.abs(total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    modal.classList.remove('hidden');
}