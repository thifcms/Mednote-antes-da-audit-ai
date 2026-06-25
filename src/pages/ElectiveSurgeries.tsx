import React, { useState, useRef } from 'react';
import { useApp, ElectiveSurgery } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Dialog } from '../components/ui/Dialog';
import { Plus, Search, Check, Edit2, Trash2, Info, Camera, Loader2, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, formatCurrency } from '../lib/utils';
import { toast } from 'sonner';
import { extractSurgeryLabel } from '../services/ai';

export function ElectiveSurgeries() {
  const { data, addElectiveSurgery, updateElectiveSurgery, deleteElectiveSurgery, addSurgery, cancelElectiveSurgery, deleteCancelledSurgery } = useApp();
  
  const [activeTab, setActiveTab] = useState<'active' | 'cancelled'>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processando...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [draftSurgery, setDraftSurgery] = useState<any>(null);
  const [isFinishingSurgery, setIsFinishingSurgery] = useState(false);
  const [surgeryToDelete, setSurgeryToDelete] = useState<any>(null);
  const [surgeryToCancel, setSurgeryToCancel] = useState<any>(null);
  const [surgeryToConfirmRealized, setSurgeryToConfirmRealized] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf';

    try {
      setIsProcessing(true);
      setProcessingMessage(isPdf ? 'Processando documento...' : 'Otimizando imagem...');
      setErrorMessage(null);
      setIsModalOpen(true);
      setIsFinishingSurgery(false);
      
      const extracted = await extractSurgeryLabel(file);
      
      if (extracted?._quotaExhausted || extracted?._usedModel?.includes('GEMINI_API_KEY_PAID')) {
        toast.warning(
          '⚠️ Usando processamento pago — cota gratuita esgotada hoje. Renova à meia-noite (horário de Brasília).',
          { duration: 8000 }
        );
      }
      
      // Try to find hospital by name if available
      let hospitalId = '';
      if (extracted.hospital && data.hospitals) {
        const hName = (extracted.hospital || '').toLowerCase();
        const found = data.hospitals.find(h => (h.name || '').toLowerCase().includes(hName) || hName.includes((h.name || '').toLowerCase()));
        if (found) hospitalId = found.id;
      }

      setDraftSurgery({
        ...extracted,
        hospitalId,
        date: extracted.date || new Date().toISOString().split('T')[0]
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
    const procedure = (form.elements.namedItem('procedure') as HTMLInputElement).value;
    const hospitalId = (form.elements.namedItem('hospitalId') as HTMLSelectElement).value;
    const isParticular = (form.elements.namedItem('isParticular') as HTMLInputElement).checked;
    const particularValue = parseFloat((form.elements.namedItem('particularValue') as HTMLInputElement)?.value || '0');

    if (isFinishingSurgery) {
       // Convert to regular surgery
       const insurance = isParticular ? 'PARTICULAR' : (form.elements.namedItem('insurance') as HTMLInputElement).value;
       const attendance = (form.elements.namedItem('attendance') as HTMLInputElement).value;
       const company = (form.elements.namedItem('company') as HTMLInputElement).value;
       const feesPaid = isParticular ? particularValue : parseFloat((form.elements.namedItem('feesPaid') as HTMLInputElement).value || '0');
       const receivedAmount = isParticular ? 0 : parseFloat((form.elements.namedItem('receivedAmount') as HTMLInputElement).value || '0');

       addSurgery({ 
         date, 
         patientName, 
         insurance, 
         attendance, 
         procedure, 
         indication: procedure,
         company, 
         feesPaid, 
         receivedAmount, 
         hospitalId, 
         notes: '',
         isParticular,
         particularValue,
         photos: [],
         aiSourceHash: draftSurgery.aiSourceHash || ''
       });
       if (draftSurgery.id) deleteElectiveSurgery(draftSurgery.id);
       toast.success("Cirurgia registrada e movida para Cirurgias Realizadas!");
    } else {
       if (draftSurgery.id) {
         const existing = data.electiveSurgeries?.find(s => s.id === draftSurgery.id);
         updateElectiveSurgery(draftSurgery.id, { 
           date, 
           patientName, 
           procedure, 
           hospitalId, 
           isParticular, 
           particularValue,
           aiSourceHash: draftSurgery.aiSourceHash || existing?.aiSourceHash || ''
         });
         toast.success("Procedimento atualizado!");
       } else {
         addElectiveSurgery({ 
           date, 
           patientName, 
           procedure, 
           hospitalId, 
           isParticular, 
           particularValue,
           aiSourceHash: draftSurgery.aiSourceHash || ''
         });
         toast.success("Procedimento solicitado com sucesso!");
       }
    }
    setDraftSurgery(null);
    setIsModalOpen(false);
    setIsFinishingSurgery(false);
  };

  const rawSurgeries = activeTab === 'active' 
    ? (data.electiveSurgeries || []) 
    : (data.cancelledSurgeries || []);

  const filteredSurgeries = rawSurgeries.filter(s => {
    // Search term filter
    const searchString = `${s.patientName} ${s.procedure} ${data.hospitals?.find(h => h.id === s.hospitalId)?.name || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());
    
    // Hospital filter
    const matchesHospital = hospitalFilter === 'ALL' || s.hospitalId === hospitalFilter;
    
    return matchesSearch && matchesHospital;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="flex flex-col min-h-full bg-white">
      <PageHeader 
        breadcrumbs={[
          { label: 'Eletivas Solicitadas' }
        ]}
      >
        <div className="flex items-center flex-wrap gap-2">
          <input 
            type="file" 
            accept="image/*,application/pdf" 
            capture="environment" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleCapture} 
          />
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setShowChoiceDialog(true)} 
              className="flex items-center gap-2 bg-[#162744] text-white px-5 md:px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              <span className="action-dot" />
              <span>Nova Eletiva</span>
            </button>
          </div>
        </div>
      </PageHeader>

      <main className="flex-1 p-4 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
         <div className={cn(
           "p-8 rounded-3xl shadow-xl shadow-zinc-200 text-center flex flex-col items-center justify-center border group transition-colors duration-300",
           activeTab === 'active' 
             ? "bg-[#162744] border-white/10" 
             : "bg-red-950 border-red-900"
         )}>
          <div className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1 group-hover:text-zinc-300 transition-colors">
            {activeTab === 'active' ? "Procedimentos Aguardando" : "Procedimentos Cancelados"}
          </div>
          <div className="text-4xl font-bold text-white tabular-nums tracking-tighter uppercase">
            {activeTab === 'active' ? (data.electiveSurgeries?.length || 0) : (data.cancelledSurgeries?.length || 0)} Pacientes
          </div>
         </div>

         <div style={{ borderRadius: 16, border: "1px solid #EAECF4", boxShadow: "0 1px 4px rgba(15,32,68,.06)" }} className="bg-white overflow-hidden flex flex-col min-h-[400px]">
          {/* Abas de Navegação */}
          <div className="flex border-b border-[#EAECF4] bg-[#F8F9FC]">
            <button
              onClick={() => setActiveTab('active')}
              className={cn(
                "flex-1 md:flex-none px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center justify-center gap-2",
                activeTab === 'active' 
                  ? "border-[#162744] text-[#162744] bg-white font-black" 
                  : "border-transparent text-zinc-400 hover:text-zinc-600 bg-transparent"
              )}
            >
              Solicitadas
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[8px] font-bold",
                activeTab === 'active' ? "bg-[#162744] text-white" : "bg-zinc-200 text-zinc-600"
              )}>
                {data.electiveSurgeries?.length || 0}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('cancelled')}
              className={cn(
                "flex-1 md:flex-none px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center justify-center gap-2",
                activeTab === 'cancelled' 
                  ? "border-red-600 text-red-600 bg-white font-black" 
                  : "border-transparent text-zinc-400 hover:text-zinc-600 bg-transparent"
              )}
            >
              Canceladas
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[8px] font-bold",
                activeTab === 'cancelled' ? "bg-red-600 text-white" : "bg-zinc-200 text-zinc-600"
              )}>
                {data.cancelledSurgeries?.length || 0}
              </span>
            </button>
          </div>

          <div className="px-6 py-4 border-b border-zinc-50 flex flex-col md:flex-row gap-4 items-center">
             <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
                <input 
                  type="text" 
                  placeholder="BUSCAR POR NOME OU PROCEDIMENTO..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="text-[10px] font-bold uppercase tracking-widest w-full pl-9 pr-4 py-2 bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" 
                  style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }}
                />
             </div>
             
             <select
                value={hospitalFilter}
                onChange={(e) => setHospitalFilter(e.target.value)}
                className="text-[10px] font-bold uppercase tracking-widest w-full md:w-auto px-4 py-2 bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all"
                style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }}
             >
                <option value="ALL">TODOS OS HOSPITAIS</option>
                {data.hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
             </select>
          </div>
          
          <div className="overflow-x-auto flex-1 w-full">
            <table className="w-full text-left min-w-max md:min-w-full">
               <thead style={{ background: "#F8F9FC" }}>
                  <tr style={{ background: "#F8F9FC" }}>
                     <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Data da Solicitação</th>
                     <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Paciente</th>
                     <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Hospital</th>
                     <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Indicação</th>
                     {activeTab === 'cancelled' && (
                       <>
                         <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Motivo do Cancelamento</th>
                         <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Data do Cancelamento</th>
                       </>
                     )}
                     <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Ações</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-zinc-50">
                  {filteredSurgeries.length === 0 ? (
                     <tr>
                        <td colSpan={activeTab === 'cancelled' ? 7 : 5} className="px-6 py-12 text-center text-zinc-400">
                           <div className="flex flex-col items-center gap-2">
                              <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center mb-2">
                                 <Plus className="w-5 h-5 text-zinc-300" />
                              </div>
                              <p className="text-xs font-bold uppercase tracking-widest">
                                {activeTab === 'active' ? "Nenhuma eletiva encontrada" : "Nenhum cancelamento encontrado"}
                              </p>
                           </div>
                        </td>
                     </tr>
                  ) : (
                     filteredSurgeries.map((surgery) => {
                        const hosp = data.hospitals?.find(h => h.id === surgery.hospitalId);
                        return (
                           <tr 
                              key={surgery.id} 
                              style={{ backgroundColor: "transparent" }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F5F6FB"}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                              className="group transition-all duration-150"
                           >
                              <td style={{ padding: "12px 14px" }}>
                                 <div className="text-[11px] font-mono font-bold text-[#8592A6]">{format(parseISO(surgery.date), 'dd/MM/yyyy')}</div>
                              </td>
                              <td style={{ padding: "12px 14px" }}>
                                 <div className="flex flex-col">
                                    <div className="text-[12px] font-bold text-zinc-900 uppercase truncate max-w-[150px] md:max-w-[200px]" title={surgery.patientName}>{surgery.patientName}</div>
                                    {surgery.isParticular ? (
                                       <div className="flex items-center gap-1 mt-0.5">
                                          <div className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[7px] font-black uppercase tracking-tighter border border-emerald-100">Particular</div>
                                          <span className="text-[9px] font-mono font-bold text-emerald-600">{formatCurrency(surgery.particularValue || 0)}</span>
                                       </div>
                                    ) : (
                                       surgery.insurance && (
                                         <div className="flex items-center gap-1 mt-0.5">
                                            <div className="px-1.5 py-0.5 bg-[#162744]/5 text-[#162744] rounded text-[7px] font-black uppercase tracking-tighter border border-[#162744]/10">{surgery.insurance}</div>
                                         </div>
                                       )
                                    )}
                                 </div>
                              </td>
                              <td style={{ padding: "12px 14px", fontSize: 10, textTransform: "uppercase", color: "#3D4A63", fontWeight: 700 }}>
                                 <div className="max-w-[120px] md:max-w-[150px] truncate" title={hosp?.name || '---'}>{hosp?.name || '---'}</div>
                              </td>
                              <td style={{ padding: "12px 14px" }}>
                                 <div className="text-[11px] font-bold text-zinc-600 uppercase truncate max-w-[150px] md:max-w-[200px]" title={surgery.procedure}>{surgery.procedure}</div>
                              </td>
                              {activeTab === 'cancelled' && (
                                <>
                                  <td style={{ padding: "12px 14px" }}>
                                     <span className={cn(
                                       "px-2.5 py-1 rounded text-[8px] font-black uppercase tracking-wide border",
                                       surgery.cancellationReason === 'Desistência do Paciente'
                                         ? "bg-amber-50 text-amber-700 border-amber-200"
                                         : "bg-red-50 text-red-700 border-red-200"
                                     )}>
                                       {surgery.cancellationReason}
                                     </span>
                                  </td>
                                  <td style={{ padding: "12px 14px" }}>
                                     <div className="text-[11px] font-mono font-bold text-[#8592A6]">
                                       {surgery.cancelledAt ? format(parseISO(surgery.cancelledAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '---'}
                                     </div>
                                  </td>
                                </>
                              )}
                              <td style={{ padding: "12px 14px", textAlign: "right" }}>
                                 <div className="flex justify-end gap-2 transition-opacity">
                                    {activeTab === 'active' ? (
                                      <>
                                        <button 
                                          onClick={() => { setSurgeryToConfirmRealized(surgery); }}
                                          style={{ borderRadius: 6 }}
                                          className="px-3 py-1.5 bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/25 text-[9px] font-bold uppercase flex items-center gap-1 transition-all"
                                          title="Marcar como realizada (migrar p/ Cirurgias)"
                                        >
                                          <Check className="w-3 h-3" /> Realizada
                                        </button>
                                        <button 
                                          onClick={() => { setDraftSurgery(surgery); setIsFinishingSurgery(false); setIsModalOpen(true); }}
                                          className="p-1.5 text-zinc-400 hover:text-zinc-900 transition-colors"
                                          title="Editar"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                          onClick={() => setSurgeryToCancel(surgery)}
                                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Cancelar Procedimento"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    ) : (
                                      <button 
                                        onClick={() => setSurgeryToDelete(surgery)}
                                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Excluir Registro de Cancelamento"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                 </div>
                              </td>
                           </tr>
                        );
                     })
                  )}
               </tbody>
            </table>
         </div>
       </div>
      </main>

      <Dialog 
        isOpen={showChoiceDialog} 
        onClose={() => setShowChoiceDialog(false)} 
        title="Nova Eletiva"
      >
        <div className="grid grid-cols-1 gap-4 py-4">
          <button
            onClick={() => {
              setShowChoiceDialog(false);
              setSearchTerm('');
              setIsModalOpen(true);
              setIsFinishingSurgery(false);
              setDraftSurgery({ date: new Date().toISOString().split('T')[0] });
            }}
            className="flex items-center justify-between p-5 border border-zinc-200 rounded-2xl hover:bg-zinc-50 transition-colors text-left"
          >
            <div className="flex gap-4 items-center">
              <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center">
                <Edit2 className="w-5 h-5 text-zinc-600" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Preenchimento Manual</p>
                <p className="text-[10px] text-zinc-400 font-bold">DIGITE OS DADOS CIRÚRGICOS</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-300" />
          </button>

          <button
            onClick={() => {
              setShowChoiceDialog(false);
              fileInputRef.current?.click();
            }}
            className="flex items-center justify-between p-5 border border-zinc-200 rounded-2xl hover:bg-zinc-50 transition-colors text-left"
          >
            <div className="flex gap-4 items-center">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Camera className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-900">Capturar Foto / Etiqueta</p>
                <p className="text-[10px] text-zinc-400 font-bold">USA IA PARA COLETAR PACIENTE E HOSPITAL</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-300" />
          </button>
        </div>
      </Dialog>

      <Dialog isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setDraftSurgery(null); setIsFinishingSurgery(false); }} title={isFinishingSurgery ? "Cirurgia Realizada" : (draftSurgery?.id ? "Editar Eletiva" : "Nova Eletiva")}>
         {isProcessing ? (
           <div className="py-20 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-zinc-900" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">{processingMessage}</p>
           </div>
         ) : draftSurgery && (
          <form onSubmit={handleSaveDraft} className="space-y-6" key={draftSurgery?.id || draftSurgery?.patientName || 'new-elective-draft'}>
            {(!draftSurgery.patientName && !draftSurgery.attendance && !draftSurgery.insurance) ? (
              <div className="p-3 bg-[#FCF8E3] border border-[#FBEED5] rounded-2xl flex items-start gap-2.5 text-[11px] text-[#C09853] leading-relaxed mb-1">
                <span className="text-sm font-bold flex-shrink-0">⚠️</span>
                <div>
                  <p className="font-black uppercase tracking-wider text-[9px] mb-0.5">Leitura automática parcial ou indisponível</p>
                  <p className="opacity-90">Não foi possível ler as informações legíveis por completo. Por favor, preencha ou complemente os campos manualmente abaixo.</p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-[#EAF7ED] border border-[#D5ECCF] rounded-2xl flex items-start gap-2.5 text-[11px] text-[#34A853] leading-relaxed mb-1">
                <span className="text-sm font-bold flex-shrink-0">✨</span>
                <div>
                  <p className="font-black uppercase tracking-wider text-[9px] mb-0.5">Eletiva Importada com IA</p>
                  <p className="opacity-90">Alguns dados foram extraídos do documento. Revise as informações nos campos abaixo antes de salvar.</p>
                </div>
              </div>
            )}
            {!isFinishingSurgery && (
              <div className="bg-zinc-50 p-4 rounded-xl mb-4 border border-zinc-100 flex gap-3 text-xs text-zinc-500">
                <Info className="w-4 h-4 text-[#162744] flex-shrink-0" />
                 Ao salvar, ela ficará listada aqui. Quando a cirurgia for feita, clique em "Realizada" na tabela para completar os dados de cobrança e enviar para a tela principal de Cirurgias.
              </div>
            )}
            <div>
               <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">PACIENTE</label>
               <input name="patientName" type="text" defaultValue={draftSurgery.patientName || ''} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all placeholder:zinc-200 uppercase" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} placeholder="NOME DO PACIENTE" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">{isFinishingSurgery ? "DATA REALIZADA" : "DATA DA SOLICITAÇÃO"}</label><input name="date" type="date" defaultValue={draftSurgery.date || new Date().toISOString().split('T')[0]} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} required /></div>
               <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">HOSPITAL</label>
                  <select name="hospitalId" defaultValue={draftSurgery.hospitalId || ''} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} required>
                     <option value="">Selecione Hospital...</option>
                     {data.hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
               </div>
            </div>
            <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">INDICAÇÃO</label><input name="procedure" type="text" defaultValue={draftSurgery.procedure || ''} className="w-full p-2.5 text-xs font-bold bg-white text-[#162744] focus:outline-none focus:border-[#B8962E] transition-all uppercase" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} required /></div>
            
            <div className="bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100/50 space-y-4">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <div className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-colors", draftSurgery.isParticular ? "bg-emerald-100 text-emerald-600" : "bg-zinc-100 text-zinc-400")}>
                        <Check className="w-4 h-4" />
                     </div>
                     <div>
                        <div className="text-[9px] font-black text-zinc-900 uppercase tracking-widest leading-none">Paciente Particular?</div>
                        <div className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter mt-0.5">MARQUE SE O PAGAMENTO FOR DIRETO</div>
                     </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      name="isParticular" 
                      type="checkbox" 
                      checked={draftSurgery.isParticular || false} 
                      onChange={(e) => setDraftSurgery({ ...draftSurgery, isParticular: e.target.checked })}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#162744]"></div>
                  </label>
               </div>

               {draftSurgery.isParticular && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 block">VALOR ACORDADO (R$)</label>
                    <input 
                      name="particularValue" 
                      type="number" 
                      step="0.01" 
                      defaultValue={draftSurgery.particularValue || ''} 
                      className="w-full p-2.5 text-xs font-mono font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all border border-emerald-100 placeholder:zinc-300" 
                      style={{ borderRadius: 10 }}
                      placeholder="0,00"
                      required={draftSurgery.isParticular}
                    />
                  </div>
               )}
            </div>

            {isFinishingSurgery && (
              <>
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                   <div>
                     <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">CONVÊNIO</label>
                     <input 
                       name="insurance" 
                       type="text" 
                       defaultValue={draftSurgery.isParticular ? 'PARTICULAR' : (draftSurgery.insurance || '')} 
                       disabled={draftSurgery.isParticular}
                       className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all uppercase disabled:bg-zinc-50 disabled:text-zinc-400" 
                       style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }}
                     />
                   </div>
                   <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">ATENDIMENTO</label><input name="attendance" type="text" defaultValue={draftSurgery.attendance || ''} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all uppercase" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="col-span-2"><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">EMPRESA</label><input name="company" type="text" defaultValue={draftSurgery.company || ''} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all uppercase" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} /></div>
                </div>
                {!draftSurgery.isParticular && (
                  <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">HONORÁRIOS (R$)</label><input name="feesPaid" type="number" step="0.01" defaultValue={draftSurgery.feesPaid || 0} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} /></div>
                     <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">RECEBIDOS (R$)</label><input name="receivedAmount" type="number" step="0.01" defaultValue={draftSurgery.receivedAmount || 0} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} /></div>
                  </div>
                )}
              </>
            )}

            <button type="submit" className="w-full py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
               <span className="action-dot" />
               {isFinishingSurgery ? "Concluir Cirurgia" : "Salvar Eletiva"}
            </button>
          </form>
         )}
      </Dialog>

      <Dialog 
        isOpen={!!surgeryToConfirmRealized} 
        onClose={() => setSurgeryToConfirmRealized(null)} 
        title="Confirmar Cirurgia Realizada"
      >
        <div className="space-y-4">
          <p className="text-zinc-600 text-xs font-bold uppercase tracking-wide">
            Tem certeza que deseja marcar a cirurgia eletiva do paciente <span className="text-[#162744] font-black">{surgeryToConfirmRealized?.patientName}</span> como realizada?
          </p>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight">
            Isto abrirá o formulário para você concluir os detalhes de faturamento (como convênio, honorários e dados adicionais) e mover a cirurgia para a lista principal de cirurgias realizadas.
          </p>
          <div className="flex gap-3 pt-2">
            <button 
              onClick={() => setSurgeryToConfirmRealized(null)}
              className="flex-1 py-3 border border-zinc-200 text-zinc-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                const targetSurgery = surgeryToConfirmRealized;
                setSurgeryToConfirmRealized(null);
                setDraftSurgery(targetSurgery);
                setIsFinishingSurgery(true);
                setIsModalOpen(true);
              }}
              style={{ borderRadius: 10, background: "#10b981" }}
              className="flex-1 py-3 text-white hover:bg-[#059669] rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-emerald-100 cursor-pointer"
            >
              Sim, Realizada
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog 
        isOpen={!!surgeryToDelete} 
        onClose={() => setSurgeryToDelete(null)} 
        title="Confirmar Exclusão"
      >
        <div className="space-y-4">
          <p className="text-zinc-600 text-xs font-bold uppercase tracking-wide">
            Tem certeza que deseja excluir o procedimento {activeTab === 'cancelled' ? 'cancelado' : 'solicitado'} para o paciente <span className="text-[#162744] font-black">{surgeryToDelete?.patientName}</span>?
          </p>
          <p className="text-[10px] text-red-500 font-bold uppercase tracking-tight">
            Esta ação removerá permanentemente este registro.
          </p>
          <div className="flex gap-3 pt-2">
            <button 
              onClick={() => setSurgeryToDelete(null)}
              className="flex-1 py-3 border border-zinc-200 text-zinc-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={async () => {
                if (surgeryToDelete) {
                  if (activeTab === 'cancelled') {
                    await deleteCancelledSurgery(surgeryToDelete.id);
                    toast.success("Histórico de cancelamento removido permanentemente!");
                  } else {
                    await deleteElectiveSurgery(surgeryToDelete.id);
                    toast.success("Procedimento removido com sucesso!");
                  }
                  setSurgeryToDelete(null);
                }
              }}
              className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-red-100"
            >
              Excluir
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog 
        isOpen={!!surgeryToCancel} 
        onClose={() => setSurgeryToCancel(null)} 
        title="Cancelar Procedimento Eletivo"
      >
        <div className="space-y-4">
          <p className="text-zinc-600 text-xs font-bold uppercase tracking-wide">
            Selecione o motivo do cancelamento da cirurgia eletiva do paciente <span className="text-[#162744] font-black">{surgeryToCancel?.patientName}</span>:
          </p>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight">
            O procedimento não será excluído, mas sim movido para a aba de registros cancelados para manter o histórico de auditoria médica.
          </p>
          <div className="flex flex-col gap-2.5 pt-2">
            <button 
              onClick={async () => {
                if (surgeryToCancel) {
                  await cancelElectiveSurgery(surgeryToCancel.id, "Desistência do Paciente");
                  toast.success("Procedimento cancelado por desistência do paciente!");
                  setSurgeryToCancel(null);
                }
              }}
              style={{ borderRadius: 10 }}
              className="w-full py-3.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-[#162744] font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center cursor-pointer border border-zinc-200"
            >
              Desistência do Paciente
            </button>
            <button 
              onClick={async () => {
                if (surgeryToCancel) {
                  await cancelElectiveSurgery(surgeryToCancel.id, "Procedimento Negado pela Operadora");
                  toast.success("Procedimento cancelado por negação da operadora!");
                  setSurgeryToCancel(null);
                }
              }}
              style={{ borderRadius: 10 }}
              className="w-full py-3.5 px-4 bg-red-50 hover:bg-red-100 text-red-600 font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center cursor-pointer border border-red-100"
            >
              Procedimento Negado pela Operadora
            </button>
            <button 
              onClick={() => setSurgeryToCancel(null)}
              className="w-full py-3 text-zinc-400 hover:text-zinc-600 font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center"
            >
              Cancelar / Voltar
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
