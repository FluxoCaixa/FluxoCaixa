/**
 * ARQUIVO: js/config.js
 * DESCRIÇÃO: Configuração Central do Firebase
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Suas chaves do projeto 'fluxocaixa-1e151'
const firebaseConfig = {
  apiKey: "AIzaSyAB18o2ZfghwCzKNq3mGRBegr9ciiv9wGQ",
  authDomain: "fluxocaixa-1e151.firebaseapp.com",
  projectId: "fluxocaixa-1e151",
  storageBucket: "fluxocaixa-1e151.firebasestorage.app",
  messagingSenderId: "1069184395564",
  appId: "1:1069184395564:web:f5faedcc28c72d00ec6489"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// EXPORTAÇÃO CORRIGIDA:
// Exportamos 'app' (para o auth.js usar) e 'db' (para o banco de dados)
export { app, db };