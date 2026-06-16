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

function convertDateToISO(dateStr: string): string {
  if (!dateStr) return '';
  // Já está em formato ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  // Formato DD/MM/AAAA ou DD/MM/AAAA HH:MM:SS
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function mapAuditAiResponse(responseData: any) {
  const data = responseData?.data;

  // Nota Fiscal: detecta pela presença de numeroNota ou valorTotal/emitente
  if (data && (data.numeroNota || data.valorTotal || data.emitente)) {
    const itensDesc = Array.isArray(data.itens) && data.itens.length
      ? data.itens.map((i: any) => i.descricao || '').filter(Boolean).join(', ')
      : '';
    return {
      date: convertDateToISO(data.dataEmissao || ''),
      originalPayerName: data.emitente || '',
      amount: data.valorTotal || 0,
      netAmount: data.valorTotal || 0,
      noteNumber: data.numeroNota || '',
      cnpj: data.cnpjEmitente || '',
      description: itensDesc,
    };
  }

  // Etiqueta hospitalar
  const etiqueta = data?.etiquetas?.[0];
  if (etiqueta) {
    return {
      patientName: etiqueta.nome_paciente || etiqueta.patientName || '',
      attendance: etiqueta.numero_atendimento || etiqueta.attendance || '',
      insurance: etiqueta.convenio || etiqueta.insurance || '',
      date: convertDateToISO(etiqueta.data_atendimento || etiqueta.date || ''),
      procedure: etiqueta.procedimento || etiqueta.procedure || '',
      hospital: etiqueta.hospital || '',
    };
  }

  // Fallback original
  return responseData.analysis || responseData;
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

  const response = await fetch('https://audit-ai-6wed.onrender.com/api/gemini/extract', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': 'auditai_key_2026_medico'
    },
    body: JSON.stringify({
      fileBase64: base64Data,
      filename: file.name || 'documento.jpg',
      mimeType,
      prompt,
      schema,
    })
  });

  const responseData = await response.json();
  console.log('AUDIT AI RESPONSE:', JSON.stringify(responseData));

  if (!response.ok) {
     const errorStr = typeof responseData.error === 'object' ? JSON.stringify(responseData.error) : (responseData.error || "");
     
     if (errorStr.includes("429") || errorStr.toLowerCase().includes("quota") || errorStr.includes("RESOURCE_EXHAUSTED")) {
         throw new Error("O limite gratuito de inteligência artificial foi atingido temporariamente (máx reqs/min). Aguarde 1 minuto para tentar novamente ou configure uma chave paga (GEMINI_API_KEY).");
     }
     if (errorStr.includes("INVALID_ARGUMENT") || errorStr.includes("CHAVE DE API")) {
         throw new Error("Sua CHAVE DE API no painel de Segredos pode ser inválida. Verifique sua chave.");
     }
     throw new Error(typeof responseData.error === 'string' ? responseData.error : "Não foi possível extrair dados da imagem.");
  }

  const mapped = mapAuditAiResponse(responseData);
  console.log('MAPPED RESULT:', JSON.stringify(mapped));
  try {
    alert('MAPPED RESULT: ' + JSON.stringify(mapped));
  } catch (e) {
    console.warn('Alert falhou ou foi bloqueado:', e);
  }
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
    
    const analysis = await processImage(file, prompt, schema);
    
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
    const prompt = `Analise esta etiqueta cirúrgica, prontuário, ou folha de sala. Extraia os dados referentes à cirurgia do paciente. O campo \`insurance\` (convênio) é OBRIGATÓRIO — procure especificamente por termos como 'Conv:', 'Convênio:', 'Plano:' na etiqueta. Exemplos de convênios: Unimed, Bradesco Saúde, SulAmérica, Amil, Particular. Não deixe esse campo vazio.`;
    const schema = {
      type: "object",
      properties: {
        etiquetas: {
          type: "array",
          description: "Lista de todos os pacientes encontrados na imagem. Se houver apenas um, retorne array com um elemento.",
          items: {
            type: "object",
            properties: {
              patientName: { type: "string" },
              procedure: { type: "string" },
              date: { type: "string", description: "YYYY-MM-DD" },
              insurance: { type: "string", description: "Convênio/plano — campo Conv: na etiqueta" },
              attendance: { type: "string" },
              company: { type: "string" },
              hospital: { type: "string", description: "Nome do hospital, geralmente no cabeçalho" }
            },
            required: ["patientName", "insurance"]
          }
        }
      },
      required: ["etiquetas"]
    };

    const analysis = await processImage(file, prompt, schema);

    console.timeEnd('OCR_Surgery');
    
    // Suporte caso o mapAuditAiResponse não intercepte (fallback):
    if (analysis && analysis.etiquetas && analysis.etiquetas.length > 0) {
      return analysis.etiquetas[0];
    } else if (analysis?.analysis?.etiquetas?.length > 0) {
      return analysis.analysis.etiquetas[0];
    }
    
    return analysis.analysis || analysis;
  } catch (err) {
    console.timeEnd('OCR_Surgery');
    throw err;
  }
}
