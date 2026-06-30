import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Eye, EyeOff, HelpCircle, ExternalLink, Fingerprint } from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../store/AppContext';
import { SplashScreen } from './SplashScreen';
import { toast } from 'sonner';
import { isBiometricsAvailable, authenticateBiometrics } from '../lib/biometrics';

export function SecurityWall({ children }: { children: React.ReactNode }) {
  const { user, data } = useApp();
  const [showAnimation, setShowAnimation] = useState(true);
  
  const initialAuth = sessionStorage.getItem('is_authenticated') === 'true';
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth);
  const [showMainSplash, setShowMainSplash] = useState(initialAuth);
  
  const [isExiting, setIsExiting] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [showHint, setShowHint] = useState(false);
  
  const [biometricsSupported, setBiometricsSupported] = useState<boolean | null>(null);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [isAuthenticatingBiometrics, setIsAuthenticatingBiometrics] = useState(false);
  const hasAttemptedAutoAuth = React.useRef(false);

  const isIframe = window.self !== window.top;

  useEffect(() => {
    if (showAnimation && !isAuthenticated) {
      const timer = setTimeout(() => {
        setShowAnimation(false);
      }, 2500); // 2.5 seconds animation
      return () => clearTimeout(timer);
    }
  }, [showAnimation, isAuthenticated]);

  useEffect(() => {
    if (showMainSplash) {
      const timer = setTimeout(() => {
        setShowMainSplash(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [showMainSplash]);

  const handleBiometricAuth = async () => {
    if (!user) return;
    setIsAuthenticatingBiometrics(true);
    try {
      const success = await authenticateBiometrics(user.uid);
      if (success) {
        setIsExiting(true);
        setTimeout(() => {
          setIsAuthenticated(true);
          sessionStorage.setItem('is_authenticated', 'true');
          setShowMainSplash(true);
        }, 500);
        toast.success("Acesso biométrico autorizado!");
      }
    } catch (err: any) {
      console.error(err);
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        toast.error(`Erro na biometria: ${err.message || 'Tente digitar seu PIN'}`);
      }
    } finally {
      setIsAuthenticatingBiometrics(false);
    }
  };

  useEffect(() => {
    if (user && !isAuthenticated && !showAnimation) {
      const enabled = localStorage.getItem(`biometric_enabled_${user.uid}`) === 'true';
      setBiometricsEnabled(enabled);
      
      isBiometricsAvailable().then((supported) => {
        setBiometricsSupported(supported);
        if (supported && enabled && !hasAttemptedAutoAuth.current) {
          hasAttemptedAutoAuth.current = true;
          // Dispara o prompt biométrico nativo automaticamente se estiver habilitado
          const timer = setTimeout(() => {
            handleBiometricAuth();
          }, 600);
          return () => clearTimeout(timer);
        }
      });
    }
  }, [user, isAuthenticated, showAnimation]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPassword = data.appPassword || '1234';
    if (password === storedPassword) {
      setIsExiting(true);
      setTimeout(() => {
         setIsAuthenticated(true);
         sessionStorage.setItem('is_authenticated', 'true');
         setShowMainSplash(true);
      }, 500); // Shorter exit timeout
    } else {
      setError(true);
      setPassword('');
      setTimeout(() => setError(false), 1000);
    }
  };

  const handleForgotPassword = () => {
    setShowHint(true);
  };

  if (!isAuthenticated) {
    return (
      <AnimatePresence>
        {!isExiting ? (
          showAnimation ? (
            <motion.div 
              className="fixed inset-0 bg-[#0B1628] flex items-center justify-center z-50"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                 className="relative px-12 py-8 rounded-[2rem] border border-white/5 flex items-center justify-center bg-white/[0.02] backdrop-blur-sm shadow-2xl"
                 initial={{ opacity: 0, scale: 0.8, y: 20 }}
                 animate={{ 
                   opacity: 1, 
                   scale: 1,
                   y: 0,
                   boxShadow: [
                      "0px 0px 20px rgba(201, 160, 48, 0.05)",
                      "0px 0px 40px rgba(201, 160, 48, 0.1)",
                      "0px 0px 20px rgba(201, 160, 48, 0.05)"
                   ]
                 }}
                 transition={{ 
                   duration: 2, 
                   ease: "easeOut"
                 }}
               >
                  <Logo className="h-20" isDarkBackground={true} />
              </motion.div>
            </motion.div>
          ) : (
            <motion.div 
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.5 } }}
              className="fixed inset-0 bg-[#162744] flex items-center justify-center p-4 z-50"
            >
              <motion.form 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                onSubmit={handlePasswordSubmit}
                className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-sm text-center flex flex-col items-center"
              >
                <div className="mb-8">
                  <Logo className="h-20" isDarkBackground={false} />
                </div>
                
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-6">
                  <Lock className="w-5 h-5 text-slate-400" />
                </div>

                <h2 className="text-xs font-black uppercase tracking-[0.3em] mb-2 text-slate-400">Verificação de Acesso</h2>
                {user?.email && (
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8 bg-slate-50 px-4 py-2 rounded-lg">
                    {user.email}
                  </div>
                )}
                <div className="relative w-full group">
                  <input 
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full p-4 pr-12 rounded-xl border ${error ? 'border-red-500' : 'border-slate-200'} text-center font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all`}
                    placeholder="DIGITE A SENHA..."
                    autoFocus
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-900 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="mt-4 w-full flex items-center justify-between">
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors flex items-center gap-1"
                  >
                    <HelpCircle className="w-3 h-3" />
                    Ajuda
                  </button>
                  {isIframe ? (
                    <a 
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] font-black uppercase tracking-widest text-[#162744] hover:text-[#0f1b32] transition-colors flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Abrir Fora
                    </a>
                  ) : (
                    <button 
                      type="button"
                      onClick={() => {
                         toast.info('Para instalar o app o adicione à Tela Inicial ou no menu "Instalar Aplicativo" do seu Chrome ou Safari.');
                      }}
                      className="text-[9px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-1"
                    >
                      Como Instalar?
                    </button>
                  )}
                </div>

                {showHint && (
                  <motion.p 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 text-[9px] font-bold text-slate-400 uppercase leading-relaxed text-center px-4"
                  >
                    Caso tenha esquecido sua senha de acesso rápido, entre em contato com o suporte ou utilize sua conta Google para redefinir.
                  </motion.p>
                )}

                {biometricsEnabled && (
                  <button 
                    type="button"
                    onClick={handleBiometricAuth}
                    disabled={isAuthenticatingBiometrics}
                    style={{ borderRadius: 12 }}
                    className="w-full mt-6 bg-emerald-50 text-emerald-600 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-emerald-100/80 transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-emerald-100 cursor-pointer shadow-sm"
                  >
                    <Fingerprint className="w-4.5 h-4.5 text-emerald-600 animate-[pulse_2s_infinite]" />
                    {isAuthenticatingBiometrics ? "Aguardando Leitor..." : "🔐 Entrar com Biometria"}
                  </button>
                )}

                <button 
                  type="submit"
                  className={`w-full ${biometricsEnabled ? 'mt-3' : 'mt-6'} bg-[#162744] text-white py-4 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-[#0f1b32] transition-all active:scale-[0.98] shadow-xl shadow-slate-200`}
                >
                  Confirmar Acesso
                </button>
              </motion.form>
            </motion.div>
          )
        ) : (
          <motion.div 
            className="fixed inset-0 bg-white z-50"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            onAnimationComplete={() => setIsAuthenticated(true)}
          />
        )}
      </AnimatePresence>
    );
  }

  if (showMainSplash) {
    return <SplashScreen />;
  }

  return <>{children}</>;
}
