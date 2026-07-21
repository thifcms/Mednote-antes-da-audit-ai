import { useState, useEffect, useRef } from 'react';

// Cache em módulo — a tabela só é baixada uma vez por sessão do app,
// nunca é incluída no bundle JS principal (fica em public/tuss_codigos.json,
// carregada sob demanda só quando a tela de cirurgia é aberta).
let cachedTable: Record<string, string> | null = null;
let loadingPromise: Promise<Record<string, string>> | null = null;

function loadTussTable(): Promise<Record<string, string>> {
  if (cachedTable) return Promise.resolve(cachedTable);
  if (loadingPromise) return loadingPromise;

  const base = import.meta.env.BASE_URL || '/';
  loadingPromise = fetch(`${base}tuss_codigos.json`)
    .then(res => {
      if (!res.ok) throw new Error('Falha ao carregar tabela TUSS');
      return res.json();
    })
    .then((data: Record<string, string>) => {
      cachedTable = data;
      return data;
    })
    .catch(err => {
      console.error('Erro ao carregar tabela TUSS:', err);
      loadingPromise = null;
      return {};
    });

  return loadingPromise;
}

/**
 * Hook para consultar a tabela TUSS (código -> nome do procedimento).
 * Carrega a tabela sob demanda na primeira vez que é usado.
 */
export function useTussLookup() {
  const [table, setTable] = useState<Record<string, string> | null>(cachedTable);
  const [isLoading, setIsLoading] = useState(!cachedTable);

  useEffect(() => {
    if (cachedTable) {
      setTable(cachedTable);
      setIsLoading(false);
      return;
    }
    let mounted = true;
    setIsLoading(true);
    loadTussTable().then(data => {
      if (mounted) {
        setTable(data);
        setIsLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const lookup = (code: string): string | null => {
    if (!table) return null;
    return table[code.trim()] || null;
  };

  return { lookup, isLoading, isReady: !!table };
}
