import { parseGIF, decompressFrames } from 'gifuct-js';

self.onmessage = ({ data }) => {
  try {
    const gif = parseGIF(data);
    const frames = decompressFrames(gif, true).map(({ dims, delay, disposalType, patch }) => ({ dims, delay: Math.max(20, delay || 100), disposalType, patch }));
    self.postMessage({ width: gif.lsd.width, height: gif.lsd.height, frames }, frames.map(frame => frame.patch.buffer));
  } catch (error) {
    console.error('Guide GIF decode failed', error);
    self.postMessage({ error: 'GIF 화면을 읽지 못했어요.' });
  }
};
