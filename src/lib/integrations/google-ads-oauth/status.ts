/**
 * Operator-facing Google Ads status.
 *
 * Presence words only. This module does not decrypt secrets.
 */
import { readGoogleAdsEnvironment } from "./environment";
import { googleAdsEncryptionReady } from "./cipher";
import { readGoogleAdsOAuthView } from "./store";

export type Presence = "Configurado" | "Não configurado";

export type GoogleAdsIntegrationStatus = {
  connection: "Conectado" | "Não conectado" | "Erro";
  connectionTone: "success" | "warning" | "danger";
  account: string;
  environment: string;
  lastSynchronization: "Não sincronizado";
  cloudProject: string;
  accessLevel: string;
  oauthStatus: string;
  refreshToken: Presence;
  clientId: Presence;
  clientSecret: Presence;
  developerToken: Presence;
  redirectUri: Presence;
  customerId: string;
  loginCustomerId: string;
  apiStatus: string;
  lastConnection: string;
  lastError: string | null;
  canConnect: boolean;
  canDisconnect: boolean;
  canTest: boolean;
  blockers: Array<"chave" | "configuracao">;
};

const ENV_LABEL = {
  development: "Desenvolvimento",
  test: "Teste",
  production: "Produção",
} as const;

function presence(value: boolean): Presence {
  return value ? "Configurado" : "Não configurado";
}

function when(value: string | null): string {
  if (!value) return "Não registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não registrada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function readGoogleAdsIntegrationStatus(): GoogleAdsIntegrationStatus {
  const env = readGoogleAdsEnvironment();
  const stored = readGoogleAdsOAuthView();
  const encryptionReady = googleAdsEncryptionReady();
  const environmentReady = Boolean(env.clientId && env.clientSecret && env.redirectUri);
  const clientReady = Boolean(env.clientId) || stored.clientIdConfigured;
  const secretReady = Boolean(env.clientSecret) || stored.clientSecretConfigured;
  const refreshReady = stored.refreshTokenConfigured;
  const connected = refreshReady && stored.oauthStatus === "connected" && stored.apiStatus === "success";
  const failed = refreshReady && (stored.oauthStatus === "error" || stored.apiStatus === "error");
  return {
    connection: connected ? "Conectado" : failed ? "Erro" : "Não conectado",
    connectionTone: connected ? "success" : failed ? "danger" : "warning",
    account: stored.accountName || "Não observada",
    environment: ENV_LABEL[env.appEnv],
    lastSynchronization: "Não sincronizado",
    cloudProject: env.cloudProject || "Não configurado",
    accessLevel: stored.accessLevel || "Não verificado",
    oauthStatus: refreshReady && stored.oauthStatus === "connected" ? "Autorizado" : stored.oauthStatus === "error" ? "Não autorizado" : "Pendente",
    refreshToken: presence(refreshReady),
    clientId: presence(clientReady),
    clientSecret: presence(secretReady),
    developerToken: presence(Boolean(env.developerToken)),
    redirectUri: presence(Boolean(env.redirectUri)),
    customerId: stored.customerId || "Não observado",
    loginCustomerId: env.loginCustomerId || stored.loginCustomerId || "Não observado",
    apiStatus: stored.apiStatus === "success" ? "Operacional" : stored.apiStatus === "error" ? "Falha" : "Não verificado",
    lastConnection: when(stored.lastConnectionAt),
    lastError: stored.lastError,
    canConnect: environmentReady && encryptionReady,
    canDisconnect: refreshReady || stored.oauthStatus !== "disconnected",
    canTest: refreshReady,
    blockers: [
      ...(encryptionReady ? [] : ["chave" as const]),
      ...(environmentReady ? [] : ["configuracao" as const]),
    ],
  };
}

export const GOOGLE_ADS_NOTICE: Record<string, { title: string; detail: string; tone: "success" | "warning" | "danger" }> = {
  sucesso: { title: "Conexão bem-sucedida", detail: "A conta está acessível e o usuário está autorizado.", tone: "success" },
  desconectado: { title: "Conta desconectada", detail: "O refresh token e a sessão foram removidos. O cliente OAuth permanece.", tone: "success" },
  configuracao: { title: "Configuração incompleta", detail: "Defina GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET e GOOGLE_ADS_REDIRECT_URI.", tone: "warning" },
  chave: { title: "Criptografia indisponível", detail: "ADMIN_SESSION_SECRET precisa ter pelo menos 16 caracteres para guardar as credenciais.", tone: "danger" },
  sessao: { title: "Sessão necessária", detail: "Entre na administração antes de conectar o Google Ads.", tone: "warning" },
  estado: { title: "Autorização expirada", detail: "O retorno do Google não corresponde a esta sessão. Conecte de novo.", tone: "warning" },
  codigo: { title: "Código ausente", detail: "O Google não devolveu um authorization code.", tone: "danger" },
  token: { title: "Token recusado", detail: "O Google não entregou um refresh token válido. Conecte de novo e aceite o consentimento.", tone: "danger" },
  escopo: { title: "Escopo inválido", detail: "A autorização não inclui o Google Ads.", tone: "danger" },
  teste: { title: "Falha na conexão", detail: "O Google Ads recusou a leitura da conta.", tone: "danger" },
  desenvolvedor: { title: "Token de desenvolvedor", detail: "O refresh token foi guardado, mas a leitura da conta exige GOOGLE_ADS_DEVELOPER_TOKEN.", tone: "warning" },
  conta: { title: "Conta inacessível", detail: "O usuário autorizado não consegue ler uma conta do Google Ads.", tone: "danger" },
};
