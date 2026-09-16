// src/utils/storage.ts
export const getStorageKey = (sessionId: string, entity: string): string => {
  return `epic_${sessionId}_${entity}`;
};