import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCUENQWOIN18Pfr2IB9_qXMX7bgB3WJBXU",
  authDomain: "popi-solitaire.firebaseapp.com",
  projectId: "popi-solitaire",
  storageBucket: "popi-solitaire.firebasestorage.app",
  messagingSenderId: "941024004111",
  appId: "1:941024004111:web:c948b95dd254c7dd603b7a",
  measurementId: "G-DW574R0B2S",
};

const EVENT_PATH = { collection: "events_cms", docId: "current" };
const STORAGE_PREFIX = "events";
const IMAGE_TYPES = new Set(["image/png", "image/webp", "image/jpeg", "image/jpg"]);

/** Objective kinds Unity can track — keep in sync with EventCmsService / QuestTracker. */
export const OBJECTIVE_KINDS = [
  { value: "play_hours", label: "Main berapa jam", unit: "jam", hint: "10" },
  { value: "play_minutes", label: "Main berapa menit", unit: "menit", hint: "60" },
  { value: "win_levels", label: "Menang level", unit: "level", hint: "5" },
  { value: "play_levels", label: "Main level (win/lose)", unit: "level", hint: "10" },
  { value: "total_score", label: "Total score (akumulasi event)", unit: "score", hint: "50000" },
  { value: "reach_score_single", label: "Score dalam 1 level", unit: "score", hint: "30000" },
  { value: "reach_combo", label: "Capai combo", unit: "combo", hint: "5" },
  { value: "total_matches", label: "Total match", unit: "match", hint: "100" },
  { value: "complete_objective", label: "Selesaikan in-level objective", unit: "kali", hint: "3" },
  { value: "happy_mood_level", label: "Capai mood happy (1 level)", unit: "kali", hint: "1" },
  { value: "match_bomb", label: "Match bomb tile", unit: "kali", hint: "5" },
  { value: "reach_level", label: "Capai level campaign", unit: "level", hint: "20" },
  { value: "read_daily_quote", label: "Baca daily quote", unit: "kali", hint: "1" },
  { value: "login_days", label: "Login harian (streak)", unit: "hari", hint: "3" },
  { value: "share_game", label: "Share game", unit: "kali", hint: "1" },
];

const REWARD_TYPES = [
  { value: "points", label: "Points" },
  { value: "title", label: "Title / gelar" },
  { value: "lives", label: "Lives" },
  { value: "none", label: "Tanpa reward" },
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const eventConfigVersionInput = document.getElementById("event-config-version");
const eventPublishBtn = document.getElementById("event-publish-btn");
const eventReloadBtn = document.getElementById("event-reload-btn");
const eventSeedBtn = document.getElementById("event-seed-btn");
const eventStatusMsg = document.getElementById("event-status-msg");
const eventJsonPreview = document.getElementById("event-json-preview");
const eventForm = document.getElementById("event-form");
const eventIdInput = document.getElementById("event-id");
const eventStartAtInput = document.getElementById("event-start-at");
const eventEndAtInput = document.getElementById("event-end-at");
const eventTitleEn = document.getElementById("event-title-en");
const eventTitleId = document.getElementById("event-title-id");
const eventDescEn = document.getElementById("event-desc-en");
const eventDescId = document.getElementById("event-desc-id");
const eventObjectiveDetailEn = document.getElementById("event-objective-detail-en");
const eventObjectiveDetailId = document.getElementById("event-objective-detail-id");
const eventObjectiveKind = document.getElementById("event-objective-kind");
const eventObjectiveTarget = document.getElementById("event-objective-target");
const eventObjectiveUnit = document.getElementById("event-objective-unit");
const eventRewardType = document.getElementById("event-reward-type");
const eventRewardAmount = document.getElementById("event-reward-amount");
const eventRewardTitleEn = document.getElementById("event-reward-title-en");
const eventRewardTitleId = document.getElementById("event-reward-title-id");
const eventEnabledInput = document.getElementById("event-enabled");
const eventSortOrderInput = document.getElementById("event-sort-order");
const eventImageFile = document.getElementById("event-image-file");
const eventDropZone = document.getElementById("event-drop-zone");
const eventImagePreview = document.getElementById("event-image-preview");
const eventPreviewPlaceholder = document.getElementById("event-preview-placeholder");
const eventSaveBtn = document.getElementById("event-save-btn");
const eventResetBtn = document.getElementById("event-reset-btn");
const eventFormError = document.getElementById("event-form-error");
const eventList = document.getElementById("event-list");
const eventCount = document.getElementById("event-count");
const completionEventSelect = document.getElementById("completion-event-select");
const completionReloadBtn = document.getElementById("completion-reload-btn");
const completionPurgeGuestsBtn = document.getElementById("completion-purge-guests-btn");
const completionCount = document.getElementById("completion-count");
const completionList = document.getElementById("completion-list");

/** @type {{ configVersion: string, events: Array<object> }} */
let draftEvents = { configVersion: "1.0.0", events: [] };
let editingEventId = null;
/** @type {File|null} */
let pendingImage = null;
/** URL gambar yang sudah tersimpan (edit / setelah upload). */
let currentImageUrl = "";
/** Draft lokal berubah & belum di-load ulang dari server. */
let eventsDirty = false;
let selectedCompletionEventId = "";

function eventDocRef() {
  return doc(db, EVENT_PATH.collection, EVENT_PATH.docId);
}

function setEventStatus(message, type = "") {
  if (!eventStatusMsg) return;
  eventStatusMsg.textContent = message;
  eventStatusMsg.className = `status ${type}`.trim();
}

function setEventFormError(message) {
  if (!eventFormError) return;
  if (!message) {
    eventFormError.hidden = true;
    eventFormError.textContent = "";
    return;
  }
  eventFormError.hidden = false;
  eventFormError.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function objectiveKindMeta(kind) {
  return OBJECTIVE_KINDS.find((k) => k.value === kind) || { label: kind, unit: "", hint: "1" };
}

function normalizeObjectiveKind(value) {
  const allowed = new Set(OBJECTIVE_KINDS.map((k) => k.value));
  const v = String(value || "play_hours").trim();
  return allowed.has(v) ? v : "play_hours";
}

function normalizeRewardType(value) {
  const allowed = new Set(REWARD_TYPES.map((r) => r.value));
  const v = String(value || "points").trim();
  return allowed.has(v) ? v : "points";
}

function toIsoFromLocal(datetimeLocal) {
  if (!datetimeLocal) return "";
  const d = new Date(datetimeLocal);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function fromIsoToLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function formatProgress(kind, value) {
  const meta = objectiveKindMeta(kind);
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? "—");
  if (kind === "play_hours") return `${n.toFixed(2)} jam`;
  if (kind === "play_minutes") return `${Math.round(n)} menit`;
  if (Number.isInteger(n)) return `${n} ${meta.unit}`.trim();
  return `${n.toFixed(2)} ${meta.unit}`.trim();
}

function formatProgressDetail(row) {
  const kind = row.kind || "";
  const progress = Number(row.progress);
  const target = Number(row.target);
  const unit = row.unit || objectiveKindMeta(kind).unit || "";
  const progText = Number.isNaN(progress) ? "—" : formatProgress(kind, progress);
  const targetText = Number.isNaN(target) ? "—" : formatProgress(kind, target);
  let pct = Number(row.progressPercent);
  if (Number.isNaN(pct) && !Number.isNaN(progress) && !Number.isNaN(target) && target > 0) {
    pct = Math.min(100, (progress / target) * 100);
  }
  const pctText = Number.isNaN(pct) ? "—" : `${pct.toFixed(0)}%`;
  const kindLabel = objectiveKindMeta(kind).label || kind || "—";
  return {
    kindLabel,
    bar: `${progText} / ${targetText}`,
    pctText,
    unit,
  };
}

function participantStatus(row) {
  if (row.claimed) return { text: "Claimed", cls: "event-badge-on" };
  if (row.completed) return { text: "Selesai", cls: "event-badge-on" };
  return { text: "Berlangsung", cls: "event-badge-on" };
}

function toIsoMaybe(value) {
  if (!value) return "";
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function slugId(text) {
  return (
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || `event_${Date.now()}`
  );
}

function extensionFromFile(file) {
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "png";
  return name.slice(dot + 1).toLowerCase() || "png";
}

function normalizeEvent(raw) {
  const kind = normalizeObjectiveKind(raw?.objective?.kind);
  const meta = objectiveKindMeta(kind);
  return {
    id: raw?.id || "",
    startAt: raw?.startAt || "",
    endAt: raw?.endAt || "",
    imageUrl: raw?.imageUrl || "",
    titleEn: raw?.titleEn || "",
    titleId: raw?.titleId || "",
    descriptionEn: raw?.descriptionEn || "",
    descriptionId: raw?.descriptionId || "",
    objectiveDetailEn: raw?.objectiveDetailEn || "",
    objectiveDetailId: raw?.objectiveDetailId || "",
    objective: {
      kind,
      target: Number(raw?.objective?.target ?? meta.hint) || 1,
      unit: raw?.objective?.unit || meta.unit,
    },
    reward: {
      type: normalizeRewardType(raw?.reward?.type),
      amount: Number(raw?.reward?.amount ?? 0) || 0,
      titleEn: raw?.reward?.titleEn || "",
      titleId: raw?.reward?.titleId || "",
    },
    enabled: raw?.enabled !== false,
    sortOrder: Number(raw?.sortOrder ?? 0) || 0,
  };
}

function buildEventPayload() {
  return {
    configVersion: draftEvents.configVersion || "1.0.0",
    events: [...draftEvents.events]
      .map(normalizeEvent)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
  };
}

function populateObjectiveKindSelect() {
  if (!eventObjectiveKind) return;
  eventObjectiveKind.innerHTML = OBJECTIVE_KINDS.map(
    (k) => `<option value="${escapeHtml(k.value)}">${escapeHtml(k.label)}</option>`
  ).join("");
}

function populateRewardTypeSelect() {
  if (!eventRewardType) return;
  eventRewardType.innerHTML = REWARD_TYPES.map(
    (r) => `<option value="${escapeHtml(r.value)}">${escapeHtml(r.label)}</option>`
  ).join("");
}

function updateObjectiveUnitLabel() {
  if (!eventObjectiveKind || !eventObjectiveUnit) return;
  const meta = objectiveKindMeta(eventObjectiveKind.value);
  eventObjectiveUnit.textContent = meta.unit || "—";
  if (eventObjectiveTarget && !eventObjectiveTarget.value) {
    eventObjectiveTarget.placeholder = meta.hint || "1";
  }
}

function updateRewardFieldsVisibility() {
  const type = normalizeRewardType(eventRewardType?.value);
  const amountWrap = document.getElementById("event-reward-amount-wrap");
  const titleWrap = document.getElementById("event-reward-title-wrap");
  if (amountWrap) amountWrap.hidden = type === "none" || type === "title";
  if (titleWrap) titleWrap.hidden = type !== "title";
}

function refreshCompletionEventSelect() {
  if (!completionEventSelect) return;
  const prev = selectedCompletionEventId;
  const options = draftEvents.events.map((e) => {
    const title = e.titleId || e.titleEn || e.id;
    return `<option value="${escapeHtml(e.id)}">${escapeHtml(title)} (${escapeHtml(e.id)})</option>`;
  });
  completionEventSelect.innerHTML =
    options.length > 0
      ? options.join("")
      : `<option value="">— belum ada event —</option>`;
  if (prev && draftEvents.events.some((e) => e.id === prev)) {
    completionEventSelect.value = prev;
  } else if (draftEvents.events.length) {
    completionEventSelect.value = draftEvents.events[0].id;
  }
  selectedCompletionEventId = completionEventSelect.value || "";
}

function refreshEventPreview() {
  if (eventConfigVersionInput) eventConfigVersionInput.value = draftEvents.configVersion || "1.0.0";
  if (eventJsonPreview) eventJsonPreview.textContent = JSON.stringify(buildEventPayload(), null, 2);
  if (eventCount) eventCount.textContent = `${draftEvents.events.length} event`;
  refreshCompletionEventSelect();

  if (!eventList) return;
  if (!draftEvents.events.length) {
    eventList.innerHTML =
      `<div class="empty-state">Belum ada event. Tambah manual atau klik <strong>Isi contoh</strong>, lalu Simpan &amp; publish.</div>`;
    return;
  }

  const sorted = [...draftEvents.events].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  eventList.innerHTML = sorted
    .map((e) => {
      const meta = objectiveKindMeta(e.objective?.kind);
      const thumb = e.imageUrl
        ? `<img src="${escapeHtml(e.imageUrl)}" alt="" class="event-thumb" loading="lazy" />`
        : `<div class="event-thumb event-thumb-empty" aria-hidden="true">★</div>`;
      const statusBadge = e.enabled
        ? `<span class="event-badge event-badge-on">Aktif</span>`
        : `<span class="event-badge event-badge-off">Nonaktif</span>`;
      return `<article class="event-row" data-id="${escapeHtml(e.id)}">
        ${thumb}
        <div class="event-meta">
          <div class="event-meta-top">
            <strong class="event-id">${escapeHtml(e.id)}</strong>
            ${statusBadge}
            <span class="event-kind">${escapeHtml(meta.label)} · target ${escapeHtml(String(e.objective?.target ?? ""))} ${escapeHtml(meta.unit)}</span>
          </div>
          <p class="event-title">${escapeHtml(e.titleId || e.titleEn || "")}</p>
          <p class="event-schedule">${escapeHtml(formatDateTime(e.startAt))} → ${escapeHtml(formatDateTime(e.endAt))}</p>
        </div>
        <div class="event-actions">
          <button type="button" class="btn ghost" data-act="completions">Peserta</button>
          <button type="button" class="btn ghost" data-act="edit">Edit</button>
          <button type="button" class="btn danger" data-act="delete">Hapus</button>
        </div>
      </article>`;
    })
    .join("");
}

function resetEventForm() {
  editingEventId = null;
  pendingImage = null;
  currentImageUrl = "";
  if (eventForm) eventForm.reset();
  if (eventIdInput) eventIdInput.value = "";
  if (eventObjectiveKind) eventObjectiveKind.value = "play_hours";
  if (eventRewardType) eventRewardType.value = "points";
  if (eventEnabledInput) eventEnabledInput.checked = true;
  if (eventSortOrderInput) eventSortOrderInput.value = "0";
  updateObjectiveUnitLabel();
  updateRewardFieldsVisibility();
  setEventFormError("");
  if (eventImagePreview) {
    eventImagePreview.hidden = true;
    eventImagePreview.removeAttribute("src");
  }
  if (eventPreviewPlaceholder) eventPreviewPlaceholder.hidden = false;
  if (eventSaveBtn) eventSaveBtn.textContent = "Simpan & publish";
}

function showImagePreview(url) {
  if (!url) {
    if (eventImagePreview) {
      eventImagePreview.hidden = true;
      eventImagePreview.removeAttribute("src");
    }
    if (eventPreviewPlaceholder) eventPreviewPlaceholder.hidden = false;
    return;
  }
  if (eventImagePreview) {
    eventImagePreview.src = url;
    eventImagePreview.hidden = false;
  }
  if (eventPreviewPlaceholder) eventPreviewPlaceholder.hidden = true;
}

async function uploadEventImage(eventId, file) {
  const ext = extensionFromFile(file);
  const path = `${STORAGE_PREFIX}/${eventId}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/png",
    cacheControl: "public,max-age=31536000",
  });
  return getDownloadURL(storageRef);
}

function sampleEvents() {
  const now = new Date();
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
  return [
    normalizeEvent({
      id: "marathon_10h",
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      imageUrl: "",
      titleEn: "10-Hour Marathon",
      titleId: "Marathon 10 Jam",
      descriptionEn: "Play Popi Solitaire during the event and reach 10 hours of play time.",
      descriptionId: "Main Popi Solitaire selama event dan capai 10 jam waktu main.",
      objectiveDetailEn: "Play time is counted while the game is open during the event period.",
      objectiveDetailId: "Waktu main dihitung saat game terbuka selama periode event.",
      objective: { kind: "play_hours", target: 10 },
      reward: { type: "points", amount: 100 },
      enabled: true,
      sortOrder: 0,
    }),
    normalizeEvent({
      id: "win_5_levels",
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      imageUrl: "",
      titleEn: "Victory Sprint",
      titleId: "Sprint Kemenangan",
      descriptionEn: "Win 5 levels during the event.",
      descriptionId: "Menangkan 5 level selama event.",
      objectiveDetailEn: "Each cleared board counts as one win.",
      objectiveDetailId: "Setiap papan yang berhasil diselesaikan dihitung 1 kemenangan.",
      objective: { kind: "win_levels", target: 5 },
      reward: { type: "points", amount: 50 },
      enabled: true,
      sortOrder: 1,
    }),
    normalizeEvent({
      id: "combo_master",
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      imageUrl: "",
      titleEn: "Combo Master",
      titleId: "Master Combo",
      descriptionEn: "Reach a combo of 7 in any level.",
      descriptionId: "Capai combo 7 di level manapun.",
      objectiveDetailEn: "Your best combo during the event counts toward progress.",
      objectiveDetailId: "Combo terbaik selama event dihitung sebagai progress.",
      objective: { kind: "reach_combo", target: 7 },
      reward: { type: "title", amount: 0, titleEn: "Combo Master", titleId: "Master Combo" },
      enabled: true,
      sortOrder: 2,
    }),
  ];
}

export async function loadEvents(options = {}) {
  const { force = false } = options;
  if (eventsDirty && !force) {
    const ok = window.confirm(
      "Ada perubahan event yang belum di-reload dari server (termasuk gambar). Reload akan menimpa draft lokal. Lanjut?"
    );
    if (!ok) {
      setEventStatus("Reload dibatalkan — draft lokal tetap dipakai.", "ok");
      return;
    }
  }

  setEventStatus("Memuat events dari Firestore...");
  const snap = await getDoc(eventDocRef());
  if (!snap.exists()) {
    draftEvents = { configVersion: "1.0.0", events: [] };
    eventsDirty = false;
    refreshEventPreview();
    setEventStatus("Belum ada dokumen events. Tambah event lalu Simpan & publish, atau Isi contoh.", "ok");
    return;
  }

  const data = snap.data() || {};
  draftEvents = {
    configVersion: data.configVersion || "1.0.0",
    events: Array.isArray(data.events) ? data.events.map(normalizeEvent) : [],
  };
  eventsDirty = false;
  refreshEventPreview();
  if (!draftEvents.events.length) {
    setEventStatus("Loaded events — daftar kosong (tidak diisi ulang contoh).", "ok");
    return;
  }
  const withImage = draftEvents.events.filter((e) => e.imageUrl).length;
  setEventStatus(
    `Loaded events v${draftEvents.configVersion} (${draftEvents.events.length}, ${withImage} ber-gambar)`,
    "ok"
  );
}

async function publishEvents() {
  draftEvents.configVersion = (eventConfigVersionInput?.value || "1.0.0").trim();
  const payload = {
    ...buildEventPayload(),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email || null,
  };
  eventPublishBtn.disabled = true;
  setEventStatus("Publishing events...");
  try {
    await setDoc(eventDocRef(), payload, { merge: false });
    eventsDirty = false;
    refreshEventPreview();
    const withImage = draftEvents.events.filter((e) => e.imageUrl).length;
    setEventStatus(
      `Published ke events_cms/current (${draftEvents.events.length} event, ${withImage} ber-gambar)`,
      "ok"
    );
  } catch (error) {
    console.error(error);
    setEventStatus(error.message || "Gagal publish events", "err");
    throw error;
  } finally {
    eventPublishBtn.disabled = false;
  }
}

async function saveEvent(event) {
  event.preventDefault();
  setEventFormError("");

  const titleEn = eventTitleEn?.value.trim() || "";
  const titleId = eventTitleId?.value.trim() || "";
  if (!titleEn || !titleId) {
    setEventFormError("Judul English dan Indonesia wajib diisi.");
    return;
  }

  const startAt = toIsoFromLocal(eventStartAtInput?.value);
  const endAt = toIsoFromLocal(eventEndAtInput?.value);
  if (!startAt || !endAt) {
    setEventFormError("Waktu mulai dan selesai wajib diisi.");
    return;
  }
  if (new Date(endAt) <= new Date(startAt)) {
    setEventFormError("Waktu selesai harus setelah waktu mulai.");
    return;
  }

  let id = eventIdInput?.value.trim() || editingEventId || slugId(titleEn);
  id = id.replace(/[^A-Za-z0-9_\-]/g, "_");
  if (!id) {
    setEventFormError("Event ID tidak valid.");
    return;
  }

  const kind = normalizeObjectiveKind(eventObjectiveKind?.value);
  const meta = objectiveKindMeta(kind);
  const target = Number(eventObjectiveTarget?.value);
  if (!Number.isFinite(target) || target <= 0) {
    setEventFormError("Target objective harus angka lebih dari 0.");
    return;
  }

  const existing =
    draftEvents.events.find((e) => e.id === id) ||
    (editingEventId ? draftEvents.events.find((e) => e.id === editingEventId) : null);
  eventSaveBtn.disabled = true;
  try {
    // Pertahankan gambar lama saat edit tanpa upload ulang.
    let imageUrl = currentImageUrl || existing?.imageUrl || "";
    if (pendingImage) {
      setEventStatus(`Upload gambar ${id}...`);
      imageUrl = await uploadEventImage(id, pendingImage);
      currentImageUrl = imageUrl;
    }

    if (!imageUrl) {
      // Tidak wajib, tapi ingatkan agar tidak kaget saat refresh.
      console.warn("[Events] Simpan tanpa imageUrl:", id);
    }

    const item = normalizeEvent({
      id,
      startAt,
      endAt,
      imageUrl,
      titleEn,
      titleId,
      descriptionEn: eventDescEn?.value.trim() || "",
      descriptionId: eventDescId?.value.trim() || "",
      objectiveDetailEn: eventObjectiveDetailEn?.value.trim() || "",
      objectiveDetailId: eventObjectiveDetailId?.value.trim() || "",
      objective: { kind, target, unit: meta.unit },
      reward: {
        type: normalizeRewardType(eventRewardType?.value),
        amount: Number(eventRewardAmount?.value) || 0,
        titleEn: eventRewardTitleEn?.value.trim() || "",
        titleId: eventRewardTitleId?.value.trim() || "",
      },
      enabled: eventEnabledInput?.checked !== false,
      sortOrder: Number(eventSortOrderInput?.value) || 0,
    });

    // Jika ID diganti saat edit, hapus entri lama.
    if (editingEventId && editingEventId !== id) {
      draftEvents.events = draftEvents.events.filter((e) => e.id !== editingEventId);
    }

    const idx = draftEvents.events.findIndex((e) => e.id === id);
    if (idx === -1) draftEvents.events.push(item);
    else draftEvents.events[idx] = item;

    eventsDirty = true;
    refreshEventPreview();
    resetEventForm();
    setEventStatus(`Event ${id} disimpan — publishing ke Firebase...`, "ok");
    // Publish otomatis agar refresh browser / Reload tidak menghilangkan gambar.
    await publishEvents();
  } catch (error) {
    console.error(error);
    setEventFormError(error.message || "Gagal simpan event");
    setEventStatus(error.message || "Gagal simpan event", "err");
  } finally {
    eventSaveBtn.disabled = false;
  }
}

async function deleteEvent(id) {
  if (!window.confirm(`Hapus event ${id} dari CMS & Firebase?`)) return;
  const item = draftEvents.events.find((e) => e.id === id);
  draftEvents.events = draftEvents.events.filter((e) => e.id !== id);

  if (item?.imageUrl) {
    try {
      const pathMatch = decodeURIComponent(item.imageUrl).match(/\/o\/([^?]+)/);
      if (pathMatch?.[1]) await deleteObject(ref(storage, decodeURIComponent(pathMatch[1])));
    } catch (error) {
      console.warn("Event image delete skipped:", error);
    }
  }

  if (editingEventId === id) resetEventForm();
  eventsDirty = true;
  refreshEventPreview();
  setEventStatus(`${id} dihapus — publishing ke Firebase...`, "ok");
  try {
    await publishEvents();
  } catch (error) {
    setEventStatus(error.message || `Gagal publish setelah hapus ${id}`, "err");
  }
}

function editEvent(id) {
  const item = draftEvents.events.find((e) => e.id === id);
  if (!item) return;
  editingEventId = id;
  pendingImage = null;
  currentImageUrl = item.imageUrl || "";
  if (eventIdInput) eventIdInput.value = item.id;
  if (eventStartAtInput) eventStartAtInput.value = fromIsoToLocal(item.startAt);
  if (eventEndAtInput) eventEndAtInput.value = fromIsoToLocal(item.endAt);
  if (eventTitleEn) eventTitleEn.value = item.titleEn || "";
  if (eventTitleId) eventTitleId.value = item.titleId || "";
  if (eventDescEn) eventDescEn.value = item.descriptionEn || "";
  if (eventDescId) eventDescId.value = item.descriptionId || "";
  if (eventObjectiveDetailEn) eventObjectiveDetailEn.value = item.objectiveDetailEn || "";
  if (eventObjectiveDetailId) eventObjectiveDetailId.value = item.objectiveDetailId || "";
  if (eventObjectiveKind) eventObjectiveKind.value = normalizeObjectiveKind(item.objective?.kind);
  if (eventObjectiveTarget) eventObjectiveTarget.value = String(item.objective?.target ?? "");
  if (eventRewardType) eventRewardType.value = normalizeRewardType(item.reward?.type);
  if (eventRewardAmount) eventRewardAmount.value = String(item.reward?.amount ?? 0);
  if (eventRewardTitleEn) eventRewardTitleEn.value = item.reward?.titleEn || "";
  if (eventRewardTitleId) eventRewardTitleId.value = item.reward?.titleId || "";
  if (eventEnabledInput) eventEnabledInput.checked = item.enabled !== false;
  if (eventSortOrderInput) eventSortOrderInput.value = String(item.sortOrder ?? 0);
  updateObjectiveUnitLabel();
  updateRewardFieldsVisibility();
  showImagePreview(currentImageUrl);
  if (eventSaveBtn) eventSaveBtn.textContent = "Update & publish";
}

function seedSampleEvents() {
  const samples = sampleEvents();
  let added = 0;
  for (const sample of samples) {
    if (draftEvents.events.some((e) => e.id === sample.id)) continue;
    draftEvents.events.push({ ...sample });
    added += 1;
  }
  if (added > 0) eventsDirty = true;
  refreshEventPreview();
  setEventStatus(
    added > 0
      ? `${added} contoh event ditambahkan ke draft. Klik Publish events.`
      : "Contoh sudah ada di draft.",
    "ok"
  );
}

function setPendingImage(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) {
    setEventFormError("Gambar harus PNG / WebP / JPG.");
    return;
  }
  pendingImage = file;
  setEventFormError("");
  const url = URL.createObjectURL(file);
  showImagePreview(url);
}

async function loadCompletions(eventId) {
  if (!completionList) return;
  if (!eventId) {
    completionCount.textContent = "0 peserta";
    completionList.innerHTML =
      `<div class="empty-state">Pilih event untuk melihat user yang ikut + progress.</div>`;
    return;
  }

  selectedCompletionEventId = eventId;
  completionList.innerHTML = `<div class="empty-state">Memuat peserta...</div>`;
  try {
    const colRef = collection(db, "event_progress", eventId, "users");
    let snap;
    try {
      snap = await getDocs(query(colRef, orderBy("updatedAt", "desc"), limit(500)));
    } catch (indexErr) {
      console.warn("[Events] orderBy updatedAt failed, fallback unordered:", indexErr);
      snap = await getDocs(query(colRef, limit(500)));
    }

    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      rows.push({
        uid: d.uid || docSnap.id,
        nickname: d.nickname || "—",
        kind: d.kind || "",
        unit: d.unit || "",
        target: d.target,
        progress: d.progress,
        progressPercent: d.progressPercent,
        progressSeconds: d.progressSeconds,
        completed: !!d.completed,
        claimed: !!d.claimed,
        joinedAt: toIsoMaybe(d.joinedAt),
        updatedAt: toIsoMaybe(d.updatedAt),
        completedAt: toIsoMaybe(d.completedAt),
        platform: d.platform || "",
        isRegistered: d.isRegistered === true,
        titleId: d.titleId || "",
        titleEn: d.titleEn || "",
      });
    });

    rows.sort((a, b) => {
      const ta = a.updatedAt || a.joinedAt || "";
      const tb = b.updatedAt || b.joinedAt || "";
      return tb.localeCompare(ta);
    });

    const joinedCount = rows.length;
    const doneCount = rows.filter((r) => r.completed).length;
    completionCount.textContent = `${joinedCount} peserta · ${doneCount} selesai`;

    if (!rows.length) {
      completionList.innerHTML =
        `<div class="empty-state">Belum ada user yang ikut event ini. Data muncul setelah user tekan <strong>Ikuti Event</strong> di game (Firestore <code>event_progress/${escapeHtml(eventId)}/users</code>).</div>`;
      return;
    }

    completionList.innerHTML = `<div class="completion-table-wrap">
      <table class="completion-table">
        <thead>
          <tr>
            <th>Nickname</th>
            <th>UID</th>
            <th>Objective</th>
            <th>Progress</th>
            <th>%</th>
            <th>Status</th>
            <th>Join</th>
            <th>Update</th>
            <th>Akun</th>
            <th>Platform</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const detail = formatProgressDetail(r);
              const st = participantStatus(r);
              return `<tr data-uid="${escapeHtml(r.uid)}">
            <td>${escapeHtml(r.nickname)}</td>
            <td><code class="uid-cell">${escapeHtml(r.uid)}</code></td>
            <td>${escapeHtml(detail.kindLabel)}<div class="field-hint">${escapeHtml(detail.bar)}</div></td>
            <td>${escapeHtml(detail.bar)}</td>
            <td>
              <div class="progress-cell">
                <div class="progress-bar" aria-hidden="true"><span style="width:${escapeHtml(detail.pctText === "—" ? "0%" : detail.pctText)}"></span></div>
                <span>${escapeHtml(detail.pctText)}</span>
              </div>
            </td>
            <td><span class="event-badge ${st.cls}">${escapeHtml(st.text)}</span></td>
            <td>${escapeHtml(formatDateTime(r.joinedAt))}</td>
            <td>${escapeHtml(formatDateTime(r.updatedAt))}</td>
            <td>${r.isRegistered ? "Registered" : "Guest"}</td>
            <td>${escapeHtml(r.platform || "—")}</td>
            <td><button type="button" class="btn danger" data-act="delete-participant" data-uid="${escapeHtml(r.uid)}">Hapus</button></td>
          </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  } catch (error) {
    console.error(error);
    completionCount.textContent = "—";
    completionList.innerHTML =
      `<div class="empty-state error">Gagal load peserta: ${escapeHtml(error.message || "unknown")}</div>`;
  }
}

async function deleteParticipant(eventId, uid) {
  if (!eventId || !uid) return;
  if (!window.confirm(`Hapus peserta ${uid} dari event ${eventId}?`)) return;
  try {
    await deleteDoc(doc(db, "event_progress", eventId, "users", uid));
    try {
      await deleteDoc(doc(db, "event_completions", eventId, "users", uid));
    } catch (_) {
      /* optional mirror */
    }
    setEventStatus(`Peserta ${uid} dihapus.`, "ok");
    await loadCompletions(eventId);
  } catch (error) {
    console.error(error);
    setEventStatus(error.message || "Gagal hapus peserta", "err");
  }
}

async function purgeGuestParticipants(eventId) {
  if (!eventId) return;
  if (!window.confirm(`Hapus SEMUA Guest dari event ${eventId}? Registered tidak ikut terhapus.`)) return;
  try {
    const colRef = collection(db, "event_progress", eventId, "users");
    const snap = await getDocs(query(colRef, limit(500)));
    const guests = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      if (d.isRegistered === true) return;
      guests.push(docSnap.id);
    });
    if (!guests.length) {
      setEventStatus("Tidak ada Guest di event ini.", "ok");
      return;
    }

    // Batch max 500; kita sudah limit 500.
    const batch = writeBatch(db);
    for (const uid of guests) {
      batch.delete(doc(db, "event_progress", eventId, "users", uid));
      batch.delete(doc(db, "event_completions", eventId, "users", uid));
    }
    await batch.commit();
    setEventStatus(`${guests.length} Guest dihapus dari ${eventId}.`, "ok");
    await loadCompletions(eventId);
  } catch (error) {
    console.error(error);
    setEventStatus(error.message || "Gagal hapus Guest", "err");
  }
}

function showCompletionsForEvent(id) {
  if (completionEventSelect) completionEventSelect.value = id;
  selectedCompletionEventId = id;
  const tabEvents = document.getElementById("tab-events");
  const tabBtn = document.querySelector('.cms-tab[data-tab="events"]');
  if (tabBtn) tabBtn.click();
  if (tabEvents) {
    const section = document.getElementById("event-completions-panel");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  loadCompletions(id).catch((e) => setEventStatus(e.message || "Gagal load peserta", "err"));
}

function wireEventUi() {
  if (!eventForm) return;

  populateObjectiveKindSelect();
  populateRewardTypeSelect();
  updateObjectiveUnitLabel();
  updateRewardFieldsVisibility();

  eventForm.addEventListener("submit", saveEvent);
  eventResetBtn?.addEventListener("click", resetEventForm);
  eventPublishBtn?.addEventListener("click", () => {
    publishEvents().catch((e) => setEventStatus(e.message || "Gagal publish", "err"));
  });
  eventReloadBtn?.addEventListener("click", () => {
    loadEvents({ force: true }).catch((e) => setEventStatus(e.message || "Gagal reload", "err"));
  });
  eventSeedBtn?.addEventListener("click", () => seedSampleEvents());
  eventConfigVersionInput?.addEventListener("change", () => {
    draftEvents.configVersion = eventConfigVersionInput.value.trim() || "1.0.0";
    eventsDirty = true;
    refreshEventPreview();
  });
  eventObjectiveKind?.addEventListener("change", updateObjectiveUnitLabel);
  eventRewardType?.addEventListener("change", updateRewardFieldsVisibility);

  eventDropZone?.addEventListener("click", () => eventImageFile?.click());
  eventImageFile?.addEventListener("change", () => {
    const file = eventImageFile.files?.[0];
    if (file) setPendingImage(file);
  });
  eventDropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    eventDropZone.classList.add("is-dragover");
  });
  eventDropZone?.addEventListener("dragleave", () => eventDropZone.classList.remove("is-dragover"));
  eventDropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    eventDropZone.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) setPendingImage(file);
  });

  eventList?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const card = btn.closest(".event-row");
    const id = card?.getAttribute("data-id");
    if (!id) return;
    if (btn.getAttribute("data-act") === "edit") editEvent(id);
    if (btn.getAttribute("data-act") === "delete") deleteEvent(id);
    if (btn.getAttribute("data-act") === "completions") showCompletionsForEvent(id);
  });

  completionReloadBtn?.addEventListener("click", () => {
    const id = completionEventSelect?.value || selectedCompletionEventId;
    loadCompletions(id).catch((e) => setEventStatus(e.message || "Gagal load peserta", "err"));
  });
  completionPurgeGuestsBtn?.addEventListener("click", () => {
    const id = completionEventSelect?.value || selectedCompletionEventId;
    purgeGuestParticipants(id).catch((e) => setEventStatus(e.message || "Gagal hapus Guest", "err"));
  });
  completionList?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act='delete-participant']");
    if (!btn) return;
    const uid = btn.getAttribute("data-uid");
    const id = completionEventSelect?.value || selectedCompletionEventId;
    deleteParticipant(id, uid).catch((e) => setEventStatus(e.message || "Gagal hapus peserta", "err"));
  });
  completionEventSelect?.addEventListener("change", () => {
    loadCompletions(completionEventSelect.value).catch((e) =>
      setEventStatus(e.message || "Gagal load peserta", "err")
    );
  });
}

wireEventUi();
refreshEventPreview();

window.loadEvents = loadEvents;

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadEvents().catch((e) => {
      console.error(e);
      setEventStatus(e.message || "Gagal load events", "err");
    });
  } else {
    draftEvents = { configVersion: "1.0.0", events: [] };
    resetEventForm();
    refreshEventPreview();
    setEventStatus("Login dulu untuk load & publish events.", "");
  }
});
