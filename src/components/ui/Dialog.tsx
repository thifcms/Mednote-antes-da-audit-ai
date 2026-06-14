import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  size?: 'md' | 'lg' | 'xl';
}

export function Dialog({ isOpen, onClose, title, children, className, size = 'md' }: DialogProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 transition-opacity" 
        style={{ background: "rgba(15,32,68,.45)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      />
      <div 
        style={{ borderRadius: 20, boxShadow: "0 24px 64px rgba(15,32,68,.18)" }}
        className={cn(
          "bg-white w-full flex flex-col relative z-10 max-h-[90vh]",
          sizeClasses[size],
          className
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100" style={{ position: "sticky", top: 0, background: "#FFFFFF", borderRadius: "20px 20px 0 0", zIndex: 10 }}>
          <h2 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">{title}</h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
