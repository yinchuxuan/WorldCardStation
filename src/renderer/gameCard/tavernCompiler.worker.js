import { convertTavernCard } from '../../shared/tavern-import/convert.js';

self.onmessage = ({ data }) => {
  try { self.postMessage({ result: convertTavernCard(data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
