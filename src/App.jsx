import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, FlaskConical, CalendarDays,
  Clock3, RotateCcw, TrendingUp, Settings as SettingsIcon, List, Grid3x3, User,
  LayoutDashboard, CalendarCheck2, CalendarClock, Layers, GripVertical,
  Stethoscope, NotebookText, RefreshCw, Heart, ChevronDown, ChevronUp, Droplet, Ruler,
} from "lucide-react";
import {
  loadKey, saveKey, getSession, onAuthChange, signUp, signIn, signOut,
  getMyMembership, createHousehold, redeemInvite, createInvite, listInvites, revokeInvite, listMembers,
  setActiveHousehold, listSupportMessages, addSupportMessage, deleteSupportMessage, subscribeToHousehold,
} from "./lib/db.js";
import { encryptPayload, decryptPayload } from "./lib/crypto.js";

// ---------- brand tokens (Student Roost) ----------
const T = {
  paper: "#F6F7F8", card: "#FFFFFF", ink: "#2D3746", inkSoft: "#626A75",
  line: "#E5E7EB", lineSoft: "#EEF0F2",
  navy: "#2E3746", accent: "#0E7E6E", accentDeep: "#0A6359",
  accentSoft: "#E3F7F3", accentBright: "#91E5DB",
  ok: "#198560", okBg: "#E4F4EE", warn: "#A9670B", warnBg: "#FBF1DF",
  breach: "#C8102E", breachBg: "#FBE4E7", info: "#3A5BA0", infoBg: "#E9EEF8",
  radius: 12, shadow: "0 1px 2px rgba(45,55,70,.06),0 4px 16px rgba(45,55,70,.06)",
  ui: "'Poppins','Inter',system-ui,sans-serif", mono: "'Roboto Mono',ui-monospace,Menlo,monospace",
};

const TYPE_STYLES = {
  Chemotherapy: { bg: T.accentSoft, border: T.accent, text: T.accentDeep },
  Immunotherapy: { bg: T.infoBg, border: T.info, text: "#2C4172" },
  Surgery: { bg: T.warnBg, border: T.warn, text: "#7A4E08" },
  Radiotherapy: { bg: "#EDF0F3", border: T.navy, text: T.navy },
  Other: { bg: T.lineSoft, border: T.inkSoft, text: T.inkSoft },
};
const STATUS_META = {
  Scheduled: { label: "Scheduled", color: T.info, bg: T.infoBg },
  Completed: { label: "Completed", color: T.ok, bg: T.okBg },
  Skipped: { label: "Skipped", color: T.breach, bg: T.breachBg },
  Delayed: { label: "Delayed", color: T.warn, bg: T.warnBg },
};
const TREATMENT_TYPES = ["Chemotherapy", "Immunotherapy", "Surgery", "Radiotherapy", "Other"];
const SCAN_TYPES = ["MRI", "Mammogram", "CT", "Ultrasound", "Other"];
// Lesion/tumour measurements are conventionally recorded in millimetres
// regardless of scan modality — kept as a map so a different default could
// be set per scan type later if needed.
const SCAN_UNITS = { MRI: "mm", Mammogram: "mm", CT: "mm", Ultrasound: "mm", Other: "mm" };
const APPT_ROLES = ["Consultant", "Registrar", "Surgeon", "Other"];
const ROLE_STYLES = {
  Consultant: { bg: T.infoBg, border: T.info, text: "#2C4172" },
  Registrar: { bg: T.accentSoft, border: T.accent, text: T.accentDeep },
  Surgeon: { bg: T.warnBg, border: T.warn, text: "#7A4E08" },
  Other: { bg: T.lineSoft, border: T.inkSoft, text: T.inkSoft },
};
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const LINE_COLORS = [T.accent, T.info, T.warn, T.breach, T.navy, T.accentDeep, "#7A4E08"];
const DEFAULT_CARD_ORDER = ["next", "nextAppointment", "completed", "remaining", "phaseEnd", "nextType", "supportMessages"];
const DEFAULT_TAB_ORDER = ["summary", "calendar", "appointments", "bloods", "measurements", "support", "settings"];

// A standard pre-chemotherapy blood panel, split into Haematology (FBC) and
// Biochemistry (U&E/LFT/bone profile). "Normal" values here are illustrative
// midpoints of typical adult reference ranges, for a general visual guide
// only — actual reference ranges vary by lab, age and sex, and the figures
// printed on a real lab report should always be treated as authoritative.
const HAEMATOLOGY_ELEMENTS = [
  { key: "Haemoglobin", unit: "g/L", normal: 140, range: "115–170 g/L" },
  { key: "White Cell Count", unit: "x10⁹/L", normal: 7.5, range: "4.0–11.0 x10⁹/L" },
  { key: "Platelet Count", unit: "x10⁹/L", normal: 275, range: "150–400 x10⁹/L" },
  { key: "Red Blood Cell Count", unit: "x10¹²/L", normal: 4.75, range: "4.0–5.5 x10¹²/L" },
  { key: "Haematocrit", unit: "%", normal: 43, range: "37–50%" },
  { key: "Mean Cell Volume", unit: "fL", normal: 90, range: "80–100 fL" },
  { key: "Mean Cell Haemoglobin", unit: "pg", normal: 30, range: "27–33 pg" },
  { key: "Neutrophils", unit: "x10⁹/L", normal: 4.5, range: "2.0–7.5 x10⁹/L" },
  { key: "Lymphocytes", unit: "x10⁹/L", normal: 2.5, range: "1.0–4.0 x10⁹/L" },
  { key: "Monocytes", unit: "x10⁹/L", normal: 0.5, range: "0.2–0.8 x10⁹/L" },
  { key: "Eosinophils", unit: "x10⁹/L", normal: 0.2, range: "0.0–0.4 x10⁹/L" },
  { key: "Basophils", unit: "x10⁹/L", normal: 0.05, range: "0.0–0.1 x10⁹/L" },
];
const BIOCHEMISTRY_ELEMENTS = [
  { key: "Sodium", unit: "mmol/L", normal: 140, range: "135–145 mmol/L" },
  { key: "Potassium", unit: "mmol/L", normal: 4.2, range: "3.5–5.0 mmol/L" },
  { key: "Urea", unit: "mmol/L", normal: 5, range: "2.5–7.8 mmol/L" },
  { key: "Creatinine", unit: "µmol/L", normal: 85, range: "60–110 µmol/L" },
  { key: "Calcium", unit: "mmol/L", normal: 2.4, range: "2.20–2.60 mmol/L" },
  { key: "Adjusted Calcium", unit: "mmol/L", normal: 2.4, range: "2.20–2.60 mmol/L" },
  { key: "Magnesium", unit: "mmol/L", normal: 0.85, range: "0.70–1.00 mmol/L" },
  { key: "Inorganic Phosphate", unit: "mmol/L", normal: 1.15, range: "0.80–1.50 mmol/L" },
  { key: "Albumin", unit: "g/L", normal: 42, range: "35–50 g/L" },
  { key: "Alanine Transaminase", unit: "U/L", normal: 30, range: "7–56 U/L" },
  { key: "Alkaline Phosphatase", unit: "U/L", normal: 80, range: "30–130 U/L" },
  { key: "Total Bilirubin", unit: "µmol/L", normal: 10, range: "3–17 µmol/L" },
];
const BLOOD_ELEMENTS = [...HAEMATOLOGY_ELEMENTS, ...BIOCHEMISTRY_ELEMENTS];
const BLOOD_ELEMENT_KEYS = BLOOD_ELEMENTS.map(e => e.key);
const BLOOD_NORMALS = Object.fromEntries(BLOOD_ELEMENTS.map(e => [e.key, e]));
const HAEMATOLOGY_KEYS = HAEMATOLOGY_ELEMENTS.map(e => e.key);
const BIOCHEMISTRY_KEYS = BIOCHEMISTRY_ELEMENTS.map(e => e.key);
const SUPPORT_QUOTES = [
  "You've got this!",
  "You are strong.",
  "Don't give up!",
  "You are loved.",
  "Keep smashing it!",
  "One day at a time.",
  "You're doing amazing.",
  "Sending you strength today.",
  "Believe in yourself.",
  "Every day is progress.",
];

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso + "T00:00:00");
  const b = new Date(toIso + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function apptTitle(a) {
  if (a.name && a.name.trim()) return a.name.trim();
  return a.role || "Untitled";
}

function heuristicBullets(text) {
  return text
    .split(/\n+|(?<=[.?!])\s+(?=[A-Z0-9])/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function heuristicProseSummary(text) {
  const trimmed = text.trim();
  if (trimmed.length <= 160) return trimmed;
  const cut = trimmed.slice(0, 160);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : 160).trim()}…`;
}

async function summariseSupportMessage(text) {
  if (!text || !text.trim()) return "";
  if (text.trim().length <= 160) return text.trim(); // already short — no need to summarise
  try {
    const res = await fetch("/.netlify/functions/summarise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: text, mode: "prose" }),
    });
    if (!res.ok) throw new Error(`summarise failed: ${res.status}`);
    const data = await res.json();
    if (typeof data.summary === "string" && data.summary.trim()) return data.summary.trim();
    return heuristicProseSummary(text);
  } catch {
    return heuristicProseSummary(text);
  }
}

async function summariseNotes(text) {
  if (!text || !text.trim()) return [];
  try {
    const res = await fetch("/.netlify/functions/summarise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: text }),
    });
    if (!res.ok) throw new Error(`summarise failed: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.bullets) && data.bullets.length) return data.bullets;
    // No ANTHROPIC_API_KEY set on Netlify, or the API call failed server-side —
    // fall back to a simple heuristic split so the feature still works.
    return heuristicBullets(text);
  } catch {
    return heuristicBullets(text);
  }
}

const DEFAULT_PATIENT = { name: "", dob: "", address: "", height: "", weight: "" };

// Bloods and Measurements each now have their own dedicated tab, rather than
// living inside a generic multi-category "Test Results" list. This folds any
// leftover categories (the old "MRI" name, or any custom tabs someone added)
// into Measurements, so nothing gets lost, and returns just the two arrays
// the app uses today.
function migrateLegacyTestData(cats, entriesObj) {
  let loadedCats = Array.isArray(cats) ? cats : ["Measurements"];
  let loadedEntries = entriesObj && typeof entriesObj === "object" ? entriesObj : { Bloods: [], Measurements: [] };
  if (loadedCats.includes("MRI") && !loadedCats.includes("Measurements")) {
    loadedCats = loadedCats.map(name => (name === "MRI" ? "Measurements" : name));
    const { MRI, ...rest } = loadedEntries;
    loadedEntries = { ...rest, Measurements: MRI || [] };
  }
  let measurements = Array.isArray(loadedEntries.Measurements) ? [...loadedEntries.Measurements] : [];
  loadedCats.forEach(cat => {
    if (cat !== "Bloods" && cat !== "Measurements" && Array.isArray(loadedEntries[cat])) {
      measurements = measurements.concat(loadedEntries[cat]);
    }
  });
  return { Bloods: Array.isArray(loadedEntries.Bloods) ? loadedEntries.Bloods : [], Measurements: measurements };
}

// ================= GLOBAL RESPONSIVE STYLES =================
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;600&display=swap');
  .tt-btn { cursor: pointer; border: none; font-family: inherit; transition: all 0.15s ease; }
  .tt-btn:hover { filter: brightness(0.97); }
  .tt-btn:active { transform: scale(0.98); }
  select.tt-select { font-family: inherit; }
  input:focus, select:focus, textarea:focus { outline: 2px solid ${T.accentBright}; outline-offset: 1px; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 4px; }
  .tt-spin { animation: tt-spin-kf 0.9s linear infinite; }
  @keyframes tt-spin-kf { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .tt-app { width: 100%; box-sizing: border-box; }
  .tt-splash {
    min-height: 100vh; min-height: 100dvh; width: 100%; box-sizing: border-box;
    display: flex; flex-direction: column; border-radius: 0;
  }
  .tt-splash-inner {
    flex: 1; width: 100%; box-sizing: border-box;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; gap: 22px;
    padding: calc(24px + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right))
             calc(24px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left));
  }
  .tt-header {
    padding: calc(20px + env(safe-area-inset-top)) calc(28px + env(safe-area-inset-right)) 0 calc(28px + env(safe-area-inset-left));
  }
  .tt-header-tabs { display: flex; gap: 4px; margin-top: 18px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .tt-header-tabs::-webkit-scrollbar { display: none; }
  .tt-tab-btn { white-space: nowrap; flex-shrink: 0; }
  .tt-content {
    padding: 24px calc(28px + env(safe-area-inset-right)) calc(32px + env(safe-area-inset-bottom)) calc(28px + env(safe-area-inset-left));
  }

  .tt-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
  .tt-cal-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
  .tt-cal-grid-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tt-cal-weekdays, .tt-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(42px, 1fr)); gap: 6px; }
  .tt-cal-grid { grid-auto-rows: minmax(92px, auto); min-width: 460px; }
  .tt-cal-weekdays { min-width: 460px; margin-bottom: 6px; }
  .tt-day-cell { padding: 6px 6px 8px; display: flex; flex-direction: column; gap: 4px; box-sizing: border-box; }
  .tt-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tt-table-wrap table { min-width: 460px; width: 100%; }
  .tt-table-wrap thead th {
    position: sticky; top: 0; z-index: 2;
    background: ${T.paper}; box-shadow: 0 1px 0 ${T.line};
  }
  .tt-settings-card { max-width: 520px; width: 100%; box-sizing: border-box; }
  .tt-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .tt-add-form { display: grid; grid-template-columns: 140px 1fr 100px 90px auto; gap: 8px; align-items: end; }

  /* ---- Tablet / small desktop ---- */
  @media (max-width: 900px) {
    .tt-summary-grid { grid-template-columns: repeat(2, 1fr); }
  }

  /* ---- Mobile portrait & landscape ---- */
  @media (max-width: 640px) {
    .tt-app { border-radius: 0 !important; border: none !important; min-height: 100vh; min-height: 100dvh; }
    .tt-header {
      padding: calc(14px + env(safe-area-inset-top)) calc(14px + env(safe-area-inset-right)) 0 calc(14px + env(safe-area-inset-left));
    }
    .tt-content {
      padding: 14px calc(12px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));
    }
    .tt-summary-grid { grid-template-columns: 1fr; }
    .tt-cal-toolbar { flex-direction: column; align-items: stretch; }
    .tt-2col { grid-template-columns: 1fr; }
    .tt-add-form { grid-template-columns: 1fr 1fr; }
    .tt-add-form > div:nth-child(2) { grid-column: 1 / -1; }
  }
  @media (max-width: 480px) {
    .tt-day-cell { padding: 4px 3px 5px; font-size: 11px; }
  }

  /* ---- Landscape phones: prioritise horizontal space ---- */
  @media (max-width: 900px) and (orientation: landscape) {
    .tt-summary-grid { grid-template-columns: repeat(3, 1fr); }
    .tt-content { padding: 14px calc(20px + env(safe-area-inset-right)) 24px calc(20px + env(safe-area-inset-left)); }
    .tt-header {
      padding-left: calc(28px + env(safe-area-inset-left));
      padding-right: calc(28px + env(safe-area-inset-right));
    }
  }
`;

export default function App() {
  // ----- Auth & household -----
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState(null);
  const [membership, setMembership] = useState(null); // { householdId, role, householdName }
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteError, setInviteError] = useState("");

  const [ready, setReady] = useState(false);
  const [mainTab, setMainTab] = useState("summary");
  const [calendarView, setCalendarView] = useState("summary");
  const [appointmentsView, setAppointmentsView] = useState("summary");

  const [treatments, setTreatments] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [entries, setEntries] = useState({ Bloods: [], Measurements: [] });
  const [patient, setPatient] = useState(DEFAULT_PATIENT);
  const [cardOrder, setCardOrder] = useState(DEFAULT_CARD_ORDER);
  const [supportMessages, setSupportMessages] = useState([]);
  const [tabOrder, setTabOrder] = useState(DEFAULT_TAB_ORDER);

  const [supportMessage] = useState(() => SUPPORT_QUOTES[Math.floor(Math.random() * SUPPORT_QUOTES.length)]);
  const [splashDone, setSplashDone] = useState(false);
  const [featuredMsg, setFeaturedMsg] = useState(null);
  const [featuredSummary, setFeaturedSummary] = useState("");
  const featuredPickedRef = useRef(false);

  const [lastSynced, setLastSynced] = useState(null);
  const [syncError, setSyncError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const remoteFlags = useRef({});

  const householdId = membership?.householdId || null;
  const role = membership?.role || null;
  const isOwner = role === "owner";
  const canEdit = role === "owner" || role === "admin" || role === "editor";
  const canManageHousehold = role === "owner" || role === "admin";

  function goTo(tab, view) {
    setMainTab(tab);
    if (tab === "calendar" && view) setCalendarView(view);
    if (tab === "appointments" && view) setAppointmentsView(view);
  }

  // 1. Pick up an invite token from the URL (?invite=...), once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (token) setInviteToken(token);
  }, []);

  // 2. Track the auth session.
  useEffect(() => {
    let subscription;
    (async () => {
      const s = await getSession();
      setSession(s);
      setAuthChecked(true);
      subscription = onAuthChange(newSession => setSession(newSession));
    })();
    return () => { if (subscription) subscription.unsubscribe(); };
  }, []);

  // 3. Once signed in, redeem any pending invite and resolve household membership.
  useEffect(() => {
    if (!authChecked) return;
    if (!session) { setMembership(null); setMembershipChecked(true); return; }
    let cancelled = false;
    (async () => {
      setMembershipChecked(false);
      try {
        if (inviteToken) {
          try { await redeemInvite(inviteToken); } catch (e) { setInviteError(e.message || "Couldn't use that invite link."); }
        }
        const m = await getMyMembership();
        if (cancelled) return;
        setMembership(m);
      } catch (e) {
        // A stale or invalid session (e.g. the account behind it was
        // deleted) — sign out locally so the person lands back on the
        // login screen instead of being stuck loading forever.
        if (!cancelled) {
          await signOut().catch(() => {});
          setSession(null);
          setMembership(null);
        }
      } finally {
        if (!cancelled) setMembershipChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authChecked, session, inviteToken]);

  useEffect(() => { if (householdId) setActiveHousehold(householdId); }, [householdId]);

  // 4. Load everything once we know which household this is.
  useEffect(() => {
    if (!householdId) return;
    (async () => {
      const [t, appts, e, p, co, to, sm] = await Promise.all([
        loadKey("treatments", []),
        loadKey("appointments", []),
        loadKey("test-entries", { Bloods: [], Measurements: [] }),
        loadKey("patient-info", DEFAULT_PATIENT),
        loadKey("summary-card-order", DEFAULT_CARD_ORDER),
        loadKey("tab-order", DEFAULT_TAB_ORDER),
        listSupportMessages(),
      ]);
      const loadedEntries = migrateLegacyTestData(null, e);
      setTreatments(t); setAppointments(appts); setEntries(loadedEntries); setPatient(p);
      setCardOrder(co && co.length === DEFAULT_CARD_ORDER.length ? co : DEFAULT_CARD_ORDER);
      setTabOrder(to && to.length === DEFAULT_TAB_ORDER.length ? to.map(id => (id === "tests" ? "measurements" : id)) : DEFAULT_TAB_ORDER);
      setSupportMessages(sm);
      setLastSynced(new Date());
      setReady(true);

      if (!featuredPickedRef.current && sm && sm.length > 0) {
        featuredPickedRef.current = true;
        const chosen = sm[Math.floor(Math.random() * sm.length)];
        setFeaturedMsg(chosen);
        summariseSupportMessage(chosen.message).then(setFeaturedSummary);
      }
    })();
  }, [householdId]);

  // 5. Live sync via Supabase Realtime — pushed the instant someone else saves,
  // rather than polling. Applies changes only where they actually differ, and
  // flags that key so the save-effect below doesn't write it straight back.
  const refreshAllRef = useRef(() => {});
  useEffect(() => {
    if (!householdId || !ready) return;

    function applyIfChanged(setter, flagKey, newVal) {
      setter(prev => {
        if (JSON.stringify(prev) === JSON.stringify(newVal)) return prev;
        remoteFlags.current[flagKey] = true;
        return newVal;
      });
    }

    const KEY_TO_FLAG = {
      "treatments": "treatments", "appointments": "appointments", "test-entries": "entries",
      "patient-info": "patient", "summary-card-order": "cardOrder", "tab-order": "tabOrder",
    };
    const KEY_FALLBACK = {
      "treatments": [], "appointments": [], "test-entries": { Bloods: [], Measurements: [] },
      "patient-info": DEFAULT_PATIENT, "summary-card-order": DEFAULT_CARD_ORDER, "tab-order": DEFAULT_TAB_ORDER,
    };

    async function refreshAll() {
      setSyncing(true);
      try {
        const [t, appts, e, p, co, to, sm] = await Promise.all([
          loadKey("treatments", []), loadKey("appointments", []),
          loadKey("test-entries", { Bloods: [], Measurements: [] }), loadKey("patient-info", DEFAULT_PATIENT),
          loadKey("summary-card-order", DEFAULT_CARD_ORDER), loadKey("tab-order", DEFAULT_TAB_ORDER),
          listSupportMessages(),
        ]);
        applyIfChanged(setTreatments, "treatments", t);
        applyIfChanged(setAppointments, "appointments", appts);
        applyIfChanged(setEntries, "entries", migrateLegacyTestData(null, e));
        applyIfChanged(setPatient, "patient", p);
        applyIfChanged(setCardOrder, "cardOrder", co && co.length === DEFAULT_CARD_ORDER.length ? co : DEFAULT_CARD_ORDER);
        applyIfChanged(setTabOrder, "tabOrder", to && to.length === DEFAULT_TAB_ORDER.length ? to.map(id => (id === "tests" ? "measurements" : id)) : DEFAULT_TAB_ORDER);
        setSupportMessages(sm);
        setLastSynced(new Date());
        setSyncError(false);
      } finally {
        setSyncing(false);
      }
    }
    refreshAllRef.current = refreshAll;

    const unsubscribe = subscribeToHousehold(householdId, async (table) => {
      if (table === "support_messages") {
        setSupportMessages(await listSupportMessages());
        setLastSynced(new Date());
        return;
      }
      // app_data changed — a full refresh is cheap enough at this scale and
      // keeps the "what changed" logic in one place.
      refreshAll();
    });

    return unsubscribe;
  }, [householdId, ready]);

  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.treatments) { remoteFlags.current.treatments = false; return; }
    if (!canEdit) return; // viewers never attempt to save — RLS would reject it anyway
    saveKey("treatments", treatments).then(ok => setSyncError(!ok));
  }, [treatments, ready, canEdit]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.appointments) { remoteFlags.current.appointments = false; return; }
    if (!canEdit) return;
    saveKey("appointments", appointments).then(ok => setSyncError(!ok));
  }, [appointments, ready, canEdit]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.entries) { remoteFlags.current.entries = false; return; }
    if (!canEdit) return;
    saveKey("test-entries", entries).then(ok => setSyncError(!ok));
  }, [entries, ready, canEdit]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.patient) { remoteFlags.current.patient = false; return; }
    if (!canEdit) return;
    saveKey("patient-info", patient).then(ok => setSyncError(!ok));
  }, [patient, ready, canEdit]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.cardOrder) { remoteFlags.current.cardOrder = false; return; }
    if (!canEdit) return; // viewers can still drag to reorder locally, just nothing to save
    saveKey("summary-card-order", cardOrder).then(ok => setSyncError(!ok));
  }, [cardOrder, ready, canEdit]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.tabOrder) { remoteFlags.current.tabOrder = false; return; }
    if (!canEdit) return;
    saveKey("tab-order", tabOrder).then(ok => setSyncError(!ok));
  }, [tabOrder, ready, canEdit]);

  async function forceSaveAll() {
    setSyncing(true);
    try {
      const results = canEdit
        ? await Promise.all([
            saveKey("treatments", treatments),
            saveKey("appointments", appointments),
            saveKey("test-entries", entries),
            saveKey("patient-info", patient),
            saveKey("summary-card-order", cardOrder),
            saveKey("tab-order", tabOrder),
          ])
        : [];
      const allOk = results.every(Boolean);
      setSyncError(!allOk);
      if (allOk) setLastSynced(new Date());
    } finally {
      setSyncing(false);
    }
  }

  // ----- Not signed in yet -----
  if (!authChecked || (session && !membershipChecked)) {
    return <FullScreenMessage message="Loading…" />;
  }
  if (!session) {
    return <AuthScreen inviteToken={inviteToken} inviteError={inviteError} />;
  }
  if (!membership) {
    return <CreateHouseholdScreen inviteError={inviteError} onCreated={setMembership} />;
  }

  if (!splashDone || !ready) {
    return (
      <div className="tt-app tt-splash" style={{
        fontFamily: T.ui, background: `linear-gradient(160deg, ${T.navy}, ${T.accentDeep})`,
        color: "#fff", overflow: "hidden", border: `1px solid ${T.line}`,
      }}>
        <style>{GLOBAL_CSS}</style>
        <div className="tt-splash-inner">
          <Heart size={44} fill={T.accentBright} color={T.accentBright} />
          <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.35, maxWidth: 380 }}>{supportMessage}</div>
          {ready ? (
            <button
              className="tt-btn" onClick={() => setSplashDone(true)}
              style={{ background: T.accentBright, color: T.navy, padding: "13px 32px", borderRadius: 10, fontWeight: 700, fontSize: 15 }}
            >
              Continue
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, opacity: 0.85 }}>
              <RefreshCw size={15} className="tt-spin" /> Loading your data…
            </div>
          )}
        </div>
      </div>
    );
  }

  const possessive = patient.name ? `${patient.name}’s` : "";

  const isEmpty = treatments.length === 0 && appointments.length === 0
    && Object.values(entries).every(arr => (arr || []).length === 0) && !patient.name;

  const exportBundle = {
    treatments, appointments, entries, patient, cardOrder, supportMessages, tabOrder,
  };

  function importAllData(bundle) {
    setTreatments(Array.isArray(bundle.treatments) ? bundle.treatments : []);
    setAppointments(Array.isArray(bundle.appointments) ? bundle.appointments : []);
    setEntries(migrateLegacyTestData(bundle.categories, bundle.entries));
    setPatient(bundle.patient && typeof bundle.patient === "object" ? { ...DEFAULT_PATIENT, ...bundle.patient } : DEFAULT_PATIENT);
    setCardOrder(Array.isArray(bundle.cardOrder) && bundle.cardOrder.length === DEFAULT_CARD_ORDER.length ? bundle.cardOrder : DEFAULT_CARD_ORDER);
    setTabOrder(
      Array.isArray(bundle.tabOrder) && bundle.tabOrder.length === DEFAULT_TAB_ORDER.length
        ? bundle.tabOrder.map(id => (id === "tests" ? "measurements" : id))
        : DEFAULT_TAB_ORDER
    );
    // Support messages import as fresh rows rather than a local array, since
    // they now live in their own table.
    if (Array.isArray(bundle.supportMessages)) {
      (async () => {
        for (const m of bundle.supportMessages) {
          await addSupportMessage({ name: m.name || "", date: m.date, message: m.message });
        }
        setSupportMessages(await listSupportMessages());
      })();
    }
  }

  async function handleAddSupportMessage(entry) {
    await addSupportMessage(entry);
    setSupportMessages(await listSupportMessages());
  }
  async function handleDeleteSupportMessage(id) {
    await deleteSupportMessage(id);
    setSupportMessages(await listSupportMessages());
  }

  return (
    <div className="tt-app" style={{
      fontFamily: T.ui, background: T.paper, minHeight: 600, borderRadius: 16,
      overflow: "hidden", border: `1px solid ${T.line}`, color: T.ink,
    }}>
      <style>{GLOBAL_CSS}</style>

      <Header
        mainTab={mainTab} setMainTab={setMainTab} treatments={treatments} possessive={possessive}
        lastSynced={lastSynced} syncing={syncing} syncError={syncError}
        onRefresh={() => (syncError ? forceSaveAll() : refreshAllRef.current())}
        tabOrder={tabOrder} setTabOrder={setTabOrder}
        householdName={membership.householdName} role={role} onSignOut={signOut}
      />

      <div className="tt-content">
        {!canEdit && (
          <div style={{
            background: T.infoBg, border: `1px solid ${T.info}`, color: "#2C4172",
            borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 16,
          }}>
            You're viewing <strong>{membership.householdName}</strong> — you can see everything and add messages of
            support, but only the owner or an editor can add or edit treatments, appointments, and results.
          </div>
        )}
        {isEmpty && mainTab !== "settings" && (
          <div style={{
            background: T.infoBg, border: `1px solid ${T.info}`, color: "#2C4172",
            borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 16,
          }}>
            There's no data here yet. {canEdit ? "Just start adding treatments, appointments and results below, or restore a backup from " : "Ask the owner to start adding data, or check "}
            <strong>Settings → Backup, export &amp; sharing</strong>{canEdit ? "." : " for more."}
          </div>
        )}
        {mainTab === "summary" && (
          <SummaryDashboardTab
            treatments={treatments} appointments={appointments} cardOrder={cardOrder} setCardOrder={setCardOrder}
            supportMessage={supportMessage} onNavigate={goTo}
            featuredMsg={featuredMsg} featuredSummary={featuredSummary}
          />
        )}
        {mainTab === "calendar" && <CalendarTab treatments={treatments} setTreatments={setTreatments} view={calendarView} setView={setCalendarView} canEdit={canEdit} />}
        {mainTab === "appointments" && <AppointmentsTab appointments={appointments} setAppointments={setAppointments} view={appointmentsView} setView={setAppointmentsView} canEdit={canEdit} />}
        {mainTab === "support" && <SupportMessagesTab messages={supportMessages} onAdd={handleAddSupportMessage} onDelete={handleDeleteSupportMessage} canDelete={canEdit} />}
        {mainTab === "bloods" && <BloodsTab bloodsEntries={entries.Bloods || []} setBloodsEntries={(updater) => setEntries(prev => ({ ...prev, Bloods: typeof updater === "function" ? updater(prev.Bloods || []) : updater }))} canEdit={canEdit} />}
        {mainTab === "measurements" && <MeasurementsTab measurementsEntries={entries.Measurements || []} setMeasurementsEntries={(updater) => setEntries(prev => ({ ...prev, Measurements: typeof updater === "function" ? updater(prev.Measurements || []) : updater }))} canEdit={canEdit} />}
        {mainTab === "settings" && (
          <SettingsTab
            patient={patient} setPatient={setPatient} exportBundle={exportBundle} onImportAll={importAllData}
            canEdit={canEdit} canManageHousehold={canManageHousehold}
            householdId={householdId} householdName={membership.householdName}
          />
        )}
      </div>
    </div>
  );
}

function FullScreenMessage({ message }) {
  return (
    <div className="tt-app tt-splash" style={{ fontFamily: T.ui, background: T.paper, color: T.accent }}>
      <style>{GLOBAL_CSS}</style>
      <div className="tt-splash-inner">{message}</div>
    </div>
  );
}

// ================= AUTH SCREENS =================
function AuthScreen({ inviteToken, inviteError }) {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit() {
    setError(""); setInfo("");
    if (!email.trim() || !password) { setError("Enter an email and password."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await signUp(email.trim(), password);
        if (err) throw err;
        setInfo("Check your email to confirm your account, then come back and log in.");
        setMode("login");
      } else {
        const { error: err } = await signIn(email.trim(), password);
        if (err) throw err;
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tt-app tt-splash" style={{
      fontFamily: T.ui, background: `linear-gradient(160deg, ${T.navy}, ${T.accentDeep})`, color: "#fff",
      overflow: "hidden", border: `1px solid ${T.line}`,
    }}>
      <style>{GLOBAL_CSS}</style>
      <div className="tt-splash-inner">
        <Heart size={40} fill={T.accentBright} color={T.accentBright} />
        <div style={{ fontSize: 22, fontWeight: 700 }}>Treatment Tracker</div>
        {inviteToken && (
          <div style={{ fontSize: 12.5, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 10, padding: "8px 14px", maxWidth: 320 }}>
            You've been sent an invite link — sign up or log in below to join as a viewer.
          </div>
        )}
        {inviteError && <div style={{ fontSize: 12.5, color: "#FBE4E7" }}>{inviteError}</div>}

        <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: 300, maxWidth: "100%", textAlign: "left", color: T.ink }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            <button className="tt-btn" onClick={() => setMode("signup")} style={{
              flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: mode === "signup" ? T.navy : T.lineSoft, color: mode === "signup" ? "#fff" : T.inkSoft,
            }}>Sign up</button>
            <button className="tt-btn" onClick={() => setMode("login")} style={{
              flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: mode === "login" ? T.navy : T.lineSoft, color: mode === "login" ? "#fff" : T.inkSoft,
            }}>Log in</button>
          </div>
          <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></Field>
          <Field label="Password"><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inputStyle} /></Field>
          {error && <div style={{ fontSize: 12, color: T.breach, marginBottom: 10 }}>{error}</div>}
          {info && <div style={{ fontSize: 12, color: T.ok, marginBottom: 10 }}>{info}</div>}
          <button className="tt-btn" onClick={handleSubmit} disabled={busy} style={{ width: "100%", background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600 }}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateHouseholdScreen({ inviteError, onCreated }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setBusy(true); setError("");
    try {
      const m = await createHousehold(name.trim() || "Our tracker");
      onCreated(m);
    } catch (e) {
      setError(e.message || "Couldn't create that — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tt-app tt-splash" style={{
      fontFamily: T.ui, background: `linear-gradient(160deg, ${T.navy}, ${T.accentDeep})`, color: "#fff",
      overflow: "hidden", border: `1px solid ${T.line}`,
    }}>
      <style>{GLOBAL_CSS}</style>
      <div className="tt-splash-inner">
        <Heart size={40} fill={T.accentBright} color={T.accentBright} />
        <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center" }}>Let's set up your tracker</div>
        {inviteError && (
          <div style={{ fontSize: 12.5, color: "#FBE4E7", maxWidth: 320, textAlign: "center" }}>
            {inviteError} If someone invited you, ask them to double-check the link and send it again.
          </div>
        )}
        <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: 300, maxWidth: "100%", textAlign: "left", color: T.ink }}>
          <Field label="What should we call this? (optional)">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kate's Tracker" style={inputStyle} />
          </Field>
          {error && <div style={{ fontSize: 12, color: T.breach, marginBottom: 10 }}>{error}</div>}
          <button className="tt-btn" onClick={handleCreate} disabled={busy} style={{ width: "100%", background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600 }}>
            {busy ? "Setting up…" : "Get started"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ================= HEADER =================
const TAB_META = {
  summary: { icon: <LayoutDashboard size={15} />, label: "Summary" },
  calendar: { icon: <CalendarDays size={15} />, label: "Treatment Calendar" },
  appointments: { icon: <Stethoscope size={15} />, label: "Appointments" },
  bloods: { icon: <Droplet size={15} />, label: "Bloods" },
  support: { icon: <Heart size={15} />, label: "Support Messages" },
  measurements: { icon: <Ruler size={15} />, label: "Measurements" },
  settings: { icon: <SettingsIcon size={15} />, label: "Settings" },
};

function Header({ mainTab, setMainTab, treatments, possessive, lastSynced, syncing, onRefresh, syncError, tabOrder, setTabOrder, householdName, role, onSignOut }) {
  const next = useMemo(() => {
    const today = todayStr();
    return treatments
      .filter(t => t.status !== "Completed" && t.status !== "Skipped" && t.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }, [treatments]);

  const titles = {
    summary: possessive ? `${possessive} Summary` : "Summary",
    calendar: possessive ? `${possessive} Treatment Tracker` : "Treatment Tracker",
    appointments: possessive ? `${possessive} Appointments` : "Appointments",
    bloods: possessive ? `${possessive} Bloods` : "Bloods",
    support: "Support Messages",
    measurements: possessive ? `${possessive} Measurements` : "Measurements",
    settings: "Settings",
  };
  const subs = {
    summary: "Progress at a glance",
    calendar: "Care plan, appointments and rescheduling",
    appointments: "Consultant, registrar and surgical appointments",
    bloods: "Blood test results over time, element by element",
    support: "Messages of love and encouragement",
    measurements: "Scan measurements and results over time",
    settings: "Patient details and app preferences",
  };

  const syncLabel = syncError
    ? "Couldn't save — tap to retry"
    : syncing
      ? "Syncing…"
      : lastSynced
        ? `Synced ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "";

  return (
    <div className="tt-header" style={{ background: T.navy, borderBottom: `3px solid ${T.accentBright}`, color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.2 }}>{titles[mainTab]}</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.66)", marginTop: 2 }}>{subs[mainTab]}</div>
          {householdName && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{householdName}</span>
              <span style={{ background: "rgba(255,255,255,.1)", borderRadius: 4, padding: "1px 6px", fontWeight: 700, textTransform: "uppercase", fontSize: 9.5, letterSpacing: 0.4 }}>{role}</span>
              <button className="tt-btn" onClick={onSignOut} style={{ background: "transparent", color: "rgba(255,255,255,.6)", fontSize: 11, textDecoration: "underline", padding: 0 }}>Log out</button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {next && mainTab !== "settings" && (
            <div style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 10, padding: "8px 14px", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8,
            }}>
              <Clock3 size={14} />
              <span>Next: <strong>{next.type === "Other" ? next.typeCustom : next.type}</strong> · {fmtDate(next.date)}</span>
            </div>
          )}
          <button
            className="tt-btn" onClick={onRefresh} title="Check for updates now"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: syncError ? "rgba(200,16,46,0.25)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${syncError ? "#E68A9A" : "rgba(255,255,255,.18)"}`, borderRadius: 10, padding: "8px 12px",
              fontSize: 11.5, color: syncError ? "#FBE4E7" : "rgba(255,255,255,.85)", fontWeight: syncError ? 700 : 400,
            }}
          >
            <RefreshCw size={13} className={syncing ? "tt-spin" : ""} />
            {syncLabel}
          </button>
        </div>
      </div>
      <div className="tt-header-tabs">
        {(tabOrder && tabOrder.length === Object.keys(TAB_META).length ? tabOrder : DEFAULT_TAB_ORDER).map(id => (
          <DraggableTab
            key={id}
            id={id}
            active={mainTab === id}
            meta={TAB_META[id]}
            onClick={() => setMainTab(id)}
            onReorder={(fromId, toId) => {
              setTabOrder(prev => {
                const base = prev && prev.length === Object.keys(TAB_META).length ? prev : DEFAULT_TAB_ORDER;
                const arr = [...base];
                const from = arr.indexOf(fromId), to = arr.indexOf(toId);
                if (from < 0 || to < 0) return arr;
                arr.splice(from, 1);
                arr.splice(to, 0, fromId);
                return arr;
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className="tt-btn tt-tab-btn" style={{
      display: "flex", alignItems: "center", gap: 7,
      background: active ? T.paper : "transparent", color: active ? T.ink : "#fff",
      padding: "9px 18px", borderRadius: "10px 10px 0 0", fontSize: 13.5, fontWeight: 600,
      opacity: active ? 1 : 0.8,
    }}>
      {icon}{label}
    </button>
  );
}

function DraggableTab({ id, active, meta, onClick, onReorder }) {
  const [isOver, setIsOver] = useState(false);
  if (!meta) return null;
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", id)}
      onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const fromId = e.dataTransfer.getData("text/plain");
        if (fromId && fromId !== id) onReorder(fromId, id);
      }}
      style={{ borderRadius: "10px 10px 0 0", boxShadow: isOver ? `inset 0 -3px 0 ${T.accentBright}` : "none" }}
    >
      <TabButton active={active} onClick={onClick} icon={meta.icon} label={meta.label} />
    </div>
  );
}

// ================= SUMMARY DASHBOARD TAB =================
function SummaryDashboardTab({ treatments, appointments, cardOrder, setCardOrder, supportMessage, onNavigate, featuredMsg, featuredSummary }) {
  const today = todayStr();
  const sorted = useMemo(() => [...treatments].sort((a, b) => a.date.localeCompare(b.date)), [treatments]);

  const nextTreatment = useMemo(
    () => sorted.find(t => t.status !== "Completed" && t.status !== "Skipped" && t.date >= today),
    [sorted, today]
  );

  const nextAppointment = useMemo(
    () => [...(appointments || [])].filter(a => a.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0],
    [appointments, today]
  );

  // "Completed to date" = of everything due by today, how many were actually completed.
  const dueToDate = useMemo(() => treatments.filter(t => t.date <= today), [treatments, today]);
  const completedToDate = dueToDate.filter(t => t.status === "Completed").length;
  const totalDueToDate = dueToDate.length;
  const completedPct = totalDueToDate ? Math.round((completedToDate / totalDueToDate) * 100) : 0;

  const remainingByType = useMemo(() => {
    const m = {};
    treatments.forEach(t => {
      if (t.status === "Completed" || t.status === "Skipped") return;
      const label = t.type === "Other" ? (t.typeCustom || "Other") : t.type;
      m[label] = (m[label] || 0) + 1;
    });
    return m;
  }, [treatments]);

  const phase = useMemo(() => {
    const active = sorted.filter(t => t.status !== "Skipped");
    if (active.length === 0) return null;

    let anchorIdx = 0, bestDiff = Infinity;
    active.forEach((t, i) => {
      const diff = Math.abs(daysBetween(today, t.date));
      if (diff < bestDiff) { bestDiff = diff; anchorIdx = i; }
    });

    const currentType = active[anchorIdx].type === "Other" ? (active[anchorIdx].typeCustom || "Other") : active[anchorIdx].type;

    let endDate = active[anchorIdx].date;
    let nextIdx = null;
    for (let i = anchorIdx; i < active.length; i++) {
      const label = active[i].type === "Other" ? (active[i].typeCustom || "Other") : active[i].type;
      if (label === currentType) { endDate = active[i].date; }
      else { nextIdx = i; break; }
    }

    let nextType = null, nextDate = null;
    if (nextIdx !== null) {
      nextType = active[nextIdx].type === "Other" ? (active[nextIdx].typeCustom || "Other") : active[nextIdx].type;
      nextDate = active[nextIdx].date;
    }
    return { currentType, endDate, nextType, nextDate };
  }, [sorted, today]);

  const cardsMap = {
    next: {
      icon: <CalendarClock size={16} />, label: "Next treatment", accent: T.accent,
      nav: () => onNavigate("calendar", "month"),
      content: nextTreatment ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{nextTreatment.type === "Other" ? nextTreatment.typeCustom : nextTreatment.type}</div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 4, fontFamily: T.mono }}>{fmtDate(nextTreatment.date)}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12 }}>
            <MiniStat label="Cycle" value={nextTreatment.cycle || "—"} />
            <MiniStat label="Day" value={nextTreatment.day || "—"} />
          </div>
          {nextTreatment.drugs && <div style={{ marginTop: 10, fontSize: 12.5, color: T.ink, background: T.paper, borderRadius: 7, padding: "6px 9px" }}>{nextTreatment.drugs}</div>}
        </>
      ) : <div style={{ fontSize: 13, color: T.inkSoft }}>No upcoming treatments scheduled</div>,
    },
    nextAppointment: {
      icon: <Stethoscope size={16} />, label: "Next appointment", accent: T.info,
      nav: () => onNavigate("appointments", "month"),
      content: nextAppointment ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{apptTitle(nextAppointment)}</div>
          {nextAppointment.name && nextAppointment.name.trim() && (
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
              <span style={{ background: (ROLE_STYLES[nextAppointment.role] || ROLE_STYLES.Other).bg, color: (ROLE_STYLES[nextAppointment.role] || ROLE_STYLES.Other).text, borderRadius: 5, padding: "2px 7px", fontWeight: 600, fontSize: 11 }}>
                {nextAppointment.role || "Other"}
              </span>
            </div>
          )}
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, fontFamily: T.mono }}>{fmtDate(nextAppointment.date)}</div>
        </>
      ) : <div style={{ fontSize: 13, color: T.inkSoft }}>No upcoming appointments scheduled</div>,
    },
    completed: {
      icon: <CalendarCheck2 size={16} />, label: "Completed to date", accent: T.ok,
      nav: () => onNavigate("calendar", "summary"),
      content: (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.ink }}>
              {completedToDate}<span style={{ fontSize: 15, color: T.inkSoft, fontWeight: 600 }}> / {totalDueToDate}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ok }}>{completedPct}%</div>
          </div>
          <div style={{ height: 6, background: T.lineSoft, borderRadius: 4, marginTop: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${completedPct}%`, background: T.ok, borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>completed of those scheduled to date</div>
        </>
      ),
    },
    remaining: {
      icon: <Layers size={16} />, label: "Remaining by type", accent: T.info,
      nav: () => onNavigate("calendar", "summary"),
      content: Object.keys(remainingByType).length === 0
        ? <div style={{ fontSize: 13, color: T.inkSoft }}>Nothing remaining</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(remainingByType).map(([label, count]) => {
              const ts = TYPE_STYLES[label] || TYPE_STYLES.Other;
              return (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: ts.border, display: "inline-block" }} />{label}
                  </span>
                  <span style={{ fontWeight: 700, color: T.ink }}>{count}</span>
                </div>
              );
            })}
          </div>
        ),
    },
    phaseEnd: {
      icon: <Clock3 size={16} />, label: phase ? `End of ${phase.currentType}` : "Current phase", accent: T.warn,
      nav: () => onNavigate("calendar", "summary"),
      content: phase ? (
        <>
          <div style={{ fontSize: 26, fontWeight: 700, color: T.ink }}>{Math.max(daysBetween(today, phase.endDate), 0)}<span style={{ fontSize: 13, color: T.inkSoft, fontWeight: 600 }}> days</span></div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>Last {phase.currentType.toLowerCase()} planned for {fmtDate(phase.endDate)}</div>
        </>
      ) : <div style={{ fontSize: 13, color: T.inkSoft }}>No treatments logged yet</div>,
    },
    nextType: {
      icon: <TrendingUp size={16} />, label: "Next new treatment type", accent: T.navy,
      nav: () => onNavigate("calendar", "summary"),
      content: phase && phase.nextType ? (
        <>
          <div style={{ fontSize: 26, fontWeight: 700, color: T.ink }}>{Math.max(daysBetween(today, phase.nextDate), 0)}<span style={{ fontSize: 13, color: T.inkSoft, fontWeight: 600 }}> days</span></div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>{phase.nextType} begins {fmtDate(phase.nextDate)}</div>
        </>
      ) : <div style={{ fontSize: 13, color: T.inkSoft }}>No further treatment type change scheduled</div>,
    },
    supportMessages: {
      icon: <Heart size={16} />, label: "A message for you", accent: "#C9857E",
      nav: () => onNavigate("support"),
      fullWidth: true,
      content: featuredMsg ? (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{featuredMsg.name || "Someone"}</div>
          <div style={{ fontSize: 14.5, color: T.ink, marginTop: 6, lineHeight: 1.55 }}>
            {featuredSummary || featuredMsg.message}
          </div>
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10 }}>Tap to see all messages →</div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: T.inkSoft }}>No messages yet — tap to add the first one.</div>
      ),
    },
  };

  const orderIds = cardOrder && cardOrder.length === Object.keys(cardsMap).length ? cardOrder : Object.keys(cardsMap);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  function handleDrop(targetId, e) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setOverId(null); setDragId(null);
    if (!id || id === targetId) return;
    setCardOrder(prev => {
      const arr = [...(prev && prev.length ? prev : orderIds)];
      const from = arr.indexOf(id), to = arr.indexOf(targetId);
      if (from < 0 || to < 0) return arr;
      arr.splice(from, 1);
      arr.splice(to, 0, id);
      return arr;
    });
  }

  return (
    <div>
      {supportMessage && (
        <div style={{
          fontSize: 24, fontWeight: 800, color: T.navy, marginBottom: 18, lineHeight: 1.3,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Heart size={22} fill="#C9857E" color="#C9857E" style={{ flexShrink: 0 }} />
          {supportMessage}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <GripVertical size={13} /> Drag a card to reorder, or tap one to jump to that section
      </div>
      <div className="tt-summary-grid">
        {orderIds.map(id => {
          const cfg = cardsMap[id];
          if (!cfg) return null;
          const isOver = overId === id;
          return (
            <div
              key={id}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); setDragId(id); }}
              onDragOver={(e) => { e.preventDefault(); setOverId(id); }}
              onDragLeave={() => setOverId(prev => (prev === id ? null : prev))}
              onDrop={(e) => handleDrop(id, e)}
              onClick={() => { if (cfg.nav) cfg.nav(); }}
              style={{
                cursor: "pointer", borderRadius: 12,
                outline: isOver ? `2px dashed ${T.accent}` : "none", outlineOffset: 2,
                opacity: dragId === id ? 0.5 : 1,
                gridColumn: cfg.fullWidth ? "1 / -1" : undefined,
              }}
            >
              <SummaryCard icon={cfg.icon} label={cfg.label} accent={cfg.accent}>{cfg.content}</SummaryCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, accent, children }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, borderTop: `3px solid ${accent}`, height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.inkSoft, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 10 }}>
        {icon}{label}
      </div>
      {children}
    </div>
  );
}
function MiniStat({ label, value }) {
  return (
    <div>
      <div style={{ color: T.inkSoft, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontWeight: 700, color: T.ink }}>{value}</div>
    </div>
  );
}

// ================= CALENDAR TAB =================
function CalendarTab({ treatments, setTreatments, view, setView, canEdit }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState(todayStr());
  const [editing, setEditing] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const byDate = useMemo(() => {
    const m = {};
    treatments.forEach(t => { (m[t.date] = m[t.date] || []).push(t); });
    return m;
  }, [treatments]);

  function addTreatment(t) { setTreatments(prev => [...prev, { id: uid(), history: [], ...t }]); setFormOpen(false); }
  function updateTreatment(id, patch) { setTreatments(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t))); }
  function deleteTreatment(id) { setTreatments(prev => prev.filter(t => t.id !== id)); setEditing(null); }
  function handleDrop(dateStr, e) {
    e.preventDefault(); setDragOverDate(null);
    if (!canEdit) return;
    const id = e.dataTransfer.getData("text/plain");
    setTreatments(prev => prev.map(t => {
      if (t.id !== id || t.date === dateStr) return t;
      const historyEntry = { at: new Date().toISOString(), note: `Rescheduled from ${fmtDate(t.date)} to ${fmtDate(dateStr)}` };
      const wasFinal = t.status === "Completed" || t.status === "Skipped";
      return { ...t, date: dateStr, status: wasFinal ? t.status : "Delayed", history: [...(t.history || []), historyEntry] };
    }));
  }

  return (
    <div>
      <div className="tt-cal-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {view === "month" ? (
            <>
              <IconBtn onClick={() => setCursor(c => shiftMonth(c, -1))}><ChevronLeft size={16} /></IconBtn>
              <div style={{ fontSize: 18, fontWeight: 600, minWidth: 150, textAlign: "center" }}>{MONTH_NAMES[cursor.month]} {cursor.year}</div>
              <IconBtn onClick={() => setCursor(c => shiftMonth(c, 1))}><ChevronRight size={16} /></IconBtn>
              <button className="tt-btn" onClick={() => { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); }}
                style={{ background: "transparent", color: T.accent, fontSize: 12.5, fontWeight: 600, padding: "6px 8px" }}>Today</button>
            </>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 600 }}>All treatments</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: T.lineSoft, borderRadius: 9, padding: 3 }}>
            <ViewToggleBtn active={view === "summary"} onClick={() => setView("summary")} icon={<List size={13} />} label="Summary" />
            <ViewToggleBtn active={view === "month"} onClick={() => setView("month")} icon={<Grid3x3 size={13} />} label="Calendar" />
          </div>
          {canEdit && (
            <button className="tt-btn" onClick={() => { setFormDate(todayStr()); setFormOpen(true); }}
              style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={15} /> Add treatment
            </button>
          )}
        </div>
      </div>

      {view === "month" ? (
        <>
          <div className="tt-cal-grid-wrap">
            <div className="tt-cal-weekdays">
              {DAY_NAMES.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>{d}</div>
              ))}
            </div>
            <div className="tt-cal-grid">
              {grid.map((cell, i) => {
                const dateStr = cell.dateStr;
                const isToday = dateStr === todayStr();
                const dayTreatments = byDate[dateStr] || [];
                const dragging = dragOverDate === dateStr;
                return (
                  <div key={i} className="tt-day-cell"
                    onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOverDate(dateStr); } }}
                    onDragLeave={() => setDragOverDate(prev => (prev === dateStr ? null : prev))}
                    onDrop={(e) => handleDrop(dateStr, e)}
                    onClick={() => { if (canEdit && cell.inMonth) { setFormDate(dateStr); setFormOpen(true); } }}
                    style={{
                      background: cell.inMonth ? T.card : T.paper,
                      border: dragging ? `2px dashed ${T.accent}` : `1px solid ${T.lineSoft}`,
                      borderRadius: 10, cursor: cell.inMonth && canEdit ? "pointer" : "default", opacity: cell.inMonth ? 1 : 0.5,
                    }}>
                    <div style={{
                      fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? T.accentDeep : T.inkSoft,
                      width: isToday ? 20 : "auto", height: isToday ? 20 : "auto",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isToday ? T.accentSoft : "transparent", borderRadius: "50%",
                    }}>{cell.day}</div>
                    {dayTreatments.map(t => <TreatmentChip key={t.id} t={t} onClick={(e) => { e.stopPropagation(); setEditing(t); }} />)}
                  </div>
                );
              })}
            </div>
          </div>
          <Legend2 />
        </>
      ) : (
        <SummaryView treatments={treatments} onRowClick={setEditing} />
      )}

      {formOpen && canEdit && <AddTreatmentModal defaultDate={formDate} onClose={() => setFormOpen(false)} onSave={addTreatment} />}
      {editing && <EditTreatmentModal t={editing} canEdit={canEdit} onClose={() => setEditing(null)} onSave={(patch) => { updateTreatment(editing.id, patch); setEditing(null); }} onDelete={() => deleteTreatment(editing.id)} />}
    </div>
  );
}

function IconBtn({ onClick, children }) {
  return (
    <button className="tt-btn" onClick={onClick}
      style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {children}
    </button>
  );
}
function ViewToggleBtn({ active, onClick, icon, label }) {
  return (
    <button className="tt-btn" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5, background: active ? T.card : "transparent",
      color: active ? T.ink : T.inkSoft, fontWeight: 600, fontSize: 12, padding: "6px 12px", borderRadius: 7,
      boxShadow: active ? "0 1px 3px rgba(45,55,70,.1)" : "none",
    }}>{icon}{label}</button>
  );
}

function SummaryView({ treatments, onRowClick }) {
  const sorted = useMemo(() => [...treatments].sort((a, b) => a.date.localeCompare(b.date)), [treatments]);
  const today = todayStr();
  if (sorted.length === 0) {
    return <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>No treatments added yet.</div>;
  }
  return (
    <div className="tt-table-wrap" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: T.paper, textAlign: "left" }}>
            <th style={thStyle}>Cycle</th>
            <th style={thStyle}>Day</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Drug(s)</th>
            <th style={thStyle}>Dose</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(t => {
            const isPast = t.date < today;
            const ts = TYPE_STYLES[t.type] || TYPE_STYLES.Other;
            const sm = STATUS_META[t.status] || STATUS_META.Scheduled;
            return (
              <tr key={t.id} onClick={() => onRowClick(t)} style={{ borderTop: `1px solid ${T.lineSoft}`, cursor: "pointer", opacity: isPast ? 0.72 : 1 }}>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{t.cycle || "—"}</td>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{t.day || "—"}</td>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{fmtDate(t.date)}</td>
                <td style={tdStyle}>
                  <span style={{ background: ts.bg, color: ts.text, borderLeft: `3px solid ${ts.border}`, borderRadius: 5, padding: "2px 8px", fontWeight: 600, fontSize: 12 }}>
                    {t.type === "Other" ? (t.typeCustom || "Other") : t.type}
                  </span>
                </td>
                <td style={tdStyle}>{t.drugs || "—"}</td>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{t.dose ? `${t.dose}%` : "—"}</td>
                <td style={tdStyle}><span style={{ background: sm.bg, color: sm.color, borderRadius: 5, padding: "2px 8px", fontWeight: 700, fontSize: 11.5 }}>{sm.label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TreatmentChip({ t, onClick }) {
  const ts = TYPE_STYLES[t.type] || TYPE_STYLES.Other;
  const sm = STATUS_META[t.status] || STATUS_META.Scheduled;
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)} onClick={onClick}
      title={`${t.type === "Other" ? t.typeCustom : t.type} — ${t.drugs || ""}`}
      style={{ background: ts.bg, borderLeft: `3px solid ${ts.border}`, color: ts.text, borderRadius: 6, padding: "4px 6px", fontSize: 10.5, lineHeight: 1.3, cursor: "grab", display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ fontWeight: 700 }}>{t.type === "Other" ? t.typeCustom : t.type}{t.dose ? ` · ${t.dose}%` : ""}</div>
      {t.drugs && <div style={{ opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.drugs}</div>}
      <span style={{ alignSelf: "flex-start", background: sm.bg, color: sm.color, borderRadius: 4, padding: "1px 5px", fontWeight: 700, fontSize: 9.5, marginTop: 1 }}>{sm.label}</span>
    </div>
  );
}

function Legend2() {
  return (
    <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap", fontSize: 11.5, color: T.inkSoft }}>
      {Object.entries(TYPE_STYLES).map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: v.border, display: "inline-block" }} />{k}
        </div>
      ))}
      <div style={{ opacity: 0.7 }}>Drag a treatment onto a new date to reschedule it</div>
    </div>
  );
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    const day = daysInPrevMonth - startOffset + 1 + i;
    cells.push({ day, inMonth: false, dateStr: isoDate(new Date(year, month - 1, day)) });
  }
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, inMonth: true, dateStr: isoDate(new Date(year, month, day)) });
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const idx = cells.length - (startOffset + daysInMonth);
    const d = new Date(year, month + 1, idx + 1);
    cells.push({ day: d.getDate(), inMonth: false, dateStr: isoDate(d) });
    if (cells.length >= 42) break;
  }
  return cells;
}
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function shiftMonth(cursor, delta) {
  let m = cursor.month + delta, y = cursor.year;
  if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
  return { year: y, month: m };
}

// ---------- modals ----------
function ModalShell({ onClose, title, children, width = 420 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,55,70,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.paper, borderRadius: 14, padding: 22, width, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
          <button className="tt-btn" onClick={onClose} style={{ background: "transparent", padding: 4 }}><X size={18} color={T.inkSoft} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      {children}
    </div>
  );
}
const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 13.5, fontFamily: "inherit", background: T.card, boxSizing: "border-box", color: T.ink };

function AddTreatmentModal({ defaultDate, onClose, onSave }) {
  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState("Chemotherapy");
  const [typeCustom, setTypeCustom] = useState("");
  const [drugs, setDrugs] = useState("");
  const [dose, setDose] = useState("");
  const [cycle, setCycle] = useState("");
  const [day, setDay] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <ModalShell title="Add treatment" onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
      <Field label="Type">
        <select className="tt-select" value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
          {TREATMENT_TYPES.map(tp => <option key={tp}>{tp}</option>)}
        </select>
      </Field>
      {type === "Other" && (
        <Field label="Describe type"><input value={typeCustom} onChange={e => setTypeCustom(e.target.value)} placeholder="e.g. Physiotherapy" style={inputStyle} /></Field>
      )}
      <div className="tt-2col">
        <Field label="Cycle (optional)"><input value={cycle} onChange={e => setCycle(e.target.value)} placeholder="e.g. 3" style={inputStyle} /></Field>
        <Field label="Day (optional)"><input value={day} onChange={e => setDay(e.target.value)} placeholder="e.g. 1" style={inputStyle} /></Field>
      </div>
      <Field label="Drug(s) / procedure detail"><input value={drugs} onChange={e => setDrugs(e.target.value)} placeholder="e.g. Carboplatin, Paclitaxel" style={inputStyle} /></Field>
      <Field label="Dose (%, optional)"><input value={dose} onChange={e => setDose(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 100" style={inputStyle} /></Field>
      <Field label="Notes (optional)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></Field>
      <button className="tt-btn" onClick={() => onSave({ date, type, typeCustom, drugs, dose, cycle, day, notes, status: "Scheduled" })}
        style={{ width: "100%", background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
        Save treatment
      </button>
    </ModalShell>
  );
}

function EditTreatmentModal({ t, onClose, onSave, onDelete, canEdit = true }) {
  const [status, setStatus] = useState(t.status);
  const [newDate, setNewDate] = useState(t.date);
  const [drugs, setDrugs] = useState(t.drugs || "");
  const [dose, setDose] = useState(t.dose || "");
  const [cycle, setCycle] = useState(t.cycle || "");
  const [day, setDay] = useState(t.day || "");
  const [notes, setNotes] = useState(t.notes || "");

  function handleSave() {
    if (status === "Delayed" && newDate !== t.date) {
      onSave({ status: "Delayed", date: newDate, drugs, dose, cycle, day, notes, history: [...(t.history || []), { at: new Date().toISOString(), note: `Delayed from ${fmtDate(t.date)} to ${fmtDate(newDate)}` }] });
    } else {
      onSave({ status, drugs, dose, cycle, day, notes });
    }
  }

  return (
    <ModalShell title={`${t.type === "Other" ? t.typeCustom : t.type} — ${fmtDate(t.date)}`} onClose={onClose}>
      <Field label="Status">
        <select className="tt-select" value={status} onChange={e => setStatus(e.target.value)} disabled={!canEdit} style={inputStyle}>
          <option>Scheduled</option><option>Completed</option><option>Skipped</option><option>Delayed</option>
        </select>
      </Field>
      {status === "Delayed" && <Field label="New scheduled date"><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>}
      <div className="tt-2col">
        <Field label="Cycle"><input value={cycle} onChange={e => setCycle(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
        <Field label="Day"><input value={day} onChange={e => setDay(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
      </div>
      <Field label="Drug(s) / procedure detail"><input value={drugs} onChange={e => setDrugs(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
      <Field label="Dose (%, optional)"><input value={dose} onChange={e => setDose(e.target.value.replace(/[^0-9.]/g, ""))} disabled={!canEdit} style={inputStyle} /></Field>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} disabled={!canEdit} style={{ ...inputStyle, resize: "vertical" }} /></Field>

      {t.history && t.history.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {t.history.map((h, i) => <div key={i} style={{ fontSize: 12, color: T.inkSoft, display: "flex", gap: 6 }}><RotateCcw size={12} style={{ marginTop: 2, flexShrink: 0 }} />{h.note}</div>)}
          </div>
        </div>
      )}

      {canEdit ? (
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button className="tt-btn" onClick={handleSave} style={{ flex: 1, background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600 }}>Save changes</button>
          <button className="tt-btn" onClick={onDelete} style={{ background: T.breachBg, color: T.breach, padding: "11px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>You're viewing this as a viewer — only the owner can make changes.</div>
      )}
    </ModalShell>
  );
}

// ================= BLOODS TAB =================
function BloodsTab({ bloodsEntries, setBloodsEntries, canEdit = true }) {
  const [sub, setSub] = useState("chart"); // chart | haematology | biochemistry | Other
  const [selectedElement, setSelectedElement] = useState(HAEMATOLOGY_KEYS[0]);

  useEffect(() => {
    if (sub === "haematology" && !HAEMATOLOGY_KEYS.includes(selectedElement)) setSelectedElement(HAEMATOLOGY_KEYS[0]);
    if (sub === "biochemistry" && !BIOCHEMISTRY_KEYS.includes(selectedElement)) setSelectedElement(BIOCHEMISTRY_KEYS[0]);
  }, [sub]); // eslint-disable-line

  const knownElementSet = useMemo(() => new Set(BLOOD_ELEMENT_KEYS), []);
  const otherEntries = useMemo(() => bloodsEntries.filter(e => !knownElementSet.has(e.description)), [bloodsEntries, knownElementSet]);

  function addEntry(entry) {
    setBloodsEntries(prev => [...prev, { id: uid(), ...entry }]);
  }
  function deleteEntry(id) {
    setBloodsEntries(prev => prev.filter(e => e.id !== id));
  }

  const topTabs = [
    { id: "chart", label: "Chart", icon: <TrendingUp size={13} /> },
    { id: "haematology", label: "Haematology" },
    { id: "biochemistry", label: "Biochemistry" },
    { id: "Other", label: "Other" },
  ];
  const elementRow = sub === "haematology" ? HAEMATOLOGY_KEYS : sub === "biochemistry" ? BIOCHEMISTRY_KEYS : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, flexWrap: "wrap", overflowX: "auto" }}>
        {topTabs.map(t => (
          <button key={t.id} className="tt-btn" onClick={() => setSub(t.id)} style={{
            background: sub === t.id ? T.navy : T.card, color: sub === t.id ? "#fff" : T.ink,
            border: `1px solid ${sub === t.id ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px",
            fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {elementRow && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {elementRow.map(key => (
            <button key={key} className="tt-btn" onClick={() => setSelectedElement(key)} style={{
              background: selectedElement === key ? T.accentSoft : T.card,
              color: selectedElement === key ? T.accentDeep : T.inkSoft,
              border: `1px solid ${selectedElement === key ? T.accent : T.line}`, borderRadius: 20, padding: "6px 13px",
              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
            }}>
              {key}
            </button>
          ))}
        </div>
      )}

      {sub === "chart" && <BloodsChartPanel bloodsEntries={bloodsEntries} />}
      {sub === "Other" && (
        <BloodElementPanel
          elementName={null}
          isOther
          entries={otherEntries}
          onAdd={addEntry}
          onDelete={deleteEntry}
          canEdit={canEdit}
        />
      )}
      {(sub === "haematology" || sub === "biochemistry") && (
        <BloodElementPanel
          elementName={selectedElement}
          meta={BLOOD_NORMALS[selectedElement]}
          entries={bloodsEntries.filter(e => e.description === selectedElement)}
          onAdd={addEntry}
          onDelete={deleteEntry}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

function BloodElementPanel({ elementName, meta, isOther, entries, onAdd, onDelete, canEdit = true }) {
  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState("");
  const [score, setScore] = useState("");
  const [unit, setUnit] = useState(meta ? meta.unit : "");

  // Re-sync the unit (and clear the score) whenever the element being added
  // for changes, so the correct unit is always pre-filled rather than
  // carrying over whatever was left from the previously selected element.
  useEffect(() => {
    setUnit(meta ? meta.unit : "");
    setScore("");
  }, [elementName]); // eslint-disable-line

  const sorted = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const knownDescriptions = useMemo(() => Array.from(new Set(entries.map(e => e.description))), [entries]);

  function handleAdd() {
    const desc = isOther ? description.trim() : elementName;
    if (!desc || !date) return;
    onAdd({ date, description: desc, score: score.trim(), unit: unit.trim() });
    setScore("");
    if (isOther) setDescription("");
  }

  return (
    <div>
      {canEdit && (
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: T.accentDeep }}>
          {isOther ? "Add another blood result" : `Add a ${elementName} result`}
        </div>
        {meta && <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 12 }}>Typical normal range: {meta.range}</div>}
        <div className="tt-add-form">
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Date</div><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></div>
          {isOther ? (
            <div>
              <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Description</div>
              <input list="bloodOtherList" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Ferritin" style={inputStyle} />
              <datalist id="bloodOtherList">{knownDescriptions.map(d => <option key={d} value={d} />)}</datalist>
            </div>
          ) : <div />}
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Score</div><input value={score} onChange={e => setScore(e.target.value)} placeholder="e.g. 118" style={inputStyle} /></div>
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Unit</div><input value={unit} onChange={e => setUnit(e.target.value)} placeholder={meta ? meta.unit : "unit"} style={inputStyle} /></div>
          <button className="tt-btn" onClick={handleAdd} style={{ background: T.accent, color: "#fff", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Add</button>
        </div>
      </div>
      )}

      <div className="tt-table-wrap" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: T.paper, textAlign: "left" }}><th style={thStyle}>Date</th>{isOther && <th style={thStyle}>Description</th>}<th style={thStyle}>Score</th><th style={thStyle}></th></tr></thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={isOther ? 4 : 3} style={{ padding: 18, textAlign: "center", color: T.inkSoft, fontSize: 12.5 }}>No results yet — add the first one above.</td></tr>}
            {sorted.map(e => (
              <tr key={e.id} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{fmtDate(e.date)}</td>
                {isOther && <td style={tdStyle}>{e.description}</td>}
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{e.score}{e.unit ? ` ${e.unit}` : ""}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{canEdit && <button className="tt-btn" onClick={() => onDelete(e.id)} style={{ background: "transparent", color: T.breach, padding: 4 }}><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BloodsChartPanel({ bloodsEntries }) {
  const seriesNames = useMemo(
    () => Array.from(new Set(bloodsEntries.filter(e => !isNaN(parseFloat(e.score))).map(e => e.description))),
    [bloodsEntries]
  );

  // Nothing selected by default — the user picks one measurement to view.
  const [selectedMetric, setSelectedMetric] = useState("");
  const normal = selectedMetric ? BLOOD_NORMALS[selectedMetric] : null;

  // Scoped to just this metric's own entries, sorted oldest-to-newest — so the
  // x-axis naturally starts at that metric's earliest recorded date rather
  // than the earliest date across every measurement in Bloods.
  const chartData = useMemo(() => {
    if (!selectedMetric) return [];
    return bloodsEntries
      .filter(e => e.description === selectedMetric && !isNaN(parseFloat(e.score)))
      .map(e => ({ date: e.date, [selectedMetric]: parseFloat(e.score) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [bloodsEntries, selectedMetric]);

  if (seriesNames.length === 0) {
    return <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>No results recorded yet — add some from the Haematology or Biochemistry tabs above.</div>;
  }

  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accentDeep, display: "flex", alignItems: "center", gap: 6 }}><TrendingUp size={15} /> Trend over time</div>
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Measurement</div>
        <select className="tt-select" value={selectedMetric} onChange={e => setSelectedMetric(e.target.value)} style={inputStyle}>
          <option value="">Select a measurement…</option>
          {seriesNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {!selectedMetric ? (
        <div style={{ padding: "30px 0", textAlign: "center", color: T.inkSoft, fontSize: 13 }}>Choose a measurement above to see its trend.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.inkSoft }} tickFormatter={fmtDate} />
              <YAxis tick={{ fontSize: 11, fill: T.inkSoft }} />
              <Tooltip labelFormatter={fmtDate} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {normal && (
                <ReferenceLine
                  y={normal.normal} stroke={T.inkSoft} strokeDasharray="5 4"
                  label={{ value: "Typical normal", position: "insideTopRight", fill: T.inkSoft, fontSize: 11 }}
                />
              )}
              <Line type="monotone" dataKey={selectedMetric} stroke={LINE_COLORS[0]} connectNulls dot={{ r: 3 }} strokeWidth={2} name={selectedMetric} />
            </LineChart>
          </ResponsiveContainer>
          {normal && (
            <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10 }}>
              Dashed line shows a typical normal reference value for {selectedMetric} ({normal.range}). Reference
              ranges vary by lab, age and sex — always check the range printed on the actual lab report.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ================= MEASUREMENTS TAB =================
function MeasurementsTab({ measurementsEntries, setMeasurementsEntries, canEdit = true }) {
  const [sub, setSub] = useState("chart");

  function addEntry(entry) { setMeasurementsEntries(prev => [...prev, { id: uid(), ...entry }]); }
  function deleteEntry(id) { setMeasurementsEntries(prev => prev.filter(e => e.id !== id)); }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="tt-btn" onClick={() => setSub("chart")} style={{
          background: sub === "chart" ? T.navy : T.card, color: sub === "chart" ? "#fff" : T.ink,
          border: `1px solid ${sub === "chart" ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px",
          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        }}>
          <TrendingUp size={13} /> Chart
        </button>
        <button className="tt-btn" onClick={() => setSub("entry")} style={{
          background: sub === "entry" ? T.navy : T.card, color: sub === "entry" ? "#fff" : T.ink,
          border: `1px solid ${sub === "entry" ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px",
          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        }}>
          {canEdit ? <><Plus size={13} /> Add Measurement</> : "History"}
        </button>
      </div>

      {sub === "chart" && <MeasurementsChartPanel entries={measurementsEntries} />}
      {sub === "entry" && <MeasurementsEntryPanel entries={measurementsEntries} onAdd={addEntry} onDelete={deleteEntry} canEdit={canEdit} />}
    </div>
  );
}

function MeasurementsEntryPanel({ entries, onAdd, onDelete, canEdit = true }) {
  const [date, setDate] = useState(todayStr());
  const [scanType, setScanType] = useState(SCAN_TYPES[0]);
  const [score, setScore] = useState("");
  const [unit, setUnit] = useState(SCAN_UNITS[SCAN_TYPES[0]] || "");

  // Re-sync the unit (and clear the score) whenever the scan type changes,
  // so the correct unit is always pre-filled.
  useEffect(() => {
    setUnit(SCAN_UNITS[scanType] || "");
    setScore("");
  }, [scanType]);

  const sorted = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);

  function handleAdd() {
    if (!scanType || !date) return;
    onAdd({ date, description: scanType, score: score.trim(), unit: unit.trim() });
    setScore(""); setUnit(SCAN_UNITS[scanType] || "");
  }

  return (
    <div>
      {canEdit && (
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accentDeep }}>Add a measurement</div>
        <div className="tt-add-form">
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Date</div><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></div>
          <div>
            <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Scan type</div>
            <select className="tt-select" value={scanType} onChange={e => setScanType(e.target.value)} style={inputStyle}>
              {SCAN_TYPES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Measurement</div><input value={score} onChange={e => setScore(e.target.value)} placeholder="e.g. 22" style={inputStyle} /></div>
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Unit</div><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="mm" style={inputStyle} /></div>
          <button className="tt-btn" onClick={handleAdd} style={{ background: T.accent, color: "#fff", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Add</button>
        </div>
      </div>
      )}

      <div className="tt-table-wrap" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: T.paper, textAlign: "left" }}><th style={thStyle}>Date</th><th style={thStyle}>Scan type</th><th style={thStyle}>Measurement</th><th style={thStyle}></th></tr></thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={4} style={{ padding: 18, textAlign: "center", color: T.inkSoft, fontSize: 12.5 }}>No measurements yet — add the first one above.</td></tr>}
            {sorted.map(e => (
              <tr key={e.id} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{fmtDate(e.date)}</td>
                <td style={tdStyle}>{e.description}</td>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{e.score}{e.unit ? ` ${e.unit}` : ""}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{canEdit && <button className="tt-btn" onClick={() => onDelete(e.id)} style={{ background: "transparent", color: T.breach, padding: 4 }}><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MeasurementsChartPanel({ entries }) {
  const seriesNames = useMemo(
    () => Array.from(new Set(entries.filter(e => !isNaN(parseFloat(e.score))).map(e => e.description))),
    [entries]
  );

  // Nothing selected by default — the user picks one scan type to view.
  const [selectedMetric, setSelectedMetric] = useState("");

  // Scoped to just this scan type's own entries, sorted oldest-to-newest — so
  // the x-axis naturally starts at its earliest recorded date rather than the
  // earliest date across every scan type.
  const chartData = useMemo(() => {
    if (!selectedMetric) return [];
    return entries
      .filter(e => e.description === selectedMetric && !isNaN(parseFloat(e.score)))
      .map(e => ({ date: e.date, [selectedMetric]: parseFloat(e.score) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, selectedMetric]);

  if (seriesNames.length === 0) {
    return <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>No measurements recorded yet — add some from the Add Measurement tab above.</div>;
  }

  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accentDeep, display: "flex", alignItems: "center", gap: 6 }}><TrendingUp size={15} /> Trend over time</div>
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Scan type</div>
        <select className="tt-select" value={selectedMetric} onChange={e => setSelectedMetric(e.target.value)} style={inputStyle}>
          <option value="">Select a scan type…</option>
          {seriesNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {!selectedMetric ? (
        <div style={{ padding: "30px 0", textAlign: "center", color: T.inkSoft, fontSize: 13 }}>Choose a scan type above to see its trend.</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.inkSoft }} tickFormatter={fmtDate} />
            <YAxis tick={{ fontSize: 11, fill: T.inkSoft }} />
            <Tooltip labelFormatter={fmtDate} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey={selectedMetric} stroke={LINE_COLORS[0]} connectNulls dot={{ r: 3 }} strokeWidth={2} name={selectedMetric} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
const thStyle = { padding: "9px 14px", fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.3 };
const tdStyle = { padding: "9px 14px", color: T.ink };

// ================= APPOINTMENTS TAB =================
function AppointmentsTab({ appointments, setAppointments, view, setView, canEdit = true }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState(todayStr());
  const [editing, setEditing] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const byDate = useMemo(() => {
    const m = {};
    appointments.forEach(a => { (m[a.date] = m[a.date] || []).push(a); });
    return m;
  }, [appointments]);

  async function addAppointment(a) {
    const id = uid();
    setAppointments(prev => [...prev, { id, history: [], summary: [], ...a }]);
    setFormOpen(false);
    if (a.notes && a.notes.trim()) {
      const bullets = await summariseNotes(a.notes);
      setAppointments(prev => prev.map(x => (x.id === id ? { ...x, summary: bullets } : x)));
    }
  }
  function updateAppointment(id, patch) { setAppointments(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a))); }
  function deleteAppointment(id) { setAppointments(prev => prev.filter(a => a.id !== id)); setEditing(null); }
  function handleDrop(dateStr, e) {
    e.preventDefault(); setDragOverDate(null);
    if (!canEdit) return;
    const id = e.dataTransfer.getData("text/plain");
    setAppointments(prev => prev.map(a => {
      if (a.id !== id || a.date === dateStr) return a;
      const historyEntry = { at: new Date().toISOString(), note: `Rescheduled from ${fmtDate(a.date)} to ${fmtDate(dateStr)}` };
      return { ...a, date: dateStr, history: [...(a.history || []), historyEntry] };
    }));
  }

  return (
    <div>
      <div className="tt-cal-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {view === "month" ? (
            <>
              <IconBtn onClick={() => setCursor(c => shiftMonth(c, -1))}><ChevronLeft size={16} /></IconBtn>
              <div style={{ fontSize: 18, fontWeight: 600, minWidth: 150, textAlign: "center" }}>{MONTH_NAMES[cursor.month]} {cursor.year}</div>
              <IconBtn onClick={() => setCursor(c => shiftMonth(c, 1))}><ChevronRight size={16} /></IconBtn>
              <button className="tt-btn" onClick={() => { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); }}
                style={{ background: "transparent", color: T.accent, fontSize: 12.5, fontWeight: 600, padding: "6px 8px" }}>Today</button>
            </>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 600 }}>Appointment notes</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: T.lineSoft, borderRadius: 9, padding: 3 }}>
            <ViewToggleBtn active={view === "summary"} onClick={() => setView("summary")} icon={<NotebookText size={13} />} label="Summary" />
            <ViewToggleBtn active={view === "month"} onClick={() => setView("month")} icon={<Grid3x3 size={13} />} label="Calendar" />
          </div>
          {canEdit && (
            <button className="tt-btn" onClick={() => { setFormDate(todayStr()); setFormOpen(true); }}
              style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={15} /> Add appointment
            </button>
          )}
        </div>
      </div>

      {view === "month" ? (
        <>
          <div className="tt-cal-grid-wrap">
            <div className="tt-cal-weekdays">
              {DAY_NAMES.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>{d}</div>
              ))}
            </div>
            <div className="tt-cal-grid">
              {grid.map((cell, i) => {
                const dateStr = cell.dateStr;
                const isToday = dateStr === todayStr();
                const dayAppts = byDate[dateStr] || [];
                const dragging = dragOverDate === dateStr;
                return (
                  <div key={i} className="tt-day-cell"
                    onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOverDate(dateStr); } }}
                    onDragLeave={() => setDragOverDate(prev => (prev === dateStr ? null : prev))}
                    onDrop={(e) => handleDrop(dateStr, e)}
                    onClick={() => { if (canEdit && cell.inMonth) { setFormDate(dateStr); setFormOpen(true); } }}
                    style={{
                      background: cell.inMonth ? T.card : T.paper,
                      border: dragging ? `2px dashed ${T.accent}` : `1px solid ${T.lineSoft}`,
                      borderRadius: 10, cursor: cell.inMonth && canEdit ? "pointer" : "default", opacity: cell.inMonth ? 1 : 0.5,
                    }}>
                    <div style={{
                      fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? T.accentDeep : T.inkSoft,
                      width: isToday ? 20 : "auto", height: isToday ? 20 : "auto",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isToday ? T.accentSoft : "transparent", borderRadius: "50%",
                    }}>{cell.day}</div>
                    {dayAppts.map(a => <AppointmentChip key={a.id} a={a} onClick={(e) => { e.stopPropagation(); setEditing(a); }} />)}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap", fontSize: 11.5, color: T.inkSoft }}>
            {APPT_ROLES.map(r => (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: ROLE_STYLES[r].border, display: "inline-block" }} />{r}
              </div>
            ))}
            <div style={{ opacity: 0.7 }}>Drag an appointment onto a new date to reschedule it</div>
          </div>
        </>
      ) : (
        <AppointmentNotesSummary appointments={appointments} onUpdate={updateAppointment} onRowClick={setEditing} />
      )}

      {formOpen && canEdit && <AddAppointmentModal defaultDate={formDate} onClose={() => setFormOpen(false)} onSave={addAppointment} />}
      {editing && <EditAppointmentModal a={editing} canEdit={canEdit} onClose={() => setEditing(null)} onSave={(patch) => { updateAppointment(editing.id, patch); setEditing(null); }} onDelete={() => deleteAppointment(editing.id)} />}
    </div>
  );
}

function AppointmentChip({ a, onClick }) {
  const rs = ROLE_STYLES[a.role] || ROLE_STYLES.Other;
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)} onClick={onClick}
      title={`${a.name || ""} — ${a.role || ""}`}
      style={{ background: rs.bg, borderLeft: `3px solid ${rs.border}`, color: rs.text, borderRadius: 6, padding: "4px 6px", fontSize: 10.5, lineHeight: 1.3, cursor: "grab", display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{apptTitle(a)}</div>
      {a.name && a.name.trim() && <span style={{ alignSelf: "flex-start", opacity: 0.85, fontSize: 9.5, fontWeight: 700 }}>{a.role || "Other"}</span>}
    </div>
  );
}

function AppointmentNotesSummary({ appointments, onUpdate, onRowClick }) {
  const sorted = useMemo(() => [...appointments].sort((a, b) => b.date.localeCompare(a.date)), [appointments]);
  const [regenerating, setRegenerating] = useState(null);

  async function regenerate(a) {
    setRegenerating(a.id);
    const bullets = await summariseNotes(a.notes || "");
    onUpdate(a.id, { summary: bullets });
    setRegenerating(null);
  }

  if (sorted.length === 0) {
    return <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>No appointments added yet.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {sorted.map(a => {
        const rs = ROLE_STYLES[a.role] || ROLE_STYLES.Other;
        const bullets = a.summary && a.summary.length ? a.summary : (a.notes ? heuristicBullets(a.notes) : []);
        return (
          <div key={a.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div onClick={() => onRowClick(a)} style={{ cursor: "pointer" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: T.mono }}>{fmtDate(a.date)}</div>
                <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                  with <strong style={{ color: T.ink }}>{apptTitle(a)}</strong>{" "}
                  {a.name && a.name.trim() && (
                    <span style={{ background: rs.bg, color: rs.text, borderRadius: 5, padding: "1px 7px", fontWeight: 600, fontSize: 11 }}>{a.role || "Other"}</span>
                  )}
                </div>
              </div>
              {a.notes && (
                <button className="tt-btn" onClick={() => regenerate(a)} disabled={regenerating === a.id}
                  style={{ background: "transparent", color: T.accent, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, padding: "4px 6px" }}>
                  <RefreshCw size={12} className={regenerating === a.id ? "tt-spin" : ""} /> {regenerating === a.id ? "Summarising…" : "Regenerate summary"}
                </button>
              )}
            </div>
            {bullets.length > 0 ? (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                {bullets.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, marginTop: 7, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: T.ink, lineHeight: 1.55 }}>{b}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 12.5, color: T.inkSoft, fontStyle: "italic" }}>No notes recorded for this appointment.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddAppointmentModal({ defaultDate, onClose, onSave }) {
  const [date, setDate] = useState(defaultDate);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Consultant");
  const [notes, setNotes] = useState("");

  return (
    <ModalShell title="Add appointment" onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dr Sarah Chen" style={inputStyle} /></Field>
      <Field label="Job role">
        <select className="tt-select" value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
          {APPT_ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Notes from appointment (optional)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} /></Field>
      <button className="tt-btn" onClick={() => onSave({ date, name, role, notes })}
        style={{ width: "100%", background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
        Save appointment
      </button>
    </ModalShell>
  );
}

function EditAppointmentModal({ a, onClose, onSave, onDelete, canEdit = true }) {
  const [name, setName] = useState(a.name || "");
  const [role, setRole] = useState(a.role || "Consultant");
  const [notes, setNotes] = useState(a.notes || "");
  const [date, setDate] = useState(a.date);
  const [summarising, setSummarising] = useState(false);

  async function handleSave() {
    if (notes.trim() && notes !== a.notes) {
      setSummarising(true);
      const bullets = await summariseNotes(notes);
      setSummarising(false);
      onSave({ name, role, notes, date, summary: bullets });
    } else {
      onSave({ name, role, notes, date });
    }
  }

  return (
    <ModalShell title={`${apptTitle(a)} — ${fmtDate(a.date)}`} onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
      <Field label="Job role">
        <select className="tt-select" value={role} onChange={e => setRole(e.target.value)} disabled={!canEdit} style={inputStyle}>
          {APPT_ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Notes from appointment"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} disabled={!canEdit} style={{ ...inputStyle, resize: "vertical" }} /></Field>

      {a.history && a.history.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {a.history.map((h, i) => <div key={i} style={{ fontSize: 12, color: T.inkSoft, display: "flex", gap: 6 }}><RotateCcw size={12} style={{ marginTop: 2, flexShrink: 0 }} />{h.note}</div>)}
          </div>
        </div>
      )}

      {!canEdit && <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 6 }}>You're viewing this as a viewer — only the owner can make changes.</div>}
      {canEdit && (
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="tt-btn" onClick={handleSave} disabled={summarising} style={{ flex: 1, background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600 }}>
          {summarising ? "Summarising notes…" : "Save changes"}
        </button>
        <button className="tt-btn" onClick={onDelete} style={{ background: T.breachBg, color: T.breach, padding: "11px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
      )}
    </ModalShell>
  );
}

// ================= SUPPORT MESSAGES TAB =================
function SupportMessagesTab({ messages, onAdd, onDelete, canDelete }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayStr());
  const [text, setText] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(false);

  async function addMessage() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), date, message: text.trim() });
      setText(""); setName(""); setDate(todayStr());
    } finally {
      setSaving(false);
    }
  }
  function deleteMessage(id) {
    onDelete(id);
    setExpandedId(prev => (prev === id ? null : prev));
  }

  const sorted = useMemo(() => [...messages].sort((a, b) => b.date.localeCompare(a.date)), [messages]);

  return (
    <div>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accentDeep, display: "flex", alignItems: "center", gap: 6 }}>
          <Heart size={15} fill="#C9857E" color="#C9857E" /> Add a message of support
        </div>
        <div className="tt-2col">
          <Field label="From"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grandma" style={inputStyle} /></Field>
          <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
        </div>
        <Field label="Message"><textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Write a message of support…" style={{ ...inputStyle, resize: "vertical" }} /></Field>
        <button className="tt-btn" onClick={addMessage} disabled={saving} style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "10px 18px", fontSize: 13, fontWeight: 600 }}>
          {saving ? "Adding…" : "Add message"}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
          No messages yet — the first one you add will show up here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(m => {
            const expanded = expandedId === m.id;
            const summary = m.message.length > 70 ? `${m.message.slice(0, 70).trim()}…` : m.message;
            return (
              <div key={m.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedId(prev => (prev === m.id ? null : m.id))}
                  style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                    <Heart size={15} fill="#C9857E" color="#C9857E" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: T.inkSoft }}>
                        <span style={{ fontFamily: T.mono }}>{fmtDate(m.date)}</span>
                        {m.name && <> · <strong style={{ color: T.ink }}>{m.name}</strong></>}
                      </div>
                      {!expanded && (
                        <div style={{ fontSize: 13.5, color: T.ink, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {summary}
                        </div>
                      )}
                    </div>
                  </div>
                  {expanded ? <ChevronUp size={16} color={T.inkSoft} style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color={T.inkSoft} style={{ flexShrink: 0 }} />}
                </div>
                {expanded && (
                  <div style={{ padding: "0 14px 14px 39px" }}>
                    <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.message}</div>
                    {canDelete && (
                      <button className="tt-btn" onClick={() => deleteMessage(m.id)} style={{ marginTop: 10, background: "transparent", color: T.breach, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, padding: "4px 0" }}>
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ================= SETTINGS TAB =================
function SettingsTab({ patient, setPatient, exportBundle, onImportAll, canEdit, canManageHousehold, householdId, householdName }) {
  const [form, setForm] = useState(patient);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(patient), [patient]);

  function set(field, val) { setForm(prev => ({ ...prev, [field]: val })); setSaved(false); }
  function handleSave() { setPatient(form); setSaved(true); setTimeout(() => setSaved(false), 1800); }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <button className="tt-btn" style={{
          display: "flex", alignItems: "center", gap: 7, background: T.navy, color: "#fff",
          border: `1px solid ${T.navy}`, borderRadius: 20, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "default",
        }}><User size={14} /> Patient Data</button>
      </div>
      <div style={{ fontSize: 12, color: T.inkSoft, margin: "10px 0 18px" }}>These details personalise the app and are stored only within this tool.</div>

      <div className="tt-settings-card" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div className="tt-2col">
          <Field label="Full name"><input value={form.name} onChange={e => set("name", e.target.value)} disabled={!canEdit} placeholder="e.g. Kate Smith" style={inputStyle} /></Field>
          <Field label="Date of birth"><input type="date" value={form.dob} onChange={e => set("dob", e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
        </div>
        <Field label="Address"><textarea value={form.address} onChange={e => set("address", e.target.value)} rows={2} disabled={!canEdit} style={{ ...inputStyle, resize: "vertical" }} /></Field>
        <div className="tt-2col">
          <Field label="Height"><input value={form.height} onChange={e => set("height", e.target.value)} disabled={!canEdit} placeholder="e.g. 165 cm" style={inputStyle} /></Field>
          <Field label="Weight"><input value={form.weight} onChange={e => set("weight", e.target.value)} disabled={!canEdit} placeholder="e.g. 62 kg" style={inputStyle} /></Field>
        </div>

        {canEdit && (
          <button className="tt-btn" onClick={handleSave} style={{ background: T.accent, color: "#fff", padding: "11px 20px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
            {saved ? "Saved ✓" : "Save patient details"}
          </button>
        )}
      </div>

      <HouseholdSection householdId={householdId} householdName={householdName} canManageHousehold={canManageHousehold} />

      {canManageHousehold && <BackupSection exportBundle={exportBundle} onImportAll={onImportAll} />}
    </div>
  );
}

function HouseholdSection({ householdId, householdName, canManageHousehold }) {
  const [invites, setInvitesState] = useState([]);
  const [members, setMembersState] = useState([]);
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  const [inviteRole, setInviteRole] = useState("viewer");

  async function refresh() {
    if (!householdId) return;
    const [inv, mem] = await Promise.all([listInvites(householdId), listMembers(householdId)]);
    setInvitesState(inv);
    setMembersState(mem);
  }
  useEffect(() => { if (canManageHousehold) refresh(); }, [householdId, canManageHousehold]); // eslint-disable-line

  async function handleCreateInvite() {
    setCreating(true);
    try {
      await createInvite(householdId, inviteRole);
      await refresh();
    } finally {
      setCreating(false);
    }
  }
  async function handleRevoke(token) {
    await revokeInvite(token);
    await refresh();
  }
  function copyLink(token) {
    const url = `${window.location.origin}${window.location.pathname}?invite=${token}`;
    navigator.clipboard?.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  }

  if (!canManageHousehold) {
    return (
      <div className="tt-settings-card" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>Household</div>
        <div style={{ fontSize: 12, color: T.inkSoft }}>You're on <strong style={{ color: T.ink }}>{householdName}</strong>. Only the owner or an admin can manage invites.</div>
      </div>
    );
  }

  const activeInvites = invites.filter(i => !i.revoked && new Date(i.expires_at) > new Date());
  const roleLabel = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };

  return (
    <div className="tt-settings-card" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>Household &amp; invites</div>
      <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 16 }}>
        Invite friends or family to <strong style={{ color: T.ink }}>{householdName}</strong>. Choose how much access
        they should have.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ minWidth: 260 }}>
          <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>Access level</div>
          <select className="tt-select" value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={inputStyle}>
            <option value="viewer">Viewer — can view + add support messages</option>
            <option value="editor">Editor — can view and edit everything</option>
            <option value="admin">Admin — edit everything, plus manage invites &amp; household</option>
          </select>
        </div>
        <button className="tt-btn" onClick={handleCreateInvite} disabled={creating}
          style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "10px 18px", fontSize: 13, fontWeight: 600 }}>
          {creating ? "Creating…" : "Create invite link"}
        </button>
      </div>

      {activeInvites.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>Active invite links</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeInvites.map(inv => (
              <div key={inv.token} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${T.lineSoft}`, borderRadius: 8, padding: "8px 10px" }}>
                <span style={{
                  background: inv.role === "admin" ? T.infoBg : inv.role === "editor" ? T.accentSoft : T.lineSoft,
                  color: inv.role === "admin" ? T.info : inv.role === "editor" ? T.accentDeep : T.inkSoft,
                  borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700,
                }}>
                  {roleLabel[inv.role] || inv.role}
                </span>
                <div style={{ flex: 1, fontSize: 11.5, color: T.inkSoft, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Expires {fmtDate(inv.expires_at.slice(0, 10))}
                </div>
                <button className="tt-btn" onClick={() => copyLink(inv.token)} style={{ background: T.lineSoft, color: T.ink, borderRadius: 7, padding: "6px 10px", fontSize: 11.5, fontWeight: 600 }}>
                  {copiedToken === inv.token ? "Copied ✓" : "Copy link"}
                </button>
                <button className="tt-btn" onClick={() => handleRevoke(inv.token)} style={{ background: "transparent", color: T.breach, borderRadius: 7, padding: "6px 8px", fontSize: 11.5, fontWeight: 600 }}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>Members</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map(m => (
              <div key={m.user_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.ink }}>
                <span>{m.role === "owner" ? "You (owner)" : roleLabel[m.role] || m.role}</span>
                <span style={{ color: T.inkSoft, fontFamily: T.mono }}>{fmtDate(m.joined_at.slice(0, 10))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BackupSection({ exportBundle, onImportAll }) {
  const [exportPass, setExportPass] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  const [importPass, setImportPass] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importErr, setImportErr] = useState("");

  async function handleExport() {
    if (!exportPass.trim()) { setExportMsg("Enter a passphrase to protect the file first."); return; }
    setExportBusy(true); setExportMsg("");
    try {
      const envelope = await encryptPayload(exportBundle, exportPass);
      const blob = new Blob([JSON.stringify(envelope)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = todayStr();
      a.href = url;
      a.download = `treatment-tracker-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg("Backup downloaded. Share the file and the passphrase separately (e.g. file by email, passphrase by text).");
    } catch (e) {
      setExportMsg("Something went wrong creating the backup — please try again.");
    } finally {
      setExportBusy(false);
    }
  }

  async function handleImport() {
    setImportErr(""); setImportMsg("");
    if (!importFile) { setImportErr("Choose a backup file first."); return; }
    if (!importPass.trim()) { setImportErr("Enter the passphrase used to create this backup."); return; }
    setImportBusy(true);
    try {
      const text = await importFile.text();
      const envelope = JSON.parse(text);
      const bundle = await decryptPayload(envelope, importPass);
      const ok = window.confirm(
        "This will replace all data currently in this app (treatments, appointments, test results, patient details) with the contents of the backup file. This can't be undone. Continue?"
      );
      if (!ok) { setImportBusy(false); return; }
      onImportAll(bundle);
      setImportMsg(`Import complete — data from ${envelope.exportedAt ? fmtDate(envelope.exportedAt.slice(0, 10)) : "the backup"} has been loaded.`);
      setImportFile(null);
      setImportPass("");
    } catch (e) {
      setImportErr(e.message || "Couldn't read that file.");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="tt-settings-card" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>Backup, export &amp; sharing</div>
      <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 16 }}>
        Everyone who opens this app's link shares the same live data — no need to send updates back and forth day to
        day. Export is still useful as an offline backup, or to seed a separate deployment of this app with the same
        starting data. The file is unreadable without the passphrase you set, so it's safe to send over email or
        messaging apps — just share the passphrase a different way (e.g. a text message, not the same email).
        Importing replaces whatever is currently in the app with what's in the file, for everyone.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="tt-2col">
        <div style={{ border: `1px solid ${T.lineSoft}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Export a backup</div>
          <Field label="Set a passphrase">
            <input type="password" value={exportPass} onChange={e => setExportPass(e.target.value)} placeholder="e.g. a memorable phrase" style={inputStyle} />
          </Field>
          <button className="tt-btn" onClick={handleExport} disabled={exportBusy}
            style={{ background: T.accent, color: "#fff", padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, width: "100%" }}>
            {exportBusy ? "Encrypting…" : "Download encrypted backup"}
          </button>
          {exportMsg && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 8 }}>{exportMsg}</div>}
        </div>

        <div style={{ border: `1px solid ${T.lineSoft}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Import a backup</div>
          <Field label="Backup file">
            <input type="file" accept=".json,application/json" onChange={e => setImportFile(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: "7px 8px" }} />
          </Field>
          <Field label="Passphrase">
            <input type="password" value={importPass} onChange={e => setImportPass(e.target.value)} placeholder="Passphrase for this file" style={inputStyle} />
          </Field>
          <button className="tt-btn" onClick={handleImport} disabled={importBusy}
            style={{ background: T.navy, color: "#fff", padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, width: "100%" }}>
            {importBusy ? "Importing…" : "Decrypt and import"}
          </button>
          {importMsg && <div style={{ fontSize: 11.5, color: T.ok, marginTop: 8 }}>{importMsg}</div>}
          {importErr && <div style={{ fontSize: 11.5, color: T.breach, marginTop: 8 }}>{importErr}</div>}
        </div>
      </div>
    </div>
  );
}
