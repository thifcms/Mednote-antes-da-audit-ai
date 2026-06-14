import React from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Share2, Mail, MessageCircle, ArrowLeft, User, Calendar, Hospital as HospitalIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { safeFormat } from '../lib/utils';

export function ZeroFeesSurgeries() {
  const { data } = useApp();
  
  const zeroFeesSurgeries = data.surgeries
    .filter(s => (s.feesPaid || 0) === 0)
    .sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

  const handleWhatsAppShare = () => {
    const text = `Cirurgias Pendentes:\n\n${zeroFeesSurgeries.map(s => `- ${s.patientName} (${safeFormat(s.date, 'dd/MM/yy')})`).join('\n')}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleEmailShare = () => {
    const subject = "Relatório de Cirurgias Pendentes";
    const body = `Lista de Pacientes:\n\n${zeroFeesSurgeries.map(s => `- ${s.patientName} (${safeFormat(s.date, 'dd/MM/yy')})`).join('\n')}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  return (
    <div className="flex flex-col min-h-full bg-white">
      <PageHeader 
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Cirurgias Pendentes' }
        ]}
      >
        <div className="flex gap-2">
           <button 
             onClick={handleWhatsAppShare}
             style={{ borderRadius: 10 }}
             className="h-9 px-4 bg-[#10b981] text-white flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
           >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
           </button>
           <button 
             onClick={handleEmailShare}
             style={{ borderRadius: 10 }}
             className="h-9 px-4 bg-[#162744] text-white flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
           >
              <Mail className="w-3.5 h-3.5" />
              <span>E-mail</span>
           </button>
        </div>
      </PageHeader>

      <main className="flex-1 p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
         <div className="bg-amber-50/65 border border-amber-100 p-6" style={{ borderRadius: 16 }}>
            <div className="flex items-center gap-6">
               <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-amber-100 shadow-sm">
                  <Activity className="w-6 h-6 text-amber-500" />
               </div>
               <div>
                  <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight leading-none mb-1.5">{zeroFeesSurgeries.length} Pacientes</h2>
                  <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">Honorários marcados como zero (R$ 0,00)</p>
               </div>
            </div>
         </div>

         <div className="grid grid-cols-1 gap-4">
            {zeroFeesSurgeries.map((s) => {
              const hospital = data.hospitals.find(h => h.id === s.hospitalId);
              return (
                <div 
                  key={s.id} 
                  style={{ borderRadius: 16, boxShadow: "0 1px 4px rgba(15,32,68,.06)", border: "1px solid #EAECF4" }}
                  className="bg-white p-5 group transition-all duration-150 hover:border-[#162744]"
                >
                  <div className="flex items-center justify-between mb-3.5">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-50 rounded-lg group-hover:bg-[#162744]/5 transition-colors">
                           <User className="w-4 h-4 text-[#8592A6]" />
                        </div>
                        <h3 className="font-extrabold text-[#162744] uppercase text-xs tracking-tight">{s.patientName}</h3>
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
                        <span className="text-[8px] font-bold text-[#8592A6] uppercase tracking-widest block mb-1">Convênio</span>
                        <span className="text-[11px] font-extrabold text-[#B8962E] uppercase truncate block">{s.insurance || 'Não informado'}</span>
                     </div>
                  </div>
                </div>
              );
            })}

            {zeroFeesSurgeries.length === 0 && (
              <div className="py-20 text-center">
                 <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
                    <Activity className="w-8 h-8" />
                 </div>
                 <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest italic">Nenhuma cirurgia pendente.</h3>
              </div>
            )}
         </div>
      </main>
    </div>
  );
}

function Activity({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
}
