import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL         = "https://trpwndxxwambskkwvpws.supabase.co";
const SUPABASE_SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

if (!SUPABASE_SERVICE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY is not set"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_PASSWORD = "Cashloop2026";
const REFERRAL_BONUS = 3000;
const MIN_WATCH_SECS = 60;
const MAX_FAILURES   = 3;

const TIER_CONFIGS: Record<number, { dailyLimit: number; rewardAmount: number; label: string; activationCode: string; canWithdraw: boolean }> = {
  1: { dailyLimit: 2,   rewardAmount: 500,  label: "Free",    activationCode: "",            canWithdraw: false },
  2: { dailyLimit: 5,   rewardAmount: 600,  label: "Silver",  activationCode: "TIER2-5000",  canWithdraw: true  },
  3: { dailyLimit: 10,  rewardAmount: 700,  label: "Gold",    activationCode: "TIER3-10000", canWithdraw: true  },
  4: { dailyLimit: 15,  rewardAmount: 800,  label: "Diamond", activationCode: "TIER4-15000", canWithdraw: true  },
  5: { dailyLimit: 999, rewardAmount: 1000, label: "Elite",   activationCode: "TIER5-20000", canWithdraw: true  },
};

const VIDEO_POOL = [
  "dQw4w9WgXcQ","_T8mS8j2GkM","J---aiyznGQ","v3_f6UvVpLg","V6p86LhG-pY",
  "h8n6S6q7h7w","2WKgLyP22xI","Hk2QJefdbtY","SoiQPKQnMkg","BaW_jenozKc",
  "9bZkp7q19f0","kJQP7kiw5Fk","fRh_vgS2dFE","OPf0YbXqDm0","YqeW9_5kURI",
  "60ItHLz5WEA","nfWlot6h_JM","pRpeEdMmmQ0","CevxZvSJLk8","uelHwf8o7_U",
  "GugM42e7c5g","QH2-TGUlwu4","lp-EO5I60KA","ASO_zypdnsQ","ZZ5LpwO-An4",
  "hT_nvWreIhg","XSGBVzeBUbk","oeikFcFoGBs","tgbNymZ7vqY","e-ORhEE9VVg",
  "7PCkvCPvDXk","09R8_2nJtjg","pMg5tMMHxbY","2vjPBrBU-TM","lAIGb1lfpBw",
  "K4TOrB7at0Y","JGwWNGJdvx8","yPYZpwSpKmA","3AtDnEC4zak","RgKAFK5djSk",
  "OgqQ_2dIn8M","CduA0TULnow","NUsoVlDFqZg","xpVfcZ0ZcFM","IBa4kyd5ptE",
  "6Ejga4kZUd8","8SbUC-UaAxE","M7lc1UVf-VE","hFZFjoX2cGg","YkgkThdzX-8",
];

const PRIZES = [
  { value: 50,   weight: 25, label: "₦50"                 },
  { value: 100,  weight: 20, label: "₦100"                },
  { value: 200,  weight: 15, label: "₦200"                },
  { value: 300,  weight: 10, label: "₦300"                },
  { value: 500,  weight: 12, label: "₦500"                },
  { value: 1000, weight: 8,  label: "₦1,000"              },
  { value: null, weight: 6,  label: "Try Again"           },
  { value: -1,   weight: 4,  label: "Free Tier 2 Upgrade" },
];

function todayUTC() { return new Date().toISOString().slice(0, 10); }
function getTierCfg(t: number) { return TIER_CONFIGS[t] ?? TIER_CONFIGS[1]; }

function seededShuffle(arr: string[], seed: number) {
  const a = [...arr]; let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getDailyVideoList(userId: string) {
  const today = todayUTC().replace(/-/g, "");
  const seed  = parseInt(today, 10) + parseInt(userId.replace(/-/g, "").slice(-8), 16);
  return seededShuffle(VIDEO_POOL, seed);
}

function pickPrize() {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let rand = Math.random() * total;
  for (const p of PRIZES) { rand -= p.weight; if (rand <= 0) return p; }
  return PRIZES[PRIZES.length - 1];
}

async function genUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const { data } = await supabase.from("profiles").select("id").eq("referral_code", code).single();
    if (!data) return code;
  }
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

type Profile = {
  id: string; username: string; referral_code: string; referred_by: string | null;
  balance: number; tier: number; is_banned: boolean; code_failures: number;
};

async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error || !data) throw new Error("Profile not found");
  return data as Profile;
}

const app = express();
app.use(cors());
app.use(express.json());

interface AuthUser { userId: string; email: string; }
declare global { namespace Express { interface Request { authUser?: AuthUser; } } }

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["authorization"];
  if (!header?.startsWith("Bearer ")) { res.status(401).json({ error: "Authentication required" }); return; }
  const { data: { user }, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !user) { res.status(401).json({ error: "Invalid or expired token" }); return; }
  req.authUser = { userId: user.id, email: user.email ?? "" };
  next();
}

function adminAuth(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.post("/api/auth/register-profile", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.userId;
    const { username, referralCode: refCode } = req.body as { username?: string; referralCode?: string };

    if (!username?.trim() || username.trim().length < 3) {
      res.status(400).json({ error: "Username must be at least 3 characters." }); return;
    }

    const { data: existing } = await supabase.from("profiles").select("id, username, referral_code, balance, tier").eq("id", userId).single();
    if (existing) {
      const p = existing as { id: string; username: string; referral_code: string; balance: number; tier: number };
      res.json({ user: { id: p.id, username: p.username, referralCode: p.referral_code, balance: p.balance, tier: p.tier } });
      return;
    }

    const { data: taken } = await supabase.from("profiles").select("id").eq("username", username.trim()).single();
    if (taken) { res.status(400).json({ error: "This username is already taken." }); return; }

    const myReferralCode = await genUniqueReferralCode();

    let referredBy: string | null = null;
    if (refCode) {
      const { data: referrer } = await supabase.from("profiles").select("id").eq("referral_code", refCode.toUpperCase().trim()).single();
      if (referrer) referredBy = (referrer as { id: string }).id;
    }

    const { data: profile, error: insertErr } = await supabase.from("profiles").insert({
      id: userId, username: username.trim(), referral_code: myReferralCode,
      referred_by: referredBy, balance: 3000, tier: 1, is_banned: false, code_failures: 0,
    }).select().single();

    if (insertErr || !profile) { res.status(500).json({ error: "Profile creation failed." }); return; }

    const p = profile as { id: string; username: string; referral_code: string; balance: number; tier: number };
    res.json({ user: { id: p.id, username: p.username, referralCode: p.referral_code, balance: p.balance, tier: p.tier } });
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const p = await getProfile(req.authUser!.userId);
    if (p.is_banned) { res.status(403).json({ error: "Account banned", banned: true }); return; }
    res.json({ id: p.id, username: p.username, email: req.authUser!.email, referralCode: p.referral_code, balance: p.balance, tier: p.tier, banned: p.is_banned });
  } catch { res.status(500).json({ error: "Failed to fetch profile" }); }
});

// ── USER ──────────────────────────────────────────────────────────────────────

app.get("/api/user/status", requireAuth, async (req, res) => {
  try {
    const p = await getProfile(req.authUser!.userId);
    res.json({ banned: p.is_banned, codeFailures: p.code_failures });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/user/profile", requireAuth, async (req, res) => {
  try {
    const p = await getProfile(req.authUser!.userId);
    res.json({ id: p.id, username: p.username, email: req.authUser!.email, referralCode: p.referral_code });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/user/balance", requireAuth, async (req, res) => {
  try {
    const p = await getProfile(req.authUser!.userId);
    res.json({ balance: p.balance, tier: p.tier, canWithdraw: getTierCfg(p.tier).canWithdraw });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/user/queue", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.userId;
    const p = await getProfile(userId);
    if (p.is_banned) { res.status(403).json({ error: "Account banned" }); return; }

    const cfg   = getTierCfg(p.tier);
    const today = todayUTC();

    const { data: progress } = await supabase
      .from("daily_progress").select("youtube_id")
      .eq("user_id", userId).eq("completed_date", today);

    const completedToday = progress?.length ?? 0;
    const limitReached   = completedToday >= cfg.dailyLimit;
    const dailyVideos    = getDailyVideoList(userId);

    const slotsToShow = limitReached
      ? completedToday
      : cfg.dailyLimit >= 999
        ? Math.min(10, dailyVideos.length)
        : Math.min(cfg.dailyLimit, dailyVideos.length);

    const videos = Array.from({ length: slotsToShow }, (_, i) => ({
      youtubeId: dailyVideos[i % dailyVideos.length],
      position: i,
      completed: i < completedToday,
    }));

    res.json({
      videos,
      currentIndex: limitReached ? slotsToShow : completedToday,
      allComplete: limitReached,
      dailyLimit: cfg.dailyLimit,
      limitReached,
      tier: p.tier,
      rewardAmount: cfg.rewardAmount,
      completedToday,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

app.post("/api/user/reward", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.userId;
    const { videoId, watchedSeconds } = req.body as { videoId: string; watchedSeconds: number };

    if (watchedSeconds < MIN_WATCH_SECS) { res.status(400).json({ error: "Must watch at least 60 seconds" }); return; }

    const p = await getProfile(userId);
    if (p.is_banned) { res.status(403).json({ error: "Account banned" }); return; }

    const cfg   = getTierCfg(p.tier);
    const today = todayUTC();

    const { data: progress } = await supabase
      .from("daily_progress").select("id")
      .eq("user_id", userId).eq("completed_date", today);

    const completedToday = progress?.length ?? 0;
    if (completedToday >= cfg.dailyLimit) { res.status(400).json({ error: "Daily video limit reached" }); return; }

    const dailyVideos   = getDailyVideoList(userId);
    const expectedVideo = dailyVideos[completedToday % dailyVideos.length];
    if (videoId !== expectedVideo) { res.status(400).json({ error: "Video not in expected queue position" }); return; }

    await supabase.from("daily_progress").insert({ user_id: userId, youtube_id: videoId, completed_date: today });

    const newBalance = p.balance + cfg.rewardAmount;
    await supabase.from("profiles").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", userId);

    res.json({ balance: newBalance, tier: p.tier, canWithdraw: getTierCfg(p.tier).canWithdraw });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

app.post("/api/user/activate", requireAuth, async (req, res) => {
  try {
    const userId     = req.authUser!.userId;
    const { code }   = req.body as { code: string };
    const normalised = code.trim().toUpperCase();

    const p = await getProfile(userId);
    if (p.is_banned) { res.status(403).json({ error: "Your account has been banned." }); return; }

    const hardcoded = Object.entries(TIER_CONFIGS).find(([, cfg]) => cfg.activationCode && cfg.activationCode === normalised);

    let generatedCode: { id: number; tier: number } | null = null;
    if (!hardcoded) {
      const { data } = await supabase.from("activation_codes").select("id, tier")
        .eq("code", normalised).eq("used", false).single();
      generatedCode = data as typeof generatedCode;
    }

    if (!hardcoded && !generatedCode) {
      const newFailures = p.code_failures + 1;
      const shouldBan   = newFailures >= MAX_FAILURES;
      await supabase.from("profiles")
        .update({ code_failures: newFailures, is_banned: shouldBan, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (shouldBan) {
        res.status(403).json({ error: "Account banned due to 3 failed activation attempts.", banned: true }); return;
      }
      res.status(400).json({ error: `Invalid code. ${MAX_FAILURES - newFailures} attempt(s) remaining.`, failuresLeft: MAX_FAILURES - newFailures });
      return;
    }

    const newTier = hardcoded ? Number(hardcoded[0]) : generatedCode!.tier;
    const newCfg  = TIER_CONFIGS[newTier];

    if (p.tier >= newTier) { res.status(400).json({ error: `You are already on Tier ${p.tier} or higher.` }); return; }

    if (generatedCode) {
      await supabase.from("activation_codes").update({ used: true, used_by: userId }).eq("id", generatedCode.id);
    }

    await supabase.from("profiles")
      .update({ tier: newTier, code_failures: 0, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (newTier >= 2 && p.referred_by) {
      const { data: referrer } = await supabase.from("profiles")
        .select("balance, is_banned").eq("id", p.referred_by).single();
      if (referrer && !(referrer as { is_banned: boolean }).is_banned) {
        await supabase.from("profiles")
          .update({ balance: (referrer as { balance: number }).balance + REFERRAL_BONUS, updated_at: new Date().toISOString() })
          .eq("id", p.referred_by);
      }
    }

    res.json({ tier: newTier, message: `Welcome to Tier ${newTier} (${newCfg.label})! You now earn ₦${newCfg.rewardAmount.toLocaleString()} per video.` });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to activate" }); }
});

// ── SPIN ──────────────────────────────────────────────────────────────────────

app.get("/api/user/spin-status", requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from("daily_spin").select("prize")
      .eq("user_id", req.authUser!.userId).eq("spin_date", todayUTC()).single();
    if (data) {
      res.json({ canSpin: false, lastPrize: (data as { prize: number | null }).prize, nextSpinAt: `${todayUTC()}T23:59:59Z` });
    } else {
      res.json({ canSpin: true, lastPrize: null, nextSpinAt: null });
    }
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/user/spin", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.userId;
    const today  = todayUTC();

    const { data: existing } = await supabase.from("daily_spin").select("id")
      .eq("user_id", userId).eq("spin_date", today).single();
    if (existing) {
      res.status(400).json({ error: "You have already spun today. Come back tomorrow!" }); return;
    }

    const p = await getProfile(userId);
    if (p.is_banned) { res.status(403).json({ error: "Account banned" }); return; }

    const picked = pickPrize();

    // Save spin record — prize is null for "Try Again", positive for cash, -1 for Free Tier 2
    await supabase.from("daily_spin").insert({
      user_id:   userId,
      spin_date: today,
      prize:     picked.value ?? null,
    });

    let newBalance   = p.balance;
    let tierUpgraded = false;

    if (picked.value !== null && picked.value > 0) {
      // Cash prize — add to balance
      newBalance = p.balance + picked.value;
      await supabase.from("profiles")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", userId);

    } else if (picked.value === -1) {
      // Free Tier 2 upgrade prize
      if (p.tier < 2) {
        await supabase.from("profiles")
          .update({ tier: 2, updated_at: new Date().toISOString() })
          .eq("id", userId);
        tierUpgraded = true;

        // Give referrer their ₦3,000 bonus
        if (p.referred_by) {
          const { data: referrer } = await supabase.from("profiles")
            .select("balance, is_banned").eq("id", p.referred_by).single();
          if (referrer && !(referrer as { is_banned: boolean }).is_banned) {
            await supabase.from("profiles")
              .update({
                balance:    (referrer as { balance: number }).balance + REFERRAL_BONUS,
                updated_at: new Date().toISOString(),
              })
              .eq("id", p.referred_by);
          }
        }
      } else {
        // Already Tier 2+ so give ₦500 consolation instead
        newBalance = p.balance + 500;
        await supabase.from("profiles")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("id", userId);
      }
    }
    // picked.value === null → "Try Again", no balance change

    res.json({
      prize:        picked.value,
      prizeLabel:   picked.label,
      balance:      newBalance,
      tierUpgraded,
      message:
        picked.value === null
          ? "Better luck tomorrow! Come back again."
          : picked.value === -1
            ? tierUpgraded
              ? "You won a Free Tier 2 Silver Upgrade! 🎉"
              : "Bonus ₦500 credited (you're already Silver or higher)."
            : `You won ₦${picked.value.toLocaleString()}! Added to your balance.`,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to spin" }); }
});

// ── PAYMENT ───────────────────────────────────────────────────────────────────

app.post("/api/user/payment", requireAuth, async (req, res) => {
  try {
    const { tier, username } = req.body as { tier: number; username: string };
    const tierNum = Number(tier);
    if (!tierNum || tierNum < 2 || tierNum > 5) { res.status(400).json({ error: "Valid tier (2-5) required" }); return; }

    const userId = req.authUser!.userId;
    const p = await getProfile(userId);
    if (p.tier >= tierNum) { res.status(400).json({ error: `Already on Tier ${p.tier} or higher.` }); return; }

    // Cancel any existing pending request
    await supabase.from("payment_requests").update({ status: "cancelled" })
      .eq("user_id", userId).eq("status", "pending");

    const { data } = await supabase.from("payment_requests").insert({
      user_id:     userId,
      tier:        tierNum,
      receipt_url: "",
      username:    username?.trim() || "",
      status:      "pending",
    }).select().single();

    res.json({ id: (data as { id: number }).id, status: "pending", message: "Payment submitted! Pending verification." });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

app.get("/api/user/payment-status", requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from("payment_requests").select("tier")
      .eq("user_id", req.authUser!.userId).eq("status", "pending").single();
    res.json({ hasPending: !!data, pendingTier: data ? (data as { tier: number }).tier : null });
  } catch { res.json({ hasPending: false, pendingTier: null }); }
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────

app.get("/api/admin/users", adminAuth, async (req, res) => {
  try {
    const q = (req.query["q"] as string | undefined)?.trim();
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (q) query = query.ilike("username", `%${q}%`);
    const { data } = await query;
    res.json({ users: data ?? [] });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/admin/requests", adminAuth, async (_req, res) => {
  try {
    const { data } = await supabase.from("payment_requests").select("*").order("created_at", { ascending: false });
    res.json({ requests: data ?? [] });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/admin/requests/:id/approve", adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params["id"], 10);
    const { data: row } = await supabase.from("payment_requests").select("*").eq("id", id).single();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const r = row as { status: string; tier: number; user_id: string };
    if (r.status !== "pending") { res.status(400).json({ error: "Not pending" }); return; }

    const { data: updatedProfile } = await supabase.from("profiles")
      .update({ tier: r.tier, code_failures: 0, is_banned: false, updated_at: new Date().toISOString() })
      .eq("id", r.user_id).select("referred_by, id").single();

    await supabase.from("payment_requests").update({ status: "approved" }).eq("id", id);

    if (updatedProfile) {
      const up = updatedProfile as { referred_by: string | null };
      if (up.referred_by) {
        const { data: referrer } = await supabase.from("profiles")
          .select("balance, is_banned").eq("id", up.referred_by).single();
        if (referrer && !(referrer as { is_banned: boolean }).is_banned) {
          await supabase.from("profiles")
            .update({ balance: (referrer as { balance: number }).balance + REFERRAL_BONUS, updated_at: new Date().toISOString() })
            .eq("id", up.referred_by);
        }
      }
    }

    res.json({ message: `User upgraded to Tier ${r.tier}` });
  } catch { res.status(500).json({ error: "Failed to approve" }); }
});

app.post("/api/admin/requests/:id/reject", adminAuth, async (req, res) => {
  try {
    await supabase.from("payment_requests").update({ status: "rejected" }).eq("id", parseInt(req.params["id"], 10));
    res.json({ message: "Rejected" });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/admin/withdrawals", adminAuth, async (_req, res) => {
  try {
    const { data } = await supabase.from("profiles").select("*").gte("balance", 100000);
    res.json({ users: data ?? [] });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/admin/banned", adminAuth, async (_req, res) => {
  try {
    const { data } = await supabase.from("profiles").select("*").eq("is_banned", true);
    res.json({ users: data ?? [] });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// Sets is_banned = true in the profiles table
app.post("/api/admin/users/:id/ban", adminAuth, async (req, res) => {
  try {
    await supabase.from("profiles")
      .update({ is_banned: true, updated_at: new Date().toISOString() })
      .eq("id", req.params["id"]);
    res.json({ message: "User banned" });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// Sets is_banned = false in the profiles table
app.post("/api/admin/users/:id/unban", adminAuth, async (req, res) => {
  try {
    await supabase.from("profiles")
      .update({ is_banned: false, code_failures: 0, updated_at: new Date().toISOString() })
      .eq("id", req.params["id"]);
    res.json({ message: "User unbanned" });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/admin/codes", adminAuth, async (_req, res) => {
  try {
    const { data } = await supabase.from("activation_codes").select("*")
      .eq("used", false).order("created_at", { ascending: false });
    res.json({ codes: data ?? [] });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/admin/codes/generate", adminAuth, async (req, res) => {
  try {
    const { tier } = req.body as { tier?: number };
    if (!tier || tier < 2 || tier > 5) { res.status(400).json({ error: "Valid tier (2–5) required" }); return; }

    let code = "";
    for (let i = 0; i < 20; i++) {
      code = crypto.randomBytes(4).toString("hex").toUpperCase();
      const { data } = await supabase.from("activation_codes").select("id").eq("code", code).single();
      if (!data) break;
    }

    const { data } = await supabase.from("activation_codes")
      .insert({ code, tier, used: false }).select().single();
    res.json({ code: data });
  } catch { res.status(500).json({ error: "Failed to generate code" }); }
});

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env["PORT"] ?? "4000", 10);
app.listen(PORT, () => console.log(`Cashloop API running on port ${PORT}`));

export default app;
