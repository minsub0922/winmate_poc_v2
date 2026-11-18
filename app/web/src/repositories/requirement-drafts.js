// The requirements editor keeps unsaved input per proposal for the lifetime of this tab.
// History creation reads the same draft before deciding whether a proposal is empty.
const drafts = new Map();
export const readRequirementDraft = id => drafts.get(id);
export const keepRequirementDraft = (id, draft) => drafts.set(id, draft);
export const discardRequirementDraft = id => drafts.delete(id);
