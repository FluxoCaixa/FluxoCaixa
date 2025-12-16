/**
 * ARQUIVO: js/modules/finance.js
 * DESCRIÇÃO: Módulo Financeiro Completo e Expandido (CORRIGIDO).
 */

import { 
    addDoc, 
    deleteDoc, 
    updateDoc, 
    doc, 
    onSnapshot, 
    query, 
    orderBy, 
    writeBatch, 
    collection 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { safeBind, showToast, openConfirmModal, closeConfirmModal } from '../utils.js';
import { updateDashboardData } from './dashboard.js';
import { updateCalendarData } from './calendar.js';

// --- ESTADO GLOBAL DO MÓDULO ---
let currentCollection = null;
let transactionsData = [];
let filteredData = []; 
let dbInstance = null; 
let currentSort = { column: 'date', direction: 'desc' };
let selectedIds = new Set(); 

// Variáveis de Controle de Conexão (Listeners)
let unsubscribeTransactions = null;
let unsubscribeTemplates = null;
let recurringTemplates = []; 

// =========================================================
// 1. INICIALIZAÇÃO E CONTROLE DE CONEXÃO
// =========================================================

export function initFinanceModule(db, collectionRef) {
    stopFinanceListener();

    currentCollection = collectionRef;
    dbInstance = db;
    
    // --- Listener 1: Transações (Principal) ---
    const q = query(collectionRef, orderBy('date', 'desc'));
    
    unsubscribeTransactions = onSnapshot(q, (snapshot) => {
        transactionsData = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            transactionsData.push({ 
                id: doc.id, 
                ...data, 
                status: data.status !== undefined ? data.status : false, 
                jsDate: new Date(data.date + 'T12:00:00') 
            });
        });
        
        applyTableFilters();
        updateDashboardData(transactionsData);
        updateCalendarData(transactionsData);
        updateAutocompleteOptions();
        
    }, (error) => {
        if (error.code !== 'permission-denied') {
            console.error("Erro no Listener de Transações:", error);
        }
    });

    // --- Listener 2: Modelos de Recorrência ---
    loadRecurringTemplates();

    setupBindings();
}

export function stopFinanceListener() {
    if (unsubscribeTransactions) {
        unsubscribeTransactions();
        unsubscribeTransactions = null;
    }
    if (unsubscribeTemplates) {
        unsubscribeTemplates();
        unsubscribeTemplates = null;
    }
    
    transactionsData = [];
    recurringTemplates = [];
    updateDashboardData([]);
    renderTable([]);
    console.log("Finance: Conexões encerradas.");
}

function setupBindings() {
    // Transações
    safeBind('btn-new-transaction', 'click', () => openModal());
    safeBind('btn-cancel-trans', 'click', () => document.getElementById('modal-transaction').classList.add('hidden'));
    safeBind('form-transaction', 'submit', async (e) => {
        e.preventDefault();
        await saveTransaction();
    });

    // Excel
    safeBind('btn-download-template', 'click', downloadTemplate);
    safeBind('btn-import-excel', 'click', () => document.getElementById('import-excel-input').click());
    safeBind('import-excel-input', 'change', handleImportExcel);
    safeBind('btn-export-excel', 'click', exportDataToExcel); 

    // Filtros
    const filterInputs = ['filter-date', 'filter-desc', 'filter-cat'];
    filterInputs.forEach(id => safeBind(id, 'input', applyTableFilters));

    safeBind('btn-clear-filters', 'click', () => {
        filterInputs.forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.value = ''; 
        });
        applyTableFilters();
    });

    const cleanMap = {
        'btn-clean-filter-date': 'filter-date', 
        'btn-clean-filter-desc': 'filter-desc', 
        'btn-clean-filter-cat': 'filter-cat'
    };
    for (const [btnId, inputId] of Object.entries(cleanMap)) {
        safeBind(btnId, 'click', () => {
            const el = document.getElementById(inputId);
            if(el) { el.value = ''; applyTableFilters(); el.focus(); }
        });
    }

    // Ordenação
    document.querySelectorAll('.sort-header').forEach(th => {
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);
        newTh.addEventListener('click', () => handleSortClick(newTh.dataset.col));
    });

    // Ações em Massa
    safeBind('check-all-rows', 'change', (e) => {
        const isChecked = e.target.checked;
        if (isChecked) { 
            filteredData.forEach(item => selectedIds.add(item.id)); 
        } else { 
            selectedIds.clear(); 
        }
        renderTable(filteredData); 
    });

    safeBind('btn-bulk-finish', 'click', handleBulkFinish);
    safeBind('btn-bulk-delete', 'click', handleBulkDelete);

    // Recorrência
    safeBind('btn-open-recurring', 'click', openRecurringModal);
    safeBind('btn-close-recurring', 'click', () => document.getElementById('modal-recurring').classList.add('hidden'));
    safeBind('form-add-recurring', 'submit', addRecurringTemplate);
    safeBind('btn-generate-recurring', 'click', generateRecurringTransactions);
}

// =========================================================
// 2. LÓGICA DE RECORRÊNCIA (CONTAS FIXAS)
// =========================================================

function loadRecurringTemplates() {
    const recRef = collection(dbInstance, "recurring_templates");
    
    unsubscribeTemplates = onSnapshot(recRef, (snap) => {
        recurringTemplates = [];
        snap.forEach(d => {
            recurringTemplates.push({ id: d.id, ...d.data() });
        });
        renderRecurringList();
    }, (err) => {
        if(err.code !== 'permission-denied') console.error("Erro Templates:", err);
    });
}

function renderRecurringList() {
    const tbody = document.getElementById('recurring-list-body');
    if(!tbody) return;
    
    tbody.innerHTML = '';
    
    if(recurringTemplates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500 italic">Nenhum modelo cadastrado.</td></tr>';
        return;
    }

    recurringTemplates.forEach(item => {
        const tr = document.createElement('tr');
        const color = item.type === 'receita' ? 'text-emerald-400' : 'text-rose-400';
        
        let ruleText = "Única";
        if(item.frequency === 'mensal') ruleText = `Mensal (${item.times}x)`;
        if(item.frequency === 'semanal') ruleText = `Semanal (${item.times}x)`;

        tr.className = "hover:bg-slate-800 transition border-b border-slate-800 last:border-0";
        tr.innerHTML = `
            <td class="px-4 py-3">
                <div class="font-medium text-white">${item.description}</div>
                <div class="text-[10px] text-slate-400 mt-0.5 flex gap-2">
                    <span class="bg-slate-700 px-1.5 rounded uppercase">${item.category}</span>
                    <span class="uppercase">${item.responsibility || 'Geral'}</span>
                </div>
            </td>
            <td class="px-4 py-3 text-center text-xs text-indigo-300 font-bold bg-indigo-900/10 rounded">
                ${ruleText}
            </td>
            <td class="px-4 py-3 text-right font-mono font-bold ${color}">
                R$ ${parseFloat(item.value).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
            </td>
            <td class="px-4 py-3 text-right">
                <button class="text-rose-400 hover:text-white btn-del-rec transition p-1 hover:bg-rose-900/20 rounded" data-id="${item.id}" title="Remover Modelo">
                    <svg class="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-del-rec').forEach(btn => {
        btn.onclick = async () => {
            if(confirm("Remover este modelo de conta fixa?")) {
                try {
                    await deleteDoc(doc(dbInstance, "recurring_templates", btn.dataset.id));
                    showToast("Modelo removido.");
                } catch (e) {
                    showToast("Erro ao remover.", "error");
                }
            }
        };
    });
}

async function addRecurringTemplate(e) {
    e.preventDefault();
    
    const desc = document.getElementById('rec-desc').value.toUpperCase();
    const val = parseFloat(document.getElementById('rec-val').value);
    const type = document.getElementById('rec-type').value;
    const cat = document.getElementById('rec-cat').value.toUpperCase();
    const resp = document.getElementById('rec-resp').value.toUpperCase();
    const freq = document.getElementById('rec-freq').value;
    const times = parseInt(document.getElementById('rec-times').value) || 1;

    if(!desc || !val || !cat) { 
        showToast("Preencha descrição, valor e categoria.", "info"); 
        return; 
    }

    try {
        await addDoc(collection(dbInstance, "recurring_templates"), {
            description: desc, value: val, type: type,
            category: cat, responsibility: resp || "GERAL",
            frequency: freq, times: times, createdAt: new Date()
        });
        
        document.getElementById('rec-desc').value = '';
        document.getElementById('rec-val').value = '';
        document.getElementById('rec-desc').focus();
        showToast("Modelo adicionado com sucesso!");
    } catch (err) { 
        console.error(err); 
        showToast("Erro ao adicionar modelo.", "error"); 
    }
}

async function generateRecurringTransactions() {
    if(recurringTemplates.length === 0) { showToast("Cadastre modelos primeiro.", "info"); return; }
    
    const startDateInput = document.getElementById('rec-generate-date').value;
    if(!startDateInput) { showToast("Selecione a Data de Início.", "info"); return; }

    let totalPreview = 0;
    recurringTemplates.forEach(t => totalPreview += (t.times || 1));

    openConfirmModal(
        "Gerar Lançamentos Futuros?", 
        `Baseado nos modelos, serão gerados ${totalPreview} lançamentos a partir de ${startDateInput.split('-').reverse().join('/')}.`, 
        async () => {
            try {
                const batch = writeBatch(dbInstance);
                let count = 0;
                const baseDate = new Date(startDateInput + 'T12:00:00');

                recurringTemplates.forEach(tpl => {
                    const loops = tpl.times || 1;
                    for (let i = 0; i < loops; i++) {
                        let futureDate = new Date(baseDate);
                        
                        if (tpl.frequency === 'mensal') futureDate.setMonth(baseDate.getMonth() + i);
                        else if (tpl.frequency === 'semanal') futureDate.setDate(baseDate.getDate() + (i * 7));
                        
                        const dateStr = futureDate.toISOString().split('T')[0];
                        const cleanDesc = tpl.description.replace(/[^A-Z0-9]/g, '');
                        const uniqueID = `${dateStr}_${tpl.type}_${Math.round(tpl.value * 100)}_${cleanDesc}_${i+1}`;
                        
                        let finalDesc = tpl.description;
                        if (loops > 1) finalDesc += ` (${i+1}/${loops})`;

                        batch.set(doc(currentCollection, uniqueID), {
                            date: dateStr, description: finalDesc, value: tpl.value, type: tpl.type,
                            category: tpl.category || "FIXO", responsibility: tpl.responsibility || "GERAL",
                            status: false, generatedAt: new Date()
                        });
                        count++;
                    }
                });

                await batch.commit();
                showToast(`${count} lançamentos gerados!`);
                document.getElementById('modal-recurring').classList.add('hidden');
                closeConfirmModal();
            } catch (err) {
                console.error(err);
                showToast("Erro ao gerar lançamentos.", "error");
            }
        }
    );
}

function openRecurringModal() {
    document.getElementById('rec-generate-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-recurring').classList.remove('hidden');
}

// =========================================================
// 3. CRUD (CRIAR, EDITAR, SALVAR)
// =========================================================

function openModal(data = null) {
    const modal = document.getElementById('modal-transaction');
    const form = document.getElementById('form-transaction');
    
    form.reset();
    document.getElementById('form-id').value = '';
    document.getElementById('form-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('form-status').checked = false;

    if (data) {
        document.getElementById('form-id').value = data.id;
        document.getElementById('form-desc').value = data.description;
        document.getElementById('form-valor').value = data.value;
        document.getElementById('form-data').value = data.date;
        document.getElementById('form-categoria').value = data.category;
        document.getElementById('form-resp').value = data.responsibility || '';
        document.getElementById('form-status').checked = data.status;
        
        const radio = document.querySelector(`input[name="tipo"][value="${data.type}"]`);
        if(radio) radio.checked = true;
    }
    modal.classList.remove('hidden');
}

async function saveTransaction() {
    const id = document.getElementById('form-id').value;
    const type = document.querySelector('input[name="tipo"]:checked').value;
    const description = document.getElementById('form-desc').value.toUpperCase();
    const category = document.getElementById('form-categoria').value.toUpperCase();
    const responsibility = document.getElementById('form-resp').value.toUpperCase(); 
    const value = parseFloat(document.getElementById('form-valor').value);
    const date = document.getElementById('form-data').value;
    const status = document.getElementById('form-status').checked;

    const payload = { type, description, value, date, category, responsibility, status };

    try {
        if (id) {
            await updateDoc(doc(currentCollection, id), payload);
            showToast("Atualizado com sucesso!");
        } else {
            const cleanDesc = description.replace(/[^A-Z0-9]/g, '');
            const uniqueID = `${date}_${type}_${Math.round(value * 100)}_${cleanDesc}`;
            
            await updateDoc(doc(currentCollection, uniqueID), payload)
                .catch(async () => {
                    await dbInstance.runTransaction(async (t) => { t.set(doc(currentCollection, uniqueID), payload); });
                });
            showToast("Salvo com sucesso!");
        }
        document.getElementById('modal-transaction').classList.add('hidden');
    } catch (e) { 
        console.error(e); 
        showToast("Erro ao salvar.", "error"); 
    }
}

// =========================================================
// 4. TABELA, FILTROS E RENDERIZAÇÃO
// =========================================================

function applyTableFilters() {
    const fDate = document.getElementById('filter-date')?.value || '';
    const fDesc = document.getElementById('filter-desc')?.value.toLowerCase().trim() || '';
    const fCat = document.getElementById('filter-cat')?.value.toLowerCase().trim() || '';

    filteredData = transactionsData.filter(item => {
        if (fDate && item.date !== fDate) return false;
        if (fDesc && !item.description.toLowerCase().includes(fDesc)) return false;
        const catText = (item.category + ' ' + (item.responsibility || '')).toLowerCase();
        if (fCat && !catText.includes(fCat)) return false;
        return true;
    });

    filteredData = sortData(filteredData);
    renderTable(filteredData);
}

function renderTable(data) {
    const tbody = document.getElementById('transactions-tbody');
    tbody.innerHTML = '';
    
    updateBulkUI();

    if (data.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-slate-500 italic">Nada encontrado.</td></tr>'; 
        return; 
    }

    data.forEach(item => {
        const tr = document.createElement('tr');
        const isSelected = selectedIds.has(item.id);
        
        tr.className = `border-b border-slate-700 transition group ${isSelected ? 'bg-indigo-900/20 hover:bg-indigo-900/30' : 'hover:bg-slate-800'}`;
        
        const isReceita = item.type === 'receita';
        const colorClass = isReceita ? 'text-emerald-400' : 'text-rose-400';
        
        // CORREÇÃO: Variável 'sn' definida corretamente aqui
        const sn = isReceita ? '+' : '-'; 
        const resp = item.responsibility ? `<br><span class="text-[10px] text-slate-600 font-medium">${item.responsibility}</span>` : '';
        
        let statusBtn = '';
        if (item.status) {
            statusBtn = `<button class="btn-toggle-status inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-900/30 text-emerald-500 mr-2 border border-emerald-500/50 hover:bg-rose-900/30 hover:text-rose-400 hover:border-rose-500 transition-all" data-id="${item.id}" title="Realizado"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg></button>`;
        } else {
            statusBtn = `<button class="btn-toggle-status inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 text-slate-400 mr-2 border border-slate-600 border-dashed hover:bg-emerald-900/50 hover:text-emerald-400 hover:border-emerald-500 transition-all" data-id="${item.id}" title="Pendente"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>`;
        }

        const opacityClass = item.status ? '' : 'opacity-70';

        tr.innerHTML = `
            <td class="px-4 py-4 text-center">
                <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-0 cursor-pointer accent-indigo-500 bg-slate-800" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
            </td>
            <td class="px-6 py-4 font-mono text-sm text-slate-400 ${opacityClass}">${item.jsDate.toLocaleDateString('pt-BR')}</td>
            <td class="px-6 py-4 ${opacityClass}">
                <div class="flex items-center">
                    ${statusBtn}
                    <div class="font-bold text-white">${item.description}</div>
                </div>
            </td>
            <td class="px-6 py-4 text-xs text-slate-500 uppercase font-bold tracking-wide ${opacityClass}">${item.category}${resp}</td>
            <td class="px-6 py-4 text-right font-mono font-bold ${colorClass} ${opacityClass} blur-sensitive">
            ${sn} R$ ${item.value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
            </td>
            <td class="px-6 py-4 text-right">
                <button class="text-indigo-400 hover:text-white mr-3 btn-edit opacity-0 group-hover:opacity-100 transition" data-id="${item.id}" title="Editar">
                    <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                </button>
                <button class="text-rose-400 hover:text-white btn-del opacity-0 group-hover:opacity-100 transition" data-id="${item.id}" title="Excluir">
                    <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Listeners da Tabela
    tbody.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            if (e.target.checked) selectedIds.add(id);
            else selectedIds.delete(id);
            updateBulkUI();
            
            const row = e.target.closest('tr');
            if(e.target.checked) {
                row.classList.remove('hover:bg-slate-800');
                row.classList.add('bg-indigo-900/20', 'hover:bg-indigo-900/30');
            } else {
                row.classList.add('hover:bg-slate-800');
                row.classList.remove('bg-indigo-900/20', 'hover:bg-indigo-900/30');
            }
        });
    });

    tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.onclick = () => openModal(transactionsData.find(d => d.id === btn.dataset.id));
    });
    
    tbody.querySelectorAll('.btn-del').forEach(btn => {
        btn.onclick = () => { 
            const id = btn.dataset.id; 
            openConfirmModal("Excluir?", "Não poderá ser desfeito.", async () => { 
                await deleteDoc(doc(currentCollection, id)); 
                showToast("Excluído."); 
                closeConfirmModal(); 
            }); 
        };
    });

    tbody.querySelectorAll('.btn-toggle-status').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation(); 
            handleStatusToggle(btn.dataset.id);
        };
    });
}

async function handleStatusToggle(id) {
    const item = transactionsData.find(d => d.id === id);
    if (!item) return;

    try {
        await updateDoc(doc(currentCollection, id), { status: !item.status });
        const msg = item.status ? "Marcado como Pendente" : "Marcado como Realizado";
        showToast(msg);
    } catch (e) {
        console.error(e);
        showToast("Erro ao atualizar status.", "error");
    }
}

// =========================================================
// 5. AÇÕES EM MASSA E AUXILIARES
// =========================================================

function updateBulkUI() {
    const group = document.getElementById('bulk-actions-group');
    const countSpan = document.getElementById('bulk-count');
    const masterCheck = document.getElementById('check-all-rows');

    if (selectedIds.size > 0) {
        group.classList.remove('hidden');
        if(countSpan) countSpan.innerText = selectedIds.size;
    } else {
        group.classList.add('hidden');
        if(masterCheck) masterCheck.checked = false;
    }
}

async function handleBulkFinish() {
    if (selectedIds.size === 0) return;

    openConfirmModal(
        "Concluir Selecionados?", 
        `Deseja marcar ${selectedIds.size} itens como REALIZADO?`, 
        async () => {
            try {
                const batch = writeBatch(dbInstance);
                selectedIds.forEach(id => {
                    const ref = doc(currentCollection, id);
                    batch.update(ref, { status: true });
                });
                await batch.commit();
                showToast(`${selectedIds.size} itens atualizados!`);
                selectedIds.clear();
                updateBulkUI();
                closeConfirmModal();
            } catch (e) { 
                console.error(e); 
                showToast("Erro ao processar em massa.", "error"); 
            }
        }
    );
}

async function handleBulkDelete() {
    if (selectedIds.size === 0) return;

    openConfirmModal(
        "Excluir Selecionados?", 
        `ATENÇÃO: Você vai apagar ${selectedIds.size} lançamentos permanentemente.`, 
        async () => {
            try {
                const batch = writeBatch(dbInstance);
                selectedIds.forEach(id => {
                    const ref = doc(currentCollection, id);
                    batch.delete(ref);
                });
                await batch.commit();
                showToast(`${selectedIds.size} itens excluídos!`);
                selectedIds.clear();
                updateBulkUI();
                closeConfirmModal();
            } catch (e) { 
                console.error(e); 
                showToast("Erro ao excluir.", "error"); 
            }
        }
    );
}

// =========================================================
// 6. EXCEL E UTILITÁRIOS
// =========================================================

function downloadTemplate() {
    const data = [{
        "Data": "01/01/2026",
        "Status": "PENDENTE",
        "Mês": 1,
        "Ano": 2026,
        "Tipo": "SAÍDA",
        "Responsabilidade": "WELLINGTON",
        "Categoria": "CONTAS",
        "Descrição": "CONTA SICREDI",
        "Valor": 20.00
    }];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "Modelo_Financeiro.xlsx");
}

async function handleImportExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) { 
                showToast("Arquivo vazio ou formato inválido.", "error"); 
                return; 
            }

            const batch = writeBatch(dbInstance);
            let count = 0;

            jsonData.forEach((row) => {
                // Tratamento de Data
                let dateStr = "";
                if (row["Data"]) {
                    if (typeof row["Data"] === 'string' && row["Data"].includes('/')) {
                        const parts = row["Data"].split('/'); 
                        if(parts.length === 3) dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    } else {
                        const jsDate = new Date((row["Data"] - (25567 + 2)) * 86400 * 1000);
                        if (!isNaN(jsDate)) dateStr = jsDate.toISOString().split('T')[0];
                    }
                }
                if (!dateStr) dateStr = new Date().toISOString().split('T')[0];

                // Tratamento de Tipo
                let type = "despesa";
                const rowType = (row["Tipo"] || "").toString().toUpperCase().trim();
                if (rowType.includes("ENTRADA") || rowType.includes("RECEITA") || rowType.includes("CREDITO")) {
                    type = "receita";
                }

                // Tratamento de Valor
                let val = row["Valor"];
                if (typeof val === 'string') {
                    val = parseFloat(val.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
                }
                if (isNaN(val)) val = 0;
                val = Math.abs(val);

                // Tratamento de Status
                let status = false; 
                const rowStatus = (row["Status"] || "").toString().toUpperCase();
                if (rowStatus.includes("REALIZADO") || rowStatus.includes("PAGO") || rowStatus.includes("OK")) {
                    status = true;
                }

                const safeDesc = (row["Descrição"] || "Importado").toString().toUpperCase().trim();
                const safeCat = (row["Categoria"] || "OUTROS").toString().toUpperCase().trim();
                const safeResp = (row["Responsabilidade"] || "GERAL").toString().toUpperCase().trim();

                const uniqueID = `${dateStr}_${type}_${Math.round(val * 100)}_${safeDesc.replace(/[^A-Z0-9]/g, '')}`;

                batch.set(doc(currentCollection, uniqueID), { 
                    date: dateStr,
                    type: type,
                    category: safeCat,
                    description: safeDesc,
                    value: val,
                    responsibility: safeResp,
                    status: status,
                    importedAt: new Date()
                });
                count++;
            });

            if (count > 0) { 
                await batch.commit(); 
                showToast(`${count} registros importados!`); 
            } else {
                showToast("Nenhum dado válido encontrado.", "info");
            }

        } catch (error) { 
            console.error("Erro importação:", error); 
            showToast("Erro na importação.", "error"); 
        }
        document.getElementById('import-excel-input').value = "";
    };
    reader.readAsArrayBuffer(file);
}

// NOVA FUNÇÃO: EXPORTAR (BACKUP)
function exportDataToExcel() {
    if (transactionsData.length === 0) {
        showToast("Nada para exportar.", "info");
        return;
    }

    const dataToExport = transactionsData.map(item => ({
        "Data": item.date.split('-').reverse().join('/'),
        "Descrição": item.description,
        "Categoria": item.category,
        "Valor": item.value,
        "Tipo": item.type.toUpperCase(),
        "Responsável": item.responsibility || '',
        "Status": item.status ? "REALIZADO" : "PENDENTE"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Backup");
    
    const fileName = `Backup_FluxoCaixa_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showToast("Backup baixado com sucesso!");
}

// --- Funções de Ordenação e Autocomplete ---

function handleSortClick(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
        if (column === 'date' || column === 'value') currentSort.direction = 'desc';
    }
    updateSortIcons();
    applyTableFilters();
}

function updateSortIcons() {
    document.querySelectorAll('.sort-header').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        const col = th.dataset.col;
        
        th.classList.remove('text-emerald-400');
        icon.innerText = '⇅'; 
        icon.className = 'sort-icon text-slate-600 group-hover:text-slate-400';

        if (col === currentSort.column) {
            th.classList.add('text-emerald-400');
            icon.innerText = currentSort.direction === 'asc' ? '▲' : '▼';
            icon.className = 'sort-icon text-emerald-400';
        }
    });
}

function sortData(data) {
    return data.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];

        if (currentSort.column === 'date') {
            valA = a.jsDate;
            valB = b.jsDate;
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
        }
        
        if (currentSort.column === 'date' && valA.getTime() === valB.getTime()) {
            return a.status === b.status ? 0 : (a.status ? 1 : -1); 
        }

        let comparison = 0;
        if (valA > valB) comparison = 1; 
        else if (valA < valB) comparison = -1;

        return currentSort.direction === 'asc' ? comparison : -comparison;
    });
}

function updateAutocompleteOptions() {
    const uniqueDesc = new Set();
    const uniqueCat = new Set();
    const uniqueResp = new Set();

    transactionsData.forEach(item => {
        if(item.description) uniqueDesc.add(item.description); 
        if(item.category) uniqueCat.add(item.category);
        if(item.responsibility) uniqueResp.add(item.responsibility);
    });

    fillDatalist('list-desc', uniqueDesc);
    fillDatalist('list-cat', uniqueCat);
    fillDatalist('list-resp', uniqueResp);
}

function fillDatalist(id, set) {
    const dl = document.getElementById(id);
    if(dl) {
        dl.innerHTML = '';
        Array.from(set).sort().forEach(v => {
            const o = document.createElement('option');
            o.value = v;
            dl.appendChild(o);
        });
    }
}