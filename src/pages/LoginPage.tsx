import React from 'react';
import { useApp } from '../store/AppContext';
import { Logo } from '../components/Logo';
import { LogIn, ShieldCheck, Mail, Lock, Loader2, ExternalLink, UserPlus, HelpCircle, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export function LoginPage() {
  const { signIn, signInWithEmail, signUpWithEmail } = useApp();
  const [isLoading, setIsLoading] = React.useState(false);
  const [emailLoading, setEmailLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Estados do formulário de e-mail opcional
  const [showEmailForm, setShowEmailForm] = React.useState(false);
  const [isSignUp, setIsSignUp] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn();
    } catch (err: any) {
      console.error(err);
      setError('Erro ao entrar com Google (possível bloqueio de iFrame). Tente usar o Acesso Rápido abaixo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Login de bypass robusto e automático para ambientes de teste e iFrames
  const handleQuickBypassSignIn = async () => {
    setEmailLoading(true);
    setError(null);
    const demoEmail = 'medico@mednotes.com';
    const demoPass = 'mednotes123';

    try {
      // Primeiro tenta login
      await signInWithEmail(demoEmail, demoPass);
      toast.success('Entrando de imediato na sua mesa cirúrgica!');
    } catch (err: any) {
      // Se não existir, cria dinamicamente de forma silenciosa e transparente
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || String(err).includes('credential')) {
        try {
          await signUpWithEmail(demoEmail, demoPass);
          toast.success('Perfil profissional criado com sucesso!');
        } catch (signUpErr) {
          // Se mesmo assim falhar, tenta apenas o login comum novamente (ou exibe erro)
          try {
            await signInWithEmail(demoEmail, demoPass);
          } catch (finalErr) {
            setError('Não foi possível inicializar o acesso de testes. Tente criar uma conta de e-mail no formulário abaixo.');
          }
        }
      } else {
        setError('Erro na conexão com o Firebase Auth. Tente novamente.');
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Preencha todos os campos do seu e-mail profissional.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve conter pelo menos 6 dígitos.');
      return;
    }

    setEmailLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
        toast.success('Sua mesa cirúrgica privada foi configurada com sucesso!');
      } else {
        await signInWithEmail(email, password);
        toast.success('Benvindo de volta, Doutor!');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError('Médico não cadastrado com este e-mail. Selecione "Ainda não tenho conta" para criar.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Credenciais incorretas de e-mail ou senha.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail médico já possui uma credencial ativa.');
      } else {
        setError('Ocorreu um erro ao validar sua mesa cirúrgica virtual.');
      }
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-white font-sans text-zinc-900">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 p-10 flex flex-col items-center space-y-7"
      >
        <Logo className="h-16 animate-[pulse_3s_infinite_ease-in-out]" />
        
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">MedNotes Cloud</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] leading-none">Gestão Especializada & Notas Fiscais</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-red-50/70 border border-red-100 rounded-2xl p-4 text-center"
          >
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider leading-relaxed">{error}</p>
          </motion.div>
        )}

        <div className="w-full space-y-3">
          {/* BOTÃO PRINCIPAL DE BYPASS - Altamente resiliente */}
          <button 
            onClick={handleQuickBypassSignIn}
            disabled={emailLoading || isLoading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl flex items-center justify-center gap-3 transition-all text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-900/15 group relative overflow-hidden"
          >
            {emailLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Zap className="w-4 h-4 text-amber-300 fill-amber-300 animate-bounce group-hover:scale-110 transition-transform" />
            )}
            <span className="relative z-10">Acesso Rápido (Bypass)</span>
          </button>

          {/* Botão do Google Original */}
          <button 
            onClick={handleGoogleSignIn}
            disabled={isLoading || emailLoading}
            className="w-full bg-white border border-slate-200 py-3 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-50/50 hover:border-slate-300 transition-all text-[9px] font-bold uppercase tracking-widest text-slate-700"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4 grayscale opacity-50" alt="Google" />
            )}
            Entrar com Google
          </button>
          
          <div className="relative py-2 flex items-center justify-center">
            <span className="absolute inset-x-0 h-[1px] bg-slate-100"></span>
            <span className="relative px-3 bg-white text-[8px] font-black uppercase tracking-widest text-slate-300">Ou use email</span>
          </div>

          {/* Login de e-mail desdobrável */}
          <div className="w-full">
            {!showEmailForm ? (
              <button
                onClick={() => setShowEmailForm(true)}
                className="w-full py-2 flex items-center justify-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
              >
                <Mail className="w-3 h-3" />
                Usar Outra Conta de E-mail
              </button>
            ) : (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                onSubmit={handleEmailFormSubmit}
                className="space-y-3 pt-1"
              >
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="email"
                    placeholder="exemplo@mednotes.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50/60 border border-slate-150 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-slate-800"
                    disabled={emailLoading}
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="password"
                    placeholder="Sua senha secreta (min. 6 dgt)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50/60 border border-slate-150 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-slate-800"
                    disabled={emailLoading}
                    required
                  />
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    {isSignUp ? <UserPlus className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
                    {isSignUp ? 'Criar minha Mesa Cirúrgica' : 'Validar Entrada'}
                  </button>

                  <div className="flex items-center justify-between px-1">
                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {isSignUp ? 'Já possuo uma conta de e-mail' : 'Ainda não possuo conta'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmailForm(false)}
                      className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Fechar formulário
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </div>
          
          {window.self !== window.top && (
            <div className="flex justify-center pt-2">
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[8.5px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors bg-slate-50 border border-slate-100/80 px-4 py-2 rounded-full hover:shadow-sm"
              >
                <ExternalLink className="w-3 h-3" />
                Dificuldades? Abrir App Fora
              </a>
            </div>
          )}
        </div>

        <div className="pt-4 flex flex-col items-center">
          <p className="text-[8px] text-slate-300 font-bold uppercase tracking-[0.2em] flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400 fill-emerald-100/50" /> Uso Profissional Restrito & Seguro
          </p>
        </div>
      </motion.div>
    </div>
  );
}

