/**
 * ARQUIVO: js/modules/auth.js
 * DESCRIÇÃO: Autenticação Híbrida (Tenta Popup, falha para Redirect se necessário).
 */
import { 
    getAuth, 
    signInWithPopup, 
    signInWithRedirect, 
    getRedirectResult,
    GoogleAuthProvider, 
    signOut, 
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { app } from '../config.js';
import { showToast } from '../utils.js';

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export function initAuth(onLogin, onLogout) {
    const modal = document.getElementById('login-modal');
    console.log("🔒 Auth: Inicializando...");

    // 1. Verifica se o usuário acabou de voltar de um Redirecionamento
    getRedirectResult(auth)
        .then((result) => {
            if (result) {
                console.log("✅ Auth: Retorno do Redirect com sucesso!", result.user);
                showToast(`Bem-vindo de volta, ${result.user.displayName}!`);
            }
        })
        .catch((error) => {
            console.error("❌ Auth: Erro no retorno do Redirect:", error);
            showToast("Erro ao processar login.", "error");
        });

    // 2. Monitora estado em tempo real
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("👤 Auth: Usuário detectado:", user.email);
            updateUserUI(user);
            if(modal) modal.classList.add('hidden');
            if (onLogin) onLogin(user);
        } else {
            console.log("👤 Auth: Nenhum usuário logado.");
            updateUserUI(null);
            if (onLogout) onLogout();
        }
    });

    setupButtons();
}

function setupButtons() {
    const btnGoogle = document.getElementById('btn-login-google');
    const btnLogout = document.getElementById('btn-logout');
    const btnOpen = document.getElementById('btn-open-login');
    const btnClose = document.getElementById('btn-close-login');
    const modal = document.getElementById('login-modal');

    // Botão de Login (ESTRATÉGIA HÍBRIDA)
    if (btnGoogle) {
        btnGoogle.onclick = async () => {
            console.log("🖱️ Auth: Botão Login Clicado.");
            try {
                // Tenta POPUP primeiro (Mais rápido e fluido)
                console.log("🚀 Auth: Tentando Popup...");
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.warn("⚠️ Auth: Popup falhou (provavelmente bloqueado). Tentando Redirect...", error.code);
                
                // Se der erro de Cross-Origin ou Popup Blocked, tenta REDIRECT
                if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.message.includes('Cross-Origin')) {
                    try {
                        await signInWithRedirect(auth, provider);
                    } catch (redirectError) {
                        console.error("❌ Auth: Redirect também falhou.", redirectError);
                        showToast("Não foi possível fazer login.", "error");
                    }
                } else {
                    console.error("❌ Auth: Erro desconhecido no login.", error);
                    showToast("Erro de autenticação: " + error.code, "error");
                }
            }
        };
    }

    // Botão Logout
    if(btnLogout) {
        btnLogout.onclick = async () => {
            if(confirm("Deseja realmente sair?")) {
                await signOut(auth);
                window.location.reload();
            }
        };
    }

    // Abrir Modal
    if(btnOpen) btnOpen.onclick = () => {
        if(modal) modal.classList.remove('hidden');
    };

    // Fechar Modal
    if(btnClose) btnClose.onclick = () => {
        if(modal) modal.classList.add('hidden');
    };
}

function updateUserUI(user) {
    const label = document.getElementById('user-role-label');
    const display = document.getElementById('userIdDisplay');
    const btnLogin = document.getElementById('btn-open-login');
    const btnLogout = document.getElementById('btn-logout');
    const profileTab = document.querySelector('a[data-page="perfil"]');
    
    // Atualiza nome e foto no perfil se existirem
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profilePic = document.getElementById('profile-pic');

    if (user) {
        // UI Logado
        if(label) label.innerText = user.displayName ? user.displayName.split(' ')[0] : "Usuário";
        if(display) display.innerText = "Logado";
        if(btnLogin) btnLogin.classList.add('hidden');
        if(btnLogout) btnLogout.classList.remove('hidden');
        if(profileTab) profileTab.classList.remove('hidden');

        // Preenche aba Perfil
        if(profileName) profileName.innerText = user.displayName || "Usuário";
        if(profileEmail) profileEmail.innerText = user.email;
        if(profilePic && user.photoURL) profilePic.src = user.photoURL;

    } else {
        // UI Deslogado
        if(label) label.innerText = "Entrar";
        if(display) display.innerText = "Anônimo";
        if(btnLogin) btnLogin.classList.remove('hidden');
        if(btnLogout) btnLogout.classList.add('hidden');
        if(profileTab) profileTab.classList.add('hidden');
    }
}