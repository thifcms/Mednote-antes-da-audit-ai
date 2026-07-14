import React, { useState, useRef } from 'react';
import { useApp, Surgery } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Dialog } from '../components/ui/Dialog';
import { formatCurrency, safeFormat, findExcelHeaderRow, parseFinancialAmount, areNamesFuzzyEqual } from '../lib/utils';
import { 
  UploadCloud, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  Loader2, 
  X,
  History,
  Check,
  User,
  ArrowRight,
  Camera,
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface ProposedUpdate {
  surgeryId: string;
  patientName: string;
  currentFees: number;
  newFees: number;
  increment: number;
  procedure: string;
  date: string;
}

export function PaymentReconciliation() {
  const { data, updateSurgery } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [proposedUpdates, setProposedUpdates] = useState<ProposedUpdate[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for manual unmatched payment reconciliation
  const [unmatchedPayments, setUnmatchedPayments] = useState<any[]>([]);
  const [reconcilingPayment, setReconcilingPayment] = useState<any | null>(null);
  const [surgerySearchText, setSurgerySearchText] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setProposedUpdates([]);
    setUnmatchedPayments([]);
    setAcceptedIds(new Set());

    const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);
    const isDocument = file.name.match(/\.(pdf|jpg|jpeg|png)$/i);

    if (isExcel) {
      handleExcelFile(file);
    } else if (isDocument) {
      handleDocumentWithAI(file);
    } else {
      setError('Formato de arquivo não suportado. Use Excel, CSV, PDF ou Imagem.');
      setIsProcessing(false);
    }
  };

  const processAndMatchPayments = (payments: { patientName: string, amount: number }[]) => {
    // Group and sum payments by patient name
    const groupedPayments = new Map<string, number>();
    payments.forEach(p => {
      const name = p.patientName.trim();
      if (name && p.amount > 0) {
        groupedPayments.set(name, (groupedPayments.get(name) || 0) + p.amount);
      }
    });

    // Match with existing surgeries using our fuzzy string matcher!
    const proposals: ProposedUpdate[] = [];
    const unmatched: any[] = [];
    let idCounter = 1;

    groupedPayments.forEach((amount, patientName) => {
      const surgery = data.surgeries.find(s => 
        areNamesFuzzyEqual(s.patientName, patientName)
      );

      if (surgery) {
        proposals.push({
          surgeryId: surgery.id,
          patientName: surgery.patientName,
          currentFees: surgery.feesPaid || 0,
          newFees: (surgery.feesPaid || 0) + amount,
          increment: amount,
          procedure: surgery.procedure,
          date: surgery.date
        });
      } else {
        unmatched.push({
          id: `unmatched-${idCounter++}-${Date.now()}`,
          patientName,
          amount
        });
      }
    });

    setProposedUpdates(proposals);
    setUnmatchedPayments(unmatched);

    if (proposals.length === 0 && unmatched.length === 0) {
      setError('Nenhum paciente identificado foi encontrado na sua lista de cirurgias.');
    }
    setIsProcessing(false);
  };

  const handleExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        const result = findExcelHeaderRow(rawData, ['PACIENTE', 'VALOR', 'NOME', 'REPASSE', 'MEDICO']);
        
        if (!result || result.headerRow.length === 0) {
          setError('Não foi possível encontrar o cabeçalho na planilha.');
          setIsProcessing(false);
          return;
        }

        const headers = result.headerRow.map(h => String(h || '').trim().toUpperCase());
        const rows = rawData.slice(result.headerIndex + 1);

        const patientCol = headers.findIndex(h => 
          h.includes('PACIENTE') || h.includes('NOME') || h.includes('BENEFICIARIO') || h.includes('CLIENTE')
        );
        const valueCol = headers.findIndex(h => 
          h.includes('VALOR') || h.includes('REPASSE') || h.includes('PAGO') || h.includes('LIQUIDO') || h.includes('BRUTO')
        );
        const doctorCol = headers.findIndex(h => 
          h.includes('MEDICO') || h.includes('PROFISSIONAL') || h.includes('PRESTADOR') || h.includes('THIAGO')
        );

        if (patientCol === -1 || valueCol === -1) {
          setError('Colunas "Paciente" ou "Valor" não encontradas na planilha.');
          setIsProcessing(false);
          return;
        }

        const DR_NAME = "THIAGO ANDRE DE OLIVEIRA S";
        
        // Filter rows by doctor name if the column exists
        let sourceRows = rows;
        if (doctorCol !== -1) {
          const doctorRows = rows.filter(row => 
            String(row[doctorCol] || '').trim().toUpperCase().includes(DR_NAME) ||
            String(row[doctorCol] || '').trim().toUpperCase().includes("THIAGO ANDRE")
          );
          if (doctorRows.length > 0) {
            sourceRows = doctorRows;
          }
        }

        const payments: { patientName: string, amount: number }[] = [];
        sourceRows.forEach(row => {
          const name = String(row[patientCol] || '').trim();
          const parsedVal = parseFinancialAmount(row[valueCol]);
          if (name && parsedVal > 0) {
            payments.push({ patientName: name, amount: parsedVal });
          }
        });

        processAndMatchPayments(payments);
      } catch (err) {
        setError('Erro ao processar planilha.');
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDocumentWithAI = async (file: File) => {
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const response = await fetch('https://audit-ai-6wed.onrender.com/api/reconcile/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': 'auditai_key_2026_medico'
        },
        body: JSON.stringify({
          fileType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          base64Data: base64,
          fileBase64: base64,
          fileName: file.name,
          filename: file.name,
          surgeries: data.surgeries,
          prompt: "Extraia os pagamentos de honorários/repasse deste relatório. Priorize as linhas que pertencem ao médico 'THIAGO ANDRE DE OLIVEIRA S'. Se não encontrar o nome do médico, extraia todos os pagamentos de pacientes visíveis. Retorne uma lista de pacientes e seus respectivos valores pagos.",
          schema: {
            description: "Lista de pagamentos",
            type: "object",
            properties: {
              payments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    patientName: { type: "string", description: "Nome completo do paciente" },
                    amount: { type: "number", description: "Valor repassado/pago (número)" }
                  },
                  required: ["patientName", "amount"]
                }
              }
            },
            required: ["payments"]
          }
        })
      });

      if (!response.ok) throw new Error('Falha na comunicação com a IA de Conciliação');
      
      const resData = await response.json();
      console.log("Response from /api/reconcile/match:", resData);

      if (resData.proposedUpdates || resData.proposals) {
        const proposals = resData.proposedUpdates || resData.proposals;
        const unmatched = resData.unmatchedPayments || resData.unmatched || [];
        setProposedUpdates(proposals);
        setUnmatchedPayments(unmatched);
        setIsProcessing(false);
      } else {
        const payments = resData.payments || resData.analysis?.payments || [];
        if (payments && payments.length > 0) {
          processAndMatchPayments(payments);
        } else {
          setError('Nenhum pagamento identificado no documento.');
          setIsProcessing(false);
        }
      }
    } catch (err) {
      setError('Erro ao processar com IA. Tente novamente ou use uma planilha.');
      setIsProcessing(false);
    }
  };

  const handleAcceptManual = async (update: ProposedUpdate) => {
    try {
      await updateSurgery(update.surgeryId, { feesPaid: update.newFees });
      setAcceptedIds(prev => new Set(prev).add(update.surgeryId));
      toast.success("Baixa de honorário realizada!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcceptAll = async () => {
    setIsProcessing(true);
    try {
      for (const update of proposedUpdates) {
        if (!acceptedIds.has(update.surgeryId)) {
          await updateSurgery(update.surgeryId, { feesPaid: update.newFees });
        }
      }
      setAcceptedIds(new Set(proposedUpdates.map(u => u.surgeryId)));
      toast.success("Todas as baixas pendentes foram realizadas!");
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProposals = proposedUpdates.filter(u => !acceptedIds.has(u.surgeryId));

  return (
    <div className="space-y-6">
      <PageHeader 
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Conciliação Cirúrgica' }
        ]}
      />

      {/* Upload Section */}
      <div className="bg-white rounded-[32px] p-8 border border-zinc-200 shadow-sm overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <History className="w-32 h-32 text-zinc-900" />
        </div>
        
        <div className="relative z-10">
          <div className="max-w-xl">
             <h2 className="text-2xl font-black text-zinc-900 tracking-tight leading-none mb-2">Conciliação Cirúrgica</h2>
             <p className="text-xs text-zinc-500 font-medium leading-relaxed mb-6 italic">
                Selecione o arquivo do relatório de pagamentos (.xlsx, .csv, .pdf ou fotos). O sistema irá identificar os pacientes usando IA, somar os valores e sugerir a atualização automática dos honorários.
             </p>

             <div 
               onClick={() => fileInputRef.current?.click()}
               className="cursor-pointer border-2 border-dashed border-zinc-200 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 hover:border-zinc-400 hover:bg-zinc-50 transition-all group/upload"
             >
                <div className="flex gap-4 mb-2">
                   <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 group-hover/upload:scale-110 group-hover/upload:text-zinc-600 transition-all">
                      <FileSpreadsheet className="w-6 h-6" />
                   </div>
                   <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 group-hover/upload:scale-110 group-hover/upload:text-zinc-600 transition-all">
                      <FileText className="w-6 h-6" />
                   </div>
                   <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 group-hover/upload:scale-110 group-hover/upload:text-zinc-600 transition-all">
                      <Camera className="w-6 h-6" />
                   </div>
                </div>
                <div className="text-center">
                   <div className="text-[10px] font-black uppercase tracking-widest text-zinc-900 mb-1">Selecionar ou Fotografar Relatório</div>
                   <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight">Excel, CSV, PDF ou Imagem</div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv, .pdf, image/*" 
                  className="hidden" 
                />
             </div>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isProcessing ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-3xl p-12 border border-zinc-200 flex flex-col items-center justify-center gap-4 shadow-sm"
          >
            <Loader2 className="w-8 h-8 text-zinc-900 animate-spin" />
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Processando planilha...</div>
          </motion.div>
        ) : error ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-50 rounded-3xl p-8 border border-red-100 flex items-center gap-4 shadow-sm"
          >
            <AlertCircle className="w-6 h-6 text-red-500" />
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-red-900 mb-0.5">Aviso</div>
              <div className="text-xs text-red-700 font-bold">{error}</div>
            </div>
          </motion.div>
        ) : (filteredProposals.length > 0 || unmatchedPayments.length > 0) ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            {filteredProposals.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-4">
                  <div>
                    <div className="text-xs font-black text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                      Sugestões de Atualização <span className="px-2 py-0.5 bg-zinc-900 text-white rounded-full text-[8px] animate-pulse">{filteredProposals.length}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight mt-0.5 italic">Os valores encontrados serão somados aos valores atuais</div>
                  </div>
                  <button 
                    onClick={handleAcceptAll}
                    style={{ borderRadius: 12 }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#162744] hover:bg-[#203a64] text-white text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Aceitar Todos
                  </button>
                </div>

                <div style={{ borderRadius: 16, border: "1px solid #EAECF4", boxShadow: "0 1px 4px rgba(15,32,68,.06)" }} className="bg-white overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead style={{ background: "#F8F9FC" }}>
                      <tr style={{ background: "#F8F9FC" }}>
                        <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Paciente / Data / Procedimento</th>
                        <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Saldo Atual</th>
                        <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Novo Valor</th>
                        <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {filteredProposals.map((update) => (
                        <tr 
                          key={update.surgeryId} 
                          className="group transition-all duration-150"
                          style={{ backgroundColor: "transparent" }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F5F6FB"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                          <td style={{ padding: "12px 14px" }}>
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-[#8592A6] group-hover:bg-[#162744] group-hover:text-white transition-all">
                                  <User className="w-3.5 h-3.5" />
                               </div>
                               <div>
                                  <div className="text-[12px] font-bold text-zinc-800 uppercase tracking-tight">{update.patientName}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                     <span className="text-[9px] font-mono font-bold text-[#8592A6]">{safeFormat(update.date, 'dd/MM/yyyy')}</span>
                                     <span className="w-1 h-1 rounded-full bg-zinc-200"></span>
                                     <span className="text-[9px] font-extrabold text-[#8592A6] uppercase tracking-widest">{update.procedure || 'Procedimento não inf.'}</span>
                                  </div>
                               </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                             <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>
                               {formatCurrency(update.currentFees)}
                             </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                             <div className="flex items-center gap-2">
                               <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }} className="line-through decoration-zinc-300">
                                 {formatCurrency(update.currentFees)}
                               </div>
                               <ArrowRight className="w-3 h-3 text-emerald-400" />
                               <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }} className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg font-mono">
                                 {formatCurrency(update.newFees)}
                               </div>
                             </div>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right" }}>
                            <button 
                              onClick={() => handleAcceptManual(update)}
                              className="w-8 h-8 bg-zinc-100 text-[#8592A6] rounded-full inline-flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all active:scale-90 cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {unmatchedPayments.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-zinc-100">
                <div className="px-4">
                  <div className="text-xs font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                    Pagamentos Não Identificados <span className="px-2 py-0.5 bg-amber-600 text-white rounded-full text-[8px]">{unmatchedPayments.length}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight mt-0.5 italic">Estes pagamentos vieram do relatório, mas não batem exatamente com nenhuma cirurgia. Vincule-os manualmente.</div>
                </div>

                <div style={{ borderRadius: 16, border: "1px solid #EAECF4", boxShadow: "0 1px 4px rgba(15,32,68,.06)" }} className="bg-white overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead style={{ background: "#F8F9FC" }}>
                      <tr style={{ background: "#F8F9FC" }}>
                        <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Paciente no Relatório</th>
                        <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Valor Repassado</th>
                        <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {unmatchedPayments.map((p) => (
                        <tr 
                          key={p.id} 
                          className="group transition-all duration-150"
                          style={{ backgroundColor: "transparent" }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F5F6FB"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                          <td style={{ padding: "12px 14px" }}>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                                <User className="w-3.5 h-3.5" />
                              </div>
                              <div className="text-[12px] font-bold text-zinc-800 uppercase tracking-tight">{p.patientName}</div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }} className="text-zinc-700 font-bold">
                              {formatCurrency(p.amount)}
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right" }}>
                            <button 
                              onClick={() => {
                                setReconcilingPayment(p);
                                setSurgerySearchText('');
                              }}
                              style={{ borderRadius: 8 }}
                              className="px-3.5 py-1.5 bg-[#162744] hover:bg-[#203a64] text-white hover:text-white text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1.5"
                            >
                              Vincular a Cirurgia
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : (proposedUpdates.length > 0 && acceptedIds.size === proposedUpdates.length && unmatchedPayments.length === 0) ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-50 rounded-3xl p-12 border border-emerald-100 flex flex-col items-center justify-center gap-4 text-center shadow-sm"
          >
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
               <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <div className="text-sm font-black uppercase tracking-widest text-emerald-900">Processo Finalizado</div>
              <div className="text-xs text-emerald-700 font-bold mt-1">Todas as conciliações foram aplicadas com sucesso.</div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Reconcile Manual Dialog */}
      <Dialog
        isOpen={reconcilingPayment !== null}
        onClose={() => setReconcilingPayment(null)}
        title="Vincular Repasse Manualmente"
        size="md"
      >
        {reconcilingPayment && (
          <div className="space-y-5">
            <div className="p-4 bg-amber-50/70 border border-amber-100 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[8px] font-extrabold text-amber-700 uppercase tracking-widest block mb-1">Paciente no Relatório</span>
                <span className="text-[13px] font-black text-zinc-900 uppercase block truncate max-w-[220px]">{reconcilingPayment.patientName}</span>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-extrabold text-amber-700 uppercase tracking-widest block mb-1">Valor do Repasse</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-black text-amber-950 block bg-white px-2 py-1 rounded-lg border border-amber-100">
                  {formatCurrency(reconcilingPayment.amount)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest block">Filtrar Cirurgias Cadastradas</label>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Pesquisar cirurgia (por paciente ou procedimento)..." 
                  value={surgerySearchText}
                  onChange={(e) => setSurgerySearchText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:outline-none focus:border-zinc-400 focus:bg-white"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {data.surgeries
                .filter(s => {
                  if (!surgerySearchText) return true;
                  const search = surgerySearchText.trim().toLowerCase();
                  return (
                    (s.patientName || '').toLowerCase().includes(search) ||
                    (s.procedure || '').toLowerCase().includes(search)
                  );
                })
                .sort((a, b) => {
                  const dateA = a.date ? new Date(a.date).getTime() : 0;
                  const dateB = b.date ? new Date(b.date).getTime() : 0;
                  return dateB - dateA;
                })
                .map((s) => {
                  const hospitalName = data.hospitals.find(h => h.id === s.hospitalId)?.name || 'Op. Geral';
                  const dateStr = s.date ? safeFormat(s.date, 'dd/MM/yyyy') : '---';
                  return (
                    <div 
                      key={s.id} 
                      className="p-3 border border-zinc-150 rounded-xl hover:border-zinc-400 transition-all flex items-center justify-between group"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-xs font-bold text-zinc-800 uppercase tracking-tight truncate mb-0.5">{s.patientName || 'Paciente Sem Nome'}</div>
                        <div className="flex items-center gap-1.5 text-[8px] font-extrabold text-[#8592A6] uppercase tracking-widest">
                          <span>{dateStr}</span>
                          <span className="w-1 h-1 rounded-full bg-zinc-200"></span>
                          <span className="truncate">{s.procedure || 'Proc. não inf.'}</span>
                          <span className="w-1 h-1 rounded-full bg-zinc-200"></span>
                          <span className="truncate text-zinc-500 font-bold">{hospitalName}</span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const unpaidFees = s.feesPaid || 0;
                            const newFees = unpaidFees + reconcilingPayment.amount;
                            await updateSurgery(s.id, { feesPaid: newFees });
                            
                            // Remove of unmatched list
                            setUnmatchedPayments(prev => prev.filter(p => p.id !== reconcilingPayment.id));
                            setReconcilingPayment(null);
                            setSurgerySearchText('');
                            
                            toast.success(`Vinculado com sucesso à cirurgia de ${s.patientName}!`);
                          } catch (err) {
                            toast.error("Erro ao vincular pagamento.");
                          }
                        }}
                        style={{ borderRadius: 8 }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-wider shrink-0 transition-all cursor-pointer"
                      >
                        Vincular
                      </button>
                    </div>
                  );
                }).length === 0 && (
                  <div className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-[#8592A6]">
                    Nenhuma cirurgia encontrada
                  </div>
                )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
