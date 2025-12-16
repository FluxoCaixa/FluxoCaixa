/**
 * ARQUIVO: js/modules/admin.js
 */
import { writeBatch, doc, getDocs, deleteDoc, collection, query, where, getDoc, addDoc, onSnapshot, orderBy, limit, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Importamos renderSkeleton
import { safeBind, showToast, openConfirmModal, closeConfirmModal, renderSkeleton } from '../utils.js';
import { defaultChecklistData, specificClientRules, PATHS } from '../config.js';
import { printRncReport } from './dashboard.js';
import { getCurrentUserName, getUserRole } from './auth.js';

let localAdminData = []; 
let globalDbForAdmin = null;
let currentAuditData = []; 

export function initAdminModule(db, clientsCollection) {
    globalDbForAdmin = db;

    safeBind('btn-reset-db', 'click', () => {
        openConfirmModal("Restaurar Padrões?", "PERIGO: Todos os checklists voltarão ao padrão de fábrica.", async () => {
            try {
                const s = await getDocs(clientsCollection);
                const b = writeBatch(db);
                s.forEach(d => {
                    const n = d.data().name?.toUpperCase().trim();
                    b.update(d.ref, { checklist: specificClientRules[n] || defaultChecklistData });
                });
                await b.commit();
                showToast("Padrões restaurados.");
                registerLog('RESET_SYSTEM', 'Sistema', 'Restaurou padrões');
            } catch { showToast("Erro.", 'error'); }
            closeConfirmModal();
        });
    });

    safeBind('btn-sync-prod-to-test', 'click', () => {
        openConfirmModal("Sobrescrever Testes?", "Isso copiará dados de Produção para Testes.", async () => {
            try {
                showToast("Clonando...", "info");
                const copyCollection = async (pathProd, pathTest) => {
                    const refProd = collection(db, pathProd);
                    const refTest = collection(db, pathTest);
                    const snapProd = await getDocs(refProd);
                    const snapTest = await getDocs(refTest);
                    const batch = writeBatch(db);
                    snapTest.forEach(doc => batch.delete(doc.ref)); 
                    snapProd.forEach(doc => {
                        const newRef = doc(refTest, doc.id);
                        batch.set(newRef, doc.data());
                    });
                    await batch.commit();
                };
                await copyCollection(PATHS.prod.clients, PATHS.test.clients);
                await copyCollection(PATHS.prod.occurrences, PATHS.test.occurrences);
                showToast("Teste atualizado!");
                registerLog('CLONE_ENV', 'Ambiente Teste', 'Clonou produção');
                setTimeout(() => window.location.reload(), 1500);
            } catch (e) { showToast("Erro clone.", 'error'); }
            closeConfirmModal();
        });
    });

    safeBind('download-template-btn', 'click', () => downloadJSON([{ "name": "CLIENTE EXEMPLO", "checklist": defaultChecklistData }], "modelo_clientes.json"));
    safeBind('file-upload', 'change', (e) => handleImport(e, db, 'clients', async (data, batch) => {
        const existingNames = new Map();
        (await getDocs(clientsCollection)).forEach(d => existingNames.set(d.data().name.toUpperCase().trim(), d.id));
        let count = 0;
        data.forEach(c => {
            if(c.name) {
                const id = existingNames.get(c.name.toUpperCase().trim());
                const ref = id ? doc(clientsCollection, id) : doc(clientsCollection);
                batch.set(ref, { name: c.name.toUpperCase().trim(), checklist: c.checklist || defaultChecklistData }, { merge: true });
                count++;
            }
        });
        return count;
    }, 'import-status'));

    safeBind('download-users-template-btn', 'click', () => downloadJSON([{ "id": "UID_FIREBASE", "name": "Nome", "role": "OPERADOR" }], "modelo_equipe.json"));
    safeBind('users-upload', 'change', (e) => handleImport(e, db, 'users', async (data, batch) => {
        let count = 0;
        data.forEach(u => {
            if(u.id && u.name) {
                batch.set(doc(db, 'users', u.id.trim()), { name: u.name.trim(), role: u.role?.toUpperCase() || 'LEITOR', updatedAt: new Date() });
                count++;
            }
        });
        return count;
    }, 'users-import-status'));

    safeBind('download-products-template-btn', 'click', () => downloadJSON([{ "dun": "17891000123456", "codigo": "200300", "descricao": "SHAMPOO" }], "modelo_produtos.json"));
    safeBind('products-upload', 'change', (e) => handleImport(e, db, 'products', async (data, batch) => {
        let count = 0;
        data.forEach(p => {
            if(p.dun && p.codigo) {
                const cleanDun = p.dun.replace(/\D/g, '');
                batch.set(doc(db, 'products', cleanDun), { 
                    codigo: p.codigo.toString().trim(), 
                    descricao: p.descricao.toUpperCase().trim(),
                    updatedAt: new Date() 
                });
                count++;
            }
        });
        return count;
    }, 'products-import-status'));

    setupProductSearch(db);

    safeBind('btn-refresh-admin-list', 'click', () => { 
        renderAdminTable(); 
        if(getUserRole() === 'ADMIN') loadInitialAuditLogs(db); 
    });
    safeBind('admin-search-rnc', 'input', () => renderAdminTable());
    safeBind('admin-search-label', 'input', () => renderAdminTable());
    safeBind('btn-audit-filter', 'click', () => filterAuditLogs(db));
    safeBind('btn-audit-export', 'click', () => exportAuditLogs());

    if(getUserRole() === 'ADMIN') {
        const auditSection = document.getElementById('admin-audit-section');
        if(auditSection) auditSection.classList.remove('hidden');
        loadInitialAuditLogs(db);
    }
}

export async function registerLog(action, target, details) {
    if (!globalDbForAdmin) return;
    try {
        const user = getCurrentUserName() || "Sistema/Anon";
        const role = getUserRole() || "N/A";
        await addDoc(collection(globalDbForAdmin, 'audit_logs'), {
            createdAt: new Date(), user, role, action: action.toUpperCase(), target, details
        });
    } catch (e) { console.error("Falha log:", e); }
}

function loadInitialAuditLogs(db) {
    const tbody = document.getElementById('audit-list-tbody');
    // APLICAÇÃO DO ESQUELETO: 4 colunas (Data, Usuário, Ação, Detalhes)
    if (tbody) renderSkeleton(tbody, 4, 5);

    const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(10));
    onSnapshot(q, (snapshot) => {
        currentAuditData = [];
        snapshot.forEach(doc => currentAuditData.push({ id: doc.id, ...doc.data() }));
        renderAuditTable(currentAuditData);
    });
}

async function filterAuditLogs(db) {
    const startVal = document.getElementById('audit-filter-start').value;
    const endVal = document.getElementById('audit-filter-end').value;
    const tbody = document.getElementById('audit-list-tbody');

    if (!startVal || !endVal) return showToast("Selecione as datas.", "info");
    const startDate = new Date(startVal + 'T00:00:00');
    const endDate = new Date(endVal + 'T23:59:59');

    // APLICAÇÃO DO ESQUELETO AO FILTRAR
    if (tbody) renderSkeleton(tbody, 4, 5);

    try {
        const q = query(collection(db, 'audit_logs'), where('createdAt', '>=', startDate), where('createdAt', '<=', endDate), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        currentAuditData = [];
        snapshot.forEach(doc => currentAuditData.push({ id: doc.id, ...doc.data() }));
        
        if (currentAuditData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500 italic">Nada encontrado.</td></tr>';
        } else {
            renderAuditTable(currentAuditData);
            showToast(`${currentAuditData.length} registros.`);
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-red-400 text-xs">Erro: Índice inexistente no Firebase.</td></tr>';
    }
}

function renderAuditTable(data) {
    const tbody = document.getElementById('audit-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = ''; 

    data.forEach(log => {
        const dateObj = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-800 hover:bg-slate-800/50 transition-colors";

        const tdDate = document.createElement('td'); tdDate.className = "px-4 py-3 font-mono text-slate-400 text-[10px] whitespace-nowrap"; tdDate.textContent = dateObj.toLocaleString('pt-BR');
        const tdUser = document.createElement('td'); tdUser.className = "px-4 py-3 text-white text-xs";
        const divUser = document.createElement('div'); divUser.className = "font-bold text-indigo-400"; divUser.textContent = log.user;
        const divRole = document.createElement('div'); divRole.className = "text-[9px] text-slate-500 uppercase tracking-wider"; divRole.textContent = log.role;
        tdUser.append(divUser, divRole);

        const tdAction = document.createElement('td'); tdAction.className = "px-4 py-3 text-xs font-bold text-slate-200";
        const spanAction = document.createElement('span'); spanAction.className = "bg-slate-700 px-2 py-1 rounded border border-slate-600"; spanAction.textContent = log.action;
        tdAction.appendChild(spanAction);

        const tdDetails = document.createElement('td'); tdDetails.className = "px-4 py-3 text-xs text-slate-400 italic"; tdDetails.textContent = `${log.target} - ${log.details}`;

        tr.append(tdDate, tdUser, tdAction, tdDetails);
        tbody.appendChild(tr);
    });
}

function exportAuditLogs() {
    if (currentAuditData.length === 0) return showToast("Nada para exportar.", "info");
    const exportList = currentAuditData.map(log => ({
        "Data/Hora": log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('pt-BR') : '-',
        "Usuário": log.user, "Cargo": log.role, "Ação": log.action, "Alvo": log.target, "Detalhes": log.details
    }));
    if (window.XLSX) {
        const ws = XLSX.utils.json_to_sheet(exportList);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
        XLSX.writeFile(wb, `AuditLog_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else { showToast("XLSX não carregado.", "error"); }
}

export function updateAdminList(data) {
    localAdminData = data;
    renderAdminTable();
}

function renderAdminTable() {
    const tbodyRNC = document.getElementById('admin-oc-list-tbody');
    const tbodyLabels = document.getElementById('admin-label-list-tbody');
    const searchRNC = document.getElementById('admin-search-rnc');
    const searchLabel = document.getElementById('admin-search-label');

    if (!tbodyRNC || !tbodyLabels) return;

    const termRNC = searchRNC ? searchRNC.value.toLowerCase().trim() : "";
    const termLabel = searchLabel ? searchLabel.value.toLowerCase().trim() : "";
    const uniqueList = Array.from(new Map(localAdminData.map(item => [item.id, item])).values());
    let rncList = uniqueList.filter(d => d.type !== 'pallet_label_request').sort((a,b) => b.jsDate - a.jsDate);
    let labelList = uniqueList.filter(d => d.type === 'pallet_label_request').sort((a,b) => b.jsDate - a.jsDate);

    if (termRNC) rncList = rncList.filter(item => `${item.embarque || ''} ${item.nf || ''} ${item.tipo || ''}`.toLowerCase().includes(termRNC));
    if (termLabel) labelList = labelList.filter(item => `${item.item || ''} ${item.lote || ''}`.toLowerCase().includes(termLabel));

    const rncDisplay = rncList.slice(0, 10);
    tbodyRNC.innerHTML = '';
    
    if (rncDisplay.length === 0) { 
        tbodyRNC.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-center text-slate-600 italic">Sem registros.</td></tr>'; 
    } else {
        rncDisplay.forEach(item => {
            const tr = document.createElement('tr'); 
            tr.className = "hover:bg-slate-800 transition-colors border-b border-slate-800/50";
            
            const tdData = document.createElement('td'); tdData.className = "px-4 py-3 text-slate-300 font-mono text-xs";
            tdData.append(document.createTextNode(item.jsDate.toLocaleDateString('pt-BR')), document.createElement('br'));
            const spanTipo = document.createElement('span'); spanTipo.className = "font-bold text-white uppercase"; spanTipo.textContent = item.tipo;
            tdData.appendChild(spanTipo);

            const tdRef = document.createElement('td'); tdRef.className = "px-4 py-3 text-slate-300 text-xs";
            const spanEmb = document.createElement('span'); spanEmb.className = "text-white font-medium"; spanEmb.textContent = item.embarque || 'S/ Emb';
            const spanNf = document.createElement('span'); spanNf.className = "text-slate-500"; spanNf.textContent = item.nf || 'S/ Cliente';
            tdRef.append(spanEmb, document.createElement('br'), spanNf);

            const tdActions = document.createElement('td'); tdActions.className = "px-4 py-3 text-right";
            const divBtns = document.createElement('div'); divBtns.className = "flex gap-2 justify-end";

            const btnPrint = document.createElement('button'); btnPrint.className = "text-indigo-400 hover:text-white bg-indigo-900/20 hover:bg-indigo-600 p-2 rounded transition btn-print-rnc";
            btnPrint.dataset.id = item.id; btnPrint.title = "Imprimir";
            btnPrint.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>';
            
            const btnDel = document.createElement('button'); btnDel.className = "text-red-400 hover:text-white bg-red-900/20 hover:bg-red-600 p-2 rounded transition btn-del-adm";
            btnDel.dataset.id = item.id; btnDel.title = "Excluir";
            btnDel.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';

            divBtns.append(btnPrint, btnDel);
            tdActions.appendChild(divBtns);
            tr.append(tdData, tdRef, tdActions);
            tbodyRNC.appendChild(tr);
        });
    }

    const labelDisplay = labelList.slice(0, 10);
    tbodyLabels.innerHTML = '';
    if (labelDisplay.length === 0) { 
        tbodyLabels.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-center text-slate-600 italic">Sem registros.</td></tr>'; 
    } else {
        labelDisplay.forEach(item => {
            const tr = document.createElement('tr'); 
            tr.className = "hover:bg-slate-800 transition-colors border-b border-slate-800/50";
            
            const tdData = document.createElement('td'); tdData.className = "px-4 py-3 text-slate-300 font-mono text-xs";
            tdData.textContent = `${item.jsDate.toLocaleDateString('pt-BR')} ${item.jsDate.toLocaleTimeString('pt-BR')}`;

            const tdItem = document.createElement('td'); tdItem.className = "px-4 py-3 text-slate-300 text-xs";
            const divItem = document.createElement('div'); divItem.className = "truncate font-bold text-white text-sm"; divItem.textContent = item.item;
            const spanLote = document.createElement('span'); spanLote.className = "text-cyan-400"; spanLote.textContent = `Lote: ${item.lote}`;
            tdItem.append(divItem, spanLote);

            const tdActions = document.createElement('td'); tdActions.className = "px-4 py-3 text-right";
            const btnDel = document.createElement('button'); btnDel.className = "text-red-400 hover:text-white bg-red-900/20 hover:bg-red-600 p-2 rounded transition btn-del-adm";
            btnDel.dataset.id = item.id;
            btnDel.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';
            tdActions.appendChild(btnDel);

            tr.append(tdData, tdItem, tdActions);
            tbodyLabels.appendChild(tr);
        });
    }

    const currentPath = localStorage.getItem('appLog_env') === 'test' ? PATHS.test.occurrences : PATHS.prod.occurrences;
    document.querySelectorAll('.btn-del-adm').forEach(btn => { 
        btn.onclick = (e) => { 
            const id = e.currentTarget.dataset.id; 
            openConfirmModal("Excluir Definitivamente?", "Esta ação não pode ser desfeita.", async () => { 
                try { 
                    await deleteDoc(doc(globalDbForAdmin, currentPath, id)); 
                    showToast("Excluído."); 
                    closeConfirmModal(); 
                    registerLog('EXCLUIR_REG', id, 'Admin excluiu registro forçadamente');
                } catch(err) { console.error(err); showToast("Erro ao excluir.", "error"); } 
            }); 
        }; 
    });
    
    document.querySelectorAll('.btn-print-rnc').forEach(btn => {
        btn.onclick = (e) => printRncReport(e.currentTarget.dataset.id);
    });
}

function setupProductSearch(db) {
    const btnSearch = document.getElementById('btn-search-product');
    const inputSearch = document.getElementById('product-search-input');
    const listContainer = document.getElementById('product-list-container');
    const tbody = document.getElementById('product-list-tbody');
    const msg = document.getElementById('product-search-msg');

    const doSearch = async () => {
        const term = inputSearch.value.toUpperCase().trim();
        if (term.length < 3) return showToast("Digite min 3 caracteres.", "info");
        
        tbody.innerHTML = '<tr><td colspan="3" class="p-2 text-center">Buscando...</td></tr>';
        listContainer.classList.remove('hidden'); msg.classList.add('hidden');

        try {
            const productsRef = collection(db, 'products');
            let results = [];
            if (/^\d+$/.test(term)) {
                const docSnap = await getDoc(doc(db, 'products', term));
                if (docSnap.exists()) results.push({ id: docSnap.id, ...docSnap.data() });
            }
            if (results.length === 0) {
                const q = query(productsRef);
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((doc) => {
                    const d = doc.data();
                    if (doc.id.includes(term) || d.descricao.includes(term) || d.codigo.includes(term)) {
                        results.push({ id: doc.id, ...d });
                    }
                });
            }
            renderProdTable(results.slice(0, 10), db);
        } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="3" class="p-2 text-center text-red-400">Erro na busca.</td></tr>'; }
    };

    const renderProdTable = (items, db) => {
        tbody.innerHTML = '';
        if (items.length === 0) { listContainer.classList.add('hidden'); msg.classList.remove('hidden'); return; }
        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-slate-800 hover:bg-slate-800";
            
            const tdId = document.createElement('td'); tdId.className = "p-2 font-mono text-orange-300 text-xs"; tdId.textContent = item.id;
            const tdDesc = document.createElement('td'); tdDesc.className = "p-2";
            const divD = document.createElement('div'); divD.className = "font-bold text-white text-xs"; divD.textContent = item.descricao;
            const divC = document.createElement('div'); divC.className = "text-[10px] text-gray-500"; divC.textContent = `Cód: ${item.codigo}`;
            tdDesc.append(divD, divC);

            const tdAct = document.createElement('td'); tdAct.className = "p-2 text-right";
            const btn = document.createElement('button'); btn.className = "text-red-400 hover:text-white bg-red-900/20 hover:bg-red-600 p-1.5 rounded transition btn-del-prod";
            btn.dataset.id = item.id; btn.title = "Excluir";
            btn.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';
            tdAct.appendChild(btn);

            tr.append(tdId, tdDesc, tdAct);
            tbody.appendChild(tr);
        });
        document.querySelectorAll('.btn-del-prod').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                openConfirmModal("Excluir Produto?", `DUN: ${id}`, async () => {
                    await deleteDoc(doc(db, 'products', id));
                    showToast("Produto excluído.");
                    closeConfirmModal();
                    doSearch();
                });
            });
        });
    };

    if(btnSearch) btnSearch.addEventListener('click', doSearch);
    if(inputSearch) inputSearch.addEventListener('keypress', (e) => { if(e.key === 'Enter') doSearch(); });
}

function downloadJSON(data, filename) {
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
}

function handleImport(event, db, collectionName, processFn, statusId) {
    const file = event.target.files[0]; if (!file) return;
    const statusDiv = document.getElementById(statusId);
    const statusText = document.getElementById(`${statusId}-text`);
    statusDiv.classList.remove('hidden'); statusText.innerText = "Lendo...";
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const data = JSON.parse(evt.target.result);
            if (!Array.isArray(data)) throw new Error("Formato inválido. Use uma lista [].");
            const batch = writeBatch(db);
            const count = await processFn(data, batch);
            if(count > 0) await batch.commit();
            showToast(`${count} itens importados.`);
            statusText.innerText = "Sucesso!";
            registerLog('IMPORT_DATA', collectionName, `Importou ${count} registros via JSON`);
        } catch (e) { 
            console.error(e);
            showToast("Erro na importação.", 'error'); 
            statusText.innerText = "Erro: " + e.message;
        }
        event.target.value = '';
        setTimeout(() => statusDiv.classList.add('hidden'), 4000);
    };
    reader.readAsText(file);
}