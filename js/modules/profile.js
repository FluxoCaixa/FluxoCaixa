/**
 * ARQUIVO: js/modules/profile.js
 * DESCRIÇÃO: Gerencia Perfil, Grupos Familiares e Convites (VERSÃO FINAL).
 */
import { 
    doc, getDoc, setDoc, addDoc, updateDoc, collection, 
    query, where, onSnapshot, arrayUnion, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../config.js';
import { showToast } from '../utils.js';

let currentUser = null;
let currentContextCallback = null;

export function initProfile(user, onContextChange) {
    currentUser = user;
    currentContextCallback = onContextChange;

    // Elementos HTML
    const elName = document.getElementById('profile-name');
    const elEmail = document.getElementById('profile-email');
    const elPic = document.getElementById('profile-pic');
    const btnInvite = document.getElementById('btn-send-invite');
    const familySection = document.getElementById('family-section');

    // --- 1. LIBERA O ACESSO (Se tiver usuário) ---
    if (user && familySection) {
        familySection.classList.remove('hidden'); // MOSTRA A CAIXA DE FAMÍLIA
    }

    // --- 2. PREENCHE DADOS VISUAIS ---
    if (elName) elName.innerText = user.displayName || "Usuário";
    
    if (elEmail) {
        elEmail.innerHTML = user.email;
    }

    if (elPic) {
        // Define a foto real (do Google) ou gera avatar com iniciais
        const photoUrl = user.photoURL || "https://ui-avatars.com/api/?name=" + (user.displayName || "User") + "&background=10b981&color=fff";
        elPic.src = photoUrl;
        
        // Estilização de "Usuário Ativo"
        elPic.classList.remove('border-slate-600', 'p-2', 'bg-slate-800');
        elPic.classList.add('border-emerald-500');
    }

    // --- 3. INICIA SISTEMAS ---
    setupInviteSystem();
    loadUserGroups();

    // Listener do botão de convite (Protegido)
    if (btnInvite) {
        // Remove listener anterior para não duplicar (cloneNode hack)
        const newBtn = btnInvite.cloneNode(true);
        btnInvite.parentNode.replaceChild(newBtn, btnInvite);
        newBtn.addEventListener('click', sendInvite);
    }
}

// =========================================================
// 1. GERENCIAMENTO DE CONTEXTO (Troca de Contas)
// =========================================================

async function loadUserGroups() {
    if (!currentUser) return;
    const userRef = doc(db, "users_profile", currentUser.uid);
    
    onSnapshot(userRef, (snap) => {
        const data = snap.data() || {};
        const groups = data.groups || []; 
        renderContextSwitcher(groups);
    }, (error) => {
        // Se der erro (perfil não existe), renderiza só o pessoal
        renderContextSwitcher([]);
    });
}

function renderContextSwitcher(groupIds) {
    const container = document.getElementById('context-switcher');
    if (!container) return; 

    container.innerHTML = '';

    // 1. Opção Pessoal
    createContextButton(container, "Meu Plano Individual", "personal", `users/${currentUser.uid}/transactions`);

    // 2. Opções de Família
    groupIds.forEach(async (groupId) => {
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
    btn.className = "w-full text-left px-4 py-3 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 transition flex items-center justify-between group focus:ring-2 focus:ring-emerald-500 mb-2";
    
    const currentPath = localStorage.getItem('last_context_path');
    if (path === currentPath) {
        btn.classList.add('border-emerald-500', 'bg-slate-700');
        btn.innerHTML = `<span class="font-bold text-white">${label}</span> <span class="text-emerald-400 text-xs font-bold uppercase bg-emerald-900/30 px-2 py-1 rounded">Ativo</span>`;
    } else {
        btn.innerHTML = `<span class="text-slate-300 group-hover:text-white">${label}</span>`;
    }

    btn.onclick = () => {
        localStorage.setItem('last_context_path', path);
        // Força refresh visual rápido
        renderContextSwitcher([]); 
        loadUserGroups();
        
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
    if (!emailInput) return;
    
    const email = emailInput.value.trim().toLowerCase();

    if (!email) return showToast("Digite um e-mail.", "info");
    if (email === currentUser.email) return showToast("Você não pode se convidar.", "info");

    try {
        const myGroupId = await ensureMyGroupExists();

        await addDoc(collection(db, "invites"), {
            fromUid: currentUser.uid,
            fromName: currentUser.displayName || "Alguém",
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
    // ID do grupo baseado no UID do dono
    const groupId = currentUser.uid + "_family";
    const groupRef = doc(db, "groups", groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
        // Cria o grupo
        await setDoc(groupRef, {
            name: "Família de " + (currentUser.displayName || "Usuário"),
            owner: currentUser.uid,
            members: [currentUser.uid],
            createdAt: serverTimestamp()
        });
        
        // Atualiza perfil do usuário para incluir esse grupo
        await updateDoc(doc(db, "users_profile", currentUser.uid), {
            groups: arrayUnion(groupId)
        }).catch(async () => {
            // Se perfil não existe, cria
            await setDoc(doc(db, "users_profile", currentUser.uid), {
                groups: [groupId]
            });
        });
    }
    return groupId;
}

function setupInviteSystem() {
    const q = query(collection(db, "invites"), where("toEmail", "==", currentUser.email), where("status", "==", "pending"));
    
    onSnapshot(q, (snap) => {
        const list = document.getElementById('invites-list');
        const area = document.getElementById('pending-invites-area');
        
        if (!list || !area) return;

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
        const groupRef = doc(db, "groups", groupId);
        await updateDoc(groupRef, { members: arrayUnion(currentUser.uid) });

        const userProfileRef = doc(db, "users_profile", currentUser.uid);
        try {
            await updateDoc(userProfileRef, { groups: arrayUnion(groupId) });
        } catch (e) {
            await setDoc(userProfileRef, { groups: [groupId] });
        }

        await updateDoc(doc(db, "invites", inviteId), { status: 'accepted' });

        showToast("Você entrou no grupo!");
        loadUserGroups(); // Atualiza a lista
    } catch (e) {
        console.error(e);
        showToast("Erro ao aceitar.", "error");
    }
}