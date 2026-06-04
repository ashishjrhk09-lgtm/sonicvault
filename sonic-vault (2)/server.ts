import express from "express";
import cors from "cors";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json()); // For parsing json bodies in POST requests

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Nodemailer config
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
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
    
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
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
        <h1 style="color: #A855F7;">Welcome to Sonic Vault 🎵</h1>
        <p style="margin-bottom: 20px;">Thank you for joining Sonic Vault.</p>
        <p>Create playlists.</p>
        <p>Discover music.</p>
        <p style="margin-bottom: 40px;">Enjoy your personalized experience.</p>
        <a href="${process.env.FRONTEND_URL || 'https://sonicvault.app'}" style="background-color: #A855F7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Start Listening</a>
        <p style="margin-top: 50px; font-size: 12px; color: #888;">Created with ❤️ by Sonic Team</p>
      </div>
    `;

    if (process.env.SMTP_USER && process.env.SMTP_PASS && profile.email) {
       await transporter.sendMail({
         from: '"Sonic Vault" <' + process.env.SMTP_USER + '>',
         to: profile.email,
         subject: "🎵 Welcome to Sonic Vault",
         html: htmlContent,
       });
    }

    await supabase.from('profiles').update({ welcome_sent: true }).eq('id', userId);
    
    res.json({ success: true });
  } catch (err: any) {
    console.error("Welcome email error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/youtube/suggest", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.json([]);
      return;
    }
    const response = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`);
    const data = await response.json();
    res.json(data[1] || []);
  } catch (error) {
    res.status(500).json({ error: "Suggestion error" });
  }
});

// In-memory caching for database mock fallback
const searchCache = new Map<string, any>();

// YouTube API Search
app.get("/api/youtube/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: "No query provided" });
      return;
    }

    const enhancedQuery = query + " song";
    const lowerQuery = enhancedQuery.toLowerCase().trim();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("search_cache")
          .select("results")
          .eq("query", lowerQuery)
          .single();

        if (!error && data && data.results) {
          console.log(`[Supabase Cache Hit] Serving '${lowerQuery}'`);
          // Log search asynchronously
          const userId = req.headers['x-user-id'] || 'anonymous';
          supabase.from('search_logs').insert({ query: lowerQuery, user_id: userId, source: 'cache', created_at: new Date().toISOString() }).then(() => {}, () => {});
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
    const YOUTUBE_API_KEY =
      process.env.YOUTUBE_API_KEY || "AIzaSyDuzJFgEdjT-0irA3AJMQdCRQ90G6O5-Us";
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(enhancedQuery)}&type=video&key=${YOUTUBE_API_KEY}`;

    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchResponse.ok) {
      throw new Error(searchData.error?.message || "YouTube API error");
    }

    const videoIds = (searchData.items || []).map((item: any) => item.id.videoId).filter(Boolean).join(',');
    
    let finalItems: any[] = [];
    if (videoIds) {
       const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
       const videosResponse = await fetch(videosUrl);
       const videosData = await videosResponse.json();
       
       if (videosResponse.ok && videosData.items) {
           const blockedKeywords = ['short', 'shorts', 'podcast', 'interview', 'movie', 'trailer', 'reaction', 'news', 'live', 'vlog'];
           const allowedKeywords = ['song', 'songs', 'music', 'audio', 'official audio', 'lyrical', 'lyrics'];
           
           const parseISO8601Duration = (duration: string) => {
              const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
              if (!match) return 0;
              const hours = parseInt(match[1]) || 0;
              const minutes = parseInt(match[2]) || 0;
              const seconds = parseInt(match[3]) || 0;
              return hours * 3600 + minutes * 60 + seconds;
           };

           finalItems = videosData.items.filter((video: any) => {
               const duration = parseISO8601Duration(video.contentDetails?.duration || '');
               if (duration < 60) return false;
               
               const title = (video.snippet?.title || '').toLowerCase();
               
               // Exact word boundary matching for some keywords to avoid false positives?
               // The prompt asks to "Convert title to lowercase. Blocked Keywords: short, shorts, podcast..."
               // Standard includes is probably fine for these since they aren't often part of other words, 
               // but a regex with word bounds is safer. Let's use simple includes.
               if (blockedKeywords.some(kw => title.includes(kw))) return false;
               
               return true;
           }).map((video: any) => {
               let score = 0;
               const title = (video.snippet?.title || '').toLowerCase();
               if (allowedKeywords.some(kw => title.includes(kw))) score += 1;
               return { ...video, id: { videoId: video.id }, _score: score };
           }).sort((a: any, b: any) => b._score - a._score).map((video: any) => {
               delete video._score;
               return video;
           }).slice(0, 15);
       }
    }

    const dataToCacheAndReturn = { ...searchData, items: finalItems };

    if (supabase) {
      try {
        await supabase
          .from("search_cache")
          .upsert({ query: lowerQuery, results: dataToCacheAndReturn });
        // Log search asynchronously
        const userId = req.headers['x-user-id'] || 'anonymous';
        supabase.from('search_logs').insert({ query: lowerQuery, user_id: userId, source: 'api', created_at: new Date().toISOString() }).then(() => {}, () => {});
      } catch (err) {
        console.warn("Supabase write error:", err);
      }
    } else {
      searchCache.set(lowerQuery, dataToCacheAndReturn);
    }
    res.json(dataToCacheAndReturn);
  } catch (error: any) {
    console.error("YouTube search error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to search YouTube" });
  }
});

// YouTube API Video Details
app.get("/api/youtube/video", async (req, res) => {
  try {
    const videoId = req.query.id as string;
    if (!videoId) {
      res.status(400).json({ error: "No videoId provided" });
      return;
    }

    const YOUTUBE_API_KEY =
      process.env.YOUTUBE_API_KEY || "AIzaSyDuzJFgEdjT-0irA3AJMQdCRQ90G6O5-Us";
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
  } catch (error: any) {
    console.error("YouTube video error:", error);
    res
      .status(500)
      .json({
        error: error.message || "Failed to fetch YouTube video details",
      });
  }
});

// Home Screen Songs API (fetch from cache database)
app.get("/api/home/songs", async (req, res) => {
  const blockedKeywords = ['short', 'shorts', 'podcast', 'interview', 'movie', 'trailer', 'reaction', 'news', 'live', 'vlog'];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('search_cache')
        .select('results')
        .limit(20); 

      if (!error && data) {
         let allItems: any[] = [];
         data.forEach((row: any) => {
            if (row.results && row.results.items) {
               allItems = [...allItems, ...row.results.items.filter((i: any) => {
                   if (!i.id?.videoId) return false;
                   const title = (i.snippet?.title || '').toLowerCase();
                   if (blockedKeywords.some(kw => title.includes(kw))) return false;
                   return true;
               })];
            }
         });
         // Shuffle and pick 50
         allItems = allItems.sort(() => 0.5 - Math.random()).slice(0, 50);
         res.json({ items: allItems });
         return;
      }
    } catch(err) {
      console.warn("Supabase read for home page error:", err);
    }
  }

  let allItems: any[] = [];
  searchCache.forEach((value) => {
     if (value && value.items) {
         allItems = [...allItems, ...value.items.filter((i: any) => {
             if (!i.id?.videoId) return false;
             const title = (i.snippet?.title || '').toLowerCase();
             if (blockedKeywords.some(kw => title.includes(kw))) return false;
             return true;
         })];
     }
  });
  allItems = allItems.sort(() => 0.5 - Math.random()).slice(0, 50);
  res.json({ items: allItems });
});

// Export the express app for serverless functions (like Vercel)
export default app;

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in non-serverless production environments (Cloud Run/Render)
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start the server if not running in Vercel Serverless environment
if (process.env.VERCEL !== "1") {
  startServer();
}
