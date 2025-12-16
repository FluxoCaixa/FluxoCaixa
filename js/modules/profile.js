/**
 * ARQUIVO: js/modules/profile.js
 * DESCRIÇÃO: Gerencia Perfil, Grupos Familiares e Convites.
 */
import { 
    doc, getDoc, setDoc, addDoc, updateDoc, collection, 
    query, where, onSnapshot, arrayUnion, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../config.js';
import { showToast } from '../utils.js';

let currentUser = null;
let currentContextCallback = null; // Função para chamar no app.js quando trocar de conta

export function initProfile(user, onContextChange) {
    currentUser = user;
    currentContextCallback = onContextChange;

    // Preenche dados visuais
    document.getElementById('profile-name').innerText = user.displayName || "Usuário";
    document.getElementById('profile-email').innerText = user.email;
    document.getElementById('profile-pic').src = user.photoURL || "https://ui-avatars.com/api/?name=" + (user.displayName || "User");

    // Listeners
    setupInviteSystem();
    loadUserGroups();
    
    // Botão de Enviar Convite
    document.getElementById('btn-send-invite').addEventListener('click', sendInvite);
}

// =========================================================
// 1. GERENCIAMENTO DE CONTEXTO (Troca de Contas)
// =========================================================

async function loadUserGroups() {
    // Escuta o perfil do usuário para ver em quais grupos ele está
    const userRef = doc(db, "users_profile", currentUser.uid);
    
    onSnapshot(userRef, (snap) => {
        const data = snap.data() || {};
        const groups = data.groups || []; // Array de IDs de grupos
        
        renderContextSwitcher(groups);
    });
}

function renderContextSwitcher(groupIds) {
    const container = document.getElementById('context-switcher');
    container.innerHTML = '';

    // 1. Opção Pessoal (Sempre existe)
    createContextButton(container, "Meu Plano Individual", "personal", `users/${currentUser.uid}/transactions`);

    // 2. Opções de Família (Grupos)
    groupIds.forEach(async (groupId) => {
        // Busca nome do grupo
        const groupRef = doc(db, "groups", groupId);
        const groupSnap = await getDoc(groupRef);
        
        if (groupSnap.exists()) {
            const gData = groupSnap.data();
            const groupName = gData.name || "Família";
            createContextButton(container, `Grupo: ${groupName}`, groupId, `groups/${groupId}/transactions`);
        }
    });
}

function createContextButton(container, label, id, path) {
    const btn = document.createElement('button');
    btn.className = "w-full text-left px-4 py-3 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 transition flex items-center justify-between group focus:ring-2 focus:ring-emerald-500";
    
    // Marca visualmente qual está ativo (lógica simples baseada no localStorage ou estado atual)
    const currentPath = localStorage.getItem('last_context_path');
    if (path === currentPath) {
        btn.classList.add('border-emerald-500', 'bg-slate-700');
        btn.innerHTML = `<span class="font-bold text-white">${label}</span> <span class="text-emerald-400 text-xs font-bold uppercase bg-emerald-900/30 px-2 py-1 rounded">Ativo</span>`;
    } else {
        btn.innerHTML = `<span class="text-slate-300 group-hover:text-white">${label}</span>`;
    }

    btn.onclick = () => {
        // Salva preferência
        localStorage.setItem('last_context_path', path);
        
        // Atualiza UI
        renderContextSwitcher([]); // Limpa pra recriar com o novo ativo visualmente (hack rápido)
        loadUserGroups(); // Recarrega
        
        // CHAMA O APP.JS PARA TROCAR O BANCO DE DADOS
        if (currentContextCallback) currentContextCallback(path);
        
        showToast(`Trocado para: ${label}`);
    };

    container.appendChild(btn);
}

// =========================================================
// 2. SISTEMA DE CONVITES
// =========================================================

async function sendInvite() {
    const emailInput = document.getElementById('invite-email');
    const email = emailInput.value.trim().toLowerCase();

    if (!email) return showToast("Digite um e-mail.", "info");
    if (email === currentUser.email) return showToast("Você não pode se convidar.", "info");

    try {
        // 1. Garante que o usuário tem um "Grupo Próprio" criado
        const myGroupId = await ensureMyGroupExists();

        // 2. Cria o convite na coleção 'invites'
        await addDoc(collection(db, "invites"), {
            fromUid: currentUser.uid,
            fromName: currentUser.displayName,
            fromEmail: currentUser.email,
            toEmail: email,
            targetGroupId: myGroupId,
            status: 'pending',
            createdAt: serverTimestamp()
        });

        showToast(`Convite enviado para ${email}!`);
        emailInput.value = '';
    } catch (e) {
        console.error(e);
        showToast("Erro ao enviar convite.", "error");
    }
}

async function ensureMyGroupExists() {
    // Verifica se já criei um grupo onde sou dono
    // Para simplificar, vamos usar o ID do usuário como ID do grupo principal dele ou criar um doc
    const groupRef = doc(db, "groups", currentUser.uid + "_family");
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
        // Cria o grupo pela primeira vez
        await setDoc(groupRef, {
            name: "Família de " + (currentUser.displayName || "Usuário"),
            owner: currentUser.uid,
            members: [currentUser.uid],
            createdAt: serverTimestamp()
        });
        
        // Adiciona este grupo ao meu perfil
        await updateDoc(doc(db, "users_profile", currentUser.uid), {
            groups: arrayUnion(currentUser.uid + "_family")
        }).catch(async () => {
            // Se o perfil não existe, cria
            await setDoc(doc(db, "users_profile", currentUser.uid), {
                groups: [currentUser.uid + "_family"]
            });
        });
    }
    return currentUser.uid + "_family";
}

function setupInviteSystem() {
    // Escuta convites onde o e-mail de destino é o meu
    const q = query(collection(db, "invites"), where("toEmail", "==", currentUser.email), where("status", "==", "pending"));
    
    onSnapshot(q, (snap) => {
        const list = document.getElementById('invites-list');
        const area = document.getElementById('pending-invites-area');
        list.innerHTML = '';

        if (snap.empty) {
            area.classList.add('hidden');
        } else {
            area.classList.remove('hidden');
            snap.forEach(d => {
                const invite = d.data();
                const el = document.createElement('div');
                el.className = "bg-slate-700 p-3 rounded flex justify-between items-center border border-amber-500/30";
                el.innerHTML = `
                    <div>
                        <p class="text-white text-sm font-bold">${invite.fromName} te convidou!</p>
                        <p class="text-xs text-slate-400">Para entrar no grupo familiar.</p>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn-accept bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded transition">Aceitar</button>
                    </div>
                `;
                
                el.querySelector('.btn-accept').onclick = () => acceptInvite(d.id, invite.targetGroupId);
                list.appendChild(el);
            });
        }
    });
}

async function acceptInvite(inviteId, groupId) {
    try {
        // 1. Adiciona o usuário ao grupo
        const groupRef = doc(db, "groups", groupId);
        await updateDoc(groupRef, {
            members: arrayUnion(currentUser.uid)
        });

        // 2. Adiciona o grupo ao perfil do usuário
        const userProfileRef = doc(db, "users_profile", currentUser.uid);
        // Tenta atualizar, se não existir cria
        try {
            await updateDoc(userProfileRef, { groups: arrayUnion(groupId) });
        } catch (e) {
            await setDoc(userProfileRef, { groups: [groupId] });
        }

        // 3. Marca convite como aceito
        await updateDoc(doc(db, "invites", inviteId), { status: 'accepted' });

        showToast("Você entrou no grupo! Selecione-o no perfil.");
        loadUserGroups(); // Atualiza a lista
    } catch (e) {
        console.error(e);
        showToast("Erro ao aceitar.", "error");
    }
}