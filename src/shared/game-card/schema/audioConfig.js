function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const EMPTY_BGM = 'none';

function getAudioStateSchema(card) {
  const bgm = card?.audio?.bgm;
  if (!isObject(bgm)) return {};
  const values = Object.keys(bgm);
  if (values.length === 0) return {};
  return {
    'audio.bgm': {
      type: 'enum',
      values: [EMPTY_BGM, ...values],
      default: values[0],
      description: '当前播放的 BGM key',
      llmRead: false,
      llmWrite: false
    }
  };
}

export { getAudioStateSchema };
