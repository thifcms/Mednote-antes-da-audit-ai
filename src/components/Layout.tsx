import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { 
  FileText, 
  Activity, 
  Settings, 
  LayoutDashboard,
  Menu,
  X,
  Banknote,
  CreditCard,
  User,
  LogOut,
  ChevronRight,
  History,
  CalendarCheck,
  Cloud,
  CloudOff,
  CloudDownload,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useApp } from '../store/AppContext';

// Ordem de navegação para a troca rápida de telas via gesture swipe
const routesOrder = [
  '/',
  '/notas',
  '/recebimentos',
  '/cadastros',
  '/eletivas',
  '/pendencias-cirurgicas',
  '/cirurgias',
  '/conciliacao',
  '/preferencias'
];

// Helper para verificar se o gesto começou ou passou por elementos restritos
const isInsideRestrictedElement = (el: HTMLElement | null): boolean => {
  if (!el) return false;
  
  // 1. Evitar tabelas de dados, cabeçalhos de tabelas, linhas ou células
  if (el.closest('table') || el.closest('thead') || el.closest('tbody') || el.closest('tr') || el.closest('td') || el.closest('th')) {
    return true;
  }
  
  // 2. Evitar elementos com rolagem horizontal ativa (gráficos Recharts, listagens, etc)
  if (el.closest('.overflow-x-auto') || el.closest('.chart-container') || el.closest('.no-swipe') || el.closest('canvas')) {
    return true;
  }

  // 3. Evitar elementos de formulário, botões ou links que já possuam ações dedicadas
  if (el.closest('input') || el.closest('textarea') || el.closest('button') || el.closest('select') || el.closest('a')) {
    return true;
  }

  // 4. Evitar gestos iniciados na barra lateral (aside)
  if (el.closest('aside')) {
    return true;
  }

  // 5. Evitador de caixas de diálogo abertas (Modals/Dialogs)
  if (el.closest('[role="dialog"]') || el.closest('.dialog') || el.closest('.modal')) {
    return true;
  }

  // 6. Verificar se algum contêiner pai intermediário possua scroll horizontal real
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
      if (current.scrollWidth > current.clientWidth) {
        return true;
      }
    }
    current = current.parentElement;
  }

  return false;
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, isOffline, isSyncing } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  // Efeito para registrar os detectores de gesto de deslizar (swipe)
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startEl: HTMLElement | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return; // Apenas gestos de toque único
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startEl = touch.target as HTMLElement;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!startX || !startY || !startEl) return;
      if (e.changedTouches.length !== 1) return;

      const touch = e.changedTouches[0];
      const diffX = touch.clientX - startX;
      const diffY = touch.clientY - startY;

      // Armazenamos variáveis locais e limpamos imediatamente o estado dos toques
      const currentStartX = startX;
      const currentStartEl = startEl;
      startX = 0;
      startY = 0;
      startEl = null;

      // Limites mínimos para considerar um deslizar intencional
      const minDistanceX = 110; // movimento horizontal mais amplo e intencional
      const maxDeltaY = 40;     // ignora totalmente se o usuário mexer o dedo significativamente na vertical
      const minRatio = 2.5;     // a proporção horizontal deve ser pelo menos 2.5x maior que a vertical

      if (Math.abs(diffX) < minDistanceX) return;
      if (Math.abs(diffY) > maxDeltaY) return;
      if (Math.abs(diffY) > 0 && Math.abs(diffX) / Math.abs(diffY) < minRatio) return;

      // Se o usuário tocou dentro de uma tabela ou elemento proibido, cancela
      if (isInsideRestrictedElement(currentStartEl)) {
        return;
      }

      const isSwipeLeft = diffX < 0;   // Arrastou o dedo para esquerda => Avança de tela
      const isSwipeRight = diffX > 0;  // Arrastou o dedo para direita => Volta de tela

      const currentPath = location.pathname;
      const currentIndex = routesOrder.indexOf(currentPath);

      if (currentIndex === -1) return; // Rota não mapeada na sequência padrão

      if (isSwipeLeft) {
        if (currentIndex < routesOrder.length - 1) {
          const nextPath = routesOrder[currentIndex + 1];
          navigate(nextPath);
        }
      } else if (isSwipeRight) {
        if (currentIndex > 0) {
          const prevPath = routesOrder[currentIndex - 1];
          navigate(prevPath);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [location.pathname, navigate]);

  const navItems = [
    { name: 'Início', href: '/', icon: LayoutDashboard, category: 'Principal' },
    { name: 'Notas Fiscais', href: '/notas', icon: FileText, category: 'Gestão' },
    { name: 'Recebimentos', href: '/recebimentos', icon: Banknote, category: 'Gestão' },
    { name: 'Pagadores', href: '/cadastros', icon: CreditCard, category: 'Gestão' },
    { name: 'Eletivas Solicitadas', href: '/eletivas', icon: CalendarCheck, category: 'Procedimentos' },
    { name: 'Pendências Cirúrgicas', href: '/pendencias-cirurgicas', icon: AlertTriangle, category: 'Procedimentos' },
    { name: 'Cirurgias Realizadas', href: '/cirurgias', icon: Activity, category: 'Procedimentos' },
    { name: 'Conciliação Cirúrgica', href: '/conciliacao', icon: History, category: 'Procedimentos' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row font-sans text-zinc-900 selection:bg-zinc-900 selection:text-white">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between sticky top-0 z-50 px-6" style={{ height: "64px", background: "#162744", boxShadow: "0 2px 16px rgba(15,32,68,.18)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <Logo className="h-10" isDarkBackground={true} />
        <button 
          onClick={() => setSidebarOpen(true)} 
          className="p-2 text-white transition-colors hover:bg-[rgba(255,255,255,0.14)]"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10
          }}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Sidebar background overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[60] transition-all duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 bg-white border-r border-zinc-200 w-72 flex flex-col z-[70] transition-all duration-500 ease-in-out shadow-2xl md:shadow-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="flex items-center justify-between bg-[#162744]" style={{ padding: "20px 22px 22px", borderBottom: "1px solid #0f1b32" }}>
           <Logo className="h-16 w-auto" isDarkBackground={true} />
           <button 
             onClick={() => setSidebarOpen(false)} 
             className="md:hidden p-2 text-white transition-colors hover:bg-[rgba(255,255,255,0.14)]"
             style={{
               background: "rgba(255,255,255,0.07)",
               border: "1px solid rgba(255,255,255,0.1)",
               borderRadius: 10
             }}
           >
             <X className="h-5 w-5" />
           </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-8 overflow-y-auto font-sans">
          {['Principal', 'Gestões', 'Cirurgias'].map(category => (
            <div key={category} className="space-y-1">
              <div 
                className="px-4 mb-3 uppercase"
                style={{ fontSize: 10, fontWeight: 700, color: "#8592A6", letterSpacing: "0.08em" }}
              >
                {category}
              </div>
              <div className="space-y-1">
                {navItems.filter(item => {
                  if (category === 'Principal') return item.category === 'Principal';
                  if (category === 'Gestões') return item.category === 'Gestão';
                  if (category === 'Cirurgias') return item.category === 'Procedimentos';
                  return false;
                }).map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "group flex items-center justify-between px-4 py-3 rounded-[10px] transition-all duration-200",
                        !isActive && "hover:bg-[#F5F6FB] hover:text-[#162744]"
                      )}
                      style={isActive ? {
                        background: "rgba(184,150,46,0.12)",
                        color: "#B8962E",
                        fontSize: 12,
                        fontWeight: 700,
                        boxShadow: "none"
                      } : {
                        background: "transparent",
                        color: "#3D4A63",
                        fontSize: 12,
                        fontWeight: 500
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-3.5 w-3.5" style={{ color: isActive ? "#B8962E" : "#8592A6" }} />
                        {item.name}
                      </div>
                      {isActive && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#B8962E" }} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 mt-auto">
          <div 
            className="p-4 space-y-4"
            style={{
              background: "#F5F6FB",
              border: "1px solid #EAECF4",
              borderRadius: 14,
              boxShadow: "none"
            }}
          >
            <div className="flex items-center gap-3">
               <div 
                 className="w-10 h-10 flex items-center justify-center overflow-hidden shrink-0"
                 style={{
                   borderRadius: 10,
                   backgroundColor: '#DC2626',
                   color: '#FFFFFF',
                   fontSize: 14,
                   fontWeight: 800
                 }}
               >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" style={{ borderRadius: 10 }} />
                  ) : (
                    <span>{(user?.displayName || user?.email || 'U')[0].toUpperCase()}</span>
                  )}
               </div>
               <div className="flex-1 min-w-0">
                  <div className="truncate text-zinc-900" style={{ fontSize: 13, fontWeight: 700 }}>{user?.displayName || 'Usuário MedNotes'}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1 shrink-0">
                       {isOffline ? (
                         <CloudOff className="w-2.5 h-2.5" style={{ color: "#8592A6" }} />
                       ) : isSyncing ? (
                         <CloudDownload className="w-2.5 h-2.5 animate-pulse" style={{ color: "#0EA472" }} />
                       ) : (
                         <Cloud className="w-2.5 h-2.5" style={{ color: "#0EA472" }} />
                       )}
                       <span style={{ fontSize: 9, fontWeight: 700, color: isOffline ? "#8592A6" : "#0EA472" }}>
                         {isOffline ? 'Offline' : isSyncing ? 'Sincronizando' : 'Nuvem Ativa'}
                       </span>
                    </div>
                    {!isOffline && (
                      <>
                        <div className="w-1 h-1 rounded-full bg-zinc-300" />
                        <div className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter truncate max-w-[80px]" title={user?.email || ''}>{user?.email}</div>
                      </>
                    )}
                  </div>
               </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/preferencias"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-center gap-2 px-3 py-2 transition-all transition-colors"
                style={{
                  background: location.pathname === '/preferencias' ? "rgba(184,150,46,0.12)" : "#F5F6FB",
                  border: "1px solid #EAECF4",
                  borderRadius: 8,
                  color: location.pathname === '/preferencias' ? "#B8962E" : "#3D4A63"
                }}
              >
                <Settings className="w-3.5 h-3.5" style={{ color: location.pathname === '/preferencias' ? "#B8962E" : "#8592A6" }} />
              </Link>
              <button
                onClick={logout}
                className="flex items-center justify-center gap-2 px-3 py-2 cursor-pointer transition-all transition-colors"
                style={{
                  background: "#F5F6FB",
                  border: "1px solid #EAECF4",
                  borderRadius: 8,
                  color: "#3D4A63"
                }}
              >
                <LogOut className="w-3.5 h-3.5" style={{ color: "#8592A6" }} />
              </button>
            </div>
          </div>
        </div>

      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden h-screen bg-zinc-50">
        <div className="flex-1 overflow-y-auto w-full relative">
           {/* Subtle background grain or pattern could go here */}
           <div className="min-h-full flex flex-col">
              {children}
           </div>
        </div>
      </main>
    </div>
  );
}
