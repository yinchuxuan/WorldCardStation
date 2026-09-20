/** @typedef {Record<string, unknown>} JsonObject */
/** @typedef {JsonObject & {id?: string}} GameCard */
/** @typedef {'automatic'|'manual'} SavePolicy */
/**
 * @typedef {Object} PlatformCapabilities
 * @property {boolean} cardImport
 * @property {boolean} localDevelopment
 * @property {boolean} diskTrace
 * @property {boolean} nativeClose
 * @property {boolean} fullscreen
 * @property {boolean} gameplay
 */

/**
 * @typedef {Object} GameCardResources
 * @property {(cardId: string, relativePath: string) => Promise<string>} readText
 * @property {(cardId: string, relativePath: string) => Promise<string>} getImageUrl
 * @property {(cardId: string, relativePath: string) => Promise<string>} getAudioUrl
 */

/** @typedef {{getActiveCard: () => Promise<GameCard|null>}} GameCardRepository */
/** @typedef {{run: (source: string, context: JsonObject, options?: JsonObject) => unknown}} ScriptExecutor */
/** @typedef {{resources: GameCardResources, repository: GameCardRepository, scriptExecutor: ScriptExecutor}} GameCardPlatform */
/** @typedef {GameCardPlatform} GameCardPlatformOptions */

/** @typedef {{load: () => Promise<JsonObject>, save: (value: JsonObject) => Promise<JsonObject>}} ConfigService */
/** @typedef {{getInstructions: () => Promise<string>}} DevelopmentService */
/** @typedef {{start: (scope: JsonObject, snapshot: JsonObject) => Promise<JsonObject>, append: (token: string, records: JsonObject[]) => Promise<void>, close: (token: string) => Promise<void>}} TraceService */
/**
 * @typedef {Object} BackgroundService
 * @property {() => Promise<JsonObject>} load
 * @property {(value: JsonObject) => Promise<JsonObject>} save
 * @property {() => Promise<string>} selectImage
 * @property {(listener: (value: JsonObject) => void) => (() => void)} subscribe
 */
/** @typedef {Record<string, (...args: any[]) => Promise<any>>} SessionRepository */
/**
 * @typedef {Object} CardRepository
 * @property {() => Promise<GameCard[]>} list
 * @property {(id: string|null) => Promise<unknown>} setActive
 * @property {(id: string) => Promise<unknown>} uninstall
 * @property {(options?: {tavernOnly?: boolean}) => Promise<GameCard|JsonObject|null>} importFile Native card or prepared Tavern task; tavernOnly rejects native cards without installation.
 * @property {(token: string, plan: JsonObject, targetId?: string|null) => Promise<JsonObject>} stageTavernImport
 * @property {(token: string, revision: string) => Promise<GameCard>} commitTavernImport
 * @property {(token: string) => Promise<unknown>} cancelTavernImport
 */
/**
 * @typedef {Object} WindowService
 * @property {() => Promise<void>} destroy
 * @property {() => Promise<boolean>} isFullscreen
 * @property {(handler: Function) => (() => void)} onCloseRequested
 * @property {(value: boolean) => Promise<void>} setFullscreen
 */
/**
 * @typedef {Object} RendererServices
 * @property {TraceService} trace
 * @property {DevelopmentService} development
 * @property {ConfigService} config
 * @property {BackgroundService} background
 * @property {SessionRepository} sessions
 * @property {CardRepository} cards
 * @property {WindowService} window
 */

export {};
