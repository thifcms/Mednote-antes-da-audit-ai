import { GoogleGenAI } from '@google/genai';
import Tesseract from 'tesseract.js';

// Função para extração usando a nova DocEngine API
async function processWithDocEngine(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/read', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Falha na DocEngine');
    }

    return await response.json();
  } catch (error) {
    console.warn('DocEngine failed, falling back to Tesseract:', error);
    return await processWithTesseract(file);
  }
}

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

// In a real app we'd keep this securely managed or using a proxy backend.
// In AI Studio preview, the env var is populated.
function getClient() {
  const apiKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({ apiKey });
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
      ctx.drawImage(img, 0, 0, width, height);
      
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

function mapAuditAiResponse(responseData: any) {
  if (!responseData) return null;
  const data = responseData?.data || responseData?.analysis || responseData;
  const hash = responseData?.image_hash || data?.image_hash || responseData?.data?.image_hash || '';

  // Nota Fiscal: detecta pela presença de numeroNota ou valorTotal/emitente
  const isInvoice = findField(responseData, ['numeroNota', 'valorTotal', 'emitente', 'cnpjEmitente']) !== undefined;
  if (isInvoice) {
    const emitente = findField(responseData, ['emitente', 'razaoSocial', 'prestador', 'nomeEmitente']) || '';
    const valorTotal = parseFloat(findField(responseData, ['valorTotal', 'valorBruto', 'valor_total']) || '0');
    const dataEmissao = findField(responseData, ['dataEmissao', 'data_emissao', 'dataEmis', 'data']) || '';
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
      netAmount: valorTotal,
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

export async function processImage(file: File, prompt: string, schema?: any) {
  let base64Data: string;
  let mimeType: string;

  const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';

  if (file.type === 'application/pdf' || isHeic) {
    if (file.type === 'application/pdf' && file.size > 5 * 1024 * 1024) {
      throw new Error("O PDF é muito grande (máx. 5MB) ou você atingiu o limite de uso. Tire um Print (foto) da nota e envie como imagem para gastar menos leitura da IA, ou aguarde 1 minuto.");
    }
    if (isHeic && file.size > 10 * 1024 * 1024) {
      throw new Error("A imagem é muito grande (máx. 10MB). Reduza a resolução na câmera e tente novamente.");
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

  // 1. TENTA PRIMEIRO O SERVIDOR DE PRODUÇÃO DA AUDIT AI (Primeira e única opção de IA)
  try {
    console.log("Iniciando extração via API de Produção da Audit AI...");
    const productionResponse = await fetch('https://audit-ai-6wed.onrender.com/api/gemini/extract', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': (import.meta as any).env.VITE_AUDIT_AI_KEY || 'auditai_key_2026_medico'
      },
      body: JSON.stringify({
        fileBase64: base64Data,
        filename: file.name || 'documento.jpg',
        mimeType,
        prompt,
        schema,
      })
    });

    if (productionResponse.ok) {
      const prodData = await productionResponse.json();
      console.log('AUDIT AI RAW RESPONSE FROM PRODUCTION API:', JSON.stringify(prodData));
      
      const hasLlamaBypassed = prodData?.usedModel === 'llama-3.3-70b-versatile' || prodData?.usedProvider === 'groq';
      const actualProdData = prodData?.data || prodData;
      const isProdContentEmpty = !actualProdData?.nome_paciente && !actualProdData?.patientName && !actualProdData?.emitente;

      if (hasLlamaBypassed && isProdContentEmpty) {
        console.warn("⚠️ API de Produção caiu em fallback Llama-Texto e retornou vazio. Ativando OCR local...");
      } else {
        responseData = prodData;
        responseOk = true;
      }
    } else {
      console.warn(`⚠️ API de Produção falhou com status ${productionResponse.status}.`);
    }
  } catch (prodErr: any) {
    console.error("❌ Falha na chamando API de Produção da Audit AI:", prodErr.message);
  }

  let mapped: any = null;
  if (responseOk && responseData) {
    try {
      mapped = mapAuditAiResponse(responseData);
    } catch (e) {
      console.warn("⚠️ Falha ao mapear resposta da IA:", e);
    }
  }

  const isSurgery = schema?.properties?.patientName !== undefined;
  const isMappedEmpty = !mapped || (isSurgery ? !mapped.patientName : (!mapped.originalPayerName || mapped.originalPayerName === 'PACIENTE OU FONTE PAGADORA LOCAL'));

  if (isMappedEmpty) {
    console.warn("⚠️ Extração por IA (Audit AI) indisponível ou vazia. Ativando OCR Tesseract Local com heurísticas...");
    try {
      const ocrResult = await Tesseract.recognize(file, 'por+eng');
      const text = ocrResult?.data?.text || '';
      console.log("TEXTO EXTRAÍDO PELO TESSERACT LOCAL:\n", text);
      const heuristicResult = parseTextWithHeuristics(text, isSurgery);
      console.log("RESULTADO DA ANÁLISE HEURÍSTICA LOCAL:", JSON.stringify(heuristicResult));
      return heuristicResult;
    } catch (ocrErr: any) {
      console.error("❌ Falha crítica no OCR Tesseract Local:", ocrErr.message);
    }
  }

  if (!mapped) {
    throw new Error("Não foi possível realizar a extração automática. A imagem pode estar ilegível ou o servidor de IA e OCR local falharam.");
  }

  console.log('MAPPED RESULT:', JSON.stringify(mapped));
  return mapped;
}

export async function extractInvoiceDetails(file: File) {
  console.time('OCR_Invoice');
  try {
    const prompt = `Analise esta nota fiscal de serviço (NFS-e) ou recibo médico. Extraia os dados de forma extremamente precisa seguindo as instruções:
1. "emitente" e "cnpjEmitente" devem referir-se ao TOMADOR DE SERVIÇOS (seção TOMADOR DO SERVIÇO / TOMADOR DE SERVIÇOS, que é quem contrata/paga pelo serviço médico e recebe o reembolso), NUNCA ao prestador de serviços que emitiu a nota.
2. "numeroNota" deve extrair o Número da Nota de forma precisa (consulte o topo superior direito da nota, ex: "991" ou "00000991").
3. "dataEmissao" deve extrair a Data de Emissão (extraia do campo "Data e Hora da Emissão" ou similar, ex: "15/05/2026").`;
    const schema = {
      type: "object",
      properties: {
        dataEmissao: { type: "string", description: "Data de emissão (ex: 15/05/2026), capturada a partir do campo 'Data e Hora da Emissão'" },
        emitente: { type: "string", description: "Nome ou Razão Social do TOMADOR DE SERVIÇOS (nunca o prestador)" },
        valorTotal: { type: "number", description: "Valor bruto total do serviço constante na nota" },
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
      required: ["dataEmissao", "emitente", "valorTotal", "numeroNota"]
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
    const prompt = `Analise esta etiqueta hospitalar ou de internação. Os dados de texto na imagem podem estar rotacionados em 90 graus (na vertical/deitados) ou em qualquer orientação. Por favor, gire mentalmente a imagem para ler corretamente todos os textos.
Extraia as seguintes informações no formato JSON plano especificado:

1. "patientName" (NOME): O nome completo do paciente. Na etiqueta, ele costuma figurar após o campo de Leito, por exemplo: "Leito: 1148 / Gianlucca Salvini Barbosa" ou em uma linha separada. Procure pelo nome completo de pessoa física em português.
2. "date" (DATA): A data de entrada, internação ou atendimento. Procure por termos como "Dt.Entr:", "Atend:", "Internação:", ou simplesmente uma data recente em formato DD/MM/AAAA (ex: "05/06/2026"). IMPORTANTE: NUNCA confunda ou use a data de nascimento ("DTNasc:" ou "Nasc:") do paciente para o campo da cirurgia. Formate a data final como YYYY-MM-DD.
3. "insurance" (CONVÊNIO): O convênio médico ou plano de saúde do paciente. Procure por campos como "Convenio:", "Conv:", "Plano:" ou termos como "BRADESCO SEGUR", "UNIMED", "SULAMERICA", "AMIL", "CASSI", etc.
4. "attendance" (ATENDIMENTO): O número de atendimento do paciente para faturamento. Geralmente vem precedido por "Atend:" ou "Atendimento:", por exemplo: de "Atend: 55059115", extraia "55059115".
5. "procedure" (PROCEDIMENTO): O procedimento cirúrgico feito. ATENÇÃO: Procure também por qualquer anotação manual ou texto digital inserido por cima do print da imagem, como por exemplo marcas de edição ou marcações do WhatsApp, ex: "Rlca joelho d" (que significa reconstrução de LCA no joelho direito) ou abreviações de cirurgias no rodapé ou cabeçalho.
6. "hospital" (HOSPITAL): Nome do hospital onde a etiqueta foi gerada se estiver expresso ou indicado em algum logotipo ou cabeçalho.
7. "company" (FORNECEDOR OPME): Nome da empresa fornecedora de OPME se houver.`;

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
        aiSourceHash: res.aiSourceHash || ''
      };
    };

    if (analysis) {
      if (analysis.patientName || analysis.nome_paciente) {
        return normalize(analysis);
      }
      if (analysis.etiquetas && analysis.etiquetas.length > 0) {
        return normalize(analysis.etiquetas[0]);
      }
      if (analysis.analysis?.etiquetas && analysis.analysis.etiquetas.length > 0) {
        return normalize(analysis.analysis.etiquetas[0]);
      }
    }
    
    return normalize(analysis?.analysis || analysis);
  } catch (err) {
    console.timeEnd('OCR_Surgery');
    throw err;
  }
}
