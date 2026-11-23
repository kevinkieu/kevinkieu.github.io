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

  it('đăng ký provider Kilo vào runtime registry với base URL đã nhập', () => {
    const registry = addKilo();
    const kilo = registry.compatProviders.kilo;
    expect(kilo).toBeTruthy();
    expect(kilo.label).toBe('Kilo');
    expect(kilo.baseUrl).toBe('https://ai-gateway.kilo.ai/api/v1');
    expect(kilo.getBaseUrl()).toBe('https://ai-gateway.kilo.ai/api/v1');
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
    expect(window.DynamicProviders.getProviderKeysList('kilo')).toEqual(['kilo-key-1', 'kilo-key-2']);
    expect(window.DynamicProviders.getProviderKeyNamesList('kilo')).toEqual(['Kilo #1', 'Kilo #2']);
    expect(window.DynamicProviders.getProviderKeyCount('kilo')).toBe(2);

    window.obfuscateKey = (k) => 'JVENC_' + k;
    const exported = window.DynamicProviders.exportConfig(true);
    expect(exported.providers.kilo.keys).toEqual(['JVENC_kilo-key-1', 'JVENC_kilo-key-2']);
    expect(exported.models['kilo/' + MODEL_ID]).toMatchObject({ provider: 'kilo' });
  });

  it('model ID trùng trong cùng provider bị từ chối, provider lạ bị từ chối', () => {
    addKilo();
    expect(() => window.DynamicProviders.addModel({ id: MODEL_ID, provider: 'kilo' }))
      .toThrow(/đã tồn tại/);
    expect(() => window.DynamicProviders.addModel({ id: 'x/y', provider: 'khong-co' }))
      .toThrow(/Provider không tồn tại/);
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
});
