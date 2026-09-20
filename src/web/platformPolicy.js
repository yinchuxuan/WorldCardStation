// These are currently implemented capabilities, not the final Web feature list.
const webPolicy = Object.freeze({
  capabilities: Object.freeze({
    cardImport: false, localDevelopment: false, diskTrace: false,
    nativeClose: false, fullscreen: false, gameplay: false
  }),
  savePolicy: 'manual'
});

export { webPolicy };
