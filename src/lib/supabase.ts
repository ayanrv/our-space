import { createClient } from "@supabase/supabase-js";
export const portfolioDemo = import.meta.env.VITE_PORTFOLIO_DEMO === "true";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  !portfolioDemo && url && key ? createClient(url, key) : null;
export const demoEnabled =
  portfolioDemo ||
  import.meta.env.VITE_ENABLE_DEMO === "true" ||
  import.meta.env.DEV;
