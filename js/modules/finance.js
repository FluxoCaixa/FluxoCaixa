/**
 * ARQUIVO: js/modules/finance.js
 * DESCRIÇÃO: Módulo Financeiro Completo (Filtros, Edição, Coluna Responsável)
 */
import { 
    onSnapshot, addDoc, deleteDoc, updateDoc, doc, writeBatch, collection, getDocs,
    query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showToast } from '../utils.js';
import { updateDashboard } from './dashboard.js';

let currentMonthUnsubscribe = null;
let unsubscribeRecurring = null;
let currentCollectionRef = null;
let currentRecurringRef = null;

// ESTADO GLOBAL
let currentTransactions = []; 
let currentSortCol = 'date';  
let currentSortOrder = 'desc';
let activeTab = null; 

// Utilitário para pegar valor atualizado do DOM
const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : null;
};

export function initFinanceModule(db, collectionRef) {
    console.log("💰 Finance: Inicializando módulo...");
    currentCollectionRef = collectionRef;
    currentRecurringRef = collection(collectionRef.parent, "recurring");

    // 1. INICIALIZAÇÃO DOS INPUTS
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    ['dash-month-filter', 'finance-month-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = currentMonth;
    });

    // --- FUNÇÕES DE CARGA ---
    const loadFromDashboard = () => {
        const s = getVal('dash-month-filter') || currentMonth;
        const e = getVal('dash-month-end-filter');
        if (e && e < s) return showToast("Mês final inválido.", "warn");
        console.log(`🔄 Contexto: Dashboard (Filtro: ${s} até ${e || 'fim do mês'})`);
        setupMonthListener(s, e);
    };

    const loadFromFinance = () => {
        const s = getVal('finance-month-filter') || currentMonth;
        const e = getVal('finance-month-end-filter');
        if (e && e < s) return showToast("Mês final inválido.", "warn");
        console.log(`🔄 Contexto: Lançamentos (Filtro: ${s} até ${e || 'fim do mês'})`);
        setupMonthListener(s, e);
    };

    const attachListener = (id, callback) => {
        const el = document.getElementById(id);
        if (el) {
            const clone = el.cloneNode(true);
            el.parentNode.replaceChild(clone, el);
            clone.addEventListener('change', callback);
        }
    };

    attachListener('dash-month-filter', loadFromDashboard);
    attachListener('dash-month-end-filter', loadFromDashboard);
    attachListener('finance-month-filter', loadFromFinance);
    attachListener('finance-month-end-filter', loadFromFinance);

    // --- DETECÇÃO DE ABA ---
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.classList.contains('active')) {
                    const newTabId = target.id;
                    if (activeTab !== newTabId) {
                        activeTab = newTabId;
                        if (newTabId === 'dashboard') loadFromDashboard();
                        if (newTabId === 'lancamentos') loadFromFinance();
                    }
                }
            }
        });
    });

    const pages = document.querySelectorAll('.page-content');
    pages.forEach(page => observer.observe(page, { attributes: true }));

    // 2. LISTENER DE RECORRÊNCIA
    if (unsubscribeRecurring) unsubscribeRecurring();
    unsubscribeRecurring = onSnapshot(currentRecurringRef, (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        renderRecurringTable(items);
    }, (error) => console.warn("Erro recurring:", error));

    // COMPONENTES UI
    setupFormListeners();
    setupBulkActions(db);
    setupExcelHandlers(db);
    setupRecurringHandlers(db);
    setupSortListeners(); 
    setupFilterListeners(); // <--- O ERRO ESTAVA AQUI (Função chamada mas não existia)

    // CARGA INICIAL
    if (document.getElementById('lancamentos')?.classList.contains('active')) {
        activeTab = 'lancamentos';
        loadFromFinance();
    } else {
        activeTab = 'dashboard';
        loadFromDashboard();
    }
}

// --- BUSCA NO BANCO ---
function setupMonthListener(startMonth, endMonth) {
    clearTableFilters(); // <--- OUTRO ERRO (Função chamada mas não existia)

    if (currentMonthUnsubscribe) { 
        currentMonthUnsubscribe(); 
        currentMonthUnsubscribe = null; 
    }

    if (!currentCollectionRef || !startMonth) return;

    const finalMonth = endMonth || startMonth;
    const startDate = `${startMonth}-01`;
    const [y, m] = finalMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${finalMonth}-${lastDay}`;

    console.log(`📡 Finance: Buscando de ${startDate} até ${endDate}...`);

    try {
        const q = query(
            currentCollectionRef,
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            orderBy('date', 'desc')
        );

        currentMonthUnsubscribe = onSnapshot(q, (snapshot) => {
            const transactions = [];
            snapshot.forEach((doc) => transactions.push({ id: doc.id, ...doc.data() }));
            
            console.log(`📡 Finance: Recebidos ${transactions.length} itens.`);
            
            currentTransactions = transactions; 
            renderTable(); 
            updateDashboard(transactions);
        }, (error) => {
            console.error("Erro no listener:", error);
            if (error.message && error.message.includes("requires an index")) {
                showToast("Erro: Índice necessário (ver console).", "error");
            } else {
                showToast("Erro ao carregar dados.", "error");
            }
        });
    } catch (err) {
        console.error("Erro query:", err);
    }
}

export function stopFinanceListener() {
    if (currentMonthUnsubscribe) { currentMonthUnsubscribe(); currentMonthUnsubscribe = null; }
    if (unsubscribeRecurring) { unsubscribeRecurring(); unsubscribeRecurring = null; }
}

// --- FILTROS DE TABELA (CORRIGIDO) ---
function setupFilterListeners() {
    ['filter-day', 'filter-desc', 'filter-cat', 'filter-resp'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            const clone = el.cloneNode(true);
            el.parentNode.replaceChild(clone, el);
            clone.addEventListener('input', renderTable);
        }
    });

    document.getElementById('btn-clean-filter-day')?.addEventListener('click', () => {
        const el = document.getElementById('filter-day'); if(el) el.value = ''; renderTable();
    });
    document.getElementById('btn-clean-filter-desc')?.addEventListener('click', () => {
        const el = document.getElementById('filter-desc'); if(el) el.value = ''; renderTable();
    });
    document.getElementById('btn-clean-filter-cat')?.addEventListener('click', () => {
        const el = document.getElementById('filter-cat'); if(el) el.value = ''; renderTable();
    });
    document.getElementById('btn-clean-filter-resp')?.addEventListener('click', () => {
        const el = document.getElementById('filter-resp'); if(el) el.value = ''; renderTable();
    });
    document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
        clearTableFilters();
        renderTable();
    });
}

function clearTableFilters() {
    ['filter-day', 'filter-desc', 'filter-cat', 'filter-resp'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
}

// --- RENDERIZAÇÃO DA TABELA (COM EDICÃO E RESPONSÁVEL) ---
function renderTable() {
    const tbody = document.getElementById('transactions-tbody');
    const checkAll = document.getElementById('check-all-rows');
    
    // Pega valores diretamente do DOM
    const fDay = document.getElementById('filter-day')?.value.trim();
    const fDesc = document.getElementById('filter-desc')?.value.toLowerCase();
    const fCat = document.getElementById('filter-cat')?.value.toLowerCase();
    const fResp = document.getElementById('filter-resp')?.value.toLowerCase();

    if (!tbody) return;
    tbody.innerHTML = '';
    
    let filteredList = currentTransactions.filter(t => {
        const matchDay = fDay ? t.date.split('-')[2].includes(fDay) : true;
        const matchDesc = fDesc ? t.description.toLowerCase().includes(fDesc) : true;
        const matchCat = fCat ? t.category.toLowerCase().includes(fCat) : true;
        const matchResp = fResp ? (t.responsibility || '').toLowerCase().includes(fResp) : true;
        return matchDay && matchDesc && matchCat && matchResp;
    });

    // Ordenação
    filteredList.sort((a, b) => {
        let valA = a[currentSortCol];
        let valB = b[currentSortCol];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        let comparison = 0;
        if (valA > valB) comparison = 1;
        else if (valA < valB) comparison = -1;
        return currentSortOrder === 'asc' ? comparison : comparison * -1;
    });

    // Ícones
    document.querySelectorAll('.sort-header .sort-icon').forEach(icon => {
        icon.innerText = '⇅'; 
        icon.classList.remove('text-emerald-400');
    });
    const activeHeader = document.querySelector(`.sort-header[data-col="${currentSortCol}"] .sort-icon`);
    if(activeHeader) {
        activeHeader.innerText = currentSortOrder === 'asc' ? '↑' : '↓';
        activeHeader.classList.add('text-emerald-400');
    }

    if (filteredList.length === 0) {
        if (currentTransactions.length > 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-12 text-center text-slate-500 italic">Nenhum resultado para os filtros. <button id="btn-reset-empty" class="text-emerald-400 hover:underline ml-1">Limpar Filtros</button></td></tr>';
            document.getElementById('btn-reset-empty')?.addEventListener('click', () => document.getElementById('btn-clear-filters').click());
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-12 text-center text-slate-500 italic">Nenhum lançamento neste período.<br><span class="text-xs">Verifique o filtro de mês ou crie um novo.</span></td></tr>';
        }
        return;
    }

    filteredList.forEach(t => {
        const val = parseFloat(t.value);
        const color = t.type === 'receita' ? 'text-emerald-400' : 'text-rose-400';
        const sign = t.type === 'receita' ? '+' : '-';
        const statusClass = t.status ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20';
        const statusText = t.status ? 'Pago' : 'Pendente';

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-700 hover:bg-slate-800/50 transition group";
        
        tr.innerHTML = `
            <td class="px-4 py-3 text-center"><input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-0 cursor-pointer accent-indigo-500" value="${t.id}"></td>
            <td class="px-6 py-3 font-mono text-xs text-slate-400">${new Date(t.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</td>
            <td class="px-6 py-3 font-medium text-white">${t.description}</td>
            <td class="px-6 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 border border-slate-700 text-slate-400">${t.category}</span></td>
            <td class="px-6 py-3 text-slate-400 text-xs uppercase font-medium">${t.responsibility || '-'}</td>
            <td class="px-6 py-3 text-right font-bold font-mono ${color} blur-sensitive">${sign} R$ ${val.toFixed(2)}</td>
            <td class="px-6 py-3 text-center">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${statusClass}">${statusText}</span>
            </td>
            <td class="px-6 py-3 text-right flex justify-end gap-2">
                <button class="btn-edit text-slate-500 hover:text-indigo-400 transition p-1" data-id="${t.id}" title="Editar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button class="btn-delete text-slate-500 hover:text-rose-400 transition p-1" data-id="${t.id}" title="Excluir">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </td>
        `;

        tr.querySelector('.btn-delete').onclick = () => deleteTransaction(t.id);
        tr.querySelector('.btn-edit').onclick = () => openEditModal(t);
        tbody.appendChild(tr);
    });

    if(checkAll) {
        checkAll.onclick = () => {
            const checks = document.querySelectorAll('.row-checkbox');
            checks.forEach(c => c.checked = checkAll.checked);
            updateBulkUI();
        };
        const checks = document.querySelectorAll('.row-checkbox');
        checks.forEach(c => c.addEventListener('change', updateBulkUI));
    }
}

// --- FUNÇÕES AUXILIARES ---
function openEditModal(t) {
    const modal = document.getElementById('modal-transaction');
    const form = document.getElementById('form-transaction');
    if (!modal || !form) return;

    document.getElementById('form-desc').value = t.description;
    document.getElementById('form-valor').value = t.value;
    document.getElementById('form-data').value = t.date;
    document.getElementById('form-categoria').value = t.category;
    document.getElementById('form-resp').value = t.responsibility || '';
    document.getElementById('form-status').checked = t.status;
    
    const radios = document.getElementsByName('tipo');
    radios.forEach(r => { if (r.value === t.type) r.checked = true; });

    form.dataset.editingId = t.id;
    const btnSubmit = form.querySelector('button[type="submit"]');
    if(btnSubmit) btnSubmit.innerText = "Atualizar Lançamento";

    modal.classList.remove('hidden');
}

function renderRecurringTable(items) {
    const tbody = document.getElementById('recurring-list-body');
    if(!tbody) return; tbody.innerHTML = '';
    
    if(items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-500 text-sm italic">Nenhum modelo cadastrado ainda.</td></tr>';
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-700/50 text-xs hover:bg-slate-800 transition";
        tr.innerHTML = `<td class="px-4 py-3"><p class="font-bold text-white">${item.description}</p></td><td class="px-4 py-3 text-center text-slate-400 capitalize">${item.frequency}</td><td class="px-4 py-3 text-right font-mono font-bold text-white">R$ ${parseFloat(item.value).toFixed(2)}</td><td class="px-4 py-3 text-right"><button class="btn-del-rec text-slate-500 hover:text-rose-500 transition p-2" data-id="${item.id}">🗑️</button></td>`;
        tr.querySelector('.btn-del-rec').onclick = async () => { if(confirm("Excluir modelo?")) await deleteDoc(doc(currentRecurringRef, item.id)); };
        tbody.appendChild(tr);
    });
}

async function deleteTransaction(id) {
    if (!confirm("Excluir item?")) return;
    try { await deleteDoc(doc(currentCollectionRef, id)); showToast("Item excluído."); } catch (e) { showToast("Erro.", "error"); }
}

function setupSortListeners() {
    const headers = document.querySelectorAll('.sort-header');
    headers.forEach(th => {
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);
        newTh.addEventListener('click', () => {
            const col = newTh.getAttribute('data-col');
            if (currentSortCol === col) currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            else { currentSortCol = col; currentSortOrder = 'asc'; }
            renderTable();
        });
    });
}

function setupBulkActions(db) {
    const btnDelete = document.getElementById('btn-bulk-delete');
    const btnFinish = document.getElementById('btn-bulk-finish');
    const btnPending = document.getElementById('btn-bulk-pending');

    if(btnDelete) {
        btnDelete.onclick = async () => {
            const checked = document.querySelectorAll('.row-checkbox:checked');
            if(checked.length === 0) return;
            if(!confirm(`Excluir ${checked.length} itens?`)) return;
            const batch = writeBatch(db);
            checked.forEach(chk => batch.delete(doc(currentCollectionRef, chk.value)));
            try { await batch.commit(); showToast("Itens excluídos."); resetSelection(); } catch(e) { showToast("Erro.", "error"); }
        };
    }
    if(btnFinish) {
        btnFinish.onclick = async () => {
            const checked = document.querySelectorAll('.row-checkbox:checked');
            if(checked.length === 0) return;
            if(!confirm(`Confirmar ${checked.length} itens como PAGO?`)) return;
            const batch = writeBatch(db);
            checked.forEach(chk => batch.update(doc(currentCollectionRef, chk.value), { status: true }));
            try { await batch.commit(); showToast("Status atualizado!"); resetSelection(); } catch (e) { showToast("Erro.", "error"); }
        };
    }
    if(btnPending) {
        btnPending.onclick = async () => {
            const checked = document.querySelectorAll('.row-checkbox:checked');
            if(checked.length === 0) return;
            const batch = writeBatch(db);
            checked.forEach(chk => batch.update(doc(currentCollectionRef, chk.value), { status: false }));
            try { await batch.commit(); showToast("Voltaram para Pendente."); resetSelection(); } catch (e) { showToast("Erro.", "error"); }
        };
    }
}

function resetSelection() {
    const el = document.getElementById('check-all-rows');
    if(el) el.checked = false;
    const checked = document.querySelectorAll('.row-checkbox:checked');
    checked.forEach(c => c.checked = false);
    updateBulkUI();
}

function updateBulkUI() {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    const group = document.getElementById('bulk-actions-group');
    const count = document.getElementById('bulk-count');
    if(group && count) {
        checked.length > 0 ? group.classList.remove('hidden') : group.classList.add('hidden');
        count.innerText = checked.length;
    }
}

function setupRecurringHandlers(db) {
    const btnOpen = document.getElementById('btn-open-recurring');
    const btnClose = document.getElementById('btn-close-recurring');
    const modal = document.getElementById('modal-recurring');
    const form = document.getElementById('form-add-recurring');
    const btnGenerate = document.getElementById('btn-generate-recurring');
    const inputDate = document.getElementById('rec-generate-date');

    if(btnOpen) btnOpen.onclick = () => { modal.classList.remove('hidden'); if(inputDate && !inputDate.value) inputDate.valueAsDate = new Date(); };
    if(btnClose) btnClose.onclick = () => modal.classList.add('hidden');

    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const desc = document.getElementById('rec-desc').value;
            const val = parseFloat(document.getElementById('rec-val').value);
            const cat = document.getElementById('rec-cat').value;
            const type = document.getElementById('rec-type').value;
            const resp = document.getElementById('rec-resp').value;
            const freq = document.getElementById('rec-freq').value; 
            const reps = parseInt(document.getElementById('rec-times').value) || 1;

            try {
                await addDoc(currentRecurringRef, {
                    description: desc, value: val, category: cat, type: type, 
                    responsibility: resp, frequency: freq, repetitions: reps, createdAt: new Date().toISOString()
                });
                showToast("Modelo salvo!"); form.reset();
            } catch (err) { console.error(err); showToast("Erro ao adicionar.", "error"); }
        };
    }

    if(btnGenerate) {
        const newBtn = btnGenerate.cloneNode(true);
        btnGenerate.parentNode.replaceChild(newBtn, btnGenerate);
        newBtn.onclick = async () => {
            let startDateStr = inputDate.value;
            if(!startDateStr) { startDateStr = new Date().toISOString().split('T')[0]; }
            const snapshot = await getDocs(currentRecurringRef);
            if(snapshot.empty) return showToast("Nenhum modelo cadastrado.", "info");
            if(!confirm(`Gerar lançamentos a partir de ${startDateStr}?`)) return;
            
            const batch = writeBatch(db);
            let totalCreated = 0;
            snapshot.forEach(docSnap => {
                const item = docSnap.data();
                const reps = parseInt(item.repetitions) || 1;
                const freq = item.frequency || 'mensal';
                let baseDate = new Date(startDateStr + 'T12:00:00');
                for(let i = 0; i < reps; i++) {
                    let d = new Date(baseDate);
                    if (freq === 'mensal') d.setMonth(d.getMonth() + i);
                    else if (freq === 'quinzenal') d.setDate(d.getDate() + (i * 15));
                    else if (freq === 'semanal') d.setDate(d.getDate() + (i * 7));
                    const finalDateStr = d.toISOString().split('T')[0];
                    const suffix = reps > 1 ? ` (${i+1}/${reps})` : '';
                    batch.set(doc(currentCollectionRef), {
                        description: item.description + suffix, value: parseFloat(item.value),
                        category: item.category, type: item.type, responsibility: item.responsibility || '',
                        date: finalDateStr, status: false, createdAt: new Date().toISOString()
                    });
                    totalCreated++;
                }
            });
            try { await batch.commit(); showToast(`${totalCreated} gerados!`); modal.classList.add('hidden'); } catch (err) { showToast("Erro.", "error"); }
        };
    }
}

function setupFormListeners() {
    const btnNew = document.getElementById('btn-new-transaction');
    const modal = document.getElementById('modal-transaction');
    const btnCancel = document.getElementById('btn-cancel-trans');
    const form = document.getElementById('form-transaction');

    if (btnNew) btnNew.onclick = () => {
        form.reset();
        delete form.dataset.editingId; // Limpa ID de edição
        document.getElementById('form-data').valueAsDate = new Date();
        const btnSubmit = form.querySelector('button[type="submit"]');
        if(btnSubmit) btnSubmit.innerText = "Salvar Lançamento";
        modal.classList.remove('hidden');
    };

    if (btnCancel) btnCancel.onclick = () => modal.classList.add('hidden');

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const desc = document.getElementById('form-desc').value;
            const valStr = document.getElementById('form-valor').value;
            const valor = parseFloat(valStr);
            if (isNaN(valor) || !valStr) return showToast("Digite um valor válido.", "warn");
            if (!desc) return showToast("Digite uma descrição.", "warn");
            const data = document.getElementById('form-data').value;
            const cat = document.getElementById('form-categoria').value;
            const resp = document.getElementById('form-resp').value;
            const status = document.getElementById('form-status').checked;
            const tipoEl = document.querySelector('input[name="tipo"]:checked');
            if(!tipoEl) return showToast("Selecione: Receita ou Despesa?", "info");

            const payload = {
                description: desc, value: valor, date: data, category: cat, responsibility: resp,
                status: status, type: tipoEl.value
            };

            try {
                if (form.dataset.editingId) {
                    await updateDoc(doc(currentCollectionRef, form.dataset.editingId), payload);
                    showToast("Lançamento atualizado!");
                } else {
                    payload.createdAt = new Date().toISOString();
                    await addDoc(currentCollectionRef, payload);
                    showToast("Lançamento salvo!");
                }
                modal.classList.add('hidden'); form.reset();
            } catch (error) { console.error("Erro:", error); showToast("Erro ao salvar.", "error"); }
        };
    }
}

function setupExcelHandlers(db) {
    const btnExport = document.getElementById('btn-export-excel');
    const btnImport = document.getElementById('btn-import-excel');
    const inputImport = document.getElementById('import-excel-input');
    const btnTemplate = document.getElementById('btn-download-template');

    const getUtils = () => window.XLSX ? window.XLSX.utils : null;

    if (btnExport) btnExport.onclick = () => {
        if (currentTransactions.length === 0) return showToast("Nada para exportar.", "info");
        const data = currentTransactions.map(t => ({ 
            Data: new Date(t.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}), 
            Descrição: t.description, Categoria: t.category, Valor: t.value, 
            Tipo: t.type === 'receita' ? 'ENTRADA' : 'SAÍDA', 
            Responsabilidade: t.responsibility || '', Status: t.status ? 'Pago' : 'Pendente' 
        }));
        const utils = getUtils();
        if(!utils) return showToast("Biblioteca XLSX não carregada.", "error");
        const ws = utils.json_to_sheet(data);
        const wb = window.XLSX.utils.book_new();
        utils.book_append_sheet(wb, ws, "Lançamentos");
        window.XLSX.writeFile(wb, "FluxoCaixa_Export.xlsx");
    };

    if (btnTemplate) btnTemplate.onclick = () => {
        const data = [{ Data: '01/01/2026', Descrição: 'Exemplo', Categoria: 'Geral', Valor: -50.00, Tipo: 'SAÍDA', Responsabilidade: 'EU', Status: 'Pago' }];
        const utils = getUtils();
        if(!utils) return showToast("Biblioteca XLSX não carregada.", "error");
        const ws = utils.json_to_sheet(data);
        const wb = window.XLSX.utils.book_new(); 
        utils.book_append_sheet(wb, ws, "Modelo");
        window.XLSX.writeFile(wb, "Modelo_Importacao.xlsx");
    };

    if (btnImport && inputImport) {
        btnImport.onclick = () => inputImport.click();
        inputImport.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const wb = window.XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
                    const data = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]); 
                    const batch = writeBatch(db); let count = 0;
                    data.forEach(row => {
                        if(row['Descrição'] && row['Valor']) {
                            let finalDate = new Date().toISOString().split('T')[0];
                            const rawDate = row['Data'];
                            if (rawDate) {
                                if (rawDate instanceof Date) { rawDate.setHours(rawDate.getHours() + 12); finalDate = rawDate.toISOString().split('T')[0]; } 
                                else if (typeof rawDate === 'string' && rawDate.includes('/')) { const p = rawDate.trim().split('/'); if(p.length === 3) finalDate = `${p[2]}-${p[1]}-${p[0]}`; }
                                else if (typeof rawDate === 'number') { const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000)); d.setHours(d.getHours() + 12); finalDate = d.toISOString().split('T')[0]; }
                            }
                            let tipo = (row['Tipo'] && row['Tipo'].toString().toUpperCase().includes('ENTRADA')) ? 'receita' : 'despesa';
                            batch.set(doc(currentCollectionRef), { 
                                date: finalDate, description: row['Descrição'], category: row['Categoria'] || 'Geral', 
                                value: Math.abs(parseFloat(row['Valor'])), type: tipo, responsibility: row['Responsabilidade'] || 'Geral',
                                status: (row['Status'] === 'Pago'), createdAt: new Date().toISOString() 
                            });
                            count++;
                        }
                    });
                    await batch.commit(); showToast(`${count} importados!`); inputImport.value = '';
                } catch (err) { console.error(err); showToast("Erro no Excel.", "error"); }
            };
            reader.readAsBinaryString(file);
        };
    }
}