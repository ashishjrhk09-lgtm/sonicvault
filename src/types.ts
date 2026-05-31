export interface Song {
  id: string;
  title: string;
  youtubeUrl: string; // For YouTube links
  thumbnailUrl: string; // For external thumbnails like YouTube
  playlistId: string;
}

export interface Playlist {
  id: string;
  name: string;
}

export interface HistoryEntry {
  id: string;
  playedAt: number;
  song: Song;
}

export interface AppDatabase {
  playlists: Playlist[];
  songs: Song[];
  history?: HistoryEntry[];
}
