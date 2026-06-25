import Dexie, { type Table } from 'dexie';
import type { Invoice, Payment, PayerMapping, Hospital, Surgery, ElectiveSurgery, CancelledSurgery, SurgeryTemplate, AppData } from '../store/AppContext';

export class MedNoteDatabase extends Dexie {
  surgeries!: Table<Surgery, string>;
  electiveSurgeries!: Table<ElectiveSurgery, string>;
  cancelledSurgeries!: Table<CancelledSurgery, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, string>;
  hospitals!: Table<Hospital, string>;
  payers!: Table<PayerMapping, string>;
  surgery_templates!: Table<SurgeryTemplate, string>;
  settings!: Table<{ key: string; value: any }, string>;

  constructor() {
    super('MedNoteDB');
    this.version(1).stores({
      surgeries: 'id, date, hospitalId, patientName, userId',
      electiveSurgeries: 'id, date, hospitalId, patientName, userId',
      invoices: 'id, date, noteNumber, userId',
      payments: 'id, date, userId',
      hospitals: 'id, name, userId',
      payers: 'id, customName, userId',
      surgery_templates: 'id, diagnosis, procedure, userId',
      settings: 'key'
    });
    
    // Versão 2 adiciona a tabela de cirurgias canceladas para migração sem perda de dados
    this.version(2).stores({
      cancelledSurgeries: 'id, date, patientName, cancellationReason, userId'
    });
  }
}

export const dbLocal = new MedNoteDatabase();

/**
 * Carrega todos os dados do IndexedDB em uma estrutura compatível com AppData
 */
export async function loadAllLocalData(defaultData: AppData): Promise<AppData> {
  try {
    const [
      surgeries,
      electiveSurgeries,
      cancelledSurgeries,
      invoices,
      payments,
      hospitals,
      payers,
      surgery_templates,
      settingsList
    ] = await Promise.all([
      dbLocal.surgeries.toArray(),
      dbLocal.electiveSurgeries.toArray(),
      dbLocal.cancelledSurgeries.toArray(),
      dbLocal.invoices.toArray(),
      dbLocal.payments.toArray(),
      dbLocal.hospitals.toArray(),
      dbLocal.payers.toArray(),
      dbLocal.surgery_templates.toArray(),
      dbLocal.settings.toArray()
    ]);

    const settingsMap = new Map(settingsList.map(s => [s.key, s.value]));
    const taxPercentage = settingsMap.get('taxPercentage') ?? defaultData.taxPercentage;
    const appPassword = settingsMap.get('appPassword') ?? defaultData.appPassword;

    return {
      surgeries: surgeries || [],
      electiveSurgeries: electiveSurgeries || [],
      cancelledSurgeries: cancelledSurgeries || [],
      invoices: invoices || [],
      payments: payments || [],
      hospitals: hospitals || [],
      payers: payers || [],
      surgery_templates: surgery_templates || [],
      taxPercentage,
      appPassword
    };
  } catch (error) {
    console.error("Erro de leitura no IndexedDB. Revertendo para dados padrão em memória:", error);
    return defaultData;
  }
}

/**
 * Salva com total integridade e atomicidade o estado atual de AppData no IndexedDB
 */
export async function saveAllLocalData(data: AppData): Promise<void> {
  try {
    await dbLocal.transaction('rw', [
      dbLocal.surgeries,
      dbLocal.electiveSurgeries,
      dbLocal.cancelledSurgeries,
      dbLocal.invoices,
      dbLocal.payments,
      dbLocal.hospitals,
      dbLocal.payers,
      dbLocal.surgery_templates,
      dbLocal.settings
    ], async () => {
      await Promise.all([
        dbLocal.surgeries.clear().then(() => dbLocal.surgeries.bulkAdd(data.surgeries || [])),
        dbLocal.electiveSurgeries.clear().then(() => dbLocal.electiveSurgeries.bulkAdd(data.electiveSurgeries || [])),
        dbLocal.cancelledSurgeries.clear().then(() => dbLocal.cancelledSurgeries.bulkAdd(data.cancelledSurgeries || [])),
        dbLocal.invoices.clear().then(() => dbLocal.invoices.bulkAdd(data.invoices || [])),
        dbLocal.payments.clear().then(() => dbLocal.payments.bulkAdd(data.payments || [])),
        dbLocal.hospitals.clear().then(() => dbLocal.hospitals.bulkAdd(data.hospitals || [])),
        dbLocal.payers.clear().then(() => dbLocal.payers.bulkAdd(data.payers || [])),
        dbLocal.surgery_templates.clear().then(() => dbLocal.surgery_templates.bulkAdd(data.surgery_templates || [])),
        dbLocal.settings.put({ key: 'taxPercentage', value: data.taxPercentage || 0 }),
        data.appPassword ? dbLocal.settings.put({ key: 'appPassword', value: data.appPassword }) : Promise.resolve()
      ]);
    });
  } catch (error) {
    console.error("Erro de escrita no IndexedDB ao salvar o estado offline:", error);
  }
}

/**
 * Migração offline-first não destrutiva de localStorage para IndexedDB (Dexie)
 */
export async function migrateFromLocalStorageIfNeeded(defaultData: AppData): Promise<AppData | null> {
  try {
    const isAlreadyMigrated = localStorage.getItem('dexie_migration_success') === 'true';
    if (isAlreadyMigrated) {
      return null;
    }

    const oldDataRaw = localStorage.getItem('app_data');
    if (!oldDataRaw) {
      localStorage.setItem('dexie_migration_success', 'true');
      return null;
    }

    const parsed = JSON.parse(oldDataRaw) as Partial<AppData>;
    if (!parsed || (
      (!parsed.surgeries || parsed.surgeries.length === 0) &&
      (!parsed.invoices || parsed.invoices.length === 0) &&
      (!parsed.electiveSurgeries || parsed.electiveSurgeries.length === 0)
    )) {
      localStorage.setItem('dexie_migration_success', 'true');
      return null;
    }

    console.log("[MIGRAÇÃO] Iniciando migração segura do localStorage antigo para o IndexedDB...");

    const appDataToMigrate: AppData = {
      ...defaultData,
      ...parsed,
      electiveSurgeries: parsed.electiveSurgeries || [],
      surgery_templates: parsed.surgery_templates || []
    };

    // 1. Grava de forma segura no Dexie (IndexedDB)
    await saveAllLocalData(appDataToMigrate);

    // 2. Validação da migração (Verificação Bidirecional de Registros)
    const testedData = await loadAllLocalData(defaultData);
    if (
      testedData.surgeries.length === appDataToMigrate.surgeries.length &&
      testedData.invoices.length === appDataToMigrate.invoices.length
    ) {
      console.log("[MIGRAÇÃO] Validação concluída com êxito! %d cirurgias e %d faturamentos de notas gravados.", testedData.surgeries.length, testedData.invoices.length);
      
      // 3. Rollback Guard: mantemos uma cópia de backup no localStorage e liberamos a chave principal somente
      localStorage.setItem('app_data_backup_secure', oldDataRaw);
      localStorage.removeItem('app_data');
      localStorage.setItem('dexie_migration_success', 'true');
      
      return testedData;
    } else {
      throw new Error("Os dados salvos no IndexedDB divergem do localStorage original.");
    }
  } catch (error) {
    console.error("[MIGRAÇÃO] Erro crítico na rotina de migração local:", error);
    // Em caso de erro, NÃO alteramos e NÃO apagamos os dados do localStorage antigos.
    return null;
  }
}
