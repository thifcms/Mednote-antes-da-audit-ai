import Tesseract from 'tesseract.js';
import { toast } from 'sonner';

// Fallback usando Tesseract.js para OCR local básico
async function processWithTesseract(file: File) {
  try {
    const { data: { text } } = await Tesseract.recognize(file, 'por+eng');
    
    // Tesseract retorna apenas texto, então precisamos de um "prompt" básico 
    // ou transformar isso em um objeto compatível. 
    // Como a DocEngine e Gemini retornam objetos estruturados, 
    // aqui fazemos um mapeamento simples tentando extrair via regex do texto bruto.
    
    return {
      rawText: text,
      isTesseractFallback: true
    };
  } catch (error) {
    console.error('Tesseract fallback failed:', error);
    throw new Error('Não foi possível realizar a leitura automática. Tente preencher manualmente.');
  }
}

export function parseTextWithHeuristics(rawText: string, isSurgery: boolean) {
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
  
  if (isSurgery) {
    let patientName = '';
    let date = '';
    let insurance = '';
    let attendance = '';
    let procedure = '';
    let hospital = '';
    
    // 1. Procurar Atendimento (Atend)
    for (const line of lines) {
      const match = line.match(/Atend(?:imento|\.)?\s*:\s*(\d+)/i);
      if (match) {
        attendance = match[1];
        break;
      }
    }
    // Caso alternativo para Atendimento se vier colado "Atend:55059115" ou solto
    if (!attendance) {
      for (const line of lines) {
        const match = line.match(/(?:atend|reg|atendimento)\D*(\d{6,10})/i);
        if (match) {
          attendance = match[1];
          break;
        }
      }
    }

    // 2. Procurar Convênio (Convenio)
    for (const line of lines) {
      const match = line.match(/Convenio\s*:\s*([^:\n]+)/i);
      if (match) {
        let val = match[1].split('Plano:')[0].trim();
        // Remove traços ou números iniciais comuns ex: "33 - BRADESCO SEGUR" -> "BRADESCO SEGUR"
        val = val.replace(/^\d+\s*-\s*/, '').trim();
        insurance = val;
        break;
      }
    }
    if (!insurance) {
      // Procura marcas famosas de convênio no texto completo
      const lower = rawText.toLowerCase();
      if (lower.includes('bradesco')) insurance = 'BRADESCO SEGUR';
      else if (lower.includes('unimed')) insurance = 'UNIMED';
      else if (lower.includes('sulamerica') || lower.includes('sul america')) insurance = 'SULAMÉRICA';
      else if (lower.includes('amil')) insurance = 'AMIL';
      else if (lower.includes('cassi')) insurance = 'CASSI';
      else if (lower.includes('porto seguro')) insurance = 'PORTO SEGURO';
      else if (lower.includes('allianz')) insurance = 'ALLIANZ';
      else if (lower.includes('sompo')) insurance = 'SOMPO';
    }

    // 3. Procurar Data de Entrada / Atendimento (Dt.Entr: 05/06/2026)
    const allDatesWithContext: { date: string, isNasc: boolean }[] = [];
    for (const line of lines) {
      const dateMatches = line.match(/(\d{2})[/-](\d{2})[/-](\d{4})/g);
      if (dateMatches) {
        const isNasc = /nasc|dtnasc|nascimento/i.test(line);
        for (const dm of dateMatches) {
          allDatesWithContext.push({ date: dm, isNasc });
        }
      }
    }
    const entryDateObj = allDatesWithContext.find(d => !d.isNasc);
    if (entryDateObj) {
      date = convertDateToISO(entryDateObj.date);
    } else if (allDatesWithContext.length > 0) {
      if (!allDatesWithContext[0].isNasc) {
        date = convertDateToISO(allDatesWithContext[0].date);
      }
    }

    // 4. Procurar Nome do Paciente (Gianlucca Salvini Barbosa)
    for (const line of lines) {
      const leitoMatch = line.match(/Leito\s*:\s*\d+\s*(?:\/|-)?\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{4,})/i);
      if (leitoMatch && leitoMatch[1]) {
        patientName = leitoMatch[1].trim();
        break;
      }
    }
    if (!patientName) {
      // Procura linha que pareça um de pessoa física em português (sem números, sem colons, tamanho > 10)
      for (const line of lines) {
        const hasNumbers = /\d/.test(line);
        const hasColon = /:/.test(line);
        const words = line.split(/\s+/);
        const capitalizedWords = words.filter(w => w.length > 0 && w[0] === w[0].toUpperCase() && /^[A-ZÁÉÍÓÚÂÊÔÇ]/.test(w));
        
        if (!hasNumbers && !hasColon && words.length >= 2 && capitalizedWords.length >= 2 && line.length > 10) {
          if (!/Convenio|Bradesco|Unimed|Sulamerica|Amil|Cassi|Guia|Senha|Atend|Prontuario/i.test(line)) {
            patientName = line.trim();
            break;
          }
        }
      }
    }

    // 5. Procurar Procedimento (ex: "Rlca joelho d")
    for (const line of lines) {
      const low = line.toLowerCase();
      if (low.includes('rlca') || low.includes('lca') || low.includes('joelho') || low.includes('fracture') || low.includes('artros') || low.includes('menis') || low.includes('manguito') || low.includes('fratura')) {
        let proc = line;
        if (low.includes('rlca') || (low.includes('lca') && low.includes('joelho'))) {
          let lado = '';
          if (low.includes('joelho d') || low.includes(' direito') || low.endsWith(' d')) lado = 'Direito';
          else if (low.includes('joelho e') || low.includes(' esquerdo') || low.endsWith(' e')) lado = 'Esquerdo';
          proc = `Reconstrução de LCA (${lado ? 'Joelho ' + lado : 'Joelho não especificado'})`;
        } else if (low.includes('atsc') || low.includes('artroscopia')) {
          proc = 'Artroscopia de Joelho';
        }
        procedure = proc.trim();
        break;
      }
    }

    if (!procedure && lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (lastLine && lastLine.length < 30 && !lastLine.includes(':') && !lastLine.includes('/') && !/\d/.test(lastLine)) {
        procedure = lastLine;
      }
    }

    return {
      patientName,
      attendance,
      insurance,
      date,
      procedure,
      hospital,
      company: '',
      isLocalOCR: true
    };
  } else {
    // É Nota Fiscal (NFS-e)
    let emitente = '';
    let cnpjEmitente = '';
    let valorTotal = 0;
    let numeroNota = '';
    let dataEmissao = '';
    let description = '';

    const cnpjMatches = rawText.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g);
    if (cnpjMatches && cnpjMatches.length > 0) {
      cnpjEmitente = cnpjMatches[cnpjMatches.length - 1];
    }

    for (const line of lines) {
      const numMatch = line.match(/(?:número|numero|nº|n°|nota|nf)\D*(\d+)/i);
      if (numMatch && numMatch[1] && numMatch[1].length >= 3 && numMatch[1].length <= 8) {
        numeroNota = numMatch[1];
        break;
      }
    }

    for (const line of lines) {
      const dateMatch = line.match(/(?:emissão|emissao|data)\D*(\d{2}\/\d{2}\/\d{4})/i);
      if (dateMatch) {
        dataEmissao = convertDateToISO(dateMatch[1]);
        break;
      }
    }
    if (!dataEmissao) {
      const dateMatch = rawText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        dataEmissao = convertDateToISO(dateMatch[0]);
      }
    }

    for (const line of lines) {
      const moneyMatch = line.match(/(?:valor|total|serviço|liquido|líquido)\D*R?\$\s*([\d.,]+)/i);
      if (moneyMatch) {
        const cleaning = moneyMatch[1].replace(/\./g, '').replace(',', '.');
        const val = parseFloat(cleaning);
        if (val > 0 && val > valorTotal) {
          valorTotal = val;
        }
      }
    }

    if (valorTotal === 0) {
      const valMatches = rawText.match(/R?\$\s*([\d.]+,\d{2})/g);
      if (valMatches) {
        for (const vm of valMatches) {
          const clean = vm.replace(/[^\d,]/g, '').replace(',', '.');
          const val = parseFloat(clean);
          if (val > valorTotal) {
            valorTotal = val;
          }
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/tomador|razão|razao|nome/i.test(line) && !/prestador/i.test(line)) {
        const parts = line.split(/tomador|razão|razao|nome/i);
        if (parts[1] && parts[1].replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim().length > 5) {
          emitente = parts[1].replace(/^[^a-zA-ZÀ-ÿ]+/g, '').trim();
        } else if (i + 1 < lines.length) {
          emitente = lines[i+1].trim();
        }
        break;
      }
    }

    return {
      date: dataEmissao,
      originalPayerName: emitente || 'PACIENTE OU FONTE PAGADORA LOCAL',
      amount: valorTotal || 1500.00,
      netAmount: valorTotal || 1500.00,
      noteNumber: numeroNota || '0001',
      cnpj: cnpjEmitente || '00.000.000/0001-00',
      description: description || 'Serviços Médicos Cirúrgicos Ortopédicos',
      isLocalOCR: true
    };
  }
}

async function resizeImage(file: File, maxSide: number = 1200): Promise<{ base64: string, mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSide) {
          height *= maxSide / width;
          width = maxSide;
        }
      } else {
        if (height > maxSide) {
          width *= maxSide / height;
          height = maxSide;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      let preprocessApplied = false;
      const contrastFactorPercent = 20; // +20% contraste adicional (fator 1.20)

      try {
        if ('filter' in ctx) {
          // Desativado temporariamente para isolar bug de pre-processamento visual relatado pelo medico
          // ctx.filter = `grayscale(100%) contrast(${1 + (contrastFactorPercent / 100)})`;
          preprocessApplied = false;
        }
      } catch (filterErr) {
        console.warn('⚠️ Opcional: Filtro canvas de pré-processamento não suportado pelo navegador:', filterErr);
      }

      ctx.drawImage(img, 0, 0, width, height);

      if (preprocessApplied) {
        console.log(`🎨 Pré-processamento visual aplicado: contraste +${contrastFactorPercent}%, escala de cinza`);
      }
      
      // We use jpeg for medical labels/invoices as it's efficient for text-rich photos
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      resolve({
        base64: base64.split(',')[1],
        mimeType: 'image/jpeg'
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for resizing'));
    };
    
    img.src = objectUrl;
  });
}

function parseBrazilianCurrency(value: any): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  let str = String(value).trim();
  str = str.replace(/r\$\s*/gi, '');
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function convertDateToISO(dateStr: any): string {
  if (!dateStr) return '';
  if (typeof dateStr !== 'string') {
    if (dateStr instanceof Date) {
      try {
        return dateStr.toISOString().split('T')[0];
      } catch (e) {
        return '';
      }
    }
    dateStr = String(dateStr);
  }
  dateStr = dateStr.trim();
  
  // Se contiver palavras informativas ou valores como "não disponível"/"nulo", retorna string vazia
  if (/não|nulo|indisponivel|null|n\/a/i.test(dateStr)) return '';

  // Procura padrão AAAA-MM-DD em qualquer parte da string
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  // Procura padrão DD/MM/AAAA ou DD-MM-AAAA em qualquer parte da string
  const brMatch = dateStr.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (brMatch) {
    const day = brMatch[1];
    const month = brMatch[2];
    const year = brMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Procura padrão DD/MM/AA ou DD-MM-AA
  const brShortMatch = dateStr.match(/(\d{2})[/-](\d{2})[/-](\d{2})/);
  if (brShortMatch) {
    const day = brShortMatch[1];
    const month = brShortMatch[2];
    let year = brShortMatch[3];
    // assume século 21 para anos de 00-60, século 20 para o resto
    year = parseInt(year) < 60 ? `20${year}` : `19${year}`;
    return `${year}-${month}-${day}`;
  }

  // Mapeamento de meses por extenso em português para robustez
  const monthsPt: { [key: string]: string } = {
    janeiro: '01', jan: '01',
    fevereiro: '02', fev: '02',
    marco: '03', mar: '03', março: '03',
    abril: '04', abr: '04',
    maio: '05', mai: '05',
    junho: '06', jun: '06',
    julho: '07', jul: '07',
    agosto: '08', ago: '08',
    setembro: '09', set: '09',
    outubro: '10', out: '10',
    novembro: '11', nov: '11',
    dezembro: '12', dez: '12'
  };

  // Trata formato como "15 de junho de 2026" ou "15/jun/2026"
  const ptTextMatch = dateStr.toLowerCase().match(/(\d{1,2})\s+(?:de\s+)?([a-zçã]+)\s+(?:de\s+)?(\d{4})/);
  if (ptTextMatch) {
    const day = ptTextMatch[1].padStart(2, '0');
    const monthWord = ptTextMatch[2];
    const year = ptTextMatch[3];
    const monthNum = monthsPt[monthWord];
    if (monthNum) {
      return `${year}-${monthNum}-${day}`;
    }
  }

  return dateStr;
}

function findField(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined;

  // 1. Procura no nível atual
  for (const key of keys) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      // Evita retornar containers JSON (como a própria chave "data", "analysis", etc) que são objetos normais.
      // Valores válidos de campos são apenas primitivos (string, number, boolean) ou objetos de data (Date).
      if (typeof obj[key] === 'object' && !(obj[key] instanceof Date) && !Array.isArray(obj[key])) {
        continue;
      }
      return obj[key];
    }
  }

  // 2. Se for array, procura nos itens
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const val = findField(item, keys);
      if (val !== undefined) return val;
    }
  }

  // 3. Procura recursivamente nas chaves do objeto (priorizando chaves comuns)
  const priorityKeys = ['data', 'analysis', 'etiquetas'];
  for (const pk of priorityKeys) {
    if (pk in obj) {
      const val = findField(obj[pk], keys);
      if (val !== undefined) return val;
    }
  }

  for (const k in obj) {
    if (!priorityKeys.includes(k) && typeof obj[k] === 'object') {
      const val = findField(obj[k], keys);
      if (val !== undefined) return val;
    }
  }

  return undefined;
}

function mapAuditAiResponse(responseData: any, isSurgery?: boolean) {
  if (!responseData) return null;
  const data = responseData?.data || responseData?.analysis || responseData;
  const hash = responseData?.image_hash || data?.image_hash || responseData?.data?.image_hash || '';

  // Nota Fiscal: se o chamador passou isSurgery determinísticamente, usamos ele.
  // Caso contrário, tenta inferir pela presença de campos típicos.
  const isInvoice = isSurgery !== undefined 
    ? !isSurgery 
    : (findField(responseData, ['numeroNota', 'valorTotal', 'emitente', 'cnpjEmitente']) !== undefined);

  if (isInvoice) {
    const emitente = findField(responseData, ['emitente', 'razaoSocial', 'prestador', 'nomeEmitente']) || '';
    const valorTotalRaw = findField(responseData, ['valorTotal', 'valorBruto', 'valor_total']) || '0';
    const valorTotal = parseBrazilianCurrency(valorTotalRaw);
    const dataEmissao = findField(responseData, ['dataEmissao', 'data_emissao', 'dataEmis', 'data', 'dtEmissao', 'dt_emissao', 'dataNota', 'data_nota', 'competencia']) || '';
    const valorLiquidoRaw = findField(responseData, ['valorLiquido', 'valor_liquido', 'valorLiq', 'liquido', 'netAmount', 'valor_liquido_servicos', 'vlLiquido']);
    const valorLiquido = parseBrazilianCurrency(valorLiquidoRaw);
    const netAmount = (valorLiquido && valorLiquido > 0) ? valorLiquido : valorTotal;
    const numeroNota = findField(responseData, ['numeroNota', 'numero_nota', 'numNota', 'nota']) || '';
    const cnpjEmitente = findField(responseData, ['cnpjEmitente', 'cnpj_emitente', 'cnpj']) || '';
    
    let itensDesc = '';
    const itens = findField(responseData, ['itens', 'servicos', 'items']);
    if (Array.isArray(itens)) {
      itensDesc = itens.map((i: any) => i?.descricao || i?.nome || '').filter(Boolean).join(', ');
    } else {
      itensDesc = findField(responseData, ['descricao', 'servico', 'description']) || '';
    }

    return {
      date: convertDateToISO(dataEmissao),
      originalPayerName: emitente,
      amount: valorTotal,
      netAmount: netAmount,
      noteNumber: String(numeroNota),
      cnpj: String(cnpjEmitente),
      description: itensDesc,
      aiSourceHash: hash,
    };
  }

  // Se não for nota fiscal, assume que é Etiqueta Hospitalar / Cirurgia
  const patientName = findField(responseData, ['patientName', 'nome_paciente', 'paciente', 'nome', 'nomeCompleto', 'nome_completo']) || '';
  const attendance = findField(responseData, ['attendance', 'numero_atendimento', 'atendimento', 'registro', 'num_atendimento']) || '';
  const insurance = findField(responseData, ['insurance', 'convenio', 'plano', 'convenio_plano', 'seguradora']) || '';
  const dateValue = findField(responseData, ['date', 'data_atendimento', 'data_cirurgia', 'data']) || '';
  const procedure = findField(responseData, ['procedure', 'procedimento', 'cirurgia', 'descricao_procedimento']) || '';
  const hospital = findField(responseData, ['hospital', 'hospital_name', 'nome_hospital', 'estabelecimento', 'local']) || '';
  const company = findField(responseData, ['company', 'empresa', 'fornecedor', 'opme', 'fornecedor_opme']) || '';

  return {
    patientName,
    attendance,
    insurance,
    date: convertDateToISO(dateValue),
    procedure,
    hospital,
    company,
    aiSourceHash: hash,
  };
}

export async function processImage(file: File, prompt: string, schema?: any): Promise<any> {
  let toastId: string | number | undefined;
  try {
    return await processImageAttempt(file, prompt, schema);
  } catch (error: any) {
    console.warn("⚠️ [DIAGNÓSTICO MEDNOTE] Primeira tentativa de extração falhou. Iniciando retry automático silencioso...", error);
    
    // Mostra um toast de feedback discreto para o usuário
    toastId = toast.loading("Tentando novamente...", {
      description: "A primeira tentativa falhou. Uma nova tentativa de extração está em andamento...",
      duration: 15000
    });

    try {
      // Pequeno delay (1 segundo) para garantir estabilidade antes de tentar de novo
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const result = await processImageAttempt(file, prompt, schema);
      
      if (toastId) toast.dismiss(toastId);
      toast.success("Extração concluída com sucesso na segunda tentativa!");
      return result;
    } catch (retryError) {
      if (toastId) toast.dismiss(toastId);
      throw retryError;
    }
  }
}

async function processImageAttempt(file: File, prompt: string, schema?: any) {
  let base64Data: string;
  let mimeType: string;

  const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';

  if (file.type === 'application/pdf' || isHeic) {
    if (file.type === 'application/pdf' && file.size > 5 * 1024 * 1024) {
      throw new Error("O PDF é muito grande (máx. 5MB) ou você atingiu o limite de uso. Tire um Print (foto) da nota e envie como imagem para gastar menos leitura da IA, ou aguarde 1 minuto.");
    }
    if (isHeic && file.size > 3 * 1024 * 1024) {
      throw new Error("O arquivo de imagem HEIC é muito grande (maior que 3MB). Para evitar lentidão e garantir o processamento rápido, por favor envie uma foto menor ou tire a foto diretamente em formato JPEG/PNG nas configurações da câmera do seu aparelho.");
    }

    // For PDFs and HEIC, we send directly without resizing (canvas doesn't support HEIC rendering, but AI supports natively)
    mimeType = isHeic ? (file.type || 'image/heic') : 'application/pdf';
    base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } else {
    // For normal images, resize and compress before sending
    const resized = await resizeImage(file);
    base64Data = resized.base64;
    mimeType = resized.mimeType;
  }

  let responseData: any = null;
  let responseOk = false;
  let httpStatusCode: number | string = 'N/A';
  let httpStatusMsg: string = 'N/A';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.warn("⚠️ Chamada para Audit AI foi cancelada por estourar o limite de tempo inteligente de 40 segundos.");
  }, 40000);

  const startTimeNetwork = performance.now();

  const metrics: any = {
    timestamp: new Date().toLocaleTimeString('pt-BR'),
    filename: file.name,
    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
    networkDurationSec: '0.00',
    httpStatus: 'N/A',
    httpStatusText: 'N/A',
    networkError: '',
    rawResponseTruncated: '',
    fallbackTriggered: false,
    fallbackReason: '',
    tesseractDurationSec: '',
    tesseractTextLength: 0,
    tesseractTextSample: '',
    tesseractHeuristics: '',
    usedModel: 'N/A',
  };

  // Inicializa global
  (window as any).__lastExtractionMetrics = metrics;

  // 1. TENTA PRIMEIRO O SERVIDOR DE PRODUÇÃO DA AUDIT AI (IA SÍNCRONA)
  const isSurgery = schema?.properties?.patientName !== undefined;
  try {
    const startTimestamp = new Date().toISOString();
    console.log(`[DIAGNÓSTICO ETAPA 1] [${startTimestamp}] Iniciando fetch para a API síncrona da Audit AI (https://audit-ai-6wed.onrender.com/public/extract)...`);
    
    const productionResponse = await fetch('https://audit-ai-6wed.onrender.com/public/extract', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': (import.meta as any).env.VITE_AUDIT_AI_KEY || 'auditai_key_2026_medico'
      },
      signal: controller.signal,
      body: JSON.stringify({
        fileBase64: base64Data,
        filename: file.name || 'documento.jpg',
        mimeType,
        prompt,
        schema,
      })
    });

    clearTimeout(timeoutId);
    const endTimeNetwork = performance.now();
    const networkDuration = ((endTimeNetwork - startTimeNetwork) / 1000).toFixed(2);
    const endTimestamp = new Date().toISOString();
    console.log(`[DIAGNÓSTICO ETAPA 1] [${endTimestamp}] Resposta HTTP recebida da Audit AI. Duração total: ${networkDuration}s. Status: ${productionResponse.status} (${productionResponse.statusText})`);

    httpStatusCode = productionResponse.status;
    httpStatusMsg = productionResponse.statusText;
    metrics.httpStatus = httpStatusCode;
    metrics.httpStatusText = httpStatusMsg;
    metrics.networkDurationSec = networkDuration;

    if (productionResponse.ok) {
      const prodData = await productionResponse.json();
      metrics.rawResponseTruncated = JSON.stringify(prodData).substring(0, 1000);
      metrics.usedModel = prodData?.usedModel || 'N/A';
      console.log('AUDIT AI RAW RESPONSE FROM SYNCHRONOUS API:', JSON.stringify(prodData));
      
      const hasLlamaBypassed = prodData?.usedModel === 'llama-3.3-70b-versatile' || prodData?.usedProvider === 'groq';
      const actualProdData = prodData?.data || prodData;
      const isProdContentEmpty = !actualProdData?.nome_paciente && !actualProdData?.patientName && !actualProdData?.emitente;

      if (hasLlamaBypassed && isProdContentEmpty) {
        console.warn("⚠️ API de Produção caiu em fallback Llama-Texto e retornou vazio. Ativando OCR local...");
        metrics.fallbackTriggered = true;
        metrics.fallbackReason = "O Llama Bypassed retornou um JSON vazio sem nome_paciente/patientName.";
      } else {
        responseData = prodData;
        responseOk = true;
      }
    } else {
      console.warn(`⚠️ API de Produção síncrona falhou com status ${productionResponse.status}.`);
      metrics.fallbackTriggered = true;
      metrics.fallbackReason = `HTTP não-OK: ${productionResponse.status} ${productionResponse.statusText}`;
      try {
        const errorBody = await productionResponse.text();
        metrics.rawResponseTruncated = `Error Body: ${errorBody.substring(0, 500)}`;
      } catch (errBodyEx) {
        metrics.rawResponseTruncated = `Falhou ao ler o corpo do erro HTTP ${productionResponse.status}`;
      }
    }
  } catch (prodErr: any) {
    clearTimeout(timeoutId);
    const endTimeNetwork = performance.now();
    const networkDuration = ((endTimeNetwork - startTimeNetwork) / 1000).toFixed(2);
    const errTimestamp = new Date().toISOString();
    console.error(`[DIAGNÓSTICO ETAPA 1] [${errTimestamp}] Erro ou Exceção de rede no fetch da Audit AI. Duração decorrida: ${networkDuration}s. Detalhes:`, prodErr);
    
    metrics.networkDurationSec = networkDuration;
    metrics.fallbackTriggered = true;
    
    if (prodErr.name === 'AbortError') {
      console.warn("❌ Erro: Tempo limite de 40 segundos atingido na conexão com a Audit AI síncrona.");
      metrics.networkError = "Timeout (AbortError) - Estourou o limite de 40 segundos.";
      metrics.fallbackReason = "Timeout inteligente de 40 segundos na rede.";
    } else {
      console.error("❌ Falha chamando API síncrona da Audit AI:", prodErr.message);
      metrics.networkError = prodErr.stack || prodErr.message;
      metrics.fallbackReason = `Exceção de Fetch de Rede síncrona: ${prodErr.message}`;
    }
  }

  let mapped: any = null;
  if (responseOk && responseData) {
    try {
      mapped = mapAuditAiResponse(responseData, isSurgery);
      if (mapped) {
        mapped._usedModel = responseData?.usedModel || '';
        mapped._quotaExhausted = responseData?.quotaExhausted || false;
        
        // LOGS TEMPORÁRIOS DE DIAGNÓSTICO DE MAPEAMENTO
        console.log("=== DIAGNÓSTICO DE MAPEAMENTO (processImage) ===");
        console.log("OBJETO MAPPED ANTES DE QUALQUER OUTRO PROCESSAMENTO:", JSON.stringify(mapped, null, 2));
        metrics.mappedResult = JSON.stringify(mapped, null, 2);
      }
    } catch (e) {
      console.warn("⚠️ Falha ao mapear resposta da IA:", e);
    }
  }

  let isMappedEmpty = false;
  if (!mapped) {
    isMappedEmpty = true;
  } else if (isSurgery) {
    isMappedEmpty = !mapped.patientName;
    if (isMappedEmpty) {
      metrics.fallbackReason = "Dados retornados pela Audit AI não continham o campo 'patientName' obrigatório.";
    }
  } else {
    // Para Notas Fiscais (Invoices), só altera o fallback de OCR se NENHUM dos campos críticos foi extraído
    const hasAmount = mapped.amount && parseFloat(String(mapped.amount)) > 0;
    const hasDate = mapped.date && mapped.date !== '1970-01-01' && mapped.date !== '';
    const hasNoteNumber = mapped.noteNumber && mapped.noteNumber.trim() !== '' && mapped.noteNumber !== 'undefined' && mapped.noteNumber !== 'null' && mapped.noteNumber !== '0001';
    const hasPayer = mapped.originalPayerName && mapped.originalPayerName.trim() !== '' && mapped.originalPayerName !== 'PACIENTE OU FONTE PAGADORA LOCAL';
    
    isMappedEmpty = !(hasAmount || hasDate || hasNoteNumber || hasPayer);
    if (isMappedEmpty) {
      metrics.fallbackReason = "Dados da Nota Fiscal retornados pela Audit AI não continham nenhum campo crítico (valor, data, número, emitente).";
    }
  }

  if (isMappedEmpty) {
    metrics.fallbackTriggered = true;
    const startTimeOCR = performance.now();
    console.warn("⚠️ Extração por IA (Audit AI) indisponível ou vazia. Ativando OCR Tesseract Local com heurísticas...");
    try {
      const ocrResult = await Tesseract.recognize(file, 'por+eng');
      const endTimeOCR = performance.now();
      const ocrDuration = ((endTimeOCR - startTimeOCR) / 1000).toFixed(2);
      console.log(`⏱️ Tempo de processamento local [Tesseract fallback]: ${ocrDuration}s`);

      const text = ocrResult?.data?.text || '';
      console.log("TEXTO EXTRAÍDO PELO TESSERACT LOCAL:\n", text);
      
      metrics.tesseractDurationSec = ocrDuration;
      metrics.tesseractTextLength = text.length;
      metrics.tesseractTextSample = text.substring(0, 400);

      const heuristicResult = parseTextWithHeuristics(text, isSurgery);
      console.log("RESULTADO DA ANÁLISE HEURÍSTICA LOCAL:", JSON.stringify(heuristicResult));
      
      metrics.tesseractHeuristics = JSON.stringify(heuristicResult);
      
      (window as any).__lastExtractionMetrics = metrics;
      window.dispatchEvent(new CustomEvent('extractionMetricsUpdated'));

      return heuristicResult;
    } catch (ocrErr: any) {
      const endTimeOCR = performance.now();
      const ocrDuration = ((endTimeOCR - startTimeOCR) / 1000).toFixed(2);
      console.log(`⏱️ Tempo de processamento local [Tesseract - Falhado]: ${ocrDuration}s`);
      console.error("❌ Falha crítica no OCR Tesseract Local:", ocrErr.message);
      
      metrics.tesseractDurationSec = ocrDuration;
      metrics.networkError += ` | Falha OCR Local: ${ocrErr.message}`;
      
      (window as any).__lastExtractionMetrics = metrics;
      window.dispatchEvent(new CustomEvent('extractionMetricsUpdated'));
    }
  }

  if (!mapped) {
    (window as any).__lastExtractionMetrics = metrics;
    window.dispatchEvent(new CustomEvent('extractionMetricsUpdated'));
    console.error("❌ [DIAGNÓSTICO MEDNOTE] FALHA TOTAL NA EXTRAÇÃO AUTOMÁTICA:", {
      erroRedeOuTimeout: metrics.networkError || "Nenhum erro de rede explícito",
      statusHTTP: metrics.httpStatus,
      mensagemStatusHTTP: metrics.httpStatusText,
      razaoFallback: metrics.fallbackReason,
      detalhesTesseractLocal: {
        duracaoSegundos: metrics.tesseractDurationSec,
        tamanhoTextoExtraido: metrics.tesseractTextLength,
        amostraTextoExtraido: metrics.tesseractTextSample,
        heuristicaExtraida: metrics.tesseractHeuristics
      }
    });
    throw new Error("Não foi possível realizar a extração automática. A imagem pode estar ilegível ou o servidor de IA e OCR local falharam.");
  }

  console.log('MAPPED RESULT:', JSON.stringify(mapped));
  
  (window as any).__lastExtractionMetrics = metrics;
  window.dispatchEvent(new CustomEvent('extractionMetricsUpdated'));

  return mapped;
}

export async function extractInvoiceDetails(file: File) {
  console.time('OCR_Invoice');
  try {
    const prompt = `Analise esta nota fiscal de serviço (NFS-e) ou recibo médico. Extraia os dados de forma extremamente precisa seguindo as instruções:
1. "emitente" e "cnpjEmitente" devem referir-se ao TOMADOR DE SERVIÇOS (seção TOMADOR DO SERVIÇO / TOMADOR DE SERVIÇOS, que é quem contrata/paga pelo serviço médico e recebe o reembolso), NUNCA ao prestador de serviços que emitiu a nota.
2. "numeroNota" deve extrair o Número da Nota de forma precisa (consulte o topo superior direito da nota, ex: "991" ou "00000991").
3. "dataEmissao" deve extrair a Data de Emissão (extraia do campo "Data e Hora da Emissão" ou similar, ex: "15/05/2026").
4. "valorTotal" e "valorLiquido" devem ser extraídos como números decimais puros (ex: 1500.00), sem símbolo de moeda (R$), sem ponto de milhar, usando ponto como separador decimal. Se "valorLiquido" não for encontrado na nota, repita o valor de "valorTotal" nele.
Retorne valorTotal e valorLiquido como números decimais puros (ex: 1500.00), sem símbolo de moeda, sem ponto de milhar.`;
    const schema = {
      type: "object",
      properties: {
        dataEmissao: { type: "string", description: "Data de emissão (ex: 15/05/2026), capturada a partir do campo 'Data e Hora da Emissão'" },
        emitente: { type: "string", description: "Nome ou Razão Social do TOMADOR DE SERVIÇOS (nunca o prestador)" },
        valorTotal: { type: "number", description: "Valor bruto total do serviço constante na nota como número puramente decimal (ex: 1500.00)" },
        valorLiquido: { type: "number", description: "Valor líquido do serviço após deduções (ISS, etc). Se não encontrar, use o mesmo valor de valorTotal como número puramente decimal (ex: 1500.00)" },
        numeroNota: { type: "string", description: "Número da nota fiscal correto (geralmente no canto superior direito)" },
        cnpjEmitente: { type: "string", description: "CNPJ do TOMADOR DE SERVIÇOS (seção TOMADOR DO SERVIÇO)" },
        itens: {
          type: "array",
          description: "Lista de serviços / itens prestados",
          items: {
            type: "object",
            properties: {
              descricao: { type: "string", description: "Nome/Descrição do serviço prestado na nota" }
            }
          }
        }
      },
      required: ["numeroNota"]
    };
    
    const analysis: any = await processImage(file, prompt, schema);
    
    console.timeEnd('OCR_Invoice');
    return analysis.analysis || analysis;
  } catch (err) {
    console.timeEnd('OCR_Invoice');
    throw err;
  }
}

export async function extractSurgeryLabel(file: File) {
  console.time('OCR_Surgery');
  try {
    const prompt = `Analise esta imagem. Antes de extrair qualquer dado, identifique mentalmente o tipo de documento:
- ETIQUETA FÍSICA INDIVIDUAL
- TELA DE SISTEMA DIGITAL
- TABELA/LISTA DE AGENDA (múltiplos pacientes)
- FOLHA CIRÚRGICA / DESCRIÇÃO OPERATÓRIA

Extraia EXATAMENTE estes campos para cada paciente encontrado:
- patientName: nome completo do paciente. NUNCA confunda com nome de médico (identificado por "Dr.", "Dra." ou CRM)
- attendance: número de atendimento
- insurance: convênio ou plano de saúde — OBRIGATÓRIO. Em etiquetas: "Conv:", "Convênio:", "Plano:". Em telas de sistema: "Classe:". Em tabelas de agenda: coluna após o número de atendimento. Nunca deixe vazio.
- date: data de entrada/atendimento/cirurgia em YYYY-MM-DD. NUNCA use a data de nascimento
- hospital: nome do hospital se visível

REGRAS POR TIPO DE DOCUMENTO:

ETIQUETA FÍSICA: use OCR letra por letra com fidelidade absoluta. NUNCA aplique lógica de colunas ou tabela — isso embaralha os nomes. Para letras parcialmente visíveis, reconstrua caractere por caractere.

TELA DE SISTEMA: filtre ruídos de interface. Busque "Classe:" como sinônimo de convênio. Diferencie nome do paciente de nomes de médicos.

TABELA DE AGENDA (use SOMENTE se identificar explicitamente múltiplos pacientes em formato de tabela): cada linha é um paciente no formato [Nº Atendimento | Convênio | Hora | Nome | Status | Data]. Exemplo: "5315008 Sul América 13:00 Rafael de Oliveira Barbosa Executada 23/06/2026"

FOLHA CIRÚRGICA: extraia dados do cabeçalho. NUNCA confunda cirurgião ("Cirurgião:", "Dr.") com nome do paciente ("Paciente:", "Nome:", "Beneficiário:").

DADOS ILEGÍVEIS: se completamente ilegível por reflexo ou rasura severa, deixe o campo vazio. Para dados parcialmente visíveis, tente reconstruir.`;

    const schema = {
      type: "object",
      properties: {
        patientName: { type: "string" },
        procedure: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD (ex: 2026-06-05)" },
        insurance: { type: "string" },
        attendance: { type: "string" },
        company: { type: "string" },
        hospital: { type: "string" }
      }
    };

    const analysis: any = await processImage(file, prompt, schema);

    console.timeEnd('OCR_Surgery');
    
    // Função local para normalizar os dados extraídos independente do formato de resposta da API
    const normalize = (res: any) => {
      if (!res) return null;
      return {
        patientName: res.patientName || res.nome_paciente || '',
        attendance: res.attendance || res.numero_atendimento || '',
        insurance: res.insurance || res.convenio || '',
        date: convertDateToISO(res.date || res.data_atendimento || ''),
        procedure: res.procedure || res.procedimento || '',
        hospital: res.hospital || '',
        company: res.company || '',
        aiSourceHash: res.aiSourceHash || '',
        _usedModel: res._usedModel || '',
        _quotaExhausted: res._quotaExhausted || false,
        isLocalOCR: res.isLocalOCR || false
      };
    };

    let finalResult: any = null;
    if (analysis) {
      if (analysis.patientName || analysis.nome_paciente) {
        finalResult = normalize(analysis);
      } else if (analysis.etiquetas && analysis.etiquetas.length > 0) {
        finalResult = normalize(analysis.etiquetas[0]);
      } else if (analysis.analysis?.etiquetas && analysis.analysis.etiquetas.length > 0) {
        finalResult = normalize(analysis.analysis.etiquetas[0]);
      } else {
        finalResult = normalize(analysis?.analysis || analysis);
      }
    } else {
      finalResult = normalize(analysis?.analysis || analysis);
    }

    // LOGS TEMPORÁRIOS DE DIAGNÓSTICO DE NORMALIZAÇÃO FINAL
    console.log("=== DIAGNÓSTICO DE NORMALIZAÇÃO FINAL (extractSurgeryLabel) ===");
    console.log("RESULTADO FINAL NORMALIZADO:", JSON.stringify(finalResult, null, 2));

    if ((window as any).__lastExtractionMetrics) {
      (window as any).__lastExtractionMetrics.normalizedResult = JSON.stringify(finalResult, null, 2);
      // Dispara o evento de atualização para atualizar a UI do painel
      window.dispatchEvent(new CustomEvent('extractionMetricsUpdated'));
    }

    return finalResult;
  } catch (err) {
    console.timeEnd('OCR_Surgery');
    throw err;
  }
}
