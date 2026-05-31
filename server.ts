import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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
      
      const lowerQuery = query.toLowerCase().trim();

      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('search_cache')
            .select('results')
            .eq('query', lowerQuery)
            .single();

          if (!error && data && data.results) {
            console.log(`[Supabase Cache Hit] Serving '${lowerQuery}'`);
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

      console.log(`[Cache Miss] Fetching '${query}' from YouTube API`);
      const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "AIzaSyDuzJFgEdjT-0irA3AJMQdCRQ90G6O5-Us";
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
          throw new Error(data.error?.message || "YouTube API error");
      }
      
      if (supabase) {
        try {
           await supabase.from('search_cache').upsert({ query: lowerQuery, results: data });
        } catch (err) {
           console.warn("Supabase write error:", err);
        }
      } else {
        searchCache.set(lowerQuery, data);
      }
      res.json(data);
    } catch (error: any) {
      console.error("YouTube search error:", error);
      res.status(500).json({ error: error.message || "Failed to search YouTube" });
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
    } catch (error: any) {
      console.error("YouTube video error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch YouTube video details" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
