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

// /api/llm accepts at most 4 images per request (app/api/poc/adapters/llm.py).
export const MAX_IMAGES = 4;

function unwrap(result) {
  if (!result || result.error || result.mode !== 'real') {
    const error = new Error((result && result.message) || '서버 AI를 쓸 수 없어요.');
    error.code = (result && result.error) || 'unavailable';
    throw error;
  }
  return result;
}
/**
 * Sampling adapter for one feature. Contract:
 *   sample(turns, {signal, onText, modelTier})            → Promise<string>  (the full reply text)
 *   sample.json(prompt, {signal, onText, modelTier, images, responseSchema}) → Promise<any> (parsed JSON)
 *   sample.limits()                                        → Promise<{images:{maxCount}}>
 * Failures throw an Error with .code (rate_limited · invalid_json · cancelled · unavailable · upstream_error …).
 */
function makeSample(feature) {
  const sample = async (turns, options = {}) => {
    const result = unwrap(await requestCompletion({ kind: 'text', turns, feature, model_tier: options.modelTier, stream: true }, options));
    const text = typeof result.text === 'string' ? result.text : '';
    if (options.onText) options.onText({ text });
    return text;
  };
  sample.json = async (prompt, options = {}) => {
    const body = { kind: 'json', prompt, feature, model_tier: options.images?.length ? 'vision' : options.modelTier, images: options.images, stream: true };
    if (options.responseSchema) body.response_schema = options.responseSchema;
    const result = unwrap(await requestCompletion(body, options));
    if (options.onText) options.onText({ text: JSON.stringify(result.data) });
    return result.data;
  };
  sample.limits = async () => ({ images: { maxCount: MAX_IMAGES } });
  return sample;
}
const samples = new Map();
export const getSample = async (feature = 'llm') => {
  if (!samples.has(feature)) samples.set(feature, makeSample(feature));
  return samples.get(feature);
};
