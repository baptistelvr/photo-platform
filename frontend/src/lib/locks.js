/** Error codes of the API that call for a password, and which one. */
export const LOCK_CODES = {
  ALBUM_PASSWORD_REQUIRED: { kind: 'album', invalid: false },
  INVALID_ALBUM_PASSWORD: { kind: 'album', invalid: true },
  COLLECTION_PASSWORD_REQUIRED: { kind: 'collection', invalid: false },
  INVALID_COLLECTION_PASSWORD: { kind: 'collection', invalid: true },
};
