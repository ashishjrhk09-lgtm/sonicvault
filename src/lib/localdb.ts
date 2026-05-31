import { AppDatabase } from "../types";

const DB_KEY = "sonic_vault_db";

export const loadDb = (): AppDatabase => {
  const data = localStorage.getItem(DB_KEY);
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to parse local DB", e);
    }
  }
  return { playlists: [], songs: [] };
};

export const saveDb = (db: AppDatabase): void => {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
};
