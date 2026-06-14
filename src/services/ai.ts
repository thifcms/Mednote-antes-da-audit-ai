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

  const response = await fetch('/api/gemini/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileType: mimeType,
      base64Data,
      prompt,
      schema,
    })
  });

  const responseData = await response.json();

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

  return responseData;
}

export async function extractInvoiceDetails(file: File) {
  console.time('OCR_Invoice');
  try {
    const prompt = `Analise esta nota fiscal de serviço ou recibo médico. Extraia os dados solicitados de forma precisa.`;
    const schema = {
      type: "object",
      properties: {
        date: { type: "string", description: "Data de emissão no formato YYYY-MM-DD" },
        originalPayerName: { type: "string", description: "Nome do paciente, tomador ou fonte pagadora" },
        amount: { type: "number", description: "Valor bruto total do serviço (apenas número)" },
        netAmount: { type: "number", description: "Valor líquido a receber (se tiver, senão repita o bruto)" },
        noteNumber: { type: "string", description: "Número da nota fiscal ou recibo (se houver)" },
        cnpj: { type: "string", description: "CNPJ do prestador ou tomador (se houver)" },
        description: { type: "string", description: "Breve descrição do serviço prestado" }
      },
      required: ["date", "originalPayerName", "amount", "netAmount"]
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
    const prompt = `Analise esta etiqueta cirúrgica, prontuário, ou folha de sala. Extraia os dados referentes à cirurgia do paciente.`;
    const schema = {
      type: "object",
      properties: {
        patientName: { type: "string" },
        procedure: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        insurance: { type: "string" },
        attendance: { type: "string" },
        company: { type: "string" },
        implantBatch: { type: "string" },
        hospitalCnpj: { type: "string" }
      },
      required: ["patientName", "procedure", "date", "insurance"]
    };

    const analysis = await processImage(file, prompt, schema);

    console.timeEnd('OCR_Surgery');
    return analysis.analysis || analysis;
  } catch (err) {
    console.timeEnd('OCR_Surgery');
    throw err;
  }
}
