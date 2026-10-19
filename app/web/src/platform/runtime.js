import { requestCompletion } from '../api/client.js';

export async function downloadBlob({ filename, data }) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const downloads = { save: downloadBlob };
export const getDownloads = async () => downloads;
export const copyText = text => navigator.clipboard.writeText(text);

function unwrap(result) {
  if (result.error || result.mode === 'dummy') {
    const error = new Error(result.message || 'AI 더미 모드: 기존 기본 규칙으로 처리합니다.');
    error.code = result.error || 'sampling_disabled';
    throw error;
  }
  return result;
}
function makeSample(feature) {
const sample = async (turns, options = {}) => {
  const result = unwrap(await requestCompletion({ kind: 'text', turns, feature, model_tier: options.modelTier, stream: true }, options));
  if (options.onText) options.onText({ text: result.text });
  return result.text;
};
sample.json = async (prompt, options = {}) => {
  const result = unwrap(await requestCompletion({ kind: 'json', prompt, feature, model_tier: options.modelTier, images: options.images, stream: true }, options));
  if (options.onText) options.onText({ text: JSON.stringify(result.data) });
  return result.data;
};
sample.limits = async () => ({ images: null });
return sample;
}
const samples = new Map();
export const getSample = async (feature = 'llm') => {
  if (!samples.has(feature)) samples.set(feature, makeSample(feature));
  return samples.get(feature);
};
