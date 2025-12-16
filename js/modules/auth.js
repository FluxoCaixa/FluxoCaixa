/**
 * ARQUIVO: js/modules/auth.js
 */
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth, provider } from '../config.js';
import { safeBind, showToast } from '../utils.js';

// Lista VIP
const ALLOWED_EMAILS = [
    "wellington.alves1304@gmail.com",
    "erykavieira240@gmail.com"
];

let currentUser = null;

// Agora aceita duas funções: onLoginSuccess e onLogout
export function initAuth(onLoginSuccess, onLogout) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (ALLOWED_EMAILS.includes(user.email.toLowerCase())) {
                // SUCESSO: É VIP e está logado
                currentUser = user;
                updateUI(true);
                
                // AVIA O APP PARA CARREGAR OS DADOS
                if (onLoginSuccess) onLoginSuccess(user);
                
            } else {
                // INTRUSO
                console.warn(`Bloqueado: ${user.email}`);
                await signOut(auth);
                currentUser = null;
                updateUI(false);
                showToast("Acesso Negado.", "error");
                
                // AVISA O APP PARA LIMPAR DADOS
                if (onLogout) onLogout();
                
                const m = document.getElementById('login-modal');
                if(m) m.classList.remove('hidden');
            }
        } else {
            // LOGOUT NORMAL
            currentUser = null;
            updateUI(false);
            
            // AVISA O APP PARA LIMPAR DADOS
            if (onLogout) onLogout();
        }
    });

    setupBindings();
}

function setupBindings() {
    safeBind('btn-open-login', 'click', () => toggleModal(true));
    safeBind('btn-close-login', 'click', () => toggleModal(false));

    safeBind('btn-login-google', 'click', async () => {
        try {
            await signInWithPopup(auth, provider);
            toggleModal(false);
        } catch (error) {
            console.error(error);
            showToast("Erro login Google.", "error");
        }
    });

    safeBind('login-form', 'submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        if (!email || !pass) { showToast("Preencha tudo.", "info"); return; }
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            toggleModal(false);
        } catch (error) {
            showToast("Erro ao entrar.", "error");
        }
    });

    safeBind('btn-logout', 'click', async () => {
        try { await signOut(auth); showToast("Saiu."); } 
        catch (error) { console.error(error); }
    });
}

function toggleModal(show) {
    const m = document.getElementById('login-modal');
    if (m) {
        if (show) m.classList.remove('hidden');
        else m.classList.add('hidden');
    }
}

function updateUI(isLoggedIn) {
    const btnOpen = document.getElementById('btn-open-login');
    const btnLogout = document.getElementById('btn-logout');
    const labelRole = document.getElementById('user-role-label');
    const labelId = document.getElementById('userIdDisplay');

    if (isLoggedIn && currentUser) {
        if(btnOpen) btnOpen.classList.add('hidden');
        if(btnLogout) btnLogout.classList.remove('hidden');
        const name = currentUser.displayName || currentUser.email.split('@')[0];
        if(labelRole) labelRole.innerText = name;
        if(labelId) labelId.innerText = currentUser.email;
    } else {
        if(btnOpen) btnOpen.classList.remove('hidden');
        if(btnLogout) btnLogout.classList.add('hidden');
        if(labelRole) labelRole.innerText = 'Entrar';
        if(labelId) labelId.innerText = 'Anônimo';
    }
}