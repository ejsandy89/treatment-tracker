import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, FlaskConical, CalendarDays,
  Clock3, RotateCcw, TrendingUp, Settings as SettingsIcon, List, Grid3x3, User,
  LayoutDashboard, CalendarCheck2, CalendarClock, Layers, GripVertical,
  Stethoscope, NotebookText, RefreshCw, Heart, ChevronDown, ChevronUp, Droplet, Ruler, Home, BookOpen, Pill, Apple,
  Sparkles, ArrowUp, ArrowDown, AlertTriangle, Phone, Sun, Moon,
} from "lucide-react";
import {
  loadKey, saveKey, getSession, onAuthChange, signUp, signIn, signOut,
  getMyMembership, createHousehold, redeemInvite, createInvite, listInvites, revokeInvite, listMembers,
  setActiveHousehold, listSupportMessages, addSupportMessage, deleteSupportMessage, subscribeToHousehold,
  getPushPermissionState, getExistingPushSubscription, subscribeToPush, unsubscribeFromPush,
  getNotificationPrefs, setNotificationPrefs, notifyHousehold, sendTestNotification,
} from "./lib/db.js";
import { encryptPayload, decryptPayload } from "./lib/crypto.js";

// ---------- brand tokens (CareTrack) ----------
// T, TYPE_STYLES, STATUS_META, ROLE_STYLES and LINE_COLORS are deliberately
// mutated in place (via Object.assign) rather than replaced, whenever the
// theme mode changes — see applyThemeMode() below. Every component reads
// these directly from module scope during render, so mutating the same
// object/array reference means the whole app picks up new colours the
// moment React next renders, without threading a theme value through props
// or context everywhere.
const LIGHT_THEME = {
  paper: "#F5F1E9", card: "#FFFFFF", ink: "#233937", inkSoft: "#63706F",
  line: "#E6DFD1", lineSoft: "#EFE9DD",
  navy: "#0F2B2A", accent: "#1E5C57", accentDeep: "#16403F",
  accentSoft: "#E7EFEE", accentBright: "#E8734A",
  ok: "#198560", okBg: "#E4F4EE", warn: "#A9670B", warnBg: "#FBF1DF",
  breach: "#C8102E", breachBg: "#FBE4E7", info: "#3A5BA0", infoBg: "#E9EEF8",
  infoText: "#2C4172", warnText: "#7A4E08", radioBg: "#EAEEEC",
  shadow: "0 1px 2px rgba(45,55,70,.06),0 4px 16px rgba(45,55,70,.06)",
};
const DARK_THEME = {
  paper: "#0B211F", card: "#123330", ink: "#EDEDE6", inkSoft: "#9FB0AE",
  line: "#1E4340", lineSoft: "#193A37",
  navy: "#0F2B2A", accent: "#2E7A72", accentDeep: "#7FD9CC",
  accentSoft: "#1A3F3B", accentBright: "#F0906B",
  ok: "#5FCFA0", okBg: "#123A2C", warn: "#F0B054", warnBg: "#3D2E10",
  breach: "#F0798A", breachBg: "#3D151B", info: "#7FAEEA", infoBg: "#152A42",
  infoText: "#7FAEEA", warnText: "#F0B054", radioBg: "#183633",
  shadow: "0 1px 2px rgba(0,0,0,.3),0 4px 16px rgba(0,0,0,.35)",
};
const T = {
  ...LIGHT_THEME,
  radius: 12,
  ui: "'Poppins','Inter',system-ui,sans-serif", mono: "'Roboto Mono',ui-monospace,Menlo,monospace",
};

const THEME_STORAGE_KEY = "tt-theme-mode";
function getStoredThemeMode() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function buildTypeStyles() {
  return {
    Chemotherapy: { bg: T.accentSoft, border: T.accent, text: T.accentDeep },
    Immunotherapy: { bg: T.infoBg, border: T.info, text: T.infoText },
    Surgery: { bg: T.warnBg, border: T.warn, text: T.warnText },
    Radiotherapy: { bg: T.radioBg, border: T.navy, text: T.ink },
    Other: { bg: T.lineSoft, border: T.inkSoft, text: T.inkSoft },
  };
}
function buildStatusMeta() {
  return {
    Scheduled: { label: "Scheduled", color: T.info, bg: T.infoBg },
    Completed: { label: "Completed", color: T.ok, bg: T.okBg },
    Skipped: { label: "Skipped", color: T.breach, bg: T.breachBg },
    Delayed: { label: "Delayed", color: T.warn, bg: T.warnBg },
  };
}
function buildRoleStyles() {
  return {
    Consultant: { bg: T.infoBg, border: T.info, text: T.infoText },
    Registrar: { bg: T.accentSoft, border: T.accent, text: T.accentDeep },
    Surgeon: { bg: T.warnBg, border: T.warn, text: T.warnText },
    Other: { bg: T.lineSoft, border: T.inkSoft, text: T.inkSoft },
  };
}
function buildLineColors() {
  return [T.accentBright, T.info, T.warn, T.breach, T.navy, T.accentDeep, T.warnText];
}

const TYPE_STYLES = buildTypeStyles();
const STATUS_META = buildStatusMeta();
const TREATMENT_TYPES = ["Chemotherapy", "Immunotherapy", "Surgery", "Radiotherapy", "Other"];
const SCAN_TYPES = ["MRI", "Mammogram", "CT", "Ultrasound", "Other"];
// Lesion/tumour measurements are conventionally recorded in millimetres
// regardless of scan modality — kept as a map so a different default could
// be set per scan type later if needed.
const SCAN_UNITS = { MRI: "mm", Mammogram: "mm", CT: "mm", Ultrasound: "mm", Other: "mm" };
const APPT_ROLES = ["Consultant", "Registrar", "Surgeon", "Other"];
const ROLE_STYLES = buildRoleStyles();
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const LINE_COLORS = buildLineColors();

// Called whenever the theme mode changes (see the toggle in Settings).
// Mutates T and its derived style maps IN PLACE so every component picks up
// the new colours on next render, then persists the choice for next visit.
function applyThemeMode(mode) {
  Object.assign(T, mode === "dark" ? DARK_THEME : LIGHT_THEME);
  Object.assign(TYPE_STYLES, buildTypeStyles());
  Object.assign(STATUS_META, buildStatusMeta());
  Object.assign(ROLE_STYLES, buildRoleStyles());
  buildLineColors().forEach((c, i) => { LINE_COLORS[i] = c; });
  if (typeof inputStyle !== "undefined") Object.assign(inputStyle, buildInputStyle());
  if (typeof thStyle !== "undefined") Object.assign(thStyle, buildThStyle());
  if (typeof tdStyle !== "undefined") Object.assign(tdStyle, buildTdStyle());
  try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* ignore */ }
  if (typeof document !== "undefined") {
    document.body.style.background = T.paper;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.setAttribute("content", T.navy);
  }
}

const DEFAULT_CARD_ORDER = ["next", "nextAppointment", "completed", "remaining", "phaseEnd", "nextType", "supportMessages"];
const DEFAULT_TAB_ORDER = ["contents", "summary", "calendar", "appointments", "bloods", "measurements", "prescriptions", "sideeffects", "nutrition", "insights", "support", "guidance", "settings"];

// ---------- CareTrack brand mark ----------
// variant="light" for light backgrounds, variant="dark" for the app's own
// dark-navy surfaces (header, splash screens) — the dark variant swaps in a
// lighter arc/pulse colour pairing so it stays legible, per the brand kit.
// Note: this is about which SURFACE the mark sits on, independent of the
// overall light/dark theme mode below — the header stays dark-styled either way.
function Logo({ variant = "light", withWordmark = true, size = 40 }) {
  const isDark = variant === "dark";
  const arcColor = isDark ? "#EDEDE6" : "#16403F";
  const pulseColor = isDark ? "#F0906B" : "#E8734A";
  const textColor = isDark ? "#F3EFE6" : "#16403F";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <path d="M58 20A24 24 0 1 0 58 52" stroke={arcColor} strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M14 36 L26 36 L31 24 L38 48 L43 36 L52 36" stroke={pulseColor} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="52" cy="36" r="5" fill={pulseColor} />
      </svg>
      {withWordmark && (
        <span style={{ fontSize: size * 0.5, fontWeight: 700, letterSpacing: "-0.01em", color: textColor, fontFamily: T.ui }}>
          Care<span style={{ color: pulseColor, fontWeight: 600 }}>Track</span>
        </span>
      )}
    </div>
  );
}


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

// Commonly used short names/abbreviations, as seen on a typical lab report —
// used only for display on the Bloods Summary table, to keep it compact on
// a phone screen. The full name is still used everywhere else in the app
// (add forms, charts, filters, etc.).
const BLOOD_SHORT_NAMES = {
  "Haemoglobin": "Hb",
  "White Cell Count": "WCC",
  "Platelet Count": "Platelets",
  "Red Blood Cell Count": "RBC",
  "Haematocrit": "Hct",
  "Mean Cell Volume": "MCV",
  "Mean Cell Haemoglobin": "MCH",
  "Neutrophils": "Neuts",
  "Lymphocytes": "Lymphs",
  "Monocytes": "Monos",
  "Eosinophils": "Eos",
  "Basophils": "Baso",
  "Sodium": "Na",
  "Potassium": "K",
  "Urea": "Urea",
  "Creatinine": "Creat",
  "Calcium": "Ca",
  "Adjusted Calcium": "Adj Ca",
  "Magnesium": "Mg",
  "Inorganic Phosphate": "Phosphate",
  "Albumin": "Alb",
  "Alanine Transaminase": "ALT",
  "Alkaline Phosphatase": "ALP",
  "Total Bilirubin": "Bilirubin",
};

// General nutrition reference info, keyed to each blood element. This is
// deliberately general public-health information (which foods commonly
// contain which nutrients) rather than any kind of dietary prescription —
// see the disclaimer shown in the Nutrition tab itself. Markers that mainly
// reflect organ function rather than nutrient status (e.g. liver/kidney
// markers) get a softer, more caveated note rather than a firm food list.
const NUTRITION_INFO = {
  "Haemoglobin": { nutrients: [
    { name: "Iron", foods: "red meat, poultry, spinach, lentils, fortified cereals" },
    { name: "Vitamin B12", foods: "meat, fish, eggs, dairy, fortified plant milks" },
    { name: "Folate", foods: "leafy greens, beans, citrus fruit" },
  ] },
  "White Cell Count": { nutrients: [
    { name: "Vitamin C", foods: "citrus fruit, peppers, broccoli" },
    { name: "Zinc", foods: "meat, shellfish, pumpkin seeds" },
    { name: "Protein", foods: "lean meat, fish, eggs, legumes" },
  ] },
  "Platelet Count": { nutrients: [
    { name: "Vitamin K", foods: "leafy greens, broccoli, Brussels sprouts" },
    { name: "Vitamin B12", foods: "meat, fish, eggs, dairy" },
    { name: "Folate", foods: "leafy greens, beans, citrus fruit" },
  ] },
  "Red Blood Cell Count": { nutrients: [
    { name: "Iron", foods: "red meat, poultry, spinach, lentils, fortified cereals" },
    { name: "Vitamin B12", foods: "meat, fish, eggs, dairy" },
    { name: "Folate", foods: "leafy greens, beans, citrus fruit" },
    { name: "Copper", foods: "nuts, seeds, shellfish" },
  ] },
  "Haematocrit": { nutrients: [
    { name: "Iron", foods: "red meat, poultry, spinach, lentils, fortified cereals" },
    { name: "Vitamin B12", foods: "meat, fish, eggs, dairy" },
    { name: "Folate", foods: "leafy greens, beans, citrus fruit" },
  ] },
  "Mean Cell Volume": {
    note: "Low results are often linked to iron deficiency, high results to a lack of vitamin B12 or folate — worth discussing which applies with your care team.",
    nutrients: [
      { name: "Iron", foods: "red meat, poultry, spinach, lentils, fortified cereals" },
      { name: "Vitamin B12", foods: "meat, fish, eggs, dairy" },
      { name: "Folate", foods: "leafy greens, beans, citrus fruit" },
    ],
  },
  "Mean Cell Haemoglobin": { nutrients: [
    { name: "Iron", foods: "red meat, poultry, spinach, lentils, fortified cereals" },
    { name: "Vitamin B12", foods: "meat, fish, eggs, dairy" },
  ] },
  "Neutrophils": { nutrients: [
    { name: "Vitamin C", foods: "citrus fruit, peppers, broccoli" },
    { name: "Zinc", foods: "meat, shellfish, pumpkin seeds" },
    { name: "Protein", foods: "lean meat, fish, eggs, legumes" },
  ] },
  "Lymphocytes": { nutrients: [
    { name: "Vitamin C", foods: "citrus fruit, peppers, broccoli" },
    { name: "Vitamin D", foods: "oily fish, fortified milk, safe sun exposure" },
    { name: "Zinc", foods: "meat, shellfish, pumpkin seeds" },
  ] },
  "Monocytes": { nutrients: [
    { name: "Vitamin C", foods: "citrus fruit, peppers, broccoli" },
    { name: "Zinc", foods: "meat, shellfish, pumpkin seeds" },
    { name: "Protein", foods: "lean meat, fish, eggs, legumes" },
  ] },
  "Eosinophils": { nutrients: [
    { name: "Vitamin D", foods: "oily fish, fortified milk, safe sun exposure" },
    { name: "Omega-3 fatty acids", foods: "oily fish, flaxseed, walnuts" },
  ] },
  "Basophils": { nutrients: [
    { name: "Vitamin C", foods: "citrus fruit, peppers, broccoli" },
    { name: "Vitamin D", foods: "oily fish, fortified milk, safe sun exposure" },
    { name: "Omega-3 fatty acids", foods: "oily fish, flaxseed, walnuts" },
  ] },
  "Sodium": {
    note: "Sodium levels are mainly affected by fluid and salt intake rather than a nutrient deficiency — unusual results are best discussed directly with your care team.",
    nutrients: [],
  },
  "Potassium": { nutrients: [
    { name: "Potassium", foods: "bananas, potatoes (with skin), oranges, spinach, avocado" },
  ] },
  "Urea": {
    note: "Reflects protein breakdown and kidney function rather than a specific nutrient. Hydration and protein intake are usually the relevant factors — check with your team before changing either.",
    nutrients: [],
  },
  "Creatinine": {
    note: "Reflects muscle metabolism and kidney function rather than a nutrient deficiency. Good hydration is usually the main dietary factor; avoid creatine supplements, and check with your team about protein intake.",
    nutrients: [],
  },
  "Calcium": { nutrients: [
    { name: "Calcium", foods: "dairy, fortified plant milks, leafy greens, almonds, tofu" },
    { name: "Vitamin D (helps absorption)", foods: "oily fish, fortified foods, safe sun exposure" },
  ] },
  "Adjusted Calcium": { nutrients: [
    { name: "Calcium", foods: "dairy, fortified plant milks, leafy greens, almonds, tofu" },
    { name: "Vitamin D (helps absorption)", foods: "oily fish, fortified foods, safe sun exposure" },
  ] },
  "Magnesium": { nutrients: [
    { name: "Magnesium", foods: "nuts, seeds, whole grains, leafy greens, dark chocolate" },
  ] },
  "Inorganic Phosphate": {
    note: "Often linked to kidney function as well as diet — worth discussing with your team if this is outside range.",
    nutrients: [{ name: "Phosphate", foods: "dairy, meat, fish, nuts, whole grains" }],
  },
  "Albumin": { nutrients: [
    { name: "Protein", foods: "lean meat, fish, eggs, dairy, legumes" },
  ] },
  "Alanine Transaminase": {
    note: "Mainly reflects liver function rather than a nutrient deficiency. Limiting alcohol, staying hydrated, and a balanced diet are generally supportive — always check with your team before taking supplements, as some can affect the liver or interact with treatment.",
    nutrients: [],
  },
  "Alkaline Phosphatase": {
    note: "Can reflect liver or bone activity. Calcium and vitamin D support bone health; general liver-friendly habits (limiting alcohol, staying hydrated) apply too.",
    nutrients: [
      { name: "Calcium", foods: "dairy, fortified plant milks, leafy greens, almonds" },
      { name: "Vitamin D", foods: "oily fish, fortified foods, safe sun exposure" },
    ],
  },
  "Total Bilirubin": {
    note: "Mainly reflects liver function and red cell turnover rather than a nutrient deficiency. Staying hydrated and limiting alcohol are generally supportive — always check with your team.",
    nutrients: [],
  },
};

// General reference info on common side effects, matched against whatever
// drugs/prescriptions the person has actually typed in elsewhere in the app.
// Keys are lowercase for matching; values are plain-English side effect
// lists drawn from widely available public patient-information sources
// (e.g. the kind of leaflet that comes with a treatment) — general
// education, not a clinical or exhaustive list. Matching is deliberately
// forgiving (substring match either way) since people type dose details
// alongside the drug name (e.g. "Carboplatin AUC5").
const DRUG_SIDE_EFFECTS = {
  "carboplatin": ["Fatigue", "Nausea and vomiting", "Low blood counts (anaemia, low platelets, low white cells)", "Hearing changes", "Kidney effects", "Hair thinning"],
  "cisplatin": ["Nausea and vomiting", "Kidney effects", "Hearing changes or tinnitus", "Tingling or numbness in hands/feet", "Fatigue", "Low blood counts"],
  "paclitaxel": ["Tingling or numbness in hands/feet (peripheral neuropathy)", "Hair loss", "Joint and muscle aches", "Low blood counts", "Possible allergic reaction during infusion"],
  "docetaxel": ["Fluid retention", "Nail changes", "Fatigue", "Low blood counts", "Hair loss", "Mouth sores"],
  "doxorubicin": ["Hair loss", "Nausea", "Mouth sores", "Low blood counts", "Red or orange-tinted urine (harmless)", "Possible heart effects with cumulative dose"],
  "epirubicin": ["Hair loss", "Nausea", "Mouth sores", "Low blood counts", "Red or orange-tinted urine (harmless)", "Possible heart effects with cumulative dose"],
  "pharmorubicin": ["Hair loss", "Nausea", "Mouth sores", "Low blood counts", "Red or orange-tinted urine (harmless)", "Possible heart effects with cumulative dose"],
  "cyclophosphamide": ["Nausea", "Hair loss", "Low blood counts", "Bladder irritation — stay well hydrated", "Fatigue"],
  "fluorouracil": ["Mouth sores", "Diarrhoea", "Sensitivity to sunlight", "Redness or soreness of palms and soles (hand-foot syndrome)", "Low blood counts"],
  "5-fu": ["Mouth sores", "Diarrhoea", "Sensitivity to sunlight", "Redness or soreness of palms and soles (hand-foot syndrome)", "Low blood counts"],
  "capecitabine": ["Redness or soreness of palms and soles (hand-foot syndrome)", "Diarrhoea", "Nausea", "Fatigue"],
  "gemcitabine": ["Flu-like symptoms", "Fatigue", "Low blood counts", "Mild nausea", "Rash"],
  "oxaliplatin": ["Cold-sensitive tingling in hands, feet or throat", "Fatigue", "Nausea", "Low blood counts"],
  "vinorelbine": ["Constipation", "Low blood counts", "Fatigue", "Nerve tingling", "Hair thinning"],
  "etoposide": ["Hair loss", "Low blood counts", "Nausea", "Fatigue"],
  "methotrexate": ["Mouth sores", "Nausea", "Fatigue", "Low blood counts", "Liver effects"],
  "pemetrexed": ["Fatigue", "Nausea", "Low blood counts", "Rash"],
  "pembrolizumab": ["Fatigue", "Skin rash or itching", "Diarrhoea", "Flu-like symptoms", "Risk of inflammation in organs such as the thyroid, lungs, gut or liver — report any new symptom promptly"],
  "nivolumab": ["Fatigue", "Skin rash or itching", "Diarrhoea", "Flu-like symptoms", "Risk of inflammation in organs such as the thyroid, lungs, gut or liver — report any new symptom promptly"],
  "atezolizumab": ["Fatigue", "Skin rash or itching", "Diarrhoea", "Flu-like symptoms", "Risk of inflammation in organs such as the thyroid, lungs, gut or liver — report any new symptom promptly"],
  "trastuzumab": ["Possible heart effects (monitored regularly)", "Infusion reactions", "Diarrhoea", "Fatigue"],
  "rituximab": ["Infusion reactions", "Low blood counts", "Increased risk of infection"],
  "filgrastim": ["Bone or muscle aches", "Fatigue", "Headache", "Injection site reactions"],
  "dexamethasone": ["Increased appetite", "Difficulty sleeping", "Mood changes", "Increased blood sugar", "Fluid retention", "Indigestion"],
  "prednisolone": ["Increased appetite", "Mood changes", "Difficulty sleeping", "Indigestion", "Increased blood sugar"],
  "ondansetron": ["Headache", "Constipation", "Tiredness"],
  "ciprofloxacin": ["Nausea", "Diarrhoea", "Tendon pain — report this promptly", "Increased sensitivity to sunlight"],
};
const GENERIC_SIDE_EFFECTS = {
  Chemotherapy: ["Fatigue", "Nausea", "Hair loss or thinning", "Increased risk of infection (low white blood cells)", "Mouth sores"],
  Immunotherapy: ["Fatigue", "Skin rash or itching", "Flu-like symptoms", "Diarrhoea", "Risk of inflammation in organs such as the thyroid, lungs, gut or liver — report any new symptom promptly"],
  Radiotherapy: ["Fatigue", "Skin irritation or redness at the treatment site", "Effects specific to the treatment area — ask your team what to expect"],
  Surgery: ["Pain or discomfort at the site", "Swelling or bruising", "Tiredness during recovery", "Risk of infection at the wound site"],
  Other: ["Effects vary — ask your care team what to expect for this treatment"],
};

function matchDrugSideEffects(name) {
  const key = (name || "").trim().toLowerCase();
  if (!key) return null;
  if (DRUG_SIDE_EFFECTS[key]) return DRUG_SIDE_EFFECTS[key];
  const found = Object.keys(DRUG_SIDE_EFFECTS).find(k => key.includes(k) || k.includes(key));
  return found ? DRUG_SIDE_EFFECTS[found] : null;
}

// Builds one card per distinct drug/prescription actually entered elsewhere
// in the app — falling back to a generic per-treatment-type list only when
// a specific drug name isn't recognised, so results only ever reflect what
// the person has actually logged.
function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildSideEffectGroups(treatments, prescriptions) {
  const groups = [];
  const seenSources = new Set();
  const seenGenericTypes = new Set();

  (treatments || []).forEach(t => {
    if (t.status === "Skipped" || !t.type) return;
    const typeLabel = t.type === "Other" ? (t.typeCustom || "Other") : t.type;
    const drugNames = (t.drugs || "").split(",").map(s => s.trim()).filter(Boolean);

    if (drugNames.length === 0) {
      if (!seenGenericTypes.has(typeLabel)) {
        seenGenericTypes.add(typeLabel);
        groups.push({ source: typeLabel, sourceNote: "Treatment type", effects: GENERIC_SIDE_EFFECTS[t.type] || GENERIC_SIDE_EFFECTS.Other });
      }
      return;
    }
    drugNames.forEach(d => {
      const key = d.toLowerCase();
      if (seenSources.has(key)) return;
      seenSources.add(key);
      const matched = matchDrugSideEffects(d);
      if (matched) {
        groups.push({ source: capitalizeFirst(d), sourceNote: typeLabel, effects: matched });
      } else if (!seenGenericTypes.has(typeLabel)) {
        seenGenericTypes.add(typeLabel);
        groups.push({ source: typeLabel, sourceNote: "Treatment type (drug not recognised)", effects: GENERIC_SIDE_EFFECTS[t.type] || GENERIC_SIDE_EFFECTS.Other });
      }
    });
  });

  (prescriptions || []).forEach(rx => {
    if (!rx.name) return;
    const key = rx.name.trim().toLowerCase();
    if (seenSources.has(key)) return;
    seenSources.add(key);
    const matched = matchDrugSideEffects(rx.name);
    if (matched) groups.push({ source: capitalizeFirst(rx.name), sourceNote: "Prescription", effects: matched });
  });

  return groups;
}

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
const fmtShortDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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

const DEFAULT_PATIENT = { name: "", dob: "", address: "", height: "", weight: "", helpline: "" };
function telHref(raw) { return `tel:${(raw || "").replace(/[^\d+]/g, "")}`; }

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
function getGlobalCss() { return `
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
    position: fixed; inset: 0; width: 100%; height: 100%; box-sizing: border-box;
    display: flex; flex-direction: column; border-radius: 0; overflow-y: auto;
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
`; }

export default function App() {
  // ----- Theme (light/dark) -----
  const [themeMode, setThemeModeState] = useState(() => getStoredThemeMode());
  function setThemeMode(mode) {
    applyThemeMode(mode); // mutates T + derived style maps in place
    setThemeModeState(mode); // triggers the re-render that picks up the new values
  }

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
  const [prescriptions, setPrescriptions] = useState([]);
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
      const [t, appts, e, p, co, to, sm, rx] = await Promise.all([
        loadKey("treatments", []),
        loadKey("appointments", []),
        loadKey("test-entries", { Bloods: [], Measurements: [] }),
        loadKey("patient-info", DEFAULT_PATIENT),
        loadKey("summary-card-order", DEFAULT_CARD_ORDER),
        loadKey("tab-order", DEFAULT_TAB_ORDER),
        listSupportMessages(),
        loadKey("prescriptions", []),
      ]);
      const loadedEntries = migrateLegacyTestData(null, e);
      setTreatments(t); setAppointments(appts); setEntries(loadedEntries); setPatient(p);
      setCardOrder(co && co.length === DEFAULT_CARD_ORDER.length ? co : DEFAULT_CARD_ORDER);
      setTabOrder(to && to.length === DEFAULT_TAB_ORDER.length ? to.map(id => (id === "tests" ? "measurements" : id)) : DEFAULT_TAB_ORDER);
      setSupportMessages(sm);
      setPrescriptions(rx);
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
        const [t, appts, e, p, co, to, sm, rx] = await Promise.all([
          loadKey("treatments", []), loadKey("appointments", []),
          loadKey("test-entries", { Bloods: [], Measurements: [] }), loadKey("patient-info", DEFAULT_PATIENT),
          loadKey("summary-card-order", DEFAULT_CARD_ORDER), loadKey("tab-order", DEFAULT_TAB_ORDER),
          listSupportMessages(),
          loadKey("prescriptions", []),
        ]);
        applyIfChanged(setTreatments, "treatments", t);
        applyIfChanged(setAppointments, "appointments", appts);
        applyIfChanged(setEntries, "entries", migrateLegacyTestData(null, e));
        applyIfChanged(setPatient, "patient", p);
        applyIfChanged(setCardOrder, "cardOrder", co && co.length === DEFAULT_CARD_ORDER.length ? co : DEFAULT_CARD_ORDER);
        applyIfChanged(setTabOrder, "tabOrder", to && to.length === DEFAULT_TAB_ORDER.length ? to.map(id => (id === "tests" ? "measurements" : id)) : DEFAULT_TAB_ORDER);
        applyIfChanged(setPrescriptions, "prescriptions", rx);
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
    if (remoteFlags.current.prescriptions) { remoteFlags.current.prescriptions = false; return; }
    if (!canEdit) return;
    saveKey("prescriptions", prescriptions).then(ok => setSyncError(!ok));
  }, [prescriptions, ready, canEdit]);
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
            saveKey("prescriptions", prescriptions),
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
        fontFamily: T.ui, background: T.navy,
        color: "#fff", overflow: "hidden", border: `1px solid ${T.line}`,
      }}>
        <style>{getGlobalCss()}</style>
        <div className="tt-splash-inner">
          <img src="/lockup-dark.svg" alt="CareTrack" style={{ height: 56, width: "auto" }} />
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
    treatments, appointments, entries, prescriptions, patient, cardOrder, supportMessages, tabOrder,
  };

  function importAllData(bundle) {
    setTreatments(Array.isArray(bundle.treatments) ? bundle.treatments : []);
    setAppointments(Array.isArray(bundle.appointments) ? bundle.appointments : []);
    setEntries(migrateLegacyTestData(bundle.categories, bundle.entries));
    setPrescriptions(Array.isArray(bundle.prescriptions) ? bundle.prescriptions : []);
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
    notifyHousehold({ title: "❤️ New message of support", body: entry.name ? `From ${entry.name}` : "Someone left a message for you", category: "support_message" });
  }
  async function handleDeleteSupportMessage(id) {
    await deleteSupportMessage(id);
    setSupportMessages(await listSupportMessages());
  }

  return (
    <div className="tt-app" style={{
      fontFamily: T.ui, background: T.paper, minHeight: 600, borderRadius: 16,
      border: `1px solid ${T.line}`, color: T.ink,
    }}>
      <style>{getGlobalCss()}</style>

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
            background: T.infoBg, border: `1px solid ${T.info}`, color: T.infoText,
            borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 16,
          }}>
            You're viewing <strong>{membership.householdName}</strong> — you can see everything and add messages of
            support, but only the owner or an editor can add or edit treatments, appointments, and results.
          </div>
        )}
        {isEmpty && !["settings", "contents", "guidance"].includes(mainTab) && (
          <div style={{
            background: T.infoBg, border: `1px solid ${T.info}`, color: T.infoText,
            borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 16,
          }}>
            There's no data here yet. {canEdit ? "Just start adding treatments, appointments and results below, or restore a backup from " : "Ask the owner to start adding data, or check "}
            <strong>Settings → Backup, export &amp; sharing</strong>{canEdit ? "." : " for more."}
          </div>
        )}
        {mainTab === "summary" && patient.helpline && (
          <a href={telHref(patient.helpline)} style={{
            display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
            background: T.warnBg, border: `1px solid ${T.warn}`, color: T.warnText,
            borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 16, fontWeight: 600,
          }}>
            <Phone size={14} style={{ flexShrink: 0 }} /> Oncology helpline: {patient.helpline} (tap to call)
          </a>
        )}
        {mainTab === "contents" && <ContentsTab onNavigate={goTo} possessive={possessive} />}
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
        {mainTab === "prescriptions" && <PrescriptionsTab prescriptions={prescriptions} setPrescriptions={setPrescriptions} treatments={treatments} canEdit={canEdit} />}
        {mainTab === "sideeffects" && <SideEffectsTab treatments={treatments} prescriptions={prescriptions} helpline={patient.helpline} />}
        {mainTab === "nutrition" && <NutritionTab />}
        {mainTab === "insights" && <InsightsTab treatments={treatments} prescriptions={prescriptions} bloodsEntries={entries.Bloods || []} />}
        {mainTab === "guidance" && <GuidanceTab />}
        {mainTab === "settings" && (
          <SettingsTab
            patient={patient} setPatient={setPatient} exportBundle={exportBundle} onImportAll={importAllData}
            canEdit={canEdit} canManageHousehold={canManageHousehold}
            householdId={householdId} householdName={membership.householdName}
            themeMode={themeMode} setThemeMode={setThemeMode}
          />
        )}
      </div>
    </div>
  );
}

function FullScreenMessage({ message }) {
  return (
    <div className="tt-app tt-splash" style={{ fontFamily: T.ui, background: T.paper, color: T.accent }}>
      <style>{getGlobalCss()}</style>
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
      fontFamily: T.ui, background: T.navy, color: "#fff",
      overflow: "hidden", border: `1px solid ${T.line}`,
    }}>
      <style>{getGlobalCss()}</style>
      <div className="tt-splash-inner">
        <img src="/lockup-dark.svg" alt="CareTrack" style={{ height: 48, width: "auto" }} />
        {inviteToken && (
          <div style={{ fontSize: 12.5, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 10, padding: "8px 14px", maxWidth: 320 }}>
            You've been sent an invite link — sign up or log in below to join as a viewer.
          </div>
        )}
        {inviteError && <div style={{ fontSize: 12.5, color: "#FBE4E7" }}>{inviteError}</div>}

        <div style={{ background: T.card, borderRadius: 14, padding: 22, width: 300, maxWidth: "100%", textAlign: "left", color: T.ink }}>
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
      fontFamily: T.ui, background: T.navy, color: "#fff",
      overflow: "hidden", border: `1px solid ${T.line}`,
    }}>
      <style>{getGlobalCss()}</style>
      <div className="tt-splash-inner">
        <img src="/lockup-dark.svg" alt="CareTrack" style={{ height: 48, width: "auto" }} />
        <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center" }}>Let's set up your tracker</div>
        {inviteError && (
          <div style={{ fontSize: 12.5, color: "#FBE4E7", maxWidth: 320, textAlign: "center" }}>
            {inviteError} If someone invited you, ask them to double-check the link and send it again.
          </div>
        )}
        <div style={{ background: T.card, borderRadius: 14, padding: 22, width: 300, maxWidth: "100%", textAlign: "left", color: T.ink }}>
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
  contents: { icon: <Home size={15} />, label: "Contents" },
  summary: { icon: <LayoutDashboard size={15} />, label: "Summary" },
  calendar: { icon: <CalendarDays size={15} />, label: "Treatment Calendar" },
  appointments: { icon: <Stethoscope size={15} />, label: "Appointments" },
  bloods: { icon: <Droplet size={15} />, label: "Bloods" },
  support: { icon: <Heart size={15} />, label: "Support Messages" },
  measurements: { icon: <Ruler size={15} />, label: "Measurements" },
  prescriptions: { icon: <Pill size={15} />, label: "Prescriptions" },
  sideeffects: { icon: <AlertTriangle size={15} />, label: "Side Effects" },
  nutrition: { icon: <Apple size={15} />, label: "Nutrition" },
  insights: { icon: <Sparkles size={15} />, label: "Insights" },
  guidance: { icon: <BookOpen size={15} />, label: "Guidance" },
  settings: { icon: <SettingsIcon size={15} />, label: "Settings" },
};
const TAB_DESCRIPTIONS = {
  summary: "A dashboard of key stats and messages of support — next treatment/appointment, progress so far, and more. Drag cards to reorder them.",
  calendar: "Schedule and track chemotherapy, immunotherapy, surgery and radiotherapy sessions, with status tracking, cycle/day tracking, and drag-and-drop rescheduling.",
  appointments: "Track consultant, registrar and surgical appointments, with notes that get automatically condensed into key takeaways.",
  bloods: "Log haematology and biochemistry blood test results element by element, with trend charts and a full summary table against a typical normal range.",
  measurements: "Log scan measurements (MRI, CT, mammogram, ultrasound) and see them charted over time.",
  prescriptions: "Track supportive medications like Filgrastim or steroids, linked to a specific treatment cycle, with the dose schedule worked out automatically.",
  sideeffects: "Common side effects, specific to the treatments and prescriptions you've actually logged.",
  nutrition: "Look up nutrients and foods commonly associated with a specific blood measurement.",
  insights: "Spot statistical patterns between treatments/prescriptions and blood results in your own logged data.",
  support: "Read and add messages of love and encouragement from friends and family — open to everyone, including viewers.",
  guidance: "A full walkthrough of how to use the app, including roles, permissions, and how to add data.",
  settings: "Manage patient details, household members and invites, and back up or restore your data.",
};

function Header({ mainTab, setMainTab, treatments, possessive, lastSynced, syncing, onRefresh, syncError, tabOrder, setTabOrder, householdName, role, onSignOut }) {
  const next = useMemo(() => {
    const today = todayStr();
    return treatments
      .filter(t => t.status !== "Completed" && t.status !== "Skipped" && t.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }, [treatments]);

  const titles = {
    contents: "Contents",
    summary: possessive ? `${possessive} Summary` : "Summary",
    calendar: possessive ? `${possessive} Treatment Tracker` : "Treatment Tracker",
    appointments: possessive ? `${possessive} Appointments` : "Appointments",
    bloods: possessive ? `${possessive} Bloods` : "Bloods",
    support: "Support Messages",
    measurements: possessive ? `${possessive} Measurements` : "Measurements",
    prescriptions: possessive ? `${possessive} Prescriptions` : "Prescriptions",
    sideeffects: "Side Effects",
    nutrition: "Nutrition",
    insights: "Insights",
    guidance: "Guidance",
    settings: "Settings",
  };
  const subs = {
    contents: "What's in this app, and where to find it",
    summary: "Progress at a glance",
    calendar: "Care plan, appointments and rescheduling",
    appointments: "Consultant, registrar and surgical appointments",
    bloods: "Blood test results over time, element by element",
    support: "Messages of love and encouragement",
    measurements: "Scan measurements and results over time",
    prescriptions: "Supportive medications linked to your treatment cycle",
    sideeffects: "Based on what you've logged in Treatments & Prescriptions",
    nutrition: "Nutrients and foods linked to a blood measurement",
    insights: "Patterns spotted in your own logged data",
    guidance: "How to use this app",
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
    <div className="tt-header" style={{ background: T.navy, borderBottom: `3px solid ${T.accentBright}`, color: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Logo variant="dark" withWordmark={false} size={28} />
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

// ================= CONTENTS TAB =================
function ContentsTab({ onNavigate, possessive }) {
  const order = ["summary", "calendar", "appointments", "bloods", "measurements", "prescriptions", "sideeffects", "nutrition", "insights", "support", "guidance", "settings"];
  return (
    <div>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 8 }}>What this app is for</div>
        <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.65 }}>
          {possessive ? `${possessive} Treatment Tracker` : "This app"} is a shared place to record and follow a
          cancer treatment journey — the treatment calendar, appointments, blood and scan results, and messages of
          support — so that the people who need to see it always have the latest picture, in one place, kept up to
          date automatically for everyone.
        </div>
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 10 }}>
        Jump to a section
      </div>
      <div className="tt-summary-grid">
        {order.map(id => {
          const meta = TAB_META[id];
          if (!meta) return null;
          return (
            <div
              key={id}
              onClick={() => onNavigate(id)}
              style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.accentDeep, fontWeight: 700, fontSize: 13.5 }}>
                {meta.icon}{meta.label}
              </div>
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
                {TAB_DESCRIPTIONS[id]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= SUMMARY DASHBOARD TAB =================
function SummaryDashboardTab({ treatments, appointments, cardOrder, setCardOrder, supportMessage, onNavigate, featuredMsg, featuredSummary }) {
  const today = todayStr();
  const sorted = useMemo(() => treatments.filter(t => t.date).sort((a, b) => a.date.localeCompare(b.date)), [treatments]);

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
      icon: <TrendingUp size={16} />, label: "Next new treatment type", accent: T.accentDeep,
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
          fontSize: 24, fontWeight: 800, color: T.accentDeep, marginBottom: 18, lineHeight: 1.3,
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
    Object.values(m).forEach(arr => arr.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")));
    return m;
  }, [treatments]);

  function addTreatment(t) {
    setTreatments(prev => [...prev, { id: uid(), history: [], ...t }]);
    setFormOpen(false);
    const label = t.type === "Other" ? (t.typeCustom || "treatment") : t.type;
    notifyHousehold({ title: "💉 New treatment added", body: `${label} on ${fmtDate(t.date)}`, category: "treatment_added" });
  }
  function updateTreatment(id, patch) {
    setTreatments(prev => {
      const before = prev.find(t => t.id === id);
      const next = prev.map(t => (t.id === id ? { ...t, ...patch } : t));
      if (patch.status === "Completed" && before && before.status !== "Completed") {
        const after = next.find(t => t.id === id);
        const label = after.type === "Other" ? (after.typeCustom || "treatment") : after.type;
        notifyHousehold({ title: "✅ Treatment completed", body: `${label} on ${fmtDate(after.date)}`, category: "treatment_completed" });
      }
      return next;
    });
  }
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
  const sorted = useMemo(() => treatments.filter(t => t.date).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")), [treatments]);
  const today = todayStr();
  if (sorted.length === 0) {
    return <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>No treatments added yet.</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 10 }}>
        Tap a row to see the full details — time, drugs, dose, and any notes.
      </div>
      <div className="tt-table-wrap" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.paper, textAlign: "left" }}>
              <th style={thStyle}>Cycle</th>
              <th style={thStyle}>Day</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Type</th>
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
                  <td style={tdStyle}><span style={{ background: sm.bg, color: sm.color, borderRadius: 5, padding: "2px 8px", fontWeight: 700, fontSize: 11.5 }}>{sm.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TreatmentChip({ t, onClick }) {
  const ts = TYPE_STYLES[t.type] || TYPE_STYLES.Other;
  const sm = STATUS_META[t.status] || STATUS_META.Scheduled;
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)} onClick={onClick}
      title={`${t.type === "Other" ? t.typeCustom : t.type}${t.time ? ` at ${t.time}` : ""} — ${t.drugs || ""}`}
      style={{ background: ts.bg, borderLeft: `3px solid ${ts.border}`, color: ts.text, borderRadius: 6, padding: "4px 6px", fontSize: 10.5, lineHeight: 1.3, cursor: "grab", display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ fontWeight: 700 }}>{t.time ? `${t.time} · ` : ""}{t.type === "Other" ? t.typeCustom : t.type}{t.dose ? ` · ${t.dose}%` : ""}</div>
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

// ---------- Prescription schedule helpers ----------
const PRESCRIPTION_SUGGESTIONS = ["Filgrastim", "Dexamethasone", "Prednisolone", "Ondansetron", "Ciprofloxacin"];

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function generateRxSchedule(rx) {
  if (!rx.startDate) return [];
  if (rx.courseType === "taper") {
    const schedule = [];
    let offset = 0;
    (rx.stages || []).forEach(stage => {
      const days = parseInt(stage.days, 10) || 0;
      for (let i = 0; i < days; i++) {
        schedule.push({ date: addDaysToDate(rx.startDate, offset), label: `${stage.dose}${stage.unit ? ` ${stage.unit}` : ""}` });
        offset++;
      }
    });
    return schedule;
  }
  const perDay = rx.frequency === "Twice daily" ? 2 : 1;
  const total = parseInt(rx.doseCount, 10) || 0;
  const schedule = [];
  let offset = 0, done = 0;
  while (done < total) {
    const todayCount = Math.min(perDay, total - done);
    schedule.push({ date: addDaysToDate(rx.startDate, offset), label: todayCount > 1 ? `${todayCount} doses` : "1 dose" });
    done += todayCount;
    offset++;
  }
  return schedule;
}

function rxSummaryLine(rx) {
  const schedule = generateRxSchedule(rx);
  if (schedule.length === 0) return "No schedule set";
  const start = fmtDate(schedule[0].date);
  const end = fmtDate(schedule[schedule.length - 1].date);
  const timeText = rx.reminderTime ? ` at ${rx.reminderTime}` : "";
  if (rx.courseType === "taper") {
    const stagesText = (rx.stages || []).map(s => `${s.dose}${s.unit || ""} × ${s.days}d`).join(", ");
    return `${stagesText}${timeText} (${start} – ${end})`;
  }
  const freq = rx.frequency === "Twice daily" ? "twice daily" : "once daily";
  return `${rx.doseCount} dose${Number(rx.doseCount) === 1 ? "" : "s"}, ${freq}${timeText}, starting ${start}`;
}
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
function buildInputStyle() { return { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 13.5, fontFamily: "inherit", background: T.card, boxSizing: "border-box", color: T.ink }; }
const inputStyle = buildInputStyle();

function AddTreatmentModal({ defaultDate, onClose, onSave }) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [type, setType] = useState("Chemotherapy");
  const [typeCustom, setTypeCustom] = useState("");
  const [drugs, setDrugs] = useState("");
  const [dose, setDose] = useState("");
  const [cycle, setCycle] = useState("");
  const [day, setDay] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <ModalShell title="Add treatment" onClose={onClose}>
      <div className="tt-2col">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Time (optional)"><input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} /></Field>
      </div>
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
      <button className="tt-btn" onClick={() => onSave({ date, time, type, typeCustom, drugs, dose, cycle, day, notes, status: "Scheduled" })}
        style={{ width: "100%", background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
        Save treatment
      </button>
    </ModalShell>
  );
}

function EditTreatmentModal({ t, onClose, onSave, onDelete, canEdit = true }) {
  const [status, setStatus] = useState(t.status);
  const [newDate, setNewDate] = useState(t.date);
  const [time, setTime] = useState(t.time || "");
  const [drugs, setDrugs] = useState(t.drugs || "");
  const [dose, setDose] = useState(t.dose || "");
  const [cycle, setCycle] = useState(t.cycle || "");
  const [day, setDay] = useState(t.day || "");
  const [notes, setNotes] = useState(t.notes || "");

  function handleSave() {
    if (status === "Delayed" && newDate !== t.date) {
      onSave({ status: "Delayed", date: newDate, time, drugs, dose, cycle, day, notes, history: [...(t.history || []), { at: new Date().toISOString(), note: `Delayed from ${fmtDate(t.date)} to ${fmtDate(newDate)}` }] });
    } else {
      onSave({ status, time, drugs, dose, cycle, day, notes });
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
      <Field label="Time (optional)"><input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
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
  const [sub, setSub] = useState("summarytable"); // summarytable | haematology | biochemistry | Other
  const [selectedElement, setSelectedElement] = useState(HAEMATOLOGY_KEYS[0]);

  useEffect(() => {
    if (sub === "haematology" && !HAEMATOLOGY_KEYS.includes(selectedElement)) setSelectedElement(HAEMATOLOGY_KEYS[0]);
    if (sub === "biochemistry" && !BIOCHEMISTRY_KEYS.includes(selectedElement)) setSelectedElement(BIOCHEMISTRY_KEYS[0]);
  }, [sub]); // eslint-disable-line

  const knownElementSet = useMemo(() => new Set(BLOOD_ELEMENT_KEYS), []);
  const otherEntries = useMemo(() => bloodsEntries.filter(e => !knownElementSet.has(e.description)), [bloodsEntries, knownElementSet]);

  function addEntry(entry) {
    setBloodsEntries(prev => [...prev, { id: uid(), ...entry }]);
    notifyHousehold({ title: "🩸 New blood result added", body: `${entry.description}: ${entry.score}${entry.unit ? ` ${entry.unit}` : ""}`, category: "result_added" });
  }
  function deleteEntry(id) {
    setBloodsEntries(prev => prev.filter(e => e.id !== id));
  }

  const topTabs = [
    { id: "summarytable", label: "Summary", icon: <List size={13} /> },
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

      {sub === "summarytable" && <BloodsSummaryTable bloodsEntries={bloodsEntries} />}
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

// Shared by BloodsSummaryTable and MeasurementsSummaryTable. Defined at
// module scope (not nested inside a render function) so React treats it as
// a stable component across renders, rather than remounting the whole
// header row every time the parent re-renders.
function SortableTh({ label, sortKeyName, width, sticky, sortKey, sortDir, onSort }) {
  const active = sortKey === sortKeyName;
  return (
    <th
      onClick={() => onSort(sortKeyName)}
      style={{
        ...thStyle, textAlign: sticky ? "left" : "center", width, minWidth: width, maxWidth: width,
        cursor: "pointer", userSelect: "none",
        ...(sticky ? { position: "sticky", left: 0, background: T.paper, zIndex: 3 } : {}),
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        {active && (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </span>
    </th>
  );
}

function BloodsSummaryTable({ bloodsEntries }) {
  const grouped = useMemo(() => {
    const map = {};
    bloodsEntries.forEach(e => {
      if (!e.description || !e.date) return; // skip malformed/legacy entries rather than crash on them
      const v = parseFloat(e.score);
      if (isNaN(v)) return;
      if (!map[e.description]) map[e.description] = [];
      map[e.description].push({ date: e.date, value: v, unit: e.unit || (BLOOD_NORMALS[e.description] ? BLOOD_NORMALS[e.description].unit : "") });
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [bloodsEntries]);

  const types = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      const ia = BLOOD_ELEMENT_KEYS.indexOf(a), ib = BLOOD_ELEMENT_KEYS.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [grouped]);

  const [filterType, setFilterType] = useState("");
  const [modalChartType, setModalChartType] = useState(null);
  const [compareMode, setCompareMode] = useState("previous"); // "previous" | "normal"
  const [sortKey, setSortKey] = useState("type");
  const [sortDir, setSortDir] = useState("asc");

  function pctChange(newV, oldV) {
    if (!oldV) return null;
    return ((newV - oldV) / Math.abs(oldV)) * 100;
  }
  // Accounting-style formatting: negatives in brackets, positives shown plain
  // (no + sign needed — the green colour already signals a positive move).
  function fmtActual(diff) {
    return diff < 0 ? `(${Math.abs(diff).toFixed(1)})` : diff.toFixed(1);
  }
  function fmtPct(pct) {
    // pctChange() returns null when the previous/normal value was exactly 0
    // (a % change from zero is mathematically undefined).
    if (pct === null || pct === undefined || !isFinite(pct)) return "—";
    return pct < 0 ? `(${Math.abs(pct).toFixed(0)}%)` : `${pct.toFixed(0)}%`;
  }

  // Pre-compute everything each row needs, once, so filtering/sorting below is cheap.
  const rowData = useMemo(() => types.map(type => {
    const rows = grouped[type];
    const recent = rows[rows.length - 1];
    const previous = rows.length > 1 ? rows[rows.length - 2] : null;
    const meta = BLOOD_NORMALS[type];
    const changePct = previous ? pctChange(recent.value, previous.value) : null;
    const normalPct = meta ? pctChange(recent.value, meta.normal) : null;

    // Did the most recent result move closer to, or further from, normal
    // compared to the previous result? Used to colour/flag the row,
    // regardless of which comparison (previous or normal) is on-screen.
    let movingCloser = null;
    if (meta && previous) {
      const distBefore = Math.abs(previous.value - meta.normal);
      const distAfter = Math.abs(recent.value - meta.normal);
      if (distAfter < distBefore) movingCloser = true;
      else if (distAfter > distBefore) movingCloser = false;
    }
    const isBigMove = changePct !== null && Math.abs(changePct) > 20;
    const rowFlagged = isBigMove && movingCloser === false;

    return { type, recent, previous, meta, changePct, normalPct, movingCloser, rowFlagged };
  }), [types, grouped]);

  // "Type" gets a width that fits the longest short name here; every other
  // column is a single short number, so they can all share one narrow
  // width — keeping as much of the table on-screen at once as possible.
  const typeColWidth = useMemo(() => {
    let chars = 4;
    rowData.forEach(r => { chars = Math.max(chars, (BLOOD_SHORT_NAMES[r.type] || r.type).length); });
    return `${chars + 2}ch`;
  }, [rowData]);
  const numColWidth = "58px";

  function getSortValue(r, key) {
    if (key === "type") return r.type;
    if (key === "recent") return r.recent.value;
    if (key === "comparison") return compareMode === "previous" ? (r.previous ? r.previous.value : null) : (r.meta ? r.meta.normal : null);
    if (key === "changeActual") {
      if (compareMode === "previous") return r.previous ? r.recent.value - r.previous.value : null;
      return r.meta ? r.recent.value - r.meta.normal : null;
    }
    if (key === "changePct") return compareMode === "previous" ? r.changePct : r.normalPct;
    return null;
  }

  const displayRows = useMemo(() => {
    const filtered = filterType ? rowData.filter(r => r.type === filterType) : rowData;
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey), bv = getSortValue(b, sortKey);
      if (sortKey === "type") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      const aMissing = av === null || av === undefined;
      const bMissing = bv === null || bv === undefined;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1; // missing values always sink to the bottom
      if (bMissing) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rowData, filterType, sortKey, sortDir, compareMode]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  if (types.length === 0) {
    return <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>No results recorded yet.</div>;
  }

  const comparisonLabel = compareMode === "previous" ? "Previous" : "Normal";

  return (
    <div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
        Comparison of the latest 2 results. Click a measure to view a graph of recorded results.
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ maxWidth: 260 }}>
          <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Filter by type</div>
          <select className="tt-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Compare to</div>
          <div style={{ display: "inline-flex", background: T.lineSoft, borderRadius: 20, padding: 3 }}>
            <button className="tt-btn" onClick={() => setCompareMode("previous")} style={{
              borderRadius: 17, padding: "8px 14px", fontSize: 12.5, fontWeight: 600,
              background: compareMode === "previous" ? T.card : "transparent", color: compareMode === "previous" ? T.ink : T.inkSoft,
            }}>Previous result</button>
            <button className="tt-btn" onClick={() => setCompareMode("normal")} style={{
              borderRadius: 17, padding: "8px 14px", fontSize: 12.5, fontWeight: 600,
              background: compareMode === "normal" ? T.card : "transparent", color: compareMode === "normal" ? T.ink : T.inkSoft,
            }}>Normal</button>
          </div>
        </div>
      </div>
      <div className="tt-table-wrap" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12, tableLayout: "fixed", minWidth: 0, width: "100%" }}>
          <thead>
            <tr style={{ background: T.paper, textAlign: "left" }}>
              <SortableTh label="Type" sortKeyName="type" width={typeColWidth} sticky sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Recent" sortKeyName="recent" width={numColWidth} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label={comparisonLabel} sortKeyName="comparison" width={numColWidth} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Δ" sortKeyName="changeActual" width={numColWidth} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Δ%" sortKeyName="changePct" width={numColWidth} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {displayRows.map(r => {
              const { type, recent, previous, meta, changePct, normalPct, movingCloser, rowFlagged } = r;
              const comparisonPoint = compareMode === "previous" ? previous : (meta ? { value: meta.normal } : null);
              const comparisonPct = compareMode === "previous" ? changePct : normalPct;
              const movementColor = movingCloser === true ? T.ok : movingCloser === false ? T.breach : T.ink;
              const rowBg = rowFlagged ? T.warnBg : T.card;
              // Border and background go on each cell, not the <tr> — with
              // border-collapse:separate (needed for sticky headers to work
              // reliably on Safari), a <tr> border/background isn't
              // guaranteed to paint the same way in every browser.
              const cellBase = { borderTop: `1px solid ${T.lineSoft}`, background: rowBg };
              const numStyle = { ...tdStyle, ...cellBase, fontFamily: T.mono, textAlign: "center", whiteSpace: "nowrap", padding: "9px 6px", width: numColWidth, minWidth: numColWidth, maxWidth: numColWidth, cursor: "pointer" };

              return (
                <tr key={type} onClick={() => setModalChartType(type)} title="Click to view chart" style={{ cursor: "pointer" }}>
                  <td
                    style={{
                      ...tdStyle, ...cellBase, fontWeight: rowFlagged ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      width: typeColWidth, minWidth: typeColWidth, maxWidth: typeColWidth, cursor: "pointer",
                      position: "sticky", left: 0, zIndex: 2,
                    }}
                  >
                    {BLOOD_SHORT_NAMES[type] || type}
                  </td>
                  <td style={numStyle}>{recent.value}</td>
                  <td style={numStyle}>{comparisonPoint ? comparisonPoint.value : "—"}</td>
                  <td style={{ ...numStyle, color: movementColor, fontWeight: rowFlagged ? 700 : 400 }}>
                    {comparisonPoint ? fmtActual(recent.value - comparisonPoint.value) : "—"}
                  </td>
                  <td style={{ ...numStyle, color: movementColor, fontWeight: rowFlagged ? 700 : 400 }}>
                    {comparisonPoint ? fmtPct(comparisonPct) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filterType && <BloodsInlineChart bloodsEntries={bloodsEntries} type={filterType} />}
      {modalChartType && <BloodsChartModal bloodsEntries={bloodsEntries} type={modalChartType} onClose={() => setModalChartType(null)} />}
    </div>
  );
}

function BloodsTrendChartBody({ bloodsEntries, type }) {
  const chartData = useMemo(() => {
    return bloodsEntries
      .filter(e => e.description === type && e.date && !isNaN(parseFloat(e.score)))
      .map(e => ({ date: e.date, [type]: parseFloat(e.score) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [bloodsEntries, type]);
  const meta = BLOOD_NORMALS[type];

  if (chartData.length === 0) {
    return <div style={{ padding: "20px 0", textAlign: "center", color: T.inkSoft, fontSize: 13 }}>No results recorded yet for {type}.</div>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.inkSoft }} tickFormatter={fmtDate} />
          <YAxis tick={{ fontSize: 11, fill: T.inkSoft }} />
          <Tooltip labelFormatter={fmtDate} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {meta && (
            <ReferenceLine
              y={meta.normal} stroke={T.inkSoft} strokeDasharray="5 4"
              label={{ value: "Typical normal", position: "insideTopRight", fill: T.inkSoft, fontSize: 11 }}
            />
          )}
          <Line type="monotone" dataKey={type} stroke={LINE_COLORS[0]} connectNulls dot={{ r: 3 }} strokeWidth={2} name={type} />
        </LineChart>
      </ResponsiveContainer>
      {meta && (
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10 }}>
          Dashed line shows a typical normal reference value for {type} ({meta.range}). Reference ranges vary by
          lab, age and sex — always check the range printed on the actual lab report.
        </div>
      )}
    </>
  );
}

// Shown below the table when a type is chosen via the dropdown (which also
// filters the table down to that one row).
function BloodsInlineChart({ bloodsEntries, type }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accentDeep, display: "flex", alignItems: "center", gap: 6 }}>
        <TrendingUp size={15} /> Trend — {type}
      </div>
      <BloodsTrendChartBody bloodsEntries={bloodsEntries} type={type} />
    </div>
  );
}

// Shown as a popup when a type is clicked directly in the table — the table
// itself (and the dropdown) stay exactly as they were.
function BloodsChartModal({ bloodsEntries, type, onClose }) {
  return (
    <ModalShell title={`Trend — ${type}`} onClose={onClose} width={520}>
      <BloodsTrendChartBody bloodsEntries={bloodsEntries} type={type} />
    </ModalShell>
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

  const sorted = useMemo(() => entries.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const knownDescriptions = useMemo(() => Array.from(new Set(entries.map(e => e.description).filter(Boolean))), [entries]);

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

// ================= MEASUREMENTS TAB =================
function MeasurementsTab({ measurementsEntries, setMeasurementsEntries, canEdit = true }) {
  const [sub, setSub] = useState("summarytable");

  function addEntry(entry) {
    setMeasurementsEntries(prev => [...prev, { id: uid(), ...entry }]);
    notifyHousehold({ title: "🩻 New measurement added", body: `${entry.description}: ${entry.score}${entry.unit ? ` ${entry.unit}` : ""}`, category: "result_added" });
  }
  function deleteEntry(id) { setMeasurementsEntries(prev => prev.filter(e => e.id !== id)); }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="tt-btn" onClick={() => setSub("summarytable")} style={{
          background: sub === "summarytable" ? T.navy : T.card, color: sub === "summarytable" ? "#fff" : T.ink,
          border: `1px solid ${sub === "summarytable" ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px",
          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        }}>
          <List size={13} /> Summary
        </button>
        <button className="tt-btn" onClick={() => setSub("entry")} style={{
          background: sub === "entry" ? T.navy : T.card, color: sub === "entry" ? "#fff" : T.ink,
          border: `1px solid ${sub === "entry" ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px",
          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        }}>
          {canEdit ? <><Plus size={13} /> Add Measurement</> : "History"}
        </button>
      </div>

      {sub === "summarytable" && <MeasurementsSummaryTable entries={measurementsEntries} />}
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

  const sorted = useMemo(() => entries.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date)), [entries]);

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

function MeasurementsPointDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3.5} fill={LINE_COLORS[0]} stroke={T.card} strokeWidth={1} />
      <text x={cx} y={cy - 9} textAnchor="middle" fontSize={9.5} fill={T.inkSoft}>{payload.type}</text>
    </g>
  );
}

function MeasurementsSummaryTable({ entries }) {
  const grouped = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      if (!e.description || !e.date) return; // skip malformed/legacy entries rather than crash on them
      const v = parseFloat(e.score);
      if (isNaN(v)) return;
      if (!map[e.description]) map[e.description] = [];
      map[e.description].push({ date: e.date, value: v, unit: e.unit || "mm" });
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [entries]);

  const types = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      const ia = SCAN_TYPES.indexOf(a), ib = SCAN_TYPES.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [grouped]);

  const [filterType, setFilterType] = useState("");
  const [sortKey, setSortKey] = useState("type");
  const [sortDir, setSortDir] = useState("asc");

  function pctChange(newV, oldV) {
    if (!oldV) return null;
    return ((newV - oldV) / Math.abs(oldV)) * 100;
  }
  // Accounting-style formatting: negatives in brackets, positives shown plain
  // (no + sign needed — the green colour already signals a positive move).
  function fmtActual(diff) {
    return diff < 0 ? `(${Math.abs(diff).toFixed(1)})` : diff.toFixed(1);
  }
  function fmtPct(pct) {
    // pctChange() returns null when the previous value was exactly 0 (a %
    // change from zero is mathematically undefined).
    if (pct === null || pct === undefined || !isFinite(pct)) return "—";
    return pct < 0 ? `(${Math.abs(pct).toFixed(0)}%)` : `${pct.toFixed(0)}%`;
  }

  const rowData = useMemo(() => types.map(type => {
    const rows = grouped[type];
    const recent = rows[rows.length - 1];
    const previous = rows.length > 1 ? rows[rows.length - 2] : null;
    const changePct = previous ? pctChange(recent.value, previous.value) : null;
    const unit = recent.unit;
    return { type, unit, recent, previous, changePct };
  }), [types, grouped]);

  // "Type" gets a width that fits the longest label here; every other column
  // is a single short number, so they can all share one narrow width —
  // keeping as much of the table on-screen at once as possible on a phone.
  const typeColWidth = useMemo(() => {
    let chars = 4;
    rowData.forEach(r => {
      const label = `${r.type}${r.unit ? ` (${r.unit})` : ""}`;
      chars = Math.max(chars, label.length);
    });
    return `${chars + 2}ch`;
  }, [rowData]);
  const numColWidth = "52px";

  function getSortValue(r, key) {
    if (key === "type") return r.type;
    if (key === "previous") return r.previous ? r.previous.value : null;
    if (key === "recent") return r.recent.value;
    if (key === "changeActual") return r.previous ? r.recent.value - r.previous.value : null;
    if (key === "changePct") return r.changePct;
    return null;
  }

  const displayRows = useMemo(() => {
    const filtered = filterType ? rowData.filter(r => r.type === filterType) : rowData;
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey), bv = getSortValue(b, sortKey);
      if (sortKey === "type") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      const aMissing = av === null || av === undefined;
      const bMissing = bv === null || bv === undefined;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rowData, filterType, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  // The combined chart always shows every measurement, regardless of the
  // table's filter — one continuous line ordered by date, each point
  // labelled with its scan type.
  const combinedChartData = useMemo(() => {
    return entries
      .filter(e => e.date && !isNaN(parseFloat(e.score)))
      .map(e => ({ date: e.date, value: parseFloat(e.score), type: e.description }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  if (types.length === 0) {
    return <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>No measurements recorded yet — add some from the Add Measurement tab above.</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 14, maxWidth: 260 }}>
        <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Filter by type</div>
        <select className="tt-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="tt-table-wrap" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, marginBottom: 20 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12, tableLayout: "fixed", minWidth: 0, width: "100%" }}>
          <thead>
            <tr style={{ background: T.paper, textAlign: "left" }}>
              <SortableTh label="Type" sortKeyName="type" width={typeColWidth} sticky sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Prev." sortKeyName="previous" width={numColWidth} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Recent" sortKeyName="recent" width={numColWidth} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Δ" sortKeyName="changeActual" width={numColWidth} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Δ%" sortKeyName="changePct" width={numColWidth} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {displayRows.map(r => {
              const { type, unit, recent, previous } = r;
              const cellBase = { borderTop: `1px solid ${T.lineSoft}` };
              const numStyle = { ...tdStyle, ...cellBase, fontFamily: T.mono, textAlign: "center", whiteSpace: "nowrap", padding: "9px 6px", width: numColWidth, minWidth: numColWidth, maxWidth: numColWidth };
              return (
                <tr key={type}>
                  <td style={{
                    ...tdStyle, ...cellBase, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    width: typeColWidth, minWidth: typeColWidth, maxWidth: typeColWidth,
                    position: "sticky", left: 0, background: T.card, zIndex: 2,
                  }}>
                    {type}{unit && <span style={{ color: T.inkSoft, fontWeight: 400 }}> ({unit})</span>}
                  </td>
                  <td style={numStyle}>{previous ? previous.value : "—"}</td>
                  <td style={numStyle}>{recent.value}</td>
                  <td style={numStyle}>{previous ? fmtActual(recent.value - previous.value) : "—"}</td>
                  <td style={numStyle}>{previous ? fmtPct(r.changePct) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accentDeep, display: "flex", alignItems: "center", gap: 6 }}>
          <TrendingUp size={15} /> Trend over time — all scan types
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={combinedChartData} margin={{ top: 24, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.inkSoft }} tickFormatter={fmtDate} />
            <YAxis tick={{ fontSize: 11, fill: T.inkSoft }} />
            <Tooltip labelFormatter={fmtDate} formatter={(value, _name, item) => [value, item.payload.type]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
            <Line type="monotone" dataKey="value" stroke={LINE_COLORS[0]} connectNulls strokeWidth={2} dot={<MeasurementsPointDot />} name="Measurement" />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10 }}>
          Every measurement is plotted on one line in date order, labelled with its scan type — helpful for
          seeing the overall trend even when different types of scan are used at different points.
        </div>
      </div>
    </div>
  );
}

function buildThStyle() { return { padding: "9px 14px", fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.3 }; }
function buildTdStyle() { return { padding: "9px 14px", color: T.ink }; }
const thStyle = buildThStyle();
const tdStyle = buildTdStyle();

// Now that every theme-derived style object has been declared, apply
// whatever was saved before the very first render, so there's no light-mode
// flash for someone who has dark mode saved (index.html also does a quicker,
// cruder version of this before React even loads, to avoid a flash at the
// HTML/CSS level too).
applyThemeMode(getStoredThemeMode());

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
    Object.values(m).forEach(arr => arr.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")));
    return m;
  }, [appointments]);

  async function addAppointment(a) {
    const id = uid();
    setAppointments(prev => [...prev, { id, history: [], summary: [], ...a }]);
    setFormOpen(false);
    notifyHousehold({ title: "📅 New appointment added", body: `${a.name || a.role || "Appointment"} on ${fmtDate(a.date)}`, category: "appointment_added" });
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
      title={`${a.name || ""}${a.time ? ` at ${a.time}` : ""} — ${a.role || ""}`}
      style={{ background: rs.bg, borderLeft: `3px solid ${rs.border}`, color: rs.text, borderRadius: 6, padding: "4px 6px", fontSize: 10.5, lineHeight: 1.3, cursor: "grab", display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.time ? `${a.time} · ` : ""}{apptTitle(a)}</div>
      {a.name && a.name.trim() && <span style={{ alignSelf: "flex-start", opacity: 0.85, fontSize: 9.5, fontWeight: 700 }}>{a.role || "Other"}</span>}
    </div>
  );
}

function AppointmentNotesSummary({ appointments, onUpdate, onRowClick }) {
  const sorted = useMemo(() => appointments.filter(a => a.date).sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || "")), [appointments]);
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
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: T.mono }}>{fmtDate(a.date)}{a.time ? ` · ${a.time}` : ""}</div>
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
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Consultant");
  const [notes, setNotes] = useState("");

  return (
    <ModalShell title="Add appointment" onClose={onClose}>
      <div className="tt-2col">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Time (optional)"><input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} /></Field>
      </div>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dr Sarah Chen" style={inputStyle} /></Field>
      <Field label="Job role">
        <select className="tt-select" value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
          {APPT_ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Notes from appointment (optional)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} /></Field>
      <button className="tt-btn" onClick={() => onSave({ date, time, name, role, notes })}
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
  const [time, setTime] = useState(a.time || "");
  const [summarising, setSummarising] = useState(false);

  async function handleSave() {
    if (notes.trim() && notes !== a.notes) {
      setSummarising(true);
      const bullets = await summariseNotes(notes);
      setSummarising(false);
      onSave({ name, role, notes, date, time, summary: bullets });
    } else {
      onSave({ name, role, notes, date, time });
    }
  }

  return (
    <ModalShell title={`${apptTitle(a)} — ${fmtDate(a.date)}`} onClose={onClose}>
      <div className="tt-2col">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
        <Field label="Time (optional)"><input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
      </div>
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
  const [sub, setSub] = useState("received");
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
      setSub("received");
    } finally {
      setSaving(false);
    }
  }
  function deleteMessage(id) {
    onDelete(id);
    setExpandedId(prev => (prev === id ? null : prev));
  }

  const sorted = useMemo(() => messages.filter(m => m.date).sort((a, b) => b.date.localeCompare(a.date)), [messages]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="tt-btn" onClick={() => setSub("received")} style={{
          background: sub === "received" ? T.navy : T.card, color: sub === "received" ? "#fff" : T.ink,
          border: `1px solid ${sub === "received" ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px",
          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        }}>
          <Heart size={13} fill={sub === "received" ? "#fff" : "#C9857E"} color={sub === "received" ? "#fff" : "#C9857E"} />
          Messages Received{sorted.length > 0 ? ` (${sorted.length})` : ""}
        </button>
        <button className="tt-btn" onClick={() => setSub("add")} style={{
          background: sub === "add" ? T.navy : T.card, color: sub === "add" ? "#fff" : T.ink,
          border: `1px solid ${sub === "add" ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px",
          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        }}>
          <Plus size={13} /> Add Message
        </button>
      </div>

      {sub === "add" && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
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
      )}

      {sub === "received" && (
        sorted.length === 0 ? (
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
            No messages yet — tap "Add Message" to add the first one.
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
        )
      )}
    </div>
  );
}

// ================= GUIDANCE TAB =================
function GuidanceSection({ title, children }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.accentDeep, marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}
function RoleRow({ name, accentColor, children }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
      <span style={{
        flexShrink: 0, background: `${accentColor}1A`, color: accentColor, border: `1px solid ${accentColor}`,
        borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 700, height: "fit-content", whiteSpace: "nowrap",
      }}>{name}</span>
      <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function GuidanceTab() {
  return (
    <div>
      <GuidanceSection title="How this app works">
        This app is a shared record of a cancer treatment journey. Whoever creates it (the <strong>owner</strong>) adds
        the treatment plan, appointments, and results, and can invite others to join — either with full editing
        rights, or as a viewer who can look but not touch (aside from adding a message of support). Everyone sees
        the same live data, updated instantly as changes are made.
      </GuidanceSection>

      <GuidanceSection title="User roles">
        <RoleRow name="Owner" accentColor={T.accentDeep}>
          Full access to everything, and the only one who manages invites and the household itself. The original
          creator — can't be removed.
        </RoleRow>
        <RoleRow name="Admin" accentColor={T.info}>
          The same as the owner, including managing invites and the household — just not the original creator.
        </RoleRow>
        <RoleRow name="Editor" accentColor={T.accent}>
          Can add, edit, and delete treatments, appointments, blood results, measurements, and patient details —
          same data access as the owner — but can't manage invites or the household.
        </RoleRow>
        <RoleRow name="Viewer" accentColor={T.inkSoft}>
          Can see everything and add messages of support, but can't change any treatment, appointment, or result data.
        </RoleRow>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>
          An owner or admin can invite someone at any of these levels from <strong>Settings → Household &amp; invites</strong>{" "}
          — choose an access level, create a link, and send it however you like.
        </div>
      </GuidanceSection>

      <GuidanceSection title="Adding data, tab by tab (Owner, Admin &amp; Editor)">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>Treatment Calendar</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Make sure you're on the Calendar view (toggle at the top).</li>
              <li>Tap the date you want, or tap "Add treatment".</li>
              <li>Choose the type (Chemotherapy, Immunotherapy, Surgery, or Radiotherapy), and fill in a time (optional), drug(s), dose, cycle and day as needed.</li>
              <li>Save — it'll appear as a chip on that date.</li>
            </ol>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>
              To reschedule, drag a chip onto a new date — it's marked "Delayed" automatically. Tap a chip to update
              its status (Scheduled/Completed/Skipped/Delayed) or edit its details. Switch to Summary view for a
              plain list of everything, past and future.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>Appointments</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>On the Calendar view, tap the date of the appointment, or tap "Add appointment".</li>
              <li>Enter who it's with, their role (Consultant, Registrar, Surgeon, or Other), and a time if you have one.</li>
              <li>Add any notes from the appointment — these get automatically condensed into a few key bullet points.</li>
              <li>Save — it'll appear as a chip on that date, same as the Treatment Calendar.</li>
            </ol>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>
              Drag a chip to reschedule it. Switch to Summary view to read through past notes.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>Bloods</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Choose the Haematology or Biochemistry tab (or "Other" if it doesn't fit either).</li>
              <li>Pick the specific element you have a result for (e.g. Haemoglobin, Sodium).</li>
              <li>Enter the date and the result — the correct unit fills in automatically.</li>
              <li>Save — it's added to that element's history.</li>
            </ol>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>
              The Summary tab shows the two most recent results for each element, using short lab-style names
              (e.g. Hb, ALT) to keep it compact. Use "Compare to" to switch between comparing the most recent
              result with the previous one or with the typical normal value — the change is split into the actual
              amount and the percentage, and anything moving by more than 20% away from normal is highlighted. Tap
              a column heading to sort by it. Tap anywhere on a row to pop open its trend chart; pick a type from the
              dropdown instead to filter the table down to just that row, with its chart shown underneath.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>Measurements</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Go to the "Add Measurement" tab.</li>
              <li>Enter the date, the scan type (MRI, CT, Mammogram, or Ultrasound), and the value.</li>
              <li>Save — it's added to that scan type's history.</li>
            </ol>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>
              The Summary tab lays out the two most recent measurements for each scan type, with the change
              between them split into the actual amount and the percentage. Tap a column heading to sort by it,
              or use the dropdown to filter the table to one type. A chart underneath always shows every
              measurement plotted on a single line in date order, each point labelled with its scan type.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>Prescriptions</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Tap "Add prescription".</li>
              <li>Enter the medication name, and optionally link it to a specific treatment from the calendar (e.g. "the first chemo in Cycle 3") — this sets a sensible starting date automatically, which you can still adjust.</li>
              <li>Choose a fixed course (a set number of doses, e.g. 5× Filgrastim) or a tapering course (e.g. a steroid reducing from 12mg to 10mg to 8mg over several stages), and fill in the details.</li>
              <li>Optionally set a time to take it — anyone with reminders turned on gets a notification around that time on each day a dose is due.</li>
              <li>Save — the day-by-day schedule is worked out automatically.</li>
            </ol>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>
              Tap a prescription to expand it and see the full schedule. This is a planning aid — always follow the
              dose and timing given by your care team.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>Nutrition</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              Pick a blood measurement from the dropdown to see nutrients commonly associated with it, and foods
              they're found in. This is general reference information, not personalised dietary advice — see the
              note at the top of that tab.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>Side Effects</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              Shows common side effects specific to whatever's actually been typed into Treatment Calendar's
              drug(s) field and Prescriptions — recognised drugs get their own card; anything not recognised falls
              back to a general list for that treatment type. General reference information, not medical advice —
              see the note at the top of that tab, and always ask your care team what to expect.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>Insights</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              Tap "Find patterns" to scan the treatments, prescriptions, and blood results already logged
              elsewhere in the app for anything that recurs — e.g. a blood measurement that consistently moves in
              the days after a particular drug. It needs at least two occurrences of the same trigger to show
              anything at all. These are statistical patterns in your own small dataset, not a diagnosis or proof
              that one thing causes another — always mention anything notable to your care team. An optional "Ask
              AI to explain" button turns the raw findings into a plain-English summary if an AI key has been set
              up (see the README) — without one, the findings are still shown, just without that extra narrative.
            </div>
          </div>

          <div>
            <strong>Support Messages</strong> has two tabs: "Messages Received" to read through what's been sent,
            and "Add Message" to write one. Anyone, including viewers, can add a message. Only an owner, admin, or
            editor can delete one.
          </div>
          <div>
            <strong>Settings</strong> is now organised into sub-tabs:
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              <li style={{ marginBottom: 4 }}><strong>Patient Data</strong> — name, date of birth, address, height, weight, and the oncology helpline number, shown throughout the app.</li>
              <li style={{ marginBottom: 4 }}><strong>Appearance</strong> — switch between light and dark mode. Saved per device, not per person, so everyone chooses their own.</li>
              <li style={{ marginBottom: 4 }}><strong>Household &amp; Invites</strong> — owner/admin only: create and manage invite links, see who's joined.</li>
              <li style={{ marginBottom: 4 }}><strong>Notifications</strong> — turn on notifications for this device, then choose which categories you want: treatment completed, new treatments, new appointments, new results, messages of support, and reminders — each on by default, each switchable independently.</li>
              <li><strong>Backup &amp; Sharing</strong> — owner/admin only: export an encrypted backup, or import one to restore.</li>
            </ul>
          </div>
        </div>
      </GuidanceSection>

      <GuidanceSection title="Importing and exporting data">
        Owners and admins will find this under <strong>Settings → Backup, export &amp; sharing</strong>:
        <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Export</strong> bundles everything (treatments, appointments, results, patient details) into a
            single file, encrypted with a passphrase you choose. Useful as an offline backup, or to hand someone a
            fresh copy of the data. The file is safe to send by email or messaging apps — without the passphrase,
            it's unreadable. Send the passphrase a different way (e.g. a text message, not the same email).
          </li>
          <li>
            <strong>Import</strong> decrypts a backup file and loads it in, replacing what's currently there for
            everyone. Messages of support are the exception — they're added alongside existing ones rather than
            replacing them.
          </li>
        </ul>
      </GuidanceSection>
    </div>
  );
}

// ================= PRESCRIPTIONS TAB =================
function PrescriptionsTab({ prescriptions, setPrescriptions, treatments, canEdit }) {
  const [formOpen, setFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  function addRx(rx) {
    setPrescriptions(prev => [...prev, { id: uid(), ...rx }]);
    setFormOpen(false);
  }
  function deleteRx(id) {
    setPrescriptions(prev => prev.filter(r => r.id !== id));
    setExpandedId(prev => (prev === id ? null : prev));
  }

  const sortedTreatments = useMemo(() => treatments.filter(t => t.date).sort((a, b) => a.date.localeCompare(b.date)), [treatments]);
  const sorted = useMemo(() => [...prescriptions].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || "")), [prescriptions]);

  return (
    <div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 14, lineHeight: 1.5 }}>
        This is a planning aid, not a substitute for the instructions given by your care team — always follow
        their guidance on dose and timing.
      </div>

      {canEdit && (
        <button className="tt-btn" onClick={() => setFormOpen(true)} style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <Plus size={15} /> Add prescription
        </button>
      )}

      {sorted.length === 0 ? (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
          No prescriptions added yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(rx => {
            const expanded = expandedId === rx.id;
            const schedule = generateRxSchedule(rx);
            const linked = rx.linkedTreatmentId ? treatments.find(t => t.id === rx.linkedTreatmentId) : null;
            return (
              <div key={rx.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
                <div onClick={() => setExpandedId(prev => (prev === rx.id ? null : rx.id))} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Pill size={14} style={{ color: T.accent, flexShrink: 0 }} />
                      <strong style={{ fontSize: 13.5, color: T.ink }}>{rx.name}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>{rxSummaryLine(rx)}</div>
                    {linked && (
                      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 4 }}>
                        Linked to: {linked.type === "Other" ? linked.typeCustom : linked.type}
                        {linked.cycle ? ` · Cycle ${linked.cycle}` : ""}{linked.day ? ` Day ${linked.day}` : ""} · {fmtDate(linked.date)}
                      </div>
                    )}
                  </div>
                  {expanded ? <ChevronUp size={16} color={T.inkSoft} style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color={T.inkSoft} style={{ flexShrink: 0 }} />}
                </div>
                {expanded && (
                  <div style={{ padding: "0 14px 14px" }}>
                    {rx.notes && <div style={{ fontSize: 12.5, color: T.ink, marginBottom: 10, whiteSpace: "pre-wrap" }}>{rx.notes}</div>}
                    <div className="tt-table-wrap" style={{ border: `1px solid ${T.lineSoft}`, borderRadius: 8 }}>
                      <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
                        <thead><tr style={{ background: T.paper, textAlign: "left" }}><th style={thStyle}>Date</th><th style={thStyle}>Dose</th></tr></thead>
                        <tbody>
                          {schedule.map((s, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                              <td style={{ ...tdStyle, fontFamily: T.mono }}>{fmtDate(s.date)}</td>
                              <td style={tdStyle}>{s.label}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {canEdit && (
                      <button className="tt-btn" onClick={() => deleteRx(rx.id)} style={{ marginTop: 10, background: "transparent", color: T.breach, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, padding: "4px 0" }}>
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

      {formOpen && canEdit && (
        <AddPrescriptionModal treatments={sortedTreatments} onClose={() => setFormOpen(false)} onSave={addRx} />
      )}
    </div>
  );
}

function AddPrescriptionModal({ treatments, onClose, onSave }) {
  const [name, setName] = useState("");
  const [linkedTreatmentId, setLinkedTreatmentId] = useState("");
  const [courseType, setCourseType] = useState("fixed");
  const [startDate, setStartDate] = useState(todayStr());
  const [doseCount, setDoseCount] = useState("5");
  const [frequency, setFrequency] = useState("Once daily");
  const [stages, setStages] = useState([{ dose: "12", unit: "mg", days: "5" }]);
  const [reminderTime, setReminderTime] = useState("");
  const [notes, setNotes] = useState("");

  function handleLinkChange(id) {
    setLinkedTreatmentId(id);
    const t = treatments.find(tr => tr.id === id);
    if (t) setStartDate(addDaysToDate(t.date, 1));
  }
  function addStage() { setStages(prev => [...prev, { dose: "", unit: "mg", days: "" }]); }
  function updateStage(i, field, val) { setStages(prev => prev.map((s, idx) => (idx === i ? { ...s, [field]: val } : s))); }
  function removeStage(i) { setStages(prev => prev.filter((_, idx) => idx !== i)); }

  function handleSave() {
    if (!name.trim()) return;
    const rx = { name: name.trim(), linkedTreatmentId: linkedTreatmentId || null, courseType, startDate, notes, reminderTime: reminderTime || null };
    if (courseType === "fixed") {
      rx.doseCount = parseInt(doseCount, 10) || 0;
      rx.frequency = frequency;
    } else {
      rx.stages = stages
        .map(s => ({ dose: parseFloat(s.dose) || 0, unit: s.unit || "mg", days: parseInt(s.days, 10) || 0 }))
        .filter(s => s.days > 0);
    }
    onSave(rx);
  }

  return (
    <ModalShell title="Add prescription" onClose={onClose}>
      <Field label="Medication name">
        <input list="rxSuggestions" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Filgrastim" style={inputStyle} />
        <datalist id="rxSuggestions">{PRESCRIPTION_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label="Link to a treatment (optional)">
        <select className="tt-select" value={linkedTreatmentId} onChange={e => handleLinkChange(e.target.value)} style={inputStyle}>
          <option value="">None</option>
          {treatments.map(t => (
            <option key={t.id} value={t.id}>
              {(t.type === "Other" ? t.typeCustom : t.type) || "Treatment"}{t.cycle ? ` · Cycle ${t.cycle}` : ""}{t.day ? ` Day ${t.day}` : ""} · {fmtDate(t.date)}
            </option>
          ))}
        </select>
      </Field>

      <div className="tt-2col">
        <button className="tt-btn" onClick={() => setCourseType("fixed")} style={{
          background: courseType === "fixed" ? T.accentSoft : T.card, color: courseType === "fixed" ? T.accentDeep : T.inkSoft,
          border: `1px solid ${courseType === "fixed" ? T.accent : T.line}`, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600,
        }}>Fixed course</button>
        <button className="tt-btn" onClick={() => setCourseType("taper")} style={{
          background: courseType === "taper" ? T.accentSoft : T.card, color: courseType === "taper" ? T.accentDeep : T.inkSoft,
          border: `1px solid ${courseType === "taper" ? T.accent : T.line}`, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600,
        }}>Tapering course</button>
      </div>

      <Field label="Start date"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} /></Field>
      <Field label="Time to take (optional)">
        <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} style={inputStyle} />
      </Field>
      {reminderTime && (
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: -8, marginBottom: 14 }}>
          A reminder will be sent around this time on each day a dose is due, to anyone with reminders turned on
          in Settings → Notifications.
        </div>
      )}

      {courseType === "fixed" ? (
        <div className="tt-2col">
          <Field label="Number of doses"><input type="number" min="1" value={doseCount} onChange={e => setDoseCount(e.target.value)} style={inputStyle} /></Field>
          <Field label="Frequency">
            <select className="tt-select" value={frequency} onChange={e => setFrequency(e.target.value)} style={inputStyle}>
              <option>Once daily</option>
              <option>Twice daily</option>
            </select>
          </Field>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>Stages</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px auto", gap: 6, marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: T.inkSoft }}>Dose</div>
            <div style={{ fontSize: 10, color: T.inkSoft }}>Unit</div>
            <div style={{ fontSize: 10, color: T.inkSoft }}>Days</div>
            <div />
          </div>
          {stages.map((s, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input value={s.dose} onChange={e => updateStage(i, "dose", e.target.value)} placeholder="12" style={inputStyle} />
              <input value={s.unit} onChange={e => updateStage(i, "unit", e.target.value)} placeholder="mg" style={inputStyle} />
              <input value={s.days} onChange={e => updateStage(i, "days", e.target.value)} placeholder="5" style={inputStyle} />
              {stages.length > 1 && (
                <button className="tt-btn" onClick={() => removeStage(i)} style={{ background: "transparent", color: T.breach, padding: 4 }}><X size={14} /></button>
              )}
            </div>
          ))}
          <button className="tt-btn" onClick={addStage} style={{ background: "transparent", color: T.accent, border: `1px dashed ${T.line}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <Plus size={12} /> Add stage
          </button>
        </div>
      )}

      <Field label="Notes (optional)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></Field>

      <button className="tt-btn" onClick={handleSave} style={{ width: "100%", background: T.accent, color: "#fff", padding: "11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
        Save prescription
      </button>
    </ModalShell>
  );
}

// ================= SIDE EFFECTS TAB =================
function SideEffectsTab({ treatments, prescriptions, helpline }) {
  const groups = useMemo(() => buildSideEffectGroups(treatments, prescriptions), [treatments, prescriptions]);

  return (
    <div>
      <div style={{ background: T.warnBg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 12, color: T.warnText, lineHeight: 1.55 }}>
        <strong>General reference information only, not medical advice.</strong> Not everyone experiences every
        side effect, this list may not be complete, and some effects can appear well after a treatment finishes.
        Always ask your care team what to expect for your specific treatment. If you feel unwell, develop a
        fever, or notice anything that worries you,{" "}
        {helpline ? (
          <>call your oncology helpline straight away — don't wait:{" "}
            <a href={telHref(helpline)} style={{ color: T.warnText, fontWeight: 700, textDecoration: "underline" }}>{helpline}</a>.
          </>
        ) : (
          <>contact your oncology team's 24-hour helpline straight away — don't wait. (Add the number under
            Settings → Patient Data to show it here directly.)</>
        )}
      </div>

      {groups.length === 0 ? (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
          Add a treatment or prescription to see relevant side effect information here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={15} style={{ color: T.warn, flexShrink: 0 }} />
                <strong style={{ fontSize: 13.5, color: T.ink }}>{g.source}</strong>
                <span style={{ fontSize: 11, color: T.inkSoft }}>({g.sourceNote})</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                {g.effects.map((e, j) => <li key={j} style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>{e}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================= NUTRITION TAB =================
function NutritionTab() {
  const [selected, setSelected] = useState("");
  const info = selected ? NUTRITION_INFO[selected] : null;

  return (
    <div>
      <div style={{ background: T.warnBg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 12, color: T.warnText, lineHeight: 1.5 }}>
        <strong>General information only, not medical or dietary advice.</strong> Always check with your oncology
        team or a dietitian before changing your diet during treatment — some foods need extra care (e.g. a
        neutropenic diet), and some vitamins or supplements can interact with your medication.
      </div>

      <div style={{ marginBottom: 18, maxWidth: 320 }}>
        <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>Select a blood measurement</div>
        <select className="tt-select" value={selected} onChange={e => setSelected(e.target.value)} style={inputStyle}>
          <option value="">Choose a measurement…</option>
          <optgroup label="Haematology">
            {HAEMATOLOGY_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </optgroup>
          <optgroup label="Biochemistry">
            {BIOCHEMISTRY_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </optgroup>
        </select>
      </div>

      {info && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.accentDeep, marginBottom: 10 }}>{selected}</div>
          {info.note && (
            <div style={{ fontSize: 12.5, color: T.ink, background: T.paper, borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.5 }}>
              {info.note}
            </div>
          )}
          {info.nutrients.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {info.nutrients.map((n, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{n.name}</div>
                  <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>Commonly found in: {n.foods}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================= INSIGHTS TAB =================
// A client-side statistical scan of the data already logged elsewhere in the
// app — looking for a blood measurement that consistently moves in the same
// direction in the days after a particular treatment drug or prescription.
// Deliberately conservative: needs at least two occurrences of the same
// trigger, with a consistent direction, before it surfaces anything at all.
// This describes correlations in a small personal dataset — it never implies
// causation, never suggests a treatment change, and isn't a diagnosis.
const INSIGHTS_WINDOW_DAYS = 14;
const INSIGHTS_MIN_PCT = 15;

function findLocalPatterns(treatments, prescriptions, bloodEntries) {
  const triggers = [];
  treatments.forEach(t => {
    if (t.status === "Skipped" || !t.date) return;
    const drugNames = (t.drugs || "").split(",").map(s => s.trim()).filter(Boolean);
    if (drugNames.length === 0) {
      triggers.push({ label: t.type === "Other" ? (t.typeCustom || "Other treatment") : t.type, date: t.date });
    } else {
      drugNames.forEach(d => triggers.push({ label: d, date: t.date }));
    }
  });
  (prescriptions || []).forEach(rx => {
    if (rx.name && rx.startDate) triggers.push({ label: rx.name, date: rx.startDate });
  });

  const byLabel = {};
  triggers.forEach(tr => { (byLabel[tr.label] = byLabel[tr.label] || []).push(tr.date); });

  const bloodsByType = {};
  (bloodEntries || []).forEach(e => {
    if (!e.description || !e.date) return;
    const v = parseFloat(e.score);
    if (isNaN(v)) return;
    (bloodsByType[e.description] = bloodsByType[e.description] || []).push({ date: e.date, value: v });
  });
  Object.values(bloodsByType).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));

  const results = [];
  Object.entries(byLabel).forEach(([label, dates]) => {
    if (dates.length < 2) return; // need at least 2 occurrences of the trigger itself
    Object.entries(bloodsByType).forEach(([element, series]) => {
      if (series.length < 3) return; // need some history for this blood element
      const changes = [];
      dates.forEach(triggerDate => {
        const before = [...series].reverse().find(r => r.date <= triggerDate);
        const triggerMs = new Date(triggerDate + "T00:00:00").getTime();
        const after = series.find(r => {
          const diffDays = (new Date(r.date + "T00:00:00").getTime() - triggerMs) / 86400000;
          return diffDays > 0 && diffDays <= INSIGHTS_WINDOW_DAYS;
        });
        if (before && after && before.value !== 0) {
          changes.push(((after.value - before.value) / Math.abs(before.value)) * 100);
        }
      });
      if (changes.length < 2) return;
      const allUp = changes.every(c => c > 5);
      const allDown = changes.every(c => c < -5);
      if (!allUp && !allDown) return;
      const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
      if (Math.abs(avg) < INSIGHTS_MIN_PCT) return;
      results.push({ element, trigger: label, direction: allUp ? "up" : "down", occurrences: changes.length, avgChangePct: avg, avgWindowDays: INSIGHTS_WINDOW_DAYS });
    });
  });

  results.sort((a, b) => b.occurrences - a.occurrences || Math.abs(b.avgChangePct) - Math.abs(a.avgChangePct));
  return results;
}

async function fetchAiPatternSummary(findings) {
  try {
    const res = await fetch("/.netlify/functions/analyse-patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ findings }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.summary || null;
  } catch {
    return null;
  }
}

function InsightsTab({ treatments, prescriptions, bloodsEntries }) {
  const [findings, setFindings] = useState(null); // null = not run yet
  const [scanning, setScanning] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);

  function runScan() {
    setScanning(true);
    setAiSummary("");
    // A tiny delay just so the button feels responsive rather than instant/jumpy.
    setTimeout(() => {
      setFindings(findLocalPatterns(treatments, prescriptions, bloodsEntries));
      setScanning(false);
    }, 150);
  }

  async function handleAiExplain() {
    if (!findings || findings.length === 0) return;
    setLoadingAi(true);
    const summary = await fetchAiPatternSummary(findings);
    setAiSummary(summary || "No AI summary available right now — the findings above still stand on their own.");
    setLoadingAi(false);
  }

  return (
    <div>
      <div style={{ background: T.warnBg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 12, color: T.warnText, lineHeight: 1.55 }}>
        <strong>This looks for statistical patterns in your own logged data — nothing more.</strong> It doesn't
        diagnose anything, doesn't prove one thing causes another, and isn't medical advice. Small numbers of
        instances can easily look like a pattern by chance. Always talk to your care team about anything you
        notice here.
      </div>

      <button className="tt-btn" onClick={runScan} disabled={scanning} style={{
        background: T.accent, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 6, marginBottom: 18,
      }}>
        <Sparkles size={15} /> {scanning ? "Scanning…" : "Find patterns"}
      </button>

      {findings === null && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 24, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
          Tap "Find patterns" to scan your logged treatments, prescriptions, and blood results for anything that
          keeps recurring.
        </div>
      )}

      {findings !== null && findings.length === 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 24, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
          No repeating pattern found yet. This usually needs at least two occurrences of the same treatment drug or
          prescription, with blood results logged both before and within {INSIGHTS_WINDOW_DAYS} days after each one.
          Keep logging and check back.
        </div>
      )}

      {findings !== null && findings.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {findings.map((f, i) => (
              <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink }}>
                  {f.direction === "up"
                    ? <ArrowUp size={15} color={T.warn} style={{ flexShrink: 0 }} />
                    : <ArrowDown size={15} color={T.info} style={{ flexShrink: 0 }} />}
                  <span><strong>{f.element}</strong> tends to go {f.direction} after <strong>{f.trigger}</strong></span>
                </div>
                <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>
                  Seen in {f.occurrences} logged instance{f.occurrences === 1 ? "" : "s"} · average change{" "}
                  {f.avgChangePct >= 0 ? "+" : ""}{f.avgChangePct.toFixed(0)}% within {f.avgWindowDays} days
                  {f.occurrences < 3 ? " · small sample, treat with extra caution" : ""}
                </div>
              </div>
            ))}
          </div>

          <button className="tt-btn" onClick={handleAiExplain} disabled={loadingAi} style={{
            background: T.navy, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Sparkles size={14} /> {loadingAi ? "Thinking…" : "Ask AI to explain these patterns"}
          </button>

          {aiSummary && (
            <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={14} /> AI summary
              </div>
              <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.6 }}>{aiSummary}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ================= SETTINGS TAB =================
function SettingsTab({ patient, setPatient, exportBundle, onImportAll, canEdit, canManageHousehold, householdId, householdName, themeMode, setThemeMode }) {
  const [form, setForm] = useState(patient);
  const [saved, setSaved] = useState(false);
  const [sub, setSub] = useState("patient");
  useEffect(() => setForm(patient), [patient]);

  function set(field, val) { setForm(prev => ({ ...prev, [field]: val })); setSaved(false); }
  function handleSave() { setPatient(form); setSaved(true); setTimeout(() => setSaved(false), 1800); }

  const subTabs = [
    { id: "patient", label: "Patient Data", icon: <User size={13} /> },
    { id: "appearance", label: "Appearance", icon: <Sun size={13} /> },
    { id: "household", label: "Household & Invites", icon: <Layers size={13} /> },
    { id: "notifications", label: "Notifications", icon: <Sparkles size={13} /> },
    { id: "backup", label: "Backup & Sharing", icon: <NotebookText size={13} /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {subTabs.map(t => (
          <button key={t.id} className="tt-btn" onClick={() => setSub(t.id)} style={{
            background: sub === t.id ? T.navy : T.card, color: sub === t.id ? "#fff" : T.ink,
            border: `1px solid ${sub === t.id ? T.navy : T.line}`, borderRadius: 20, padding: "8px 16px",
            fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {sub === "appearance" && (
        <div className="tt-settings-card" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>Appearance</div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 14 }}>
            Dark mode is easier on the eyes at night or for light sensitivity. This is saved on this device only —
            everyone in the household chooses their own.
          </div>
          <div style={{ display: "inline-flex", background: T.lineSoft, borderRadius: 20, padding: 3 }}>
            <button className="tt-btn" onClick={() => setThemeMode("light")} style={{
              display: "flex", alignItems: "center", gap: 6, borderRadius: 17, padding: "7px 16px", fontSize: 12.5, fontWeight: 600,
              background: themeMode === "light" ? T.card : "transparent", color: themeMode === "light" ? T.ink : T.inkSoft,
            }}><Sun size={14} /> Light</button>
            <button className="tt-btn" onClick={() => setThemeMode("dark")} style={{
              display: "flex", alignItems: "center", gap: 6, borderRadius: 17, padding: "7px 16px", fontSize: 12.5, fontWeight: 600,
              background: themeMode === "dark" ? T.card : "transparent", color: themeMode === "dark" ? T.ink : T.inkSoft,
            }}><Moon size={14} /> Dark</button>
          </div>
        </div>
      )}

      {sub === "patient" && (
        <div className="tt-settings-card" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>Patient Data</div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 14 }}>These details personalise the app and are stored only within this tool.</div>
          <div className="tt-2col">
            <Field label="Full name"><input value={form.name} onChange={e => set("name", e.target.value)} disabled={!canEdit} placeholder="e.g. Kate Smith" style={inputStyle} /></Field>
            <Field label="Date of birth"><input type="date" value={form.dob} onChange={e => set("dob", e.target.value)} disabled={!canEdit} style={inputStyle} /></Field>
          </div>
          <Field label="Address"><textarea value={form.address} onChange={e => set("address", e.target.value)} rows={2} disabled={!canEdit} style={{ ...inputStyle, resize: "vertical" }} /></Field>
          <div className="tt-2col">
            <Field label="Height"><input value={form.height} onChange={e => set("height", e.target.value)} disabled={!canEdit} placeholder="e.g. 165 cm" style={inputStyle} /></Field>
            <Field label="Weight"><input value={form.weight} onChange={e => set("weight", e.target.value)} disabled={!canEdit} placeholder="e.g. 62 kg" style={inputStyle} /></Field>
          </div>
          <Field label="Oncology helpline number">
            <input type="tel" value={form.helpline} onChange={e => set("helpline", e.target.value)} disabled={!canEdit} placeholder="e.g. 0800 123 4567" style={inputStyle} />
          </Field>
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: -8, marginBottom: 14 }}>
            Shown as a tap-to-call number on the Summary and Side Effects tabs — check your treatment paperwork or
            ask your care team for the right number, since it varies by hospital and team.
          </div>

          {canEdit && (
            <button className="tt-btn" onClick={handleSave} style={{ background: T.accent, color: "#fff", padding: "11px 20px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
              {saved ? "Saved ✓" : "Save patient details"}
            </button>
          )}
        </div>
      )}

      {sub === "household" && (
        <HouseholdSection householdId={householdId} householdName={householdName} canManageHousehold={canManageHousehold} />
      )}

      {sub === "notifications" && <NotificationsSection />}

      {sub === "backup" && (
        canManageHousehold
          ? <BackupSection exportBundle={exportBundle} onImportAll={onImportAll} />
          : <div className="tt-settings-card" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20, fontSize: 12.5, color: T.inkSoft }}>
              Only the owner or an admin can back up, export, or restore data.
            </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 8px" }}>
        <img src="/lockup-light.svg" alt="CareTrack" style={{ height: 26, width: "auto", opacity: 0.7 }} />
      </div>
    </div>
  );
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function NotificationsSection() {
  const [permission, setPermission] = useState(() => getPushPermissionState());
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prefs, setPrefsState] = useState({
    reminders_enabled: true, treatment_completed_enabled: true, new_treatments_enabled: true,
    new_appointments_enabled: true, new_results_enabled: true, support_messages_enabled: true,
  });

  useEffect(() => {
    (async () => {
      const [sub, p] = await Promise.all([getExistingPushSubscription(), getNotificationPrefs()]);
      setSubscribed(!!sub);
      setPrefsState(p);
      setChecking(false);
    })();
  }, []);

  async function handleEnable() {
    setBusy(true); setError("");
    try {
      if (!VAPID_PUBLIC_KEY) throw new Error("Notifications haven't been set up for this deployment yet — see the README.");
      await subscribeToPush(VAPID_PUBLIC_KEY);
      setSubscribed(true);
      setPermission(getPushPermissionState());
    } catch (e) {
      setError(e.message || "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  }
  async function handleDisable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }
  async function togglePref(key) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefsState(next);
    await setNotificationPrefs(next);
  }

  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState("");

  async function handleSendTest() {
    setTestBusy(true); setTestResult("");
    try {
      const sent = await sendTestNotification();
      setTestResult(sent > 0 ? "Sent — check this device in a moment." : "Nothing was sent. If you just turned notifications on, try again in a few seconds.");
    } catch (e) {
      setTestResult(e.message || "Couldn't send a test notification.");
    } finally {
      setTestBusy(false);
    }
  }

  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  return (
    <div className="tt-settings-card" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>Notifications</div>
      <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 16, lineHeight: 1.5 }}>
        Every category below is on by default once you turn on notifications for this device — switch off
        whichever ones you don't want. This is per-device — you'll need to turn it on separately on your phone and
        your computer, for example. On iPhone, this only works once the app's been added to your Home Screen
        (Share → Add to Home Screen) — a Safari tab on its own can't receive push notifications.
      </div>

      {checking ? null : !supported ? (
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 14 }}>Notifications aren't supported in this browser.</div>
      ) : !subscribed ? (
        <button className="tt-btn" onClick={handleEnable} disabled={busy} style={{ background: T.accent, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          {busy ? "Turning on…" : "Turn on notifications on this device"}
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: T.ok, fontWeight: 600 }}>✓ Notifications are on for this device</span>
          <button className="tt-btn" onClick={handleDisable} disabled={busy} style={{ background: "transparent", color: T.breach, fontSize: 12, textDecoration: "underline", padding: 0 }}>
            Turn off
          </button>
        </div>
      )}

      {subscribed && (
        <div style={{ marginBottom: 16 }}>
          <button className="tt-btn" onClick={handleSendTest} disabled={testBusy} style={{ background: T.lineSoft, color: T.ink, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600 }}>
            {testBusy ? "Sending…" : "Send myself a test notification"}
          </button>
          {testResult && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>{testResult}</div>}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: T.breach, marginBottom: 12 }}>{error}</div>}
      {permission === "denied" && (
        <div style={{ fontSize: 12, color: T.breach, marginBottom: 12 }}>
          Notifications are blocked for this site in your browser's own settings — you'll need to allow them
          there before this will work.
        </div>
      )}

      {!checking && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: T.ink }}>Treatment marked as completed</span>
            <input type="checkbox" checked={prefs.treatment_completed_enabled} onChange={() => togglePref("treatment_completed_enabled")} style={{ width: 18, height: 18, accentColor: T.accent, flexShrink: 0 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: T.ink }}>New treatments added</span>
            <input type="checkbox" checked={prefs.new_treatments_enabled} onChange={() => togglePref("new_treatments_enabled")} style={{ width: 18, height: 18, accentColor: T.accent, flexShrink: 0 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: T.ink }}>New appointments added</span>
            <input type="checkbox" checked={prefs.new_appointments_enabled} onChange={() => togglePref("new_appointments_enabled")} style={{ width: 18, height: 18, accentColor: T.accent, flexShrink: 0 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: T.ink }}>New results added (bloods &amp; measurements)</span>
            <input type="checkbox" checked={prefs.new_results_enabled} onChange={() => togglePref("new_results_enabled")} style={{ width: 18, height: 18, accentColor: T.accent, flexShrink: 0 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: T.ink }}>Messages of support</span>
            <input type="checkbox" checked={prefs.support_messages_enabled} onChange={() => togglePref("support_messages_enabled")} style={{ width: 18, height: 18, accentColor: T.accent, flexShrink: 0 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: T.ink }}>Reminders — 24 hours before an appointment/treatment, and prescription times</span>
            <input type="checkbox" checked={prefs.reminders_enabled} onChange={() => togglePref("reminders_enabled")} style={{ width: 18, height: 18, accentColor: T.accent, flexShrink: 0 }} />
          </label>
        </div>
      )}
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
