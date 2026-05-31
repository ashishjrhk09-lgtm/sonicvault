import React, { useEffect, useState } from "react";
import { loadDb, saveDb } from "./lib/localdb";
import { AppDatabase, Playlist, Song } from "./types";
import {
  Music,
  Play,
  Plus,
  Search,
  Upload,
  Disc3,
  Home,
  ListMusic,
  Trash2,
  Video,
  Loader2,
} from "lucide-react";
import { AudioPlayer } from "./components/AudioPlayer";
import customLogo from "./assets/images/sonic_vault_logo_1780216990059.png";

const getYoutubeId = (url: string) => {
  const regex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
};

export default function App() {
  const [db, setDb] = useState<AppDatabase>({ playlists: [], songs: [] });
  const [isLoading, setIsLoading] = useState(true);

  // UI State
  const [activeTab, setActiveTab] = useState<"home" | "playlists" | "history">(
    "home",
  );
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string | null>(
    null,
  );
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [showAddSong, setShowAddSong] = useState(false);
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [ytSearchQuery, setYtSearchQuery] = useState("");
  const [ytSearchResults, setYtSearchResults] = useState<any[]>([]);
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [selectedYtPlaylistId, setSelectedYtPlaylistId] = useState<string>("");

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  const handleYoutubeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytSearchQuery.trim()) return;
    setIsSearchingYt(true);
    setYtSearchResults([]);
    try {
      const BASE_URL = import.meta.env.VITE_API_URL || "";
      const res = await fetch(
        `${BASE_URL}/api/youtube/search?q=${encodeURIComponent(ytSearchQuery)}`,
      );
      
      const text = await res.text();
      let data;
      try {
         data = JSON.parse(text);
      } catch (err) {
         console.error("API response was not JSON:", text.substring(0, 50));
         throw new Error("Server returned an invalid response (not JSON). Ensure your API server is running.");
      }
      
      if (!res.ok) throw new Error(data.error);
      setYtSearchResults(data.items || []);
    } catch (e: any) {
      showToast("YouTube search failed: " + e.message);
    } finally {
      setIsSearchingYt(false);
    }
  };

  const setDirectAddSong = (videoId: string, title: string) => {
    if (!selectedYtPlaylistId) {
      showToast("Please select a playlist first.");
      return;
    }
    const newSong: Song = {
      id: crypto.randomUUID(),
      title,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      playlistId: selectedYtPlaylistId,
    };
    const newDb = { ...db, songs: [...db.songs, newSong] };
    setDb(newDb);
    setShowAddSong(false);
    showToast("Song added!");
    saveDb(newDb);
  };

  const playSong = (song: Song) => {
    setCurrentSong(song);
    const newHistoryEntry = {
      id: crypto.randomUUID(),
      playedAt: Date.now(),
      song,
    };
    const currentHistory = db.history || [];
    // Remove if song already exists in history
    const filteredHistory = currentHistory.filter((h) => {
      // Check youtubeUrl to match same song even if it was added from different places
      return h.song.youtubeUrl !== song.youtubeUrl;
    });

    const newDb = {
      ...db,
      history: [newHistoryEntry, ...filteredHistory].slice(0, 100),
    };
    setDb(newDb);
    saveDb(newDb);
  };

  const setLivePlaySong = (videoId: string, title: string) => {
    const song: Song = {
      id: crypto.randomUUID(),
      title,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      playlistId: "", // Not added to a playlist yet
    };
    setShowAddSong(false); // maybe optional
    playSong(song);
  };

  useEffect(() => {
    const loadedDb = loadDb();
    setDb(loadedDb);
    if (loadedDb.playlists.length > 0) {
      setSelectedYtPlaylistId(loadedDb.playlists[0].id);
    }
    setIsLoading(false);
  }, []);

  const handleCreatePlaylist = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    if (!name) return;

    const newPlaylist: Playlist = {
      id: crypto.randomUUID(),
      name,
    };

    const newDb = { ...db, playlists: [...db.playlists, newPlaylist] };
    setDb(newDb);
    setShowAddPlaylist(false);
    showToast(`Playlist "${name}" created.`);
    saveDb(newDb);
  };

  const handleAddSong = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isAddingSong) return;
    setIsAddingSong(true);

    const formData = new FormData(e.currentTarget);
    const playlistId = formData.get("playlistId") as string;
    const youtubeUrl = formData.get("youtubeUrl") as string;

    try {
      const videoId = getYoutubeId(youtubeUrl);
      if (!videoId) {
        throw new Error("Invalid youtube URL");
      }

      // Fetch video title from youtube API
      let finalTitle = "Direct URL Added Video";
      try {
        const BASE_URL = import.meta.env.VITE_API_URL || "";
        const res = await fetch(`${BASE_URL}/api/youtube/video?id=${videoId}`);
        if (res.ok) {
          const text = await res.text();
          try {
             const data = JSON.parse(text);
             if (data.snippet && data.snippet.title) {
               finalTitle = data.snippet.title;
             }
          } catch (err) {
             console.warn("Invalid data received", text.substring(0, 50));
          }
        }
      } catch (err) {
        console.warn("Could not fetch video details", err);
      }

      const newSong: Song = {
        id: crypto.randomUUID(),
        title: finalTitle,
        youtubeUrl,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        playlistId,
      };

      const newDb = { ...db, songs: [...db.songs, newSong] };
      setDb(newDb);
      setShowAddSong(false);
      showToast("YouTube video added!");
      saveDb(newDb);
    } catch (e) {
      console.error("Failed to add song", e);
      showToast("Failed to add video. Check your YouTube URL.");
    } finally {
      setIsAddingSong(false);
    }
  };

  const deleteSong = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({
      message: "Are you sure you want to delete this video?",
      onConfirm: () => {
        const newDb = { ...db, songs: db.songs.filter((s) => s.id !== id) };
        setDb(newDb);
        saveDb(newDb);
        if (currentSong?.id === id) setCurrentSong(null);
        showToast("Video deleted.");
        setConfirmDialog(null);
      },
    });
  };

  const deletePlaylist = (id: string) => {
    setConfirmDialog({
      message:
        "Are you sure you want to delete this playlist and all its videos?",
      onConfirm: () => {
        const newDb = {
          ...db,
          playlists: db.playlists.filter((p) => p.id !== id),
          songs: db.songs.filter((s) => s.playlistId !== id),
        };
        setDb(newDb);
        if (currentPlaylistId === id) {
          setCurrentPlaylistId(null);
          setActiveTab("home");
        }
        saveDb(newDb);
        showToast("Playlist deleted.");
        setConfirmDialog(null);
      },
    });
  };

  const getFilteredSongs = () => {
    let s = db.songs;
    if (searchQuery) {
      s = s.filter((song) =>
        song.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    return s;
  };

  const allFilteredSongs = getFilteredSongs();

  const groupedSongs = db.playlists
    .map((playlist) => {
      return {
        playlist,
        songs: allFilteredSongs.filter((s) => s.playlistId === playlist.id),
      };
    })
    .filter((group) => group.songs.length > 0);

  const uncategorizedSongs = allFilteredSongs.filter(
    (s) => !db.playlists.find((p) => p.id === s.playlistId),
  );

  const PlayingAnimation = () => (
    <div className="flex items-end gap-1 w-4 h-4 mr-1">
      <div className="w-1 bg-purple-500 animate-equalize-1 rounded-t-sm" />
      <div className="w-1 bg-purple-500 animate-equalize-2 rounded-t-sm" />
      <div className="w-1 bg-purple-500 animate-equalize-3 rounded-t-sm" />
    </div>
  );

  const renderSongItem = (song: Song) => {
    const isPlaying = currentSong?.id === song.id;
    return (
      <div
        key={song.id}
        className={`group flex items-center justify-between p-3 rounded-2xl transition-all mb-2 cursor-pointer
        ${
          isPlaying
            ? "bg-purple-500/10 border border-purple-500/30"
            : "bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800"
        }`}
        onClick={() => playSong(song)}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-20 h-12 flex-shrink-0 bg-neutral-800 rounded-xl flex items-center justify-center text-white relative overflow-hidden shadow-sm">
            <img
              src={song.thumbnailUrl}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
                isPlaying ? "opacity-30" : "opacity-100 group-hover:opacity-70"
              }`}
              alt="thumbnail"
            />
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Play className="w-5 h-5 ml-1 drop-shadow-md" />
              </div>
            )}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <PlayingAnimation />
              </div>
            )}
          </div>
          <div className="min-w-0 pr-4">
            <p
              className={`font-semibold truncate text-sm sm:text-base ${
                isPlaying ? "text-purple-400" : "text-neutral-100"
              }`}
            >
              {song.title}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5 tracking-wider font-mono flex items-center gap-1">
              <Music className="w-3 h-3" /> YOUTUBE
            </p>
          </div>
        </div>

        <button
          onClick={(e) => deleteSong(song.id, e)}
          className="opacity-0 group-hover:opacity-100 p-2.5 text-neutral-500 hover:text-red-400 transition-all rounded-full hover:bg-neutral-950"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white font-sans">
        <div className="flex flex-col items-center gap-4">
          <Disc3 className="w-12 h-12 animate-spin text-purple-500" />
          <p className="font-mono text-sm tracking-widest text-neutral-400">
            LOADING LIBRARY
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-black text-white font-sans overflow-hidden overscroll-none">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-6 py-3 rounded-full shadow-2xl z-[80] animate-in slide-in-from-top-4 font-medium text-sm border border-neutral-700 whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center">
            <h3 className="text-xl font-bold text-white mb-2">
              Confirm Action
            </h3>
            <p className="text-neutral-400 text-sm mb-6">
              {confirmDialog.message}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-5 py-2.5 rounded-xl font-semibold text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-5 py-2.5 rounded-xl font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Scrollable Area */}
      <div
        className={`flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-40 ${
          currentSong ? "pb-48" : "pb-24"
        }`}
      >
        {/* Header / Brand */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg overflow-hidden border border-purple-500">
              <img
                src={customLogo}
                alt="SV"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.parentElement
                    ?.querySelector("svg")
                    ?.setAttribute("style", "display: block");
                }}
                className="w-full h-full object-cover"
              />
              <Music className="w-6 h-6 text-white hidden" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Sonic Vault</h1>
          </div>
        </div>

        {/* Tab Content: Home */}
        {activeTab === "home" && (
          <div className="animate-in fade-in duration-300 max-w-4xl mx-auto">
            {/* Search */}
            <form onSubmit={handleYoutubeSearch} className="relative mb-6 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search vault or YouTube..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setYtSearchQuery(e.target.value);
                  }}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isSearchingYt || !searchQuery}
                className="bg-purple-500 text-white flex-shrink-0 w-12 h-[50px] md:w-auto md:h-auto md:py-3 px-0 md:px-6 rounded-2xl font-bold hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center transition-all shadow-lg"
              >
                {isSearchingYt ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                     <Search className="w-5 h-5 block md:hidden" />
                     <span className="hidden md:inline">Search</span>
                  </>
                )}
              </button>
            </form>

            {/* Playlists Horizontal Scroll on Home */}
            {db.playlists.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-neutral-400 tracking-widest uppercase mb-4 px-1">
                  Your Playlists
                </h2>
                <div className="flex overflow-x-auto gap-4 pb-4 snap-x hide-scrollbar">
                  {db.playlists.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                         setCurrentPlaylistId(p.id);
                         setActiveTab("home");
                      }}
                       className="flex-shrink-0 snap-start bg-neutral-900 border border-neutral-800 rounded-2xl p-4 w-40 text-left hover:bg-neutral-800 hover:border-neutral-700 transition-all flex flex-col items-start gap-3 group"
                    >
                      <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                        <ListMusic className="w-5 h-5 text-neutral-400 group-hover:text-purple-400 transition-colors" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm line-clamp-1">{p.name}</h3>
                        <p className="text-xs text-neutral-500 font-mono mt-1">
                          {db.songs.filter(s => s.playlistId === p.id).length} songs
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-8">
              {ytSearchResults.length > 0 && (
                <div>
                  <h2 className="text-lg font-bold text-white tracking-widest uppercase flex items-center gap-2 mb-3 px-1">
                    YouTube Results
                  </h2>
                  <div className="grid gap-3 object-cover">
                    {ytSearchResults.map((video) => (
                      <div
                        key={video.id.videoId}
                        className="flex gap-4 p-3 bg-neutral-900 rounded-2xl border border-neutral-800 hover:border-purple-500/30 cursor-pointer transition-colors group"
                      >
                        <div className="w-24 h-16 rounded-xl overflow-hidden relative flex-shrink-0" onClick={() => setLivePlaySong(video.id.videoId, video.snippet.title)}>
                          <img
                            src={video.snippet.thumbnails.default.url}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            alt="thumbnail"
                          />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-6 h-6 text-white ml-1" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center" onClick={() => setLivePlaySong(video.id.videoId, video.snippet.title)}>
                          <p
                            className="text-sm font-semibold text-white line-clamp-2 leading-tight"
                            dangerouslySetInnerHTML={{ __html: video.snippet.title }}
                          ></p>
                          <p className="text-xs text-neutral-400 mt-1 truncate">
                            {video.snippet.channelTitle}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Keep other content rendering below */}
              {db.songs.length === 0 ? (
                <div className="text-center py-20 bg-neutral-950 border border-neutral-900 rounded-3xl mt-4">
                  <div className="p-4 bg-neutral-900 rounded-full inline-block mb-4 shadow-inner">
                    <Upload className="w-8 h-8 text-neutral-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">
                    Vault is Empty
                  </h2>
                  <p className="text-neutral-500 max-w-sm mx-auto mb-6">
                    Add your first YouTube video link to start your collection.
                  </p>
                </div>
              ) : allFilteredSongs.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">
                  <p>No songs found matching "{searchQuery}"</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-neutral-400 mb-3 px-1 tracking-widest uppercase flex items-center gap-2">
                    <Disc3 className="w-5 h-5" /> Vault Songs
                  </h2>
                  <div>
                    {allFilteredSongs.map((song) => renderSongItem(song))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Content: Playlists */}
        {activeTab === "playlists" && (
          <div className="animate-in fade-in duration-300 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold tracking-tight">
                Your Playlists
              </h2>
              <button
                onClick={() => setShowAddPlaylist(true)}
                className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" /> New
              </button>
            </div>

            {db.playlists.length === 0 ? (
              <div className="text-center py-16 bg-neutral-950 border border-neutral-900 rounded-3xl">
                <ListMusic className="w-12 h-12 text-neutral-500 mx-auto mb-4 opacity-50" />
                <p className="text-neutral-400 mb-4">
                  You haven't created any playlists yet.
                </p>
                <button
                  onClick={() => setShowAddPlaylist(true)}
                  className="text-purple-400 hover:text-purple-300 font-semibold text-sm"
                >
                  Create your first playlist
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {db.playlists.map((p) => {
                  const songCount = db.songs.filter(
                    (s) => s.playlistId === p.id,
                  ).length;
                  return (
                    <div
                      key={p.id}
                      className="relative group bg-neutral-900 border border-neutral-800 p-5 rounded-2xl hover:bg-neutral-800 hover:border-neutral-700 transition-all overflow-hidden flex flex-col justify-between min-h-[140px]"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <ListMusic className="w-24 h-24 rotate-12 -mr-6 -mt-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white relative z-10">
                          {p.name}
                        </h3>
                        <p className="text-sm text-neutral-400 relative z-10 mt-1 font-mono">
                          {songCount} {songCount === 1 ? "song" : "songs"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-4 relative z-10">
                        <button
                          onClick={() => {
                            setCurrentPlaylistId(p.id);
                            setActiveTab("home");
                          }}
                          className="text-sm font-semibold text-white hover:text-purple-400 transition-colors flex items-center gap-1"
                        >
                          View <Search className="w-3 h-3 ml-1" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePlaylist(p.id);
                          }}
                          className="p-2 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-950 rounded-full"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Tab Content: History */}
        {activeTab === "history" && (
          <div className="animate-in fade-in duration-300 max-w-4xl mx-auto">
            <h2 className="text-xl font-bold tracking-tight mb-8">
              Recently Played
            </h2>
            {!db.history || db.history.length === 0 ? (
              <div className="text-center py-16 text-neutral-500">
                <p>No history yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group by date roughly */}
                {Array.from(
                  new Set(
                    db.history.map((h) =>
                      new Date(h.playedAt).toLocaleDateString(),
                    ),
                  ),
                ).map((dateStr) => (
                  <div key={dateStr}>
                    <h3 className="text-sm font-bold text-neutral-500 tracking-widest uppercase mb-3 px-1">
                      {dateStr}
                    </h3>
                    {db.history
                      ?.filter(
                        (h) =>
                          new Date(h.playedAt).toLocaleDateString() === dateStr,
                      )
                      .map((entry) => (
                        <div
                          key={entry.id}
                          className={`group flex items-center justify-between p-3 rounded-2xl transition-all mb-2 cursor-pointer
                            ${currentSong?.id === entry.song.id ? "bg-purple-500/10 border border-purple-500/30" : "bg-neutral-900 border border-neutral-800 hover:border-neutral-700"}
                            `}
                          onClick={() => playSong(entry.song)}
                        >
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className="w-16 h-10 flex-shrink-0 bg-neutral-800 rounded-lg flex items-center justify-center overflow-hidden">
                              <img
                                src={entry.song.thumbnailUrl}
                                className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                alt="thumb"
                              />
                            </div>
                            <div className="min-w-0 pr-4">
                              <p className="font-semibold truncate text-sm text-neutral-100">
                                {entry.song.title}
                              </p>
                              <p className="text-xs text-neutral-500 mt-0.5 truncate">
                                {new Date(entry.playedAt).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {currentSong && (
        <AudioPlayer
          currentSong={currentSong}
          allSongs={allFilteredSongs}
          db={db}
          onNext={(s) => playSong(s)}
          onClose={() => setCurrentSong(null)}
          onPlaySong={(s) => playSong(s)}
          onAddSongToPlaylist={(s) => {
            setCurrentSong(s);
            setShowAddSong(true);
            setYtSearchQuery(s.title);
          }}
        />
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-black/90 backdrop-blur-xl border-t border-neutral-900 flex items-center justify-around px-2 z-[45] pb-safe">
        {[
          { id: "home", icon: Home, label: "Home" },
          { id: "playlists", icon: ListMusic, label: "Playlists" },
          { id: "history", icon: Disc3, label: "History" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() =>
              setActiveTab(tab.id as "home" | "playlists" | "history")
            }
            className={`flex flex-col items-center justify-center w-24 h-full gap-1 transition-colors ${
              activeTab === tab.id
                ? "text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <tab.icon
              className={`w-6 h-6 transition-transform ${
                activeTab === tab.id ? "scale-110" : "scale-100"
              }`}
            />
            <span className="text-[10px] font-semibold tracking-wide">
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* Modals */}
      {showAddPlaylist && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 animate-in fade-in">
          <form
            onSubmit={handleCreatePlaylist}
            className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl"
          >
            <h3 className="text-xl font-bold text-white mb-2">New Playlist</h3>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 font-bold tracking-wider ml-1">
                NAME
              </label>
              <input
                name="name"
                autoFocus
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="e.g. My Favorites"
                required
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowAddPlaylist(false)}
                className="text-sm font-semibold text-neutral-400 hover:text-white px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-white text-black px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-neutral-200"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddSong && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 pt-10 overflow-y-auto animate-in fade-in">
          <div className="relative bg-neutral-900 border border-neutral-800 p-6 sm:p-8 rounded-3xl w-full max-w-md my-auto shadow-2xl flex flex-col max-h-[85vh]">
            {currentSong && !currentSong.playlistId && (
              <div className="absolute -top-12 left-0 right-0 p-3 bg-purple-500 text-white font-bold rounded-xl text-center shadow-lg animate-pulse">
                Select a playlist to save the playing song.
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-white">Add Song</h3>
              <button
                onClick={() => setShowAddSong(false)}
                className="text-neutral-400 hover:text-white p-2 bg-neutral-800 rounded-full"
              >
                <Trash2 className="w-4 h-4 opacity-0" /> {/* Spacer */}
                <span className="absolute">✕</span>
              </button>
            </div>

            {/* Playlist Selection */}
            <div className="mb-6">
              <label className="text-xs text-neutral-400 font-bold ml-1 mb-1 block tracking-wider">
                SAVE TO PLAYLIST
              </label>
              <select
                value={selectedYtPlaylistId}
                onChange={(e) => setSelectedYtPlaylistId(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
              >
                {db.playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {db.playlists.length === 0 && (
                  <option value="" disabled>
                    No playlists available (Create one first)
                  </option>
                )}
              </select>
            </div>

            {/* YouTube Search Form */}
            <form onSubmit={handleYoutubeSearch} className="mb-6">
              <label className="text-xs text-neutral-400 font-bold ml-1 mb-1 block tracking-wider">
                SEARCH YOUTUBE
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ytSearchQuery}
                  onChange={(e) => setYtSearchQuery(e.target.value)}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  placeholder="Song name or artist..."
                />
                <button
                  type="submit"
                  disabled={isSearchingYt || !ytSearchQuery}
                  className="bg-white text-black px-5 rounded-xl font-bold hover:bg-neutral-200 disabled:opacity-50 flex items-center justify-center transition-all bg-purple-500 text-white border-0"
                  style={{ backgroundColor: "#a855f7", color: "white" }}
                >
                  {isSearchingYt ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Search className="w-5 h-5" />
                  )}
                </button>
              </div>
            </form>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-2">
              {ytSearchResults.map((video) => (
                <div
                  key={video.id.videoId}
                  className="flex gap-3 bg-neutral-950 p-2 rounded-xl border border-neutral-800 hover:border-purple-500/50 cursor-pointer transition-colors group"
                >
                  <img
                    src={video.snippet.thumbnails.default.url}
                    className="w-24 h-16 object-cover rounded-lg group-hover:opacity-80 transition-opacity"
                    alt="thumbnail"
                    onClick={() =>
                      setLivePlaySong(video.id.videoId, video.snippet.title)
                    }
                  />
                  <div
                    className="flex-1 min-w-0 py-1 flex flex-col justify-center"
                    onClick={() =>
                      setLivePlaySong(video.id.videoId, video.snippet.title)
                    }
                  >
                    <p
                      className="text-sm font-semibold text-white line-clamp-2 leading-tight"
                      dangerouslySetInnerHTML={{ __html: video.snippet.title }}
                    ></p>
                    <p className="text-xs text-neutral-500 mt-1 truncate">
                      {video.snippet.channelTitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pr-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLivePlaySong(video.id.videoId, video.snippet.title);
                      }}
                      className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-colors"
                      title="Play Now"
                    >
                      <Play className="w-3 h-3 fill-current ml-0.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDirectAddSong(video.id.videoId, video.snippet.title);
                      }}
                      className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center hover:bg-purple-500 hover:text-white transition-colors"
                      title="Add to Playlist"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {!isSearchingYt &&
                ytSearchResults.length === 0 &&
                ytSearchQuery && (
                  <p className="text-center text-sm text-neutral-500 py-4">
                    No results found.
                  </p>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-800 text-center">
              <p className="text-xs text-neutral-500 mb-2">
                Or add by direct URL
              </p>
              <form onSubmit={handleAddSong} className="flex gap-2">
                <input
                  name="youtubeUrl"
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  required
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                />
                <input
                  type="hidden"
                  name="playlistId"
                  value={selectedYtPlaylistId}
                />
                <input
                  type="hidden"
                  name="title"
                  value="Direct URL Added Video"
                />
                <button
                  type="submit"
                  disabled={db.playlists.length === 0 || isAddingSong}
                  className="bg-neutral-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-neutral-700 disabled:opacity-50"
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
