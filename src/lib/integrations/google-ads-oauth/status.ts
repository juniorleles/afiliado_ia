/**
 * Operator-facing Google Ads status.
 *
 * Presence words only. This module does not decrypt secrets.
 */
import { readGoogleAdsEnvironment } from "./environment";
import { googleAdsEncryptionReady } from "./cipher";
import { readGoogleAdsAccounts, readGoogleAdsDiscoveryHealth, readGoogleAdsOAuthView, type GoogleAdsPermissions, type GoogleAdsStoredAccount } from "./store";

export type Presence = "Configurado" | "Não configurado";

export type GoogleAdsIntegrationStatus = {
  connection: "Conectado" | "Não conectado" | "Erro";
  connectionTone: "success" | "warning" | "danger";
  account: string;
  environment: string;
  lastSynchronization: string;
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
  currency: string;
  timeZone: string;
  manager: string;
  testAccount: string;
  campaignCount: string;
  pausedCount: string;
  enabledCount: string;
  removedCount: string;
  syncLabel: "Conectado" | "Desconectado" | "Precisa de autorização" | "Erro de permissão";
  syncTone: "success" | "warning" | "danger" | "neutral";
  accounts: GoogleAdsStoredAccount[];
  permissions: GoogleAdsPermissions;
  oauthHealth: string;
  apiHealth: string;
  customerHealth: string;
  scopeHealth: string;
  latency: string;
  lastSuccessfulSync: string;
  apiVersion: string;
  oauthClient: Presence;
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
  const accounts = readGoogleAdsAccounts();
  const health = readGoogleAdsDiscoveryHealth();
  const selected = accounts.find((account) => account.selected) ?? null;
  const awaitingSelection = accounts.length > 1 && selected === null;
  const connected = refreshReady && stored.oauthStatus === "connected" && stored.apiStatus === "success";
  const failed = refreshReady && (stored.oauthStatus === "error" || stored.apiStatus === "error");
  const syncLabel = health.syncState === "connected"
    ? "Conectado"
    : health.syncState === "needs_authorization"
      ? "Precisa de autorização"
      : health.syncState === "permission_error"
        ? "Erro de permissão"
        : "Desconectado";
  const count = (value: number | null | undefined) => (typeof value === "number" ? String(value) : "Não lida");
  return {
    connection: connected ? "Conectado" : failed ? "Erro" : "Não conectado",
    connectionTone: connected ? "success" : failed ? "danger" : "warning",
    account: awaitingSelection ? "Não selecionada" : selected?.accountName || stored.accountName || "Não observada",
    environment: ENV_LABEL[env.appEnv],
    lastSynchronization: when(health.lastSuccessAt) === "Não registrada" ? "Não sincronizado" : when(health.lastSuccessAt),
    cloudProject: env.cloudProject || "Não configurado",
    accessLevel: selected?.accessLevel || stored.accessLevel || "Não verificado",
    oauthStatus: refreshReady && stored.oauthStatus === "connected" ? "Autorizado" : stored.oauthStatus === "error" ? "Não autorizado" : "Pendente",
    refreshToken: presence(refreshReady),
    clientId: presence(clientReady),
    clientSecret: presence(secretReady),
    developerToken: presence(Boolean(env.developerToken)),
    redirectUri: presence(Boolean(env.redirectUri)),
    customerId: awaitingSelection ? "Não selecionada" : selected?.customerId || stored.customerId || "Não observado",
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
    currency: selected?.currencyCode || "Não observada",
    timeZone: selected?.timeZone || "Não observado",
    manager: selected ? (selected.manager ? "Sim" : "Não") : "Não observado",
    testAccount: selected ? (selected.testAccount ? "Sim" : "Não") : "Não observado",
    campaignCount: count(selected?.campaignCount),
    pausedCount: count(selected?.pausedCount),
    enabledCount: count(selected?.enabledCount),
    removedCount: count(selected?.removedCount),
    syncLabel,
    syncTone: syncLabel === "Conectado" ? "success" : syncLabel === "Erro de permissão" ? "danger" : syncLabel === "Precisa de autorização" ? "warning" : "neutral",
    accounts,
    permissions: selected?.permissions ?? {
      campaignRead: "missing",
      campaignWrite: "missing",
      adGroup: "missing",
      ads: "missing",
      keywords: "missing",
      reporting: "missing",
      assets: "missing",
    },
    oauthHealth: refreshReady && stored.oauthStatus === "connected" ? "Autorizado" : stored.oauthStatus === "error" ? "Não autorizado" : "Pendente",
    apiHealth: stored.apiStatus === "success" ? "Operacional" : stored.apiStatus === "error" ? "Falha" : "Não verificado",
    customerHealth: selected?.customerId || "Não observada",
    scopeHealth: refreshReady && stored.oauthStatus === "connected" ? "Concedido" : "Ausente",
    latency: typeof health.latencyMs === "number" ? `${health.latencyMs} ms` : "Não medida",
    lastSuccessfulSync: when(health.lastSuccessAt),
    apiVersion: health.apiVersion || "Não verificada",
    oauthClient: presence(clientReady),
  };
}

export const GOOGLE_ADS_NOTICE: Record<string, { title: string; detail: string; tone: "success" | "warning" | "danger" }> = {
  sucesso: { title: "Conexão bem-sucedida", detail: "As contas acessíveis foram lidas. Nenhuma campanha foi alterada.", tone: "success" },
  selecionada: { title: "Conta ativa", detail: "Uma conta ficou ativa. As outras permanecem disponíveis.", tone: "success" },
  desconectado: { title: "Conta desconectada", detail: "O refresh token e a sessão foram removidos. O cliente OAuth permanece.", tone: "success" },
  configuracao: { title: "Configuração incompleta", detail: "Defina GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET e GOOGLE_ADS_REDIRECT_URI.", tone: "warning" },
  chave: { title: "Criptografia indisponível", detail: "ADMIN_SESSION_SECRET precisa ter pelo menos 16 caracteres para guardar as credenciais.", tone: "danger" },
  sessao: { title: "Sessão necessária", detail: "Entre na administração antes de conectar o Google Ads.", tone: "warning" },
  estado: { title: "Autorização expirada", detail: "O retorno do Google não corresponde a esta sessão. Conecte de novo.", tone: "warning" },
  codigo: { title: "Código ausente", detail: "O Google não devolveu um authorization code.", tone: "danger" },
  token: { title: "Token recusado", detail: "O Google não entregou um refresh token válido. Conecte de novo e aceite o consentimento.", tone: "danger" },
  escopo: { title: "Escopo inválido", detail: "A autorização não inclui o Google Ads.", tone: "danger" },
  teste: { title: "Falha na conexão", detail: "O Google Ads recusou a leitura da conta.", tone: "danger" },
  desenvolvedor: { title: "Acesso do projeto", detail: "O Google Ads recusou o projeto do Cloud associado a estas credenciais OAuth.", tone: "warning" },
  conta: { title: "Conta inacessível", detail: "O usuário autorizado não consegue ler uma conta do Google Ads.", tone: "danger" },
};
