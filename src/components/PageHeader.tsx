import React from 'react';
import { ChevronRight } from 'lucide-react';

interface Breadcrumb {
  label: React.ReactNode;
  href?: string;
}

interface PageHeaderProps {
  breadcrumbs: Breadcrumb[];
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ breadcrumbs, children }) => {
  return (
    <header className="h-auto md:h-16 bg-white border-b border-zinc-200 px-4 md:px-8 py-3 md:py-0 flex flex-col md:flex-row items-center justify-between shrink-0 sticky top-0 z-20 gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-2 w-full md:w-auto">
        {breadcrumbs.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <ChevronRight className="w-3 h-3 text-zinc-300 shrink-0" />
            )}
            <span 
              className={`text-[10px] md:text-xs font-black uppercase tracking-[0.2em] truncate ${
                index === breadcrumbs.length - 1 ? 'text-zinc-900' : 'text-zinc-400'
              }`}
            >
              {item.label}
            </span>
          </React.Fragment>
        ))}
      </div>
      
      <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-end">
        {children}
      </div>
    </header>
  );
};
