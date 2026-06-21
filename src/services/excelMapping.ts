import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface FieldDefinition {
  key: string;
  label: string;
  required: boolean;
  keywords: string[];
}

export const SURGERY_FIELDS: FieldDefinition[] = [
  { key: 'patientName', label: 'Nome do Paciente', required: true, keywords: ['paciente', 'nome', 'patient', 'nome do paciente', 'nome paciente', 'nome_paciente'] },
  { key: 'date', label: 'Data da Cirurgia', required: true, keywords: ['data', 'date', 'data cirurgia', 'data da cirurgia', 'dt', 'data_cirurgia', 'dia', 'data oportuna'] },
  { key: 'procedure', label: 'Procedimento / Cirurgia', required: true, keywords: ['cirurgia', 'procedimento', 'descrição', 'descriçao', 'descricao', 'procedimento cirúrgico', 'procedimento_cirurgico', 'cirurgia realizada', 'procedimentos', 'especificação'] },
  { key: 'insurance', label: 'Convênio / Fonte Pagadora', required: false, keywords: ['convênio', 'convenio', 'seguradora', 'seguro', 'fonte pagadora', 'fonte_pagadora', 'plano', 'carteira', 'empresa conveniada'] },
  { key: 'feesPaid', label: 'Honorários (Valor Bruto)', required: false, keywords: ['honorários', 'honorários pagos', 'fees paid', 'valor bruto', 'valor pago', 'valor_pago', 'honorarios', 'vlr bruto', 'bruto', 'valor do honorario', 'valor brt', 'bruto r$', 'valor total'] },
  { key: 'receivedAmount', label: 'Valor Recebido (Líquido)', required: false, keywords: ['recebidos', 'honorários recebidos', 'valor (1/2)', 'pago', 'valor recebido', 'recebido', 'valor_recebido', 'líquido', 'liquido', 'recebido r$', 'pago (1/2)'] },
  { key: 'hospitalName', label: 'Hospital', required: false, keywords: ['hospital', 'local', 'unidade', 'estabelecimento', 'hosp', 'estabelecimento de saúde'] },
  { key: 'attendance', label: 'Atendimento / Guia', required: false, keywords: ['atendimento', 'atend', 'atend.', 'atendimento_numero', 'guia', 'nº atendimento', 'cod atendimento', 'codigo', 'cod. atendimento'] },
  { key: 'company', label: 'Empresa / OPME', required: false, keywords: ['empresa', 'fornecedora', 'fornecedor', 'opme', 'empresa_fornecedora', 'fornecedores', 'empresa opme'] },
  { key: 'indication', label: 'Indicação / Diagnóstico', required: false, keywords: ['indicação', 'indicacao', 'diagnóstico', 'diagnostico', 'motivo', 'justificativa', 'cid', 'queixa', 'hipótese diagnóstica', 'diagnostico principal'] }
];

export const INVOICE_FIELDS: FieldDefinition[] = [
  { key: 'date', label: 'Data de Emissão', required: true, keywords: ['emitida em', 'emitida', 'emitida data', 'data da emissao', 'data', 'emissão', 'emissao', 'date', 'vencimento', 'emitida_em', 'dt emissao', 'emissao data'] },
  { key: 'grossAmount', label: 'Valor Bruto', required: true, keywords: ['valor bruto', 'bruto', 'vl bruto', 'valor', 'gross', 'valor_bruto', 'valor total', 'valor_total', 'bruto r$', 'vlr bruto'] },
  { key: 'netAmount', label: 'Valor Líquido', required: false, keywords: ['valor líquido', 'líquido', 'liquido', 'vl liquido', 'net', 'valor_liquido', 'valor_recebido', 'pago', 'liq r$', 'vlr liquido'] },
  { key: 'noteNumber', label: 'Número da Nota', required: false, keywords: ['nº nota', 'número da nota', 'nota', 'nota fiscal', 'nf', 'nº nf', 'nota_fiscal', 'numero_nota', 'numero nfe'] },
  { key: 'originalPayerName', label: 'Fonte Pagadora / Convênio', required: false, keywords: ['fonte pagadora', 'pagador', 'payer', 'convênio', 'seguro', 'empresa', 'convenio', 'tomador', 'fonte_pagadora', 'convenio/fonte pagadora'] },
  { key: 'paymentDate', label: 'Data de Recebimento', required: false, keywords: ['data do recebimento', 'dt recebimento', 'data recebimento', 'recebida em', 'recebido em', 'data pagamento', 'data quitacao'] },
  { key: 'paymentAmount', label: 'Valor Recebido', required: false, keywords: ['valor recebido', 'recebido', 'pago', 'vl recebido', 'total recebido', 'valor quitado'] }
];

export function getHeadersPattern(headers: string[]): string {
  return headers
    .filter(Boolean)
    .map(h => String(h).trim().toLowerCase())
    .sort()
    .join(',');
}

export function calculateFuzzyScore(header: string, keywords: string[]): number {
  const hNorm = header.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  let maxScore = 0;
  
  for (const kw of keywords) {
    const kwNorm = kw.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    if (hNorm === kwNorm) {
      return 100;
    }
    
    // Exact word boundary matching gets high score
    const regex = new RegExp(`\\b${kwNorm}\\b`, 'i');
    if (regex.test(hNorm)) {
      return 90;
    }
    
    if (hNorm.includes(kwNorm) || kwNorm.includes(hNorm)) {
      const score = Math.round((Math.min(hNorm.length, kwNorm.length) / Math.max(hNorm.length, kwNorm.length)) * 80);
      if (score > maxScore) maxScore = score;
    }
  }
  
  return maxScore;
}

export function suggestAutoMapping(headers: string[], fieldDefs: FieldDefinition[]): { 
  mapping: Record<string, string>; // campo_sistema -> coluna_planilha
  confidence: boolean;
} {
  const mapping: Record<string, string> = {};
  let allRequiredMet = true;
  
  for (const field of fieldDefs) {
    let bestHeader = '';
    let bestScore = 0;
    
    for (const h of headers) {
      if (!h) continue;
      const score = calculateFuzzyScore(h, field.keywords);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = h;
      }
    }
    
    if (bestScore >= 50) { 
      mapping[field.key] = bestHeader;
    } else {
      mapping[field.key] = '';
      if (field.required) {
        allRequiredMet = false;
      }
    }
  }
  
  return { mapping, confidence: allRequiredMet };
}

export function saveMappingToLocal(headersPattern: string, mapping: Record<string, string>) {
  try {
    const localKey = `excel_mapping_${headersPattern}`;
    localStorage.setItem(localKey, JSON.stringify(mapping));
  } catch (e) {
    console.error('Erro ao salvar no localStorage:', e);
  }
}

export function loadMappingFromLocal(headersPattern: string): Record<string, string> | null {
  try {
    const localKey = `excel_mapping_${headersPattern}`;
    const item = localStorage.getItem(localKey);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    return null;
  }
}

export async function saveMappingToCloud(
  userId: string, 
  headersPattern: string, 
  mapping: Record<string, string>, 
  sheetType: 'surgeries' | 'invoices'
) {
  try {
    const safeId = headersPattern.replace(/[/.]/g, '_').substring(0, 120) || Math.random().toString(36).substring(2);
    const mappingDocRef = doc(db, 'users', userId, 'excel_mappings', safeId);
    await setDoc(mappingDocRef, {
      headersPattern,
      mapping,
      sheetType,
      userId,
      createdAt: new Date().toISOString()
    });
    console.log('Mapeamento salvo com sucesso no Firestore');
  } catch (error) {
    console.error('Erro ao salvar mapeamento no Firestore:', error);
  }
}

export async function loadMappingFromCloud(
  userId: string,
  headersPattern: string
): Promise<Record<string, string> | null> {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', userId, 'excel_mappings'),
      where('headersPattern', '==', headersPattern)
    ));
    
    if (!snap.empty) {
      return snap.docs[0].data().mapping as Record<string, string>;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar mapeamento no Firestore:', error);
    return null;
  }
}
