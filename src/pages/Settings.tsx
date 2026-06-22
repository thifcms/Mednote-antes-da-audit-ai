import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Plus, Trash2, Settings2, Building, Tag, RotateCcw, Pencil } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';

export function Settings() {
  const { data, addPayer, updatePayer, deletePayer, deletePayers, addHospital, updateHospital, deleteHospital, deleteHospitals, deleteAllHospitals } = useApp();
  const [newPayerName, setNewPayerName] = useState('');
  const [newHospitalName, setNewHospitalName] = useState('');
  const [editingPayerId, setEditingPayerId] = useState<string | null>(null);
  const [editingPayerNameId, setEditingPayerNameId] = useState<string | null>(null);
  const [editPayerName, setEditPayerName] = useState('');
  const [editingHospitalId, setEditingHospitalId] = useState<string | null>(null);
  const [editHospitalName, setEditHospitalName] = useState('');
  const [isDeleteHospitalsOpen, setIsDeleteHospitalsOpen] = useState(false);
  const [isDeletePayersOpen, setIsDeletePayersOpen] = useState(false);
  const [selectedHospitalIds, setSelectedHospitalIds] = useState<Set<string>>(new Set());
  const [selectedPayerIds, setSelectedPayerIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [newAlias, setNewAlias] = useState('');
 
  const handleAddPayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayerName.trim()) return;
    addPayer({ customName: newPayerName, aliases: [newPayerName] });
    setNewPayerName('');
  };

  const handleAddHospital = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHospitalName.trim()) return;
    addHospital({ name: newHospitalName });
    setNewHospitalName('');
  };

  const handleAddAlias = (payerId: string) => {
    if (!newAlias.trim()) return;
    const payer = data.payers.find(p => p.id === payerId);
    if (payer) {
      const updatedAliases = [...new Set([...payer.aliases, newAlias.trim()])];
      updatePayer(payerId, { aliases: updatedAliases });
      setNewAlias('');
    }
  };

  const removeAlias = (payerId: string, aliasToRemove: string) => {
    const payer = data.payers.find(p => p.id === payerId);
    if (payer) {
      updatePayer(payerId, { aliases: payer.aliases.filter(a => a !== aliasToRemove) });
    }
  };

  const syncHospitalAsPayer = (hospitalName: string) => {
    const exists = data.payers.some(p => (p.customName || '').toLowerCase() === (hospitalName || '').toLowerCase());
    if (!exists) {
      addPayer({ customName: hospitalName, aliases: [hospitalName] });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-16 bg-white border-b border-zinc-200 px-8 flex items-center justify-between shadow-sm z-10 shrink-0">
        <h1 className="text-sm font-black uppercase tracking-widest text-zinc-900">Configuração de Hospitais e Convênios</h1>
        <div className="flex items-center gap-3">
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">Gerencie seus hospitais e o mapeamento de nomes de fontes pagadoras.</p>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-8 space-y-8 overflow-y-auto w-full max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Fontes Pagadoras */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
              <div className="p-2 bg-[#162744] rounded-xl">
                <Tag className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Fontes Pagadoras / Convênios</h2>
                <div className="flex items-center gap-4">
                  <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight">Personalize nomes lidos nas notas.</p>
                  <button 
                    onClick={() => {
                      setSelectedPayerIds(new Set());
                      setIsDeletePayersOpen(true);
                    }}
                    className="text-[9px] font-black text-red-600 uppercase border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-b border-zinc-100">
              <form onSubmit={handleAddPayer} className="flex gap-2">
                <input 
                  type="text" 
                  value={newPayerName}
                  onChange={e => setNewPayerName(e.target.value)}
                  placeholder="NOME AMIGÁVEL (EX: UNIMED)"
                  className="flex-1 p-3 text-[10px] font-black uppercase tracking-widest border border-zinc-200 rounded-xl focus:border-[#162744] outline-none transition-all"
                />
                <button 
                  type="submit"
                  className="bg-[#162744] hover:bg-[#0f1b32] text-white px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <span className="action-dot" />
                  Adicionar
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {data.payers.length === 0 ? (
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-center py-8 italic">Nenhuma fonte cadastrada.</p>
              ) : (
                data.payers.map(payer => (
                  <div key={payer.id} className="border border-zinc-100 rounded-2xl bg-zinc-50/50 overflow-hidden">
                    <div className="p-4 bg-white border-b border-zinc-100 flex items-center justify-between group/payer">
                      <div className="flex-1 mr-2">
                        {editingPayerNameId === payer.id ? (
                          <input 
                            value={editPayerName}
                            onChange={(e) => setEditPayerName(e.target.value)}
                            onBlur={() => {
                              if (editPayerName.trim()) {
                                updatePayer(payer.id, { customName: editPayerName.trim() });
                              }
                              setEditingPayerNameId(null);
                            }}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                if (editPayerName.trim()) {
                                  updatePayer(payer.id, { customName: editPayerName.trim() });
                                }
                                setEditingPayerNameId(null);
                              }
                            }}
                            className="font-black text-zinc-900 text-[10px] uppercase tracking-widest bg-transparent border-b border-zinc-300 outline-none w-full"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-black text-zinc-900 text-[10px] uppercase tracking-widest">{payer.customName}</span>
                            <button 
                              onClick={() => {
                                setEditingPayerNameId(payer.id);
                                setEditPayerName(payer.customName);
                              }}
                              className="text-zinc-400 hover:text-[#B8962E] transition-all p-1.5 bg-zinc-50 rounded-full border border-zinc-100 flex items-center justify-center cursor-pointer"
                              title="Editar Nome do Pagador"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => deletePayer(payer.id)}
                        className="text-zinc-300 hover:text-red-500 transition-colors p-1 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-4 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {payer.aliases.map(alias => (
                          <span key={alias} className="flex items-center gap-1.5 px-3 py-1 bg-white border border-zinc-200 text-zinc-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                            {alias}
                            <button onClick={() => removeAlias(payer.id, alias)} className="hover:text-red-500 text-zinc-400 font-bold ml-1">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          placeholder="RAZÃO SOCIAL QUE ESTÁ NA NOTA"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleAddAlias(payer.id);
                            }
                          }}
                          value={editingPayerId === payer.id ? newAlias : ''}
                          onFocus={() => setEditingPayerId(payer.id)}
                          onChange={(e) => {
                            setEditingPayerId(payer.id);
                            setNewAlias(e.target.value);
                          }}
                          className="flex-1 p-2 text-[9px] font-black border border-zinc-200 rounded-lg bg-white outline-none focus:border-[#162744]"
                        />
                        <button 
                          onClick={() => handleAddAlias(payer.id)}
                          className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-600 transition-all active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Hospitais */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
              <div className="p-2 bg-[#162744] rounded-xl">
                <Building className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Hospitais</h2>
                <div className="flex items-center gap-4">
                  <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight">Lista de hospitais onde as cirurgias são realizadas.</p>
                  <button 
                    onClick={() => {
                      setSelectedHospitalIds(new Set());
                      setIsDeleteHospitalsOpen(true);
                    }}
                    className="text-[9px] font-black text-red-600 uppercase border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-b border-zinc-100">
              <form onSubmit={handleAddHospital} className="flex gap-2">
                <input 
                  type="text" 
                  value={newHospitalName}
                  onChange={e => setNewHospitalName(e.target.value)}
                  placeholder="NOME DO HOSPITAL"
                  className="flex-1 p-3 text-[10px] font-black uppercase tracking-widest border border-zinc-200 rounded-xl focus:border-[#162744] outline-none transition-all"
                />
                <button 
                  type="submit"
                  className="bg-[#162744] hover:bg-[#0f1b32] text-white px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <span className="action-dot" />
                  Adicionar
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {data.hospitals.length === 0 ? (
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-center py-8 italic">Nenhum hospital cadastrado.</p>
              ) : (
                data.hospitals.map(hospital => (
                  <div key={hospital.id} className="flex items-center justify-between p-4 border border-zinc-100 rounded-xl bg-zinc-50 group hover:border-zinc-300 transition-colors">
                    <div className="flex flex-col flex-1 mr-4">
                      {editingHospitalId === hospital.id ? (
                        <input 
                          value={editHospitalName}
                          onChange={(e) => setEditHospitalName(e.target.value)}
                          onBlur={() => {
                            if (editHospitalName.trim()) {
                              updateHospital(hospital.id, { name: editHospitalName.trim() });
                            }
                            setEditingHospitalId(null);
                          }}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              if (editHospitalName.trim()) {
                                updateHospital(hospital.id, { name: editHospitalName.trim() });
                              }
                              setEditingHospitalId(null);
                            }
                          }}
                          className="font-black text-zinc-700 text-[10px] uppercase tracking-widest bg-transparent border-b border-zinc-300 outline-none w-full"
                          autoFocus
                        />
                      ) : (
                        <span className="font-black text-zinc-700 text-[10px] uppercase tracking-widest">{hospital.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => {
                          setEditingHospitalId(hospital.id);
                          setEditHospitalName(hospital.name);
                        }}
                        className="text-zinc-500 hover:text-[#B8962E] transition-all p-1.5 bg-white rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer shadow-sm"
                        title="Editar Hospital"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => syncHospitalAsPayer(hospital.name)}
                        title="Usar também como Fonte Pagadora"
                        className="text-zinc-500 hover:text-zinc-800 transition-all p-1.5 bg-white rounded-full border border-zinc-200 flex items-center justify-center cursor-pointer shadow-sm"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => deleteHospital(hospital.id)}
                        className="text-zinc-400 hover:text-red-500 transition-all p-1.5 bg-red-50/50 hover:bg-red-50 rounded-full border border-red-100 flex items-center justify-center cursor-pointer"
                        title="Excluir Hospital"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog isOpen={isDeleteHospitalsOpen} onClose={() => setIsDeleteHospitalsOpen(false)} title="Limpar Hospitais" size="md">
         <div className="p-4 space-y-6">
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
               <div className="text-xl font-black text-zinc-900">{selectedHospitalIds.size} / {data.hospitals.length}</div>
               <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Selecionados para apagar</div>
            </div>

            <div className="max-h-[50vh] overflow-auto border border-zinc-100 rounded-2xl bg-white">
               <table className="w-full text-left">
                  <thead className="bg-zinc-50 text-[9px] text-zinc-400 uppercase font-black tracking-widest border-b border-zinc-100">
                     <tr>
                        <th className="px-4 py-3 w-10">
                           <input 
                              type="checkbox" 
                              checked={selectedHospitalIds.size === data.hospitals.length && data.hospitals.length > 0} 
                              onChange={() => {
                                if (selectedHospitalIds.size === data.hospitals.length) setSelectedHospitalIds(new Set());
                                else setSelectedHospitalIds(new Set(data.hospitals.map(h => h.id)));
                              }}
                              className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                           />
                        </th>
                        <th className="px-3 py-3">Hospital</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                     {data.hospitals.map(h => (
                        <tr key={h.id}>
                           <td className="px-4 py-3">
                              <input 
                                 type="checkbox" 
                                 checked={selectedHospitalIds.has(h.id)} 
                                 onChange={() => {
                                    const next = new Set(selectedHospitalIds);
                                    if (next.has(h.id)) next.delete(h.id);
                                    else next.add(h.id);
                                    setSelectedHospitalIds(next);
                                 }}
                                 className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                              />
                           </td>
                           <td className="px-3 py-3 text-[10px] font-black text-zinc-700 uppercase">{h.name}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>

            <div className="flex gap-3">
               <button onClick={() => setIsDeleteHospitalsOpen(false)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</button>
               <button 
                  disabled={selectedHospitalIds.size === 0 || isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    await deleteHospitals(Array.from(selectedHospitalIds));
                    setIsDeleteHospitalsOpen(false);
                    setIsDeleting(false);
                  }}
                  className="flex-[2] py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
               >
                  {isDeleting ? 'Apagando...' : 'Apagar Selecionados'}
               </button>
            </div>
         </div>
      </Dialog>

      <Dialog isOpen={isDeletePayersOpen} onClose={() => setIsDeletePayersOpen(false)} title="Limpar Fontes Pagadoras" size="md">
         <div className="p-4 space-y-6">
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
               <div className="text-xl font-black text-zinc-900">{selectedPayerIds.size} / {data.payers.length}</div>
               <div className="text-[8px] text-zinc-400 font-black uppercase tracking-widest">Selecionados para apagar</div>
            </div>

            <div className="max-h-[50vh] overflow-auto border border-zinc-100 rounded-2xl bg-white">
               <table className="w-full text-left">
                  <thead className="bg-zinc-50 text-[9px] text-zinc-400 uppercase font-black tracking-widest border-b border-zinc-100">
                     <tr>
                        <th className="px-4 py-3 w-10">
                           <input 
                              type="checkbox" 
                              checked={selectedPayerIds.size === data.payers.length && data.payers.length > 0} 
                              onChange={() => {
                                if (selectedPayerIds.size === data.payers.length) setSelectedPayerIds(new Set());
                                else setSelectedPayerIds(new Set(data.payers.map(p => p.id)));
                              }}
                              className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                           />
                        </th>
                        <th className="px-3 py-3">Fonte Pagadora</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                     {data.payers.map(p => (
                        <tr key={p.id}>
                           <td className="px-4 py-3">
                              <input 
                                 type="checkbox" 
                                 checked={selectedPayerIds.has(p.id)} 
                                 onChange={() => {
                                    const next = new Set(selectedPayerIds);
                                    if (next.has(p.id)) next.delete(p.id);
                                    else next.add(p.id);
                                    setSelectedPayerIds(next);
                                 }}
                                 className="w-4 h-4 rounded border-zinc-300 text-[#162744] focus:ring-[#162744]"
                              />
                           </td>
                           <td className="px-3 py-3 text-[10px] font-black text-zinc-700 uppercase">{p.customName}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>

            <div className="flex gap-3">
               <button onClick={() => setIsDeletePayersOpen(false)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</button>
               <button 
                  disabled={selectedPayerIds.size === 0 || isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    await deletePayers(Array.from(selectedPayerIds));
                    setIsDeletePayersOpen(false);
                    setIsDeleting(false);
                  }}
                  className="flex-[2] py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
               >
                  {isDeleting ? 'Apagando...' : 'Apagar Selecionados'}
               </button>
            </div>
         </div>
      </Dialog>
    </div>
  );
}
