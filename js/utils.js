/**
 * ARQUIVO: js/utils.js
 * DESCRIÇÃO: Funções utilitárias globais (Toast, Modais, Binds).
 */

// Helper para evitar erros se o elemento não existir
export function safeBind(id, event, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
}

// Sistema de Toast (Notificação)
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = type === 'error' ? 'bg-rose-600' : (type === 'info' ? 'bg-blue-600' : 'bg-emerald-600');
    
    toast.className = `${colors} text-white px-6 py-3 rounded-lg shadow-xl mb-3 flex items-center gap-3 transform transition-all duration-300 translate-x-full opacity-0 max-w-sm`;
    toast.innerHTML = `
        <span class="font-bold text-sm">${message}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- MODAL DE CONFIRMAÇÃO ---
let confirmCallback = null;

export function openConfirmModal(title, desc, onConfirm) {
    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('modal-confirm-title');
    const descEl = document.getElementById('modal-confirm-desc');

    if (modal && titleEl && descEl) {
        titleEl.innerText = title;
        descEl.innerText = desc;
        confirmCallback = onConfirm;
        modal.classList.remove('hidden');
    } else {
        console.error("Erro: Modal de confirmação não encontrado no HTML.");
    }
}

export function closeConfirmModal() {
    const modal = document.getElementById('modal-confirm');
    if (modal) modal.classList.add('hidden');
    confirmCallback = null;
}

document.addEventListener('DOMContentLoaded', () => {
    safeBind('btn-confirm-no', 'click', closeConfirmModal);
    
    safeBind('btn-confirm-yes', 'click', () => {
        if (confirmCallback) confirmCallback();
    });
});