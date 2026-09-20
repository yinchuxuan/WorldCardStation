const desktopPolicy = Object.freeze({
  capabilities: Object.freeze({
    cardImport: true, localDevelopment: true, diskTrace: true,
    nativeClose: true, fullscreen: true, gameplay: true
  }),
  savePolicy: 'automatic'
});

// These are currently implemented capabilities, not the final Web feature list.
const webPolicy = Object.freeze({
  capabilities: Object.freeze({
    cardImport: false, localDevelopment: false, diskTrace: false,
    nativeClose: false, fullscreen: false, gameplay: false
  }),
  savePolicy: 'manual'
});

export { desktopPolicy, webPolicy };
