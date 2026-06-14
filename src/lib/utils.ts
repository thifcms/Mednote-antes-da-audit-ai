import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as dfFormat, parseISO, isValid } from 'date-fns';
import * as XLSX from 'xlsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFormat(dateStr: string | undefined | null, formatStr: string, fallback = '---'): string {
  if (!dateStr) return fallback;
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return fallback;
    return dfFormat(d, formatStr);
  } catch (e) {
    return fallback;
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function normalizeName(s: string): string {
  if (!s) return '';
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/\\-]/g, " ") // Replace separators with spaces
    .replace(/\b(sa|s a|ltda|limitada|servicos|medicos|hospitalares|eireli|me)\b/g, "") // Remove common business suffixes
    .replace(/\s+/g, " ") // Collapse spaces
    .trim();
}

/**
 * Finds the header row in an Excel sheet (array of arrays).
 * Useful when the spreadsheet has extra info/garbage in the first rows.
 */
export function findExcelHeaderRow(rows: any[][], keywords: string[]): { headerIndex: number, headerRow: string[] } {
  let bestMatch = { index: 0, count: 0, row: rows[0] || [] };
  
  // Look into the first 50 rows for the best candidate
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    
    console.log(`Analyzing row ${i}:`, row);
    
    const rowStr = row.map(c => String(c || '').toLowerCase().trim());
    
    let matchCount = 0;
    keywords.forEach(k => {
      if (rowStr.some(cell => cell.includes(k.toLowerCase()))) {
        matchCount++;
      }
    });

    if (matchCount > bestMatch.count) {
      bestMatch = { 
        index: i, 
        count: matchCount, 
        row: row.map(c => String(c || '').trim()) 
      };
    }

    // Short circuit if we find an excellent match (at least 80% of keywords)
    if (matchCount >= keywords.length * 0.8) {
      break;
    }
  }

  // If we found a row with at least 1 match, use it. 
  // Otherwise, fallback to row 0 but it's likely a headerless sheet.
  return { 
    headerIndex: bestMatch.count > 0 ? bestMatch.index : 0, 
    headerRow: (bestMatch.count > 0 ? bestMatch.row : (rows[0] || [])).map(c => String(c || '').trim())
  };
}

export function resizeImage(base64: string, maxWidth: number = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // Use superior image interpolation
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
      }
      resolve(canvas.toDataURL('image/jpeg', 0.6)); // Lower quality (0.6) to keep size around 100-150KB
    };
  });
}

export interface SmartCompressionResult {
  base64: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  savingsPercent: number;
  qualityUsed: number;
  widthUsed: number;
  networkType: string;
}

export function compressImageSmartly(
  base64: string,
  maxWidthOverride?: number
): Promise<SmartCompressionResult> {
  return new Promise((resolve) => {
    // Estimativa de tamanho original
    const head = base64.includes(',') ? base64.split(',')[1] : base64;
    const originalSizeKB = Math.round((head.length * 0.75) / 1024);

    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const effectiveType = conn?.effectiveType || '4g';
    const saveData = conn?.saveData || false;

    // Ajuste dinâmico baseado na rede
    let maxWidth = maxWidthOverride || 800;
    let quality = 0.6;

    if (saveData || ['2g', 'slow-2g', '3g'].includes(effectiveType)) {
      maxWidth = Math.min(maxWidth, 600);
      quality = 0.45; // Mais agressivo sob conexão de celular lenta
    } else {
      maxWidth = Math.min(maxWidth, 1024);
      quality = 0.65;
    }

    const img = new Image();
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
      }

      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      const outHead = compressedBase64.split(',')[1];
      const compressedSizeKB = Math.round((outHead.length * 0.75) / 1024);
      const savingsPercent = originalSizeKB > 0 ? Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100) : 0;

      resolve({
        base64: compressedBase64,
        originalSizeKB,
        compressedSizeKB,
        savingsPercent,
        qualityUsed: quality,
        widthUsed: width,
        networkType: effectiveType + (saveData ? ' (Economy)' : '')
      });
    };
  });
}

export function parseFinancialAmount(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  }
  let s = String(val).trim();
  if (!s || s === '0' || s === '-' || s === '---') return 0;

  // Remover cifras monetárias e espaçamentos
  s = s.replace(/(R\$|BRL|kr|£|\$)/gi, '').replace(/\s/g, '');

  if (s.includes(',') && s.includes('.')) {
    if (s.indexOf(',') > s.indexOf('.')) {
      // Formato brasileiro: 1.234,56 -> remover pontos e substituir vírgula por ponto
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato americano: 1,234.56 -> remover vírgulas
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Apenas vírgula: "1234,56" -> trocar por ponto
    s = s.replace(',', '.');
  }

  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

export function parseFlexibleDate(val: any, lastYear?: number): string {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return val.toISOString().split('T')[0];
  }

  if (typeof val === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(val);
      if (!d) return '';
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    } catch (e) {
      return '';
    }
  }

  let s = String(val).trim().toLowerCase();
  if (!s || s === '-' || s === '---') return '';

  // Data ISO: YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Data DD/MM/YYYY ou DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) {
      year = `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Data com escrita em português, Ex: "04-ago-24" ou "12/marco" ou "25 de Outubro de 2026"
  const monthsMap: Record<string, string> = {
    'jan': '01', 'janeiro': '01',
    'fev': '02', 'fevereiro': '02',
    'mar': '03', 'março': '03', 'marco': '03',
    'abr': '04', 'abril': '04',
    'mai': '05', 'maio': '05',
    'jun': '06', 'junho': '06',
    'jul': '07', 'julho': '07',
    'ago': '08', 'agosto': '08',
    'set': '09', 'setembro': '09',
    'out': '10', 'outubro': '10',
    'nov': '11', 'novembro': '11',
    'dez': '12', 'dezembro': '12'
  };

  // Tratar formatos verbosos como "25 de Outubro de 2026"
  if (s.includes(' de ')) {
    s = s.replace(/\s+de\s+/g, '-');
  }

  const parts = s.split(/[-/\s]+/);
  if (parts.length >= 2) {
    const dayVal = parseInt(parts[0]);
    if (!isNaN(dayVal) && dayVal >= 1 && dayVal <= 31) {
      const day = String(dayVal).padStart(2, '0');
      const monthPart = parts[1];
      let month = '';

      for (const [mName, mCode] of Object.entries(monthsMap)) {
        if (monthPart.startsWith(mName)) {
          month = mCode;
          break;
        }
      }

      if (month) {
        let year = String(lastYear || new Date().getFullYear());
        if (parts[2]) {
          const yVal = parseInt(parts[2]);
          if (!isNaN(yVal)) {
            year = String(yVal);
            if (year.length === 2) year = `20${year}`;
          }
        }
        return `${year}-${month}-${day}`;
      }
    }
  }

  return '';
}

export function calculateSimilarity(s1: string, s2: string): number {
  const norm1 = normalizeName(s1);
  const norm2 = normalizeName(s2);
  if (norm1 === norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;

  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };

  const b1 = getBigrams(norm1);
  const b2 = getBigrams(norm2);
  let intersection = 0;
  b1.forEach(bg => {
    if (b2.has(bg)) intersection++;
  });

  const total = b1.size + b2.size;
  if (total === 0) return 0;
  return (2.0 * intersection) / total;
}

export function areNamesFuzzyEqual(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const sim = calculateSimilarity(name1, name2);
  if (sim >= 0.72) return true;

  // Se um nome estiver contido nas palavras maiores do outro
  const words1 = normalizeName(name1).split(' ').filter(w => w.length > 2);
  const words2 = normalizeName(name2).split(' ').filter(w => w.length > 2);
  if (words1.length > 0 && words2.length > 0) {
    const commonWords = words1.filter(w => words2.includes(w));
    if (commonWords.length >= Math.min(words1.length, words2.length, 2)) return true;
  }
  return false;
}
