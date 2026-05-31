import { useEffect, useRef, useState } from "react";
import { AppDatabase, Song } from "../types";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  Minimize2,
  Music,
} from "lucide-react";
import customLogo from "../assets/images/sonic_vault_logo_1780216990059.png";

// window.YT types
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface AudioPlayerProps {
  currentSong: Song | null;
  allSongs: Song[];
  db: AppDatabase;
  onNext: (s: Song) => void;
  onClose: () => void;
  onPlaySong: (s: Song) => void;
  onAddSongToPlaylist?: (s: Song) => void;
}

export function AudioPlayer({
  currentSong,
  allSongs,
  db,
  onNext,
  onClose,
  onPlaySong,
  onAddSongToPlaylist,
}: AudioPlayerProps) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [liveQueue, setLiveQueue] = useState<Song[]>([]);
  const updateTimerRef = useRef<any>(null);
  const seekTimeoutRef = useRef<any>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  // Parse YouTube video ID
  const getYoutubeVideoId = (url: string) => {
    if (!url) return null;
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const videoId = currentSong
    ? getYoutubeVideoId(currentSong.youtubeUrl)
    : null;

  // Load YouTube Iframe API once
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setIsReady(true);
      };
    } else {
      setIsReady(true);
    }
  }, []);

  // Initialize and update player
  useEffect(() => {
    if (!isReady || !videoId || !containerRef.current) return;

    if (!playerRef.current) {
      playerRef.current = new window.YT.Player(containerRef.current, {
        height: "200",
        width: "200",
        videoId: videoId,
        playerVars: {
          playsinline: 1,
          controls: 0,
          vq: "tiny", // Force low quality 144p
          autoplay: 1,
        },
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
            startProgressLoop();
          },
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              startProgressLoop();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (event.data === window.YT.PlayerState.ENDED) {
              skipNext();
            }
          },
        },
      });
    } else {
      // If player exists, just load new video
      playerRef.current.loadVideoById(videoId);
      playerRef.current.playVideo();
    }
    
    return () => {
      stopProgressLoop();
    };
  }, [videoId, isReady]);

  // Load live queue for Up Next when playing a non-playlist song
  useEffect(() => {
    if (!currentSong.playlistId) {
       const loadLiveQueue = async () => {
          try {
             // Generate a query dynamically based on current song to find related content
             const searchQuery = encodeURIComponent(currentSong.title + " music");
             const res = await fetch(`/api/youtube/search?q=${searchQuery}`);
             const data = await res.json();
             if (res.ok && data.items) {
                 const songs: Song[] = data.items.map((item: any) => ({
                    id: crypto.randomUUID(),
                    title: item.snippet.title,
                    youtubeUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    thumbnailUrl: item.snippet.thumbnails.default.url,
                    playlistId: "", // Not saved
                 }));
                 // Exclude current song if it's there
                 setLiveQueue(songs.filter(s => s.youtubeUrl !== currentSong.youtubeUrl));
             }
          } catch(e) {
             console.error(e);
          }
       };
       loadLiveQueue();
    } else {
       setLiveQueue([]);
    }
  }, [currentSong.id, currentSong.playlistId, currentSong.title]);

  const startProgressLoop = () => {
    stopProgressLoop();
    updateTimerRef.current = setInterval(() => {
      if (!playerRef.current || !playerRef.current.getDuration) return;
      if (isDragging) return; // Don't update time while dragging

      const current = playerRef.current.getCurrentTime() || 0;
      const dur = playerRef.current.getDuration() || 0;
      setCurrentTime(current);
      setDuration(dur);

      if (sliderRef.current && dur > 0) {
         sliderRef.current.value = current.toString();
         sliderRef.current.max = dur.toString();
         const percent = (current / dur) * 100;
         if (progressContainerRef.current) {
            progressContainerRef.current.style.setProperty("--played-percent", `${percent}%`);
         }
      }
    }, 100);
  };

  const stopProgressLoop = () => {
    if (updateTimerRef.current) {
      clearInterval(updateTimerRef.current);
    }
  };

  const togglePlay = () => {
    if (playerRef.current) {
      const state = playerRef.current.getPlayerState();
      if (state === window.YT.PlayerState.PLAYING || state === 1) {
         playerRef.current.pauseVideo();
      } else {
         playerRef.current.playVideo();
      }
    }
  };

  const skipNext = () => {
    if (!currentSong || playlistSongs.length === 0) return;
    const currentIndex = playlistSongs.findIndex(
      (s) => s.id === currentSong.id,
    );
    const nextIndex =
      currentIndex !== -1 ? (currentIndex + 1) % playlistSongs.length : 0;
    onNext(playlistSongs[nextIndex]);
  };

  const skipPrev = () => {
    if (!currentSong || playlistSongs.length === 0) return;
    const currentIndex = playlistSongs.findIndex(
      (s) => s.id === currentSong.id,
    );
    let prevIndex =
      currentIndex !== -1 ? currentIndex - 1 : playlistSongs.length - 1;
    if (prevIndex < 0) prevIndex = playlistSongs.length - 1;
    onNext(playlistSongs[prevIndex]);
  };

  const seekForward = () => {
    if (playerRef.current) {
      const newTime = Math.min(currentTime + 5, duration || currentTime + 5);
      playerRef.current.seekTo(newTime, true);
      setCurrentTime(newTime);
    }
  };

  const seekBackward = () => {
    if (playerRef.current) {
      const newTime = Math.max(currentTime - 5, 0);
      playerRef.current.seekTo(newTime, true);
      setCurrentTime(newTime);
    }
  };

  const handleSliderInput = (e: React.FormEvent<HTMLInputElement>) => {
    setIsDragging(true);
    const val = parseFloat(e.currentTarget.value);
    setCurrentTime(val);
    const percent = (val / duration) * 100;
    if (progressContainerRef.current) {
       progressContainerRef.current.style.setProperty("--played-percent", `${percent}%`);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
     const val = parseFloat(e.target.value);
     seekTimeoutRef.current = setTimeout(() => {
        if (playerRef.current) {
           playerRef.current.seekTo(val, true);
        }
        setIsDragging(false);
     }, 100);
  };

  if (!currentSong) return null;

  const playlist = db.playlists.find((p) => p.id === currentSong.playlistId);

  // Filter songs to only show ones in the same playlist
  const playlistSongs = currentSong.playlistId
    ? allSongs.filter((s) => s.playlistId === currentSong.playlistId)
    : liveQueue; // Use live suggested auto-queue for single songs

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const [showMobileQueue, setShowMobileQueue] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-bottom touch-none">
      {/* Main Content Area (Video + Details) */}
      <div 
        className="flex-1 flex flex-col items-center bg-black relative min-w-0"
        onClick={() => setShowMobileQueue(false)}
      >
        {/* Top Bar Wrapper */}
        <div className="w-full flex justify-between items-center p-4 absolute top-0 left-0 z-50 bg-gradient-to-b from-black/80 to-transparent">
          <button
            onClick={onClose}
            className="p-2 text-white hover:bg-neutral-800 rounded-full transition-colors cursor-pointer"
          >
            <Minimize2 className="w-6 h-6" />
          </button>
          <h3 className="text-white text-sm font-semibold truncate flex-1 text-center px-4"></h3>
          <div className="w-10"></div>
        </div>

        {/* Video Player (Hidden conceptually but needed for API) */}
        <div className="w-full h-[55vh] md:h-auto md:aspect-auto md:flex-1 relative flex items-center justify-center bg-black overflow-hidden group/player">
          <div className="absolute top-0 left-0 opacity-0 pointer-events-none w-0 h-0">
             <div ref={containerRef} id="yt-player"></div>
          </div>
          
          {videoId ? (
            <>
              {/* Full Mask to hide the entire video while it plays in the background */}
              <div className="absolute inset-0 bg-black z-10 pointer-events-none flex items-center justify-center">
                <div className="relative flex items-center justify-center w-full h-full">
                  {/* Red and Black Glowing Sound Ring Visualizer */}
                  {isPlaying && (
                    <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center overflow-hidden">
                      {/* Dynamic Glow Aura */}
                      <div className="absolute w-[100vw] h-[100vw] md:w-[60vw] md:h-[60vw] bg-gradient-to-br from-red-600/10 via-black to-red-900/10 blur-[80px] rounded-full animate-pulse aspect-square"></div>

                      {/* Rotating and scaling sound rings */}
                      <div className="absolute flex items-center justify-center w-48 h-48 md:w-56 md:h-56 rounded-full">
                        {/* Outer Red Ring */}
                        <div
                          className="absolute w-[120%] h-[120%] rounded-full border-[3px] border-red-500/80 border-t-black/80 animate-[spin_3s_linear_infinite]"
                          style={{
                            boxShadow:
                              "0 0 20px rgba(220,38,38,0.6), inset 0 0 15px rgba(220,38,38,0.3)",
                            animationDirection: "normal",
                          }}
                        ></div>

                        {/* Inner Black Ring */}
                        <div
                          className="absolute w-[110%] h-[110%] rounded-full border-[4px] border-black border-b-red-600 animate-[spin_4s_linear_infinite]"
                          style={{
                            boxShadow:
                              "0 0 25px rgba(0,0,0,0.8), inset 0 0 10px rgba(0,0,0,0.5)",
                            animationDirection: "reverse",
                          }}
                        ></div>

                        {/* Pulsing Pitch Ring */}
                        <div
                          className="absolute inset-[-10%] rounded-full border border-red-500/50"
                          style={{
                            animation:
                              "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
                          }}
                        ></div>
                        <div
                          className="absolute inset-[-5%] rounded-full border border-black/50"
                          style={{
                            animation:
                              "ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite",
                            animationDelay: "0.4s",
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Logo Image */}
                  <div
                    className={`relative z-20 w-48 h-48 md:w-56 md:h-56 rounded-full overflow-hidden border-[4px] border-neutral-900 ring-4 ring-black shadow-[0_0_40px_rgba(220,38,38,0.4)] flex items-center justify-center bg-zinc-900 transition-all ${isPlaying ? "scale-100" : "scale-100 grayscale-[0.8]"}`}
                  >
                    <img
                      src={currentSong.thumbnailUrl || customLogo}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full w-full text-neutral-500">
              Invalid YouTube URL
            </div>
          )}
        </div>

        {/* Player Controls */}
        <div 
          className="w-full flex-1 md:flex-none p-6 pb-20 md:pb-10 flex flex-col justify-center gap-6 z-10 bg-black relative touch-none"
          onTouchStart={(e) => {
             const startY = e.touches[0].clientY;
             const handleTouchEnd = (endE: TouchEvent) => {
                if (startY - endE.changedTouches[0].clientY > 50) {
                   setShowMobileQueue(true);
                }
                window.removeEventListener('touchend', handleTouchEnd);
             };
             window.addEventListener('touchend', handleTouchEnd);
          }}
        >
          {/* Pull up indicator for mobile */}
          <div 
             className="absolute -top-8 left-1/2 -translate-x-1/2 h-8 flex flex-col justify-end items-center pb-1 md:hidden cursor-pointer"
             onClick={() => setShowMobileQueue(true)}
          >
             <div className="w-10 h-1 bg-neutral-600 rounded-full opacity-50 mb-1"></div>
             <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold animate-pulse">Swipe Up for Queue</span>
          </div>
          
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-1 line-clamp-2">
              {currentSong.title}
            </h2>
            <p className="text-purple-400 text-sm md:text-base">
              {playlist?.name || "Live Play"}
            </p>
          </div>

          <div className="w-full flex items-center justify-between gap-3 mb-2">
            <span className="text-xs text-neutral-400 font-mono w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <div className="flex-1 relative flex items-center h-6 custom-range-container" ref={progressContainerRef}>
               <input 
                 ref={sliderRef}
                 type="range"
                 min="0"
                 max={duration || 100}
                 value={currentTime}
                 onInput={handleSliderInput}
                 onChange={handleSliderChange}
                 className="w-full absolute inset-0 opacity-0 cursor-pointer z-10 h-full"
               />
               <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden pointer-events-none relative shadow-inner">
                  <div 
                    className="h-full bg-red-600 absolute top-0 left-0 rounded-full"
                    style={{ width: `var(--played-percent, 0%)` }}
                  ></div>
               </div>
               <div 
                  className="w-4 h-4 bg-white border-2 border-red-600 rounded-full absolute pointer-events-none shadow-[0_0_10px_rgba(255,0,0,0.8)] z-0"
                  style={{ left: `calc(var(--played-percent, 0%) - 8px)` }}
               ></div>
            </div>
            <span className="text-xs text-neutral-400 font-mono w-12 text-left">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-center gap-8">
            <button
              onClick={seekBackward}
              className="text-neutral-400 hover:text-white transition-colors text-xs font-bold font-mono tracking-widest shrink-0 ml-4 p-2"
            >
              -5s
            </button>
            <button
              onClick={skipPrev}
              className="text-neutral-400 hover:text-white transition-colors p-2"
            >
              <SkipBack className="w-8 h-8 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              className="flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)] w-16 h-16 shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-current" />
              ) : (
                <Play className="w-8 h-8 fill-current ml-1.5" />
              )}
            </button>

            <button
              onClick={skipNext}
              className="text-neutral-400 hover:text-white transition-colors p-2"
            >
              <SkipForward className="w-8 h-8 fill-current" />
            </button>
            <button
              onClick={seekForward}
              className="text-neutral-400 hover:text-white transition-colors text-xs font-bold font-mono tracking-widest shrink-0 mr-4 p-2"
            >
              +5s
            </button>
          </div>
        </div>
      </div>

      {/* Up Next / Queue Area */}
      <div 
        className={`absolute md:relative bottom-0 left-0 right-0 md:bottom-auto w-full md:w-[480px] lg:w-[540px] flex-shrink-0 bg-neutral-900/95 backdrop-blur-xl md:bg-neutral-900 border-t md:border-t-0 md:border-l border-neutral-800 flex flex-col overflow-hidden max-h-[75vh] md:max-h-full transition-transform duration-300 z-50 rounded-t-3xl md:rounded-none
        ${showMobileQueue ? "translate-y-0" : "translate-y-full md:translate-y-0"}`}
      >
        <div 
           className="p-5 border-b border-neutral-800 flex items-center justify-between shadow-sm cursor-pointer md:cursor-auto"
           onClick={() => setShowMobileQueue(false)}
        >
          <div className="w-12 h-1.5 bg-neutral-700/50 rounded-full absolute top-2 left-1/2 -translate-x-1/2 md:hidden"></div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mt-2 md:mt-0">
            <Music className="w-5 h-5 text-purple-400" />
            Up Next
          </h3>
          <span className="text-xs font-semibold text-neutral-500 bg-neutral-800 px-3 py-1 rounded-full mt-2 md:mt-0">
            {playlistSongs.length} songs
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 touch-pan-y" style={{ height: "calc(75vh - 70px)" }}>
          {playlistSongs.length === 0 ? (
             <div className="text-center text-neutral-500 py-10 text-sm">No songs in queue</div>
          ) : playlistSongs.map((song, index) => {
            const isCurrent = song.id === currentSong.id;
            return (
              <div
                key={song.id}
                onClick={() => {
                   onPlaySong(song);
                   setShowMobileQueue(false);
                }}
                className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors group
                      ${isCurrent ? "bg-purple-500/20" : "hover:bg-neutral-800"}`}
              >
                <div className="relative w-24 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-neutral-800">
                  <img
                    src={song.thumbnailUrl}
                    alt="thumbnail"
                    className="w-full h-full object-cover"
                  />
                  {isCurrent && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="flex gap-1 items-end h-4">
                        <div className="w-1 bg-purple-500 h-full animate-[bounce_1s_infinite] origin-bottom"></div>
                        <div className="w-1 bg-purple-500 h-1/2 animate-[bounce_1s_infinite_0.2s] origin-bottom"></div>
                        <div className="w-1 bg-purple-500 h-3/4 animate-[bounce_1s_infinite_0.4s] origin-bottom"></div>
                      </div>
                    </div>
                  )}
                  {!isCurrent && (
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p
                    className={`text-sm font-semibold truncate ${isCurrent ? "text-purple-400" : "text-white"}`}
                  >
                    {song.title}
                  </p>
                  <p className="text-xs text-neutral-500 truncate mt-1">
                    {db.playlists.find((p) => p.id === song.playlistId)?.name ||
                      "YouTube"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
