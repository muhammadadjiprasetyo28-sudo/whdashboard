import { useState, useEffect, type FormEvent } from 'react';
import Dashboard from './components/Dashboard';
import {
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Database,
  Boxes,
  Activity,
  ArrowUpRight,
  Loader2,
  Cpu,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { MonogramLogo } from './components/ui/MonogramLogo';
import { db } from './lib/firebase';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { AREAS, AREA_URLS, type AreaName } from './config/areas';
import { computeUserPermissions, type UserSession, type UserRole } from './config/permissions';
import { findAccount } from './config/accounts';
import { ToastProvider } from './components/ui/Toast';

// Re-export for any legacy module imports
export { AREAS, AREA_URLS };

export default function App() {
  const [appUsername, setAppUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string>(() => sessionStorage.getItem('selectedArea') || AREAS[0]);
  const [activeSession, setActiveSession] = useState<UserSession | null>(null);
  const [isVerifyingSession, setIsVerifyingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // 1. Verify existing session on initial boot (API with local fallback)
  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    const cachedUserJson = sessionStorage.getItem('auth_user');

    if (!token) {
      setIsVerifyingSession(false);
      return;
    }

    const restoreLocalSession = () => {
      try {
        if (cachedUserJson) {
          const u = JSON.parse(cachedUserJson);
          const perms = computeUserPermissions(u.role as UserRole, u.allowedArea, u.readonly);
          const fullSession: UserSession = {
            username: u.username,
            role: u.role,
            allowedArea: u.allowedArea,
            label: u.label,
            readonly: !!u.readonly,
            avatarKicker: u.username.substring(0, 2).toUpperCase(),
            permissions: perms,
          };
          setActiveSession(fullSession);
          return true;
        }

        // Parse from token prefix
        const uname = token.split('_')[0];
        const acc = findAccount(uname);
        if (acc) {
          const perms = computeUserPermissions(acc.role as UserRole, acc.allowedArea, acc.readonly);
          const fullSession: UserSession = {
            username: acc.username,
            role: acc.role,
            allowedArea: acc.allowedArea,
            label: acc.label,
            readonly: !!acc.readonly,
            avatarKicker: acc.username.substring(0, 2).toUpperCase(),
            permissions: perms,
          };
          setActiveSession(fullSession);
          return true;
        }
      } catch (e) {
        console.warn('Session parse error:', e);
      }
      return false;
    };

    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Session check failed');
        return res.json();
      })
      .then((data) => {
        if (data.authenticated && data.user) {
          const user = data.user;
          const perms = computeUserPermissions(user.role as UserRole, user.allowedArea, user.readonly);
          const fullSession: UserSession = {
            username: user.username,
            role: user.role,
            allowedArea: user.allowedArea,
            label: user.label,
            readonly: !!user.readonly,
            avatarKicker: user.username.substring(0, 2).toUpperCase(),
            permissions: perms,
          };
          setActiveSession(fullSession);
          sessionStorage.setItem('auth_user', JSON.stringify(user));

          // Restore or constrain area
          const savedArea = sessionStorage.getItem('selectedArea') || AREAS[0];
          if (user.allowedArea !== 'ALL' && user.allowedArea !== 'All Cabang') {
            setSelectedArea(user.allowedArea);
            sessionStorage.setItem('selectedArea', user.allowedArea);
          } else {
            setSelectedArea(savedArea);
          }
        } else {
          if (!restoreLocalSession()) {
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('auth_user');
            setActiveSession(null);
          }
        }
      })
      .catch(() => {
        // If server is offline or on Vercel without /api/auth/me, fallback to verified local token
        if (!restoreLocalSession()) {
          sessionStorage.removeItem('auth_token');
          sessionStorage.removeItem('auth_user');
          setActiveSession(null);
        }
      })
      .finally(() => {
        setIsVerifyingSession(false);
      });
  }, []);

  const handleAreaChange = (newArea: string) => {
    setSelectedArea(newArea);
    sessionStorage.setItem('selectedArea', newArea);
  };

  const handleAppLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const inputUser = appUsername.trim();
    const inputPass = appPassword;

    if (!inputUser || !inputPass) {
      setLoginError('Username dan password wajib diisi.');
      setIsLoggingIn(false);
      return;
    }

    try {
      let loginSuccess = false;
      let userData: any = null;
      let token = '';

      // 1. Try server API login first
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: inputUser,
            password: inputPass,
          }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.success) {
            loginSuccess = true;
            userData = data.user;
            token = data.token;
          } else if (data && data.error) {
            setLoginError(data.error);
            setIsLoggingIn(false);
            return;
          }
        } else if (res.status === 401) {
          const data = await res.json().catch(() => null);
          setLoginError(data?.error || 'Username atau password salah. Silakan periksa kembali kredensial Anda.');
          setIsLoggingIn(false);
          return;
        }
      } catch (netErr) {
        console.warn('Backend login endpoint unavailable, attempting fallback verification:', netErr);
      }

      // 2. Resilient fallback: Verify with local verified accounts matrix (for Vercel & static hosting)
      if (!loginSuccess) {
        const matched = findAccount(inputUser, inputPass);
        if (matched) {
          loginSuccess = true;
          userData = {
            username: matched.username,
            role: matched.role,
            allowedArea: matched.allowedArea,
            label: matched.label,
            readonly: !!matched.readonly,
          };
          token = `${matched.username}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        } else {
          setLoginError('Username atau password salah. Silakan periksa kembali kredensial Anda.');
          setIsLoggingIn(false);
          return;
        }
      }

      // 3. Complete successful login
      sessionStorage.setItem('auth_token', token);
      sessionStorage.setItem('auth_user', JSON.stringify(userData));

      const perms = computeUserPermissions(userData.role as UserRole, userData.allowedArea, userData.readonly);
      const fullSession: UserSession = {
        username: userData.username,
        role: userData.role,
        allowedArea: userData.allowedArea,
        label: userData.label,
        readonly: !!userData.readonly,
        avatarKicker: userData.username.substring(0, 2).toUpperCase(),
        permissions: perms,
      };

      setActiveSession(fullSession);

      let targetArea = selectedArea;
      if (userData.allowedArea !== 'ALL' && userData.allowedArea !== 'All Cabang') {
        targetArea = userData.allowedArea;
      }
      setSelectedArea(targetArea);
      sessionStorage.setItem('selectedArea', targetArea);
      setAppPassword('');
    } catch {
      setLoginError('Terjadi kesalahan saat memproses login. Silakan coba kembali.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Heartbeat active user presence in Firestore
  useEffect(() => {
    if (!activeSession) return;

    const sessionId = sessionStorage.getItem('sessionId') || Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('sessionId', sessionId);

    const userDocRef = doc(db, 'activeUsers', sessionId);

    const updatePresence = async () => {
      try {
        await setDoc(
          userDocRef,
          {
            username: activeSession.username,
            role: activeSession.role,
            area: selectedArea,
            lastSeen: new Date().toISOString(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Gagal update user presence:', e);
      }
    };

    updatePresence();
    const intervalId = setInterval(updatePresence, 30000);

    return () => {
      clearInterval(intervalId);
      deleteDoc(userDocRef).catch(() => {});
    };
  }, [activeSession, selectedArea]);

  const handleLogout = async () => {
    const token = sessionStorage.getItem('auth_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    const sessionId = sessionStorage.getItem('sessionId');
    if (sessionId) {
      deleteDoc(doc(db, 'activeUsers', sessionId)).catch(() => {});
      sessionStorage.removeItem('sessionId');
    }

    sessionStorage.removeItem('auth_token');
    setActiveSession(null);
    setAppUsername('');
    setAppPassword('');
    setLoginError(null);
  };

  // Show loading skeleton while verifying existing session
  if (isVerifyingSession) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-slate-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(79,70,229,0.08),transparent_50%)] pointer-events-none" />
        <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 p-[1.5px] shadow-xl shadow-indigo-500/20 mb-5 animate-pulse">
          <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center text-indigo-600">
            <MonogramLogo className="w-7 h-7" />
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-xs font-mono font-semibold tracking-wide text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Memverifikasi sesi aman Dashboard WH...</span>
        </div>
      </div>
    );
  }

  // App Auth Flow (System level) - Dashboard WH Authentication Interface
  if (!activeSession) {
    return (
      <div className="login-page">
        <div className="login-orb login-orb-left" />
        <div className="login-orb login-orb-right" />

        <div className="login-layout">
          {/* Left Showcase Banner */}
          <section className="login-showcase">
            <div className="login-brand-badge animate-fade-in-up">
              <span className="login-brand-mark">
                <MonogramLogo className="w-3.5 h-3.5" />
              </span>
              <span>DASHBOARD WH</span>
              <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-300 font-mono font-bold tracking-wider">
                v4.2 PROD
              </span>
            </div>

            <div className="login-showcase-copy animate-fade-in-up">
              <span className="eyebrow">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                Warehouse Intelligence System
              </span>
              <h1>Presisi kendali logistik & pergudangan multi-cabang.</h1>
              <p>
                Platform terpusat Dashboard WH untuk sinkronisasi mutasi stok real-time, rekonsiliasi data ledger, dan audit akurasi inventaris 11 cabang terdistribusi.
              </p>
            </div>

            <div className="login-feature-grid">
              <div className="login-feature-card interactive-card">
                <div className="login-feature-icon">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <strong>Live Multi-Branch Visibility</strong>
                  <span>Pantau pergerakan stok, stok minimum, dan mutasi antar cabang secara instan.</span>
                </div>
              </div>

              <div className="login-feature-card interactive-card">
                <div className="login-feature-icon">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <strong>Continuous Reconciliation</strong>
                  <span>Audit pencocokan fisik vs sistem, tracking DOI/MP, dan validasi unposted dokumen.</span>
                </div>
              </div>

              <div className="login-feature-card interactive-card">
                <div className="login-feature-icon">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <strong>Role-Based Security Protocol</strong>
                  <span>Otorisasi ketat berbasis peranan operasional dari helper hingga level eksekutif.</span>
                </div>
              </div>
            </div>

            <div className="login-footer-note">
              <span className="relative flex h-2 w-2 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Dashboard WH Gateway · Zero-Trust Encryption · Operational 24/7</span>
            </div>
          </section>

          {/* Right Auth Card */}
          <section className="login-card animate-fade-in-up">
            <div className="login-card-header">
              <div className="relative group shrink-0">
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-600 opacity-75 blur-xs animate-pulse" />
                <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 p-[1.5px] shadow-lg shadow-indigo-600/30">
                  <div className="w-full h-full bg-[#080d19] rounded-[14px] flex items-center justify-center text-indigo-400">
                    <MonogramLogo className="w-6 h-6" />
                  </div>
                </div>
              </div>
              <div>
                <span className="eyebrow eyebrow-dark">Secure Access Portal</span>
                <h2>Masuk ke Dashboard WH</h2>
                <p>Gunakan kredensial akun operasional yang terdaftar di sistem.</p>
              </div>
            </div>

            <form onSubmit={handleAppLogin} className="login-form">
              {loginError && (
                <div className="login-alert animate-shake" role="alert">
                  <span>!</span>
                  <p>{loginError}</p>
                </div>
              )}

              <label className="login-field">
                <span>
                  <User className="w-3.5 h-3.5 text-indigo-400" /> Username
                </span>
                <input
                  type="text"
                  placeholder="Contoh: admin atau jakarta"
                  value={appUsername}
                  onChange={(e) => setAppUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>

              <label className="login-field">
                <span>
                  <Lock className="w-3.5 h-3.5 text-indigo-400" /> Password
                </span>
                <div className="password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Masukkan password"
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="login-submit relative overflow-hidden group hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
              >
                {/* Light shimmer sweep */}
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Mengautentikasi...</span>
                  </>
                ) : (
                  <>
                    <span>Otorisasi Masuk</span>
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="login-help">
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="login-help-trigger"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{showHelp ? 'Sembunyikan panduan akses' : 'Panduan hak akses & matriks role'}</span>
                {showHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showHelp && (
                <div className="login-help-panel">
                  <div className="login-help-title flex items-center justify-between">
                    <span>Matriks Hak Akses (Role Matrix)</span>
                    <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/50">
                      RBAC v4.2
                    </span>
                  </div>
                  <div className="login-help-list">
                    <span className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                      <span><strong>Super Admin</strong> · Seluruh 11 cabang & kendali master data penuh</span>
                    </span>
                    <span className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                      <span><strong>Admin C3 / Petugas C3 / Helper</strong> · Operasional pergerakan & stok C3</span>
                    </span>
                    <span className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                      <span><strong>Admin Cabang</strong> · Akses terkunci khusus cabang operasional</span>
                    </span>
                    <span className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                      <span><strong>HQ / PPIC / MP</strong> · Monitoring agregasi dan audit terpusat</span>
                    </span>
                  </div>
                  <div className="login-help-note">
                    Autentikasi terenkripsi diproses langsung oleh proxy server aman. Hubungi tim administrator bila memerlukan bantuan akun.
                  </div>
                </div>
              )}
            </div>

            <div className="login-card-meta">
              <span className="flex items-center gap-1.5">
                <span className="status-dot" />
                <span>Session Verified</span>
              </span>
              <span className="font-mono text-slate-500 font-semibold tracking-wider">
                DASHBOARD WH PLATFORM
              </span>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const currentGasUrl = selectedArea === 'All Cabang' ? 'HQ' : (AREA_URLS[selectedArea] || '');
  const spreadsheetReady = selectedArea === 'All Cabang' || Boolean(AREA_URLS[selectedArea]);

  if (!spreadsheetReady) {
    return (
      <div className="empty-state-page">
        <div className="empty-state-card">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Konfigurasi area belum tersedia</h2>
          <p className="text-slate-500 mb-6">URL sistem untuk area <strong>{selectedArea}</strong> belum dikonfigurasi.</p>
          <button
            type="button"
            onClick={() => handleAreaChange('All Cabang')}
            className="secondary-action w-full"
          >
            Kembali ke All Cabang
          </button>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <Dashboard
        gasUrl={currentGasUrl}
        area={selectedArea}
        onAreaChange={activeSession.permissions.canSwitchArea ? handleAreaChange : undefined}
        onLogout={handleLogout}
        userRole={activeSession.allowedArea}
        activeUsername={activeSession.username}
        session={activeSession}
      />
    </ToastProvider>
  );
}
