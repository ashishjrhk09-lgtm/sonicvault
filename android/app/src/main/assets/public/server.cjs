var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_path = __toESM(require("path"), 1);
var import_supabase_js = require("@supabase/supabase-js");
var import_nodemailer = __toESM(require("nodemailer"), 1);
var app = (0, import_express.default)();
var PORT = Number(process.env.PORT) || 3e3;
app.use((0, import_cors.default)());
app.use(import_express.default.json());
var supabaseUrl = process.env.SUPABASE_URL;
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
var supabase = supabaseUrl && supabaseKey ? (0, import_supabase_js.createClient)(supabaseUrl, supabaseKey) : null;
var transporter = import_nodemailer.default.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
app.post("/api/send-welcome", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: "Missing userId" });
      return;
    }
    if (!supabase) {
      res.status(500).json({ error: "Supabase not configured" });
      return;
    }
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error || !profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    if (profile.welcome_sent) {
      res.json({ message: "Welcome already sent" });
      return;
    }
    const htmlContent = `
      <div style="background-color: #000; color: #fff; font-family: sans-serif; padding: 40px; text-align: center;">
        <h1 style="color: #A855F7;">Welcome to Sonic Vault \u{1F3B5}</h1>
        <p style="margin-bottom: 20px;">Thank you for joining Sonic Vault.</p>
        <p>Create playlists.</p>
        <p>Discover music.</p>
        <p style="margin-bottom: 40px;">Enjoy your personalized experience.</p>
        <a href="${process.env.FRONTEND_URL || "https://sonicvault.app"}" style="background-color: #A855F7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Start Listening</a>
        <p style="margin-top: 50px; font-size: 12px; color: #888;">Created with \u2764\uFE0F by Sonic Team</p>
      </div>
    `;
    if (process.env.SMTP_USER && process.env.SMTP_PASS && profile.email) {
      await transporter.sendMail({
        from: '"Sonic Vault" <' + process.env.SMTP_USER + ">",
        to: profile.email,
        subject: "\u{1F3B5} Welcome to Sonic Vault",
        html: htmlContent
      });
    }
    await supabase.from("profiles").update({ welcome_sent: true }).eq("id", userId);
    res.json({ success: true });
  } catch (err) {
    console.error("Welcome email error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/youtube/suggest", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      res.json([]);
      return;
    }
    const enhancedQuery = query.toLowerCase().includes("song") ? query : query + " song";
    const response = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(enhancedQuery)}`);
    const data = await response.json();
    res.json(data[1] || []);
  } catch (error) {
    res.status(500).json({ error: "Suggestion error" });
  }
});
var searchCache = /* @__PURE__ */ new Map();
app.get("/api/youtube/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      res.status(400).json({ error: "No query provided" });
      return;
    }
    const enhancedQuery = query + " song";
    const lowerQuery = enhancedQuery.toLowerCase().trim();
    if (supabase) {
      try {
        const { data, error } = await supabase.from("search_cache").select("results").eq("query", lowerQuery).single();
        if (!error && data && data.results) {
          console.log(`[Supabase Cache Hit] Serving '${lowerQuery}'`);
          const userId = req.headers["x-user-id"] || "anonymous";
          supabase.from("search_logs").insert({ query: lowerQuery, user_id: userId, source: "cache", created_at: (/* @__PURE__ */ new Date()).toISOString() }).then(() => {
          }, () => {
          });
          res.json(data.results);
          return;
        }
      } catch (err) {
        console.warn("Supabase read error:", err);
      }
    } else if (searchCache.has(lowerQuery)) {
      console.log(`[Memory Cache Hit] Serving '${query}'`);
      res.json(searchCache.get(lowerQuery));
      return;
    }
    console.log(`[Cache Miss] Fetching '${enhancedQuery}' from YouTube API`);
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "AIzaSyDuzJFgEdjT-0irA3AJMQdCRQ90G6O5-Us";
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(enhancedQuery)}&type=video&key=${YOUTUBE_API_KEY}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    if (!searchResponse.ok) {
      throw new Error(searchData.error?.message || "YouTube API error");
    }
    const videoIds = (searchData.items || []).map((item) => item.id.videoId).filter(Boolean).join(",");
    let finalItems = [];
    if (videoIds) {
      const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
      const videosResponse = await fetch(videosUrl);
      const videosData = await videosResponse.json();
      if (videosResponse.ok && videosData.items) {
        const blockedKeywords = ["short", "shorts", "podcast", "interview", "reaction", "news", "live", "stream", "movie", "film", "trailer", "teaser", "review", "vlog", "episode", "web series"];
        const allowedKeywords = ["song", "songs", "music", "audio", "official audio", "lyrics", "lyrical", "album"];
        const parseISO8601Duration = (duration) => {
          const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          if (!match) return 0;
          const hours = parseInt(match[1] || "0", 10);
          const minutes = parseInt(match[2] || "0", 10);
          const seconds = parseInt(match[3] || "0", 10);
          return hours * 3600 + minutes * 60 + seconds;
        };
        finalItems = videosData.items.filter((video) => {
          const duration = parseISO8601Duration(video.contentDetails?.duration || "");
          if (duration < 60) return false;
          const title = (video.snippet?.title || "").toLowerCase();
          const channelTitle = (video.snippet?.channelTitle || "").toLowerCase();
          const combinedText = title + " " + channelTitle;
          const isBlocked = blockedKeywords.some((kw) => {
            const regex = new RegExp(`\\b${kw}\\b`, "i");
            return regex.test(title) || regex.test(channelTitle);
          });
          if (video.snippet?.liveBroadcastContent !== "none" && video.snippet?.liveBroadcastContent !== void 0) {
            return false;
          }
          if (isBlocked) return false;
          return true;
        }).map((video) => {
          let score = 0;
          const title = (video.snippet?.title || "").toLowerCase();
          if (allowedKeywords.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(title))) score += 1;
          return { ...video, id: { videoId: video.id }, _score: score };
        }).sort((a, b) => b._score - a._score).map((video) => {
          delete video._score;
          return video;
        }).slice(0, 15);
      }
    }
    const dataToCacheAndReturn = { ...searchData, items: finalItems };
    if (supabase) {
      try {
        await supabase.from("search_cache").upsert({ query: lowerQuery, results: dataToCacheAndReturn });
        const userId = Array.isArray(req.headers["x-user-id"]) ? req.headers["x-user-id"][0] : req.headers["x-user-id"] || "anonymous";
        supabase.from("search_logs").insert({ query: lowerQuery, user_id: userId, source: "api", created_at: (/* @__PURE__ */ new Date()).toISOString() }).then(() => {
        }, () => {
        });
      } catch (err) {
        console.warn("Supabase write error:", err);
      }
    } else {
      if (searchCache.size > 100) {
        const firstKey = searchCache.keys().next().value;
        if (firstKey) searchCache.delete(firstKey);
      }
      searchCache.set(lowerQuery, dataToCacheAndReturn);
    }
    res.json(dataToCacheAndReturn);
  } catch (error) {
    console.error("YouTube search error:", error);
    res.status(500).json({ error: error.message || "Failed to search YouTube" });
  }
});
app.get("/api/youtube/video", async (req, res) => {
  try {
    const videoId = req.query.id;
    if (!videoId) {
      res.status(400).json({ error: "No videoId provided" });
      return;
    }
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "AIzaSyDuzJFgEdjT-0irA3AJMQdCRQ90G6O5-Us";
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "YouTube API error");
    }
    if (!data.items || data.items.length === 0) {
      throw new Error("Video not found");
    }
    res.json(data.items[0]);
  } catch (error) {
    console.error("YouTube video error:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch YouTube video details"
    });
  }
});
app.get("/api/home/songs", async (req, res) => {
  const blockedKeywords = ["short", "shorts", "podcast", "interview", "reaction", "news", "live", "stream", "movie", "film", "trailer", "teaser", "review", "vlog", "episode", "web series"];
  let allItems = [];
  if (supabase) {
    try {
      const { data, error } = await supabase.from("search_cache").select("results").limit(20);
      if (!error && data) {
        data.forEach((row) => {
          if (row.results && row.results.items) {
            allItems = [...allItems, ...row.results.items.filter((i) => {
              if (!i.id?.videoId) return false;
              const title = (i.snippet?.title || "").toLowerCase();
              if (blockedKeywords.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(title))) return false;
              return true;
            })];
          }
        });
      }
    } catch (err) {
      console.warn("Supabase read for home page error:", err);
    }
  }
  if (allItems.length < 10) {
    searchCache.forEach((value) => {
      if (value && value.items) {
        allItems = [...allItems, ...value.items.filter((i) => {
          if (!i.id?.videoId) return false;
          const title = (i.snippet?.title || "").toLowerCase();
          if (blockedKeywords.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(title))) return false;
          return true;
        })];
      }
    });
  }
  if (allItems.length < 15) {
    try {
      const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "AIzaSyDuzJFgEdjT-0irA3AJMQdCRQ90G6O5-Us";
      const query = "latest popular music songs";
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=30&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();
      if (searchResponse.ok && searchData.items) {
        allItems = [...allItems, ...searchData.items.filter((i) => {
          if (!i.id?.videoId) return false;
          const title = (i.snippet?.title || "").toLowerCase();
          if (blockedKeywords.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(title))) return false;
          return true;
        })];
      }
    } catch (err) {
      console.warn("Fallback api for home failed", err);
    }
  }
  allItems = allItems.sort(() => 0.5 - Math.random()).slice(0, 50);
  res.json({ items: allItems });
});
var server_default = app;
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
if (process.env.VERCEL !== "1") {
  startServer();
}
//# sourceMappingURL=server.cjs.map
