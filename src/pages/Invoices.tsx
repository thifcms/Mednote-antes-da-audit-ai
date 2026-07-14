import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Dialog } from '../components/ui/Dialog';
import { extractInvoiceDetails, extractSurgeryLabel } from '../services/ai';
import { Plus, FileText, Search, Loader2, Download, FileSpreadsheet, X, Check, ClipboardCopy, Info, Camera, UploadCloud, Edit2, Trash2 } from 'lucide-react';
import { formatCurrency, cn, findExcelHeaderRow, safeFormat, normalizeName, parseFlexibleDate, parseFinancialAmount } from '../lib/utils';
import { 
  INVOICE_FIELDS, 
  getHeadersPattern, 
  suggestAutoMapping, 
  loadMappingFromLocal, 
  saveMappingToLocal, 
  loadMappingFromCloud, 
  saveMappingToCloud 
} from '../services/excelMapping';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { toast } from 'sonner';

export function Invoices() {
  const { user, data, addInvoice, addPayer, addPayment, deleteInvoice, deleteInvoices, updateInvoice, deleteAllInvoices } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Estados para Calibração de Excel
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [calibrationHeaders, setCalibrationHeaders] = useState<string[]>([]);
  const [calibrationMapping, setCalibrationMapping] = useState<Record<string, string>>({});
  const [calibrationPattern, setCalibrationPattern] = useState('');
  const [calibrationFileRows, setCalibrationFileRows] = useState<any[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string>('Processando...');
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleteSelectionOpen, setIsDeleteSelectionOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);
  const [importMessage, setImportMessage] = useState<string>('');

  const [draftInvoice, setDraftInvoice] = useState<any>(null);
  const [draftSurgery, setDraftSurgery] = useState<any>(null);
  const [previewData, setPreviewData] = useState<{invoices: any[], payments: any[]} | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const [invoiceToDelete, setInvoiceToDelete] = useState<{id: string, name: string} | null>(null);
  
  const updatePreviewInvoice = (index: number, field: string, value: any) => {
    if (!previewData) return;
    const newInvoices = [...previewData.invoices];
    newInvoices[index] = { ...newInvoices[index], [field]: value };
    setPreviewData({ ...previewData, invoices: newInvoices });
  };

  const removePreviewInvoice = (index: number) => {
    if (!previewData) return;
    const newInvoices = previewData.invoices.filter((_, i) => i !== index);
    setPreviewData({ ...previewData, invoices: newInvoices });
  };

  const addBlankInvoice = () => {
    if (!previewData) return;
    setPreviewData({
      ...previewData,
      invoices: [
        {
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1,
          date: new Date().toISOString().split('T')[0],
          emissionDayMonth: format(new Date(), 'dd/MM'),
          noteNumber: '',
          grossAmount: 0,
          netAmount: 0,
          originalPayerName: '---',
          description: 'Importado',
          photos: []
        },
        ...previewData.invoices
      ]
    });
  };

  const updatePreviewPayment = (index: number, field: string, value: any) => {
    if (!previewData) return;
    const newPayments = [...previewData.payments];
    newPayments[index] = { ...newPayments[index], [field]: value };
    setPreviewData({ ...previewData, payments: newPayments });
  };

  const removePreviewPayment = (index: number) => {
    if (!previewData) return;
    const newPayments = previewData.payments.filter((_, i) => i !== index);
    setPreviewData({ ...previewData, payments: newPayments });
  };

  const addBlankPayment = () => {
    if (!previewData) return;
    setPreviewData({
      ...previewData,
      payments: [
        {
          date: new Date().toISOString().split('T')[0],
          amount: 0,
          description: 'Recebimento Importado'
        },
        ...previewData.payments
      ]
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const handleExcelExport = (type: 'all' | 'filtered') => {
    const list = type === 'all' ? data.invoices : filteredInvoices;
    if (list.length === 0) {
      toast.warning('Nenhum dado para exportar.');
      return;
    }

    const exportData = list.map(inv => {
      const payer = data.payers.find(p => p.id === inv.mappedPayerId);
      return {
        'Ano': inv.year,
        'Mês': inv.month,
        'Número da Nota': inv.noteNumber,
        'Emissão (Dia/Mês)': inv.emissionDayMonth,
        'Valor Bruto': inv.grossAmount,
        'Valor Líquido': inv.netAmount,
        'Data Completa': inv.date,
        'Fonte Pagadora': payer?.customName || inv.originalPayerName,
        'Descrição': inv.description
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faturamento");
    XLSX.writeFile(wb, `Faturamento_${type === 'all' ? 'Total' : 'Filtrado'}_${format(new Date(), 'ddMMyy')}.xlsx`);
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf';

    try {
      setIsProcessing(true);
      setProcessingMessage(isPdf ? 'Processando documento...' : 'Otimizando imagem...');
      setIsModalOpen(true);
      const extracted = await extractInvoiceDetails(file);

      if (extracted?._quotaExhausted || extracted?._usedModel?.includes('GEMINI_API_KEY_PAID')) {
        toast.warning(
          '⚠️ Usando processamento pago — cota gratuita esgotada hoje. Renova à meia-noite (horário de Brasília).',
          { duration: 8000 }
        );
      }
      
      setProcessingMessage('Mapeando dados...');

      let mappedPayerId = '';
      const payerNameNormal = normalizeName(extracted.originalPayerName || '');
      
      const exactMatch = data.payers.find(p => {
        const customNormal = normalizeName(p.customName);
        if (customNormal === payerNameNormal) return true;
        return p.aliases.some(a => normalizeName(a) === payerNameNormal);
      });
      
      const partialMatch = data.payers.find(p => {
        const customNormal = normalizeName(p.customName);
        if (customNormal && customNormal.length >= 4 && payerNameNormal.includes(customNormal)) return true;
        if (payerNameNormal && payerNameNormal.length >= 4 && customNormal.includes(payerNameNormal)) return true;
        
        return p.aliases.some(a => {
          const aliasNormal = normalizeName(a);
          if (!aliasNormal) return false;
          if (aliasNormal.length >= 4 && payerNameNormal.includes(aliasNormal)) return true;
          if (payerNameNormal && payerNameNormal.length >= 4 && aliasNormal.includes(payerNameNormal)) return true;
          return false;
        });
      });
      
      const existing = exactMatch || partialMatch;
      if (existing) mappedPayerId = existing.id;

      // Extract Year, Month and DD/MM from the extracted date if present
      let year = new Date().getFullYear();
      let month = new Date().getMonth() + 1;
      let emissionDayMonth = '';

      if (extracted.date) {
        try {
          const d = parseISO(extracted.date);
          if (!isNaN(d.getTime())) {
            year = d.getFullYear();
            month = d.getMonth() + 1;
            emissionDayMonth = format(d, 'dd/MM');
          }
        } catch (e) {}
      }

      setDraftInvoice({ 
        ...extracted, 
        mappedPayerId,
        year,
        month,
        emissionDayMonth: emissionDayMonth || ''
      });
    } catch (err: any) {
      console.error(err);
      let msg = isPdf 
        ? 'A extração do PDF falhou. Certifique-se de que o texto está legível ou tente converter para imagem.' 
        : 'A leitura falhou. Tente tirar uma foto mais nítida.';
      
      if (err instanceof Error && err.message) {
        msg = err.message;
      }
      
      setErrorMessage(msg);
      toast.error(msg);
      setIsModalOpen(false);
    } finally {
      setIsProcessing(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveCalibration = async () => {
    const missingFields = INVOICE_FIELDS.filter(f => f.required && !calibrationMapping[f.key]);
    if (missingFields.length > 0) {
      toast.error(`Associe colunas para os campos obrigatórios: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    saveMappingToLocal(calibrationPattern, calibrationMapping);
    if (user?.uid) {
      await saveMappingToCloud(user.uid, calibrationPattern, calibrationMapping, 'invoices');
    }
    setIsCalibrationOpen(false);
    
    processExcelWithOptions(calibrationMapping, calibrationFileRows);
  };

  const processImportedInvoicesWithNormalizedKeys = (rows: any[]) => {
    const invoicesToImport: any[] = [];
    const paymentsToImport: any[] = [];
    const seenInvoiceKeys = new Set<string>();
    const seenPaymentKeys = new Set<string>();
    const currentYear = new Date().getFullYear();

    let lastYear: any = null;
    let lastMonth: any = null;

    rows.forEach((row: any) => {
      const dateRaw = row.date;
      const originalPayerName = String(row.originalPayerName || '').trim();
      const grossVal = row.grossAmount;
      const netVal = row.netAmount;
      const noteNumberRaw = row.noteNumber;
      const noteNumber = noteNumberRaw !== undefined && noteNumberRaw !== null ? String(noteNumberRaw).trim() : '';
      
      const receiptDateRaw = row.paymentDate;
      const receivedAmountVal = row.paymentAmount;
      
      let date = parseFlexibleDate(dateRaw, lastYear);
      let receiptDate = parseFlexibleDate(receiptDateRaw, lastYear);

      const isValidDate = (d: string) => d.match(/^\d{4}-\d{2}-\d{2}$/);
      if (date && !isValidDate(date)) {
        date = '';
      }
      if (receiptDate && !isValidDate(receiptDate)) {
        receiptDate = '';
      }

      let yearVal = null;
      let month = null;

      if (date) {
        try {
          const parsed = parseISO(date);
          if (!isNaN(parsed.getTime())) {
            yearVal = parsed.getFullYear();
            lastYear = yearVal;
            month = parsed.getMonth() + 1;
            lastMonth = month;
          }
        } catch (e) {}
      }

      let year = yearVal || lastYear;
      if (!year && date) {
        year = parseInt(date.substring(0, 4));
      }

      let grossAmount = parseFinancialAmount(grossVal);
      let netAmount = parseFinancialAmount(netVal || grossVal);
      const description = 'Importado via Planilha';

      const hasInvoiceData = (noteNumber && noteNumber !== '' && noteNumber !== '0') || grossAmount > 0;
      
      if (hasInvoiceData) {
        const invKey = `${date || ''}-${originalPayerName.toLowerCase().trim()}-${noteNumber}-${grossAmount}`;
        if (!seenInvoiceKeys.has(invKey)) {
          seenInvoiceKeys.add(invKey);
          invoicesToImport.push({ 
            date: date || (year && month ? `${year}-${month.toString().padStart(2, '0')}-01` : new Date().toISOString().split('T')[0]), 
            originalPayerName: originalPayerName || '---', 
            grossAmount, 
            netAmount, 
            description, 
            noteNumber: (noteNumber === 'undefined' || noteNumber === '0') ? '' : noteNumber, 
            year: year || currentYear, 
            month: month || (new Date().getMonth() + 1), 
            emissionDayMonth: (() => {
              if (!date) return '';
              const d = parseISO(date);
              if (isNaN(d.getTime())) return '';
              return format(d, 'dd/MM');
            })(),
            photos: []
          });
        }
      }

      let receivedAmountValClean = typeof receivedAmountVal === 'number' ? receivedAmountVal : parseFloat(String(receivedAmountVal || '0').replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
      if (isNaN(receivedAmountValClean)) receivedAmountValClean = 0;
      if (receiptDate || receivedAmountValClean > 0) {
        const payKey = `${receiptDate || ''}-${receivedAmountValClean}-${originalPayerName.toLowerCase().trim()}`;
        if (!seenPaymentKeys.has(payKey)) {
          seenPaymentKeys.add(payKey);
          paymentsToImport.push({ 
            date: receiptDate || date || new Date().toISOString().split('T')[0], 
            amount: receivedAmountValClean || netAmount || grossAmount, 
            description: `Recebimento: ${originalPayerName || 'Importado'}${noteNumber && noteNumber !== 'undefined' && noteNumber !== '0' ? ` - Nota ${noteNumber}` : ''}` 
          });
        }
      }
    });
    return { invoices: invoicesToImport, payments: paymentsToImport };
  };

  const processExcelWithOptions = (mapping: Record<string, string>, sheetsData: any[]) => {
    setIsImporting(true);
    setImportMessage('Mapeando e processando faturamento...');
    
    try {
      let allInvoices: any[] = [];
      let allPayments: any[] = [];
      
      for (const sheet of sheetsData) {
        const { sheetName, rows, headerIndex, headerRow } = sheet;
        
        const mappedData = rows.slice(headerIndex + 1).map(r => {
          if (!r || !Array.isArray(r)) return null;
          
          // Verifica se a linha está totalmente vazia
          const isEmpty = r.every(cell => cell === undefined || cell === null || String(cell).trim() === "");
          if (isEmpty) return null;

          const obj: any = {};
          
          Object.entries(mapping).forEach(([systemKey, excelHeader]) => {
            if (excelHeader) {
              const headerIndexInRow = headerRow.indexOf(excelHeader);
              if (headerIndexInRow !== -1) {
                obj[systemKey] = r[headerIndexInRow] !== undefined ? r[headerIndexInRow] : '';
              } else {
                obj[systemKey] = '';
              }
            } else {
              obj[systemKey] = '';
            }
          });
          
          obj['_SheetName'] = sheetName;
          return obj;
        }).filter(Boolean).filter(obj => {
          if (!obj) return false;
          const values = Object.entries(obj)
            .filter(([key]) => key !== '_SheetName')
            .map(([_, v]) => v);
          return values.some(v => v !== '');
        });
        
        if (mappedData.length > 0) {
          const preview = processImportedInvoicesWithNormalizedKeys(mappedData);
          allInvoices = [...allInvoices, ...preview.invoices];
          allPayments = [...allPayments, ...preview.payments];
        }
      }
      
      if (allInvoices.length > 0 || allPayments.length > 0) {
        setPreviewData({ invoices: allInvoices, payments: allPayments });
        setIsPreviewOpen(true);
      } else {
        setErrorMessage('Nenhum dado de faturamento legível pôde ser extraído da planilha.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Erro ao processar as opções de mapeamento de faturamento.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size < 100) {
      setErrorMessage("O arquivo selecionado parece ser um atalho ou está vazio. Se você estiver usando o OneDrive, tente usar a opção 'COLAR DADOS' ou baixe o arquivo para o seu dispositivo antes.");
      return;
    }

    setIsImporting(true);
    setImportMessage('Lendo arquivo...');

    const reader = new FileReader();
    reader.onload = (evt) => {
      setTimeout(async () => {
        try {
          const ab = evt.target?.result;
          if (!ab || (ab instanceof ArrayBuffer && ab.byteLength === 0)) {
            setErrorMessage('Não foi possível ler o conteúdo do arquivo. Sugestão: Use a opção "COLAR DADOS" se estiver no OneDrive.');
            setIsImporting(false);
            return;
          }

          setImportMessage('Analisando planilhas...');
          const wb = XLSX.read(ab, { type: 'array', cellDates: true, cellNF: false, cellText: false });
          
          let firstSheetHeaders: string[] = [];
          const excelSheetsData: any[] = [];
          
          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            let rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: true });
            if (rows.length === 0) continue;
            
            // Trunca as linhas apenas se houver 5 ou mais vazias seguidas
            let consecutiveEmptyCount = 0;
            let truncateIndex = rows.length;
            
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const isEmpty = !row || !Array.isArray(row) || row.every(cell => cell === undefined || cell === null || String(cell).trim() === "");
              if (isEmpty) {
                consecutiveEmptyCount++;
                if (consecutiveEmptyCount >= 5) {
                  truncateIndex = i - 4;
                  break;
                }
              } else {
                consecutiveEmptyCount = 0;
              }
            }
            
            rows = rows.slice(0, truncateIndex);

            const { headerIndex, headerRow } = findExcelHeaderRow(rows, [
              'Ano', 'Mês', 'Mes', 'Nº Nota', 'NÚMERO DA NOTA', 'Nota', 'Emissão', 'EMITIDA EM', 'Emissao', 'emitida em', 'emitida', 'emitida data', 'data da emissao', 'Bruto', 'VALOR BRUTO', 'Líquido', 'VALOR LIQUIDO', 'Liquido', 'Valor', 'VALORES RECEBIDOS', 'DATA DO RECEBIMENTO'
            ]);
            
            excelSheetsData.push({
              sheetName,
              rows,
              headerIndex,
              headerRow
            });
            
            if (firstSheetHeaders.length === 0 && headerRow.length > 0) {
              firstSheetHeaders = headerRow;
            }
          }

          if (firstSheetHeaders.length === 0) {
            setErrorMessage('Não foi possível identificar cabeçalhos nesta planilha de faturamento.');
            setIsImporting(false);
            return;
          }

          const pattern = getHeadersPattern(firstSheetHeaders);
          setCalibrationPattern(pattern);
          setCalibrationHeaders(firstSheetHeaders.filter(Boolean));
          setCalibrationFileRows(excelSheetsData);

          // 1. Tentar ler do LocalStorage
          let activeMapping = loadMappingFromLocal(pattern);
          
          // 2. Tentar ler do Firestore
          if (!activeMapping && user?.uid) {
            activeMapping = await loadMappingFromCloud(user.uid, pattern);
            if (activeMapping) {
              saveMappingToLocal(pattern, activeMapping);
            }
          }
          
          // 3. Tentar auto-sugestão fuzzy
          let needsCalibration = false;
          if (!activeMapping) {
            const auto = await suggestAutoMapping(firstSheetHeaders, INVOICE_FIELDS);
            activeMapping = auto.mapping;
            if (!auto.confidence) {
              needsCalibration = true;
            } else {
              saveMappingToLocal(pattern, activeMapping);
              if (user?.uid) {
                saveMappingToCloud(user.uid, pattern, activeMapping, 'invoices');
              }
            }
          }

          if (needsCalibration) {
            setCalibrationMapping(activeMapping || {});
            setIsCalibrationOpen(true);
            setIsImporting(false);
          } else {
            processExcelWithOptions(activeMapping, excelSheetsData);
          }

        } catch (err) {
          console.error(err);
          setErrorMessage('Erro ao ler o Excel. Certifique-se de que é um arquivo .xlsx válido.');
          setIsImporting(false);
        }
      }, 100);
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };


  const processImportedData = (rows: any[]) => {
    const invoicesToImport: any[] = [];
    const paymentsToImport: any[] = [];
    const seenInvoiceKeys = new Set<string>();
    const seenPaymentKeys = new Set<string>();
    const currentYear = new Date().getFullYear();

    let lastYear: any = null;
    let lastMonth: any = null;

    rows.forEach((row: any) => {
      // Fuzzy key search helper with exact match priority
      const getVal = (keywords: string[]) => {
        const rowKeys = Object.keys(row);
        
        // 1. Try exact matches first
        const exactMatch = rowKeys.find(key => {
          const k = String(key).trim().toLowerCase();
          return keywords.some(kw => k === kw.toLowerCase());
        });
        if (exactMatch && row[exactMatch] !== undefined && row[exactMatch] !== null) return row[exactMatch];

        // 2. Try partial matches
        const partialMatch = rowKeys.find(key => {
          const k = String(key).trim().toLowerCase();
          return keywords.some(kw => k.includes(kw.toLowerCase()));
        });
        return partialMatch ? row[partialMatch] : '';
      };

      const dateRaw = getVal(['Emitida em', 'EMITIDA EM', 'emitida em', 'emitida', 'emitida data', 'data da emissao', 'Data', 'Emissão', 'Emissao', 'Date', 'Vencimento', 'EMITIDA']);
      const originalPayerName = String(getVal(['Fonte Pagadora', 'Pagador', 'Payer', 'CONVÊNIO', 'Seguro', 'Empresa', 'Convenio']) || '').trim();
      const grossVal = getVal(['Valor Bruto', 'VALOR BRUTO', 'Bruto', 'VL BRUTO', 'Valor', 'Gross', 'VALOR']);
      const netVal = getVal(['Valor Líquido', 'VALOR LIQUIDO', 'Líquido', 'Liquido', 'Valor Líquido', 'VL LIQUIDO', 'Net', 'LÍQUIDO']);
      const noteNumberRaw = getVal(['Número da nota', 'NÚMERO DA NOTA', 'NUMERO DA NOTA', 'Nº Nota', 'Número da Nota', 'Nota', 'Nº', 'NOTA FISCAL', 'NF', 'N.F.', 'N.F', 'N°', 'Nº NOTA', 'N° NOTA']);
      const noteNumber = noteNumberRaw !== undefined && noteNumberRaw !== null ? String(noteNumberRaw).trim() : '';
      
      const receiptDateRaw = getVal(['Data do recebimento', 'DATA DO RECEBIMENTO', 'Recebido em', 'Data de Recebimento', 'Recebimento', 'DATA PGTO', 'PAGAMENTO']);
      const receivedAmountVal = getVal(['Valores recebidos', 'VALORES RECEBIDOS', 'Recebido', 'Valor Recebido', 'Valor Pago', 'PAGO', 'VL PAGO']);
      
      let date = parseFlexibleDate(dateRaw, lastYear);
      let receiptDate = parseFlexibleDate(receiptDateRaw, lastYear);

      // Validate date before using it
      const isValidDate = (d: string) => d.match(/^\d{4}-\d{2}-\d{2}$/);
      if (date && !isValidDate(date)) {
        console.warn('Invalid date format detected:', date);
        date = '';
      }
      if (receiptDate && !isValidDate(receiptDate)) {
        console.warn('Invalid receipt date format detected:', receiptDate);
        receiptDate = '';
      }

      let yearVal = getVal(['Ano', 'Year', 'ANO']);
      let monthVal = getVal(['Mês', 'Month', 'MÊS', 'Mes']);

      let year = yearVal ? parseInt(String(yearVal)) : lastYear;
      let monthStr = String(monthVal || '').toLowerCase().trim();
      let month = (monthVal || monthVal === 0) ? null : lastMonth;

      if (monthStr) {
        const monthNames: Record<string, number> = {
          'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4, 'maio': 5, 'junho': 6,
          'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
          'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
        };
        if (monthNames[monthStr]) {
          month = monthNames[monthStr];
        } else if (!isNaN(parseInt(monthStr))) {
          month = parseInt(monthStr);
        }
      }

      if (yearVal) lastYear = year;
      if (monthVal || monthVal === 0) lastMonth = month;
      
      if (date) {
        try {
          const parsed = parseISO(date);
          if (!isNaN(parsed.getTime())) {
            year = parsed.getFullYear();
            lastYear = year;
            month = parsed.getMonth() + 1;
            lastMonth = month;
          }
        } catch (e) {}
      } else if (isNaN(year || NaN)) {
        year = lastYear;
        month = lastMonth;
      }

      let grossAmount = parseFinancialAmount(grossVal);
      let netAmount = parseFinancialAmount(netVal || grossVal);
      const description = String(getVal(['Descrição', 'INFO', 'PRODUTO', 'Serviço']) || 'Importado via Planilha').trim();

      const hasInvoiceData = (noteNumber && noteNumber !== '' && noteNumber !== '0') || grossAmount > 0;
      
      if (hasInvoiceData) {
        const invKey = `${date || ''}-${originalPayerName.toLowerCase().trim()}-${noteNumber}-${grossAmount}`;
        if (!seenInvoiceKeys.has(invKey)) {
          seenInvoiceKeys.add(invKey);
          invoicesToImport.push({ 
            date: date || (year && month ? `${year}-${month.toString().padStart(2, '0')}-01` : new Date().toISOString().split('T')[0]), 
            originalPayerName: originalPayerName || '---', 
            grossAmount, 
            netAmount, 
            description, 
            noteNumber: (noteNumber === 'undefined' || noteNumber === '0') ? '' : noteNumber, 
            year: year || currentYear, 
            month: month || (new Date().getMonth() + 1), 
            emissionDayMonth: (() => {
              if (!date) return '';
              const d = parseISO(date);
              if (isNaN(d.getTime())) return '';
              return format(d, 'dd/MM');
            })(),
            photos: []
          });
        }
      } else {
        console.log('Skipping row due to no invoice data');
      }

      let receivedAmountValClean = typeof receivedAmountVal === 'number' ? receivedAmountVal : parseFloat(String(receivedAmountVal || '0').replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
      if (isNaN(receivedAmountValClean)) receivedAmountValClean = 0;
      if (receiptDate || receivedAmountValClean > 0) {
        const payKey = `${receiptDate || ''}-${receivedAmountValClean}-${originalPayerName.toLowerCase().trim()}`;
        if (!seenPaymentKeys.has(payKey)) {
          seenPaymentKeys.add(payKey);
          paymentsToImport.push({ 
            date: receiptDate || date || new Date().toISOString().split('T')[0], 
            amount: receivedAmountValClean || netAmount || grossAmount, 
            description: `Recebimento: ${originalPayerName || 'Importado'}${noteNumber && noteNumber !== 'undefined' && noteNumber !== '0' ? ` - Nota ${noteNumber}` : ''}` 
          });
        }
      } else {
        console.log('Skipping payment row due to no date and no amount', { receiptDate, receivedAmountValClean });
      }
    });
    return { invoices: invoicesToImport, payments: paymentsToImport };
  };

  const confirmImport = async () => {
    if (!previewData) return;
    let invCount = 0;
    let payCount = 0;
    let invSkipped = 0;
    let paySkipped = 0;

    const currentInvoices = [...data.invoices];
    const currentPayments = [...data.payments];
    
    // Process invoices sequentially
    for (const inv of previewData.invoices) {
      // Duplicate check: Same Date and Note Number and Amount
      const isDuplicate = currentInvoices.some(existing => 
        existing.date === inv.date && 
        existing.noteNumber === inv.noteNumber &&
        existing.grossAmount === inv.grossAmount
      );

      if (isDuplicate) {
        invSkipped++;
        continue;
      }
      
      await addInvoice(inv);
      currentInvoices.push({ ...inv, id: 'temp-' + Math.random() });
      invCount++;
    }
    
    // Process payments sequentially
    for (const pay of previewData.payments) { 
      const isDuplicate = currentPayments.some(existing => 
        existing.date === pay.date && 
        existing.amount === pay.amount &&
        (existing.description || '').toLowerCase().trim() === (pay.description || '').toLowerCase().trim()
      );

      if (isDuplicate) {
        paySkipped++;
        continue;
      }

      await addPayment(pay); 
      currentPayments.push({ ...pay, id: 'temp-p-' + Math.random() });
      payCount++;
    }
    
    setPreviewData(null);
    setIsPreviewOpen(false);
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftInvoice) return;
    const form = e.target as HTMLFormElement;
    
    try {
      const year = parseInt((form.elements.namedItem('year') as HTMLInputElement).value);
      const grossAmount = parseFloat((form.elements.namedItem('grossAmount') as HTMLInputElement).value || '0');
      const netAmount = parseFloat((form.elements.namedItem('netAmount') as HTMLInputElement).value || '0');
      const noteNumber = (form.elements.namedItem('noteNumber') as HTMLInputElement).value;
      const emissionDayMonth = (form.elements.namedItem('emissionDayMonth') as HTMLInputElement).value;
      const mappedPayerId = (form.elements.namedItem('mappedPayerId') as HTMLSelectElement).value;
      
      // Parse month from emissionDayMonth (DD/MM fallback to current month)
      let month = draftInvoice.month || new Date().getMonth() + 1;
      let day = 1;
      if (emissionDayMonth && emissionDayMonth.includes('/')) {
        const parts = emissionDayMonth.split('/');
        if (parts.length >= 2) {
           day = parseInt(parts[0], 10) || 1;
           month = parseInt(parts[1], 10) || month;
        }
      }
      
      // Construct date string
      const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  
      const invoiceData = { 
        date: date,
        amount: grossAmount, 
        grossAmount, 
        netAmount, 
        description: draftInvoice.description || 'Registro Manual', 
        year, 
        month, 
        emissionDayMonth, 
        noteNumber, 
        mappedPayerId,
        originalPayerName: draftInvoice.originalPayerName || '---',
        aiSourceHash: draftInvoice.aiSourceHash || ''
      };
  
      if (draftInvoice.id) {
         const existing = data.invoices?.find(inv => inv.id === draftInvoice.id);
         invoiceData.aiSourceHash = draftInvoice.aiSourceHash || existing?.aiSourceHash || '';
         await updateInvoice(draftInvoice.id, invoiceData);
         toast.success("Nota atualizada com sucesso!");
      } else {
         await addInvoice(invoiceData);
         toast.success("Nota adicionada com sucesso!");
      }
      
      setDraftInvoice(null);
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar nota.");
    }
  };

  const handleEditInvoice = (invoice: any) => {
    setDraftInvoice({
      id: invoice.id,
      date: invoice.date,
      year: invoice.year,
      month: invoice.month,
      mappedPayerId: invoice.mappedPayerId,
      originalPayerName: invoice.originalPayerName,
      grossAmount: invoice.grossAmount || invoice.amount,
      netAmount: invoice.netAmount,
      noteNumber: invoice.noteNumber,
      emissionDayMonth: invoice.emissionDayMonth,
      description: invoice.description,
      aiSourceHash: invoice.aiSourceHash || ''
    });
    setIsModalOpen(true);
  };

  const handleDeleteInvoice = (id: string, name: string) => {
    setInvoiceToDelete({ id, name });
  };

  const filteredInvoices = data.invoices.filter(i => {
    const p = data.payers.find(x => x.id === i.mappedPayerId);
    const searchString = `${i.description} ${i.originalPayerName} ${p?.customName || ''} ${i.noteNumber}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());
    const matchesYear = yearFilter === 'all' || String(i.year) === yearFilter;
    return matchesSearch && matchesYear;
  }).sort((a, b) => {
    const numA = parseInt(String(a.noteNumber).replace(/\D/g, '')) || 0;
    const numB = parseInt(String(b.noteNumber).replace(/\D/g, '')) || 0;
    
    if (numB !== numA) {
      return numB - numA;
    }
    
    return String(b.noteNumber).localeCompare(String(a.noteNumber), undefined, { numeric: true });
  });

  const monthGross = data.invoices.filter(i => {
    if (!i.date) return false;
    const d = parseISO(i.date);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((acc, curr) => acc + (curr.grossAmount || curr.amount), 0);

  const monthCount = data.invoices.filter(i => {
    if (!i.date) return false;
    const d = parseISO(i.date);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const totalBilled = data.invoices.reduce((acc, inv) => acc + (inv.netAmount || inv.amount || 0), 0);

  return (
    <motion.div 
      className="flex flex-col min-h-full bg-zinc-50/50"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <PageHeader 
        breadcrumbs={[
          { label: 'Financeiro' },
          { label: 'Notas Fiscais' }
        ]}
      >
        <input type="file" accept="image/*,application/pdf" ref={fileInputRef} className="hidden" onChange={handleCapture} />
        <input type="file" accept=".xlsx, .xls" ref={excelInputRef} className="hidden" onChange={handleExcelImport} />
        
        <div className="flex items-center gap-1.5 bg-zinc-100/50 p-1 rounded-2xl border border-zinc-200/50 overflow-x-auto no-scrollbar">
           <button 
             onClick={() => excelInputRef.current?.click()} 
             className="flex items-center gap-2 bg-white text-zinc-700 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
             title="Importar Excel"
           >
             <span className="action-dot" />
             <span>Excel</span>
           </button>
           <button 
             onClick={() => fileInputRef.current?.click()} 
             className="flex items-center justify-center gap-2 bg-white text-zinc-700 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
             disabled={isProcessing}
             title="Escanear Nota (Evite PDFs grandes)"
           >
              <span className="action-dot" />
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />} 
              <span>Foto/PDF</span>
           </button>
        </div>

        <button 
          onClick={() => { setSearchTerm(''); setIsModalOpen(true); setDraftInvoice({ date: new Date().toISOString().split('T')[0], grossAmount: 0, netAmount: 0, description: '', originalPayerName: '' }); }} 
          className="h-10 px-4 bg-[#162744] flex items-center justify-center gap-2 rounded-xl text-white shadow-lg shadow-zinc-200 transition-all active:scale-95 hover:bg-[#0f1b32]"
          title="Nova Nota"
        >
          <span className="action-dot" />
          <span className="text-[10px] font-black uppercase tracking-widest">Novo</span>
        </button>
      </PageHeader>

      <main className="flex-1 p-4 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
        {errorMessage && (
           <div className="bg-red-50 text-red-700 p-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between gap-2 border border-red-100">
             <span>{errorMessage}</span>
             <X className="w-4 h-4 cursor-pointer" onClick={() => setErrorMessage(null)} />
           </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white px-3 py-6 rounded-2xl border border-zinc-200 shadow-sm text-center group flex flex-col justify-center">
            <div className="text-[9px] font-black text-zinc-300 uppercase tracking-widest mb-1 group-hover:text-zinc-400 transition-colors">Total Faturado LRT</div>
            <div className="text-lg md:text-xl font-bold text-zinc-900 font-mono tracking-tighter tabular-nums break-words">{formatCurrency(totalBilled)}</div>
          </div>
          <div className="bg-white px-3 py-6 rounded-2xl border border-zinc-200 shadow-sm text-center group flex flex-col justify-center">
            <div className="text-[9px] font-black text-zinc-300 uppercase tracking-widest mb-1 group-hover:text-zinc-400 transition-colors">Faturamento {format(new Date(), 'MMMM', { locale: ptBR })}</div>
            <div className="text-lg md:text-xl font-bold text-zinc-900 font-mono tracking-tighter tabular-nums break-words">{formatCurrency(monthGross)}</div>
          </div>
          <div className="bg-white px-3 py-6 rounded-2xl border border-zinc-200 shadow-sm text-center group flex flex-col justify-center">
            <div className="text-[9px] font-black text-zinc-300 uppercase tracking-widest mb-1 group-hover:text-zinc-400 transition-colors">Notas De {format(new Date(), 'MMMM', { locale: ptBR })}</div>
            <div className="text-lg md:text-xl font-bold text-zinc-900 font-mono tracking-tighter tabular-nums">{monthCount}</div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="bg-[#162744] px-4 py-6 rounded-2xl shadow-xl shadow-zinc-200 text-center flex flex-col items-center justify-center flex-1">
              <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Total de Notas</div>
              <div className="text-lg md:text-xl font-bold text-white tabular-nums tracking-tighter">{data.invoices.length}</div>
            </div>
            <button 
               onClick={() => {
                 setSelectedIds(new Set());
                 setIsDeleteSelectionOpen(true);
               }}
               className="flex items-center justify-center gap-2 bg-white text-red-600 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-sm hover:shadow-md hover:bg-red-50 active:scale-95 border border-red-100"
               title="Limpar notas"
             >
               <Trash2 className="w-3.5 h-3.5" />
               <span>Limpar Notas</span>
             </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          <div className="px-6 py-4 border-b border-zinc-100 flex flex-col md:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
              <input type="text" placeholder="BUSCAR REGISTRO..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-[10px] font-black uppercase tracking-widest w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none focus:border-zinc-200 transition-all" />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
              <label className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">Ano:</label>
              <select 
                value={yearFilter} 
                onChange={(e) => setYearFilter(e.target.value)}
                className="bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-600 focus:outline-none focus:border-zinc-200 appearance-none min-w-[80px]"
              >
                <option value="all">TODOS</option>
                {Array.from(new Set(data.invoices.map(i => String(i.year))))
                  .sort((a, b) => Number(b) - Number(a))
                  .map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))
                }
              </select>
            </div>
          </div>
          <div className="overflow-x-auto flex-1 w-full">
             <table className="w-full text-left min-w-max md:min-w-full">
                <thead style={{ background: "#F8F9FC" }}>
                  <tr style={{ background: "#F8F9FC" }}>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Ano</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Mês</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Fonte Pagadora</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Nº Nota</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Emissão</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Bruto</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Líquido</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                   {filteredInvoices.map(invoice => {

                     const d = invoice.date ? parseISO(invoice.date) : new Date();
                     const dateResult = isNaN(d.getTime()) ? new Date() : d;
                     return (
                        <tr 
                          key={invoice.id} 
                          style={{ backgroundColor: "transparent" }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F5F6FB"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                          className="group transition-all duration-150"
                        >
                           <td style={{ padding: "12px 14px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>{invoice.year}</td>
                           <td style={{ padding: "12px 14px", fontSize: 10, fontWeight: 700, color: "#3D4A63", textTransform: "uppercase" }}>{format(dateResult, 'MMM', { locale: ptBR })}</td>
                           <td style={{ padding: "12px 14px" }}>
                              <div className="text-[12px] font-bold text-zinc-800 uppercase tracking-tight truncate max-w-[120px] md:max-w-[200px]">{data.payers.find(p => p.id === invoice.mappedPayerId)?.customName || invoice.originalPayerName || '---'}</div>
                           </td>
                           <td style={{ padding: "12px 14px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>{invoice.noteNumber || 'S/N'}</td>
                           <td style={{ padding: "12px 14px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>{invoice.emissionDayMonth || format(dateResult, 'dd/MM')}</td>
                           <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>{formatCurrency(invoice.grossAmount)}</td>
                           <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#162744" }}>{formatCurrency(invoice.netAmount)}</td>
                           <td style={{ padding: "12px 14px", textAlign: "right" }}>
                              <div className="flex justify-end gap-2 transition-opacity">
                                <button 
                                  onClick={() => handleEditInvoice(invoice)}
                                  className="p-1.5 text-zinc-400 hover:text-[#162744] hover:bg-zinc-100 rounded-lg transition-colors"
                                  title="Editar"
                                >
                                   <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteInvoice(invoice.id, invoice.noteNumber || invoice.originalPayerName || '---')}
                                  className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                           </td>
                        </tr>
                     );
                   })}
                   {filteredInvoices.length === 0 && (
                     <tr><td colSpan={8} className="p-12 text-center text-zinc-300 italic text-[11px]">Nenhum faturamento encontrado.</td></tr>
                   )}
                </tbody>
             </table>
          </div>
        </div>
      </main>

      <Dialog isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} title="Confirmar Importação" size="xl">
        <div className="p-4 space-y-6">
           <div className="flex items-center justify-between">
              <div className="flex gap-4">
                 <div className="bg-zinc-50 px-4 py-2 rounded-xl border border-zinc-100 text-center">
                    <div className="text-xl font-black text-zinc-900">{previewData?.invoices.length}</div>
                    <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Notas</div>
                 </div>
                 <div className="bg-zinc-50 px-4 py-2 rounded-xl border border-zinc-100 text-center">
                    <div className="text-xl font-black text-zinc-900">{previewData?.payments.length}</div>
                    <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Recebimentos</div>
                 </div>
              </div>
              <div className="flex gap-2">
                 <button onClick={addBlankInvoice} className="px-3 py-1.5 bg-zinc-100 text-zinc-600 rounded-lg text-[9px] font-black uppercase tracking-tight hover:bg-zinc-200 transition-colors flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Nota
                 </button>
                 <button onClick={addBlankPayment} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-tight hover:bg-emerald-100 transition-colors flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Recebimento
                 </button>
              </div>
           </div>

           <div className="space-y-4">
             {/* Invoices Table */}
             <div className="space-y-2">
               <div className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Notas Fiscais para Importar</div>
               <div className="max-h-[40vh] overflow-y-auto overflow-x-auto border border-zinc-100 rounded-2xl bg-white w-full">
                  <table className="w-full text-[10px]">
                     <thead className="bg-zinc-50 font-black text-[8px] uppercase tracking-widest text-zinc-400 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-3 text-left">Ano</th>
                          <th className="px-3 py-3 text-left">Mês</th>
                          <th className="px-3 py-3 text-left">Fonte Pagadora</th>
                          <th className="px-3 py-3 text-left">Nº Nota</th>
                          <th className="px-3 py-3 text-left">Emitida</th>
                          <th className="px-3 py-3 text-right">Bruto</th>
                          <th className="px-3 py-3 text-right">Líquido</th>
                          <th className="px-3 py-3"></th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-zinc-50">
                        {previewData?.invoices.map((i, idx) => (
                           <tr key={`i-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-2 py-1.5">
                                <input 
                                  type="number" 
                                  value={i.year} 
                                  onChange={(e) => updatePreviewInvoice(idx, 'year', parseInt(e.target.value))}
                                  className="w-14 bg-transparent border-none p-1 font-bold text-zinc-600 focus:ring-0"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input 
                                  type="number" 
                                  value={i.month} 
                                  onChange={(e) => updatePreviewInvoice(idx, 'month', parseInt(e.target.value))}
                                  className="w-10 bg-transparent border-none p-1 font-bold text-zinc-600 focus:ring-0"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input 
                                  type="text" 
                                  value={i.originalPayerName} 
                                  onChange={(e) => updatePreviewInvoice(idx, 'originalPayerName', e.target.value)}
                                  className="w-full bg-transparent border-none p-1 font-bold text-zinc-900 focus:ring-0 uppercase placeholder:text-zinc-300"
                                  placeholder="Fonte Pagadora..."
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input 
                                  type="text" 
                                  value={i.noteNumber} 
                                  onChange={(e) => updatePreviewInvoice(idx, 'noteNumber', e.target.value)}
                                  className="w-20 bg-transparent border-none p-1 font-bold text-zinc-500 focus:ring-0"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input 
                                  type="text" 
                                  value={i.emissionDayMonth} 
                                  onChange={(e) => updatePreviewInvoice(idx, 'emissionDayMonth', e.target.value)}
                                  className="w-16 bg-transparent border-none p-1 font-mono font-bold text-zinc-400 focus:ring-0"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <input 
                                  type="number" 
                                  value={i.grossAmount} 
                                  onChange={(e) => updatePreviewInvoice(idx, 'grossAmount', parseFloat(e.target.value))}
                                  className="w-24 bg-transparent border-none p-1 text-right font-mono font-bold text-zinc-900 focus:ring-0"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <input 
                                  type="number" 
                                  value={i.netAmount} 
                                  onChange={(e) => updatePreviewInvoice(idx, 'netAmount', parseFloat(e.target.value))}
                                  className="w-24 bg-transparent border-none p-1 text-right font-mono font-bold text-zinc-900 focus:ring-0"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <button onClick={() => removePreviewInvoice(idx)} className="text-zinc-300 hover:text-red-500 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
             </div>

             {/* Payments Table */}
             <div className="space-y-2">
               <div className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.2em] px-1">Recebimentos para Importar (Aba Recebimentos)</div>
               <div className="max-h-[35vh] overflow-y-auto overflow-x-auto border border-emerald-100 rounded-2xl bg-white w-full">
                  <table className="w-full text-[10px]">
                     <thead className="bg-emerald-50 font-black text-[8px] uppercase tracking-widest text-emerald-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-3 text-left">Data Recebimento</th>
                          <th className="px-3 py-3 text-left">Descrição / Fonte</th>
                          <th className="px-3 py-3 text-right">Valor Recebido</th>
                          <th className="px-3 py-3"></th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-emerald-50">
                        {previewData?.payments.map((p, idx) => (
                           <tr key={`p-${idx}`} className="hover:bg-emerald-50/30 transition-colors">
                              <td className="px-3 py-1.5">
                                <input 
                                  type="date" 
                                  value={p.date} 
                                  onChange={(e) => updatePreviewPayment(idx, 'date', e.target.value)}
                                  className="bg-transparent border-none p-1 font-mono font-bold text-zinc-500 focus:ring-0"
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <input 
                                  type="text" 
                                  value={p.description} 
                                  onChange={(e) => updatePreviewPayment(idx, 'description', e.target.value)}
                                  className="w-full bg-transparent border-none p-1 font-bold text-zinc-900 focus:ring-0 uppercase"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <input 
                                  type="number" 
                                  value={p.amount} 
                                  onChange={(e) => updatePreviewPayment(idx, 'amount', parseFloat(e.target.value))}
                                  className="w-28 bg-transparent border-none p-1 text-right font-mono font-bold text-emerald-600 focus:ring-0"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <button onClick={() => removePreviewPayment(idx)} className="text-zinc-300 hover:text-red-500 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
             </div>
           </div>

           <div className="flex gap-3">
              <button onClick={() => setIsPreviewOpen(false)} className="flex-1 py-4 bg-zinc-100 text-zinc-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors">
                Cancelar
              </button>
              <button onClick={confirmImport} className="flex-[2] py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-zinc-200 hover:bg-[#0f1b32] transition-all active:scale-[0.98]">
                Confirmar Importação de { (previewData?.invoices.length || 0) + (previewData?.payments.length || 0) } Registros
              </button>
           </div>
        </div>
      </Dialog>

      <Dialog isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={draftInvoice?.id ? "Editar Registro" : "Registro de Notas"}>
        {isProcessing ? (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-zinc-900" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">{processingMessage}</p>
          </div>
        ) : draftInvoice ? (
          <form onSubmit={handleSaveDraft} className="space-y-6">
             <div className="grid grid-cols-1 gap-4">
                <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">ANO</label><input name="year" type="number" defaultValue={draftInvoice.year || new Date().getFullYear()} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} required /></div>
             </div>
             
             <div className="space-y-4">
                <div>
                   <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">FONTE PAGADORA / CONVÊNIO</label>
                   <div className="space-y-1.5">
                      <select 
                        name="mappedPayerId" 
                        defaultValue={draftInvoice.mappedPayerId || ''} 
                        className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all"
                        style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }}
                      >
                         <option value="">Selecione Fonte...</option>
                         {data.payers.map(p => <option key={p.id} value={p.id}>{p.customName}</option>)}
                      </select>
                      {draftInvoice.originalPayerName && (
                        <div className="flex items-center gap-1.5 px-2">
                           <Info className="w-3 h-3 text-zinc-400" />
                           <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-tighter">
                             Lido na nota: <span className="text-zinc-600">{draftInvoice.originalPayerName}</span>
                           </p>
                        </div>
                      )}
                   </div>
                </div>


             </div>

             <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">Nº NOTA</label><input name="noteNumber" type="text" defaultValue={draftInvoice.noteNumber || ''} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} required /></div>
                <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">EMISSÃO (DD/MM)</label><input name="emissionDayMonth" type="text" defaultValue={draftInvoice.emissionDayMonth || ''} placeholder="DD/MM" className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} required /></div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">VALOR BRUTO (R$)</label><input name="grossAmount" type="number" step="0.01" defaultValue={draftInvoice.grossAmount || draftInvoice.amount || ''} className="w-full p-2.5 text-xs font-mono font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} required /></div>
                <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">VALOR LÍQUIDO (R$)</label><input name="netAmount" type="number" step="0.01" defaultValue={draftInvoice.netAmount || ''} className="w-full p-2.5 text-xs font-mono font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} required /></div>
             </div>
            <button type="submit" className="w-full py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
               <span className="action-dot" />
               Gravar Registro
            </button>
          </form>
        ) : null}
      </Dialog>

      <Dialog isOpen={isCalibrationOpen} onClose={() => setIsCalibrationOpen(false)} title="Mapeamento de Planilha" size="lg">
        <div id="calibration-modal-invoices" className="p-6 space-y-6">
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex gap-3">
             <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
             <div className="space-y-1">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                   Calibração de Planilha Necessária
                </h4>
                <p className="text-[11px] text-amber-700/80 font-bold leading-relaxed">
                   Detectamos novas colunas nesta planilha de faturamento. Associe os dados da sua planilha (esquerda) aos campos do faturamento de notas (direita) para importar com perfeição. O sistema salvará este mapeamento automaticamente!
                </p>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
            {INVOICE_FIELDS.map(field => {
              const currentVal = calibrationMapping[field.key] || '';
              return (
                <div key={field.key} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex flex-col justify-between space-y-2">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                      Campo do Sistema
                    </span>
                    <label className="text-[11px] font-black uppercase tracking-tight text-zinc-800 flex items-center gap-1.5 mt-0.5">
                      {field.label}
                      {field.required && (
                        <span className="text-amber-600 font-bold text-[10px]" title="Obrigatório">*</span>
                      )}
                    </label>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                      Coluna da Planilha
                    </span>
                    <select
                      className="w-full text-[11px] font-bold uppercase tracking-tight bg-white border border-zinc-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-all cursor-pointer"
                      value={currentVal}
                      onChange={(e) => {
                        setCalibrationMapping(prev => ({ ...prev, [field.key]: e.target.value }));
                      }}
                    >
                      <option value="">-- Ignorar ou Não Encontrada --</option>
                      {calibrationHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              id="btn-cancel-calibration-inv"
              onClick={() => setIsCalibrationOpen(false)}
              className="flex-1 text-[10px] font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 hover:bg-zinc-200 py-3.5 rounded-2xl transition-all scale-press active:scale-95 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-confirm-calibration-inv"
              onClick={handleSaveCalibration}
              className="flex-1 text-[10px] font-black uppercase tracking-wider text-white bg-zinc-900 hover:bg-zinc-800 py-3.5 rounded-2xl transition-all scale-press active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              Confirmar & Importar
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={isImporting} onClose={() => setIsImporting(false)} title="Importando Dados">
        <div className="py-20 text-center space-y-4">
           <Loader2 className="w-10 h-10 animate-spin mx-auto text-zinc-900" />
           <p className="text-[10px] font-black uppercase tracking-[0.2em]">{importMessage}</p>
        </div>
      </Dialog>

      <Dialog isOpen={!!invoiceToDelete} onClose={() => setInvoiceToDelete(null)} title="Excluir Registro">
        <div className="p-6 text-center space-y-6">
          <p className="text-sm text-zinc-600">Tem certeza que deseja excluir a nota de <strong className="text-zinc-900">{invoiceToDelete?.name}</strong>?</p>
          <div className="flex gap-3">
             <button onClick={() => setInvoiceToDelete(null)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors">Cancelar</button>
             <button onClick={async () => { if (invoiceToDelete) { await deleteInvoice(invoiceToDelete.id); setInvoiceToDelete(null); } }} className="flex-1 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-700 transition-colors shadow-lg shadow-red-200">Excluir</button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={isDeleteSelectionOpen} onClose={() => setIsDeleteSelectionOpen(false)} title="Limpar Notas" size="xl">
         <div className="p-4 space-y-6">
            <div className="flex items-center justify-between bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
               <div>
                  <div className="text-xl font-black text-zinc-900">{selectedIds.size} / {data.invoices.length}</div>
                  <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Selecionadas para apagar</div>
               </div>
               <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      if (selectedIds.size === data.invoices.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(data.invoices.map(s => s.id)));
                    }}
                    className="px-3 py-1.5 bg-white text-zinc-600 border border-zinc-200 rounded-lg text-[9px] font-black uppercase tracking-tight hover:bg-zinc-100 transition-colors"
                  >
                    {selectedIds.size === data.invoices.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                  </button>
               </div>
            </div>

            <div className="max-h-[60vh] overflow-auto border border-zinc-100 rounded-2xl bg-white">
               <table className="w-full text-[10px]">
                  <thead className="bg-zinc-50 font-black text-[8px] uppercase tracking-widest text-zinc-400 sticky top-0 z-10">
                     <tr>
                        <th className="px-4 py-3 text-left w-10">
                           <input 
                              type="checkbox" 
                              checked={selectedIds.size === data.invoices.length && data.invoices.length > 0} 
                              onChange={() => {
                                if (selectedIds.size === data.invoices.length) setSelectedIds(new Set());
                                else setSelectedIds(new Set(data.invoices.map(s => s.id)));
                              }}
                              className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                           />
                        </th>
                        <th className="px-3 py-3 text-left">Ano/Mês</th>
                        <th className="px-3 py-3 text-left">Fonte Pagadora</th>
                        <th className="px-3 py-3 text-left">Nº Nota</th>
                        <th className="px-3 py-3 text-right">Valor</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                     {[...data.invoices].sort((a,b) => {
                        let dateA = new Date(a.date).getTime();
                        let dateB = new Date(b.date).getTime();
                        
                        if (a.year && a.emissionDayMonth && a.emissionDayMonth.includes('/')) {
                           const [d, m] = a.emissionDayMonth.split('/');
                           dateA = new Date(a.year, parseInt(m)-1, parseInt(d)).getTime();
                        }
                        
                        if (b.year && b.emissionDayMonth && b.emissionDayMonth.includes('/')) {
                           const [d, m] = b.emissionDayMonth.split('/');
                           dateB = new Date(b.year, parseInt(m)-1, parseInt(d)).getTime();
                        }
                        
                        return dateB - dateA;
                     }).map(i => (
                        <tr key={i.id} className="hover:bg-zinc-50/50 transition-colors">
                           <td className="px-4 py-2">
                              <input 
                                 type="checkbox" 
                                 checked={selectedIds.has(i.id)} 
                                 onChange={() => {
                                    const next = new Set(selectedIds);
                                    if (next.has(i.id)) next.delete(i.id);
                                    else next.add(i.id);
                                    setSelectedIds(next);
                                 }}
                                 className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                              />
                           </td>
                           <td className="px-3 py-2 font-mono text-zinc-400">
                              {i.year}/{i.month.toString().padStart(2, '0')}
                           </td>
                           <td className="px-3 py-2 font-black text-zinc-700 uppercase">
                              {data.payers.find(p => p.id === i.mappedPayerId)?.customName || i.originalPayerName || '---'}
                           </td>
                           <td className="px-3 py-2 text-zinc-500 uppercase">{i.noteNumber || 'S/N'}</td>
                           <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                              {formatCurrency(i.grossAmount)}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>

            <div className="flex gap-3">
               <button onClick={() => setIsDeleteSelectionOpen(false)} className="flex-1 py-4 bg-zinc-100 text-zinc-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors">
                  Cancelar
               </button>
               <button 
                  disabled={selectedIds.size === 0 || isDeleting}
                  onClick={() => setIsConfirmingBatchDelete(true)} 
                  className="flex-[2] py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  Apagar {selectedIds.size} Selecionadas
               </button>
            </div>
         </div>
      </Dialog>

      {/* Confirmação final de exclusão de notas */}
      <Dialog isOpen={isConfirmingBatchDelete} onClose={() => setIsConfirmingBatchDelete(false)} title="Confirmar Exclusão Permanente">
        <div className="p-6 text-center space-y-6">
          <p className="text-sm text-zinc-600 leading-relaxed">
            Deseja mesmo excluir permanentemente as <strong className="text-red-600">{selectedIds.size}</strong> notas fiscais selecionadas? 
            <br />
            <span className="text-[11px] text-zinc-400 uppercase font-black tracking-widest block mt-3">⚠️ Esta ação é irreversível e removerá permanentemente os registros!</span>
          </p>
          <div className="flex gap-3">
             <button onClick={() => setIsConfirmingBatchDelete(false)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors">Cancelar</button>
             <button 
               onClick={async () => {
                 setIsDeleting(true);
                 setIsConfirmingBatchDelete(false);
                 try {
                   await deleteInvoices(Array.from(selectedIds));
                   setSelectedIds(new Set());
                   setIsDeleteSelectionOpen(false);
                   toast.success("Notas fiscais excluídas com sucesso!");
                 } catch (err) {
                   toast.error("Erro ao excluir notas.");
                 } finally {
                   setIsDeleting(false);
                 }
               }} 
               className="flex-1 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
             >
               {isDeleting ? "Excluindo..." : "Sim, Excluir"}
             </button>
          </div>
        </div>
      </Dialog>
    </motion.div>
  );
}
