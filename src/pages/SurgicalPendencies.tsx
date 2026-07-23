import React from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/PageHeader';
import { MessageCircle, Mail, User, Calendar, Hospital as HospitalIcon, AlertTriangle } from 'lucide-react';
import { subMonths, isBefore, parseISO, isValid } from 'date-fns';
import { safeFormat } from '../lib/utils';

// Solicitações de cirurgia eletiva feitas há mais de 2 meses (data da
// solicitação) que ainda não foram liberadas/realizadas (ou seja, ainda
// aparecem em electiveSurgeries — se já tivesse sido feita, teria virado
// um registro em "surgeries" e saído dessa lista).
export function SurgicalPendencies() {
  const { data } = useApp();
  const cutoff = subMonths(new Date(), 2);

  const overdue = (data.electiveSurgeries || []).filter(s => {
    if (!s.date) return false;
    const d = parseISO(s.date);
    return isValid(d) && isBefore(d, cutoff);
  }).sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateA - dateB; // mais antigas primeiro (mais urgentes)
  });

  // Agrupa por hospital, pra deixar claro de qual serviço é cada pendência
  const grupos = new Map<string, { hospitalName: string; pacientes: typeof overdue }>();
  overdue.forEach(s => {
    const hospital = data.hospitals.find(h => h.id === s.hospitalId);
    const key = s.hospitalId || 'sem-hospital';
    const nome = hospital?.name || 'Hospital não informado';
    if (!grupos.has(key)) grupos.set(key, { hospitalName: nome, pacientes: [] });
    grupos.get(key)!.pacientes.push(s);
  });
  const gruposArray = Array.from(grupos.values()).sort((a, b) => b.pacientes.length - a.pacientes.length);

  const buildMessage = () => {
    let text = `Pendências Cirúrgicas (aguardando liberação há mais de 2 meses):\n`;
    gruposArray.forEach(g => {
      text += `\n*${g.hospitalName}*\n`;
      g.pacientes.forEach(p => {
        text += `- ${p.patientName} (solicitado em ${safeFormat(p.date, 'dd/MM/yy')})\n`;
      });
    });
    return text;
  };

  const handleWhatsAppShare = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildMessage())}`, '_blank');
  };

  const handleEmailShare = () => {
    const subject = "Pendências Cirúrgicas — Aguardando Liberação";
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildMessage())}`, '_blank');
  };

  return (
    <div className="flex flex-col min-h-full bg-white">
      <PageHeader
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Pendências Cirúrgicas' }
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
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight leading-none mb-1.5">{overdue.length} Pacientes</h2>
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">Solicitados há mais de 2 meses, ainda sem liberação</p>
            </div>
          </div>
        </div>

        {gruposArray.map(g => (
          <div key={g.hospitalName} className="space-y-3">
            <div className="flex items-center gap-2 px-1 min-w-0">
              <HospitalIcon className="w-4 h-4 text-[#8592A6] shrink-0" />
              <h3 className="text-[11px] font-black text-[#162744] uppercase tracking-widest truncate">{g.hospitalName}</h3>
              <span className="text-[9px] font-bold text-zinc-400 shrink-0">({g.pacientes.length})</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {g.pacientes.map(s => (
                <div
                  key={s.id}
                  style={{ borderRadius: 16, boxShadow: "0 1px 4px rgba(15,32,68,.06)", border: "1px solid #EAECF4" }}
                  className="bg-white p-5 group transition-all duration-150 hover:border-[#162744]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-2 bg-zinc-50 rounded-lg group-hover:bg-[#162744]/5 transition-colors shrink-0">
                        <User className="w-4 h-4 text-[#8592A6]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-[#162744] uppercase text-xs tracking-tight truncate">{s.patientName}</h4>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase truncate block mt-0.5">{s.procedure}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-600 shrink-0 whitespace-nowrap">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {safeFormat(s.date, 'dd.MM.yyyy', '—')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {overdue.length === 0 && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest italic">Nenhuma pendência há mais de 2 meses.</h3>
          </div>
        )}
      </main>
    </div>
  );
}
