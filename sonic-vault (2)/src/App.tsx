import React, { useEffect, useState, useRef } from "react";
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
  UserCircle,
  RefreshCw,
  X
} from "lucide-react";
import { AudioPlayer } from "./components/AudioPlayer";
import { createClient } from "@supabase/supabase-js";
import customLogo from "./assets/images/logo.png";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;


// Request full screen
const requestAppFullscreen = () => {
   if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
         console.warn("Fullscreen error", err);
      });
   }
};

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
  const [activeTab, setActiveTab] = useState<"home" | "playlists" | "library" | "profile">(
    "home",
  );
  const [user, setUser] = useState<any>(null);
  const [homeSongs, setHomeSongs] = useState<Song[]>([]);
  const hasRequestedFs = useRef(false);
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string | null>(
    null,
  );
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userNameInput, setUserNameInput] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup" | "verify" | "forgotPassword" | "resetPassword">("login");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
       window.removeEventListener('online', handleOnline);
       window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  useEffect(() => {
    if (window.location.pathname === '/reset-password') {
       setAuthMode("resetPassword");
    }
  }, []);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  // Modals
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [showAddSong, setShowAddSong] = useState(false);
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [ytSearchQuery, setYtSearchQuery] = useState("");
  const [ytSearchResults, setYtSearchResults] = useState<any[]>([]);
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [selectedYtPlaylistId, setSelectedYtPlaylistId] = useState<string>("");
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(false);
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  const handleFullscreenRequest = () => {
    if (!hasRequestedFs.current) {
       requestAppFullscreen();
       hasRequestedFs.current = true;
    }
  };

  const safeApiFetch = async (path: string, options?: any) => {
    const defaultUrl = import.meta.env.VITE_API_URL || "";
    let res = await fetch(`${defaultUrl}${path}`, options);
    let text = await res.text();
    if (text.trim().startsWith("<!") && defaultUrl) {
       console.warn("External API URL returned HTML, falling back to local relative API...");
       res = await fetch(path, options);
       text = await res.text();
    }
    return { res, text };
  };

  const performYoutubeSearch = async (query: string) => {
     if (!query.trim()) {
        setYtSearchResults([]);
        return;
     }
     setIsSearchingYt(true);
     try {
       const headers: any = {};
       if (user) {
          headers['x-user-id'] = user.id;
       }
       const { res, text } = await safeApiFetch(`/api/youtube/search?q=${encodeURIComponent(query)}`, { headers });
       
       let data;
       try {
          data = JSON.parse(text);
       } catch (err) {
          console.error("API response was not JSON:", text.substring(0, 50));
          throw new Error("Server returned an invalid response.");
       }
       
       if (!res.ok) throw new Error(data.error);
       setYtSearchResults(data.items || []);
       
       if (data.items && supabase && user) {
          supabase.from("api_search_results").insert([{
              user_id: user.id,
              query: query,
              results: data.items
          }]).then();
       }
     } catch (e: any) {
       showToast("YouTube search failed: " + e.message);
     } finally {
       setIsSearchingYt(false);
     }
  };

  const handleYoutubeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowPredictions(false);
    if (!ytSearchQuery.trim()) {
        setYtSearchResults([]);
        return;
    }
    performYoutubeSearch(ytSearchQuery);
    handleFullscreenRequest();
  };

  const [predictions, setPredictions] = useState<string[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);

  const fetchPredictions = async (q: string) => {
    if (!q || !q.trim()) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }
    try {
      const { res, text } = await safeApiFetch(`/api/youtube/suggest?q=${encodeURIComponent(q)}`);
      if (res.ok) {
         setPredictions(JSON.parse(text));
         setShowPredictions(true);
      }
    } catch (err) {}
  };

  // Removed real-time search debounce to only search on submit

  const fetchSupabaseData = async (userId: string) => {
    if (!supabase) return;
    
    // Fetch playlists
    const { data: playlistsData, error: playlistsError } = await supabase
      .from('playlists')
      .select('*')
      .order('created_at', { ascending: true });

    // Fetch songs
    const { data: songsData, error: songsError } = await supabase
      .from('playlist_songs')
      .select('*')
      .order('added_at', { ascending: false });
      
    if (!playlistsError && !songsError) {
      const mappedPlaylists: Playlist[] = (playlistsData || []).map(p => ({
         id: p.id,
         name: p.name,
      }));

      const mappedSongs: Song[] = (songsData || []).map(s => ({
         id: s.id,
         title: s.title,
         youtubeUrl: `https://www.youtube.com/watch?v=${s.video_id}`,
         thumbnailUrl: s.thumbnail_url,
         playlistId: s.playlist_id || ""
      }));
      
      setDb(prev => ({
         ...prev,
         playlists: mappedPlaylists,
         songs: mappedSongs,
      }));

      if (mappedPlaylists.length > 0) {
        setSelectedYtPlaylistId(mappedPlaylists[0].id);
      }
    }
  };

  useEffect(() => {
    if (supabase) {
       supabase.auth.getSession().then(({ data: { session } }) => {
          const fetchedUser = session?.user ?? null;
          setUser(fetchedUser);
          if (fetchedUser) fetchSupabaseData(fetchedUser.id);
          setIsCheckingAuth(false);
       });
       const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          const fetchedUser = session?.user ?? null;
          setUser(fetchedUser);
          if (fetchedUser) fetchSupabaseData(fetchedUser.id);
          setIsCheckingAuth(false);
          
          if (event === 'SIGNED_IN' && fetchedUser) {
             try {
                await fetch('https://backened-sonic-1.onrender.com/api/send-welcome', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ userId: fetchedUser.id })
                });
             } catch (err) {
                // Ignore transient network errors during dev server restarts
             }
          }
       });
       return () => subscription.unsubscribe();
    } else {
       setIsCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    const fetchHomeSongs = async () => {
       try {
          const { res, text } = await safeApiFetch(`/api/home/songs`);
          if (res.ok) {
             const data = JSON.parse(text);
             if (data.items) {
                 const mapped: Song[] = data.items.map((item: any) => ({
                    id: crypto.randomUUID(),
                    title: item.snippet?.title || "Video",
                    youtubeUrl: `https://www.youtube.com/watch?v=${item.id?.videoId || item.id}`,
                    thumbnailUrl: `https://img.youtube.com/vi/${item.id?.videoId || item.id}/hqdefault.jpg`,
                    playlistId: "", // unassigned
                 }));
                 setHomeSongs(mapped.slice(0, 50));
             }
          }
       } catch (err) {
          console.warn("Failed to fetch home songs");
       }
    };
    fetchHomeSongs();
  }, []);

  const setDirectAddSong = async (videoId: string, title: string) => {
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
    
    setDb(prev => ({ ...prev, songs: [newSong, ...prev.songs] }));
    setShowAddSong(false);
    showToast("Song added!");
    
    if (supabase && user) {
       await supabase.from('songs').insert([{
           id: newSong.id,
           user_id: user.id,
           title: newSong.title,
           youtube_url: newSong.youtubeUrl,
           thumbnail_url: newSong.thumbnailUrl
       }]);
    }
  };

  const playSong = async (song: Song) => {
    setCurrentSong(song);
    const newHistoryEntry = {
      id: crypto.randomUUID(),
      playedAt: Date.now(),
      song,
    };

    setDb(prev => {
       const currentHistory = prev.history || [];
       const filteredHistory = currentHistory.filter(h => h.song.youtubeUrl !== song.youtubeUrl);
       const updatedDb = {
         ...prev,
         history: [newHistoryEntry, ...filteredHistory].slice(0, 50),
       };
       saveDb(updatedDb);
       return updatedDb;
    });
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
    setDb(prev => ({
      ...prev,
      history: loadedDb.history || []
    }));
    setIsLoading(false);
  }, []);

  const handleCreatePlaylist = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    if (!name) return;

    const newPlaylist: Playlist = {
      id: crypto.randomUUID(),
      name,
    };

    setDb(prev => ({ ...prev, playlists: [...prev.playlists, newPlaylist] }));
    setShowAddPlaylist(false);
    showToast(`Playlist "${name}" created.`);
    
    if (supabase && user) {
       await supabase.from('playlists').insert([{
           id: newPlaylist.id,
           user_id: user.id,
           name: newPlaylist.name
       }]);
    }
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
        const { res, text } = await safeApiFetch(`/api/youtube/video?id=${videoId}`);
        if (res.ok) {
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

      setDb(prev => ({ ...prev, songs: [newSong, ...prev.songs] }));
      setShowAddSong(false);
      showToast("YouTube video added!");
      
      if (supabase && user && newSong.playlistId) {
         await supabase.from('playlist_songs').insert([{
             id: newSong.id,
             playlist_id: newSong.playlistId,
             title: newSong.title,
             video_id: videoId,
             thumbnail_url: newSong.thumbnailUrl
         }]);
      }
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
      onConfirm: async () => {
        setDb(prev => ({ ...prev, songs: prev.songs.filter((s) => s.id !== id) }));
        if (currentSong?.id === id) setCurrentSong(null);
        showToast("Video deleted.");
        setConfirmDialog(null);
        
        if (supabase) {
           await supabase.from('playlist_songs').delete().eq('id', id);
        }
      },
    });
  };

  const deletePlaylist = async (id: string) => {
    setConfirmDialog({
      message:
        "Are you sure you want to delete this playlist and all its videos?",
      onConfirm: async () => {
        setDb(prev => ({
          ...prev,
          playlists: prev.playlists.filter((p) => p.id !== id),
          songs: prev.songs.filter((s) => s.playlistId !== id),
        }));
        if (currentPlaylistId === id) {
          setCurrentPlaylistId(null);
          setActiveTab("home");
        }
        showToast("Playlist deleted.");
        setConfirmDialog(null);
        
        if (supabase) {
           await supabase.from('playlists').delete().eq('id', id);
        }
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

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsAuthLoading(true);
    
    if (authMode === "signup") {
        if (!userNameInput.trim()) {
           showToast("Please enter your name");
           setIsAuthLoading(false);
           return;
        }
        const { data, error } = await supabase.auth.signUp({
           email: emailInput.trim(),
           password: passwordInput,
           options: {
              data: { full_name: userNameInput.trim(), custom_name: userNameInput.trim() }
           }
        });
        if (error) {
           if (error.message.toLowerCase().includes("user already registered")) {
              showToast("Account already exists. Try logging in or resetting password.");
              setAuthMode("login");
           } else if (error.message.includes("Error sending confirmation email")) {
              showToast("Sign up succeeded, but confirmation email couldn't be sent. You may need to verify your email later.");
              setAuthMode("login");
           } else {
              showToast(error.message);
           }
        } else {
           if (data?.session) {
               showToast("Account created successfully!");
           } else {
               setAuthMode("verify");
               showToast("Verification email sent. Please check your inbox.");
           }
        }
    } else if (authMode === "forgotPassword") {
        const { error } = await supabase.auth.resetPasswordForEmail(emailInput.trim(), {
           redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) showToast(error.message);
        else showToast("Password reset link sent to your email.");
    } else if (authMode === "resetPassword") {
        const { error } = await supabase.auth.updateUser({ password: passwordInput });
        if (error) {
           showToast("Invalid or Expired Reset Link");
           setTimeout(() => {
              window.location.href = '/login';
           }, 2000);
        } else {
           showToast("Password updated successfully!");
           setAuthMode("login");
           window.history.pushState({}, '', '/');
        }
    } else {
        const { error } = await supabase.auth.signInWithPassword({
           email: emailInput.trim(),
           password: passwordInput,
        });
        if (error) {
           showToast(error.message);
        }
    }
    setIsAuthLoading(false);
  };

  const handleSaveName = async (e: React.FormEvent) => {
     e.preventDefault();
     handleFullscreenRequest();
     if (!userNameInput.trim() || !supabase) return;
     const { error } = await supabase.auth.updateUser({
        data: { custom_name: userNameInput.trim(), full_name: userNameInput.trim() }
     });
     if (error) {
        showToast("Error updating name");
     }
  };

  if (isLoading || isCheckingAuth) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white font-sans">
         <div className="w-32 h-32 flex items-center justify-center mb-12 relative">
            <div className="absolute inset-0 border-t-2 border-purple-500 rounded-full animate-spin"></div>
            <img src={customLogo} alt="Sonic Vault" className="w-28 h-28 object-cover rounded-full shadow-[0_0_30px_rgba(168,85,247,0.4)]" />
         </div>
         <div className="w-64 h-1 bg-neutral-900 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full w-full animate-pulse origin-left opacity-80" style={{ animation: "progress 2s ease-in-out infinite" }}></div>
         </div>
         <style>{`
            @keyframes progress {
               0% { transform: scaleX(0); }
               50% { transform: scaleX(1); opacity: 1; }
               100% { transform: scaleX(0); opacity: 0; }
            }
         `}</style>
      </div>
    );
  }

  const renderToast = () => {
    if (!toastMsg) return null;
    return (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-6 py-3 rounded-full shadow-2xl z-[150] animate-in slide-in-from-top-4 font-medium text-sm border border-neutral-700 whitespace-nowrap">
        {toastMsg}
      </div>
    );
  };

  if (!user) {
    if (authMode === "verify") {
       return (
          <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white font-sans p-6 text-center">
             {renderToast()}
             <div className="w-32 h-32 flex items-center justify-center mb-6">
                <img src={customLogo} alt="SV" className="w-full h-full object-cover rounded-full shadow-[0_0_30px_rgba(168,85,247,0.4)] border border-purple-500" />
             </div>
             <h2 className="text-3xl font-bold tracking-tight mb-2">Check Your Email</h2>
             <p className="text-neutral-400 mb-6 max-w-sm">We've sent a confirmation link to {emailInput}. Click it to verify your account, then you will automatically enter the app.</p>
             <button onClick={() => setAuthMode("login")} className="text-purple-400 hover:text-purple-300 transition-colors font-semibold">Back to Login</button>
          </div>
       );
    }
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white font-sans p-6">
         {renderToast()}
         <div className="w-24 h-24 flex items-center justify-center mb-4">
            <img src={customLogo} alt="SV" className="w-full h-full object-cover rounded-full shadow-[0_0_20px_rgba(168,85,247,0.4)] border border-purple-500" />
         </div>
         <h1 className="text-2xl font-bold tracking-tight mb-1">Sonic Vault</h1>
         <p className="text-neutral-400 mb-8 text-center max-w-sm text-sm">
            {authMode === "resetPassword" ? "Enter your new password" : 
             authMode === "forgotPassword" ? "Enter your email to reset password" : 
             "Sign in or create an account to sync songs"}
         </p>
         
         {supabase ? (
           <form onSubmit={handleEmailAuth} className="w-full max-w-sm flex flex-col gap-4">
              {authMode === "signup" && (
                 <input 
                    type="text" 
                    placeholder="Full Name" 
                    value={userNameInput} 
                    onChange={e => setUserNameInput(e.target.value)} 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors placeholder:text-neutral-500" 
                    required 
                 />
              )}
              {authMode !== "resetPassword" && (
                 <input 
                    type="email" 
                    placeholder="Email Address" 
                    value={emailInput} 
                    onChange={e => setEmailInput(e.target.value)} 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors placeholder:text-neutral-500" 
                    required 
                 />
              )}
              {authMode !== "forgotPassword" && (
                 <input 
                    type="password" 
                    placeholder={authMode === "resetPassword" ? "New Password" : "Password"} 
                    value={passwordInput} 
                    onChange={e => setPasswordInput(e.target.value)} 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors placeholder:text-neutral-500" 
                    required 
                    minLength={6}
                 />
              )}
              {authMode === "login" && (
                 <div className="flex justify-end">
                    <button type="button" onClick={() => setAuthMode('forgotPassword')} className="text-sm font-semibold text-purple-400 hover:text-purple-300">Forgot Password?</button>
                 </div>
              )}
              <button 
                 type="submit" 
                 disabled={isAuthLoading}
                 className="mt-2 w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)]"
              >
                 {isAuthLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                 {isAuthLoading ? "Please wait..." : 
                  authMode === "login" ? "Sign In" : 
                  authMode === "signup" ? "Sign Up" : 
                  authMode === "resetPassword" ? "Reset Password" : "Send Reset Link"}
              </button>
              
              {authMode !== "resetPassword" && authMode !== "forgotPassword" && (
                 <>
                    <div className="flex items-center gap-4 my-2">
                       <div className="h-px bg-neutral-800 flex-1"></div>
                       <span className="text-neutral-500 text-xs font-semibold tracking-widest uppercase">Or continue with</span>
                       <div className="h-px bg-neutral-800 flex-1"></div>
                    </div>

                    <button
                       type="button"
                       onClick={() => {
                          handleFullscreenRequest();
                          supabase.auth.signInWithOAuth({ provider: 'google' });
                       }}
                       className="w-full bg-white text-black font-bold py-3.5 rounded-xl transition-all hover:bg-neutral-200 flex items-center justify-center gap-3 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                    >
                       <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                       Google
                    </button>
                 </>
              )}

              <button
                 type="button"
                 onClick={() => {
                    if (authMode === 'login' || authMode === 'forgotPassword') setAuthMode('signup');
                    else setAuthMode('login');
                 }}
                 className="text-neutral-400 hover:text-white transition-colors text-sm font-semibold mt-2"
              >
                 {authMode === "signup" ? "Already have an account? Sign in" : 
                  authMode === "resetPassword" ? "Back to Login" : "Don't have an account? Sign up"}
              </button>
           </form>
         ) : (
           <div className="bg-orange-500/10 text-orange-400 p-4 rounded-xl text-sm border border-orange-500/20 max-w-md text-center">
             Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables to enable login.
           </div>
         )}
      </div>
    );
  }

  if (user && !user.user_metadata?.custom_name && !user.user_metadata?.full_name) {
     return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white font-sans p-6">
           {renderToast()}
           <form onSubmit={handleSaveName} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <h2 className="text-2xl font-bold mb-2">What should we call you?</h2>
              <p className="text-neutral-400 text-sm mb-6">Enter your display name to continue.</p>
              <input
                 type="text"
                 value={userNameInput}
                 onChange={(e) => setUserNameInput(e.target.value)}
                 placeholder="Your Name"
                 className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:border-purple-500 transition-colors"
                 required
              />
              <button
                 type="submit"
                 className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-colors"
              >
                 Continue to Vault
              </button>
           </form>
        </div>
     );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-black text-white font-sans overflow-hidden overscroll-none">
      {isOffline && (
         <div className="bg-red-600 text-white text-xs font-bold text-center py-1.5 relative z-50 animate-in slide-in-from-top flex items-center justify-center gap-2 shadow-lg">
            No internet connection
         </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-6 py-3 rounded-full shadow-2xl z-[150] animate-in slide-in-from-top-4 font-medium text-sm border border-neutral-700 whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 animate-in fade-in">
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
            <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)] overflow-hidden border border-purple-500">
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
                    if (e.target.value.trim()) {
                       fetchPredictions(e.target.value);
                    } else {
                       setShowPredictions(false);
                       setYtSearchResults([]);
                    }
                  }}
                  onFocus={() => {
                     if (searchQuery.trim() && predictions.length > 0) setShowPredictions(true);
                  }}
                  onBlur={() => {
                     setTimeout(() => setShowPredictions(false), 200);
                  }}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl py-3 pl-12 pr-12 text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
                
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setYtSearchQuery("");
                      setYtSearchResults([]);
                      setShowPredictions(false);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
                
                {searchQuery.trim() && showPredictions && predictions.length > 0 && (
                   <ul className="absolute top-14 left-0 w-full bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-neutral-800/50">
                      {predictions.map((p, idx) => (
                         <li 
                            key={idx} 
                            onClick={() => {
                               setSearchQuery(p);
                               setYtSearchQuery(p);
                               setShowPredictions(false);
                               performYoutubeSearch(p);
                            }}
                            className="px-4 py-3 hover:bg-neutral-800 cursor-pointer transition-colors text-sm text-neutral-200"
                         >
                            {p}
                         </li>
                      ))}
                   </ul>
                )}
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
              {!searchQuery && ytSearchResults.length === 0 && db.songs.length > 0 && (
                <div>
                  <h2 className="text-lg font-bold text-neutral-400 mb-3 px-1 tracking-widest uppercase flex items-center gap-2">
                    <Music className="w-5 h-5" /> Songs
                  </h2>
                  <div className="grid gap-3 object-cover">
                    {db.songs.map((song) => (
                      <div
                        key={song.id}
                        className="flex gap-4 p-3 bg-neutral-900 rounded-2xl border border-neutral-800 hover:border-purple-500/30 cursor-pointer transition-colors group"
                        onClick={() => playSong(song)}
                      >
                        <div className="w-24 h-16 rounded-xl overflow-hidden relative flex-shrink-0">
                          <img
                            src={song.thumbnailUrl}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            alt="thumbnail"
                          />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-6 h-6 text-white ml-1" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <p className="text-sm font-semibold text-white line-clamp-2 leading-tight">
                            {song.title}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
               {!searchQuery && ytSearchResults.length === 0 && (
                 <div>
                   <div className="flex items-center justify-between mb-6">
                     <h2 className="text-xl font-bold text-white uppercase flex items-center gap-2 tracking-wide">
                       <Music className="w-6 h-6 text-purple-400" /> Recent Vault Songs
                     </h2>
                   </div>
                   {db.songs.length === 0 ? (
                      <div className="text-center py-12 text-neutral-500">
                         <p>Your vault is empty. Search and add some songs to playlists!</p>
                      </div>
                   ) : (
                     <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                       {db.songs.slice(0, 20).map((song) => (
                         <div
                           key={song.id}
                           className="flex flex-col gap-3 group cursor-pointer"
                           onClick={() => playSong(song)}
                         >
                           <div className="w-full aspect-video rounded-2xl overflow-hidden relative bg-neutral-900 border border-neutral-800">
                             <img
                               src={song.thumbnailUrl}
                               className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                               alt="thumbnail"
                             />
                             <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                               <Play className="w-12 h-12 text-white fill-white shadow-2xl" />
                             </div>
                           </div>
                           <div className="flex-1 min-w-0 pr-2">
                             <p
                               className="text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-purple-400 transition-colors"
                             >{song.title}</p>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
              )}

              {searchQuery && ytSearchResults.length === 0 && !isSearchingYt && (
                <div className="text-center py-12 text-neutral-500">
                  <p>No songs found matching "{searchQuery}"</p>
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
        {/* Tab Content: Profile */}
        {activeTab === "profile" && (
          <div className="animate-in fade-in duration-300 max-w-xl mx-auto">
            <h2 className="text-xl font-bold tracking-tight mb-8">
              Profile
            </h2>
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center space-y-6 mb-8">
               <div className="w-24 h-24 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
                  {user && user.user_metadata?.avatar_url ? (
                     <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                  ) : (
                     <UserCircle className="w-12 h-12 text-purple-400" />
                  )}
               </div>
               
               {user ? (
                 <div>
                   <h3 className="text-xl font-bold text-white">{user.user_metadata?.custom_name || user.user_metadata?.full_name || user.email}</h3>
                   <p className="text-neutral-400 text-sm mb-6 mt-1">{user.email}</p>
                   {supabase && (
                     <button
                        onClick={async () => {
                          if (supabase) {
                             await supabase.auth.signOut();
                             setDb(prev => ({ ...prev, playlists: [], songs: [] }));
                             setActiveTab("home");
                          }
                        }}
                        className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 px-8 rounded-full transition-colors"
                     >
                       Sign Out
                     </button>
                   )}
                 </div>
               ) : (
                 <div>
                   <h3 className="text-lg font-bold text-white mb-2">Sign into Sonic Vault</h3>
                   <p className="text-neutral-400 text-sm mb-6">Save your api logs, searches, and database seamlessly using Google Login.</p>
                   {supabase ? (
                     <button
                        onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
                        className="bg-white text-black font-bold py-3 px-8 rounded-full transition-all hover:bg-neutral-200 hover:scale-105 flex items-center justify-center gap-3 mx-auto shadow-lg"
                     >
                       <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                       Sign in with Google
                     </button>
                   ) : (
                     <div className="bg-orange-500/10 text-orange-400 p-4 rounded-xl text-sm border border-orange-500/20">
                       Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables to enable login.
                     </div>
                   )}
                 </div>
                )}
             </div>
             {/* LIBRARY SECTION */}
             <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 mb-20 text-center">
              <h2 className="text-xl font-bold tracking-tight mb-8">
                Library
              </h2>
              {!db.history || db.history.length === 0 ? (
                <div className="text-center py-16 text-neutral-500">
                  <p>Your library is empty.</p>
                </div>
              ) : (
                <div className="space-y-6 text-left">
                  {Array.from(
                    new Set(
                      db.history.map((h) =>
                        new Date(h.playedAt).toLocaleDateString()
                      )
                    )
                  ).map((dateStr) => (
                    <div key={dateStr}>
                      <h3 className="text-sm font-bold text-neutral-500 tracking-widest uppercase mb-3 px-1">
                        {dateStr}
                      </h3>
                      {db.history
                        ?.filter(
                          (h) =>
                            new Date(h.playedAt).toLocaleDateString() === dateStr
                        )
                        .map((entry) => (
                          <div
                            key={entry.id}
                            className={`group flex items-center justify-between p-3 rounded-2xl transition-all mb-2 cursor-pointer
                              ${currentSong?.id === entry.song.id ? "bg-purple-500/10 border border-purple-500/30" : "bg-neutral-950 border border-neutral-800 hover:border-neutral-700"}
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
                                    { hour: "2-digit", minute: "2-digit" }
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
          </div>
        )}
      </div>

      {currentSong && (
        <AudioPlayer
          key={currentSong.id}
          currentSong={currentSong}
          allSongs={allFilteredSongs}
          db={db}
          isMinimized={isPlayerMinimized}
          onMinimize={() => setIsPlayerMinimized(!isPlayerMinimized)}
          onNext={(s) => playSong(s)}
          onClose={() => setCurrentSong(null)}
          onPlaySong={(s) => playSong(s)}
          onAddSongToPlaylist={(s) => {
             setSongToAddToPlaylist(s);
          }}
        />
      )}

      {/* Add Specific Song to Playlist Modal */}
      {songToAddToPlaylist && (
        <div className="fixed inset-0 z-[110] flex flex-col md:items-center justify-end md:justify-center bg-black/80 md:px-4 animate-in fade-in">
          <div className="bg-neutral-900 md:border border-neutral-800 md:rounded-3xl rounded-t-3xl p-6 w-full md:max-w-md shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold tracking-tight">
                Add to Playlist
              </h3>
              <button
                onClick={() => setSongToAddToPlaylist(null)}
                className="p-2 bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4 text-sm font-semibold text-neutral-400 line-clamp-1">{songToAddToPlaylist.title}</div>
            
            {db.playlists.length === 0 ? (
               <div className="text-center py-8">
                  <p className="text-neutral-500 mb-4 text-sm">No playlists created yet.</p>
                  <button onClick={() => { setSongToAddToPlaylist(null); setShowAddPlaylist(true); }} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-6 rounded-xl text-sm transition-colors">Create Playlist</button>
               </div>
            ) : (
               <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {db.playlists.map(p => (
                     <button
                        key={p.id}
                        onClick={async () => {
                           const newSong = { ...songToAddToPlaylist, id: crypto.randomUUID(), playlistId: p.id };
                           setDb(prev => ({ ...prev, songs: [newSong, ...prev.songs] }));
                           setSongToAddToPlaylist(null);
                           showToast(`Added to ${p.name}`);
                           if (supabase && user) {
                              const videoIdMatch = newSong.youtubeUrl.match(/[?&]v=([^&]+)/);
                              const videoId = videoIdMatch ? videoIdMatch[1] : newSong.youtubeUrl.replace('https://www.youtube.com/watch?v=', '');
                              
                              await supabase.from('playlist_songs').insert([{
                                  id: newSong.id,
                                  playlist_id: p.id,
                                  title: newSong.title,
                                  video_id: videoId,
                                  thumbnail_url: newSong.thumbnailUrl
                              }]);
                           }
                        }}
                        className="w-full flex items-center justify-between p-4 bg-neutral-950 hover:bg-neutral-800 rounded-xl transition-colors text-left"
                     >
                        <span className="font-semibold text-white">{p.name}</span>
                        <Plus className="w-5 h-5 text-neutral-500" />
                     </button>
                  ))}
               </div>
            )}
            
            {db.playlists.length > 0 && (
               <button onClick={() => { setSongToAddToPlaylist(null); setShowAddPlaylist(true); }} className="mt-6 w-full flex items-center justify-center gap-2 border border-neutral-700 hover:bg-neutral-800 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                  <Plus className="w-4 h-4"/> Create New Playlist
               </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-black/90 backdrop-blur-xl border-t border-neutral-900 flex items-center justify-around px-2 z-[45] pb-safe">
        {[
          { id: "home", icon: Home, label: "Home" },
          { id: "playlists", icon: ListMusic, label: "Vault" },
          { id: "profile", icon: UserCircle, label: "Profile" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as "home" | "playlists" | "profile");
              if (tab.id === "home") {
                  setCurrentPlaylistId(null);
                  if (currentSong && !isPlayerMinimized) {
                      setIsPlayerMinimized(true);
                  }
              }
            }}
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 animate-in fade-in">
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 pt-10 overflow-y-auto animate-in fade-in">
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
                        setSongToAddToPlaylist({
                            id: crypto.randomUUID(),
                            title: video.snippet.title,
                            youtubeUrl: `https://www.youtube.com/watch?v=${video.id.videoId}`,
                            thumbnailUrl: `https://img.youtube.com/vi/${video.id.videoId}/hqdefault.jpg`,
                            playlistId: ""
                        });
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

          </div>
        </div>
      )}
    </div>
  );
}
