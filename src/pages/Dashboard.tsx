import React, { useState, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { 
  FileText, 
  Activity, 
  Settings2, 
  ArrowRight, 
  UploadCloud, 
  Camera, 
  TrendingUp, 
  Download, 
  Banknote,
  Search,
  Loader2,
  Check,
  X,
  Stethoscope,
  Hospital as HospitalIcon,
  Plus,
  TrendingDown,
  History,
  CalendarCheck
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatCurrency, cn, safeFormat } from '../lib/utils';
import { format, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Papa from 'papaparse';
import { extractInvoiceDetails, extractSurgeryLabel } from '../services/ai';

export function Dashboard() {
  const { data, addInvoice, addSurgery } = useApp();
  const navigate = useNavigate();
  
  if (!data) return <div className="flex items-center justify-center h-full text-zinc-500 font-bold uppercase text-xs tracking-widest">Carregando dados...</div>;
  const [isExtracting, setIsExtracting] = useState(false);
  const [draftInvoice, setDraftInvoice] = useState<any>(null);
  const [draftSurgery, setDraftSurgery] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalBilled = data.invoices.reduce((acc, inv) => acc + (inv.netAmount || inv.amount || 0), 0);
  const totalReceived = data.payments.filter(p => (p.amount || 0) > 0).reduce((acc, p) => acc + (p.amount || 0), 0);
  const pending = totalBilled - totalReceived;

  const now = new Date();
  const currentMonthName = format(now, 'MMMM', { locale: ptBR });
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthName = format(nextMonth, 'MMMM', { locale: ptBR });
  
  const prevMonthDate = subMonths(now, 1);
  const prevMonthName = format(prevMonthDate, 'MMMM', { locale: ptBR });

  const thisMonthInvoices = data.invoices.filter(inv => {
    if (!inv.date) return false;
    const date = parseISO(inv.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonthInvoices.reduce((acc, inv) => acc + (inv.grossAmount || inv.amount || 0), 0);

  const prevMonthInvoices = data.invoices.filter(inv => {
    if (!inv.date) return false;
    const date = parseISO(inv.date);
    return date.getMonth() === prevMonthDate.getMonth() && date.getFullYear() === prevMonthDate.getFullYear();
  });
  const prevMonthTotal = prevMonthInvoices.reduce((acc, inv) => acc + (inv.grossAmount || inv.amount || 0), 0);

  const thisMonthPayments = data.payments.filter(p => {
    if (!p.date) return false;
    const date = parseISO(p.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const thisMonthReceivedFromPayments = thisMonthPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

  const taxPercentage = data.taxPercentage || 0;
  const nextMonthForecast = thisMonthTotal * (1 - taxPercentage / 100);

  const zeroFeesSurgeries = data.surgeries.filter(s => (s.feesPaid || 0) === 0);

  const thisYearInvoices = data.invoices.filter(inv => {
    if (!inv.date) return false;
    const date = parseISO(inv.date);
    return (!isNaN(date.getTime()) && date.getFullYear() === now.getFullYear());
  });
  const thisYearReceived = thisYearInvoices.reduce((acc, inv) => acc + (inv.netAmount || 0), 0);
  const thisYearTotal = thisYearInvoices.reduce((acc, inv) => acc + (inv.grossAmount || inv.amount || 0), 0);

  const thisMonthSurgeries = data.surgeries.filter(s => {
    if (!s.date) return false;
    const date = parseISO(s.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const thisMonthSurgeriesReceived = thisMonthSurgeries.reduce((acc, s) => acc + (s.feesPaid || 0), 0);

  const exportAll = () => {
    const allData: any[] = [];
    data.invoices.forEach(i => {
      allData.push({ Tipo: 'NOTA FISCAL', Data: i.date, Local: '', Documento: i.noteNumber, Nome: i.originalPayerName, Valor_Bruto: i.grossAmount, Descrição: i.description });
    });
    data.surgeries.forEach(s => {
      const hospital = data.hospitals.find(h => h.id === s.hospitalId);
      allData.push({ Tipo: 'CIRURGIA', Data: s.date, Local: hospital?.name || '', Nome: s.patientName, Atendimento: s.attendance, Descrição: s.procedure });
    });
    const csv = Papa.unparse(allData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `backup_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      const [invoiceResult, surgeryResult] = await Promise.all([
        extractInvoiceDetails(file),
        extractSurgeryLabel(file)
      ]);
      if (invoiceResult && (invoiceResult.grossAmount || invoiceResult.noteNumber)) {
        setDraftInvoice(invoiceResult);
      } else if (surgeryResult && (surgeryResult.patientName || surgeryResult.procedure)) {
        setDraftSurgery(surgeryResult);
      } else {
        if (invoiceResult) setDraftInvoice(invoiceResult);
        else if (surgeryResult) setDraftSurgery(surgeryResult);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao processar o arquivo. Tente novamente.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const date = (form.elements.namedItem('date') as HTMLInputElement).value;
    const grossAmount = parseFloat((form.elements.namedItem('grossAmount') as HTMLInputElement).value);
    const noteNumber = (form.elements.namedItem('noteNumber') as HTMLInputElement).value;
    const originalName = (form.elements.namedItem('originalPayerName') as HTMLInputElement).value;
    const matchedPayer = data.payers.find(p => p.customName?.toLowerCase() === originalName.toLowerCase());

    const isDuplicate = data.invoices.some(existing => 
      existing.date === date && 
      (existing.noteNumber || '') === noteNumber &&
      (existing.grossAmount || 0) === grossAmount
    );

    if (isDuplicate) {
      toast.warning('Esta nota fiscal já constava nos registros. Adicionada duplicidade.');
    }

    addInvoice({
      date,
      amount: grossAmount,
      grossAmount,
      netAmount: parseFloat((form.elements.namedItem('netAmount') as HTMLInputElement).value),
      noteNumber,
      originalPayerName: originalName,
      mappedPayerId: matchedPayer?.id || '',
      description: (form.elements.namedItem('description') as HTMLInputElement).value,
      month: parseInt(date.split('-')[1]) || 0,
      year: parseInt(date.split('-')[0]) || 0,
      emissionDayMonth: date ? `${date.split('-')[2]}/${date.split('-')[1]}` : ''
    });
    setDraftInvoice(null);
    navigate('/notas');
  };

  const confirmSurgery = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const date = (form.elements.namedItem('date') as HTMLInputElement).value;
    const patientName = (form.elements.namedItem('patientName') as HTMLInputElement).value;
    const procedure = (form.elements.namedItem('procedure') as HTMLInputElement).value;

    const isDuplicate = data.surgeries.some(existing => 
      existing.date === date && 
      (existing.patientName || '').toLowerCase().trim() === patientName.toLowerCase().trim() &&
      (existing.procedure || '').toLowerCase().trim() === procedure.toLowerCase().trim()
    );

    if (isDuplicate) {
      toast.warning('Esta cirurgia já constava nos registros. Adicionada duplicidade.');
    }

    addSurgery({
      date,
      patientName,
      insurance: (form.elements.namedItem('insurance') as HTMLInputElement).value,
      attendance: (form.elements.namedItem('attendance') as HTMLInputElement).value,
      procedure,
      hospitalId: (form.elements.namedItem('hospitalId') as HTMLSelectElement).value,
      receivedAmount: 0,
      feesPaid: 0,
      notes: '',
      company: '',
      indication: '',
      isParticular: false,
      particularValue: 0,
      photos: []
    });
    setDraftSurgery(null);
    navigate('/cirurgias');
  };

  return (
    <motion.div 
      className="flex flex-col min-h-full bg-slate-50/50"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <PageHeader breadcrumbs={[{ label: 'Início' }]}>
        <div className="flex items-center gap-1.5 bg-zinc-100/50 p-1 rounded-2xl border border-zinc-200/50">
          <button 
            onClick={exportAll} 
            className="flex items-center gap-2 bg-white text-zinc-700 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
            title="Exportar Backup Geral"
          >
            <span className="action-dot" />
            <span>Exportar Backup</span>
          </button>
        </div>
      </PageHeader>

      <main className="flex-1 p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="premium-glass-gradient rounded-[20px] p-6 relative overflow-hidden group shadow-[0_10px_30px_rgba(15,32,68,0.12)]">
            <div className="text-zinc-400 text-[10.5px] font-extrabold uppercase tracking-widest">Previsão {nextMonthName}</div>
            <div className="text-3xl font-black text-white font-mono mt-1 tracking-tight">{formatCurrency(nextMonthForecast)}</div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, marginTop: 12 }} className="flex items-center justify-between">
               <span className="text-[9px] text-zinc-400 uppercase font-black tracking-tight">Faturamento {currentMonthName}</span>
               <span className="text-[10px] font-bold text-zinc-300 font-mono">{formatCurrency(thisMonthTotal)}</span>
            </div>
          </div>
          
          <div className="premium-card p-6">
            <div className="text-zinc-500 text-[10.5px] font-extrabold uppercase tracking-widest flex items-center justify-between">
              Recebidos em {currentMonthName}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#162744" }} className="font-mono mt-1 tracking-tight">{formatCurrency(thisMonthReceivedFromPayments)}</div>
            <div style={{ borderTop: "1px solid rgba(226, 232, 240, 0.65)", paddingTop: 12, marginTop: 12 }} className="flex items-center justify-between">
               <span className="text-[9px] text-zinc-400 uppercase font-black tracking-tight">Faturamento {prevMonthName}</span>
               <span className="text-[10px] font-bold text-zinc-500 font-mono">{formatCurrency(prevMonthTotal)}</span>
            </div>
          </div>

          <Link 
            to="/particulares-pendentes" 
            className="premium-card p-6 block"
          >
            <div className="text-zinc-500 text-[10.5px] font-extrabold uppercase tracking-widest flex items-center justify-between">
              Particulares Pendentes
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#B8962E" }} className="font-mono mt-1 tracking-tight">{data.surgeries.filter(s => s.isParticular && (s.receivedAmount || 0) === 0).length}</div>
            <div style={{ borderTop: "1px solid rgba(226, 232, 240, 0.65)", paddingTop: 12, marginTop: 12 }} className="flex items-center justify-between">
               <span className="text-[9px] text-[#B8962E] uppercase font-black tracking-tight font-mono">Ver Pendentes</span>
               <Activity className="w-4 h-4 text-[#B8962E]" />
            </div>
          </Link>

          <Link 
            to="/honorarios-zero" 
            className="premium-card p-6 block"
          >
            <div className="text-zinc-400 text-[10.5px] font-extrabold uppercase tracking-widest flex items-center justify-between">
              Honorários Zero
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#B8962E" }} className="font-mono mt-1 tracking-tight">{zeroFeesSurgeries.length}</div>
            <div style={{ borderTop: "1px solid rgba(226, 232, 240, 0.65)", paddingTop: 12, marginTop: 12 }} className="flex items-center justify-between">
               <span className="text-[9px] text-[#B8962E] uppercase font-black tracking-tight font-mono">Ver Processos</span>
               <Activity className="w-4 h-4 text-[#B8962E]" />
            </div>
          </Link>
        </div>

        {/* Action Center */}
        <section className="pt-2">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-[10.5px] font-extrabold text-zinc-400 uppercase tracking-[0.2em]">Centro de Operações</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <Link to="/notas" className="premium-card p-6 flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 text-zinc-50 group-hover:text-zinc-100 transition-colors opacity-10 group-hover:opacity-20">
                   <Plus className="w-16 h-16" />
                </div>
                <div className="relative z-10 flex flex-col h-full justify-between">
                   <div className="w-9 h-9 bg-[#162744] rounded-xl flex items-center justify-center mb-4 shadow-sm">
                      <FileText className="w-4 h-4 text-white" />
                   </div>
                   <div>
                      <span className="text-[13px] font-extrabold text-zinc-900 uppercase tracking-wide block">Notas Fiscais</span>
                      <p className="text-[9px] text-zinc-400 mt-1 uppercase font-bold tracking-tight">Lançamento de Faturamento</p>
                   </div>
                </div>
             </Link>
             <Link to="/cirurgias" className="premium-card p-6 flex flex-col justify-between relative overflow-hidden group">
                <div className="relative z-10 flex flex-col h-full justify-between">
                   <div className="w-9 h-9 bg-zinc-100 rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:bg-[#162744] group-hover:text-white transition-colors">
                      <HospitalIcon className="w-4 h-4 text-zinc-650 group-hover:text-white transition-colors" />
                   </div>
                   <div>
                      <span className="text-[13px] font-extrabold text-zinc-900 uppercase tracking-wide block">Cirurgias</span>
                      <p className="text-[9px] text-zinc-400 mt-1 uppercase font-bold tracking-tight">{data.surgeries.length} Realizadas</p>
                   </div>
                </div>
             </Link>
             <Link to="/eletivas" className="premium-card p-6 flex flex-col justify-between relative overflow-hidden group">
                <div className="relative z-10 flex flex-col h-full justify-between">
                   <div className="w-9 h-9 bg-zinc-100 rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:bg-[#162744] group-hover:text-white transition-colors">
                      <CalendarCheck className="w-4 h-4 text-zinc-650 group-hover:text-white transition-colors" />
                   </div>
                   <div>
                      <span className="text-[13px] font-extrabold text-zinc-900 uppercase tracking-wide block">Eletivas</span>
                      <p className="text-[9px] text-zinc-400 mt-1 uppercase font-bold tracking-tight">{data.electiveSurgeries?.length || 0} Solicitadas</p>
                   </div>
                </div>
             </Link>
             <Link to="/conciliacao" className="premium-card p-6 flex flex-col justify-between relative overflow-hidden group">
                <div className="relative z-10 flex flex-col h-full justify-between">
                   <div className="w-9 h-9 bg-zinc-100 rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:bg-[#162744] group-hover:text-white transition-colors">
                      <History className="w-4 h-4 text-zinc-650 group-hover:text-white transition-colors" />
                   </div>
                   <div>
                      <span className="text-[13px] font-extrabold text-zinc-900 uppercase tracking-wide block">Conciliação</span>
                      <p className="text-[9px] text-zinc-400 mt-1 uppercase font-bold tracking-tight">Leitura de Repasses</p>
                   </div>
                </div>
             </Link>
          </div>
        </section>

        {/* Content View */}
        <div className="grid grid-cols-1 gap-6">
          <section className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                 <FileText className="w-4 h-4" />
                 Histórico Recente
              </h3>
              <Link to="/notas" className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-900 transition-colors">
                Ver Tudo
              </Link>
            </div>
            <div className="flex-1 overflow-x-auto w-full min-h-[400px]">
              <table className="w-full text-left min-w-max md:min-w-full">
                <thead style={{ background: "#F8F9FC" }}>
                  <tr style={{ background: "#F8F9FC" }}>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Emissão</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Fonte Pagadora</th>
                    <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Valor Bruto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {thisMonthInvoices.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-12 text-center text-zinc-300 italic text-[11px]">Nenhum registro encontrado este mês.</td></tr>
                  ) : (
                    [...thisMonthInvoices]
                      .sort((a, b) => {
                        const timeB = b.date ? new Date(b.date).getTime() : 0;
                        const timeA = a.date ? new Date(a.date).getTime() : 0;
                        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
                      })
                      .slice(0, 10)
                      .map(invoice => (
                        <tr 
                          key={invoice.id} 
                          className="group transition-all duration-150"
                          style={{ backgroundColor: "transparent" }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F5F6FB"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                          <td style={{ padding: "12px 14px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>
                            {safeFormat(invoice.date, "dd/MM")}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                             <div className="text-[10px] font-bold text-zinc-900 uppercase truncate max-w-[120px] md:max-w-[200px]">{invoice.originalPayerName || 'Importada'}</div>
                             <div className="text-[9px] text-zinc-400 font-medium uppercase truncate max-w-[120px] md:max-w-[200px]">{invoice.description}</div>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right" }}>
                             <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#162744" }}>{formatCurrency(invoice.grossAmount || invoice.amount)}</div>
                             <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6", fontWeight: 500 }}>{formatCurrency(invoice.netAmount || invoice.amount)} (Liq.)</div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {/* Modals para Confirmação de IA */}
      {draftInvoice && (
        <DialogDraft 
          title="Fatura Detectada" 
          icon={<FileText className="w-5 h-5 text-blue-600" />}
          onClose={() => setDraftInvoice(null)}
        >
          <form onSubmit={confirmInvoice} className="space-y-4">
             <input name="date" type="date" defaultValue={draftInvoice.date || ''} className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
             <input name="originalPayerName" type="text" defaultValue={draftInvoice.originalPayerName || ''} placeholder="Fonte Pagadora" className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.1em]">Bruto (R$)</label>
                   <input name="grossAmount" type="number" step="0.01" defaultValue={draftInvoice.grossAmount || ''} className="w-full p-2.5 text-xs font-mono font-bold bg-zinc-50 border border-zinc-200 rounded-xl" />
                </div>
                <div className="space-y-1">
                   <label className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.1em]">Líquido (R$)</label>
                   <input name="netAmount" type="number" step="0.01" defaultValue={draftInvoice.netAmount || ''} className="w-full p-2.5 text-xs font-mono font-bold bg-zinc-50 border border-zinc-200 rounded-xl" />
                </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <input name="noteNumber" type="text" defaultValue={draftInvoice.noteNumber || ''} placeholder="Nº da Nota" className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
                <input name="description" type="text" defaultValue={draftInvoice.description || ''} placeholder="Descrição" className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
             </div>
             <button type="submit" className="w-full py-3 bg-[#162744] text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#0f1b32] transition-colors flex items-center justify-center gap-2">
                <span className="action-dot" />
                Confirmar Registro
             </button>
          </form>
        </DialogDraft>
      )}

      {draftSurgery && (
        <DialogDraft 
          title="Etiqueta Cirúrgica" 
          icon={<HospitalIcon className="w-5 h-5 text-orange-600" />}
          onClose={() => setDraftSurgery(null)}
        >
          <form onSubmit={confirmSurgery} className="space-y-4">
             <input name="date" type="date" defaultValue={draftSurgery.date || ''} className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
             <input name="patientName" type="text" defaultValue={draftSurgery.patientName || ''} placeholder="Nome do Paciente" className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
             <div className="grid grid-cols-2 gap-4">
                <input name="insurance" type="text" defaultValue={draftSurgery.insurance || ''} placeholder="Convênio" className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
                <input name="attendance" type="text" defaultValue={draftSurgery.attendance || ''} placeholder="Atendimento" className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
             </div>
             <input name="procedure" type="text" defaultValue={draftSurgery.procedure || ''} placeholder="Procedimento" className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl" />
             <select name="hospitalId" className="w-full p-2.5 text-xs font-bold border border-zinc-200 rounded-xl bg-white" required>
                <option value="">Local da Cirurgia...</option>
                {data.hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
             </select>
             <button type="submit" className="w-full py-3 bg-[#162744] text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#0f1b32] transition-colors flex items-center justify-center gap-2">
                <span className="action-dot" />
                Confirmar Cirurgia
             </button>
          </form>
        </DialogDraft>
      )}
    </motion.div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6"/></svg>;
}

function DialogDraft({ title, icon, onClose, children }: { title: string, icon: React.ReactNode, onClose: () => void, children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all" style={{ background: "rgba(15,32,68,.45)", backdropFilter: "blur(6px)" }}>
      <div className="bg-white shadow-2xl w-full max-w-md overflow-hidden border border-slate-200" style={{ borderRadius: 20 }}>
         <div className="p-6 border-b border-zinc-100 flex items-center justify-between" style={{ position: "sticky", top: 0, background: "#FFFFFF", borderRadius: "20px 20px 0 0", zIndex: 10 }}>
            <div className="flex items-center gap-3">
               <div className="p-2 bg-slate-50 rounded-xl">{icon}</div>
               <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">{title}</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
         </div>
         <div className="p-8">
            {children}
         </div>
      </div>
    </div>
  );
}
