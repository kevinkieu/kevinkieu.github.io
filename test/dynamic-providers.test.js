import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function loadModule(relativePath) {
  const code = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
  eval(code);
}

// Cấu hình Kilo đúng như người dùng nhập trong Cài đặt → Provider/Model động
const KILO = {
  id: 'kilo',
  label: 'Kilo',
  type: 'openai_compat',
  baseUrl: 'https://ai-gateway.kilo.ai/api/v1',
  keyCount: 2,
  keyPrefix: 'jarvis_provider_kilo_api',
  keyNamePrefix: 'jarvis_provider_kilo_api_name',
};
const MODEL_ID = 'inclusionai/ling-3.2-flash:free';

function addKilo() {
  window.DynamicProviders.addProvider(KILO);
  window.DynamicProviders.addModel({
    id: MODEL_ID,
    provider: 'kilo',
    label: 'Ling 3.2 Flash (Free)',
    contextWindow: 262144,
    maxTokens: 65536,
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    inputModalities: ['text', 'image'],
  });
  window.DynamicProviders.writeProviderKey('kilo', 1, 'kilo-key-1', 'Kilo #1');
  window.DynamicProviders.writeProviderKey('kilo', 2, 'kilo-key-2', 'Kilo #2');
  return window.DynamicProviders.init();
}

describe('dynamic-providers.js — provider/model động (Kilo)', () => {
  beforeEach(() => {
    localStorage.clear();
    loadModule('js/model-registry.js');
    loadModule('js/dynamic-providers.js');
  });

  it('đăng ký provider Kilo vào runtime registry và tự đi qua proxy CORS khi base URL trỏ thẳng gateway', () => {
    const registry = addKilo();
    const kilo = registry.compatProviders.kilo;
    expect(kilo).toBeTruthy();
    expect(kilo.label).toBe('Kilo');
    // Base URL lưu nguyên như người dùng nhập...
    expect(kilo.baseUrl).toBe('https://ai-gateway.kilo.ai/api/v1');
    // ...nhưng lúc gọi request phải đổi sang proxy: ai-gateway.kilo.ai không trả CORS
    // nên gọi thẳng từ WebView/trình duyệt luôn "Failed to fetch".
    expect(kilo.getBaseUrl()).toBe(
      'https://jarvis-nvidia-proxy-9klgal-preview.freebuff.site/kilo/v1'
    );
    expect(kilo.models).toContain(MODEL_ID);
    expect(window.COMPAT_PROVIDERS.kilo).toBeTruthy();
    expect(window.COMPAT_MODEL_OPTS[MODEL_ID]).toMatchObject({
      maxTokens: 65536,
      contextWindow: 262144,
      temperature: 0.7,
    });
  });

  it('resolveCompatProvider tìm ra model Kilo và nhãn hiển thị đúng', () => {
    addKilo();
    const resolved = window.resolveCompatProvider(MODEL_ID);
    expect(resolved).toBeTruthy();
    expect(resolved.provider.id).toBe('kilo');
    expect(resolved.provider.modelLabel(MODEL_ID)).toBe('Ling 3.2 Flash (Free)');
    expect(window.resolveCompatProvider('không-tồn-tại')).toBeNull();
  });

  it('bể key của provider động đọc đúng ô và obfuscate khi xuất backup', () => {
    addKilo();
    expect(window.DynamicProviders.getProviderKeysList('kilo')).toEqual([
      'kilo-key-1',
      'kilo-key-2',
    ]);
    expect(window.DynamicProviders.getProviderKeyNamesList('kilo')).toEqual(['Kilo #1', 'Kilo #2']);
    expect(window.DynamicProviders.getProviderKeyCount('kilo')).toBe(2);

    window.obfuscateKey = k => 'JVENC_' + k;
    const exported = window.DynamicProviders.exportConfig(true);
    expect(exported.providers.kilo.keys).toEqual(['JVENC_kilo-key-1', 'JVENC_kilo-key-2']);
    expect(exported.models['kilo/' + MODEL_ID]).toMatchObject({ provider: 'kilo' });
  });

  it('model ID trùng trong cùng provider bị từ chối, provider lạ bị từ chối', () => {
    addKilo();
    expect(() => window.DynamicProviders.addModel({ id: MODEL_ID, provider: 'kilo' })).toThrow(
      /đã tồn tại/
    );
    expect(() => window.DynamicProviders.addModel({ id: 'x/y', provider: 'khong-co' })).toThrow(
      /Provider không tồn tại/
    );
  });

  it('xoá provider Kilo kéo theo model của nó, không đụng provider khác', () => {
    addKilo();
    expect(window.DynamicProviders.deleteProvider('kilo')).toBe(true);
    expect(window.DynamicProviders.getProvider('kilo')).toBeNull();
    expect(window.DynamicProviders.findModelById(MODEL_ID)).toBeNull();
    expect(window.DynamicProviders.getProvider('google')).toBeTruthy();
    expect(window.DynamicProviders.getProvider('explabs')).toBeTruthy();
    expect(window.DynamicProviders.deleteProvider('khong-co')).toBe(false);
  });

  // --- TESTS CHO CHUẨN HOÁ MODEL ID (NORMALIZATION) ---
  describe('chuẩn hoá model id trong getModels()', () => {
    const MODELS_KEY = 'jarvis_dynamic_models';

    beforeEach(() => {
      localStorage.clear();
      loadModule('js/model-registry.js');
      loadModule('js/dynamic-providers.js');
      // KHÔNG gọi init() ở đây - test tự kiểm soát localStorage
    });

    it('dữ liệu cũ: key là model id, record thiếu id + có provider -> chuẩn hoá thành composite key + có id', () => {
      // Mô phỏng dữ liệu localStorage cũ: key = 'nvidia/nemotron-3.5-bolt-e4b', record không có id
      const oldKey = 'nvidia/nemotron-3.5-bolt-e4b';
      const oldModel = {
        provider: 'nvidia',
        label: 'Nemotron 3.5 Bolt E4B',
        maxTokens: 65536,
        contextWindow: 1000000,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        inputModalities: ['text'],
        noReasoning: true,
        // KHÔNG có trường id
      };
      localStorage.setItem(MODELS_KEY, JSON.stringify({ [oldKey]: oldModel }));

      // Gọi getModels() -> phải tự chuẩn hoá
      const models = window.DynamicProviders.getModels();

      // Key mới phải là composite key 'nvidia/nvidia/nemotron-3.5-bolt-e4b'
      const newKey = 'nvidia/nvidia/nemotron-3.5-bolt-e4b';
      expect(models[newKey]).toBeTruthy();
      expect(models[newKey].id).toBe(oldKey); // id = model id gốc
      expect(models[newKey].provider).toBe('nvidia');
      expect(models[oldKey]).toBeUndefined(); // key cũ không còn tồn tại

      // localStorage phải được ghi lại dữ liệu đã chuẩn hoá
      const stored = JSON.parse(localStorage.getItem(MODELS_KEY));
      expect(stored[newKey]).toBeTruthy();
      expect(stored[newKey].id).toBe(oldKey);
    });

    it('dữ liệu cũ không có provider -> giữ nguyên key, không bị mất', () => {
      const key = 'some-random-model';
      const model = { label: 'Random Model', maxTokens: 1000 }; // không có provider, không có id
      localStorage.setItem(MODELS_KEY, JSON.stringify({ [key]: model }));

      const models = window.DynamicProviders.getModels();
      expect(models[key]).toBeTruthy();
      expect(models[key].id).toBe(key); // id = key gốc
      expect(models[key].label).toBe('Random Model');
    });

    it('dữ liệu đã chuẩn hoá (có id + composite key) -> không bị sửa đổi', () => {
      const compositeKey = 'nvidia/nvidia/nemotron-3.5-bolt-e4b';
      const normalizedModel = {
        id: 'nvidia/nemotron-3.5-bolt-e4b',
        provider: 'nvidia',
        label: 'Nemotron 3.5 Bolt E4B',
        maxTokens: 65536,
        contextWindow: 1000000,
      };
      localStorage.setItem(MODELS_KEY, JSON.stringify({ [compositeKey]: normalizedModel }));

      const models = window.DynamicProviders.getModels();
      expect(models[compositeKey]).toBeTruthy();
      expect(models[compositeKey].id).toBe('nvidia/nemotron-3.5-bolt-e4b');
      expect(models[compositeKey].label).toBe('Nemotron 3.5 Bolt E4B');

      // Gọi lần 2 -> không thay đổi (idempotent)
      const models2 = window.DynamicProviders.getModels();
      expect(models2).toEqual(models);
    });

    it('DEFAULT_MODELS seed khi localStorage rỗng -> tạo composite key + id đúng', () => {
      // localStorage rỗng, init() sẽ seed DEFAULT_MODELS
      window.DynamicProviders.init();
      const models = window.DynamicProviders.getModels();

      // Kiểm tra một model NVIDIA từ DEFAULT_MODELS
      const modelId = 'nvidia/nemotron-3.5-bolt-e4b';
      const compositeKey = 'nvidia/nvidia/nemotron-3.5-bolt-e4b';
      expect(models[compositeKey]).toBeTruthy();
      expect(models[compositeKey].id).toBe(modelId);
      expect(models[compositeKey].provider).toBe('nvidia');
      expect(models[compositeKey].label).toBe('Nemotron 3.5 Bolt E4B');

      // Không được có key cũ (modelId đơn lẻ)
      expect(models[modelId]).toBeUndefined();
    });

    it('findModelById tìm thấy model qua id user-facing sau khi chuẩn hoá', () => {
      const oldKey = 'nvidia/nemotron-3.5-bolt-e4b';
      localStorage.setItem(
        MODELS_KEY,
        JSON.stringify({
          [oldKey]: { provider: 'nvidia', label: 'Test', maxTokens: 1000 },
        })
      );

      window.DynamicProviders.getModels(); // trigger normalize
      const found = window.DynamicProviders.findModelById(oldKey);
      expect(found).toBeTruthy();
      expect(found.model.id).toBe(oldKey);
      expect(found.key).toBe('nvidia/nvidia/nemotron-3.5-bolt-e4b');
    });

    it('buildRuntimeRegistry không còn trả providerModelIds null/undefined', () => {
      // Migrate static providers (NVIDIA/OpenRouter/Cohere) trước khi init
      window.DynamicProviders.migrateFromStatic();
      const registry = window.DynamicProviders.init();
      const nvidia = registry.compatProviders.nvidia;
      expect(nvidia).toBeTruthy();
      expect(nvidia.models).toBeInstanceOf(Array);
      expect(nvidia.models.length).toBeGreaterThan(0);
      // Mọi model id phải là string không rỗng
      nvidia.models.forEach(mid => {
        expect(typeof mid).toBe('string');
        expect(mid.length).toBeGreaterThan(0);
        expect(mid).not.toBe('undefined');
      });
      // COMPAT_MODEL_OPTS keyed by model id user-facing
      expect(window.COMPAT_MODEL_OPTS['nvidia/nemotron-3.5-bolt-e4b']).toBeTruthy();
    });
  });
});
