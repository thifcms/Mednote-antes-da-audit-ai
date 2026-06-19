import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Dialog } from '../components/ui/Dialog';
import { extractSurgeryLabel } from '../services/ai';
import { Plus, Camera, Search, Loader2, Download, FileSpreadsheet, ChevronRight, ChevronLeft, ClipboardCopy, Info, X, Trash2, MessageCircle, Mail, Share2, Edit2, Image as ImageIcon, Maximize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency, findExcelHeaderRow, safeFormat, cn, resizeImage, compressImageSmartly, parseFlexibleDate, parseFinancialAmount } from '../lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

export function Surgeries() {
  const { data, addSurgery, updateSurgery, deleteSurgery, addHospital, deleteSurgeries, deleteAllSurgeries, addSurgeryTemplate } = useApp();
  const [activeHospitalId, setActiveHospitalId] = useState<string | 'ALL'>('ALL');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processando...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
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
      
      // Order of priority: 1. Column Value, 2. Detected Metadata (Line 6), 3. Sheet Name
      const isSpecificSheet = sheetName && !/planilha|sheet|página|page/i.test(sheetName);
      const hospitalName = String(hospitalRaw || detectedHospital || (isSpecificSheet ? sheetName : '') || lastHospital || '').trim();
      
      if (hospitalRaw || detectedHospital || isSpecificSheet) {
         lastHospital = hospitalRaw || detectedHospital || sheetName;
      }
      
      let feesPaid = parseFinancialAmount(getVal(['Honorários', 'Honorários Pagos', 'Fees Paid', 'VALOR BRUTO', 'Valor Pago', 'VALOR PAGO']));
      let receivedAmount = parseFinancialAmount(getVal(['Recebidos', 'Honorários Recebidos', 'Valor (1/2)', 'PAGO', 'Valor Recebido', 'VALOR (1/2)']));

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
          const existing = data.hospitals.find(x => x.name.toLowerCase().trim() === lowerName);
          
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

    for (const s of previewSurgeries) {
      // Check for duplicates in existing data AND in the current batch
      const isDuplicate = currentSurgeries.some(existing => 
        existing.date === s.date && 
        existing.patientName.toLowerCase().trim() === s.patientName.toLowerCase().trim() &&
        existing.procedure.toLowerCase().trim() === s.procedure.toLowerCase().trim()
      );

      if (isDuplicate) {
        console.warn('Surgery already exists, skipping:', s.patientName);
        skippedCount++;
        continue;
      }

      let finalHospitalId = s.hospitalId;
      if (finalHospitalId?.startsWith('NEW:')) {
        const hospitalName = s.hospitalName;
        const lowerName = hospitalName.toLowerCase();
        const existing = data.hospitals.find(x => x.name.toLowerCase().trim() === lowerName);
        if (existing) {
          finalHospitalId = existing.id;
        } else {
          finalHospitalId = '';
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

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size < 100) {
      toast.warning("O arquivo selecionado parece ser um atalho ou está vazio. Se você estiver usando o OneDrive, tente usar a opção 'COLAR' ou baixe o arquivo para o seu dispositivo.");
      return;
    }

    setIsImporting(true);
    setImportMessage('Lendo arquivo...');

    const reader = new FileReader();
    reader.onload = (evt) => {
      setTimeout(() => {
        try {
          const ab = evt.target?.result;
          if (!ab) {
            setIsImporting(false);
            return;
          }
          const wb = XLSX.read(ab, { type: 'array', cellDates: true });
          let allProcessedSurgeries: any[] = [];
          for (const sheetName of wb.SheetNames) {
            setImportMessage(`Processando aba: ${sheetName}...`);
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
            
            if (rows.length > 0) {
              // Look for hospital name in the first 20 rows (metadata area like Line 6)
              let sheetHospital = '';
              for (let i = 0; i < Math.min(rows.length, 20); i++) {
                const row = rows[i];
                if (!row) continue;
                const rowStr = JSON.stringify(row).toLowerCase();
                if (rowStr.includes('hospital') || rowStr.includes('unidade') || rowStr.includes('local:')) {
                  // Try to find the value next to the label
                  const found = row.find((cell: any) => cell && String(cell).length > 3 && !/hospital|unidade|local/i.test(String(cell)));
                  if (found) {
                    sheetHospital = String(found).trim();
                    break;
                  }
                }
              }

              const { headerIndex, headerRow } = findExcelHeaderRow(rows, [
                'Paciente', 'Cirurgia', 'Data', 'Hospital', 'Procedimento', 'Convênio', 'Convenio', 'Honorários', 'Recebidos', 'Empresa', 'Atendimento', 'Valor Pago', 'Valor (1/2)', 'DATA DA CIRURGIA', 'DESCRIÇÃO', 'VALOR BRUTO', 'VALOR PAGO', 'PAGO', 'VALOR (1/2)', 'CONVENIO', 'ATENDIMENTO', 'EMPRESA'
              ]);
              
              const firstDataRow = rows[headerIndex + 1];
              const finalHeaderRow = headerRow.map((h, i) => {
                if (!h && firstDataRow && firstDataRow[i]) {
                  const potentialHeader = String(firstDataRow[i]).trim();
                  const keywords = ['Paciente', 'Cirurgia', 'Data', 'Hospital', 'Procedimento', 'Convênio', 'Convenio', 'Honorários', 'Recebidos', 'Empresa', 'Atendimento', 'Valor Pago', 'Valor (1/2)', 'DATA DA CIRURGIA', 'DESCRIÇÃO', 'VALOR BRUTO', 'VALOR PAGO', 'PAGO', 'VALOR (1/2)', 'CONVENIO', 'ATENDIMENTO', 'EMPRESA'];
                  if (keywords.some(k => potentialHeader.toLowerCase().includes(k.toLowerCase()))) {
                    return potentialHeader;
                  }
                }
                return h;
              });
  
              const mappedData = rows.slice(headerIndex + 1).map(r => {
                const obj: any = {};
                finalHeaderRow.forEach((h, i) => {
                  if (h) obj[h] = r[i] !== undefined ? r[i] : '';
                });
                // Keep track of sheet name AND detected metadata hospital
                obj['_SheetName'] = sheetName;
                obj['_DetectedHospital'] = sheetHospital;
                return obj;
              }).filter(obj => {
                // Filter out completely empty rows (ignoring _SheetName)
                const values = Object.entries(obj)
                  .filter(([key]) => key !== '_SheetName')
                  .map(([_, v]) => v);
                return values.some(v => v !== '');
              });
  
              if (mappedData.length > 0) {
                const processed = processImportedSurgeries(mappedData);
                allProcessedSurgeries = [...allProcessedSurgeries, ...processed];
              }
            }
          }
          
          if (allProcessedSurgeries.length > 0) {
            setPreviewSurgeries(allProcessedSurgeries);
            setIsPreviewOpen(true);
          } else {
            toast.warning('Nenhum dado encontrado nas abas da planilha. Verifique se os cabeçalhos (Data, Paciente, etc.) estão presentes.');
          }
        } catch (err) {
          console.error(err);
          toast.error('Erro ao ler o Excel. Certifique-se de que é um arquivo .xlsx válido.');
        } finally {
          setIsImporting(false);
        }
      }, 100);
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
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
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf';

    try {
      setIsProcessing(true);
      setProcessingMessage(isPdf ? 'Processando documento...' : 'Otimizando imagem...');
      setIsModalOpen(true);
      const extracted = await extractSurgeryLabel(file);

      if (extracted?._usedModel?.includes('GEMINI_API_KEY_PAID')) {
        toast.warning(
          '⚠️ Usando processamento pago — cota gratuita esgotada hoje. Renova à meia-noite (horário de Brasília).',
          { duration: 8000 }
        );
      }

      // Try to find hospital by name if available
      let hospitalId = '';
      if (extracted && extracted.hospital && data.hospitals) {
        const hName = extracted.hospital.toLowerCase();
        const found = data.hospitals.find(h => h.name.toLowerCase().includes(hName) || hName.includes(h.name.toLowerCase()));
        if (found) hospitalId = found.id;
      }

      setDraftSurgery({
        ...extracted,
        hospitalId,
        date: (extracted && extracted.date) || new Date().toISOString().split('T')[0]
      });
    } catch (err: any) {
      console.error(err);
      let msg = isPdf 
        ? 'A extração do PDF falhou. Certifique-se de que o documento é legível.'
        : 'A leitura falhou. Tente tirar uma foto mais aproximada e nítida da etiqueta.';
      
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
      existing.patientName.toLowerCase().trim() === patientName.toLowerCase().trim() &&
      existing.procedure.toLowerCase().trim() === procedure.toLowerCase().trim()
    );

    if (isDuplicate && !draftSurgery.id) {
      toast.warning('Esta cirurgia já constava nos registros. Adicionada duplicidade.');
    }

    if (draftSurgery.id) {
      const existing = data.surgeries?.find(s => s.id === draftSurgery.id);
      updateSurgery(draftSurgery.id, { 
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
        aiSourceHash: draftSurgery.aiSourceHash || existing?.aiSourceHash || ''
      });
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

    setDraftSurgery(null);
    setIsModalOpen(false);
    if (hospitalId) setActiveHospitalId(hospitalId);
  };

  const filteredSurgeries = React.useMemo(() => data.surgeries
    .filter(s => activeHospitalId === 'ALL' || s.hospitalId === activeHospitalId)
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
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
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
        <input type="file" accept="image/*,application/pdf" ref={fileInputRef} className="hidden" onChange={handleCapture} />
        <input type="file" accept=".xlsx, .xls" ref={excelInputRef} className="hidden" onChange={handleExcelImport} />
        <input type="file" accept="image/*" ref={photoInputRef} className="hidden" multiple onChange={handlePhotoUpload} />
        <input type="file" accept="image/*" capture="environment" ref={photoCameraInputRef} className="hidden" onChange={handlePhotoUpload} />
        
        <div className="flex items-center gap-1.5 bg-zinc-100/50 p-1 rounded-2xl border border-zinc-200/50 overflow-x-auto no-scrollbar">
           <button 
             onClick={() => excelInputRef.current?.click()} 
             className="flex items-center justify-center gap-2 bg-white text-zinc-700 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
             title="Importar Excel"
           >
              <span className="action-dot" />
              <span>Excel</span>
           </button>
           <button 
             onClick={() => setIsPasteModalOpen(true)} 
             className="flex items-center justify-center gap-2 bg-white text-zinc-700 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
             title="Colar do Excel"
           >
              <span className="action-dot" />
              <span>Colar</span>
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
                    <tr><td colSpan={8} className="p-12 text-center text-zinc-300 italic text-[11px]">Nenhuma cirurgia registrada para este filtro.</td></tr>
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

      <Dialog isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Check-in Cirúrgico">
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
            ) : (
              <div className="p-3 bg-[#EAF7ED] border border-[#D5ECCF] rounded-2xl flex items-start gap-2.5 text-[11px] text-[#34A853] leading-relaxed">
                <span className="text-sm font-bold flex-shrink-0">✨</span>
                <div>
                  <p className="font-black uppercase tracking-wider text-[9px] mb-0.5">Etiqueta Importada com IA</p>
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
            <button type="submit" className="w-full py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
               <span className="action-dot" />
               Finalizar Checklist
            </button>
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
                        const timeA = a.date ? new Date(a.date).getTime() : 0;
                        const timeB = b.date ? new Date(b.date).getTime() : 0;
                        return timeB - timeA;
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
