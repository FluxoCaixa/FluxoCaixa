/**
 * ARQUIVO: js/modules/calendar.js
 * DESCRIÇÃO: Calendário Premium Completo (Saldo Acumulado + Detalhes Visuais)
 */

let currentDate = new Date();
let allTransactions = [];

// Inicializa o módulo
export function initCalendar() {
    console.log("📅 Calendar: Inicializando controles...");
    setupControls();
}

// Recebe os dados do banco e atualiza a tela
export function updateCalendarData(transactions) {
    console.log(`📅 Calendar: ${transactions.length} transações carregadas.`);
    allTransactions = transactions;
    renderCalendar();
}

// Configura os botões de "Anterior" e "Próximo"
function setupControls() {
    const btnPrev = document.getElementById('cal-prev');
    const btnNext = document.getElementById('cal-next');

    // Removemos clones antigos para evitar cliques duplos
    if (btnPrev) {
        const newPrev = btnPrev.cloneNode(true);
        btnPrev.parentNode.replaceChild(newPrev, btnPrev);
        newPrev.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (btnNext) {
        const newNext = btnNext.cloneNode(true);
        btnNext.parentNode.replaceChild(newNext, btnNext);
        newNext.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }
}

// Função Principal: Desenha os quadradinhos do calendário
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('cal-title');
    
    // Proteção: Se não achar o HTML, para aqui para não dar erro
    if (!grid || !label) {
        console.warn("⚠️ Calendar: Elementos HTML não encontrados.");
        return;
    }

    // 1. Atualiza o Título do Mês (Ex: JANEIRO DE 2026)
    const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    label.innerText = monthName.toUpperCase();

    // 2. Limpa o calendário anterior
    grid.innerHTML = '';

    // 3. Cálculos de Datas
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // Dia da semana que começa o mês (0=Dom)
    const lastDayDate = new Date(year, month + 1, 0).getDate(); // Último dia do mês (28, 30 ou 31)

    // 4. CÁLCULO DO SALDO ACUMULADO INICIAL
    // Soma tudo o que aconteceu ANTES do dia 01 deste mês para saber quanto tinha em caixa
    let saldoAcumulado = 0;
    const firstDayStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;

    allTransactions.forEach(t => {
        if (t.date < firstDayStr) {
            const val = Number(t.value) || 0;
            // Se for receita ou entrada, soma. Se não, subtrai.
            if (t.type === 'receita' || t.type === 'ENTRADA') saldoAcumulado += val;
            else saldoAcumulado -= val;
        }
    });

    // 5. Desenha as células vazias (dias do mês passado)
    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = "min-h-[130px] bg-slate-900/20 border border-slate-800/30 rounded-xl opacity-40";
        grid.appendChild(empty);
    }

    // 6. Desenha os Dias do Mês Atual
    for (let day = 1; day <= lastDayDate; day++) {
        // Cria a data no formato YYYY-MM-DD para buscar as transações
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Filtra transações deste dia específico
        const dayTrans = allTransactions.filter(t => t.date === dateString);

        // Calcula Totais do Dia
        let ent = 0;
        let sai = 0;

        dayTrans.forEach(t => {
            const val = Number(t.value) || 0;
            if (t.type === 'receita' || t.type === 'ENTRADA') ent += val;
            else sai += val;
        });

        // Atualiza o Saldo Acumulado (Saldo Anterior + Entradas Hoje - Saídas Hoje)
        saldoAcumulado = saldoAcumulado + ent - sai;

        // --- MONTAGEM VISUAL DA CÉLULA ---
        const cell = document.createElement('div');
        
        // Estilo Base
        let cellClass = "min-h-[130px] bg-slate-800 border border-slate-700 rounded-xl p-2 flex flex-col justify-between hover:bg-slate-700 transition cursor-pointer group relative overflow-hidden shadow-md";
        
        // Se for HOJE, coloca uma borda colorida
        const todayStr = new Date().toISOString().split('T')[0];
        if (dateString === todayStr) {
            cellClass += " ring-2 ring-indigo-500 bg-slate-800/90";
        }

        cell.className = cellClass;

        // Define cores do saldo no rodapé
        const isPos = saldoAcumulado >= 0;
        const saldoBg = isPos ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400';
        const saldoBorder = isPos ? 'border-emerald-500/20' : 'border-rose-500/20';

        // HTML Interno da Célula
        cell.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <span class="font-bold text-slate-300 text-sm pl-1">${day}</span>
                ${dayTrans.length > 0 ? `<span class="text-[9px] bg-slate-950 text-slate-500 px-1.5 py-0.5 rounded border border-slate-800 font-bold">${dayTrans.length}</span>` : ''}
            </div>

            <div class="flex flex-col justify-center flex-1 space-y-0.5 px-1">
                ${ent > 0 ? `<div class="flex justify-between items-center text-[10px] text-emerald-400 font-medium"><span>Ent</span><span>+${formatShort(ent)}</span></div>` : ''}
                ${sai > 0 ? `<div class="flex justify-between items-center text-[10px] text-rose-400 font-medium"><span>Sai</span><span>-${formatShort(sai)}</span></div>` : ''}
            </div>

            <div class="mt-2 pt-1 border-t border-slate-700/50 text-right">
                <div class="flex justify-between items-center ${saldoBg} px-2 py-1 rounded-lg border ${saldoBorder}">
                    <span class="text-[9px] uppercase font-bold opacity-70 tracking-wider">Caixa</span>
                    <span class="text-xs font-bold font-mono">R$ ${formatShort(saldoAcumulado)}</span>
                </div>
            </div>
        `;

        // Ao clicar, abre o modal passando os dados já calculados
        cell.onclick = () => openDayDetails(dateString, dayTrans, ent, sai, saldoAcumulado);
        
        grid.appendChild(cell);
    }
}

// --- FUNÇÃO: ABRIR MODAL DE DETALHES ---
function openDayDetails(dateString, transactions, ent, sai, saldoAcumulado) {
    const modal = document.getElementById('modal-day-details');
    
    // Se o modal não existir no HTML, avisa no console
    if(!modal) {
        console.error("❌ Erro: Modal 'modal-day-details' não encontrado no HTML.");
        return;
    }

    const dateObj = new Date(dateString + 'T12:00:00');
    
    // 1. Preenche Título e Data
    const elTitle = document.getElementById('day-detail-title');
    if(elTitle) elTitle.innerText = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    // 2. Preenche os Totais do Cabeçalho do Modal
    const elIn = document.getElementById('day-detail-in');
    const elOut = document.getElementById('day-detail-out');
    const elBal = document.getElementById('day-detail-bal');

    if(elIn) elIn.innerText = ent.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    if(elOut) elOut.innerText = sai.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    
    if(elBal) {
        elBal.innerText = saldoAcumulado.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        elBal.className = `text-xl font-bold font-mono ${saldoAcumulado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // 3. Gera a Lista de Transações
    const list = document.getElementById('day-detail-list');
    
    if(list) {
        list.innerHTML = ''; // Limpa lista antiga
        
        if (!transactions || transactions.length === 0) {
            // Visual para dia vazio
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-slate-500 opacity-60">
                    <svg class="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <p class="text-sm font-medium">Sem lançamentos neste dia.</p>
                    <p class="text-xs mt-1 text-slate-600">O saldo exibido é o acumulado dos dias anteriores.</p>
                </div>
            `;
        } else {
            // Gera item por item
            transactions.forEach(t => {
                // Define cores e ícones baseados no tipo
                const isRec = (t.type === 'receita' || t.type === 'ENTRADA');
                const color = isRec ? 'text-emerald-400' : 'text-rose-400';
                
                // Ícone (Seta para cima ou baixo)
                const icon = isRec 
                    ? '<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>'
                    : '<svg class="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>';
                
                // Badge de Status
                const isPaid = (t.status === true || t.status === 'true' || t.status === 'Pago');
                const badge = isPaid 
                    ? '<span class="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Pago</span>'
                    : '<span class="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Pendente</span>';

                const item = document.createElement('div');
                item.className = "bg-slate-800 p-4 rounded-xl border border-slate-700/50 flex items-center justify-between hover:bg-slate-700/50 transition mb-3";
                
                item.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shadow-sm border border-slate-800">
                            ${icon}
                        </div>
                        <div>
                            <div class="text-white font-bold text-sm leading-tight">${t.description}</div>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-px rounded border border-slate-700 uppercase tracking-wider">${t.category}</span>
                                ${badge}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-mono font-bold ${color} text-base">
                            ${isRec?'+':'-'} ${parseFloat(t.value).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </div>
                        <div class="text-[10px] text-slate-500 uppercase mt-0.5 tracking-wide">
                            ${t.responsibility || 'Geral'}
                        </div>
                    </div>
                `;
                list.appendChild(item);
            });
        }
    } else {
        console.error("❌ Erro: Lista 'day-detail-list' não encontrada no HTML.");
    }

    // Exibe o modal
    modal.classList.remove('hidden');
    
    // Configura botões de fechar
    const btnClose = document.getElementById('btn-close-day-details');
    if(btnClose) btnClose.onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => { if(e.target === modal) modal.classList.add('hidden'); };
}

// Auxiliar: Formata números grandes (Ex: 1.5k) para caber no calendário
function formatShort(value) {
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + 'k';
    return Math.floor(value); // Remove centavos para visualização compacta
}