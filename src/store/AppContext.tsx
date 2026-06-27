import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { 
  collection, 
  getDocs,
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  getDocFromServer,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { dbLocal, loadAllLocalData, saveAllLocalData, migrateFromLocalStorageIfNeeded } from '../services/db';

export type Invoice = {
  id: string;
  date: string;
  originalPayerName: string;
  mappedPayerId?: string;
  amount: number;
  description: string;
  year: number;
  month: number;
  noteNumber: string;
  emissionDayMonth: string;
  grossAmount: number;
  netAmount: number;
  createdAt: string;
  userId: string;
  aiSourceHash?: string;
};

export type Payment = {
  id: string;
  date: string;
  amount: number;
  description: string;
  createdAt: string;
  userId: string;
};

export type PayerMapping = {
  id: string;
  customName: string;
  aliases: string[];
  userId: string;
};

export type Hospital = {
  id: string;
  name: string;
  userId: string;
};

export type Surgery = {
  id: string;
  date: string;
  hospitalId: string;
  patientName: string;
  procedure: string;
  indication: string;
  insurance: string;
  attendance: string;
  company: string;
  feesPaid: number;
  receivedAmount: number;
  notes: string;
  isParticular?: boolean;
  particularValue?: number;
  photos?: string[];
  createdAt: string;
  userId: string;
  aiSourceHash?: string;
};

export type ElectiveSurgery = {
  id: string;
  date: string;
  hospitalId: string;
  patientName: string;
  procedure: string;
  isParticular?: boolean;
  particularValue?: number;
  createdAt: string;
  userId: string;
  aiSourceHash?: string;
};

export type CancelledSurgery = {
  id: string;
  date: string;
  hospitalId: string;
  patientName: string;
  procedure: string;
  isParticular?: boolean;
  particularValue?: number;
  createdAt: string;
  userId: string;
  aiSourceHash?: string;
  cancellationReason: 'Desistência do Paciente' | 'Procedimento Negado pela Operadora';
  cancelledAt: string;
};

export type SurgeryTemplate = {
  id: string;
  diagnosis: string;
  procedure: string;
  createdAt: string;
  userId: string;
};

export interface AppData {
  invoices: Invoice[];
  payers: PayerMapping[];
  hospitals: Hospital[];
  surgeries: Surgery[];
  electiveSurgeries: ElectiveSurgery[];
  cancelledSurgeries: CancelledSurgery[];
  payments: Payment[];
  taxPercentage: number;
  appPassword?: string;
  remainingCompanyValue?: number;
  surgery_templates: SurgeryTemplate[];
}

const defaultData: AppData = {
  invoices: [],
  payers: [],
  hospitals: [],
  surgeries: [],
  electiveSurgeries: [],
  cancelledSurgeries: [],
  payments: [],
  taxPercentage: 0,
  appPassword: '1234',
  remainingCompanyValue: 0,
  surgery_templates: [],
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface AppContextType {
  data: AppData;
  user: User | null;
  loading: boolean;
  isOffline: boolean;
  isSyncing: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success';
  lastSynced: string | null;
  cloudBackupEnabled: boolean;
  setCloudBackupEnabled: (enabled: boolean) => void;
  signIn: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  
  addInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt' | 'userId'> & { id?: string }) => Promise<void>;
  updateInvoice: (id: string, invoice: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  
  addPayer: (payer: Omit<PayerMapping, 'id' | 'userId'> & { id?: string }) => Promise<void>;
  updatePayer: (id: string, payer: Partial<PayerMapping>) => Promise<void>;
  deletePayer: (id: string) => Promise<void>;
  
  addHospital: (hospital: Omit<Hospital, 'id' | 'userId'> & { id?: string }) => Promise<void>;
  updateHospital: (id: string, hospital: Partial<Hospital>) => Promise<void>;
  deleteHospital: (id: string) => Promise<void>;
  
  addSurgery: (surgery: Omit<Surgery, 'id' | 'createdAt' | 'userId'> & { id?: string }) => Promise<void>;
  updateSurgery: (id: string, surgery: Partial<Surgery>) => Promise<void>;
  deleteSurgery: (id: string) => Promise<void>;

  updateAppPassword: (newPassword: string) => Promise<void>;

  addElectiveSurgery: (surgery: Omit<ElectiveSurgery, 'id' | 'createdAt' | 'userId'> & { id?: string }) => Promise<void>;
  updateElectiveSurgery: (id: string, surgery: Partial<ElectiveSurgery>) => Promise<void>;
  deleteElectiveSurgery: (id: string) => Promise<void>;
  cancelElectiveSurgery: (id: string, reason: string) => Promise<void>;
  deleteCancelledSurgery: (id: string) => Promise<void>;

  addPayment: (payment: Omit<Payment, 'id' | 'createdAt' | 'userId'> & { id?: string }) => Promise<void>;
  updatePayment: (id: string, payment: Partial<Payment>) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;

  addSurgeryTemplate: (template: Omit<SurgeryTemplate, 'id' | 'createdAt' | 'userId'> & { id?: string }) => Promise<void>;
  deleteSurgeryTemplate: (id: string) => Promise<void>;

  deleteSurgeries: (ids: string[]) => Promise<void>;
  deleteElectiveSurgeries: (ids: string[]) => Promise<void>;
  deleteHospitals: (ids: string[]) => Promise<void>;
  deletePayers: (ids: string[]) => Promise<void>;
  deleteInvoices: (ids: string[]) => Promise<void>;
  deletePayments: (ids: string[]) => Promise<void>;
  deleteAllInvoices: () => Promise<void>;
  deleteAllSurgeries: () => Promise<void>;
  deleteAllElectiveSurgeries: () => Promise<void>;
  deleteAllHospitals: () => Promise<void>;
  deleteAllData: () => Promise<void>;

  updateTaxPercentage: (percentage: number) => Promise<void>;
  updateRemainingCompanyValue: (value: number) => Promise<void>;
  exportBackup: () => void;
  importBackup: (backupData: string) => Promise<void>;
  exportToExcel: () => void;
  syncDataToDrive: (forceManual?: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Don't throw to prevent complete app crash
  // throw new Error(JSON.stringify(errInfo));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData);
  const [isDbInitialized, setIsDbInitialized] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Carga e migração de dados locais (localStorage -> Dexie IndexedDB)
  useEffect(() => {
    async function initLocalData() {
      try {
        const migratedData = await migrateFromLocalStorageIfNeeded(defaultData);
        if (migratedData) {
          setData(migratedData);
          setIsDbInitialized(true);
          return;
        }

        const localData = await loadAllLocalData(defaultData);
        setData(localData);
        setIsDbInitialized(true);
      } catch (e) {
        console.error("Erro na inicialização de IndexedDB ou migração local:", e);
        setIsDbInitialized(true);
      }
    }

    initLocalData();
  }, []);

  // Fila de sincronização offline-first persistida localmente (Fila Resiliente)
  const [syncQueue, setSyncQueue] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('local_sync_queue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const syncQueueRef = useRef(syncQueue);

  useEffect(() => {
    localStorage.setItem('local_sync_queue', JSON.stringify(syncQueue));
    syncQueueRef.current = syncQueue;
  }, [syncQueue]);

  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('drive_access_token'));
  const [onedriveToken, setOnedriveToken] = useState<string | null>(sessionStorage.getItem('onedrive_access_token'));
  const [onedriveRefreshToken, setOnedriveRefreshToken] = useState<string | null>(localStorage.getItem('onedrive_refresh_token'));
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(localStorage.getItem('last_synced'));
  const [cloudBackupEnabled, setCloudBackupEnabled] = useState<boolean>(localStorage.getItem('cloud_backup_enabled') === 'true');

  useEffect(() => {
    if (accessToken) {
      sessionStorage.setItem('drive_access_token', accessToken);
    } else {
      sessionStorage.removeItem('drive_access_token');
    }
  }, [accessToken]);

  useEffect(() => {
    localStorage.setItem('cloud_backup_enabled', String(cloudBackupEnabled));
  }, [cloudBackupEnabled]);

  useEffect(() => {
    if (lastSynced) {
      localStorage.setItem('last_synced', lastSynced);
    }
  }, [lastSynced]);

  useEffect(() => {
    if (isDbInitialized) {
      saveAllLocalData(data);
    }
  }, [data, isDbInitialized]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Processamento automático de fila ao voltar online ou ao sofrer mutação
  useEffect(() => {
    if (!isOffline && syncQueue.length > 0 && user) {
      const timer = setTimeout(() => {
        processSyncQueue();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOffline, syncQueue.length, user]);

  const processSyncQueue = async () => {
    if (!auth.currentUser || !navigator.onLine || isProcessingQueue || syncQueue.length === 0) return;
    setIsProcessingQueue(true);
    const uid = auth.currentUser.uid;
    const currentQueue = [...syncQueue];
    let completedCount = 0;

    for (const item of currentQueue) {
      if (!navigator.onLine) break;
      try {
        if (item.action === 'create' || item.action === 'update') {
          await setDoc(doc(db, 'users', uid, item.collection, item.docId), {
            ...item.payload,
            userId: uid,
          }, { merge: true });
        } else if (item.action === 'delete') {
          await deleteDoc(doc(db, 'users', uid, item.collection, item.docId));
        }
        completedCount++;
      } catch (err: any) {
        if (err.message && (err.message.includes('permission') || err.message.includes('unauthorized'))) {
          // Erro de segurança permanente, remove da fila para não travá-la
          console.error("Fila: sem permissão para item, pulando.", item);
          console.error("Detalhes do erro:", err.message);
          toast.error(`Falha de segurança ao sincronizar com servidor: ${err.message}`);
          completedCount++;
        } else {
          // Erro temporário de rede, para processamento para tentar mais tarde mantendo a ordem
          console.warn("Fila: instabilidade de rede temporária na fila, reagendando.", err);
          toast.error(`Erro de rede ao sincronizar: ${err.message}`);
          break;
        }
      }
    }

    if (completedCount > 0) {
      setSyncQueue(prev => {
        const nextQueue = prev.slice(completedCount);
        if (nextQueue.length === 0) {
          toast.success("Sincronização offline concluída com a nuvem!");
        }
        return nextQueue;
      });
    }
    setIsProcessingQueue(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setData(defaultData);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'users', user.uid));
      } catch (error) {
        if (error instanceof Error && !error.message.includes('the client is offline')) {
           console.warn("Dificuldade ao contatar o servidor Firebase. Trabalhando em modo cache:", error.message);
        }
      }
    };
    testConnection();

    const unsubSettings = onSnapshot(doc(db, 'users', user.uid), { includeMetadataChanges: true }, (snap) => {
      if (snap.exists()) {
        setData(prev => ({ 
          ...prev, 
          taxPercentage: snap.data().taxPercentage || 0, 
          appPassword: snap.data().appPassword || '1234',
          remainingCompanyValue: snap.data().remainingCompanyValue || 0
        }));
      }
    }, (err) => {
      if (err.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      } else {
        console.warn("Erro no snapshot de configurações (offline):", err);
      }
      setLoading(false); // Ensure loading completes
    });

    const collections = [
      { name: 'invoices', key: 'invoices' },
      { name: 'payers', key: 'payers' },
      { name: 'hospitals', key: 'hospitals' },
      { name: 'surgeries', key: 'surgeries' },
      { name: 'electiveSurgeries', key: 'electiveSurgeries' },
      { name: 'cancelledSurgeries', key: 'cancelledSurgeries' },
      { name: 'payments', key: 'payments' },
      { name: 'surgery_templates', key: 'surgery_templates' },
    ];

    const unsubs = collections.map(col => 
      onSnapshot(collection(db, 'users', user.uid, col.name), { includeMetadataChanges: true }, (snap) => {
        setIsSyncing(snap.metadata.hasPendingWrites || syncQueueRef.current.some(q => q.collection === col.name));
        const cloudItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        if (col.name === 'surgeries') {
          console.log("-> onSnapshot fired for surgeries:", {
            hasPendingWrites: snap.metadata.hasPendingWrites,
            fromCache: snap.metadata.fromCache,
            queueLength: syncQueueRef.current.length,
            sample: cloudItems[0]
          });
        }

        setData(prev => {
          const merged = [...cloudItems];
          const colQueue = syncQueueRef.current.filter(q => q.collection === col.name);
          colQueue.forEach(item => {
            if (item.action === 'create' || item.action === 'update') {
              const idx = merged.findIndex(x => x.id === item.docId);
              if (idx >= 0) {
                merged[idx] = { ...merged[idx], ...item.payload };
              } else {
                merged.push({ id: item.docId, ...item.payload });
              }
            } else if (item.action === 'delete') {
              const idx = merged.findIndex(x => x.id === item.docId);
              if (idx >= 0) {
                merged.splice(idx, 1);
              }
            }
          });
          return { ...prev, [col.key]: merged };
        });
        setLoading(false);
      }, (err) => {
        if (err.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/${col.name}`);
        } else {
          console.warn(`Erro no snapshot de ${col.name} (provavelmente offline):`, err);
          setLoading(false);
        }
      })
    );

    return () => {
      unsubSettings();
      unsubs.forEach(unsub => unsub());
    };
  }, [user]);

  const signIn = async () => {
    return signInWithGoogle();
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setCloudBackupEnabled(true);
      }
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
          console.warn("Autenticação cancelada pelo usuário.");
          return;
      }
      console.error("Erro na autenticação:", err);
      throw err;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
  };

  const addEntity = async (col: string, item: any) => {
    if (!user) return;
    const sId = item.id || crypto.randomUUID();
    const { id: _, ...dataToSave } = item;
    const finalItem = {
      ...dataToSave,
      id: sId,
      userId: user.uid,
      createdAt: item.createdAt || new Date().toISOString()
    };

    // Atualiza o estado da UI de forma síncrona/instantânea
    setData(prev => {
      const list = (prev as any)[col] || [];
      const idx = list.findIndex((x: any) => x.id === sId);
      const copy = [...list];
      if (idx >= 0) {
        copy[idx] = finalItem;
      } else {
        copy.push(finalItem);
      }
      return { ...prev, [col]: copy };
    });

    // Enfileira
    setSyncQueue(prev => [...prev, {
      id: crypto.randomUUID(),
      collection: col,
      docId: sId,
      action: 'create',
      payload: finalItem
    }]);
  };

  const updateEntity = async (col: string, id: string, updates: any) => {
    if (!user) return;

    // Detect if manual edit changed any originally extracted fields for Audit AI feedback loop
    try {
      const list = (data as any)[col] || [];
      const existingRecord = list.find((x: any) => x.id === id);
      if (existingRecord && existingRecord.aiSourceHash) {
        let hasChanged = false;
        const fieldsToTrack: { [key: string]: string[] } = {
          surgeries: ['patientName', 'attendance', 'insurance', 'hospitalId', 'feesPaid', 'receivedAmount', 'procedure', 'company', 'date'],
          electiveSurgeries: ['patientName', 'hospitalId', 'procedure', 'particularValue', 'date'],
          invoices: ['date', 'originalPayerName', 'amount', 'netAmount', 'noteNumber', 'cnpj', 'description']
        };

        const track = fieldsToTrack[col];
        if (track) {
          for (const field of track) {
            if (updates[field] !== undefined && String(updates[field]) !== String(existingRecord[field] || '')) {
              hasChanged = true;
              break;
            }
          }
        }

        if (hasChanged) {
          fetch('https://audit-ai-6wed.onrender.com/api/learned-examples/mark-corrected', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_hash: existingRecord.aiSourceHash })
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('Erro ao verificar correções para Audit AI:', e);
    }

    // Atualiza o estado da UI de forma síncrona/instantânea
    setData(prev => {
      const list = (prev as any)[col] || [];
      const copy = list.map((x: any) => x.id === id ? { ...x, ...updates } : x);
      return { ...prev, [col]: copy };
    });

    // Enfileira
    setSyncQueue(prev => [...prev, {
      id: crypto.randomUUID(),
      collection: col,
      docId: id,
      action: 'update',
      payload: updates
    }]);
  };

  const deleteEntity = async (col: string, id: string) => {
    if (!user) return;

    // Atualiza o estado da UI de forma síncrona/instantânea
    setData(prev => {
      const list = (prev as any)[col] || [];
      const copy = list.filter((x: any) => x.id !== id);
      return { ...prev, [col]: copy };
    });

    // Enfileira
    setSyncQueue(prev => [...prev, {
      id: crypto.randomUUID(),
      collection: col,
      docId: id,
      action: 'delete',
      payload: {}
    }]);
  };

  const addInvoice = (invoice: any) => addEntity('invoices', invoice);
  const updateInvoice = (id: string, updates: any) => updateEntity('invoices', id, updates);
  const deleteInvoice = (id: string) => deleteEntity('invoices', id);

  const addPayer = (payer: any) => addEntity('payers', payer);
  const updatePayer = (id: string, updates: any) => updateEntity('payers', id, updates);
  const deletePayer = (id: string) => deleteEntity('payers', id);

  const addHospital = (hospital: any) => addEntity('hospitals', hospital);
  const updateHospital = (id: string, updates: any) => updateEntity('hospitals', id, updates);
  const deleteHospital = (id: string) => deleteEntity('hospitals', id);

  const addSurgery = (surgery: any) => addEntity('surgeries', surgery);
  const updateSurgery = (id: string, updates: any) => updateEntity('surgeries', id, updates);
  const deleteSurgery = (id: string) => deleteEntity('surgeries', id);

  const addElectiveSurgery = (surgery: any) => addEntity('electiveSurgeries', surgery);
  const updateElectiveSurgery = (id: string, updates: any) => updateEntity('electiveSurgeries', id, updates);
  const deleteElectiveSurgery = (id: string) => deleteEntity('electiveSurgeries', id);

  const cancelElectiveSurgery = async (id: string, reason: string) => {
    if (!user) return;
    
    // Acha a cirurgia eletiva correspondente pelo id no estado atual
    const original = data.electiveSurgeries.find(s => s.id === id);
    if (!original) {
      toast.error("Cirurgia eletiva não encontrada.");
      return;
    }

    const cancelledRecord: CancelledSurgery = {
      ...original,
      cancellationReason: reason as any,
      cancelledAt: new Date().toISOString()
    };

    // 1. Atualizar o estado em memória de forma síncrona
    setData(prev => {
      const listElective = prev.electiveSurgeries || [];
      const listCancelled = prev.cancelledSurgeries || [];
      return {
        ...prev,
        electiveSurgeries: listElective.filter(s => s.id !== id),
        cancelledSurgeries: [...listCancelled, cancelledRecord]
      };
    });

    // 2. Enfileirar deleção da original e criação da cancelada no syncQueue
    setSyncQueue(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        collection: 'electiveSurgeries',
        docId: id,
        action: 'delete',
        payload: {}
      },
      {
        id: crypto.randomUUID(),
        collection: 'cancelledSurgeries',
        docId: cancelledRecord.id,
        action: 'create',
        payload: cancelledRecord
      }
    ]);

    toast.success("Cirurgia eletiva cancelada com sucesso!");
  };

  const deleteCancelledSurgery = async (id: string) => {
    if (!user) return;

    // 1. Atualizar o estado em memória
    setData(prev => {
      const list = prev.cancelledSurgeries || [];
      return {
        ...prev,
        cancelledSurgeries: list.filter(s => s.id !== id)
      };
    });

    // 2. Enfileirar deleção no syncQueue
    setSyncQueue(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        collection: 'cancelledSurgeries',
        docId: id,
        action: 'delete',
        payload: {}
      }
    ]);

    toast.success("Registro de cancelamento excluído!");
  };

  const addPayment = (payment: any) => addEntity('payments', payment);
  const updatePayment = (id: string, updates: any) => updateEntity('payments', id, updates);
  const deletePayment = (id: string) => deleteEntity('payments', id);

  const addSurgeryTemplate = (template: any) => addEntity('surgery_templates', template);
  const deleteSurgeryTemplate = (id: string) => deleteEntity('surgery_templates', id);

  const deleteMultiple = async (col: string, ids: string[]) => {
    if (!user || ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = ids.slice(i, i + 500);
        chunk.forEach(id => batch.delete(doc(db, 'users', user.uid, col, id)));
        await batch.commit();
    }
  };

  const deleteSurgeries = (ids: string[]) => deleteMultiple('surgeries', ids);
  const deleteElectiveSurgeries = (ids: string[]) => deleteMultiple('electiveSurgeries', ids);
  const deleteHospitals = (ids: string[]) => deleteMultiple('hospitals', ids);
  const deletePayers = (ids: string[]) => deleteMultiple('payers', ids);
  const deleteInvoices = (ids: string[]) => deleteMultiple('invoices', ids);
  const deletePayments = (ids: string[]) => deleteMultiple('payments', ids);

  const deleteAllSurgeries = async () => {
    if (!user) return;
    const col = 'surgeries';
    const q = collection(db, 'users', user.uid, col);
    const snapshot = await getDocs(q);
    const allDocsToDelete = snapshot.docs.map(doc => doc.ref);

    for (let i = 0; i < allDocsToDelete.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = allDocsToDelete.slice(i, i + 500);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
    }
  };

  const deleteAllElectiveSurgeries = async () => {
    if (!user) return;
    const col = 'electiveSurgeries';
    const q = collection(db, 'users', user.uid, col);
    const snapshot = await getDocs(q);
    const allDocsToDelete = snapshot.docs.map(doc => doc.ref);

    for (let i = 0; i < allDocsToDelete.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = allDocsToDelete.slice(i, i + 500);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
    }
  };

  const deleteAllHospitals = async () => {
    if (!user) return;
    const q = collection(db, 'users', user.uid, 'hospitals');
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  };

  const deleteAllInvoices = async () => {
    if (!user) return;
    const col = 'invoices';
    
    const q = collection(db, 'users', user.uid, col);
    const snapshot = await getDocs(q);
    const allDocsToDelete = snapshot.docs.map(doc => doc.ref);

    // Batch in 500
    for (let i = 0; i < allDocsToDelete.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = allDocsToDelete.slice(i, i + 500);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
    }
  };

  const deleteAllData = async () => {
    if (!user) return;
    const collections = ['invoices', 'payers', 'hospitals', 'surgeries', 'electiveSurgeries', 'payments'];
    
    const allDocsToDelete: any[] = [];
    for (const col of collections) {
      const q = collection(db, 'users', user.uid, col);
      const snapshot = await getDocs(q);
      snapshot.docs.forEach(doc => allDocsToDelete.push(doc.ref));
    }

    // Batch in 500
    for (let i = 0; i < allDocsToDelete.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = allDocsToDelete.slice(i, i + 500);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
    }                
    
    setData(defaultData);
  };

  const updateTaxPercentage = async (percentage: number) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { taxPercentage: percentage }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const updateAppPassword = async (newPassword: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { appPassword: newPassword }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const updateRemainingCompanyValue = async (value: number) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { remainingCompanyValue: value }, { merge: true });
      setData(prev => ({ ...prev, remainingCompanyValue: value }));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const exportBackup = () => {
    const backup = {
      ...data,
      backupDate: new Date().toISOString(),
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_gestao_orto_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importBackup = async (backupJson: string) => {
    if (!user) return;
    try {
      const imported = JSON.parse(backupJson);
      // Validar estrutura básica
      if (!imported.surgeries && !imported.invoices) {
        throw new Error("Estrutura de backup inválida.");
      }

      // Merge data
      const batch = writeBatch(db);
      
      // Implementação simplificada: atualiza o estado local primeiro 
      // e o Firestore sincronizará se possível, 
      // ou fazemos upload manual das coleções principais.
      
      // Para segurança máxima, vamos sugerir ao Firestore adicionar o que falta
      // Mas para o usuário, o estado local já salva o dia.
      setData(prev => ({
        ...prev,
        ...imported
      }));

      return Promise.resolve();
    } catch (err) {
      console.error("Erro na importação:", err);
      throw err;
    }
  };

  const generateWorkbook = (appData: AppData) => {
    const { utils } = XLSX;
    const wb = utils.book_new();
    const usedSheetNames = new Set<string>();

    const formatToBRDate = (dateStr: string): string => {
      if (!dateStr) return 'N/A';
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        if (year.length === 4) {
          return `${day}/${month}/${year}`;
        }
      }
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}/${month}/${year}`;
        }
      } catch (e) {}
      return dateStr;
    };

    const getUniqueCleanSheetName = (preferredName: string, suffix: string): string => {
      let cleaned = preferredName.replace(/[\\/?*:[\]]/g, '').trim();
      cleaned = cleaned.replace(/^'+|'+$/g, '').trim();
      if (!cleaned) cleaned = 'Aba';
      const maxBaseLen = 31 - suffix.length;
      let base = cleaned.substring(0, maxBaseLen).trim();
      let candidate = (base + suffix).substring(0, 31);
      let counter = 1;
      while (usedSheetNames.has(candidate.toUpperCase())) {
        const countSuffix = ` (${counter})`;
        const adjustedMaxBaseLen = 31 - suffix.length - countSuffix.length;
        let adjustedBase = cleaned.substring(0, adjustedMaxBaseLen).trim();
        candidate = (adjustedBase + suffix + countSuffix).substring(0, 31);
        counter++;
      }
      usedSheetNames.add(candidate.toUpperCase());
      return candidate;
    };

    const getHospitalName = (hospitalId: string): string => {
      return appData.hospitals.find(h => h.id === hospitalId)?.name || 'Sem Hospital';
    };

    const matchPayerAndRef = (descriptionStr: string) => {
      const desc = descriptionStr || '';
      let mappedPayer = 'N/A';
      let reference = '';
      const payersList = appData.payers || [];
      const foundPayer = payersList.find(payer => {
        const mainName = (payer.customName || '').toLowerCase();
        if (!mainName) return false;
        const matchesMain = desc.toLowerCase().includes(mainName);
        const matchesAlias = (payer.aliases || []).some(alias => {
          const lowerAlias = (alias || '').toLowerCase();
          return lowerAlias && desc.toLowerCase().includes(lowerAlias);
        });
        return matchesMain || matchesAlias;
      });
      if (foundPayer) {
        mappedPayer = foundPayer.customName;
        const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const payerNameRegex = new RegExp(escapeRegExp(foundPayer.customName || ''), 'gi');
        let baseRef = desc.replace(payerNameRegex, '').trim();
        (foundPayer.aliases || []).forEach(alias => {
          if (alias) {
            const aliasRegex = new RegExp(escapeRegExp(alias), 'gi');
            baseRef = baseRef.replace(aliasRegex, '').trim();
          }
        });
        reference = baseRef || 'Mensal';
      } else {
        const parts = desc.trim().split(/\s+/);
        if (parts.length > 1) {
          mappedPayer = parts[0];
          reference = parts.slice(1).join(' ');
        } else {
          mappedPayer = desc || 'N/A';
          reference = 'Geral';
        }
      }
      return { mappedPayer, reference };
    };

    // 1. Cirurgias Realizadas — uma aba por hospital
    const setColWidths = (ws: any, headers: string[]) => {
      ws['!cols'] = headers.map(h => {
        const lowerH = h.toLowerCase();
        let w = 15; // default fallback
        
        if (
          lowerH.includes('paciente') || 
          lowerH.includes('procedimento') || 
          lowerH.includes('descrição') || 
          lowerH.includes('descricao')
        ) {
          w = 35;
        } else if (
          lowerH.includes('hospital') || 
          lowerH.includes('fonte pagadora') || 
          lowerH.includes('convênio') || 
          lowerH.includes('convenio') || 
          lowerH.includes('pagadora')
        ) {
          w = 25;
        } else if (
          lowerH.includes('data') || 
          lowerH.includes('status') || 
          lowerH.includes('referência') || 
          lowerH.includes('referencia')
        ) {
          w = 15;
        } else if (
          lowerH.includes('atendimento') || 
          lowerH.includes('nota') || 
          lowerH.includes('número') || 
          lowerH.includes('numero') || 
          lowerH.includes('nº')
        ) {
          w = 18;
        } else if (
          lowerH.includes('honorários') || 
          lowerH.includes('honorarios') || 
          lowerH.includes('recebido') || 
          lowerH.includes('bruto') || 
          lowerH.includes('líquido') || 
          lowerH.includes('liquido') || 
          lowerH.includes('valor')
        ) {
          w = 18;
        }
        return { wch: w };
      });
    };

    const realizedByHospital: Record<string, typeof appData.surgeries> = {};
    appData.surgeries.forEach(s => {
      const hospName = getHospitalName(s.hospitalId);
      if (!realizedByHospital[hospName]) {
        realizedByHospital[hospName] = [];
      }
      realizedByHospital[hospName].push(s);
    });

    const sortedRealizedHospitals = Object.keys(realizedByHospital).sort();
    sortedRealizedHospitals.forEach(hName => {
      const headers = ['Paciente', 'Nº Atendimento', 'Convênio', 'Data da Cirurgia', 'Procedimento', 'Honorários (R$)', 'Valor Recebido (R$)', 'Status'];
      const sheetData = realizedByHospital[hName].map(s => ({
        'Paciente': s.patientName || '',
        'Nº Atendimento': s.attendance || '',
        'Convênio': s.insurance || '',
        'Data da Cirurgia': formatToBRDate(s.date),
        'Procedimento': s.procedure || '',
        'Honorários (R$)': s.feesPaid || 0,
        'Valor Recebido (R$)': s.receivedAmount || 0,
        'Status': s.receivedAmount >= s.feesPaid ? 'Pago' : (s.receivedAmount > 0 ? 'Parcial' : 'Pendente')
      }));
      const ws = utils.json_to_sheet(sheetData);
      setColWidths(ws, headers);
      const cleanName = getUniqueCleanSheetName(hName, '');
      utils.book_append_sheet(wb, ws, cleanName);
    });

    // 2. Cirurgias Solicitadas — uma aba por hospital
    const requestedByHospital: Record<string, typeof appData.electiveSurgeries> = {};
    (appData.electiveSurgeries || []).forEach(s => {
      const hospName = getHospitalName(s.hospitalId);
      if (!requestedByHospital[hospName]) {
        requestedByHospital[hospName] = [];
      }
      requestedByHospital[hospName].push(s);
    });

    const sortedRequestedHospitals = Object.keys(requestedByHospital).sort();
    sortedRequestedHospitals.forEach(hName => {
      const headers = ['Paciente', 'Convênio', 'Data Solicitada', 'Procedimento', 'Hospital', 'Status'];
      const sheetData = requestedByHospital[hName].map(s => ({
        'Paciente': s.patientName || '',
        'Convênio': s.isParticular ? 'Particular' : 'CONVÊNIO',
        'Data Solicitada': formatToBRDate(s.date),
        'Procedimento': s.procedure || '',
        'Hospital': hName,
        'Status': 'Solicitada'
      }));
      const ws = utils.json_to_sheet(sheetData);
      setColWidths(ws, headers);
      const cleanName = getUniqueCleanSheetName(hName, ' (Sol.)');
      utils.book_append_sheet(wb, ws, cleanName);
    });

    // 3. Recebimentos
    const paymentsHeaders = ['Data', 'Fonte Pagadora', 'Valor', 'Descrição', 'Referência'];
    const paymentsSheetData = (appData.payments || []).map(p => {
      const { mappedPayer, reference } = matchPayerAndRef(p.description);
      return {
        'Data': formatToBRDate(p.date),
        'Fonte Pagadora': mappedPayer,
        'Valor': p.amount || 0,
        'Descrição': p.description || '',
        'Referência': reference
      };
    });
    const wsPayments = utils.json_to_sheet(paymentsSheetData);
    setColWidths(wsPayments, paymentsHeaders);
    utils.book_append_sheet(wb, wsPayments, "Recebimentos");

    // 4. Notas Fiscais
    const invoicesHeaders = ['Número da Nota', 'Data Emissão', 'Fonte Pagadora', 'Valor Bruto', 'Valor Líquido', 'Descrição'];
    const invoicesSheetData = (appData.invoices || []).map(i => ({
      'Número da Nota': i.noteNumber || '',
      'Data Emissão': formatToBRDate(i.date),
      'Fonte Pagadora': appData.payers.find(p => p.id === i.mappedPayerId)?.customName || i.originalPayerName || 'N/A',
      'Valor Bruto': i.grossAmount || 0,
      'Valor Líquido': i.netAmount || 0,
      'Descrição': i.description || ''
    }));
    const wsInvoices = utils.json_to_sheet(invoicesSheetData);
    setColWidths(wsInvoices, invoicesHeaders);
    utils.book_append_sheet(wb, wsInvoices, "Notas Fiscais");

    // 5. Resumo Geral
    const summaryHeaders = ['Hospital', 'Paciente', 'Nº Atendimento', 'Convênio', 'Data da Cirurgia', 'Procedimento', 'Honorários (R$)', 'Valor Recebido (R$)', 'Status'];
    const summarySheetData = appData.surgeries.map(s => ({
      'Hospital': getHospitalName(s.hospitalId),
      'Paciente': s.patientName || '',
      'Nº Atendimento': s.attendance || '',
      'Convênio': s.insurance || '',
      'Data da Cirurgia': formatToBRDate(s.date),
      'Procedimento': s.procedure || '',
      'Honorários (R$)': s.feesPaid || 0,
      'Valor Recebido (R$)': s.receivedAmount || 0,
      'Status': s.receivedAmount >= s.feesPaid ? 'Pago' : (s.receivedAmount > 0 ? 'Parcial' : 'Pendente')
    }));
    const wsSummary = utils.json_to_sheet(summarySheetData);
    setColWidths(wsSummary, summaryHeaders);
    utils.book_append_sheet(wb, wsSummary, "Resumo Geral");

    return wb;
  };

  const exportToExcel = () => {
    try {
      const wb = generateWorkbook(data);
      XLSX.writeFile(wb, `GESTAO_CIRURGICA_CONSOLIDADA_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Arquivo Excel gerado com sucesso! Salve-o em seu OneDrive, Dropbox ou iCloud.");
    } catch (err) {
      console.error("Erro ao exportar Excel:", err);
      toast.error("Erro ao gerar o arquivo Excel.");
    }
  };

  const syncDataToDrive = async (forceManual = false) => {
    if (!user || !cloudBackupEnabled || isOffline) return;

    if (forceManual && !accessToken) {
      await signInWithGoogle();
      return;
    }

    if (!accessToken) return;

    setSyncStatus('syncing');

    const MAX_RETRIES = 3;
    let attempt = 0;

    const performSync = async (): Promise<boolean> => {
      try {
        const wb = generateWorkbook(data);

        const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // System JSON Backup (Hidden from UI, for recovery)
        const systemJsonBlob = new Blob([JSON.stringify({ ...data, backupDate: new Date().toISOString() }, null, 2)], { type: 'application/json' });

        const searchHeaders = { Authorization: `Bearer ${accessToken}` };
        
        const uploadToDrive = async (fileName: string, blob: Blob, mimeType: string) => {
          let searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and trashed=false`, {
            headers: searchHeaders
          });
          
          if (searchRes.status === 401) { setAccessToken(null); return false; }
          const searchData = await searchRes.json();
          const existingFile = searchData.files?.[0];

          if (existingFile) {
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': mimeType },
              body: blob
            });
          } else {
            const metadata = { name: fileName, mimeType };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);
            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}` },
              body: form
            });
          }
          return true;
        };

        // Sync both files
        const excelSuccess = await uploadToDrive("GESTAO_CIRURGICA_DATABASE.xlsx", excelBlob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        if (!excelSuccess) return false;
        
        await uploadToDrive("GESTAO_CIRURGICA_BACKUP_SYSTEM.json", systemJsonBlob, 'application/json');

        setSyncStatus('success');
        setLastSynced(new Date().toISOString());
        return true;
      } catch (err) {
        console.warn(`Tentativa ${attempt + 1} falhou:`, err);
        return false;
      }
    };

    while (attempt < MAX_RETRIES) {
      const success = await performSync();
      if (success) return;
      
      attempt++;
      if (attempt < MAX_RETRIES && accessToken) {
        // Wait before retry (exponential)
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      } else if (!accessToken) {
        // Stop if token was invalidated
        break;
      }
    }

    setSyncStatus('error');
    console.error('❌ Falha total na sincronização após várias tentativas.');
  };

  // Auto-sync effect
  useEffect(() => {
    let timeoutId: any;
    if (cloudBackupEnabled && accessToken && !isOffline) {
      timeoutId = setTimeout(() => {
        syncDataToDrive();
      }, 5000); // 5 seconds debounce
    }
    return () => clearTimeout(timeoutId);
  }, [data, cloudBackupEnabled, accessToken, isOffline]);

  // Periodic active sync effect (every 5 minutes)
  useEffect(() => {
    let intervalId: any;
    if (cloudBackupEnabled && accessToken && !isOffline) {
      intervalId = setInterval(() => {
        syncDataToDrive();
      }, 300000); // 5 minutes: 300.000 ms
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [cloudBackupEnabled, accessToken, isOffline]);

  return (
    <AppContext.Provider
      value={{
        data,
        user,
        loading,
        isOffline,
        isSyncing,
        syncStatus,
        lastSynced,
        cloudBackupEnabled,
        setCloudBackupEnabled,
        signIn,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        logout,
        addInvoice,
        updateInvoice,
        deleteInvoice,
        addPayer,
        updatePayer,
        deletePayer,
        addHospital,
        updateHospital,
        deleteHospital,
        addSurgery,
        updateSurgery,
        deleteSurgery,
        addElectiveSurgery,
        updateElectiveSurgery,
        deleteElectiveSurgery,
        cancelElectiveSurgery,
        deleteCancelledSurgery,
        addPayment,
        updatePayment,
        deletePayment,
        addSurgeryTemplate,
        deleteSurgeryTemplate,
        deleteSurgeries,
        deleteElectiveSurgeries,
        deleteHospitals,
        deletePayers,
        deleteInvoices,
        deletePayments,
        deleteAllInvoices,
        deleteAllSurgeries,
        deleteAllElectiveSurgeries,
        deleteAllHospitals,
        deleteAllData,
        updateTaxPercentage,
        updateRemainingCompanyValue,
        updateAppPassword,
        exportBackup,
        importBackup,
        exportToExcel,
        syncDataToDrive
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
