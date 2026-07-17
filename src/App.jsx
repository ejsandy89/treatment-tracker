import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, FlaskConical, CalendarDays,
  Clock3, RotateCcw, TrendingUp, Settings as SettingsIcon, List, Grid3x3, User,
  LayoutDashboard, CalendarCheck2, CalendarClock, Layers, GripVertical,
  Stethoscope, NotebookText, RefreshCw, Heart, ChevronDown, ChevronUp,
} from "lucide-react";
import { loadKey, saveKey } from "./lib/storage.js";
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
const DEFAULT_TAB_ORDER = ["summary", "calendar", "appointments", "support", "tests", "settings"];
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
  .tt-settings-card { max-width: 520px; width: 100%; box-sizing: border-box; }
  .tt-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .tt-add-form { display: grid; grid-template-columns: 140px 1fr 100px 90px auto; gap: 8px; align-items: end; }

  /* ---- Tablet / small desktop ---- */
  @media (max-width: 900px) {
    .tt-summary-grid { grid-template-columns: repeat(2, 1fr); }
  }

  /* ---- Mobile portrait & landscape ---- */
  @media (max-width: 640px) {
    .tt-app { border-radius: 0 !important; border: none !important; min-height: 100dvh; }
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
  const [ready, setReady] = useState(false);
  const [mainTab, setMainTab] = useState("summary");
  const [calendarView, setCalendarView] = useState("summary");
  const [appointmentsView, setAppointmentsView] = useState("summary");

  const [treatments, setTreatments] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [categories, setCategories] = useState(["Bloods", "Measurements"]);
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
  const refreshRef = useRef(() => {});

  function goTo(tab, view) {
    setMainTab(tab);
    if (tab === "calendar" && view) setCalendarView(view);
    if (tab === "appointments" && view) setAppointmentsView(view);
  }

  async function forceSaveAll() {
    setSyncing(true);
    suppressUntil.current = Date.now() + 4000;
    try {
      const results = await Promise.all([
        saveKey("treatments", treatments),
        saveKey("appointments", appointments),
        saveKey("test-categories", categories),
        saveKey("test-entries", entries),
        saveKey("patient-info", patient),
        saveKey("summary-card-order", cardOrder),
        saveKey("support-messages", supportMessages),
        saveKey("tab-order", tabOrder),
      ]);
      const allOk = results.every(Boolean);
      setSyncError(!allOk);
      if (allOk) setLastSynced(new Date());
    } finally {
      setSyncing(false);
    }
  }
  const suppressUntil = useRef(0);

  useEffect(() => {
    (async () => {
      const [t, appts, c, e, p, co, sm, to] = await Promise.all([
        loadKey("treatments", []),
        loadKey("appointments", []),
        loadKey("test-categories", ["Bloods", "Measurements"]),
        loadKey("test-entries", { Bloods: [], Measurements: [] }),
        loadKey("patient-info", DEFAULT_PATIENT),
        loadKey("summary-card-order", DEFAULT_CARD_ORDER),
        loadKey("support-messages", []),
        loadKey("tab-order", DEFAULT_TAB_ORDER),
      ]);
      let loadedCats = c;
      let loadedEntries = e;
      if (loadedCats.includes("MRI") && !loadedCats.includes("Measurements")) {
        loadedCats = loadedCats.map(name => (name === "MRI" ? "Measurements" : name));
        const { MRI, ...rest } = loadedEntries;
        loadedEntries = { ...rest, Measurements: MRI || [] };
      }
      setTreatments(t); setAppointments(appts); setCategories(loadedCats); setEntries(loadedEntries); setPatient(p);
      setCardOrder(co && co.length === DEFAULT_CARD_ORDER.length ? co : DEFAULT_CARD_ORDER);
      setSupportMessages(sm);
      setTabOrder(to && to.length === DEFAULT_TAB_ORDER.length ? to : DEFAULT_TAB_ORDER);
      setLastSynced(new Date());
      setReady(true);

      // Pick one message of support to feature for this session — stays the
      // same for the whole visit, and will be a different one next time.
      if (!featuredPickedRef.current && sm && sm.length > 0) {
        featuredPickedRef.current = true;
        const chosen = sm[Math.floor(Math.random() * sm.length)];
        setFeaturedMsg(chosen);
        summariseSupportMessage(chosen.message).then(setFeaturedSummary);
      }
    })();
  }, []);

  // Live sync: poll for changes made by other people, and refresh whenever
  // the app regains focus/visibility (e.g. switching back from another app).
  // A refresh applies remote data only where it actually differs, and flags
  // that key so the save-effect below doesn't immediately write it straight
  // back — otherwise every poll would trigger a redundant save.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    function applyRemote(setter, flagKey, newVal) {
      setter(prev => {
        if (JSON.stringify(prev) === JSON.stringify(newVal)) return prev;
        remoteFlags.current[flagKey] = true;
        return newVal;
      });
    }

    async function refresh() {
      if (cancelled) return;
      if (Date.now() < suppressUntil.current) return; // a local save just happened — don't race it
      setSyncing(true);
      try {
        const [t, appts, c, e, p, co, sm, to] = await Promise.all([
          loadKey("treatments", []),
          loadKey("appointments", []),
          loadKey("test-categories", ["Bloods", "Measurements"]),
          loadKey("test-entries", { Bloods: [], Measurements: [] }),
          loadKey("patient-info", DEFAULT_PATIENT),
          loadKey("summary-card-order", DEFAULT_CARD_ORDER),
          loadKey("support-messages", []),
          loadKey("tab-order", DEFAULT_TAB_ORDER),
        ]);
        if (cancelled) return;
        let loadedCats = c;
        let loadedEntries = e;
        if (loadedCats.includes("MRI") && !loadedCats.includes("Measurements")) {
          loadedCats = loadedCats.map(name => (name === "MRI" ? "Measurements" : name));
          const { MRI, ...rest } = loadedEntries;
          loadedEntries = { ...rest, Measurements: MRI || [] };
        }
        applyRemote(setTreatments, "treatments", t);
        applyRemote(setAppointments, "appointments", appts);
        applyRemote(setCategories, "categories", loadedCats);
        applyRemote(setEntries, "entries", loadedEntries);
        applyRemote(setPatient, "patient", p);
        applyRemote(setCardOrder, "cardOrder", co && co.length === DEFAULT_CARD_ORDER.length ? co : DEFAULT_CARD_ORDER);
        applyRemote(setSupportMessages, "supportMessages", sm);
        applyRemote(setTabOrder, "tabOrder", to && to.length === DEFAULT_TAB_ORDER.length ? to : DEFAULT_TAB_ORDER);
        setLastSynced(new Date());
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }

    const intervalId = setInterval(refresh, 30000); // every 30s while open
    function onVisibilityChange() { if (document.visibilityState === "visible") refresh(); }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refresh);
    refreshRef.current = refresh;

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refresh);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.treatments) { remoteFlags.current.treatments = false; return; }
    suppressUntil.current = Date.now() + 4000;
    saveKey("treatments", treatments).then(ok => setSyncError(!ok));
  }, [treatments, ready]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.appointments) { remoteFlags.current.appointments = false; return; }
    suppressUntil.current = Date.now() + 4000;
    saveKey("appointments", appointments).then(ok => setSyncError(!ok));
  }, [appointments, ready]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.categories) { remoteFlags.current.categories = false; return; }
    suppressUntil.current = Date.now() + 4000;
    saveKey("test-categories", categories).then(ok => setSyncError(!ok));
  }, [categories, ready]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.entries) { remoteFlags.current.entries = false; return; }
    suppressUntil.current = Date.now() + 4000;
    saveKey("test-entries", entries).then(ok => setSyncError(!ok));
  }, [entries, ready]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.patient) { remoteFlags.current.patient = false; return; }
    suppressUntil.current = Date.now() + 4000;
    saveKey("patient-info", patient).then(ok => setSyncError(!ok));
  }, [patient, ready]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.cardOrder) { remoteFlags.current.cardOrder = false; return; }
    suppressUntil.current = Date.now() + 4000;
    saveKey("summary-card-order", cardOrder).then(ok => setSyncError(!ok));
  }, [cardOrder, ready]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.supportMessages) { remoteFlags.current.supportMessages = false; return; }
    suppressUntil.current = Date.now() + 4000;
    saveKey("support-messages", supportMessages).then(ok => setSyncError(!ok));
  }, [supportMessages, ready]);
  useEffect(() => {
    if (!ready) return;
    if (remoteFlags.current.tabOrder) { remoteFlags.current.tabOrder = false; return; }
    suppressUntil.current = Date.now() + 4000;
    saveKey("tab-order", tabOrder).then(ok => setSyncError(!ok));
  }, [tabOrder, ready]);

  if (!splashDone) {
    return (
      <div className="tt-app" style={{
        fontFamily: T.ui, background: `linear-gradient(160deg, ${T.navy}, ${T.accentDeep})`, minHeight: 600,
        borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}`, color: "#fff",
      }}>
        <style>{GLOBAL_CSS}</style>
        <div className="tt-content" style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: 480, textAlign: "center", gap: 22,
        }}>
          <Heart size={44} fill={T.accentBright} color={T.accentBright} />
          <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.35, maxWidth: 380 }}>{supportMessage}</div>
          <button
            className="tt-btn" onClick={() => setSplashDone(true)}
            style={{ background: T.accentBright, color: T.navy, padding: "13px 32px", borderRadius: 10, fontWeight: 700, fontSize: 15 }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: T.accent, fontFamily: T.ui }}>Loading…</div>;
  }

  const possessive = patient.name ? `${patient.name}’s` : "";

  const isEmpty = treatments.length === 0 && appointments.length === 0
    && Object.values(entries).every(arr => (arr || []).length === 0) && !patient.name;

  const exportBundle = {
    treatments, appointments, categories, entries, patient, cardOrder, supportMessages, tabOrder,
  };

  function importAllData(bundle) {
    setTreatments(Array.isArray(bundle.treatments) ? bundle.treatments : []);
    setAppointments(Array.isArray(bundle.appointments) ? bundle.appointments : []);
    setCategories(Array.isArray(bundle.categories) && bundle.categories.length ? bundle.categories : ["Bloods", "Measurements"]);
    setEntries(bundle.entries && typeof bundle.entries === "object" ? bundle.entries : { Bloods: [], Measurements: [] });
    setPatient(bundle.patient && typeof bundle.patient === "object" ? { ...DEFAULT_PATIENT, ...bundle.patient } : DEFAULT_PATIENT);
    setCardOrder(Array.isArray(bundle.cardOrder) && bundle.cardOrder.length === DEFAULT_CARD_ORDER.length ? bundle.cardOrder : DEFAULT_CARD_ORDER);
    setSupportMessages(Array.isArray(bundle.supportMessages) ? bundle.supportMessages : []);
    setTabOrder(Array.isArray(bundle.tabOrder) && bundle.tabOrder.length === DEFAULT_TAB_ORDER.length ? bundle.tabOrder : DEFAULT_TAB_ORDER);
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
        onRefresh={() => (syncError ? forceSaveAll() : refreshRef.current())}
        tabOrder={tabOrder} setTabOrder={setTabOrder}
      />

      <div className="tt-content">
        {isEmpty && mainTab !== "settings" && (
          <div style={{
            background: T.infoBg, border: `1px solid ${T.info}`, color: "#2C4172",
            borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 16,
          }}>
            There's no data here yet. Just start adding treatments, appointments and results below — everyone who
            opens this link will see it too, or you can restore a backup from <strong>Settings → Backup, export &amp; sharing</strong>.
          </div>
        )}
        {mainTab === "summary" && (
          <SummaryDashboardTab
            treatments={treatments} appointments={appointments} cardOrder={cardOrder} setCardOrder={setCardOrder}
            supportMessage={supportMessage} onNavigate={goTo}
            featuredMsg={featuredMsg} featuredSummary={featuredSummary}
          />
        )}
        {mainTab === "calendar" && <CalendarTab treatments={treatments} setTreatments={setTreatments} view={calendarView} setView={setCalendarView} />}
        {mainTab === "appointments" && <AppointmentsTab appointments={appointments} setAppointments={setAppointments} view={appointmentsView} setView={setAppointmentsView} />}
        {mainTab === "support" && <SupportMessagesTab messages={supportMessages} setMessages={setSupportMessages} />}
        {mainTab === "tests" && <TestsTab categories={categories} setCategories={setCategories} entries={entries} setEntries={setEntries} />}
        {mainTab === "settings" && <SettingsTab patient={patient} setPatient={setPatient} exportBundle={exportBundle} onImportAll={importAllData} onBeforeImport={() => { suppressUntil.current = Date.now() + 4000; }} />}
      </div>
    </div>
  );
}

// ================= HEADER =================
const TAB_META = {
  summary: { icon: <LayoutDashboard size={15} />, label: "Summary" },
  calendar: { icon: <CalendarDays size={15} />, label: "Treatment Calendar" },
  appointments: { icon: <Stethoscope size={15} />, label: "Appointments" },
  support: { icon: <Heart size={15} />, label: "Support Messages" },
  tests: { icon: <FlaskConical size={15} />, label: "Test Results" },
  settings: { icon: <SettingsIcon size={15} />, label: "Settings" },
};

function Header({ mainTab, setMainTab, treatments, possessive, lastSynced, syncing, onRefresh, syncError, tabOrder, setTabOrder }) {
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
    support: "Support Messages",
    tests: possessive ? `${possessive} Test Results` : "Test Results",
    settings: "Settings",
  };
  const subs = {
    summary: "Progress at a glance",
    calendar: "Care plan, appointments and rescheduling",
    appointments: "Consultant, registrar and surgical appointments",
    support: "Messages of love and encouragement",
    tests: "Bloods, scans and results over time",
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
function CalendarTab({ treatments, setTreatments, view, setView }) {
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
          <button className="tt-btn" onClick={() => { setFormDate(todayStr()); setFormOpen(true); }}
            style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={15} /> Add treatment
          </button>
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
                    onDragOver={(e) => { e.preventDefault(); setDragOverDate(dateStr); }}
                    onDragLeave={() => setDragOverDate(prev => (prev === dateStr ? null : prev))}
                    onDrop={(e) => handleDrop(dateStr, e)}
                    onClick={() => { if (cell.inMonth) { setFormDate(dateStr); setFormOpen(true); } }}
                    style={{
                      background: cell.inMonth ? T.card : T.paper,
                      border: dragging ? `2px dashed ${T.accent}` : `1px solid ${T.lineSoft}`,
                      borderRadius: 10, cursor: cell.inMonth ? "pointer" : "default", opacity: cell.inMonth ? 1 : 0.5,
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

      {formOpen && <AddTreatmentModal defaultDate={formDate} onClose={() => setFormOpen(false)} onSave={addTreatment} />}
      {editing && <EditTreatmentModal t={editing} onClose={() => setEditing(null)} onSave={(patch) => { updateTreatment(editing.id, patch); setEditing(null); }} onDelete={() => deleteTreatment(editing.id)} />}
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

function EditTreatmentModal({ t, onClose, onSave, onDelete }) {
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
        <select className="tt-select" value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          <option>Scheduled</option><option>Completed</option><option>Skipped</option><option>Delayed</option>
        </select>
      </Field>
      {status === "Delayed" && <Field label="New scheduled date"><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={inputStyle} /></Field>}
      <div className="tt-2col">
        <Field label="Cycle"><input value={cycle} onChange={e => setCycle(e.target.value)} style={inputStyle} /></Field>
        <Field label="Day"><input value={day} onChange={e => setDay(e.target.value)} style={inputStyle} /></Field>
      </div>
      <Field label="Drug(s) / procedure detail"><input value={drugs} onChange={e => setDrugs(e.target.value)} style={inputStyle} /></Field>
      <Field label="Dose (%, optional)"><input value={dose} onChange={e => setDose(e.target.value.replace(/[^0-9.]/g, ""))} style={inputStyle} /></Field>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></Field>

      {t.history && t.history.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {t.history.map((h, i) => <div key={i} style={{ fontSize: 12, color: T.inkSoft, display: "flex", gap: 6 }}><RotateCcw size={12} style={{ marginTop: 2, flexShrink: 0 }} />{h.note}</div>)}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="tt-btn" onClick={handleSave} style={{ flex: 1, background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600 }}>Save changes</button>
        <button className="tt-btn" onClick={onDelete} style={{ background: T.breachBg, color: T.breach, padding: "11px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </ModalShell>
  );
}

// ================= TESTS TAB =================
function TestsTab({ categories, setCategories, entries, setEntries }) {
  const [active, setActive] = useState(categories[0] || "Bloods");
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  useEffect(() => { if (!categories.includes(active) && categories.length) setActive(categories[0]); }, [categories]); // eslint-disable-line

  function addCategory() {
    const name = newCatName.trim();
    if (!name || categories.includes(name)) { setAddingCat(false); setNewCatName(""); return; }
    setCategories(prev => [...prev, name]);
    setEntries(prev => ({ ...prev, [name]: [] }));
    setActive(name); setAddingCat(false); setNewCatName("");
  }
  function removeCategory(name) {
    if (!window.confirm(`Remove the "${name}" tab and all its entries?`)) return;
    setCategories(prev => prev.filter(c => c !== name));
    setEntries(prev => { const cp = { ...prev }; delete cp[name]; return cp; });
  }

  const catEntries = entries[active] || [];
  function addEntry(entry) { setEntries(prev => ({ ...prev, [active]: [...(prev[active] || []), { id: uid(), ...entry }] })); }
  function deleteEntry(id) { setEntries(prev => ({ ...prev, [active]: (prev[active] || []).filter(e => e.id !== id) })); }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {categories.map(cat => (
          <div key={cat} style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <button className="tt-btn" onClick={() => setActive(cat)} style={{
              background: active === cat ? T.navy : T.card, color: active === cat ? "#fff" : T.ink,
              border: `1px solid ${active === cat ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px", fontSize: 13, fontWeight: 600,
            }}>{cat}</button>
            {categories.length > 1 && (
              <button className="tt-btn" onClick={() => removeCategory(cat)} title={`Remove ${cat}`}
                style={{ background: "transparent", padding: 2, marginLeft: -22, opacity: active === cat ? 0.85 : 0.35, color: active === cat ? "#fff" : T.ink }}>
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {!addingCat ? (
          <button className="tt-btn" onClick={() => setAddingCat(true)} style={{ background: "transparent", color: T.accent, border: `1px dashed ${T.line}`, borderRadius: 20, padding: "8px 14px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <Plus size={14} /> New tab
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCategory()}
              placeholder="e.g. CT Scan" style={{ ...inputStyle, width: 140, padding: "7px 10px" }} />
            <button className="tt-btn" onClick={addCategory} style={{ background: T.accent, color: "#fff", borderRadius: 8, padding: "0 12px", fontSize: 13 }}>Add</button>
          </div>
        )}
      </div>
      <TestCategoryPanel catName={active} catEntries={catEntries} onAdd={addEntry} onDelete={deleteEntry} />
    </div>
  );
}

function TestCategoryPanel({ catName, catEntries, onAdd, onDelete }) {
  const isMeasurements = catName === "Measurements";
  const descLabel = isMeasurements ? "Scan type" : "Description";
  const scoreLabel = isMeasurements ? "Measurement" : "Score";

  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState(isMeasurements ? SCAN_TYPES[0] : "");
  const [score, setScore] = useState("");
  const [unit, setUnit] = useState("");

  useEffect(() => { if (isMeasurements && !description) setDescription(SCAN_TYPES[0]); }, [isMeasurements]); // eslint-disable-line

  const knownDescriptions = useMemo(() => Array.from(new Set(catEntries.map(e => e.description))), [catEntries]);
  const sorted = useMemo(() => [...catEntries].sort((a, b) => b.date.localeCompare(a.date)), [catEntries]);
  const chartData = useMemo(() => buildChartData(catEntries), [catEntries]);
  const seriesNames = useMemo(() => Array.from(new Set(catEntries.filter(e => !isNaN(parseFloat(e.score))).map(e => e.description))), [catEntries]);

  const [selectedDescs, setSelectedDescs] = useState({});
  useEffect(() => {
    setSelectedDescs(prev => {
      const next = { ...prev };
      let changed = false;
      seriesNames.forEach(n => { if (!(n in next)) { next[n] = true; changed = true; } });
      return changed ? next : prev;
    });
  }, [seriesNames]);
  const visibleSeries = seriesNames.filter(n => selectedDescs[n] !== false);
  function toggleDesc(name) { setSelectedDescs(prev => ({ ...prev, [name]: prev[name] === false ? true : false })); }

  function handleAdd() {
    if (!description.trim() || !date) return;
    onAdd({ date, description: description.trim(), score: score.trim(), unit: unit.trim() });
    setScore(""); setUnit("");
    if (!isMeasurements) setDescription("");
  }

  return (
    <div>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accentDeep }}>Add a {catName.toLowerCase()} result</div>
        <div className="tt-add-form">
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Date</div><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></div>
          <div>
            <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>{descLabel}</div>
            {isMeasurements ? (
              <select className="tt-select" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle}>
                {SCAN_TYPES.map(s => <option key={s}>{s}</option>)}
              </select>
            ) : (
              <>
                <input list="descList" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Haemoglobin" style={inputStyle} />
                <datalist id="descList">{knownDescriptions.map(d => <option key={d} value={d} />)}</datalist>
              </>
            )}
          </div>
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>{scoreLabel}</div><input value={score} onChange={e => setScore(e.target.value)} placeholder="e.g. 118" style={inputStyle} /></div>
          <div><div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Unit</div><input value={unit} onChange={e => setUnit(e.target.value)} placeholder={isMeasurements ? "mm" : "g/L"} style={inputStyle} /></div>
          <button className="tt-btn" onClick={handleAdd} style={{ background: T.accent, color: "#fff", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Add</button>
        </div>
      </div>

      {seriesNames.length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accentDeep, display: "flex", alignItems: "center", gap: 6 }}><TrendingUp size={15} /> Trend over time</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {seriesNames.map((name, i) => {
              const on = selectedDescs[name] !== false;
              const color = LINE_COLORS[i % LINE_COLORS.length];
              return (
                <label key={name} onClick={() => toggleDesc(name)} style={{
                  display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none",
                  padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: on ? `${color}1A` : T.lineSoft, color: on ? T.ink : T.inkSoft,
                  border: `1px solid ${on ? color : T.line}`,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, display: "inline-block", background: on ? color : "transparent", border: `1.5px solid ${on ? color : T.inkSoft}` }} />
                  {name}
                </label>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.inkSoft }} tickFormatter={fmtDate} />
              <YAxis tick={{ fontSize: 11, fill: T.inkSoft }} />
              <Tooltip labelFormatter={fmtDate} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {seriesNames.map((name, i) => visibleSeries.includes(name) && (
                <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]} connectNulls dot={{ r: 3 }} strokeWidth={2} name={name} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="tt-table-wrap" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: T.paper, textAlign: "left" }}><th style={thStyle}>Date</th><th style={thStyle}>{descLabel}</th><th style={thStyle}>{scoreLabel}</th><th style={thStyle}></th></tr></thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={4} style={{ padding: 18, textAlign: "center", color: T.inkSoft, fontSize: 12.5 }}>No results yet — add the first one above.</td></tr>}
            {sorted.map(e => (
              <tr key={e.id} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{fmtDate(e.date)}</td>
                <td style={tdStyle}>{e.description}</td>
                <td style={{ ...tdStyle, fontFamily: T.mono }}>{e.score}{e.unit ? ` ${e.unit}` : ""}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}><button className="tt-btn" onClick={() => onDelete(e.id)} style={{ background: "transparent", color: T.breach, padding: 4 }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const thStyle = { padding: "9px 14px", fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.3 };
const tdStyle = { padding: "9px 14px", color: T.ink };

function buildChartData(catEntries) {
  const byDate = {};
  catEntries.forEach(e => {
    const v = parseFloat(e.score);
    if (isNaN(v)) return;
    byDate[e.date] = byDate[e.date] || { date: e.date };
    byDate[e.date][e.description] = v;
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// ================= APPOINTMENTS TAB =================
function AppointmentsTab({ appointments, setAppointments, view, setView }) {
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
          <button className="tt-btn" onClick={() => { setFormDate(todayStr()); setFormOpen(true); }}
            style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={15} /> Add appointment
          </button>
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
                    onDragOver={(e) => { e.preventDefault(); setDragOverDate(dateStr); }}
                    onDragLeave={() => setDragOverDate(prev => (prev === dateStr ? null : prev))}
                    onDrop={(e) => handleDrop(dateStr, e)}
                    onClick={() => { if (cell.inMonth) { setFormDate(dateStr); setFormOpen(true); } }}
                    style={{
                      background: cell.inMonth ? T.card : T.paper,
                      border: dragging ? `2px dashed ${T.accent}` : `1px solid ${T.lineSoft}`,
                      borderRadius: 10, cursor: cell.inMonth ? "pointer" : "default", opacity: cell.inMonth ? 1 : 0.5,
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

      {formOpen && <AddAppointmentModal defaultDate={formDate} onClose={() => setFormOpen(false)} onSave={addAppointment} />}
      {editing && <EditAppointmentModal a={editing} onClose={() => setEditing(null)} onSave={(patch) => { updateAppointment(editing.id, patch); setEditing(null); }} onDelete={() => deleteAppointment(editing.id)} />}
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

function EditAppointmentModal({ a, onClose, onSave, onDelete }) {
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
      <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
      <Field label="Job role">
        <select className="tt-select" value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
          {APPT_ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Notes from appointment"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} /></Field>

      {a.history && a.history.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {a.history.map((h, i) => <div key={i} style={{ fontSize: 12, color: T.inkSoft, display: "flex", gap: 6 }}><RotateCcw size={12} style={{ marginTop: 2, flexShrink: 0 }} />{h.note}</div>)}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="tt-btn" onClick={handleSave} disabled={summarising} style={{ flex: 1, background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600 }}>
          {summarising ? "Summarising notes…" : "Save changes"}
        </button>
        <button className="tt-btn" onClick={onDelete} style={{ background: T.breachBg, color: T.breach, padding: "11px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </ModalShell>
  );
}

// ================= SUPPORT MESSAGES TAB =================
function SupportMessagesTab({ messages, setMessages }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayStr());
  const [text, setText] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  function addMessage() {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { id: uid(), name: name.trim(), date, message: text.trim() }]);
    setText(""); setName(""); setDate(todayStr());
  }
  function deleteMessage(id) {
    setMessages(prev => prev.filter(m => m.id !== id));
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
        <button className="tt-btn" onClick={addMessage} style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "10px 18px", fontSize: 13, fontWeight: 600 }}>
          Add message
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
                    <button className="tt-btn" onClick={() => deleteMessage(m.id)} style={{ marginTop: 10, background: "transparent", color: T.breach, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, padding: "4px 0" }}>
                      <Trash2 size={12} /> Delete
                    </button>
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
function SettingsTab({ patient, setPatient, exportBundle, onImportAll, onBeforeImport }) {
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
          <Field label="Full name"><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Kate Smith" style={inputStyle} /></Field>
          <Field label="Date of birth"><input type="date" value={form.dob} onChange={e => set("dob", e.target.value)} style={inputStyle} /></Field>
        </div>
        <Field label="Address"><textarea value={form.address} onChange={e => set("address", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></Field>
        <div className="tt-2col">
          <Field label="Height"><input value={form.height} onChange={e => set("height", e.target.value)} placeholder="e.g. 165 cm" style={inputStyle} /></Field>
          <Field label="Weight"><input value={form.weight} onChange={e => set("weight", e.target.value)} placeholder="e.g. 62 kg" style={inputStyle} /></Field>
        </div>

        <button className="tt-btn" onClick={handleSave} style={{ background: T.accent, color: "#fff", padding: "11px 20px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
          {saved ? "Saved ✓" : "Save patient details"}
        </button>
      </div>

      <BackupSection exportBundle={exportBundle} onImportAll={onImportAll} onBeforeImport={onBeforeImport} />
    </div>
  );
}

function BackupSection({ exportBundle, onImportAll, onBeforeImport }) {
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
      if (onBeforeImport) onBeforeImport();
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
