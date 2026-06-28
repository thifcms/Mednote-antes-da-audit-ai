/**
 * Utilitários para autenticação biométrica nativa (WebAuthn)
 * Totalmente offline-first e seguro, ideal para uso rápido pelo médico.
 */

// Verifica se o dispositivo do usuário suporta autenticação biométrica local
export async function isBiometricsAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }

  try {
    // Verifica se a autenticação por plataforma (FaceID, TouchID, Impressão Digital) está disponível
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (err) {
    console.error("Erro ao verificar disponibilidade de biometria:", err);
    return false;
  }
}

// Ativa a biometria criando uma credencial local vinculada ao dispositivo
export async function registerBiometrics(userId: string, userEmail: string): Promise<{ credentialId: string } | null> {
  if (!window.PublicKeyCredential) {
    throw new Error("Seu navegador ou dispositivo não suporta biometria nativa.");
  }

  // Desafio aleatório de 32 bytes (gerado localmente para fluxo offline)
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // ID de usuário exclusivo para o par de chaves
  const userIdBytes = new TextEncoder().encode(userId);

  const rpId = window.location.hostname;

  const creationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: "MedNotes Cloud",
      id: rpId,
    },
    user: {
      id: userIdBytes,
      name: userEmail || "medico@mednotes.com",
      displayName: userEmail ? userEmail.split('@')[0].toUpperCase() : "Médico MedNotes",
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },  // ES256 (Algoritmo preferido no iOS/Safari e Android)
      { alg: -257, type: "public-key" } // RS256
    ],
    timeout: 60000,
    authenticatorSelection: {
      authenticatorAttachment: "platform", // Face ID, Touch ID, Impressão digital do sistema operacional
      userVerification: "required",
      residentKey: "required",
    },
  };

  try {
    const credential = await navigator.credentials.create({
      publicKey: creationOptions,
    }) as PublicKeyCredential;

    if (!credential) return null;

    // Converte rawId da credencial para string Base64 para armazenar no localStorage com segurança
    const rawIdBytes = new Uint8Array(credential.rawId);
    let binary = '';
    for (let i = 0; i < rawIdBytes.byteLength; i++) {
      binary += String.fromCharCode(rawIdBytes[i]);
    }
    const credentialIdB64 = btoa(binary);

    return { credentialId: credentialIdB64 };
  } catch (err: any) {
    console.error("Erro no registro de biometria:", err);
    throw err;
  }
}

// Autentica o usuário usando a credencial gerada anteriormente
export async function authenticateBiometrics(userId: string): Promise<boolean> {
  const credentialIdB64 = localStorage.getItem(`biometric_credential_id_${userId}`);
  if (!credentialIdB64) {
    throw new Error("Nenhuma biometria cadastrada neste dispositivo.");
  }

  if (!window.PublicKeyCredential) {
    throw new Error("Seu navegador ou dispositivo não suporta biometria nativa.");
  }

  // Converte a ID de volta de Base64 para Uint8Array
  const binaryString = atob(credentialIdB64);
  const rawIdBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    rawIdBytes[i] = binaryString.charCodeAt(i);
  }

  // Desafio aleatório de 32 bytes para a assinatura
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname,
    allowCredentials: [
      {
        id: rawIdBytes,
        type: "public-key",
      }
    ],
    timeout: 60000,
    userVerification: "required",
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: requestOptions,
    });

    return !!assertion;
  } catch (err: any) {
    console.error("Erro na validação biométrica:", err);
    throw err;
  }
}
