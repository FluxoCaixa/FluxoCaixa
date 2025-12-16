/**
 * ARQUIVO: js/config.js
 * DESCRIÇÃO: Configuração do Firebase (Firestore + Auth).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// ⚠️ SUBSTITUA PELAS SUAS CHAVES DO FIREBASE CONSOLE ⚠️
const firebaseConfig = {
  apiKey: "AIzaSyAB18o2ZfghwCzKNq3mGRBegr9ciiv9wGQ",
  authDomain: "fluxocaixa-1e151.firebaseapp.com",
  projectId: "fluxocaixa-1e151",
  storageBucket: "fluxocaixa-1e151.firebasestorage.app",
  messagingSenderId: "1069184395564",
  appId: "1:1069184395564:web:f5faedcc28c72d00ec6489"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);

// Inicializa Serviços
const db = getFirestore(app);
const auth = getAuth(app); // Serviço de Autenticação
const provider = new GoogleAuthProvider(); // Provedor Google

// Referência da Coleção (Nome da tabela no banco)
const collectionRef = collection(db, "transacoes");

export { db, auth, provider, collectionRef };