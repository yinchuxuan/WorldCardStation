const desktopPolicy = Object.freeze({
  capabilities: Object.freeze({
    cardImport: true, localDevelopment: true, diskTrace: true,
    nativeClose: true, fullscreen: true, gameplay: true
  }),
  savePolicy: 'automatic',
  cardPolicy: Object.freeze({ prepareOnActivate: false, uninstall: 'card-and-sessions' })
});

export { desktopPolicy };
