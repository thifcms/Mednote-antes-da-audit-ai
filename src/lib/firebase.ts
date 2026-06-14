import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent cache for Offline-First behavior
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, (firebaseConfig as any).firestoreDatabaseId);

export const auth = getAuth(app);

// Test connection on boot
import { doc, getDocFromServer } from 'firebase/firestore';

async function testConnection() {
  try {
    // Only test if we have a config (prevents crash if firebase-applet-config is empty/placeholder)
    if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
      await getDocFromServer(doc(db, '_connection_test_', 'check'));
      console.log("Conexão com Firebase bem-sucedida");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore operando em modo OFFLINE (ideal para uso sem internet).");
    } else {
      console.error("Falha na verificação de configuração do Firebase:", error);
    }
  }
}

testConnection();
