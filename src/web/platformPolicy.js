// These are currently implemented capabilities, not the final Web feature list.
const webPolicy = Object.freeze({
  capabilities: Object.freeze({
    cardImport: false, localDevelopment: false, diskTrace: false,
    nativeClose: false, fullscreen: true, gameplay: true
  }),
  savePolicy: 'manual'
});

export { webPolicy };
