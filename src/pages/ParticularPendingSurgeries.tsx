import React from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Check, User, Hospital as HospitalIcon, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { safeFormat, formatCurrency } from '../lib/utils';
import { toast } from 'sonner';

export function ParticularPendingSurgeries() {
  const { data, updateSurgery } = useApp();
  
  const pendingParticularSurgeries = data.surgeries
    .filter(s => s.isParticular && (s.receivedAmount || 0) === 0)
    .sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

  const markAsPaid = async (surgery: any) => {
    try {
        await updateSurgery(surgery.id, { ...surgery, receivedAmount: (surgery.feesPaid || 0) });
        toast.success("Cirurgia marcada como paga!");
    } catch (e) {
        toast.error("Erro ao marcar como paga.");
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-white">
      <PageHeader 
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Cirurgias Pendentes' }
        ]}
      />

      <main className="flex-1 p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
         <div className="bg-emerald-50/65 border border-emerald-100 p-6" style={{ borderRadius: 16 }}>
            <div className="flex items-center gap-6">
               <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-emerald-100 shadow-sm">
                  <Activity className="w-6 h-6 text-emerald-500" />
               </div>
               <div>
                  <h2 className="text-xl font-extrabold text-[#162744] tracking-tight leading-none mb-1.5">{pendingParticularSurgeries.length} Pacientes</h2>
                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Pendentes de Recebimento de Particulares</p>
               </div>
            </div>
         </div>

         <div className="grid grid-cols-1 gap-4">
            {pendingParticularSurgeries.map((s) => {
              const hospital = data.hospitals.find(h => h.id === s.hospitalId);
              return (
                <div 
                  key={s.id} 
                  style={{ borderRadius: 16, boxShadow: "0 1px 4px rgba(15,32,68,.06)", border: "1px solid #EAECF4" }}
                  className="bg-white p-5 group transition-all duration-150 hover:border-[#162744] flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-3.5">
                         <div className="flex items-center gap-3">
                            <div className="p-2 bg-zinc-50 rounded-lg group-hover:bg-[#162744]/5 transition-colors">
                               <User className="w-4 h-4 text-[#8592A6]" />
                            </div>
                            <h3 className="font-extrabold text-[#162744] uppercase text-xs tracking-tight truncate">{s.patientName}</h3>
                         </div>
                         <div className="text-[10px] font-mono font-bold text-[#8592A6]">
                            {safeFormat(s.date, 'dd.MM.yyyy', 'DATA NÃO INFORMADA')}
                         </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-zinc-50 pt-4">
                         <div>
                            <span className="text-[8px] font-bold text-[#8592A6] uppercase tracking-widest block mb-1">Procedimento</span>
                            <span className="text-[11px] font-extrabold text-zinc-800 uppercase truncate block">{s.procedure}</span>
                         </div>
                         <div>
                            <span className="text-[8px] font-bold text-[#8592A6] uppercase tracking-widest block mb-1">Hospital</span>
                            <span className="text-[11px] font-extrabold text-zinc-800 uppercase truncate block">{hospital?.name || 'Não informado'}</span>
                         </div>
                         <div className="hidden md:block">
                            <span className="text-[8px] font-bold text-[#8592A6] uppercase tracking-widest block mb-1">Honorários</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[11px] font-extrabold text-[#B8962E] block">{formatCurrency(s.feesPaid)}</span>
                         </div>
                      </div>
                  </div>
                  
                  <button 
                    onClick={() => markAsPaid(s)}
                    style={{ borderRadius: 12 }}
                    className="ml-6 p-4.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all flex items-center justify-center shrink-0"
                    title="Marcar como Pago"
                  >
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </button>
                </div>
              );
            })}

            {pendingParticularSurgeries.length === 0 && (
              <div className="py-20 text-center">
                 <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
                    <Activity className="w-8 h-8" />
                 </div>
                 <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest italic">Nenhuma cirurgia particular pendente.</h3>
              </div>
            )}
         </div>
      </main>
    </div>
  );
}
