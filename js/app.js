/**
 * ARQUIVO: js/app.js
 * DESCRIÇÃO: Orquestrador com suporte a Múltiplos Contextos (Pessoal/Família).
 */
import { initAuth } from './modules/auth.js';
import { initDashboard } from './modules/dashboard.js';
import { initCalendar } from './modules/calendar.js';
import { initFinanceModule, stopFinanceListener } from './modules/finance.js';
import { initProfile } from './modules/profile.js'; // Novo
import { db } from './config.js';
import { collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log('PWA: OK'))
            .catch(err => console.error('PWA:', err));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    
    // Inicializa UI Básica
    initDashboard();
    initCalendar();
    setupPrivacyToggle();
    setupNavigation();

    // --- AUTENTICAÇÃO ---
    initAuth(
        (user) => {
            console.log("Usuário logado:", user.email);
            
            if (db) {
                // 1. Inicializa o Módulo de Perfil
                // Passamos uma função de callback: quando o usuário trocar de conta lá no perfil,
                // essa função aqui roda e troca o banco de dados.
                initProfile(user, (newPath) => {
                    changeDatabaseContext(newPath);
                });

                // 2. Define qual banco abrir inicialmente
                const lastPath = localStorage.getItem('last_context_path');
                const defaultPath = `users/${user.uid}/transactions`; // Padrão: Pessoal
                
                // Se tiver salvo, usa. Se não, usa o pessoal.
                changeDatabaseContext(lastPath || defaultPath);
            }
        },
        () => {
            console.log("Logout.");
            stopFinanceListener();
        }
    );
});

/**
 * Função que reinicia o módulo financeiro com um novo caminho
 */
function changeDatabaseContext(collectionPath) {
    console.log(`🔌 Conectando contexto: ${collectionPath}`);
    
    // 1. Para os listeners antigos (Dashboard, Calendário, Tabela)
    stopFinanceListener();

    // 2. Conecta no novo caminho
    const colRef = collection(db, collectionPath);
    initFinanceModule(db, colRef);
}

// --- Funções Auxiliares de UI ---

function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.dataset.page;
            
            // Troca de aba
            pages.forEach(p => p.classList.add('hidden'));
            pages.forEach(p => p.classList.remove('active'));
            
            const pageEl = document.getElementById(targetPage);
            if(pageEl) {
                pageEl.classList.remove('hidden');
                pageEl.classList.add('active');
            }

            // Fecha menu mobile se estiver aberto (opcional, bom pra UX)
            // ...
        });
    });
}

function setupPrivacyToggle() {
    const btnPrivacy = document.getElementById('btn-privacy-toggle');
    if (btnPrivacy) {
        btnPrivacy.addEventListener('click', (e) => {
            e.preventDefault();
            document.body.classList.toggle('privacy-active');
            
            const eyeOpen = document.getElementById('icon-eye-open');
            const eyeClosed = document.getElementById('icon-eye-closed');
            
            if (document.body.classList.contains('privacy-active')) {
                if(eyeOpen) eyeOpen.classList.add('hidden');
                if(eyeClosed) eyeClosed.classList.remove('hidden');
            } else {
                if(eyeOpen) eyeOpen.classList.remove('hidden');
                if(eyeClosed) eyeClosed.classList.add('hidden');
            }
        });
    }
}