import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useSearch } from "wouter";
import { Mail, Lock, Eye, EyeOff, Coins, User, UserPlus, Gift } from "lucide-react";
import { saveAuth, isLoggedIn } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignupPage() {
  const [, setLocation] = useLocation();
  const search  = useSearch();
  const refCode = new URLSearchParams(search).get("ref") ?? "";

  const [email, setEmail]               = useState("");
  const [username, setUsername]         = useState("");
  const [password, setPassword]         = useState("");
  const [showPw, setShowPw]             = useState(false);
  const [referralCode, setReferralCode] = useState(refCode);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);

  useEffect(() => { if (isLoggedIn()) setLocation("/"); }, [setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !username.trim() || !password) { setError("Please fill in all required fields."); return; }
    if (password.length < 6)        { setError("Password must be at least 6 characters."); return; }
    if (username.trim().length < 3) { setError("Username must be at least 3 characters."); return; }
    setLoading(true);

    try {
      // 1. Create Supabase Auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !authData.session) {
        setError(authError?.message ?? "Signup failed. Try a different email.");
        return;
      }

      const token = authData.session.access_token;

      // 2. Create profile row in our backend
      const res = await fetch(`${BASE}/api/auth/register-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username:     username.trim(),
          referralCode: referralCode.trim().toUpperCase() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // If profile creation failed, clean up Supabase auth user
        await supabase.auth.signOut();
        setError(data.error ?? "Signup failed.");
        return;
      }

      saveAuth(token, {
        id:           data.user.id,
        username:     data.user.username,
        email:        email.trim().toLowerCase(),
        referralCode: data.user.referralCode,
        balance:      data.user.balance,
        tier:         data.user.tier,
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
          <p className="text-muted-foreground text-sm mt-1">Start earning in minutes</p>
        </div>

        {refCode && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-2xl px-4 py-3 mb-4">
            <Gift className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-sm text-primary font-medium">You were invited! Sign up to get your ₦3,000 welcome bonus.</p>
          </motion.div>
        )}

        <div className="bg-card border border-border rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">Create your account</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Username <span className="text-destructive">*</span></label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  placeholder="e.g. Abiola_22"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/50 border border-border text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Email address <span className="text-destructive">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/50 border border-border text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Password <span className="text-destructive">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-secondary/50 border border-border text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors text-sm" />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Referral Code <span className="text-muted-foreground/60">(optional)</span></label>
              <div className="relative">
                <Gift className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3D4"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/50 border border-border text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors text-sm font-mono tracking-wider" />
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-sm text-destructive text-center">{error}</motion.p>
            )}

            <button type="submit" disabled={loading}
              className={cn(
                "w-full py-3.5 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 mt-2",
                loading ? "bg-primary/50 text-primary-foreground cursor-not-allowed"
                        : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_24px_hsl(var(--primary)/0.35)]"
              )}>
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account...</>
                : <><UserPlus className="w-4 h-4" /> Create Account</>}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-semibold">Log in</Link>
          </p>
          <p className="text-center text-xs text-muted-foreground/60 mt-4">
            By signing up you agree to our Terms of Service. No VPNs, no fake receipts, no multiple accounts.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
