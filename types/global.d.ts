// Global type declarations for Jarvis AI
// This file declares the runtime globals attached to window by various modules

interface Window {
  // From globals.js - core state
  $: (selector: string) => Element | null;
  $$: (selector: string) => NodeListOf<Element>;
  ls: Storage;
  ss: Storage;
  sessions: ChatSession[];
  activeId: string;
  chatHistory: Map<string, ChatMessage[]>;
  DOM: Record<string, HTMLElement>;
  cfgMap: ConfigMap;
  SAFETY: SafetySettings[];
  apiKeys: string[];
  globalKeyIndex: number;
  liveKeyIndex: number;
  liveRetryCount: number;
  openTabs: Set<string>;
  currentSelectedText: string;
  closeModals: () => void;
  isProcessing: boolean;
  abortController: AbortController | null;
  updateColorPickerUI: () => void;
  getSessionApiKey: (sessionId: string) => string | null;
  getGoogleKeysList: () => string[];
  getExternalConfigsObj: () => ExternalConfigs;
  setExternalConfigsObj: (configs: ExternalConfigs) => void;
  deobfuscateKey: (key: string) => string;
  obfuscateKey: (key: string) => string;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  escapeHtml: (str: string) => string;
  modelLabelOf: (modelId: string) => string;
  isImageRejection: (error: Error) => boolean;
  notifyImagesUnsupported: (modelLabel: string) => Promise<void>;
  FLASH_LITE_MODEL: string;
  AUX_FALLBACK_MODELS: string[];
  THINKING_LEVELS_BY_MODEL: Record<string, string[]>;
  THINKING_LEVEL_LABELS: Record<string, string>;
  DEFAULT_THINKING_LEVELS: Record<string, string>;
  getModelThinkingLevels: (modelId: string) => string[];
  resolveThinkingLevel: (modelId: string, level: string) => string;
  NVIDIA_DEFAULT_PROXY: string;
  COMPAT_PROVIDERS: CompatProviders;
  COMPAT_MODEL_OPTS: Record<string, ModelOptions>;
  EXPLABS_MODELS: Record<string, ExplabsModel>;
  buildReasoningPayload: (modelId: string, level: string) => ReasoningPayload;
  buildNvidiaThinking: (modelId: string, level: string) => NvidiaThinking;
  resolveCompatProvider: (modelId: string) => CompatProvider | null;
  DynamicProviders: DynamicProvidersAPI;
  JarvisSync: JarvisSyncAPI;
  GoogleGenAI: typeof import('@google/genai').GoogleGenAI;
  validateGoogleKeyFormat: (key: string) => boolean;
  initAPIKeys: () => void;
  initExternalConfigs: () => void;
  initOpenRouterKeys: () => void;
  findOpenRouterSlotIndexForKey: (key: string) => number;
  initExplabsKeys: () => void;
  findExplabsSlotIndexForKey: (key: string) => number;
  initNvidiaKeys: () => void;
  findNvidiaSlotIndexForKey: (key: string) => number;
  initCohereKeys: () => void;
  findCohereSlotIndexForKey: (key: string) => number;
  refreshSlotKeySelects: () => void;
  renderKeyPoolMenu: () => void;
  handleCheckExplabsDuplicates: () => void;
  handleCheckNvidiaDuplicates: () => void;
  handleCheckCohereDuplicates: () => void;
  handleSaveKeys: () => void;
  handleCheckKeys: () => void;
  handleCheckDuplicates: () => void;
  handleCheckOpenRouterKeys: () => void;
  handleCheckOpenRouterDuplicates: () => void;
  openShareTargetModal: () => void;
  processSharedUrl: (url: string) => void;
  handleIncomingWebShare: (event: Event) => void;
  txtContent: string;
  extractYouTubeContent: (url: string) => Promise<string>;
  extractWebPageContent: (url: string) => Promise<string>;
  updateTokenCount: () => void;
  filesData: File[];
  sessions: ChatSession[];
  activeId: string;
  getSessionApiKey: (id: string) => string | null;
  FLASH_LITE_MODEL: string;
  SAFETY: SafetySettings[];
  db: IDBDatabase;
  TTS_STORE: string;
  getNowTime24h: () => string;
  saveOrShareBlob: (blob: Blob, filename: string) => Promise<void>;
  playTTSHistoryItem: (id: string) => void;
  downloadTTSHistoryItem: (id: string, format: string) => void;
  deleteTTSHistoryItem: (id: string) => void;
  openLiveTranslateModal: () => void;
  closeLiveTranslateModal: () => void;
  __TEST_EXPORTS__: Record<string, unknown>;
  __JARVIS_DISABLE_AUTOINIT__: boolean;
  __sessionCleanupCore: SessionCleanupCore;
  lamejs: LamejsModule;
  marked: MarkedModule;
  hljs: HighlightJSModule;
  mermaid: MermaidModule;
  katex: KatexModule;
  renderMathInElement: (element: HTMLElement, options?: unknown) => void;
  PDFJS: PDFJSModule;
  html2pdf: Html2PdfModule;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  color?: string;
  modelProvider?: string;
}

interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
  parts?: unknown[];
  thinking?: string;
  timestamp?: number;
}

interface ConfigMap {
  [key: string]: unknown;
}

interface SafetySettings {
  category: string;
  threshold: string;
}

interface ExternalConfigs {
  tavily_api_key?: string;
  serper_api_key?: string;
  nvidia_proxy_url?: string;
  jarvis_global_context?: string;
  auto_search_default_engine?: string;
  web_extract_engine?: string;
  live_temperature?: number;
  live_search_enabled?: boolean;
  live_context_enabled?: boolean;
  jarvis_stall_timeout_sec?: number;
  jarvis_lite_fallback_sec?: number;
  jarvis_lite_fallback_enabled?: boolean;
  jarvis_context_messages?: number;
  jarvis_auto_cleanup?: boolean;
  jarvis_hide_deepseek_thinking?: boolean;
  [key: string]: unknown;
}

interface CompatProvider {
  id: string;
  name: string;
  baseUrl: string;
  keyStorageMultiple: string;
  models: string[];
  keyPrefix?: string;
  supportsReasoning?: boolean;
  reasoningParam?: string;
  noReasoningModels?: string[];
  modelsListPath?: string;
  fetchModels?: () => Promise<string[]>;
}

interface CompatProviders {
  nvidia?: CompatProvider;
  openrouter?: CompatProvider;
  cohere?: CompatProvider;
  explabs?: CompatProvider;
  [key: string]: CompatProvider | undefined;
}

interface ModelOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  levels?: string[];
  noReasoning?: boolean;
  inputModalities?: string[];
  outputModalities?: string[];
  reasoningEffort?: string[];
  [key: string]: unknown;
}

interface ExplabsModel {
  id: string;
  name: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsImages: boolean;
  supportsReasoning: boolean;
  [key: string]: unknown;
}

interface ReasoningPayload {
  thinking_config?: {
    thinking_budget?: number;
    include_thoughts?: boolean;
  };
  [key: string]: unknown;
}

interface NvidiaThinking {
  reasoning?: {
    effort?: string;
  };
  [key: string]: unknown;
}

interface DynamicProvidersAPI {
  init: () => Promise<void>;
  registerProvider: (provider: ProviderConfig) => Promise<void>;
  unregisterProvider: (providerId: string) => Promise<void>;
  registerModel: (model: ModelConfig) => Promise<void>;
  unregisterModel: (modelId: string, providerId: string) => Promise<void>;
  getProviders: () => ProviderConfig[];
  getModels: (providerId?: string) => ModelConfig[];
  selectModelOption: (modelId: string, providerId: string) => void;
  rebuildModelSelect: () => void;
  loadProviderIntoForm: (providerId: string) => void;
  loadModelIntoForm: (modelId: string, providerId: string) => void;
  exportConfig: () => DynamicProvidersExport;
  importConfig: (config: DynamicProvidersExport) => Promise<void>;
}

interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  keys: string[];
  keyNames: string[];
  keyUsage: number[];
  type: 'openai' | 'nvidia' | 'cohere' | 'custom';
  icon?: string;
  enabled: boolean;
}

interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  params: Record<string, unknown>;
  supportsImages: boolean;
  supportsReasoning: boolean;
  reasoningType?: 'native' | 'effort';
  enabled: boolean;
}

interface DynamicProvidersExport {
  providers: ProviderConfig[];
  models: ModelConfig[];
  settings: Record<string, unknown>;
}

interface JarvisSyncAPI {
  scheduleAutoSync: (delayMs?: number) => void;
  pushToGist: () => Promise<void>;
  pullFromGist: () => Promise<void>;
  importConfig: (config: unknown) => Promise<void>;
  exportConfig: () => unknown;
}

interface SessionCleanupCore {
  cleanup: () => Promise<number>;
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
}

interface LamejsModule {
  Mp3Encoder: new (
    channels: number,
    sampleRate: number,
    bitRate: number
  ) => {
    encodeBuffer: (samples: Int16Array) => Uint8Array[];
    flush: () => Uint8Array[];
  };
}

interface MarkedModule {
  parse: (markdown: string, options?: unknown) => Promise<string> | string;
  parseInline: (markdown: string) => string;
  setOptions: (options: unknown) => void;
}

interface HighlightJSModule {
  highlight: (
    code: string,
    options: { language: string }
  ) => { value: string; language: string; relevance: number };
  highlightAuto: (code: string) => {
    value: string;
    language: string;
    relevance: number;
    second_best?: unknown;
  };
  registerLanguage: (name: string, func: (hljs: HighlightJSModule) => unknown) => void;
  listLanguages: () => string[];
}

interface MermaidModule {
  initialize: (config: unknown) => Promise<void>;
  render: (id: string, text: string, container: HTMLElement) => Promise<void>;
  run: (options?: unknown) => Promise<void>;
}

interface KatexModule {
  render: (tex: string, element: HTMLElement, options?: unknown) => void;
  renderToString: (tex: string, options?: unknown) => string;
}

interface PDFJSModule {
  getDocument: (source: unknown) => Promise<PDFDocumentProxy>;
  GlobalWorkerOptions: { workerSrc: string };
}

interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent: () => Promise<TextContent>;
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
  };
}

interface TextContent {
  items: Array<{ str: string; transform?: number[] }>;
}

interface Html2PdfModule {
  (element: HTMLElement | string, options?: unknown): Promise<{ output: () => Blob }>;
  set: (options: unknown) => Html2PdfModule;
  from: (element: HTMLElement | string) => Html2PdfModule;
  save: (filename?: string) => Promise<void>;
  output: (type: string, options?: unknown) => Promise<Blob | string>;
}
