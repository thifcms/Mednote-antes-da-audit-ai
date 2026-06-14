import React, { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Dialog } from '../components/ui/Dialog';
import { Plus, Search, Banknote, Trash2, Download, FileSpreadsheet, Pencil } from 'lucide-react';
import { formatCurrency, safeFormat, cn } from '../lib/utils';
import { format, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Papa from 'papaparse';
import { motion } from 'motion/react';
import { toast } from 'sonner';

export function Payments() {
  const { data, addPayment, updatePayment, deletePayment, deletePayments, deleteAllInvoices } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'period' | 'all'>('period');
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [isDeleteSelectionOpen, setIsDeleteSelectionOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);
  const [isCleaningInvoices, setIsCleaningInvoices] = useState(false);
  const [newPayment, setNewPayment] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    description: '',
  });

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPayment.amount <= 0) return;
    
    if (editingPaymentId) {
      updatePayment(editingPaymentId, newPayment);
      toast.success("Recebimento atualizado com sucesso!");
    } else {
      addPayment(newPayment);
      toast.success("Recebimento registrado com sucesso!");
    }
    
    setIsModalOpen(false);
    setEditingPaymentId(null);
    setNewPayment({
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      description: '',
    });
  };

  const filteredPayments = data.payments.filter(payment => {
    const matchesSearch = (payment.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (filterType === 'all') return matchesSearch;
    return matchesSearch && payment.date >= startDate && payment.date <= endDate;
  }).sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
  });

  const exportToExcel = () => {
    const exportData = filteredPayments.map(p => ({
      Data: safeFormat(p.date, 'dd/MM/yyyy', 'INVÁLIDO'),
      Valor: p.amount,
      Descrição: p.description
    }));
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `recebimentos_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalReceived = filteredPayments.reduce((acc, p) => acc + p.amount, 0);

  const has2026Data = filteredPayments.some(p => p.date >= '2026-01-01');

  // Pre-calculate monthly billing totals for ALL invoices
  const monthlyBillings = useMemo(() => {
    const map = new Map<string, number>();
    data.invoices.forEach(inv => {
      const key = `${inv.year}-${inv.month}`;
      map.set(key, (map.get(key) || 0) + (inv.grossAmount || 0));
    });
    return map;
  }, [data.invoices]);

  const currentYear = new Date().getFullYear();
  const totalPaymentsYear = data.payments.filter(p => new Date(p.date).getFullYear() === currentYear).reduce((acc, p) => acc + p.amount, 0);
  const totalSurgeriesReceivedYear = data.surgeries.filter(s => new Date(s.date).getFullYear() === currentYear).reduce((acc, s) => acc + (s.receivedAmount || 0), 0);
  const combinedTotalYear = totalPaymentsYear + totalSurgeriesReceivedYear;

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
          { label: 'Extrato' }
        ]}
      >
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-zinc-100/50 p-1 rounded-2xl border border-zinc-200/50 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => {
                setSelectedIds(new Set());
                setIsDeleteSelectionOpen(true);
              }} 
              className="flex items-center gap-2 bg-white text-red-600 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
              title="Limpar Recebimentos"
            >
              <span className="action-dot !bg-red-500" />
              <span>Limpar</span>
            </button>
            
            <button 
              onClick={exportToExcel} 
              className="flex items-center gap-2 bg-white text-zinc-700 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-md active:scale-95 border border-zinc-100"
              title="Exportar CSV"
            >
              <span className="action-dot" />
              <span>Exportar</span>
            </button>

            <button 
              onClick={() => {
                setEditingPaymentId(null);
                setNewPayment({
                  date: new Date().toISOString().split('T')[0],
                  amount: 0,
                  description: '',
                 });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 bg-[#162744] text-white px-5 md:px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              <span className="action-dot" />
              <span>Lançar</span>
            </button>
          </div>
        </div>
      </PageHeader>

      <main className="flex-1 p-4 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div 
            style={{ borderRadius: 16, border: "1px solid #EAECF4", boxShadow: "0 1px 4px rgba(15,32,68,.06)", background: "#FFFFFF", padding: 24 }}
            className="text-center group"
          >
              <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 group-hover:text-zinc-500 transition-colors">Total Recebido (Ano)</div>
              <div className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tighter" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(totalPaymentsYear)}</div>
          </div>
          <div 
            style={{ borderRadius: 16, border: "1px solid #EAECF4", boxShadow: "0 1px 4px rgba(15,32,68,.06)", background: "rgba(14,164,114,0.05)", padding: 24 }}
            className="text-center group"
          >
              <div className="text-[9px] font-black text-[#0EA472] uppercase tracking-widest mb-1 group-hover:text-emerald-700 transition-colors">Total (Ano + Honorários)</div>
              <div className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tighter" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(combinedTotalYear)}</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="px-6 py-4 border-b border-zinc-50 flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
              <input type="text" placeholder="BUSCAR LANÇAMENTO..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-[10px] font-black uppercase tracking-widest w-full pl-9 pr-4 py-2.5 bg-zinc-50/50 border border-zinc-100 rounded-xl focus:outline-none focus:border-zinc-200 transition-all" />
            </div>
            <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-2">
              <div className="flex gap-2">
                <button 
                  onClick={() => setFilterType('period')} 
                  className={`flex-1 text-[9px] font-black px-3 py-2 rounded-xl uppercase tracking-widest transition-all ${filterType === 'period' ? 'bg-[#162744] text-white' : 'bg-zinc-100 text-zinc-500'}`}
                >
                  Período
                </button>
                <button 
                  onClick={() => setFilterType('all')} 
                  className={`flex-1 text-[9px] font-black px-3 py-2 rounded-xl uppercase tracking-widest transition-all ${filterType === 'all' ? 'bg-[#162744] text-white' : 'bg-zinc-100 text-zinc-500'}`}
                >
                  Todos
                </button>
              </div>
              {filterType === 'period' && (
                <div className="flex gap-2">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 text-[10px] font-black p-2 md:p-2.5 bg-zinc-50/50 border border-zinc-100 rounded-xl text-zinc-800 uppercase tracking-widest" />
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 text-[10px] font-black p-2 md:p-2.5 bg-zinc-50/50 border border-zinc-100 rounded-xl text-zinc-800 uppercase tracking-widest" />
                </div>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto flex-1 w-full">
            <table className="w-full text-left min-w-max md:min-w-full">
              <thead style={{ background: "#F8F9FC" }}>
                <tr style={{ background: "#F8F9FC" }}>
                  <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Data do Recebimento</th>
                  <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase" }}>Descrição / Fonte</th>
                  {has2026Data && <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Valor Faturado (Mês Anterior)</th>}
                  <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Valor Recebido</th>
                  {has2026Data && <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Taxas</th>}
                  <th style={{ padding: "11px 14px", fontSize: 8, fontWeight: 800, color: "#8592A6", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "center" }}>Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredPayments.map((payment) => {
                  const is2026Relevant = payment.date >= '2026-01-01';
                  let monthlyBilled = 0;
                  let taxRate = 0;

                  if (is2026Relevant) {
                    try {
                      // Get previous month
                      const d = parseISO(payment.date);
                      if (!isNaN(d.getTime())) {
                        const prevMonthDate = subMonths(d, 1);
                        const key = `${prevMonthDate.getFullYear()}-${prevMonthDate.getMonth() + 1}`;
                        monthlyBilled = monthlyBillings.get(key) || 0;
                        if (monthlyBilled > 0) {
                          const receivedRate = (payment.amount / monthlyBilled) * 100;
                          taxRate = 100 - receivedRate;
                        }
                      }
                    } catch (e) {
                      console.error("Error calculating row data for payment", e);
                    }
                  }

                  return (
                    <tr 
                      key={payment.id} 
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F5F6FB"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                      className="group transition-all duration-150"
                    >
                      <td style={{ padding: "12px 14px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>
                        {safeFormat(payment.date, 'dd.MM.yy')}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                         <div className="text-[12px] font-bold text-zinc-800 uppercase line-clamp-1 tracking-tight">{payment.description}</div>
                      </td>
                      {has2026Data && (
                        <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "#8592A6" }}>
                          {is2026Relevant && monthlyBilled > 0 ? formatCurrency(monthlyBilled) : '---'}
                        </td>
                      )}
                      <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "#162744" }}>
                        {formatCurrency(payment.amount)}
                      </td>
                      {has2026Data && (
                        <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "#0EA472" }}>
                          {is2026Relevant && taxRate > 0 ? `${taxRate.toFixed(1)}%` : '---'}
                        </td>
                      )}
                      <td className="px-6 py-4 text-center">
                       <button
                         onClick={() => {
                           setEditingPaymentId(payment.id);
                           setNewPayment({
                             date: payment.date,
                             amount: payment.amount,
                             description: payment.description,
                           });
                           setIsModalOpen(true);
                         }}
                         className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                         title="Editar"
                       >
                         <Pencil className="w-3.5 h-3.5" />
                       </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredPayments.length === 0 && (
                  <tr><td colSpan={has2026Data ? 6 : 4} className="p-12 text-center text-zinc-300 italic text-[11px]">Nenhum recebimento registrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Dialog 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingPaymentId(null);
        }} 
        title={editingPaymentId ? "Editar Recebimento" : "Novo Recebimento"}
      >
        <form onSubmit={handleAddPayment} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">DATA</label>
                <input type="date" required value={newPayment.date} onChange={e => setNewPayment({...newPayment, date: e.target.value})} className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} />
             </div>
             <div>
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">VALOR (R$)</label>
                <input type="number" step="0.01" required value={newPayment.amount || ''} onChange={e => setNewPayment({...newPayment, amount: parseFloat(e.target.value)})} placeholder="0,00" className="w-full p-2.5 text-xs font-mono font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} />
             </div>
          </div>
          <div>
            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">DESCRIÇÃO / FONTE</label>
            <input type="text" required value={newPayment.description} onChange={e => setNewPayment({...newPayment, description: e.target.value})} placeholder="Ex: Unimed Outubro" className="w-full p-2.5 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:border-[#B8962E] transition-all" style={{ borderRadius: 10, border: "1.5px solid #EAECF4" }} />
          </div>
          <button type="submit" className="w-full py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2">
            <span className="action-dot" />
            {editingPaymentId ? 'Atualizar Recebimento' : 'Confirmar Crédito'}
          </button>
        </form>
      </Dialog>

      <Dialog isOpen={isDeleteSelectionOpen} onClose={() => setIsDeleteSelectionOpen(false)} title="Limpar Recebimentos" size="md">
         <div className="p-4 space-y-6">
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
               <div className="text-xl font-black text-zinc-900">{selectedIds.size} / {data.payments.length}</div>
               <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Selecionados para apagar</div>
            </div>

            <div className="max-h-[50vh] overflow-auto border border-zinc-100 rounded-2xl bg-white">
               <table className="w-full text-left">
                  <thead className="bg-zinc-50 text-[9px] text-zinc-400 uppercase font-black border-b border-zinc-100">
                     <tr>
                        <th className="px-4 py-3 w-10">
                           <input 
                              type="checkbox" 
                              checked={selectedIds.size === data.payments.length && data.payments.length > 0} 
                              onChange={() => {
                                if (selectedIds.size === data.payments.length) setSelectedIds(new Set());
                                else setSelectedIds(new Set(data.payments.map(h => h.id)));
                              }}
                              className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                           />
                        </th>
                        <th className="px-3 py-3">Data</th>
                        <th className="px-3 py-3 text-right">Valor</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                     {[...data.payments].sort((a,b) => {
                        const timeA = a.date ? new Date(a.date).getTime() : 0;
                        const timeB = b.date ? new Date(b.date).getTime() : 0;
                        return timeB - timeA;
                     }).map(p => (
                        <tr key={p.id}>
                           <td className="px-4 py-3">
                              <input 
                                 type="checkbox" 
                                 checked={selectedIds.has(p.id)} 
                                 onChange={() => {
                                    const next = new Set(selectedIds);
                                    if (next.has(p.id)) next.delete(p.id);
                                    else next.add(p.id);
                                    setSelectedIds(next);
                                 }}
                                 className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                              />
                           </td>
                           <td className="px-3 py-3 text-[10px] font-mono text-zinc-400">
                              {safeFormat(p.date, 'dd/MM/yy', 'INVÁLIDO')}
                           </td>
                           <td className="px-3 py-3 text-right text-[10px] font-mono font-bold text-zinc-900">
                              {formatCurrency(p.amount)}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>

            <div className="flex gap-3">
               <button onClick={() => setIsDeleteSelectionOpen(false)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</button>
               <button 
                  disabled={selectedIds.size === 0 || isDeleting}
                  onClick={() => setIsConfirmingBatchDelete(true)}
                  className="flex-[2] py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
               >
                  Apagar {selectedIds.size} Selecionados
               </button>
            </div>
         </div>
      </Dialog>

      {/* Confirmação final de exclusão de recebimentos */}
      <Dialog isOpen={isConfirmingBatchDelete} onClose={() => setIsConfirmingBatchDelete(false)} title="Confirmar Exclusão Permanente">
        <div className="p-6 text-center space-y-6">
          <p className="text-sm text-zinc-600 leading-relaxed">
            Deseja mesmo excluir permanentemente os <strong className="text-red-600">{selectedIds.size}</strong> recebimentos selecionados? 
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
                   await deletePayments(Array.from(selectedIds));
                   setSelectedIds(new Set());
                   setIsDeleteSelectionOpen(false);
                   toast.success("Recebimentos excluídos com sucesso!");
                 } catch (err) {
                   toast.error("Erro ao excluir recebimentos.");
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
