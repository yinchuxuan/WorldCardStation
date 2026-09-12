import { ensureStateDefaults } from '../../shared/game-card/state/stateSchema.js';
import { migrateLegacyPortraitState } from '../../shared/game-card/schema/visualConfig.js';

function prepareState(card, state) {
  const schema = card?.state?.schema;
  if (!schema) return { state, trace: { changed: false, changedKeys: [], errors: [] } };
  const migrated = migrateLegacyPortraitState(card, state);
  const result = ensureStateDefaults(schema, migrated.state);
  const changedKeys = [...(migrated.changed ? ['visual.portraits'] : []), ...result.changedKeys];
  return {
    state: result.state,
    trace: { changed: migrated.changed || result.changed, changedKeys: [...new Set(changedKeys)], errors: result.errors }
  };
}

export { prepareState };
