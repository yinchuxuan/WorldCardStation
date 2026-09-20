import { createTauriGameCardPlatform } from './tauriGameCardPlatform.js';
import { createTauriRendererServices } from './tauriRendererServices.js';
import { createTauriModelFetch } from './tauriModelFetch.js';
import { desktopPolicy } from './platformPolicy.js';

const gameCardPlatform = createTauriGameCardPlatform();
const rendererServices = createTauriRendererServices();
const modelFetch = createTauriModelFetch();
const { capabilities, savePolicy } = desktopPolicy;

export { gameCardPlatform, rendererServices, modelFetch, capabilities, savePolicy };
