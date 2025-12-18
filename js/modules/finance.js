/**
 * ARQUIVO: js/modules/finance.js
 * DESCRIÇÃO: Módulo Financeiro Completo (Tabela, Filtros, Excel, Recorrência, Ações em Massa).
 */
import { 
    onSnapshot, addDoc, deleteDoc, updateDoc, doc, writeBatch, collection, getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showToast } from '../utils.js';
import { updateDashboard } from './dashboard.js';
import { updateCalendarData } from './calendar.js';

let unsubscribe = null;
let unsubscribeRecurring = null;
let currentCollectionRef = null;
let currentRecurringRef = null;

// ESTADO GLOBAL
let currentTransactions = []; 
let currentSortCol = 'date';  
let currentSortOrder = 'desc'; 

export function initFinanceModule(db, collectionRef) {
    currentCollectionRef = collectionRef;
    currentRecurringRef = collection(collectionRef.parent, "recurring");

    // 1. LISTENER DE TRANSAÇÕES
    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(collectionRef, (snapshot) => {
        const transactions = [];
        snapshot.forEach((doc) => transactions.push({ id: doc.id, ...doc.data() }));
        
        currentTransactions = transactions; 
        renderTable(); // Renderiza (aplica filtros e ordenação)
        updateDashboard(transactions);
        updateCalendarData(transactions);
    }, (error) => console.error("Erro transactions:", error));

    // 2. LISTENER DE MODELOS (FIXAS)
    if (unsubscribeRecurring) unsubscribeRecurring();
    unsubscribeRecurring = onSnapshot(currentRecurringRef, (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        renderRecurringTable(items);
    }, (error) => console.warn("Erro recurring:", error));

    // INICIALIZAÇÃO DE COMPONENTES
    setupFormListeners();
    setupBulkActions(db);
    setupExcelHandlers(db);
    setupRecurringHandlers(db);
    setupSortListeners(); 
    setupFilterListeners(); // <--- ATIVA OS FILTROS
}

export function stopFinanceListener() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (unsubscribeRecurring) { unsubscribeRecurring(); unsubscribeRecurring = null; }
}

// --- FILTROS (NOVA LÓGICA) ---
function setupFilterListeners() {
    // Inputs de Texto/Data (Ouvir evento 'input' para tempo real)
    const inputs = ['filter-date', 'filter-desc', 'filter-cat'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', renderTable);
    });

    // Botões de Limpeza Individual (os 'X' dentro dos inputs)
    document.getElementById('btn-clean-filter-date')?.addEventListener('click', () => {
        document.getElementById('filter-date').value = ''; renderTable();
    });
    document.getElementById('btn-clean-filter-desc')?.addEventListener('click', () => {
        document.getElementById('filter-desc').value = ''; renderTable();
    });
    document.getElementById('btn-clean-filter-cat')?.addEventListener('click', () => {
        document.getElementById('filter-cat').value = ''; renderTable();
    });

    // Botão "Limpar Tudo"
    document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        renderTable();
    });
}

// --- ORDENAÇÃO E RENDERIZAÇÃO ---
function setupSortListeners() {
    const headers = document.querySelectorAll('.sort-header');
    headers.forEach(th => {
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);

        newTh.addEventListener('click', () => {
            const col = newTh.getAttribute('data-col');
            if (currentSortCol === col) {
                currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortCol = col;
                currentSortOrder = 'asc';
            }
            renderTable();
        });
    });
}

function renderTable() {
    const tbody = document.getElementById('transactions-tbody');
    const checkAll = document.getElementById('check-all-rows');
    
    // Elementos de Filtro
    const fDate = document.getElementById('filter-date')?.value;
    const fDesc = document.getElementById('filter-desc')?.value.toLowerCase();
    const fCat = document.getElementById('filter-cat')?.value.toLowerCase();

    if (!tbody) return;
    tbody.innerHTML = '';
    
    // 1. FILTRAGEM
    let filteredList = currentTransactions.filter(t => {
        const matchDate = fDate ? t.date === fDate : true;
        const matchDesc = fDesc ? t.description.toLowerCase().includes(fDesc) : true;
        const matchCat = fCat ? t.category.toLowerCase().includes(fCat) : true;
        return matchDate && matchDesc && matchCat;
    });

    // 2. ORDENAÇÃO
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

    // Atualiza ícones de ordenação
    document.querySelectorAll('.sort-header .sort-icon').forEach(icon => {
        icon.innerText = '⇅'; 
        icon.classList.remove('text-emerald-400');
    });
    const activeHeader = document.querySelector(`.sort-header[data-col="${currentSortCol}"] .sort-icon`);
    if(activeHeader) {
        activeHeader.innerText = currentSortOrder === 'asc' ? '↑' : '↓';
        activeHeader.classList.add('text-emerald-400');
    }

    // 3. RENDERIZAÇÃO
    if (filteredList.length === 0) {
        // Mensagem diferente se for filtro vazio ou lista vazia
        if (currentTransactions.length > 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-slate-500 italic">Nenhum resultado para os filtros. <button id="btn-reset-empty" class="text-emerald-400 hover:underline ml-1">Limpar Filtros</button></td></tr>';
            document.getElementById('btn-reset-empty')?.addEventListener('click', () => document.getElementById('btn-clear-filters').click());
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-slate-500 italic">Nenhum lançamento.<br><span class="text-xs">Clique em "Novo" para começar.</span></td></tr>';
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
            <td class="px-6 py-3 text-right font-bold font-mono ${color} blur-sensitive">${sign} R$ ${val.toFixed(2)}</td>
            <td class="px-6 py-3 text-center">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${statusClass}">${statusText}</span>
            </td>
            <td class="px-6 py-3 text-right">
                <button class="btn-delete text-slate-500 hover:text-rose-400 transition p-1" data-id="${t.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </td>
        `;

        tr.querySelector('.btn-delete').onclick = () => deleteTransaction(t.id);
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

// --- AÇÕES EM MASSA ---
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
    document.getElementById('check-all-rows').checked = false;
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

// --- OUTROS MÓDULOS ---
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

function renderRecurringTable(items) {
    const tbody = document.getElementById('recurring-list-body');
    if(!tbody) return; tbody.innerHTML = '';
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

function setupFormListeners() {
    const btnNew = document.getElementById('btn-new-transaction');
    const modal = document.getElementById('modal-transaction');
    const btnCancel = document.getElementById('btn-cancel-trans');
    const form = document.getElementById('form-transaction');

    if (btnNew) btnNew.onclick = () => {
        form.reset();
        document.getElementById('form-data').valueAsDate = new Date(); // Data hoje
        modal.classList.remove('hidden');
    };

    if (btnCancel) btnCancel.onclick = () => modal.classList.add('hidden');

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            // Validações
            const desc = document.getElementById('form-desc').value;
            const valStr = document.getElementById('form-valor').value;
            const valor = parseFloat(valStr);
            
            if (isNaN(valor) || !valStr) return showToast("Digite um valor válido.", "warn");
            if (!desc) return showToast("Digite uma descrição.", "warn");

            const data = document.getElementById('form-data').value;
            const cat = document.getElementById('form-categoria').value;
            const resp = document.getElementById('form-resp').value;
            const status = document.getElementById('form-status').checked;
            
            // Pega o Radio Button Selecionado
            const tipoEl = document.querySelector('input[name="tipo"]:checked');
            if(!tipoEl) return showToast("Selecione: Receita ou Despesa?", "info");

            try {
                await addDoc(currentCollectionRef, {
                    description: desc,
                    value: valor,
                    date: data,
                    category: cat,
                    responsibility: resp,
                    status: status,
                    type: tipoEl.value, // 'receita' ou 'despesa'
                    createdAt: new Date().toISOString()
                });

                showToast("Lançamento salvo com sucesso!");
                modal.classList.add('hidden');
                form.reset();
            } catch (error) {
                console.error("Erro ao salvar:", error);
                showToast("Erro ao salvar no banco.", "error");
            }
        };
    }
}

// --- EXCEL & MODELO (CORRIGIDO) ---
function setupExcelHandlers(db) {
    const btnExport = document.getElementById('btn-export-excel');
    const btnImport = document.getElementById('btn-import-excel');
    const inputImport = document.getElementById('import-excel-input');
    const btnTemplate = document.getElementById('btn-download-template');

    if (btnExport) btnExport.onclick = () => {
        if (currentTransactions.length === 0) return showToast("Nada para exportar.", "info");
        const data = currentTransactions.map(t => ({ 
            Data: new Date(t.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}), 
            Descrição: t.description, 
            Categoria: t.category, 
            Valor: t.value, 
            Tipo: t.type === 'receita' ? 'ENTRADA' : 'SAÍDA', 
            Responsabilidade: t.responsibility || '', 
            Status: t.status ? 'Pago' : 'Pendente' 
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
        XLSX.writeFile(wb, "FluxoCaixa_Export.xlsx");
    };

    if (btnTemplate) btnTemplate.onclick = () => {
        const data = [{ Data: '01/01/2026', Descrição: 'Exemplo', Categoria: 'Geral', Valor: -50.00, Tipo: 'SAÍDA', Responsabilidade: 'EU', Status: 'Pago' }];
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new(); 
        XLSX.utils.book_append_sheet(wb, ws, "Modelo");
        XLSX.writeFile(wb, "Modelo_Importacao.xlsx");
    };

    if (btnImport && inputImport) {
        btnImport.onclick = () => inputImport.click();
        inputImport.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
                    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]); 
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