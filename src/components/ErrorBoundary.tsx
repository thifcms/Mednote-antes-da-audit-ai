import * as React from 'react';
import { AlertTriangle, RotateCcw, Download } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary capturou um erro:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  handleExportBackup = () => {
    try {
      const data = localStorage.getItem('app_data');
      if (!data) return;
      
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `emergencia_cirurgica_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao exportar backup de emergência:', err);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[32px] p-8 shadow-xl border border-zinc-200 text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black text-zinc-900 uppercase tracking-tight">Ponto de Segurança Ativado</h1>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Ocorreu um erro inesperado na interface. Seus dados estão salvos localmente e você pode baixá-los para segurança antes de reiniciar.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-left overflow-auto max-h-32">
                <code className="text-[10px] font-mono text-red-500 whitespace-pre-wrap">
                  {this.state.error.toString()}
                </code>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 pt-2">
              <button
                onClick={this.handleExportBackup}
                className="w-full py-4 bg-zinc-100 text-zinc-900 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" />
                Baixar Backup de Segurança
              </button>
              
              <button
                onClick={this.handleReset}
                className="w-full py-4 bg-[#162744] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-zinc-200 hover:bg-[#0f1b32] transition-all active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Reiniciar Aplicativo
              </button>
            </div>

            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
              EQUIPE DE DESENVOLVIMENTO DE GESTÃO CIRÚRGICA
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
