import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Mail, Lock, Eye, EyeOff, Coins, LogIn, AlertOctagon } from "lucide-react";
import { saveAuth, isLoggedIn } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [banned, setBanned]     = useState(false);

  useEffect(() => { if (isLoggedIn()) setLocation("/"); }, [setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBanned(false);
    if (!email.trim() || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      // 1. Sign in with Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !data.session) {
        setError(authError?.message ?? "Invalid email or password.");
        return;
      }

      const token = data.session.access_token;

      // 2. Fetch profile from our backend (which also checks ban status)
      const res  = await fetch(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profile = await res.json();

      if (!res.ok) {
        if (profile.banned) { setBanned(true); await supabase.auth.signOut(); return; }
        setError(profile.error ?? "Login failed.");
        return;
      }

      saveAuth(token, {
        id:           profile.id,
        username:     profile.username,
        email:        profile.email,
        referralCode: profile.referralCode,
        balance:      profile.balance,
        tier:         profile.tier,
      });
      setLocation("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-4 shadow-[0_0_40px_hsl(var(--primary)/0.2)]">
            <Coins className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Cashloop</h1>
          <p className="text-muted-foreground text-sm mt-1">Earn while you watch</p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">Welcome back</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/50 border border-border text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-secondary/50 border border-border text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors text-sm" />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {banned && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <AlertOctagon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400 leading-relaxed">
                    Your account has been suspended for violating terms — contact our{" "}
                    <a href="https://wa.me/2349073155883" target="_blank" rel="noopener noreferrer"
                      className="underline font-semibold hover:text-red-300 transition-colors">customer support</a>.
                  </p>
                </motion.div>
              )}
              {error && !banned && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive text-center">{error}</motion.p>
              )}
            </AnimatePresence>

            <button type="submit" disabled={loading}
              className={cn(
                "w-full py-3.5 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 mt-2",
                loading ? "bg-primary/50 text-primary-foreground cursor-not-allowed"
                        : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_24px_hsl(var(--primary)/0.35)]"
              )}>
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Logging in...</>
                : <><LogIn className="w-4 h-4" /> Log In</>}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline font-semibold">Sign up free</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
