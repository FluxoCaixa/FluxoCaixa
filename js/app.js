/**
 * ARQUIVO: js/app.js
 * DESCRIÇÃO: Orquestrador da Aplicação + Controle de Privacidade.
 */
import { initAuth } from './modules/auth.js';
import { initDashboard } from './modules/dashboard.js';
import { initCalendar } from './modules/calendar.js';
import { initFinanceModule, stopFinanceListener } from './modules/finance.js';
import { db, collectionRef } from './config.js'; 

// PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('PWA: OK'))
            .catch(err => console.error('PWA: Erro', err));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    
    // Inicializa Componentes
    initDashboard();
    initCalendar();

    // --- LÓGICA DE PRIVACIDADE (NOVO) ---
    const btnPrivacy = document.getElementById('btn-privacy-toggle');
    
    if (btnPrivacy) {
        btnPrivacy.addEventListener('click', (e) => {
            e.preventDefault(); // Evita reload se for link
            document.body.classList.toggle('privacy-active');
            
            // Alterna ícones (Olho Aberto / Fechado)
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

    // --- AUTENTICAÇÃO E CARREGAMENTO ---
    initAuth(
        // Sucesso Login
        (user) => {
            console.log("App: Usuário autorizado.");
            if (db && collectionRef) {
                initFinanceModule(db, collectionRef);
            }
        },
        // Logout
        () => {
            console.log("App: Logout.");
            stopFinanceListener();
        }
    );

    // Navegação SPA
    const links = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.dataset.page;
            pages.forEach(p => p.classList.add('hidden'));
            pages.forEach(p => p.classList.remove('active'));
            
            const pageEl = document.getElementById(targetPage);
            if(pageEl) {
                pageEl.classList.remove('hidden');
                pageEl.classList.add('active');
            }
        });
    });
});