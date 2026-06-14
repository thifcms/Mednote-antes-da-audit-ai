import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Settings, Percent, Save, CheckCircle2, Eye, EyeOff, Lock, Trash2, Download, Upload, ShieldCheck, FileSpreadsheet, Cloud, CloudOff, RefreshCw, Cpu, CheckCircle, XCircle } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';
import { toast } from 'sonner';

export function Preferences() {
  const { 
    data, 
    updateTaxPercentage, 
    deleteAllData, 
    exportBackup, 
    importBackup, 
    exportToExcel,
    syncDataToDrive,
    syncStatus,
    lastSynced,
    cloudBackupEnabled,
    setCloudBackupEnabled,
    signIn,
    updateAppPassword
  } = useApp();
  const [percentage, setPercentage] = useState(data.taxPercentage.toString());
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [docEngineStatus, setDocEngineStatus] = useState<'idle' | 'testing' | 'online' | 'offline'>('idle');

  const testDocEngine = async () => {
    setDocEngineStatus('testing');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(
        "https://drive-ai-file-reader-572028997371.us-east1.run.app/api/health",
        {
          method: "GET",
          headers: { "x-api-key": "dk_app_398621514c374c1bbaee5c20d65f2a83" },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      if (response.ok) {
        setDocEngineStatus('online');
        toast.success("Audit IA está Online!");
      } else {
        setDocEngineStatus('offline');
        toast.error("Audit IA está Offline.");
      }
    } catch (err) {
      setDocEngineStatus('offline');
      toast.error("Erro ao conectar com a IA.");
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(percentage.replace(',', '.'));
    if (!isNaN(value)) {
      updateTaxPercentage(value);
      toast.success("Alíquota atualizada!");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPassword = data.appPassword || '1234';
    if (oldPassword !== storedPassword) {
      alert('Senha atual incorreta');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Senhas não coincidem');
      return;
    }
    updateAppPassword(newPassword);
    toast.success("Senha do aplicativo alterada!");
    setPasswordSaved(true);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordSaved(false), 3000);
  };

  const handleDeleteAll = async () => {
    if (deletePassword !== 'APAGAR') {
      alert('Senha incorreta!');
      return;
    }
    setIsDeleting(true);
    await deleteAllData();
    setIsDeleting(false);
    setShowDeleteConfirm(false);
    setDeletePassword('');
    alert('Todos os dados foram apagados.');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await importBackup(content);
        toast.success("Backup restaurado com sucesso!");
      } catch (err) {
        toast.error("Erro ao importar backup. Verifique o arquivo.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      <header className="h-16 bg-white border-b border-zinc-200 px-8 flex items-center justify-between shadow-sm z-10 shrink-0">
        <h1 className="text-sm font-black uppercase tracking-widest text-zinc-900">Configurações</h1>
      </header>

      <div className="p-4 md:p-8 max-w-2xl mx-auto w-full space-y-8">
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
            <div className="p-2 bg-[#162744] rounded-xl">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Cálculos Financeiros</h2>
              <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight">Defina os parâmetros para os relatórios.</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="p-8 space-y-8">
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-zinc-700 uppercase tracking-widest">
                Alíquota de Impostos (%)
              </label>
              <div className="relative max-w-[200px]">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Percent className="h-3.5 w-3.5 text-zinc-400" />
                </div>
                <input
                  type="text"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 text-[11px] font-black border border-zinc-200 rounded-xl focus:border-[#162744] outline-none transition-all"
                  placeholder="EX: 11.33"
                />
              </div>
              <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight leading-relaxed">
                Este percentual será deduzido do faturamento bruto no dashboard para mostrar o valor líquido estimado.
              </p>
            </div>

            <div className="pt-6 border-t border-zinc-100 flex items-center gap-4">
              <button
                type="submit"
                className="flex items-center gap-3 bg-[#162744] hover:bg-[#0f1b32] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                <span className="action-dot" />
                <Save className="w-4 h-4" />
                Salvar Configurações
              </button>
              {saved && (
                <span className="flex items-center gap-2 text-emerald-600 text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-left-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Salvo!
                </span>
              )}
            </div>
          </form>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-xl">
                <Cpu className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Integração com Audit IA</h2>
                <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight">Status do motor de reconhecimento de documentos.</p>
              </div>
            </div>
            
            {docEngineStatus === 'online' && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-100 animate-in zoom-in">
                <CheckCircle className="w-3 h-3" />
                ✓ IA Conectada
              </span>
            )}
            {docEngineStatus === 'offline' && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-red-100 animate-in zoom-in">
                <XCircle className="w-3 h-3" />
                ✕ IA Offline
              </span>
            )}
          </div>

          <div className="p-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight leading-relaxed">
                  A Audit IA processa suas fotos e PDFs para extrair dados automaticamente. Use o botão abaixo para verificar se o serviço está operante.
                </p>
              </div>
              <button
                onClick={testDocEngine}
                disabled={docEngineStatus === 'testing'}
                className="flex items-center gap-2 bg-[#162744] hover:bg-[#0f1b32] disabled:opacity-50 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
              >
                {docEngineStatus === 'testing' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Testar Conexão
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[#162744] rounded-3xl border border-zinc-800 shadow-xl overflow-hidden text-white mb-8">
          <div className="p-6 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-xl">
                <Cloud className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-[10px] font-black text-white uppercase tracking-widest">Sincronização em Nuvem</h2>
                <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight">Cópia automática para o seu computador.</p>
              </div>
            </div>
            <button
              onClick={() => {
                if (cloudBackupEnabled) {
                  setCloudBackupEnabled(false);
                  toast.success("Backup automático desativado.");
                } else {
                  signIn();
                }
              }}
              className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                cloudBackupEnabled 
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                  : 'bg-white text-zinc-900 hover:bg-zinc-100'
              }`}
            >
              {cloudBackupEnabled ? 'Sincronização Ativa' : 'Ativar Backup'}
            </button>
          </div>

          <div className="p-8 space-y-6">
            {!cloudBackupEnabled ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto">
                  <CloudOff className="w-6 h-6 text-zinc-500" />
                </div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase leading-relaxed max-w-sm mx-auto">
                  Autorize o app apenas uma vez e seus dados serão salvos automaticamente no seu Google Drive como um arquivo Excel.
                </p>
                <button
                  onClick={signIn}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Autorizar Acesso ao Google Drive
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-full">
                      {syncStatus === 'syncing' ? (
                        <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                      ) : syncStatus === 'error' ? (
                        <CloudOff className="w-5 h-5 text-red-400" />
                      ) : (
                        <Cloud className="w-5 h-5 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-white uppercase tracking-widest">
                        Status: {syncStatus === 'syncing' ? 'Sincronizando...' : syncStatus === 'error' ? 'Erro na última tentativa' : 'Sincronizado'}
                      </p>
                      <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight">
                        {lastSynced ? `Último envio para Google Drive: ${new Date(lastSynced).toLocaleString('pt-BR')}` : 'Aguardando primeiro envio...'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => syncDataToDrive(true)}
                    disabled={syncStatus === 'syncing'}
                    className="p-3 hover:bg-white/10 rounded-xl transition-all"
                    title="Sincronizar agora"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-2">
                  <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight leading-relaxed">
                    <strong className="text-white">Dica PRO:</strong> O arquivo <code className="text-blue-400">GESTAO_CIRURGICA_DATABASE.xlsx</code> aparecerá na sua nuvem. Você pode abri-lo diretamente no Microsoft Excel ou Google Sheets para conferência rápida.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#E9F2FF] rounded-3xl border border-blue-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-blue-100 bg-blue-50/50 flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Cópia de Segurança (Nuvem / Excel)</h2>
              <p className="text-[9px] text-blue-400 font-bold uppercase tracking-tight">Exporte sua base inteira para leitura no Excel.</p>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={exportToExcel}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-white border border-blue-200 rounded-2xl hover:border-blue-400 transition-all group w-full"
              >
                <div className="p-3 bg-blue-50 rounded-full text-blue-600 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <span className="block text-[10px] font-black text-blue-900 uppercase tracking-widest">Relatório Mestre Excel (Download Direto)</span>
                  <span className="text-[8px] text-blue-400 font-bold uppercase">Multi-abas (Cirurgias, Notas e Pagamentos)</span>
                </div>
              </button>
            </div>

            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 space-y-2">
              <p className="text-[9px] text-blue-700 font-bold uppercase tracking-tight leading-relaxed">
                <strong className="text-blue-900">Como salvar na Nuvem Particular:</strong>
              </p>
              <ul className="list-disc list-inside text-[9px] text-blue-700 font-bold uppercase tracking-tight leading-relaxed">
                <li>Gere o <strong>Relatório Mestre Excel</strong> acima.</li>
                <li>Salve o arquivo em sua pasta sincronizada (OneDrive, Dropbox, iCloud).</li>
                <li>O arquivo conterá abas separadas para Cirurgias, Notas e Pagamentos.</li>
              </ul>
            </div>
          </div>
        </div>


        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <h2 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Segurança</h2>
            </div>
            <div className="p-8 border-b border-zinc-100">
               <button                onClick={() => {
                  sessionStorage.removeItem('is_authenticated');
                  window.location.reload();
                }}
                className="flex items-center gap-3 bg-red-50 hover:bg-red-100 text-red-600 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full justify-center"
              >
                 <Lock className="w-4 h-4" />
                 Bloquear App (Exigir Senha)
               </button>
               <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight leading-relaxed text-center mt-3">
                 Ao clicar aqui, você sairá do aplicativo e a tela de senha será exigida no próximo acesso.
               </p>
            </div>
            <form onSubmit={handleChangePassword} className="p-8 space-y-6 bg-zinc-50/30">
               <h2 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest mb-4">Alterar Senha do App</h2>
                <div className="relative">
                  <input type={showOld ? "text" : "password"} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="w-full p-4 rounded-xl border border-zinc-200" placeholder="Senha Atual" />
                  <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300">
                    {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="relative">
                  <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full p-4 rounded-xl border border-zinc-200" placeholder="Nova Senha" />
                  <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300">
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="relative">
                  <input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full p-4 rounded-xl border border-zinc-200" placeholder="Confirmar Nova Senha" />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button type="submit" className="w-full bg-[#162744] text-white py-3 rounded-xl font-bold uppercase tracking-widest text-[10px]">Alterar Senha</button>
                {passwordSaved && <p className="text-emerald-600 text-center text-xs">Senha alterada com sucesso!</p>}
            </form>
        </div>

        <div className="mt-8 bg-[#162744] rounded-3xl p-8 text-white shadow-xl shadow-zinc-200">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 text-zinc-500">Como funciona o cálculo?</h3>
          <p className="text-[10px] text-zinc-400 leading-relaxed uppercase font-bold tracking-tight">
            O sistema utiliza a fórmula <strong className="text-white font-mono text-[11px]">Valor Bruto × (1 - Percentual/100)</strong> para exibir o "Faturamento Líquido (Estimado)". 
            Isso ajuda você a ter uma visão mais realista do quanto sobrará após os impostos, antes mesmo das deduções por cooperativas ou glosas.
          </p>
        </div>
        
        <div className="bg-white rounded-3xl border border-red-200 shadow-sm overflow-hidden p-6 mt-8">
          <h2 className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-4">Zona de Perigo</h2>
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Apagar todos os dados
          </button>
        </div>
      </div>
      
      <Dialog isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Confirmar Exclusão Total">
        <div className="p-6 space-y-4 text-center">
          <p className="text-xs text-zinc-600">Esta ação não pode ser desfeita. Digite <span className="font-bold underline">APAGAR</span> para confirmar.</p>
          <input 
            type="password" 
            value={deletePassword} 
            onChange={e => setDeletePassword(e.target.value)}
            className="w-full p-3 text-center text-sm border rounded-xl"
          />
          <button 
            onClick={handleDeleteAll}
            disabled={isDeleting}
            className="w-full py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
          >
            {isDeleting ? 'Apagando...' : 'Confirmar Apagamento'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
