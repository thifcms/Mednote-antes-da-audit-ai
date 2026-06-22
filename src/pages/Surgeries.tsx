import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Dialog } from '../components/ui/Dialog';
import { extractSurgeryLabel } from '../services/ai';
import { 
  SURGERY_FIELDS, 
  getHeadersPattern, 
  suggestAutoMapping, 
  loadMappingFromLocal, 
  saveMappingToLocal, 
  loadMappingFromCloud, 
  saveMappingToCloud 
} from '../services/excelMapping';
import { Plus, Camera, Search, Loader2, Download, FileSpreadsheet, ChevronRight, ChevronLeft, ClipboardCopy, Info, X, Trash2, MessageCircle, Mail, Share2, Edit2, Image as ImageIcon, Maximize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency, findExcelHeaderRow, safeFormat, cn, resizeImage, compressImageSmartly, parseFlexibleDate, parseFinancialAmount } from '../lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

const matchHospitalFlexible = (hosp1: string, hosp2: string): boolean => {
  if (!hosp1 || !hosp2) return false;
  const norm = (s: string) => s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/\b(hospital|hosp|clinica)\b/gi, "")
    .trim();
  const n1 = norm(hosp1);
  const n2 = norm(hosp2);
  if (!n1 || !n2) return false;
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
};

const detectHospitalAndHeader = (rows: any[][]) => {
  const coreKeywords = ['paciente', 'convenio', 'convênio', 'atendimento', 'cirurgia', 'procedimento', 'data'];
  
  let headerIndex = -1;
  let maxCoreMatch = 0;
  let bestHeaderRow: string[] = [];

  // 1. Detect column header row (scanning first 25 rows)
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    
    const rowStrArr = row.map(cell => String(cell || '').toLowerCase().trim());
    
    let matches = 0;
    rowStrArr.forEach(cellText => {
      if (coreKeywords.some(kw => cellText === kw || cellText.includes(kw))) {
        matches++;
      }
    });

    if (matches > maxCoreMatch) {
      maxCoreMatch = matches;
      headerIndex = i;
      bestHeaderRow = row.map(c => String(c || '').trim());
    }
  }

  // Fallback if no strong match of 2+ core header columns is found
  if (headerIndex === -1 || maxCoreMatch < 2) {
    const standard = findExcelHeaderRow(rows, [
      'Paciente', 'Cirurgia', 'Data', 'Hospital', 'Procedimento', 'Convênio', 'Convenio', 'Honorários', 'Recebidos', 'Empresa', 'Atendimento', 'Valor Pago', 'Valor (1/2)', 'DATA DA CIRURGIA', 'DESCRIÇÃO', 'VALOR BRUTO', 'VALOR PAGO', 'PAGO', 'VALOR (1/2)', 'CONVENIO', 'ATENDIMENTO', 'EMPRESA'
    ]);
    headerIndex = standard.headerIndex;
    bestHeaderRow = standard.headerRow;
  }

  // Identify if there is an explicit "HOSPITAL" column in the header row
  const headerRowLower = bestHeaderRow.map(h => String(h || '').toLowerCase().trim());
  const hasHospitalColumn = headerRowLower.some(h => 
    h === 'hospital' || h === 'local' || h === 'hosp' || h.includes('hospital')
  );

  // 2. Scan lines BEFORE headerIndex for loose text (hospital name)
  let looseHospitalText = '';
  const searchLimit = headerIndex !== -1 ? headerIndex : 10;
  
  for (let i = 0; i < searchLimit; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    
    // Get non-empty cells
    const nonColVals = row
      .map(c => String(c || '').trim())
      .filter(val => val.length > 2); // avoid noise
      
    if (nonColVals.length === 1) {
      const val = nonColVals[0];
      const valLower = val.toLowerCase();
      // Avoid common spreadsheet labels that aren't hospital names
      const isGeneric = /faturamento|relatório|relatorio|planilha|controle|cirurgia|total|médico|medico|dr\.|diagnostico|diagnóstico|resumo|consolidado/i.test(valLower);
      if (!isGeneric && val.length > 3) {
        looseHospitalText = val;
        break;
      }
    } else if (nonColVals.length > 0 && nonColVals.length <= 3) {
      // Sometimes it's like ["Hospital:", "SANTA VIRGINIA"]
      for (const val of nonColVals) {
        const valLower = val.toLowerCase();
        const isGeneric = /faturamento|relatório|relatorio|planilha|controle|cirurgia|total|médico|medico|dr\.|diagnostico|diagnóstico|resumo|consolidado/i.test(valLower);
        if (valLower.includes('hospital:') || valLower.includes('local:')) {
          const cleanVal = val.replace(/hospital:|local:/i, '').trim();
          if (cleanVal.length > 3) {
            looseHospitalText = cleanVal;
            break;
          }
        }
        if (!isGeneric && val.length > 4 && !looseHospitalText) {
          looseHospitalText = val;
        }
      }
      if (looseHospitalText) break;
    }
  }

  return {
    headerIndex,
    headerRow: bestHeaderRow,
    detectedHospital: looseHospitalText,
    hasHospitalColumn
  };
};

export function Surgeries() {
  const { user, data, addSurgery, updateSurgery, deleteSurgery, addHospital, deleteSurgeries, deleteAllSurgeries, addSurgeryTemplate } = useApp();
  const [activeHospitalId, setActiveHospitalId] = useState<string | 'ALL'>('ALL');
  
  // Estados para Calibração de Excel
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [calibrationHeaders, setCalibrationHeaders] = useState<string[]>([]);
  const [calibrationMapping, setCalibrationMapping] = useState<Record<string, string>>({});
  const [calibrationPattern, setCalibrationPattern] = useState('');
  const [calibrationFileRows, setCalibrationFileRows] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processando...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [isReconcilingMode, setIsReconcilingMode] = useState(false);
  const [reconciliationState, setReconciliationState] = useState<{
    isOpen: boolean;
    newSurgeries: any[];
    updatedSurgeries: { id: string, updates: any }[];
    unchangedCount: number;
  } | null>(null);
  
  const reconcileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'period' | 'all'>('all');
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isDeleteSelectionOpen, setIsDeleteSelectionOpen] = useState(false);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
  const [pendingHospitalFilter, setPendingHospitalFilter] = useState<string | 'ALL'>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  


  const [isViewPhotoModalOpen, setIsViewPhotoModalOpen] = useState(false);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(0);
  const [targetSurgeryIdForPhoto, setTargetSurgeryIdForPhoto] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  
  // Reseta o zoom quando muda de foto ou sai do fullscreen
  useEffect(() => {
    setZoomScale(1);
  }, [viewingPhotoIndex, isFullscreen]);

  // Teclado para navegação e fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isViewPhotoModalOpen && !isFullscreen) return;

      if (e.key === 'Escape') {
        setIsFullscreen(false);
        setIsViewPhotoModalOpen(false);
      }

      const activeSurgery = targetSurgeryIdForPhoto ? data.surgeries.find(s => s.id === targetSurgeryIdForPhoto) : null;
      const totalPhotos = activeSurgery?.photos?.length || 0;

      if (totalPhotos > 1) {
        if (e.key === 'ArrowRight') {
          setViewingPhotoIndex(prev => (prev < totalPhotos - 1 ? prev + 1 : prev));
        }
        if (e.key === 'ArrowLeft') {
          setViewingPhotoIndex(prev => (prev > 0 ? prev - 1 : prev));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isViewPhotoModalOpen, isFullscreen, targetSurgeryIdForPhoto, data.surgeries]);
  
  interface QueueItem {
    id: string;
    file: File;
    status: 'waiting' | 'processing' | 'completed' | 'completed_low_confidence' | 'failed';
    errorMessage?: string;
    result?: any;
    addedAt: Date;
  }

   const [queue, setQueue] = useState<QueueItem[]>([]);
   const [currentItemIdInModal, setCurrentItemIdInModal] = useState<string | null>(null);
   const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
 
   const [lastMetrics, setLastMetrics] = useState<any>(() => {
     return (window as any).__lastExtractionMetrics || null;
   });
 
   useEffect(() => {
     const handleUpdate = () => {
       setLastMetrics((window as any).__lastExtractionMetrics ? { ...(window as any).__lastExtractionMetrics } : null);
     };
     window.addEventListener('extractionMetricsUpdated', handleUpdate);
     return () => window.removeEventListener('extractionMetricsUpdated', handleUpdate);
   }, []);
 
   useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.info("Conexão reestabelecida. Retomando fila de processamento...");
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Você está offline. Fila pausada até a conexão voltar.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const processQueueItem = async (itemId: string, file: File) => {
    setQueue(prev => prev.map(item => item.id === itemId ? { ...item, status: 'processing' } : item));
    
    try {
      const extracted = await extractSurgeryLabel(file);
      
      const isLowConfidence = !!(extracted as any)?.isLocalOCR;
      const finalStatus = isLowConfidence ? 'completed_low_confidence' : 'completed';
      
      if ((extracted as any)?._quotaExhausted || (extracted as any)?._usedModel?.includes('GEMINI_API_KEY_PAID')) {
        toast.warning(
          '⚠️ Usando processamento pago — cota gratuita esgotada hoje. Renova à meia-noite (horário de Brasília).',
          { duration: 8000 }
        );
      }
      
      let hospitalId = '';
      if (extracted && extracted.hospital && data.hospitals) {
        const hName = extracted.hospital;
        const found = data.hospitals.find(h => 
          matchHospitalFlexible(h.name, hName)
        );
        if (found) hospitalId = found.id;
      }
      
      const preparedData = {
        ...extracted,
        hospitalId,
        date: (extracted && extracted.date) || new Date().toISOString().split('T')[0]
      };
      
      setQueue(prev => prev.map(current => 
        current.id === itemId 
          ? { ...current, status: finalStatus, result: preparedData } 
          : current
      ));
      
      toast.success(`Leitura concluída para: ${extracted?.patientName || 'Etiqueta de Cirurgia'}`, {
        description: isLowConfidence ? '⚠️ Baixa confiança (OCR Local, por favor revise)' : '✨ IA com sucesso'
      });
      
    } catch (err: any) {
      console.error("Erro no processamento da fila:", err);
      let msg = 'A leitura falhou. Tente uma foto mais nítida.';
      if (err instanceof Error && err.message) {
        msg = err.message;
      }
      
      setQueue(prev => prev.map(current => 
        current.id === itemId 
          ? { ...current, status: 'failed', errorMessage: msg } 
          : current
      ));
      
      toast.error(`Falha no processamento: ${msg}`);
    }
  };

  useEffect(() => {
    const nextItem = queue.find(item => item.status === 'waiting');
    const isAnyProcessing = queue.some(item => item.status === 'processing');
    
    if (nextItem && !isAnyProcessing && isOnline) {
      processQueueItem(nextItem.id, nextItem.file);
    }
  }, [queue, isOnline]);

  const handleReviewQueueItem = (item: QueueItem) => {
    if (!item.result) return;
    setCurrentItemIdInModal(item.id);
    setDraftSurgery({
      ...item.result,
      isLocalOCR: item.status === 'completed_low_confidence'
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (currentItemIdInModal) {
      setQueue(prev => prev.filter(item => item.id !== currentItemIdInModal));
    }
    setIsModalOpen(false);
    setDraftSurgery(null);
    setCurrentItemIdInModal(null);
  };

  const completedItemIdsString = queue
    .filter(item => item.status === 'completed' || item.status === 'completed_low_confidence')
    .map(item => item.id)
    .join(',');

  useEffect(() => {
    if (isModalOpen || !completedItemIdsString) return;
    const completedIds = completedItemIdsString.split(',');
    if (completedIds.length > 0 && completedIds[0]) {
      const nextCompletedItem = queue.find(item => item.id === completedIds[0]);
      if (nextCompletedItem) {
        handleReviewQueueItem(nextCompletedItem);
      }
    }
  }, [completedItemIdsString, isModalOpen]);

  const [draftSurgery, setDraftSurgery] = useState<any>(null);
  const [formFields, setFormFields] = useState({
    indication: '',
    procedure: ''
  });
  const [activeSuggestionField, setActiveSuggestionField] = useState<'indication' | 'procedure' | null>(null);

  React.useEffect(() => {
    if (draftSurgery) {
      setFormFields({
        indication: draftSurgery.indication || draftSurgery.procedure || '',
        procedure: draftSurgery.procedure || ''
      });
    } else {
      setFormFields({
        indication: '',
        procedure: ''
      });
    }
  }, [draftSurgery]);

  const filteredTemplates = React.useMemo(() => {
    if (!activeSuggestionField) return [];
    const val = activeSuggestionField === 'indication' ? formFields.indication : formFields.procedure;
    if (!val || val.trim().length === 0) return [];
    
    const term = val.toLowerCase().trim();
    return (data.surgery_templates || [])
      .filter(t => {
        const matchText = activeSuggestionField === 'indication' ? t.diagnosis : t.procedure;
        return (matchText || '').toLowerCase().includes(term);
      })
      .slice(0, 5);
  }, [data.surgery_templates, activeSuggestionField, formFields.indication, formFields.procedure]);
  
  const [previewSurgeries, setPreviewSurgeries] = useState<any[] | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const updatePreviewSurgery = (index: number, field: string, value: any) => {
    if (!previewSurgeries) return;
    const newSurgeries = [...previewSurgeries];
    newSurgeries[index] = { ...newSurgeries[index], [field]: value };
    setPreviewSurgeries(newSurgeries);
  };

  const removePreviewSurgery = (index: number) => {
    if (!previewSurgeries) return;
    const newSurgeries = previewSurgeries.filter((_, i) => i !== index);
    setPreviewSurgeries(newSurgeries);
  };

  const addBlankSurgery = () => {
    const blank = {
      date: new Date().toISOString().split('T')[0],
      patientName: '',
      procedure: '',
      indication: '',
      insurance: '',
      attendance: '',
      company: '',
      hospitalId: '',
      hospitalName: '',
      feesPaid: 0,
      receivedAmount: 0,
      notes: '',
      isParticular: false,
      particularValue: 0,
      photos: []
    };
    setPreviewSurgeries(prev => prev ? [blank, ...prev] : [blank]);
    setIsPreviewOpen(true);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoCameraInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0 || !targetSurgeryIdForPhoto) return;

    const surgery = data.surgeries.find(s => s.id === targetSurgeryIdForPhoto);
    if (!surgery) return;

    const currentPhotos = surgery.photos || [];
    if (currentPhotos.length >= 4) {
       toast.error("Limite de 4 fotos atingido.");
       setTargetSurgeryIdForPhoto(null);
       return;
    }

    const remainingSlots = 4 - currentPhotos.length;
    const filesToProcess = files.slice(0, remainingSlots);

    try {
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;
      let networkType = '';

      const resizedPhotos = await Promise.all(filesToProcess.map(async (file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            const res = await compressImageSmartly(base64);
            totalOriginalSize += res.originalSizeKB;
            totalCompressedSize += res.compressedSizeKB;
            networkType = res.networkType;
            resolve(res.base64);
          };
          reader.readAsDataURL(file);
        });
      }));

      await updateSurgery(targetSurgeryIdForPhoto, { 
        photos: [...currentPhotos, ...resizedPhotos] 
      });
      
      const averageSavings = totalOriginalSize > 0 
        ? Math.round(((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100)
        : 0;

      if (filesToProcess.length > 0) {
        toast.success(
          <div className="flex flex-col gap-1 text-left">
            <span className="font-bold text-zinc-900">✓ {filesToProcess.length > 1 ? `${filesToProcess.length} Fotos Otimizadas e Salvas!` : "Foto Otimizada e Salva!"}</span>
            <span className="text-[10px] text-zinc-500 leading-relaxed">
              📊 Economia de Dados Móveis: de <strong>{totalOriginalSize} KB</strong> para <strong>{totalCompressedSize} KB</strong> (redução de <strong>{averageSavings}%</strong> sob rede {networkType.toUpperCase()})
            </span>
          </div>,
          { duration: 5000 }
        );
      }
      
      // Update viewing index to the last newly added photo if modal is open
      if (isViewPhotoModalOpen) {
        setViewingPhotoIndex(currentPhotos.length + resizedPhotos.length - 1);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar fotos. O arquivo pode ser muito grande.");
    }
    
    // Only reset target ID if we are NOT in the view modal
    if (!isViewPhotoModalOpen) {
      setTargetSurgeryIdForPhoto(null);
    }
    
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (photoCameraInputRef.current) photoCameraInputRef.current.value = '';
  };

  const handleDeletePhoto = async () => {
    if (!targetSurgeryIdForPhoto) return;
    const surgery = data.surgeries.find(s => s.id === targetSurgeryIdForPhoto);
    if (!surgery || !surgery.photos) return;

    const newPhotos = surgery.photos.filter((_, i) => i !== viewingPhotoIndex);
    await updateSurgery(targetSurgeryIdForPhoto, { photos: newPhotos });
    
    if (newPhotos.length === 0) {
      setIsViewPhotoModalOpen(false);
      setTargetSurgeryIdForPhoto(null);
    } else {
      setViewingPhotoIndex(Math.max(0, viewingPhotoIndex - 1));
    }
    toast.success("Foto excluída.");
  };

  const processImportedSurgeries = (rows: any[]) => {
    const surgeriesToImport: any[] = [];
    const seenKeys = new Set<string>(); // To prevent internal duplicates in the same file
    const newlyAddedHospitals = new Map<string, string>();
    let lastHospital: any = null;
    let lastDate: any = null;

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

      const patientNameRaw = getVal(['Paciente', 'Nome', 'Patient Name', 'NOME']);
      const patientName = String(patientNameRaw || '').trim();
      
      const insurance = String(getVal(['Convênio', 'Convenio', 'SEGURADORA', 'Seguro', 'CONVENIO']) || '').trim();
      const attendance = String(getVal(['Atendimento', 'ATEND', 'Atend.', 'ATENDIMENTO']) || '').trim();
      const procedure = String(getVal(['Cirurgia', 'Procedimento', 'DESCRIÇÃO', 'PROCEDIMENTO']) || '').trim();
      const indication = String(getVal(['Indicação', 'Indicacao', 'Diagnóstico', 'Diagnostico', 'MOTIVO']) || '').trim();
      const company = String(getVal(['Empresa', 'Fornecedora', 'FORNECEDOR', 'EMPRESA']) || '').trim();
      const dateRaw = getVal(['Data', 'DATE', 'DATA CIRURGIA', 'DATA DA CIRURGIA']);
      
      const sheetName = row['_SheetName'];
      const detectedHospital = row['_DetectedHospital'];
      const hospitalRaw = getVal(['Hospital', 'Local', 'HOSPITAL']);
      const hadHospitalColumn = row['_HadHospitalColumn'] === true || !!hospitalRaw;
      
      let hospitalName = '';
      if (hadHospitalColumn) {
        hospitalName = String(hospitalRaw || lastHospital || '').trim();
      } else {
        hospitalName = String(detectedHospital || '').trim();
      }
      
      if (hospitalName) {
        lastHospital = hospitalName;
      }
      
      const rawFeesPaid = getVal(['Honorários', 'Honorários Pagos', 'Fees Paid', 'VALOR BRUTO', 'Valor Pago', 'VALOR PAGO']);
      const rawReceivedAmount = getVal(['Recebidos', 'Honorários Recebidos', 'Valor (1/2)', 'PAGO', 'Valor Recebido', 'VALOR (1/2)']);
      
      let feesPaid = parseFinancialAmount(rawFeesPaid);
      let receivedAmount = parseFinancialAmount(rawReceivedAmount);
      
      if (rawFeesPaid === rawReceivedAmount && rawFeesPaid) {
        receivedAmount = 0;
      }

      let date = parseFlexibleDate(dateRaw);
      if (!date && lastDate) date = lastDate;
      if (date) lastDate = date;

      if (patientName || procedure) {
        const key = `${date || ''}-${patientName.toLowerCase().trim()}-${(procedure || '').toLowerCase().trim()}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        let finalHospitalId = '';
        if (hospitalName) {
          const lowerName = hospitalName.toLowerCase();
          const existing = data.hospitals.find(x => (x.name || '').toLowerCase().trim() === lowerName);
          
          if (existing) finalHospitalId = existing.id;
          else if (newlyAddedHospitals.has(lowerName)) finalHospitalId = newlyAddedHospitals.get(lowerName)!;
          else {
            finalHospitalId = `NEW:${hospitalName}`;
          }
        }
        surgeriesToImport.push({ 
          date: date || new Date().toISOString().split('T')[0], 
          patientName, 
          procedure: procedure || 'Cirurgia Importada', 
          indication: indication || '',
          insurance, 
          attendance, 
          company, 
          feesPaid: isNaN(feesPaid) ? 0 : feesPaid, 
          receivedAmount: isNaN(receivedAmount) ? 0 : receivedAmount, 
          hospitalId: finalHospitalId, 
          hospitalName: hospitalName,
          notes: '',
          isParticular: false,
          particularValue: 0,
          photos: [] 
        });
      }
    });
    return surgeriesToImport;
  };

  const confirmImport = async () => {
    if (!previewSurgeries) return;
    let importedCount = 0;
    let skippedCount = 0;

    // Use a local copy to track what's being added in the current batch
    const currentSurgeries = [...data.surgeries];
    const createdHospitalsCache = new Map<string, string>();

    for (const s of previewSurgeries) {
      // Check for duplicates in existing data AND in the current batch
      const isDuplicate = currentSurgeries.some(existing => 
        existing.date === s.date && 
        (existing.patientName || '').toLowerCase().trim() === (s.patientName || '').toLowerCase().trim() &&
        (existing.procedure || '').toLowerCase().trim() === (s.procedure || '').toLowerCase().trim()
      );

      if (isDuplicate) {
        console.warn('Surgery already exists, skipping:', s.patientName);
        skippedCount++;
        continue;
      }

      let finalHospitalId = s.hospitalId;
      if (finalHospitalId?.startsWith('NEW:')) {
        const hospitalName = s.hospitalName;
        const lowerName = hospitalName.toLowerCase().trim();
        const existing = data.hospitals.find(x => matchHospitalFlexible(x.name, hospitalName));
        if (existing) {
          finalHospitalId = existing.id;
        } else if (createdHospitalsCache.has(lowerName)) {
          finalHospitalId = createdHospitalsCache.get(lowerName)!;
        } else {
          const newHospId = crypto.randomUUID();
          await addHospital({
            id: newHospId,
            name: hospitalName
          });
          createdHospitalsCache.set(lowerName, newHospId);
          finalHospitalId = newHospId;
        }
      }
      
      await addSurgery({ ...s, hospitalId: finalHospitalId });
      // Add to our local copy to prevent duplicates within the same import batch
      currentSurgeries.push({ ...s, hospitalId: finalHospitalId, id: Date.now().toString() + Math.random() });
      importedCount++;
    }

    setPreviewSurgeries(null);
    setIsPreviewOpen(false);
  };

  const handleSaveCalibration = async () => {
    // Validação mínima: verificar se os campos obrigatórios têm coluna mapeada
    const missingFields = SURGERY_FIELDS.filter(f => f.required && !calibrationMapping[f.key]);
    if (missingFields.length > 0) {
      toast.error(`Associe colunas para os campos obrigatórios: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    saveMappingToLocal(calibrationPattern, calibrationMapping);
    if (user?.uid) {
      await saveMappingToCloud(user.uid, calibrationPattern, calibrationMapping, 'surgeries');
    }
    setIsCalibrationOpen(false);
    
    // Processa a planilha com o mapeamento calibrado
    if (isReconcilingMode) {
      processReconciliationWithOptions(calibrationMapping, calibrationFileRows);
    } else {
      processExcelWithOptions(calibrationMapping, calibrationFileRows);
    }
  };

  const processImportedSurgeriesWithNormalizedKeys = (rows: any[]) => {
    const surgeriesToImport: any[] = [];
    const seenKeys = new Set<string>();
    const newlyAddedHospitals = new Map<string, string>();
    let lastHospital: any = null;
    let lastDate: any = null;

    rows.forEach((row: any) => {
      const patientName = String(row.patientName || '').trim();
      const insurance = String(row.insurance || '').trim();
      const attendance = String(row.attendance || '').trim();
      const procedure = String(row.procedure || '').trim();
      const indication = String(row.indication || '').trim();
      const company = String(row.company || '').trim();
      const dateRaw = row.date;
      
      const sheetName = String(row['_SheetName'] || '').trim();
      const detectedHospital = String(row['_DetectedHospital'] || '').trim();
      const hospitalRaw = String(row.hospitalName || '').trim();
      const hadHospitalColumn = row['_HadHospitalColumn'] === true;
      
      let hospitalName = '';
      if (hadHospitalColumn) {
        hospitalName = hospitalRaw || lastHospital || '';
      } else {
        hospitalName = detectedHospital || '';
      }
      
      if (hospitalName) {
         lastHospital = hospitalName;
      }
      
      let feesPaid = parseFinancialAmount(row.feesPaid);
      let receivedAmount = parseFinancialAmount(row.receivedAmount);

      let date = parseFlexibleDate(dateRaw);
      if (!date && lastDate) date = lastDate;
      if (date) lastDate = date;

      if (patientName || procedure || indication) {
        const key = `${date || ''}-${(patientName || '').toLowerCase().trim()}-${(procedure || indication || '').toLowerCase().trim()}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        let finalHospitalId = '';
        if (hospitalName) {
          const lowerName = hospitalName.toLowerCase();
          const existing = data.hospitals.find(x => (x.name || '').toLowerCase().trim() === lowerName);
          
          if (existing) finalHospitalId = existing.id;
          else if (newlyAddedHospitals.has(lowerName)) finalHospitalId = newlyAddedHospitals.get(lowerName)!;
          else {
            finalHospitalId = `NEW:${hospitalName}`;
          }
        }
        surgeriesToImport.push({ 
          date: date || new Date().toISOString().split('T')[0], 
          patientName, 
          procedure: procedure || indication || 'Cirurgia Importada', 
          indication: indication || '',
          insurance, 
          attendance, 
          company, 
          feesPaid: isNaN(feesPaid) ? 0 : feesPaid, 
          receivedAmount: isNaN(receivedAmount) ? 0 : receivedAmount, 
          hospitalId: finalHospitalId, 
          hospitalName: hospitalName,
          notes: '',
          isParticular: false,
          particularValue: 0,
          photos: [] 
        });
      }
    });
    return surgeriesToImport;
  };

  const processExcelWithOptions = (mapping: Record<string, string>, sheetsData: any[]) => {
    setIsImporting(true);
    setImportMessage('Mapeando e processando dados...');
    
    try {
      let allProcessedSurgeries: any[] = [];
      
      for (const sheet of sheetsData) {
        const { sheetName, sheetHospital, hasHospitalColumn, rows, headerIndex, headerRow } = sheet;
        
        // Reconstrói o mappedData com chaves normalizadas
        const mappedData = rows.slice(headerIndex + 1).map(r => {
          if (!r || !Array.isArray(r)) return null;
          
          // Verifica se a linha está totalmente vazia
          const isEmpty = r.every(cell => cell === undefined || cell === null || String(cell).trim() === "");
          if (isEmpty) return null;

          const obj: any = {};
          
          // Mapeamento insensível a maiúsculas/minúsculas para compatibilidade entre abas
          const headerRowLower = headerRow.map(h => String(h || '').toLowerCase().trim());
          
          // Resolução inteligente e desduplicação de feesPaid e receivedAmount para cada aba
          let feesPaidIdx = -1;
          let receivedAmountIdx = -1;
          
          if (mapping['feesPaid']) {
            feesPaidIdx = headerRowLower.indexOf(String(mapping['feesPaid']).toLowerCase().trim());
          }
          if (mapping['receivedAmount']) {
            receivedAmountIdx = headerRowLower.indexOf(String(mapping['receivedAmount']).toLowerCase().trim());
          }
          
          // Se as duas apontam para a mesma coluna de honorários ou se receivedAmount não tem mapeamento forte
          if (feesPaidIdx !== -1) {
            if (feesPaidIdx === receivedAmountIdx || receivedAmountIdx === -1) {
              const rightIdx = feesPaidIdx + 1;
              if (rightIdx < headerRow.length) {
                const rightHeader = String(headerRow[rightIdx] || '').toLowerCase().trim();
                const isCriticalMapping = ['patientname', 'date', 'procedure', 'hospitalname', 'insurance'].some(k => 
                  mapping[k] && String(mapping[k]).toLowerCase().trim() === rightHeader
                );
                if (!isCriticalMapping) {
                  receivedAmountIdx = rightIdx;
                }
              }
            }
          }
          
          // Trata o caso em que elas continuam iguais por falta de coluna à direita
          if (feesPaidIdx !== -1 && feesPaidIdx === receivedAmountIdx) {
            receivedAmountIdx = -1; // zera receivedAmount para evitar duplicar
          }

          Object.entries(mapping).forEach(([systemKey, excelHeader]) => {
            if (systemKey === 'feesPaid') {
              obj['feesPaid'] = feesPaidIdx !== -1 && r[feesPaidIdx] !== undefined ? r[feesPaidIdx] : '';
            } else if (systemKey === 'receivedAmount') {
              obj['receivedAmount'] = receivedAmountIdx !== -1 && r[receivedAmountIdx] !== undefined ? r[receivedAmountIdx] : '';
            } else {
              if (excelHeader) {
                const headerIndexInRow = headerRowLower.indexOf(String(excelHeader).toLowerCase().trim());
                if (headerIndexInRow !== -1) {
                  obj[systemKey] = r[headerIndexInRow] !== undefined ? r[headerIndexInRow] : '';
                } else {
                  obj[systemKey] = '';
                }
              } else {
                obj[systemKey] = '';
              }
            }
          });
          
          obj['_SheetName'] = sheetName;
          obj['_DetectedHospital'] = sheetHospital;
          obj['_HadHospitalColumn'] = hasHospitalColumn;
          return obj;
        }).filter(Boolean).filter(obj => {
          if (!obj) return false;
          const values = Object.entries(obj)
            .filter(([key]) => key !== '_SheetName' && key !== '_DetectedHospital' && key !== '_HadHospitalColumn')
            .map(([_, v]) => v);
          return values.some(v => v !== '');
        });
        
        if (mappedData.length > 0) {
          const processed = processImportedSurgeriesWithNormalizedKeys(mappedData);
          allProcessedSurgeries = [...allProcessedSurgeries, ...processed];
        }
      }
      
      if (allProcessedSurgeries.length > 0) {
        setPreviewSurgeries(allProcessedSurgeries);
        setIsPreviewOpen(true);
      } else {
        toast.warning('Nenhum dado encontrado nas abas do arquivo.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao mapear a planilha.');
    } finally {
      setIsImporting(false);
    }
  };

  const processReconciliationWithOptions = (mapping: Record<string, string>, sheetsData: any[]) => {
    setIsImporting(true);
    setImportMessage('Preparando reconciliação...');
    
    try {
      let sheetsItems: any[] = [];
      const newSurgeries: any[] = [];
      const updatedSurgeries: { id: string, updates: any }[] = [];
      
      const normalizeText = (text: string) => text ? text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
      
      const getNormalizedDateStr = (dateVal: any) => {
        const d = parseFlexibleDate(dateVal);
        if (!d) return "";
        return d;
      };

      sheetsData.forEach(({ sheetName, sheetHospital, hasHospitalColumn, rows, headerIndex, headerRow }) => {
        const dataRows = rows.slice(headerIndex + 1);
        const mappedData = dataRows.map((row: any[]) => {
          if (!row || !Array.isArray(row)) return null;
          
          // Verifica se a linha está totalmente vazia
          const isEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === "");
          if (isEmpty) return null;

           const obj: any = {};
          // Mapeamento insensível a maiúsculas/minúsculas para compatibilidade entre abas
          const headerRowLower = headerRow.map(h => String(h || '').toLowerCase().trim());
          
          // Resolução inteligente e desduplicação de feesPaid e receivedAmount para cada aba
          let feesPaidIdx = -1;
          let receivedAmountIdx = -1;
          
          if (mapping['feesPaid']) {
            feesPaidIdx = headerRowLower.indexOf(String(mapping['feesPaid']).toLowerCase().trim());
          }
          if (mapping['receivedAmount']) {
            receivedAmountIdx = headerRowLower.indexOf(String(mapping['receivedAmount']).toLowerCase().trim());
          }
          
          // Se as duas apontam para a mesma coluna de honorários ou se receivedAmount não tem mapeamento forte
          if (feesPaidIdx !== -1) {
            if (feesPaidIdx === receivedAmountIdx || receivedAmountIdx === -1) {
              const rightIdx = feesPaidIdx + 1;
              if (rightIdx < headerRow.length) {
                const rightHeader = String(headerRow[rightIdx] || '').toLowerCase().trim();
                const isCriticalMapping = ['patientname', 'date', 'procedure', 'hospitalname', 'insurance'].some(k => 
                  mapping[k] && String(mapping[k]).toLowerCase().trim() === rightHeader
                );
                if (!isCriticalMapping) {
                  receivedAmountIdx = rightIdx;
                }
              }
            }
          }
          
          // Trata o caso em que elas continuam iguais por falta de coluna à direita
          if (feesPaidIdx !== -1 && feesPaidIdx === receivedAmountIdx) {
            receivedAmountIdx = -1; // zera receivedAmount para evitar duplicar
          }

          Object.entries(mapping).forEach(([systemKey, excelHeader]) => {
            if (systemKey === 'feesPaid') {
              obj['feesPaid'] = feesPaidIdx !== -1 && row[feesPaidIdx] !== undefined ? row[feesPaidIdx] : '';
            } else if (systemKey === 'receivedAmount') {
              obj['receivedAmount'] = receivedAmountIdx !== -1 && row[receivedAmountIdx] !== undefined ? row[receivedAmountIdx] : '';
            } else {
              if (excelHeader) {
                const headerIndexInRow = headerRowLower.indexOf(String(excelHeader).toLowerCase().trim());
                if (headerIndexInRow !== -1) {
                  obj[systemKey] = row[headerIndexInRow] !== undefined ? row[headerIndexInRow] : '';
                } else {
                  obj[systemKey] = '';
                }
              } else {
                obj[systemKey] = '';
              }
            }
          });
          obj['_SheetName'] = sheetName;
          obj['_DetectedHospital'] = sheetHospital;
          obj['_HadHospitalColumn'] = hasHospitalColumn;
          return obj;
        }).filter(Boolean).filter((obj: any) => obj && Object.keys(obj).length > 2 && obj.patientName);
        
        console.log(`Reconciliation Sheet [${sheetName}]: Data Rows: ${dataRows.length}, Mapped: ${mappedData.length}`);
        const processed = processImportedSurgeriesWithNormalizedKeys(mappedData);
        sheetsItems.push(...processed);
      });
      
      console.log(`Reconciliation Total Processed Items: ${sheetsItems.length}`);
      
      sheetsItems.forEach((excelSurgery) => {
        const name1 = normalizeText(excelSurgery.patientName);
        const att1 = normalizeText(excelSurgery.attendance);
        const d1 = getNormalizedDateStr(excelSurgery.date);
        
        const match = data.surgeries?.find(s => {
          const name2 = normalizeText(s.patientName);
          const att2 = normalizeText(s.attendance);
          const d2 = getNormalizedDateStr(s.date);
          
          if (!name1 || !name2 || !d1 || !d2) return false;
          if (att1 && att2) {
             return name1 === name2 && att1 === att2 && d1 === d2;
          }
          return name1 === name2 && d1 === d2;
        });

        if (match) {
          // Mantém os dados da cirurgia existente e apenas mescla campos faltantes/importantes 
          // do Excel, garantindo que NADA do que foi feito no app (fotos, notas) seja apagado.
          const updates: any = {};
          let hasUpdates = false;

          Object.keys(excelSurgery).forEach(key => {
            // Ignora campos do app que nunca devem ser sobrescritos pelo Excel
            if (['id', 'photos', 'notes', 'isParticular', 'particularValue', 'aiSourceHash', 'userId', 'createdAt'].includes(key)) return;
            
            const excelValue = excelSurgery[key];
            const currentValue = (match as any)[key];

            // Só atualiza se o Excel tiver um dado válido, e se for diferente do atual
            if (excelValue !== undefined && excelValue !== null && excelValue !== '' && excelValue !== 0 && excelValue !== 'Cirurgia Importada') {
               if (currentValue !== excelValue || (key === 'hospitalId' && String(currentValue).startsWith('NEW:'))) {
                 // Para campos de preenchimento de segurança, preferimos apenas adicionar se estiver vazio no app,
                 // exceto para "institucionais" como numero de atendimento, convenio e hospital, que o Excel domina.
                 if (!currentValue || currentValue === 'Cirurgia Importada' || String(currentValue).startsWith('NEW:') || ['insurance', 'attendance', 'hospitalId', 'hospitalName', 'feesPaid', 'receivedAmount', 'company'].includes(key)) {
                    updates[key] = excelValue;
                    hasUpdates = true;
                 }
               }
            }
          });

          if (hasUpdates) {
            updatedSurgeries.push({ id: match.id, updates });
          }
        } else {
          // Excel only -> new
          newSurgeries.push(excelSurgery);
        }
      });

      const unchangedCount = (data.surgeries?.length || 0) - updatedSurgeries.length;

      setReconciliationState({
        isOpen: true,
        newSurgeries,
        updatedSurgeries,
        unchangedCount
      });

    } catch (err) {
      console.error(err);
      toast.error('Erro ao mapear a planilha para reconciliação.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, isReconcile: boolean = false) => {
    setIsReconcilingMode(isReconcile);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size < 100) {
      toast.warning("O arquivo selecionado parece ser um atalho ou está vazio. Se você estiver usando o OneDrive, tente usar a opção 'COLAR' ou baixe o arquivo para o seu dispositivo.");
      return;
    }

    setIsImporting(true);
    setImportMessage(isReconcile ? 'Lendo arquivo de reconciliação...' : 'Lendo arquivo...');

    const reader = new FileReader();
    reader.onload = (evt) => {
      setTimeout(async () => {
        try {
          const ab = evt.target?.result;
          if (!ab) {
            setIsImporting(false);
            return;
          }
          const wb = XLSX.read(ab, { type: 'array', cellDates: true });
          
          let firstSheetHeaders: string[] = [];
          const excelSheetsData: any[] = [];
          
          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            let rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: true });
            if (rows.length === 0) continue;
            
            // Log do comprimento original
            console.log(`[Excel Reader] Aba: ${sheetName}. Linhas lidas originalmente: ${rows.length}`);

            // Trunca as linhas somente se houver 5 ou mais consecutivas completamente vazias
            let consecutiveEmptyCount = 0;
            let truncateIndex = rows.length;
            
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const isEmpty = !row || !Array.isArray(row) || row.every(cell => cell === undefined || cell === null || String(cell).trim() === "");
              if (isEmpty) {
                consecutiveEmptyCount++;
                if (consecutiveEmptyCount >= 5) {
                  truncateIndex = i - 4; // Trunca no início da sequência de 5 vazias
                  break;
                }
              } else {
                consecutiveEmptyCount = 0;
              }
            }
            
            rows = rows.slice(0, truncateIndex);
            console.log(`[Excel Reader] Aba: ${sheetName}. Linhas após truncamento de segurança (5 vazias seguidas): ${rows.length}`);

            const { headerIndex, headerRow, detectedHospital, hasHospitalColumn } = detectHospitalAndHeader(rows);
            
            excelSheetsData.push({
              sheetName,
              sheetHospital: detectedHospital,
              hasHospitalColumn,
              rows,
              headerIndex,
              headerRow
            });
            
            if (firstSheetHeaders.length === 0 && headerRow.length > 0) {
              firstSheetHeaders = headerRow;
            }
          }

          if (firstSheetHeaders.length === 0) {
            toast.warning('Nenhum cabeçalho identificável encontrado na planilha.');
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

          // Se activeMapping foi recuperado, mas contém valores duplicados ou vazios, aplica a correção on-the-fly
          if (activeMapping) {
            const feesPaidCol = activeMapping['feesPaid'];
            const receivedCol = activeMapping['receivedAmount'];
            
            if (feesPaidCol && (feesPaidCol === receivedCol || !receivedCol)) {
              const fIdx = firstSheetHeaders.indexOf(feesPaidCol);
              if (fIdx !== -1 && fIdx + 1 < firstSheetHeaders.length) {
                const rightH = firstSheetHeaders[fIdx + 1];
                if (rightH) {
                  activeMapping['receivedAmount'] = rightH;
                  saveMappingToLocal(pattern, activeMapping);
                  if (user?.uid) {
                    await saveMappingToCloud(user.uid, pattern, activeMapping, 'surgeries');
                  }
                }
              }
            }
          }
          
          // 3. Tentar auto-sugestão fuzzy
          let needsCalibration = false;
          if (!activeMapping) {
            const auto = suggestAutoMapping(firstSheetHeaders, SURGERY_FIELDS);
            activeMapping = auto.mapping;
            if (!auto.confidence) {
              needsCalibration = true;
            } else {
              saveMappingToLocal(pattern, activeMapping);
              if (user?.uid) {
                saveMappingToCloud(user.uid, pattern, activeMapping, 'surgeries');
              }
            }
          }
          
          if (needsCalibration) {
            setCalibrationMapping(activeMapping || {});
            setIsCalibrationOpen(true);
            setIsImporting(false);
          } else {
            if (isReconcile) {
              processReconciliationWithOptions(activeMapping, excelSheetsData);
            } else {
              processExcelWithOptions(activeMapping, excelSheetsData);
            }
          }

        } catch (err) {
          console.error(err);
          toast.error('Erro ao ler o Excel. Certifique-se de que é um arquivo .xlsx válido.');
          setIsImporting(false);
        }
      }, 100);
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
    if (reconcileInputRef.current) reconcileInputRef.current.value = '';
  };

  const handlePasteProcess = () => {
    if (!pasteContent.trim()) return;
    try {
      const allLines = pasteContent.split('\n').filter(l => l.trim()).map(line => line.split('\t').map(c => c.trim()));
      
      if (allLines.length < 2) {
         toast.warning('Conteúdo insuficiente. Copie o cabeçalho e as linhas da planilha.');
         return;
      }
      
      const { headerIndex, headerRow } = findExcelHeaderRow(allLines, [
        'Paciente', 'Cirurgia', 'Data', 'Hospital', 'Procedimento', 'Convênio', 'Convenio', 'Honorários', 'Recebidos', 'Empresa', 'Atendimento', 'Valor Pago', 'Valor (1/2)', 'DATA DA CIRURGIA', 'DESCRIÇÃO', 'VALOR BRUTO', 'VALOR PAGO', 'PAGO', 'VALOR (1/2)', 'CONVENIO', 'ATENDIMENTO', 'EMPRESA'
      ]);

      const rows = allLines.slice(headerIndex + 1).map(line => {
        const obj: any = {};
        headerRow.forEach((h, i) => {
          if (h) obj[h] = line[i] || '';
        });
        return obj;
      });

      const processed = processImportedSurgeries(rows);
      if (processed.length > 0) {
        setPreviewSurgeries(processed);
        setIsPreviewOpen(true);
        setIsPasteModalOpen(false);
        setPasteContent('');
      } else {
        toast.warning('Nenhum dado válido identificado no texto colado.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao processar. Copie as células diretamente do Excel.');
    }
  };




  const handleExcelExport = (type: 'current' | 'all') => {
    const listToExport = type === 'current' ? filteredSurgeries : data.surgeries;
    if (listToExport.length === 0) {
      toast.warning('Nenhum dado para exportar.');
      return;
    }

    const exportData = listToExport.map(s => {
      const hosp = data.hospitals.find(h => h.id === s.hospitalId);
      return {
                'Data': safeFormat(s.date, 'dd/MM/yyyy', 'INVÁLIDO'),
        'Paciente': s.patientName,
        'Indicação': s.indication || '',
        'Convênio': s.insurance,
        'Atendimento': s.attendance,
        'Cirurgia': s.procedure,
        'Empresa': s.company,
        'Hospital': hosp?.name || '',
        'Honorários Pagos': s.feesPaid,
        'Recebidos': s.receivedAmount,
        'Status': s.receivedAmount >= s.feesPaid ? 'Pago' : (s.receivedAmount > 0 ? 'Parcial' : 'Pendente')
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cirurgias");
    XLSX.writeFile(wb, `Cirurgias_${type === 'current' ? 'Filtradas' : 'Total'}_${format(new Date(), 'ddMMyy')}.xlsx`);
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: QueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newItems.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
        file,
        status: 'waiting',
        addedAt: new Date()
      });
    }

    setQueue(prev => [...prev, ...newItems]);
    toast.success(`${newItems.length} etiqueta(s) adicionada(s) à fila de leitura.`);

    if (e.target) e.target.value = '';
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftSurgery) return;
    const form = e.target as HTMLFormElement;
    const date = (form.elements.namedItem('date') as HTMLInputElement).value;
    const patientName = (form.elements.namedItem('patientName') as HTMLInputElement).value;
    const indication = (form.elements.namedItem('indication') as HTMLInputElement).value;
    const insurance = (form.elements.namedItem('insurance') as HTMLInputElement).value;
    const attendance = (form.elements.namedItem('attendance') as HTMLInputElement).value;
    const procedure = (form.elements.namedItem('procedure') as HTMLInputElement).value;
    const company = (form.elements.namedItem('company') as HTMLInputElement).value;
    const feesPaid = parseFloat((form.elements.namedItem('feesPaid') as HTMLInputElement).value || '0');
    const receivedAmount = parseFloat((form.elements.namedItem('receivedAmount') as HTMLInputElement).value || '0');
    const hospitalId = (form.elements.namedItem('hospitalId') as HTMLSelectElement).value;
    
    // Check for duplicate in manual entry too
    const isDuplicate = data.surgeries.some(existing => 
      existing.date === date && 
      (existing.patientName || '').toLowerCase().trim() === (patientName || '').toLowerCase().trim() &&
      (existing.procedure || '').toLowerCase().trim() === (procedure || '').toLowerCase().trim()
    );

    if (isDuplicate && !draftSurgery.id) {
      toast.warning('Esta cirurgia já constava nos registros. Adicionada duplicidade.');
    }

    if (draftSurgery.id) {
      const existing = data.surgeries?.find(s => s.id === draftSurgery.id);
      const updatePayload = { 
        date, 
        patientName, 
        indication, 
        insurance, 
        attendance, 
        procedure, 
        company, 
        feesPaid, 
        receivedAmount, 
        hospitalId, 
        notes: existing?.notes || '',
        aiSourceHash: draftSurgery.aiSourceHash || existing?.aiSourceHash || ''
      };
      
      console.log("PAYLOAD ENVIADO (Update Surgery):", updatePayload);
      toast.info(`Enviando update: ${JSON.stringify(updatePayload).substring(0, 80)}...`);

      updateSurgery(draftSurgery.id, updatePayload);
      toast.success("Cirurgia atualizada com sucesso!");
    } else {
      addSurgery({ 
        date, 
        patientName, 
        indication, 
        insurance, 
        attendance, 
        procedure, 
        company, 
        feesPaid, 
        receivedAmount, 
        hospitalId, 
        notes: '', 
        isParticular: false, 
        particularValue: 0, 
        photos: [],
        aiSourceHash: draftSurgery.aiSourceHash || ''
      });
      toast.success("Cirurgia registrada com sucesso!");
    }

    // Salva diagnóstico e procedimento na coleção de templates para autocompletar futuramente
    const trimmedIndication = (indication || '').trim();
    const trimmedProcedure = (procedure || '').trim();
    if (trimmedIndication && trimmedProcedure) {
      const alreadyHasTemplate = (data.surgery_templates || []).some(
        t => t.diagnosis.toLowerCase().trim() === trimmedIndication.toLowerCase() &&
             t.procedure.toLowerCase().trim() === trimmedProcedure.toLowerCase()
      );
      if (!alreadyHasTemplate) {
        addSurgeryTemplate({
          diagnosis: trimmedIndication,
          procedure: trimmedProcedure
        }).catch(err => console.error("Erro ao salvar template:", err));
      }
    }

    if (currentItemIdInModal) {
      setQueue(prev => prev.filter(item => item.id !== currentItemIdInModal));
      setCurrentItemIdInModal(null);
    }
    setDraftSurgery(null);
    setIsModalOpen(false);
    if (hospitalId) setActiveHospitalId(hospitalId);
  };

  const filteredSurgeries = React.useMemo(() => data.surgeries
    .filter(s => {
      if (activeHospitalId === 'ALL') return true;
      if (activeHospitalId === 'NO_HOSPITAL') {
        const hasValidHospital = s.hospitalId && data.hospitals.some(h => h.id === s.hospitalId);
        return !hasValidHospital;
      }
      return s.hospitalId === activeHospitalId;
    })
    .filter(s => {
      const term = searchTerm.toLowerCase();
      const hosp = data.hospitals.find(h => h.id === s.hospitalId);
      const matchesSearch = (
        (s.patientName || '').toLowerCase().includes(term) || 
        (s.procedure || '').toLowerCase().includes(term) ||
        (s.indication || '').toLowerCase().includes(term) ||
        (hosp && (hosp.name || '').toLowerCase().includes(term))
      );
      
      if (filterType === 'all') return matchesSearch;
      
      const isDateInRange = s.date >= startDate && s.date <= endDate;
      return matchesSearch && isDateInRange;
    })
    .sort((a, b) => {
      const dateA = parseFlexibleDate(a.date);
      const dateB = parseFlexibleDate(b.date);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA);
    }), [data.surgeries, data.hospitals, activeHospitalId, searchTerm, filterType, startDate, endDate]);

  const indicationsForAutocomplete = React.useMemo(() => {
    const indications = data.surgeries.map(s => s.indication).filter(Boolean);
    return Array.from(new Set(indications)).sort();
  }, [data.surgeries]);

  const existingProcedures = React.useMemo(() => {
    const pros = data.surgeries.map(s => s.procedure).filter(Boolean);
    return Array.from(new Set(pros)).sort();
  }, [data.surgeries]);

  return (
    <div className="flex flex-col min-h-full bg-zinc-50/50">
      <PageHeader 
        breadcrumbs={[
          { label: 'Cirurgias Realizadas' },
          { label: 'Registros' }
        ]}
      >
        <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} className="hidden" onChange={handleCapture} />
        <input type="file" accept="image/*,application/pdf" ref={fileInputRef} className="hidden" multiple onChange={handleCapture} />
        <input type="file" accept=".xlsx, .xls" ref={excelInputRef} className="hidden" onChange={(e) => handleFileSelect(e, false)} />
        <input type="file" accept=".xlsx, .xls" ref={reconcileInputRef} className="hidden" onChange={(e) => handleFileSelect(e, true)} />
        <input type="file" accept="image/*" ref={photoInputRef} className="hidden" multiple onChange={handlePhotoUpload} />
        <input type="file" accept="image/*" capture="environment" ref={photoCameraInputRef} className="hidden" onChange={handlePhotoUpload} />
        
        <div className="flex items-center gap-1.5 bg-zinc-100/50 p-1 rounded-2xl border border-zinc-200/50 overflow-x-auto no-scrollbar">
           <button 
             onClick={() => excelInputRef.current?.click()} 
             className="flex items-center justify-center gap-2 bg-white text-zinc-700 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
             title="Importar Excel Inicial"
           >
              <span className="action-dot" />
              <span>Importar Excel</span>
           </button>


           <button 
             onClick={() => fileInputRef.current?.click()} 
             className="flex items-center justify-center gap-2 bg-white text-zinc-700 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
             title="Galeria/Imagem"
           >
              <span className="action-dot" />
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />} 
              <span>Foto</span>
           </button>
        </div>

        <button 
          onClick={() => { 
            setDraftSurgery({ date: new Date().toISOString().split('T')[0], patientName: '', procedure: '', indication: '' }); 
            setFormFields({ indication: '', procedure: '' });
            setIsModalOpen(true); 
          }} 
          className="h-10 px-4 bg-[#162744] flex items-center justify-center gap-2 rounded-xl text-white shadow-lg shadow-zinc-200 transition-all active:scale-95 hover:bg-[#0f1b32]"
        >
          <span className="action-dot" />
          <span className="text-[10px] font-black uppercase tracking-widest">Nova Cirurgia</span>
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
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm text-center group flex flex-col justify-center">
            <div className="text-[9px] font-black text-zinc-300 uppercase tracking-widest mb-1 group-hover:text-zinc-400 transition-colors">Cirurgias {format(new Date(), 'MMMM', { locale: ptBR })}</div>
            <div className="text-2xl font-bold text-zinc-900 font-mono tracking-tighter tabular-nums">
              {data.surgeries.filter(s => {
                if (!s.date) return false;
                const d = parseISO(s.date);
                if (isNaN(d.getTime())) return false;
                return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
              }).length}
            </div>
          </div>
          <button 
            onClick={() => {
              setPendingHospitalFilter('ALL');
              setIsPendingModalOpen(true);
            }}
            className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm text-center group flex flex-col justify-center items-center hover:border-zinc-400 transition-all cursor-pointer"
          >
            <div className="text-[9px] font-black text-zinc-300 uppercase tracking-widest mb-1 group-hover:text-zinc-400 transition-colors">Cirurgias Pendentes</div>
            <div className="text-2xl font-bold text-zinc-900 font-mono tracking-tighter tabular-nums text-red-600">
              {data.surgeries.filter(s => (s.receivedAmount || 0) === 0).length}
            </div>
          </button>
          
          <div className="bg-[#162744] p-6 rounded-2xl shadow-xl shadow-zinc-200 text-center flex flex-col items-center justify-center">
            <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Total de Cirurgias</div>
            <div className="text-2xl font-bold text-white tabular-nums tracking-tighter">{data.surgeries.length}</div>
          </div>

          <button 
            onClick={() => {
              setSelectedIds(new Set());
              setIsDeleteSelectionOpen(true);
            }}
            className="flex flex-col items-center justify-center gap-1 bg-white text-red-600 p-6 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all shadow-sm hover:shadow-md hover:bg-red-50 active:scale-95 border border-red-100"
            title="Limpar cirurgias"
          >
            <Trash2 className="w-4 h-4 mb-1" />
            <span>Limpar Todos</span>
          </button>
        </div>

        {queue.length > 0 && (
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-50 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-sky-500 rounded-full animate-pulse" />
                <h3 className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em]">Fila de Processamento de Etiquetas</h3>
              </div>
              <div className="flex items-center gap-2">
                {!isOnline && (
                  <span className="px-2 py-1 bg-amber-50 rounded-lg text-[8px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1 border border-amber-100/50">
                    ● Offline (Pausada)
                  </span>
                )}
                <span className="text-[10px] font-mono font-bold text-zinc-400">
                  {queue.filter(q => q.status === 'completed' || q.status === 'completed_low_confidence').length}/{queue.length} CONCLUÍDAS
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
              {queue.map(item => {
                const isWaiting = item.status === 'waiting';
                const isProcessing = item.status === 'processing';
                const isCompleted = item.status === 'completed';
                const isLowConfidence = item.status === 'completed_low_confidence';
                const isFailed = item.status === 'failed';
                
                return (
                  <div 
                    key={item.id} 
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isProcessing ? 'bg-sky-50/50 border-sky-200 shadow-sm' :
                      isCompleted ? 'bg-emerald-50/20 border-emerald-100' :
                      isLowConfidence ? 'bg-amber-50/10 border-amber-100 shadow-xs' :
                      isFailed ? 'bg-red-50/10 border-red-100' :
                      'bg-zinc-50/30 border-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100/80 border border-zinc-200/50 flex items-center justify-center font-bold text-zinc-400 text-xs shrink-0 overflow-hidden">
                        {item.file.type.startsWith('image/') ? (
                          <img 
                            src={URL.createObjectURL(item.file)} 
                            alt="Preview" 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <span className="text-[8px] font-black font-mono">PDF</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase text-zinc-700 truncate tracking-wide">
                          {item.file.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {isWaiting && (
                            <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded text-[7px] font-black uppercase tracking-widest">
                              Aguardando
                            </span>
                          )}
                          {isProcessing && (
                            <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded text-[7px] font-black uppercase tracking-widest flex items-center gap-1">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Lendo...
                            </span>
                          )}
                          {isCompleted && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[7px] font-black uppercase tracking-widest">
                              ✨ Pronto (IA)
                            </span>
                          )}
                          {isLowConfidence && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[7px] font-black uppercase tracking-widest">
                              ⚠️ Atenção: OCR Local
                            </span>
                          )}
                          {isFailed && (
                            <span 
                              className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded text-[7px] font-black uppercase tracking-widest" 
                              title={item.errorMessage}
                            >
                              Falhou
                            </span>
                          )}
                          <span className="text-[8px] text-zinc-400 font-mono font-bold">
                            {format(item.addedAt, 'HH:mm:ss')}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(isCompleted || isLowConfidence) && (
                        <button
                          onClick={() => handleReviewQueueItem(item)}
                          className="px-3 py-2 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 active:scale-95 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-sm cursor-pointer"
                        >
                          Revisar
                        </button>
                      )}
                      {isFailed && (
                        <button
                          onClick={() => processQueueItem(item.id, item.file)}
                          className="px-3 py-2 bg-zinc-200 text-zinc-700 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-zinc-300 transition-all active:scale-95"
                        >
                          Tentar Novamente
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setQueue(prev => prev.filter(q => q.id !== item.id));
                          if (currentItemIdInModal === item.id) {
                            setDraftSurgery(null);
                            setIsModalOpen(false);
                            setCurrentItemIdInModal(null);
                          }
                        }}
                        className="p-2 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded-xl transition-all"
                        title="Remover"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}



        {/* Hospital Selector (Pills) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Filtrar por Hospital</h3>
             <span className="text-[10px] font-mono font-bold text-zinc-300">{data.hospitals.length} Hospitais</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-200 scrollbar-track-transparent">
            <button
              onClick={() => setActiveHospitalId('ALL')}
              className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap border ${activeHospitalId === 'ALL' ? 'bg-[#162744] text-white border-[#162744] shadow-xl shadow-zinc-200 scale-[1.02]' : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
            >
              Todos
            </button>
            {data.surgeries.some(s => !s.hospitalId || !data.hospitals.some(h => h.id === s.hospitalId)) && (
              <button
                onClick={() => setActiveHospitalId('NO_HOSPITAL')}
                className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap border ${activeHospitalId === 'NO_HOSPITAL' ? 'bg-[#162744] text-white border-[#162744] shadow-xl shadow-zinc-200 scale-[1.02]' : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
              >
                Sem Hospital
              </button>
            )}
            {data.hospitals.map(h => (
              <button
                key={h.id}
                onClick={() => setActiveHospitalId(h.id)}
                className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap border ${activeHospitalId === h.id ? 'bg-[#162744] text-white border-[#162744] shadow-xl shadow-zinc-200 scale-[1.02]' : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
              >
                {h.name}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          <div className="px-6 py-4 border-b border-zinc-50 flex flex-col md:flex-row gap-4 items-center">
             <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
                <input type="text" placeholder="BUSCAR POR PACIENTE OU CIRURGIA..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-[10px] font-black uppercase tracking-widest w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none focus:border-zinc-200 transition-all" />
             </div>

             <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
                <div className="flex bg-zinc-100 p-1 rounded-xl shrink-0">
                  <button onClick={() => setFilterType('period')} className={cn("px-3 py-1.5 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all", filterType === 'period' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600")}>Período</button>
                  <button onClick={() => setFilterType('all')} className={cn("px-3 py-1.5 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all", filterType === 'all' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600")}>Tudo</button>
                </div>

                {filterType === 'period' && (
                  <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 p-1.5 rounded-xl shrink-0">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[9px] font-black text-zinc-600 focus:outline-none uppercase" />
                    <div className="w-1.5 h-px bg-zinc-300" />
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[9px] font-black text-zinc-600 focus:outline-none uppercase" />
                  </div>
                )}
             </div>
          </div>
          
          <div className="overflow-x-auto flex-1 w-full">
             <table className="w-full text-left min-w-max md:min-w-full">
                <thead style={{ background: "#F8F9FC" }}>
                   <tr style={{ background: "#F8F9FC" }}>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Paciente</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Hospital</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Convênio</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Atendimento</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Cirurgia</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Empresa</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Data</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Honorários</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Recebidos</th>
                      <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "center" }}>Ações</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {filteredSurgeries.map(surgery => (
                    <tr 
                      key={surgery.id} 
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F5F6FB"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                      className="group transition-all duration-150"
                    >
                      <td style={{ padding: "12px 14px" }}>
                         <div className="text-[12px] font-bold text-zinc-800 uppercase tracking-tight truncate max-w-[100px] md:max-w-[150px]">{surgery.patientName}</div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 10, textTransform: "uppercase", color: "#505A70", fontWeight: 700 }}>
                         <div className="truncate max-w-[120px] md:max-w-[150px]" title={data.hospitals.find(h => h.id === surgery.hospitalId)?.name || '---'}>{data.hospitals.find(h => h.id === surgery.hospitalId)?.name || '---'}</div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 10, textTransform: "uppercase", color: "#3D4A63", fontWeight: 700 }}>{surgery.insurance || '---'}</td>
                      <td style={{ padding: "12px 14px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>{surgery.attendance || '---'}</td>
                      <td style={{ padding: "12px 14px" }}>
                         <div className="text-[11px] font-bold text-zinc-600 uppercase truncate max-w-[120px] md:max-w-[180px] tracking-tight">{surgery.procedure}</div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 10, textTransform: "uppercase", color: "#3D4A63", fontWeight: 700 }}>{surgery.company || '---'}</td>
                      <td style={{ padding: "12px 14px" }}>
                         <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>
                           {safeFormat(surgery.date, "dd.MM.yy")}
                         </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>{formatCurrency(surgery.feesPaid)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#162744" }}>{formatCurrency(surgery.receivedAmount)}</td>
                        <td className="px-4 py-4 text-center">
                         <div className="flex items-center justify-center gap-2">
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTargetSurgeryIdForPhoto(surgery.id);
                                setViewingPhotoIndex(0);
                                setIsViewPhotoModalOpen(true);
                              }}
                              className={cn(
                                "p-1.5 rounded-lg transition-all relative",
                                (surgery.photos?.length || 0) > 0 ? "text-emerald-600 bg-emerald-50" : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50"
                              )}
                              title={(surgery.photos?.length || 0) > 0 ? `Ver ${surgery.photos?.length} fotos` : "Anexar Foto"}
                            >
                               <Camera className="w-3.5 h-3.5" />
                               {(surgery.photos?.length || 0) > 1 && (
                                 <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[7px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center ring-2 ring-white">
                                   {surgery.photos?.length}
                                 </span>
                               )}
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDraftSurgery({ ...surgery });
                               setFormFields({ 
                                 indication: surgery.indication || '', 
                                 procedure: surgery.procedure || '' 
                               });
                                setIsModalOpen(true);
                              }}
                              className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Editar"
                            >
                               <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                await deleteSurgery(surgery.id);
                                toast.success("Cirurgia apagada.");
                              }}
                              className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Excluir"
                            >
                               <Trash2 className="w-3.5 h-3.5" />
                            </button>
                         </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSurgeries.length === 0 && (
                    <tr><td colSpan={10} className="p-12 text-center text-zinc-300 italic text-[11px]">Nenhuma cirurgia registrada para este filtro.</td></tr>
                  )}
                </tbody>
             </table>
          </div>
        </div>
      </main>

      {(() => {
        const activeSurgery = targetSurgeryIdForPhoto ? data.surgeries.find(s => s.id === targetSurgeryIdForPhoto) : null;
        const totalPhotos = activeSurgery?.photos?.length || 0;
        
        return (
          <Dialog 
            isOpen={isViewPhotoModalOpen} 
            onClose={() => {
              setIsViewPhotoModalOpen(false);
              setTargetSurgeryIdForPhoto(null);
            }} 
            title={`Foto ${viewingPhotoIndex + 1} de ${totalPhotos}`} 
            size="md"
          >
             <div className="p-4 space-y-4">
                {activeSurgery?.photos && activeSurgery.photos[viewingPhotoIndex] ? (
                   <>
                     <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl group flex items-center justify-center">
                        <AnimatePresence mode="popLayout">
                          <motion.img 
                             key={viewingPhotoIndex}
                             src={activeSurgery.photos[viewingPhotoIndex]} 
                             alt="Foto da Cirurgia" 
                             initial={{ opacity: 0, scale: 0.95 }}
                             animate={{ opacity: 1, scale: 1 }}
                             exit={{ opacity: 0, scale: 1.05 }}
                             transition={{ duration: 0.2 }}
                             className="w-full h-full object-contain cursor-pointer"
                             onClick={() => setIsFullscreen(true)}
                          />
                        </AnimatePresence>
                        
                        <div className="absolute top-4 right-4 flex gap-2 z-10">
                           <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsFullscreen(true);
                              }}
                              className="p-2.5 bg-black/40 hover:bg-black/60 text-white rounded-xl backdrop-blur-md transition-all active:scale-95"
                              title="Tela Cheia"
                           >
                              <Maximize2 className="w-4 h-4" />
                           </button>
                           <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePhoto();
                              }}
                              className="p-2.5 bg-red-600/80 hover:bg-red-700 text-white rounded-xl backdrop-blur-md shadow-lg transition-all active:scale-95"
                              title="Excluir Foto"
                           >
                              <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
    
                        {totalPhotos > 1 && (
                          <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none z-10">
                             <button 
                                type="button"
                                disabled={viewingPhotoIndex === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingPhotoIndex(v => v - 1);
                                }}
                                className="p-2.5 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md transition-all pointer-events-auto disabled:opacity-0"
                             >
                                <ChevronLeft className="w-5 h-5" />
                             </button>
                             <button 
                                type="button"
                                disabled={viewingPhotoIndex === totalPhotos - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingPhotoIndex(v => v + 1);
                                }}
                                className="p-2.5 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md transition-all pointer-events-auto disabled:opacity-0"
                             >
                                <ChevronRight className="w-5 h-5" />
                             </button>
                          </div>
                        )}
                     </div>
    
                     <div className="flex gap-2 text-[10px] font-black uppercase tracking-widest">
                        <button 
                           type="button"
                           onClick={(e) => {
                             e.stopPropagation();
                             photoCameraInputRef.current?.click();
                           }}
                           disabled={totalPhotos >= 4}
                           className="flex-1 py-3 bg-zinc-100 text-zinc-900 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                           <Camera className="w-4 h-4" /> Câmera
                        </button>
                        <button 
                           type="button"
                           onClick={(e) => {
                             e.stopPropagation();
                             photoInputRef.current?.click();
                           }}
                           disabled={totalPhotos >= 4}
                           className="flex-1 py-3 bg-zinc-100 text-zinc-900 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                           <ImageIcon className="w-4 h-4" /> Galeria
                        </button>
                        <button 
                           type="button"
                           onClick={(e) => {
                             e.stopPropagation();
                             setIsFullscreen(true);
                           }}
                           className="flex items-center justify-center px-4 bg-zinc-100 text-zinc-900 rounded-xl hover:bg-zinc-200 transition-colors"
                        >
                           <Maximize2 className="w-4 h-4" />
                        </button>
                     </div>
                   </>
                ) : (
                  <div className="py-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-4">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em]">Nenhuma foto adicionada.</p>
                     <div className="flex gap-3 w-full mt-2">
                       <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            photoCameraInputRef.current?.click();
                          }}
                          className="flex-1 py-4 bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-2xl hover:bg-zinc-100 transition-colors flex flex-col items-center gap-2"
                       >
                          <Camera className="w-6 h-6 text-zinc-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Tirar Foto</span>
                       </button>
                       <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            photoInputRef.current?.click();
                          }}
                          className="flex-1 py-4 bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-2xl hover:bg-zinc-100 transition-colors flex flex-col items-center gap-2"
                       >
                          <ImageIcon className="w-6 h-6 text-zinc-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Galeria</span>
                       </button>
                     </div>
                  </div>
                )}
             </div>
          </Dialog>
        );
      })()}

      <Dialog isOpen={isCalibrationOpen} onClose={() => setIsCalibrationOpen(false)} title="Mapeamento de Planilha" size="lg">
        <div id="calibration-modal-surgeries" className="p-6 space-y-6">
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex gap-3">
             <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
             <div className="space-y-1">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                   Calibração de Planilha Necessária
                </h4>
                <p className="text-[11px] text-amber-700/80 font-bold leading-relaxed">
                   Detectamos novas colunas nesta planilha. Associe os dados da sua planilha (esquerda) aos campos do aplicativo (direita) para importar com perfeição. O sistema lembrará de sua escolha para as próximas importações!
                </p>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
            {SURGERY_FIELDS.map(field => {
              const currentVal = calibrationMapping[field.key] || '';
              return (
                <div key={field.key} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100/80 space-y-2 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                      Campo do Sistema
                    </span>
                    <label className="text-[11px] font-black uppercase tracking-tight text-zinc-800 flex items-center gap-1.5 mt-0.5">
                      {field.label}
                      {field.required && (
                        <span className="text-amber-600 font-black text-[10px]" title="Obrigatório">*</span>
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
              id="btn-cancel-calibration"
              onClick={() => setIsCalibrationOpen(false)}
              className="flex-1 text-[10px] font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 hover:bg-zinc-200 py-3.5 rounded-2xl transition-all scale-press active:scale-95 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-confirm-calibration"
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

      <Dialog isOpen={isPasteModalOpen} onClose={() => setIsPasteModalOpen(false)} title="Colar Planilha Excel">
         <div className="p-4 space-y-4">
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 flex gap-3">
               <Info className="w-5 h-5 text-zinc-400 shrink-0" />
               <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight leading-relaxed">
                  DICA: Se o arquivo estiver no OneDrive, abra-o no celular, copie as células da planilha e cole aqui.
               </p>
            </div>
            <textarea 
               value={pasteContent}
               onChange={(e) => setPasteContent(e.target.value)}
               placeholder="Cole aqui as linhas da planilha..."
               className="w-full h-48 p-4 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:border-[#162744] transition-all"
            />
            <button 
               onClick={handlePasteProcess}
               className="w-full py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2"
            >
               <span className="action-dot" />
               Importar Dados
            </button>
         </div>
      </Dialog>

      <Dialog isOpen={isModalOpen} onClose={handleCloseModal} title="Check-in Cirúrgico">
        {isProcessing ? (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-zinc-900" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">{processingMessage}</p>
          </div>
        ) : draftSurgery ? (
          <form onSubmit={handleSaveDraft} className="space-y-6" key={draftSurgery.id || draftSurgery.patientName || 'new-draft'}>
            {(!draftSurgery.patientName && !draftSurgery.attendance && !draftSurgery.insurance) ? (
              <div className="p-3 bg-[#FCF8E3] border border-[#FBEED5] rounded-2xl flex items-start gap-2.5 text-[11px] text-[#C09853] leading-relaxed">
                <span className="text-sm font-bold flex-shrink-0">⚠️</span>
                <div>
                  <p className="font-black uppercase tracking-wider text-[9px] mb-0.5">Leitura automática parcial ou indisponível</p>
                  <p className="opacity-90">Não foi possível ler as informações legíveis por completo. Por favor, preencha ou complemente os campos manualmente abaixo.</p>
                </div>
              </div>
            ) : draftSurgery.isLocalOCR ? (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-[11px] text-amber-800 leading-relaxed shadow-sm">
                <span className="text-sm font-bold flex-shrink-0 text-amber-600">⚠️</span>
                <div>
                  <p className="font-black uppercase tracking-wider text-[9px] mb-0.5 text-[#B7791F]">BAIXA CONFIANÇA (PROCESSAMENTO LOCAL)</p>
                  <p className="text-amber-700/95">O sistema recorreu ao processador local de backup por falha ou tempo de resposta da Audit AI. Erros de digitação ou campos incompletos são comuns. Atenção redobrada!</p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-[#EAF7ED] border border-[#D5ECCF] rounded-2xl flex items-start gap-2.5 text-[11px] text-[#34A853] leading-relaxed">
                <span className="text-sm font-bold flex-shrink-0">✨</span>
                <div>
                  <p className="font-black uppercase tracking-wider text-[9px] mb-0.5">Alta Confiança (IA de Produção Audit AI)</p>
                  <p className="opacity-90">Alguns dados foram extraídos do documento. Revise as informações nos campos abaixo antes de salvar.</p>
                </div>
              </div>
            )}
            <div>
               <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">PACIENTE</label>
               <input name="patientName" type="text" defaultValue={draftSurgery.patientName || ''} className="w-full p-3 text-xs font-bold border rounded-2xl placeholder:zinc-200" placeholder="Nome Completo" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="relative">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">INDICAÇÃO</label>
                  <input 
                    name="indication" 
                    type="text" 
                    value={formFields.indication}
                    onChange={(e) => setFormFields(prev => ({ ...prev, indication: e.target.value }))}
                    onFocus={() => setActiveSuggestionField('indication')}
                    onBlur={() => setTimeout(() => setActiveSuggestionField(null), 250)}
                    autoComplete="off"
                    className="w-full p-3 text-xs font-bold border rounded-2xl" 
                    placeholder="Diagnóstico/Indicação"
                  />
                  {activeSuggestionField === 'indication' && filteredTemplates.length > 0 && (
                    <div className="absolute z-[9999] left-0 right-0 mt-1 bg-white border border-zinc-200/80 rounded-2xl shadow-xl max-h-48 overflow-y-auto overflow-x-hidden backdrop-blur-md">
                      {filteredTemplates.map((t, index) => (
                        <button
                          key={`${t.id || ''}-${t.diagnosis}-${t.procedure}-${index}`}
                          type="button"
                          onClick={() => {
                            setFormFields({
                              indication: t.diagnosis,
                              procedure: t.procedure
                            });
                            setActiveSuggestionField(null);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-zinc-50 border-b border-zinc-100 last:border-none transition-colors duration-150"
                        >
                          <div className="text-[11px] font-black text-zinc-700 leading-tight mb-0.5">{t.procedure}</div>
                          <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">{t.diagnosis}</div>
                        </button>
                      ))}
                    </div>
                  )}
               </div>
               <div className="relative">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">CIRURGIA</label>
                  <input 
                    name="procedure" 
                    type="text" 
                    value={formFields.procedure}
                    onChange={(e) => setFormFields(prev => ({ ...prev, procedure: e.target.value }))}
                    onFocus={() => setActiveSuggestionField('procedure')}
                    onBlur={() => setTimeout(() => setActiveSuggestionField(null), 250)}
                    autoComplete="off"
                    className="w-full p-3 text-xs font-bold border rounded-2xl" 
                    placeholder="Procedimento"
                  />
                  {activeSuggestionField === 'procedure' && filteredTemplates.length > 0 && (
                    <div className="absolute z-[9999] left-0 right-0 mt-1 bg-white border border-zinc-200/80 rounded-2xl shadow-xl max-h-48 overflow-y-auto overflow-x-hidden backdrop-blur-md">
                      {filteredTemplates.map((t, index) => (
                        <button
                          key={`${t.id || ''}-${t.diagnosis}-${t.procedure}-${index}`}
                          type="button"
                          onClick={() => {
                            setFormFields({
                              indication: t.diagnosis,
                              procedure: t.procedure
                            });
                            setActiveSuggestionField(null);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-zinc-50 border-b border-zinc-100 last:border-none transition-colors duration-150"
                        >
                          <div className="text-[11px] font-black text-zinc-700 leading-tight mb-0.5">{t.procedure}</div>
                          <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">{t.diagnosis}</div>
                        </button>
                      ))}
                    </div>
                  )}
               </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">CONVÊNIO</label><input name="insurance" type="text" defaultValue={draftSurgery.insurance || ''} className="w-full p-3 text-xs font-bold border rounded-2xl" /></div>
               <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">ATENDIMENTO</label><input name="attendance" type="text" defaultValue={draftSurgery.attendance || ''} className="w-full p-3 text-xs font-bold bg-zinc-50 border rounded-2xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">EMPRESA (OPME)</label><input name="company" type="text" defaultValue={draftSurgery.company || ''} className="w-full p-3 text-xs font-bold border rounded-2xl" /></div>
               <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">DATA DA CIRURGIA</label><input name="date" type="date" defaultValue={draftSurgery.date || new Date().toISOString().split('T')[0]} className="w-full p-3 text-xs font-bold bg-zinc-50 border rounded-2xl" required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">HOSPITAL</label>
                  <select name="hospitalId" defaultValue={activeHospitalId !== 'ALL' ? activeHospitalId : (draftSurgery.hospitalId || '')} className="w-full p-3 text-xs font-bold bg-white border rounded-2xl" required>
                     <option value="">Selecione Hospital...</option>
                     {data.hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
               </div>
               <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">HONORÁRIOS (R$)</label><input name="feesPaid" type="number" step="0.01" defaultValue={draftSurgery.feesPaid || 0} className="w-full p-3 text-xs font-bold border rounded-2xl" /></div>
                  <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">RECEBIDOS (R$)</label><input name="receivedAmount" type="number" step="0.01" defaultValue={draftSurgery.receivedAmount || 0} className="w-full p-3 text-xs font-bold border rounded-2xl" /></div>
               </div>
            </div>
            {currentItemIdInModal ? (
              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="flex-1 py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Descartar
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-4 bg-[#162744] hover:bg-[#0f1b32] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="action-dot animate-pulse" />
                  Salvar Cirurgia
                </button>
              </div>
            ) : (
              <button type="submit" className="w-full py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                 <span className="action-dot" />
                 Finalizar Checklist
              </button>
            )}
          </form>
        ) : null}
      </Dialog>
      
      <Dialog isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} title="Confirmar Cirurgias" size="xl">
         <div className="p-4 space-y-6">
            <div className="flex items-center justify-between">
               <div className="bg-zinc-50 px-4 py-2 rounded-xl border border-zinc-100 text-center">
                  <div className="text-xl font-black text-zinc-900">{previewSurgeries?.length}</div>
                  <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Procedimentos</div>
               </div>
               <button onClick={addBlankSurgery} className="px-3 py-1.5 bg-zinc-100 text-zinc-600 rounded-lg text-[9px] font-black uppercase tracking-tight hover:bg-zinc-200 transition-colors flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Linha
               </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto overflow-x-auto border border-zinc-100 rounded-2xl bg-white w-full">
               <table className="w-full text-[10px]">
                  <thead className="bg-zinc-50 font-black text-[8px] uppercase tracking-widest text-zinc-400 sticky top-0 z-10">
                     <tr>
                        <th className="px-3 py-3 text-left">Data</th>
                        <th className="px-3 py-3 text-left">Paciente</th>
                        <th className="px-3 py-3 text-left">Convênio</th>
                        <th className="px-3 py-3 text-left">Atend.</th>
                        <th className="px-3 py-3 text-left">Hospital</th>
                        <th className="px-3 py-3 text-left">Cirurgia</th>
                        <th className="px-3 py-3 text-left">Empresa</th>
                        <th className="px-3 py-3 text-right">Honorário</th>
                        <th className="px-3 py-3 text-right">Recebido</th>
                        <th className="px-3 py-3"></th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                     {previewSurgeries?.map((s, idx) => (
                        <tr key={`s-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                           <td className="px-1 py-1.5">
                              <input 
                                 type="date" 
                                 value={s.date} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'date', e.target.value)}
                                 className="bg-transparent border-none p-1 font-mono font-bold text-zinc-500 focus:ring-0 w-28"
                              />
                           </td>
                           <td className="px-1 py-1.5">
                              <input 
                                 type="text" 
                                 value={s.patientName} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'patientName', e.target.value)}
                                 className="w-32 bg-transparent border-none p-1 font-bold text-zinc-900 focus:ring-0 uppercase placeholder:text-zinc-200"
                                 placeholder="NOME..."
                              />
                           </td>
                           <td className="px-1 py-1.5">
                              <input 
                                 type="text" 
                                 value={s.insurance} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'insurance', e.target.value)}
                                 className="w-20 bg-transparent border-none p-1 font-bold text-zinc-400 focus:ring-0 uppercase placeholder:text-zinc-200 text-[8px]"
                                 placeholder="CONV..."
                              />
                           </td>
                           <td className="px-1 py-1.5">
                              <input 
                                 type="text" 
                                 value={s.attendance} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'attendance', e.target.value)}
                                 className="w-16 bg-transparent border-none p-1 font-bold text-zinc-400 focus:ring-0 uppercase placeholder:text-zinc-200 text-[8px]"
                                 placeholder="ATEND..."
                              />
                           </td>
                           <td className="px-1 py-1.5">
                              <input 
                                 type="text" 
                                 value={s.hospitalName} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'hospitalName', e.target.value)}
                                 className="w-32 bg-transparent border-none p-1 font-bold text-zinc-800 focus:ring-0 uppercase placeholder:text-zinc-200"
                                 placeholder="HOSP..."
                              />
                           </td>
                           <td className="px-1 py-1.5">
                              <input 
                                 type="text" 
                                 value={s.procedure} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'procedure', e.target.value)}
                                 className="w-40 bg-transparent border-none p-1 font-bold text-zinc-500 focus:ring-0 uppercase placeholder:text-zinc-200 truncate"
                                 placeholder="PROC..."
                              />
                           </td>
                           <td className="px-1 py-1.5">
                              <input 
                                 type="text" 
                                 value={s.company} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'company', e.target.value)}
                                 className="w-20 bg-transparent border-none p-1 font-bold text-zinc-300 focus:ring-0 uppercase placeholder:text-zinc-200 text-[7px]"
                                 placeholder="EMP..."
                              />
                           </td>
                           <td className="px-1 py-1.5 text-right">
                              <input 
                                 type="number" 
                                 value={s.feesPaid} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'feesPaid', parseFloat(e.target.value) || 0)}
                                 className="w-20 bg-transparent border-none p-1 text-right font-mono font-bold text-zinc-900 focus:ring-0"
                              />
                           </td>
                           <td className="px-1 py-1.5 text-right">
                              <input 
                                 type="number" 
                                 value={s.receivedAmount} 
                                 onChange={(e) => updatePreviewSurgery(idx, 'receivedAmount', parseFloat(e.target.value) || 0)}
                                 className="w-20 bg-transparent border-none p-1 text-right font-mono font-bold text-emerald-600 focus:ring-0"
                              />
                           </td>
                           <td className="px-2 py-1.5 text-center">
                              <button onClick={() => removePreviewSurgery(idx)} className="text-zinc-300 hover:text-red-500 transition-colors">
                                 <X className="w-3.5 h-3.5" />
                              </button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>

            <div className="flex gap-3">
               <button onClick={() => setIsPreviewOpen(false)} className="flex-1 py-4 bg-zinc-100 text-zinc-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors">
                  Cancelar
               </button>
               <button onClick={confirmImport} className="flex-[2] py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-zinc-200 hover:bg-[#0f1b32] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                  <span className="action-dot" />
                  Confirmar Importação de { previewSurgeries?.length } Registros
               </button>
            </div>
         </div>
      </Dialog>

      <Dialog isOpen={isPendingModalOpen} onClose={() => setIsPendingModalOpen(false)} title="Pendências de Recebimento" size="xl">
         <div className="p-4 space-y-6">
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 space-y-4">
               <div className="flex items-center justify-between">
                  <div>
                     <div className="text-xl font-black text-zinc-900">
                       {data.surgeries.filter(s => (s.receivedAmount || 0) === 0 && (pendingHospitalFilter === 'ALL' || s.hospitalId === pendingHospitalFilter)).length} Pacientes
                     </div>
                     <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Aguardando recebimento de honorários</div>
                  </div>
                  <div className="flex gap-2">
                     <button 
                       onClick={() => {
                         const pending = data.surgeries.filter(s => (s.receivedAmount || 0) === 0 && (pendingHospitalFilter === 'ALL' || s.hospitalId === pendingHospitalFilter));
                         const text = `Lista de Cirurgias Pendentes:\n\n` + 
                           pending.map(s => {
                             const hosp = data.hospitals.find(h => h.id === s.hospitalId)?.name || '---';
                             return `• ${s.patientName} (${safeFormat(s.date, 'dd/MM/yy')}) - ${hosp}`;
                           }).join('\n');
                         
                         const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                         window.open(url, '_blank');
                       }}
                       className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-tight hover:bg-emerald-100 transition-colors"
                     >
                       <MessageCircle className="w-3 h-3" /> WhatsApp
                     </button>
                     <button 
                       onClick={() => {
                         const pending = data.surgeries.filter(s => (s.receivedAmount || 0) === 0 && (pendingHospitalFilter === 'ALL' || s.hospitalId === pendingHospitalFilter));
                         const text = `Lista de Cirurgias Pendentes:\n\n` + 
                           pending.map(s => {
                             const hosp = data.hospitals.find(h => h.id === s.hospitalId)?.name || '---';
                             return `• ${s.patientName} (${safeFormat(s.date, 'dd/MM/yy')}) - ${hosp}`;
                           }).join('\n');
                         
                         const url = `mailto:?subject=Cirurgias Pendentes&body=${encodeURIComponent(text)}`;
                         window.open(url, '_blank');
                       }}
                       className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-tight hover:bg-blue-100 transition-colors"
                     >
                       <Mail className="w-3 h-3" /> E-mail
                     </button>
                  </div>
               </div>

               <div className="pt-2 border-t border-zinc-200">
                  <label className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">Filtrar para compartilhar:</label>
                  <select 
                    value={pendingHospitalFilter}
                    onChange={(e) => setPendingHospitalFilter(e.target.value)}
                    className="w-full p-2.5 text-[10px] font-black uppercase tracking-widest bg-white border border-zinc-200 rounded-xl focus:ring-0"
                  >
                    <option value="ALL">Todos os Hospitais</option>
                    {data.hospitals.map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
               </div>
            </div>

            <div className="max-h-[60vh] overflow-auto border border-zinc-100 rounded-2xl bg-white">
               <table className="w-full text-[10px]">
                  <thead className="bg-zinc-50 font-black text-[8px] uppercase tracking-widest text-zinc-400 sticky top-0 z-10">
                     <tr>
                        <th className="px-4 py-3 text-left">Data</th>
                        <th className="px-4 py-3 text-left">Paciente</th>
                        <th className="px-4 py-3 text-left">Hospital</th>
                        <th className="px-4 py-3 text-left">Procedimento</th>
                        <th className="px-4 py-3 text-right">Valor Bruto</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                     {[...data.surgeries]
                       .filter(s => (s.receivedAmount || 0) === 0 && (pendingHospitalFilter === 'ALL' || s.hospitalId === pendingHospitalFilter))
                       .sort((a,b) => {
                         const timeA = a.date ? new Date(a.date).getTime() : 0;
                         const timeB = b.date ? new Date(b.date).getTime() : 0;
                         return timeB - timeA;
                       })
                       .map(s => (
                        <tr key={s.id} className="hover:bg-zinc-50/50 transition-colors">
                           <td className="px-4 py-3 font-mono text-zinc-400">
                              {safeFormat(s.date, 'dd/MM/yy')}
                           </td>
                           <td className="px-4 py-3 font-black text-zinc-700 uppercase">{s.patientName}</td>
                           <td className="px-4 py-3 text-zinc-400 text-[8px] uppercase">
                              {data.hospitals.find(h => h.id === s.hospitalId)?.name || '---'}
                           </td>
                           <td className="px-4 py-3 text-zinc-500 uppercase">{s.procedure}</td>
                           <td className="px-4 py-3 text-right font-mono font-bold text-zinc-900">
                              {formatCurrency(s.feesPaid)}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>

            <button onClick={() => setIsPendingModalOpen(false)} className="w-full py-4 bg-zinc-100 text-zinc-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors">
               Fechar Lista
            </button>
         </div>
      </Dialog>

      <Dialog isOpen={isDeleteSelectionOpen} onClose={() => setIsDeleteSelectionOpen(false)} title="Limpar Cirurgias" size="xl">
         <div className="p-4 space-y-6">
            <div className="flex items-center justify-between bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
               <div>
                  <div className="text-xl font-black text-zinc-900">{selectedIds.size} / {data.surgeries.length}</div>
                  <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Selecionadas para apagar</div>
               </div>
               <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      if (selectedIds.size === data.surgeries.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(data.surgeries.map(s => s.id)));
                    }}
                    className="px-3 py-1.5 bg-white text-zinc-600 border border-zinc-200 rounded-lg text-[9px] font-black uppercase tracking-tight hover:bg-zinc-100 transition-colors"
                  >
                    {selectedIds.size === data.surgeries.length ? 'Desmarcar Todos' : 'Marcar Todos'}
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
                              checked={selectedIds.size === data.surgeries.length && data.surgeries.length > 0} 
                              onChange={() => {
                                if (selectedIds.size === data.surgeries.length) setSelectedIds(new Set());
                                else setSelectedIds(new Set(data.surgeries.map(s => s.id)));
                              }}
                              className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                           />
                        </th>
                        <th className="px-3 py-3 text-left">Data</th>
                        <th className="px-3 py-3 text-left">Paciente</th>
                        <th className="px-3 py-3 text-left">Procedimento</th>
                        <th className="px-3 py-3 text-left">Hospital</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                     {[...data.surgeries].sort((a,b) => {
                        const dateA = parseFlexibleDate(a.date);
                        const dateB = parseFlexibleDate(b.date);
                        if (!dateA && !dateB) return 0;
                        if (!dateA) return 1;
                        if (!dateB) return -1;
                        return dateB.localeCompare(dateA);
                     }).map(s => (
                        <tr key={s.id} className="hover:bg-zinc-50/50 transition-colors">
                           <td className="px-4 py-2">
                              <input 
                                 type="checkbox" 
                                 checked={selectedIds.has(s.id)} 
                                 onChange={() => {
                                    const next = new Set(selectedIds);
                                    if (next.has(s.id)) next.delete(s.id);
                                    else next.add(s.id);
                                    setSelectedIds(next);
                                 }}
                                 className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                              />
                           </td>
                           <td className="px-3 py-2 font-mono text-zinc-400">
                              {safeFormat(s.date, 'dd/MM/yy', 'INVÁLIDO')}
                           </td>
                           <td className="px-3 py-2 font-black text-zinc-700 uppercase">{s.patientName}</td>
                           <td className="px-3 py-2 text-zinc-500 uppercase">{s.procedure}</td>
                           <td className="px-3 py-2 text-zinc-400 text-[8px] uppercase">
                              {data.hospitals.find(h => h.id === s.hospitalId)?.name || '---'}
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

      {/* Diálogo Fino de Confirmação de Exclusão de Cirurgias */}
      <Dialog isOpen={isConfirmingBatchDelete} onClose={() => setIsConfirmingBatchDelete(false)} title="Confirmar Exclusão de Cirurgias">
        <div className="p-6 text-center space-y-6">
          <p className="text-sm text-zinc-650 leading-relaxed">
            Deseja realmente excluir permanentemente as <strong className="text-red-600">{selectedIds.size}</strong> cirurgias selecionadas? 
            <br />
            <span className="text-[11px] text-zinc-400 uppercase font-black tracking-widest block mt-3">⚠️ Esta ação removerá totalmente os registros e fotos vinculadas de forma definitiva!</span>
          </p>
          <div className="flex gap-3">
             <button onClick={() => setIsConfirmingBatchDelete(false)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors">Cancelar</button>
             <button 
               onClick={async () => {
                 setIsDeleting(true);
                 setIsConfirmingBatchDelete(false);
                 try {
                   await deleteSurgeries(Array.from(selectedIds));
                   setSelectedIds(new Set());
                   setIsDeleteSelectionOpen(false);
                   toast.success("Cirurgias excluídas com sucesso!");
                 } catch (err) {
                   toast.error("Erro ao excluir registros.");
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

      <Dialog isOpen={reconciliationState?.isOpen || false} onClose={() => setReconciliationState(null)} title="Confirmar Reconciliação Excel" size="xl">
         <div className="p-4 space-y-6">
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 mb-6">
               <h3 className="text-xl font-black text-zinc-900 mb-2">Resumo da Reconciliação</h3>
               <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold mb-4">
                  Analise o impacto abaixo antes de confirmar a importação
               </p>

               <div className="grid grid-cols-3 gap-4">
                 <div className="bg-white p-4 border border-emerald-100 rounded-xl text-center">
                    <div className="text-2xl font-black text-emerald-600">{reconciliationState?.newSurgeries?.length || 0}</div>
                    <div className="text-[9px] uppercase tracking-widest text-emerald-500 font-bold mt-1">Registros Novos</div>
                 </div>
                 <div className="bg-white p-4 border border-blue-100 rounded-xl text-center">
                    <div className="text-2xl font-black text-blue-600">{reconciliationState?.updatedSurgeries?.length || 0}</div>
                    <div className="text-[9px] uppercase tracking-widest text-blue-500 font-bold mt-1">Serão Atualizados</div>
                 </div>
                 <div className="bg-white p-4 border border-zinc-200 rounded-xl text-center">
                    <div className="text-2xl font-black text-zinc-400">{reconciliationState?.unchangedCount || 0}</div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold mt-1">Sem Alteração</div>
                 </div>
               </div>
            </div>

            <div className="flex gap-3">
               <button onClick={() => setReconciliationState(null)} className="flex-1 py-4 bg-zinc-100 text-zinc-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors">
                  Cancelar
               </button>
               <button 
                  onClick={() => {
                     if (!reconciliationState) return;
                     setIsProcessing(true);
                     try {
                        const { newSurgeries, updatedSurgeries } = reconciliationState;
                        
                        const resolveHospital = async (s: any, cache: Map<string, string>) => {
                          let finalHospitalId = s.hospitalId;
                          if (finalHospitalId?.startsWith('NEW:')) {
                            const hospitalName = s.hospitalName || '';
                            const lowerName = hospitalName.toLowerCase().trim();
                            const existing = data.hospitals.find(x => matchHospitalFlexible(x.name, hospitalName));
                            if (existing) {
                              finalHospitalId = existing.id;
                            } else if (cache.has(lowerName)) {
                              finalHospitalId = cache.get(lowerName)!;
                            } else {
                              const newHospId = crypto.randomUUID();
                              addHospital({ // using contextual addHospital doesn't need await since the queue handles it via Promise or sync state
                                id: newHospId,
                                name: hospitalName
                              });
                              cache.set(lowerName, newHospId);
                              finalHospitalId = newHospId;
                            }
                          }
                          return finalHospitalId;
                        };

                        const createdHospitalsCache = new Map<string, string>();

                        newSurgeries.forEach(async (s) => {
                           const hospitalId = await resolveHospital(s, createdHospitalsCache);
                           addSurgery({ ...s, hospitalId });
                        });
                        
                        updatedSurgeries.forEach(async (s) => {
                           const hospitalId = await resolveHospital(s.updates, createdHospitalsCache);
                           updateSurgery(s.id, { ...s.updates, hospitalId });
                        });
                        
                        toast.success(`Reconciliação iniciada! ${newSurgeries.length} novos, ${updatedSurgeries.length} atualizados.`);
                        setReconciliationState(null);
                     } catch (e) {
                        toast.error("Erro ao aplicar reconciliação.");
                     } finally {
                        setIsProcessing(false);
                     }
                  }} 
                  className="flex-[2] py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-zinc-200 hover:bg-[#0f1b32] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
               >
                  <span className="action-dot" />
                  Confirmar Reconciliação
               </button>
            </div>
         </div>
      </Dialog>

      <AnimatePresence>
        {isFullscreen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center backdrop-blur-sm"
            onClick={() => setIsFullscreen(false)}
          >
            {/* Header / Controls */}
            <div className="absolute top-0 inset-x-0 p-6 flex items-center justify-between z-[10000] bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomScale(prev => Math.min(prev + 0.5, 4));
                  }}
                  className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-all active:scale-95"
                  title="Ampliar"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomScale(prev => Math.max(prev - 0.5, 0.5));
                  }}
                  className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-all active:scale-95"
                  title="Diminuir"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomScale(1);
                  }}
                  className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-all active:scale-95"
                  title="Resetar Zoom"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>

              {targetSurgeryIdForPhoto && (
                <div className="text-white text-[10px] font-black uppercase tracking-[0.2em] bg-white/10 px-4 py-2 rounded-xl backdrop-blur-md">
                  Foto {viewingPhotoIndex + 1} de {data.surgeries.find(s => s.id === targetSurgeryIdForPhoto)?.photos?.length || 0}
                </div>
              )}

              <button 
                type="button"
                className="p-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl transition-all active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullscreen(false);
                }}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Main Image View */}
            <div className="w-full h-full flex items-center justify-center p-4 overflow-hidden">
              {(() => {
                const activeSurgery = data.surgeries.find(s => s.id === (targetSurgeryIdForPhoto || ''));
                const photoUrl = activeSurgery?.photos?.[viewingPhotoIndex];
                const total = activeSurgery?.photos?.length || 0;

                return photoUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <motion.img 
                      key={`${viewingPhotoIndex}-${targetSurgeryIdForPhoto}`}
                      src={photoUrl} 
                      drag={zoomScale > 1}
                      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                      dragElastic={0.6}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ 
                        opacity: 1, 
                        scale: zoomScale,
                        x: zoomScale > 1 ? undefined : 0,
                        y: zoomScale > 1 ? undefined : 0
                      }}
                      transition={{ 
                        type: "spring", 
                        stiffness: 300, 
                        damping: 30 
                      }}
                      className={`${zoomScale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'} max-w-[95%] max-h-[95%] object-contain shadow-2xl rounded-sm`} 
                      alt="Fullscreen Photo"
                      onClick={(e) => {
                         e.stopPropagation();
                         if (zoomScale === 1) setZoomScale(2);
                         else setZoomScale(1);
                      }}
                    />

                    {/* Navigation buttons in fullscreen */}
                    {total > 1 && zoomScale === 1 && (
                      <div className="absolute inset-x-4 flex items-center justify-between pointer-events-none z-[10001]">
                        <button 
                          type="button"
                          disabled={viewingPhotoIndex === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingPhotoIndex(v => v - 1);
                          }}
                          className="p-4 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-xl transition-all pointer-events-auto disabled:opacity-0 active:scale-90"
                        >
                          <ChevronLeft className="w-8 h-8" />
                        </button>
                        <button 
                          type="button"
                          disabled={viewingPhotoIndex === total - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingPhotoIndex(v => v + 1);
                          }}
                          className="p-4 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-xl transition-all pointer-events-auto disabled:opacity-0 active:scale-90"
                        >
                          <ChevronRight className="w-8 h-8" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}
