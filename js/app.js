/**
 * ARQUIVO: js/app.js
 * DESCRIÇÃO: Orquestrador com Menu Mobile Corrigido.
 */
import { initAuth } from './modules/auth.js';
import { initDashboard } from './modules/dashboard.js';
import { initCalendar } from './modules/calendar.js';
import { initFinanceModule, stopFinanceListener } from './modules/finance.js';
import { initProfile } from './modules/profile.js';
import { db } from './config.js';
import { collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log('PWA: OK'))
            .catch(err => console.error('PWA:', err));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    initCalendar();
    setupPrivacyToggle();
    setupNavigation(); // Menu Mobile aqui dentro
    
    // --- AUTENTICAÇÃO ---
    initAuth(
        (user) => {
            console.log("Usuário logado:", user.email);
            if (db) {
                initProfile(user, (newPath) => { changeDatabaseContext(newPath); });
                const lastPath = localStorage.getItem('last_context_path');
                const defaultPath = `users/${user.uid}/transactions`;
                changeDatabaseContext(lastPath || defaultPath);
            }
        },
        () => {
            console.log("Logout.");
            stopFinanceListener();
        }
    );
});

function changeDatabaseContext(collectionPath) {
    console.log(`🔌 Conectando: ${collectionPath}`);
    stopFinanceListener();
    const colRef = collection(db, collectionPath);
    
    initFinanceModule(db, colRef);
    initCalendar(db, colRef); // <--- AGORA O CALENDÁRIO RECEBE O BANCO
}

// --- FUNÇÕES DE UI (MENU E NAVEGAÇÃO) ---

function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');
    const sidebar = document.getElementById('sidebar');
    const btnMobile = document.getElementById('btn-mobile-menu');

    // Toggle do Menu Mobile (Botão Hambúrguer)
    if(btnMobile && sidebar) {
        btnMobile.addEventListener('click', () => {
            // Alterna a altura entre 72px (fechado) e h-screen (aberto)
            if (sidebar.classList.contains('h-[72px]')) {
                sidebar.classList.remove('h-[72px]');
                // Usa 'fixed' e 'z-50' para garantir que fique por cima e não role junto com a página
                sidebar.classList.add('h-screen', 'fixed', 'top-0', 'left-0', 'w-full', 'bg-slate-950', 'z-50');
            } else {
                sidebar.classList.add('h-[72px]');
                sidebar.classList.remove('h-screen', 'fixed', 'top-0', 'left-0', 'w-full', 'bg-slate-950', 'z-50');
            }
        });
    }

    // Clique nos Links
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.dataset.page;
            
            // Troca de página
            pages.forEach(p => p.classList.add('hidden'));
            pages.forEach(p => p.classList.remove('active'));
            
            const pageEl = document.getElementById(targetPage);
            if(pageEl) {
                pageEl.classList.remove('hidden');
                pageEl.classList.add('active');
            }

            // Fecha o menu mobile automaticamente ao clicar
            if (window.innerWidth < 768 && sidebar) {
                sidebar.classList.add('h-[72px]');
                sidebar.classList.remove('h-screen', 'absolute', 'top-0', 'left-0', 'w-full', 'bg-slate-950');
            }
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