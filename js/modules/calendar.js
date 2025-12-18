/**
 * ARQUIVO: js/modules/calendar.js
 * DESCRIÇÃO: Calendário Independente (Busca própria + Modal de Detalhes)
 */
import { 
    onSnapshot, query, where 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentDate = new Date();
let calendarTransactions = []; // Dados exclusivos do calendário
let currentCalendarUnsubscribe = null;
let calendarCollectionRef = null;

// Inicializa o módulo recebendo o contexto do banco
export function initCalendar(db, collectionRef) {
    console.log("📅 Calendar: Inicializando...");
    
    // Se recebeu referência (login ou troca de conta), carrega os dados
    if (collectionRef) {
        calendarCollectionRef = collectionRef;
        loadCalendarMonth(); 
    }
    
    setupControls();
}

// Função Interna: Busca dados apenas do mês visível no calendário
function loadCalendarMonth() {
    if (currentCalendarUnsubscribe) {
        currentCalendarUnsubscribe();
        currentCalendarUnsubscribe = null;
    }
    
    if (!calendarCollectionRef) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0 a 11
    
    // Define intervalo do mês (Ex: 2026-01-01 a 2026-01-31)
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

    console.log(`📅 Calendar: Buscando dados de ${start} até ${end}...`);

    const q = query(
        calendarCollectionRef,
        where('date', '>=', start),
        where('date', '<=', end)
    );

    currentCalendarUnsubscribe = onSnapshot(q, (snapshot) => {
        calendarTransactions = [];
        snapshot.forEach((doc) => calendarTransactions.push({ id: doc.id, ...doc.data() }));
        renderCalendar();
    });
}

function setupControls() {
    const btnPrev = document.getElementById('cal-prev');
    const btnNext = document.getElementById('cal-next');

    // Removemos clones antigos para evitar cliques duplos
    if (btnPrev) {
        const newPrev = btnPrev.cloneNode(true);
        btnPrev.parentNode.replaceChild(newPrev, btnPrev);
        newPrev.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            loadCalendarMonth(); // Recarrega ao mudar mês
        });
    }

    if (btnNext) {
        const newNext = btnNext.cloneNode(true);
        btnNext.parentNode.replaceChild(newNext, btnNext);
        newNext.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            loadCalendarMonth(); // Recarrega ao mudar mês
        });
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('cal-title');
    
    if (!grid || !label) return;

    // 1. Atualiza Título
    const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    label.innerText = monthName.toUpperCase();

    // 2. Limpa
    grid.innerHTML = '';

    // 3. Cálculos de Datas
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); 
    const lastDayDate = new Date(year, month + 1, 0).getDate();

    // 4. Saldo Acumulado Inicial (Estimado para visualização)
    let saldoAcumulado = 0; 

    // 5. Células Vazias (Dias do mês anterior)
    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = "min-h-[100px] md:min-h-[130px] bg-slate-900/20 border border-slate-800/30 rounded-xl opacity-40 hidden md:block";
        grid.appendChild(empty);
    }

    // 6. Dias do Mês
    for (let day = 1; day <= lastDayDate; day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayTrans = calendarTransactions.filter(t => t.date === dateString);

        let ent = 0;
        let sai = 0;

        dayTrans.forEach(t => {
            const val = Number(t.value) || 0;
            if (t.type === 'receita' || t.type === 'ENTRADA') ent += val;
            else sai += val;
        });

        saldoAcumulado = saldoAcumulado + ent - sai;

        // UI da Célula
        const cell = document.createElement('div');
        let cellClass = "min-h-[90px] md:min-h-[130px] bg-slate-800 border border-slate-700 rounded-xl p-2 flex flex-col justify-between hover:bg-slate-700 transition cursor-pointer group relative overflow-hidden shadow-md";
        
        // Hoje
        const todayStr = new Date().toISOString().split('T')[0];
        if (dateString === todayStr) cellClass += " ring-2 ring-indigo-500 bg-slate-800/90";

        cell.className = cellClass;

        const isPos = saldoAcumulado >= 0;
        const saldoBg = isPos ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400';
        const saldoBorder = isPos ? 'border-emerald-500/20' : 'border-rose-500/20';

        cell.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <span class="font-bold text-slate-300 text-sm pl-1">${day}</span>
                ${dayTrans.length > 0 ? `<span class="text-[9px] bg-slate-950 text-slate-500 px-1.5 py-0.5 rounded border border-slate-800 font-bold">${dayTrans.length}</span>` : ''}
            </div>

            <div class="flex flex-col justify-center flex-1 space-y-0.5 px-1">
                ${ent > 0 ? `<div class="flex justify-between items-center text-[10px] text-emerald-400 font-medium"><span>+${formatShort(ent)}</span></div>` : ''}
                ${sai > 0 ? `<div class="flex justify-between items-center text-[10px] text-rose-400 font-medium"><span>-${formatShort(sai)}</span></div>` : ''}
            </div>

            <div class="mt-2 pt-1 border-t border-slate-700/50 text-right hidden md:block">
                <div class="flex justify-between items-center ${saldoBg} px-2 py-1 rounded-lg border ${saldoBorder}">
                    <span class="text-[9px] uppercase font-bold opacity-70 tracking-wider">Cx</span>
                    <span class="text-xs font-bold font-mono">${formatShort(saldoAcumulado)}</span>
                </div>
            </div>
        `;

        cell.onclick = () => openDayDetails(dateString, dayTrans, ent, sai, saldoAcumulado);
        
        grid.appendChild(cell);
    }
}

// --- MODAL DE DETALHES ---
function openDayDetails(dateString, transactions, ent, sai, saldoAcumulado) {
    const modal = document.getElementById('modal-day-details');
    
    // Tenta encontrar elementos dentro do modal
    if(!modal) return console.error("Modal não encontrado");

    // Correção de Data
    const [y, m, d] = dateString.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    
    // Estes IDs agora batem com o modal correto (o que estava no final do HTML)
    const elTitle = document.getElementById('day-detail-title');
    const elIn = document.getElementById('day-detail-in');
    const elOut = document.getElementById('day-detail-out');
    const elBal = document.getElementById('day-detail-bal');
    const list = document.getElementById('day-detail-list');

    if(elTitle) elTitle.innerText = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    if(elIn) elIn.innerText = ent.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    if(elOut) elOut.innerText = sai.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    
    if(elBal) {
        elBal.innerText = saldoAcumulado.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        elBal.className = `text-xl font-bold font-mono ${saldoAcumulado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    if(list) {
        list.innerHTML = '';
        
        if (!transactions || transactions.length === 0) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-slate-500 opacity-60">
                    <p class="text-sm font-medium">Sem lançamentos.</p>
                </div>
            `;
        } else {
            transactions.forEach(t => {
                const isRec = (t.type === 'receita' || t.type === 'ENTRADA');
                const color = isRec ? 'text-emerald-400' : 'text-rose-400';
                const sign = isRec ? '+' : '-';
                
                const isPaid = (t.status === true || t.status === 'true' || t.status === 'Pago');
                const badge = isPaid 
                    ? '<span class="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">Pago</span>'
                    : '<span class="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded font-bold uppercase">Pendente</span>';

                const item = document.createElement('div');
                item.className = "bg-slate-950/50 p-3 rounded-xl border border-slate-800 flex items-center justify-between";
                
                item.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center border border-slate-800">
                            ${isRec ? '⬆️' : '⬇️'}
                        </div>
                        <div>
                            <div class="text-white font-bold text-sm leading-tight">${t.description}</div>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-px rounded border border-slate-700">${t.category}</span>
                                ${badge}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-mono font-bold ${color} text-sm">
                            ${sign} ${parseFloat(t.value).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </div>
                    </div>
                `;
                list.appendChild(item);
            });
        }
    }

    modal.classList.remove('hidden');
    
    // Fechar
    const btnClose = document.getElementById('btn-close-day-details');
    if(btnClose) {
        const newBtn = btnClose.cloneNode(true);
        btnClose.parentNode.replaceChild(newBtn, btnClose);
        newBtn.onclick = () => modal.classList.add('hidden');
    }
    
    modal.onclick = (e) => { if(e.target === modal) modal.classList.add('hidden'); };
}

function formatShort(value) {
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + 'k';
    return Math.floor(value);
}