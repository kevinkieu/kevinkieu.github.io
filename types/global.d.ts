// Global type declarations for Jarvis AI.
//
// Lưu ý: đây là codebase JS "classic script" (mọi thứ gắn lên window và đọc
// chéo giữa các file). checkJs vẫn bật để bắt lỗi cú pháp, tên không tồn tại,
// gọi hàm sai tham số; các helper động của app được khai báo `any` có chủ ý.

interface Window {
  [key: string]: any;
}

interface ChatSession {
  id: string;
  name?: string;
  his?: ChatMessage[];
  [key: string]: any;
}

interface ChatMessage {
  role?: string;
  text?: string;
  time?: string;
  id?: string;
  [key: string]: any;
}

// --- DOM interop cho code legacy ---
// App dùng document.getElementById()/querySelector() xen lẫn truy cập .value,
// .checked, .dataset... trên nhiều loại element.
interface Element {
  [key: string]: any;
}
interface HTMLElement {
  [key: string]: any;
}
interface EventTarget {
  [key: string]: any;
}

// --- Bổ sung API trình duyệt mà lib.dom chưa khai báo ---
interface Permissions {
  request?: (descriptor: any) => Promise<any>;
}
interface Navigator {
  standalone?: boolean;
  userAgentData?: { platform?: string };
}

// --- AudioWorklet (worker scope) ---
declare class AudioWorkletProcessor {
  constructor();
  readonly port: MessagePort;
  process(inputs: any, outputs?: any, parameters?: any): boolean;
}
declare const sampleRate: number;
declare function registerProcessor(name: string, processorCtor: any): void;
