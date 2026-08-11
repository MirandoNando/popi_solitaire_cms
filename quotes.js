import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
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

const QUOTE_PATH = { collection: "quotes_cms", docId: "current" };
const STORAGE_PREFIX = "quotes";
const IMAGE_TYPES = new Set(["image/png", "image/webp", "image/jpeg", "image/jpg"]);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const quoteConfigVersionInput = document.getElementById("quote-config-version");
const quotePublishBtn = document.getElementById("quote-publish-btn");
const quoteReloadBtn = document.getElementById("quote-reload-btn");
const quoteStatusMsg = document.getElementById("quote-status-msg");
const quoteJsonPreview = document.getElementById("quote-json-preview");
const quoteForm = document.getElementById("quote-form");
const quoteIdInput = document.getElementById("quote-id");
const quoteCategorySelect = document.getElementById("quote-category");
const quoteTextEn = document.getElementById("quote-text-en");
const quoteTextId = document.getElementById("quote-text-id");
const quoteIconFile = document.getElementById("quote-icon-file");
const quoteDropZone = document.getElementById("quote-drop-zone");
const quoteIconPreview = document.getElementById("quote-icon-preview");
const quotePreviewPlaceholder = document.getElementById("quote-preview-placeholder");
const quoteSaveBtn = document.getElementById("quote-save-btn");
const quoteResetBtn = document.getElementById("quote-reset-btn");
const quoteSeedBtn = document.getElementById("quote-seed-btn");
const quoteFormError = document.getElementById("quote-form-error");
const quoteList = document.getElementById("quote-list");
const quoteCount = document.getElementById("quote-count");

/** @type {{ configVersion: string, quotes: Array<{id: string, category: string, textEn: string, textId: string, iconUrl: string}> }} */
let draftQuotes = { configVersion: "1.0.0", quotes: [] };
let editingQuoteId = null;
/** @type {File|null} */
let pendingIcon = null;

function quoteDocRef() {
  return doc(db, QUOTE_PATH.collection, QUOTE_PATH.docId);
}

function setQuoteStatus(message, type = "") {
  if (!quoteStatusMsg) return;
  quoteStatusMsg.textContent = message;
  quoteStatusMsg.className = `status ${type}`.trim();
}

function setQuoteFormError(message) {
  if (!quoteFormError) return;
  if (!message) {
    quoteFormError.hidden = true;
    quoteFormError.textContent = "";
    return;
  }
  quoteFormError.hidden = false;
  quoteFormError.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function categoryLabel(category) {
  switch (category) {
    case "calm":
      return "Calm";
    case "comfort":
      return "Comfort";
    case "science":
      return "Science";
    case "fun":
      return "Fun";
    default:
      return "Motivational";
  }
}

function normalizeCategory(value) {
  const allowed = new Set(["motivational", "calm", "comfort", "science", "fun"]);
  const v = String(value || "motivational").toLowerCase().trim();
  return allowed.has(v) ? v : "motivational";
}

function sampleQuotes() {
  return [
    {
      id: "mot_1",
      category: "motivational",
      textEn: "One good match can change everything.",
      textId: "Satu match yang tepat bisa mengubah segalanya.",
      iconUrl: "",
    },
    {
      id: "mot_2",
      category: "motivational",
      textEn: "Keep going — the board clears for those who try.",
      textId: "Terus saja — papan terbuka bagi yang mencoba.",
      iconUrl: "",
    },
    {
      id: "calm_1",
      category: "calm",
      textEn: "A calm mind clears the board.",
      textId: "Pikiran yang tenang membersihkan papan.",
      iconUrl: "",
    },
    {
      id: "calm_2",
      category: "calm",
      textEn: "Breathe. Then pick your next tile.",
      textId: "Tarik napas. Baru pilih tile berikutnya.",
      iconUrl: "",
    },
    {
      id: "comfort_1",
      category: "comfort",
      textEn: "It's okay to pause. Feelings are part of the game.",
      textId: "Tidak apa-apa berhenti sejenak. Perasaan juga bagian dari permainan.",
      iconUrl: "",
    },
    {
      id: "comfort_2",
      category: "comfort",
      textEn: "Even stuck boards can become gentle again.",
      textId: "Papan yang macet pun bisa lembut kembali.",
      iconUrl: "",
    },
    {
      id: "sci_1",
      category: "science",
      textEn: "Pattern recognition is your brain's favorite puzzle.",
      textId: "Mengenali pola adalah teka-teki favorit otakmu.",
      iconUrl: "",
    },
    {
      id: "sci_2",
      category: "science",
      textEn: "Small choices compound — like streaks in solitaire.",
      textId: "Pilihan kecil menumpuk — seperti streak di solitaire.",
      iconUrl: "",
    },
    {
      id: "fun_1",
      category: "fun",
      textEn: "Play kind. Feel better.",
      textId: "Main dengan lembut. Rasakan lebih baik.",
      iconUrl: "",
    },
    {
      id: "fun_2",
      category: "fun",
      textEn: "Emoji faces. Serious fun.",
      textId: "Wajah emoji. Seriusnya seru.",
      iconUrl: "",
    },
  ];
}

function buildQuotePayload() {
  return {
    configVersion: draftQuotes.configVersion || "1.0.0",
    quotes: draftQuotes.quotes.map((q) => ({
      id: q.id,
      category: normalizeCategory(q.category),
      textEn: q.textEn || "",
      textId: q.textId || "",
      iconUrl: q.iconUrl || "",
    })),
  };
}

function refreshQuotePreview() {
  if (quoteConfigVersionInput) quoteConfigVersionInput.value = draftQuotes.configVersion || "1.0.0";
  if (quoteJsonPreview) quoteJsonPreview.textContent = JSON.stringify(buildQuotePayload(), null, 2);
  if (quoteCount) quoteCount.textContent = `${draftQuotes.quotes.length} item`;
  if (!quoteList) return;

  if (!draftQuotes.quotes.length) {
    quoteList.innerHTML = `<p class="empty">Belum ada quote. Klik <strong>Isi contoh</strong> atau tambah manual, lalu Publish.</p>`;
    return;
  }

  quoteList.innerHTML = draftQuotes.quotes
    .map((q) => {
      const icon = q.iconUrl
        ? `<img src="${escapeHtml(q.iconUrl)}" alt="" class="emo-thumb" />`
        : `<div class="emo-thumb emo-thumb-empty">${escapeHtml(categoryLabel(q.category)[0] || "✦")}</div>`;
      return `<article class="emo-card" data-id="${escapeHtml(q.id)}">
        ${icon}
        <div class="emo-meta">
          <strong>${escapeHtml(q.id)}</strong>
          <span class="field-hint">${escapeHtml(categoryLabel(q.category))}</span>
          <span>${escapeHtml(q.textEn || "")}</span>
          <span>${escapeHtml(q.textId || "")}</span>
        </div>
        <div class="emo-actions">
          <button type="button" class="btn ghost" data-act="edit">Edit</button>
          <button type="button" class="btn danger" data-act="delete">Hapus</button>
        </div>
      </article>`;
    })
    .join("");
}

function resetQuoteForm() {
  editingQuoteId = null;
  pendingIcon = null;
  if (quoteForm) quoteForm.reset();
  if (quoteIdInput) quoteIdInput.value = "";
  if (quoteCategorySelect) quoteCategorySelect.value = "motivational";
  setQuoteFormError("");
  if (quoteIconPreview) {
    quoteIconPreview.hidden = true;
    quoteIconPreview.removeAttribute("src");
  }
  if (quotePreviewPlaceholder) quotePreviewPlaceholder.hidden = false;
  if (quoteSaveBtn) quoteSaveBtn.textContent = "Simpan ke draft";
}

function slugId(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || `quote_${Date.now()}`;
}

function extensionFromFile(file) {
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "png";
  return name.slice(dot + 1).toLowerCase() || "png";
}

async function uploadQuoteIcon(quoteId, file) {
  const ext = extensionFromFile(file);
  const path = `${STORAGE_PREFIX}/${quoteId}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/png",
    cacheControl: "public,max-age=31536000",
  });
  return getDownloadURL(storageRef);
}

async function loadQuotes() {
  setQuoteStatus("Memuat quotes dari Firestore...");
  const snap = await getDoc(quoteDocRef());
  if (!snap.exists()) {
    draftQuotes = { configVersion: "1.0.0", quotes: sampleQuotes() };
    refreshQuotePreview();
    setQuoteStatus("Belum ada dokumen — contoh quotes diisi di draft. Klik Publish quotes.", "ok");
    return;
  }

  const data = snap.data() || {};
  draftQuotes = {
    configVersion: data.configVersion || "1.0.0",
    quotes: Array.isArray(data.quotes)
      ? data.quotes.map((q) => ({
          id: q.id || "",
          category: normalizeCategory(q.category),
          textEn: q.textEn || "",
          textId: q.textId || "",
          iconUrl: q.iconUrl || "",
        }))
      : [],
  };
  if (!draftQuotes.quotes.length) {
    draftQuotes.quotes = sampleQuotes();
    refreshQuotePreview();
    setQuoteStatus("Dokumen kosong — contoh quotes diisi di draft. Klik Publish quotes.", "ok");
    return;
  }
  refreshQuotePreview();
  setQuoteStatus(`Loaded quotes v${draftQuotes.configVersion} (${draftQuotes.quotes.length})`, "ok");
}

async function publishQuotes() {
  draftQuotes.configVersion = (quoteConfigVersionInput?.value || "1.0.0").trim();
  const payload = {
    ...buildQuotePayload(),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email || null,
  };
  quotePublishBtn.disabled = true;
  setQuoteStatus("Publishing quotes...");
  try {
    await setDoc(quoteDocRef(), payload, { merge: false });
    refreshQuotePreview();
    setQuoteStatus("Published ke quotes_cms/current", "ok");
  } catch (error) {
    console.error(error);
    setQuoteStatus(error.message || "Gagal publish quotes", "err");
  } finally {
    quotePublishBtn.disabled = false;
  }
}

async function saveQuote(event) {
  event.preventDefault();
  setQuoteFormError("");

  const textEn = quoteTextEn.value.trim();
  const textId = quoteTextId.value.trim();
  if (!textEn || !textId) {
    setQuoteFormError("Teks English dan Indonesia wajib diisi.");
    return;
  }

  let id = quoteIdInput.value.trim() || editingQuoteId || slugId(textEn);
  id = id.replace(/[^A-Za-z0-9_\-]/g, "_");
  if (!id) {
    setQuoteFormError("Quote ID tidak valid.");
    return;
  }

  const category = normalizeCategory(quoteCategorySelect?.value);
  const existing = draftQuotes.quotes.find((q) => q.id === id);

  quoteSaveBtn.disabled = true;
  try {
    let iconUrl = existing?.iconUrl || "";
    if (pendingIcon) {
      setQuoteStatus(`Upload icon ${id}...`);
      iconUrl = await uploadQuoteIcon(id, pendingIcon);
    }

    const item = { id, category, textEn, textId, iconUrl };
    const idx = draftQuotes.quotes.findIndex((q) => q.id === id);
    if (idx === -1) draftQuotes.quotes.push(item);
    else draftQuotes.quotes[idx] = item;

    refreshQuotePreview();
    resetQuoteForm();
    setQuoteStatus(`Quote ${id} (${category}) di draft. Klik Publish quotes.`, "ok");
  } catch (error) {
    console.error(error);
    setQuoteFormError(error.message || "Gagal simpan quote");
    setQuoteStatus(error.message || "Gagal simpan quote", "err");
  } finally {
    quoteSaveBtn.disabled = false;
  }
}

async function deleteQuote(id) {
  if (!window.confirm(`Hapus quote ${id}?`)) return;
  const item = draftQuotes.quotes.find((q) => q.id === id);
  draftQuotes.quotes = draftQuotes.quotes.filter((q) => q.id !== id);

  if (item?.iconUrl) {
    try {
      const pathMatch = decodeURIComponent(item.iconUrl).match(/\/o\/([^?]+)/);
      if (pathMatch?.[1]) await deleteObject(ref(storage, pathMatch[1]));
    } catch (error) {
      console.warn("Quote icon delete skipped:", error);
    }
  }

  if (editingQuoteId === id) resetQuoteForm();
  refreshQuotePreview();
  setQuoteStatus(`${id} dihapus dari draft. Publish untuk apply.`, "ok");
}

function editQuote(id) {
  const item = draftQuotes.quotes.find((q) => q.id === id);
  if (!item) return;
  editingQuoteId = id;
  pendingIcon = null;
  quoteIdInput.value = item.id;
  if (quoteCategorySelect) quoteCategorySelect.value = normalizeCategory(item.category);
  quoteTextEn.value = item.textEn || "";
  quoteTextId.value = item.textId || "";
  if (item.iconUrl) {
    quoteIconPreview.src = item.iconUrl;
    quoteIconPreview.hidden = false;
    quotePreviewPlaceholder.hidden = true;
  } else {
    quoteIconPreview.hidden = true;
    quotePreviewPlaceholder.hidden = false;
  }
  quoteSaveBtn.textContent = "Update draft";
}

function seedSampleQuotes() {
  const samples = sampleQuotes();
  let added = 0;
  for (const sample of samples) {
    if (draftQuotes.quotes.some((q) => q.id === sample.id)) continue;
    draftQuotes.quotes.push({ ...sample });
    added += 1;
  }
  refreshQuotePreview();
  setQuoteStatus(
    added > 0
      ? `${added} contoh ditambahkan ke draft. Klik Publish quotes.`
      : "Contoh sudah ada di draft.",
    "ok"
  );
}

function setPendingIcon(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) {
    setQuoteFormError("File icon harus PNG / WebP / JPG.");
    return;
  }
  pendingIcon = file;
  setQuoteFormError("");
  const url = URL.createObjectURL(file);
  quoteIconPreview.src = url;
  quoteIconPreview.hidden = false;
  quotePreviewPlaceholder.hidden = true;
}

function wireTabs() {
  const tabs = document.querySelectorAll(".cms-tab");
  const tabEmoticons = document.getElementById("tab-emoticons");
  const tabQuotes = document.getElementById("tab-quotes");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.getAttribute("data-tab");
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      if (tabEmoticons) tabEmoticons.hidden = name !== "emoticons";
      if (tabQuotes) tabQuotes.hidden = name !== "quotes";
      if (name === "quotes" && auth.currentUser) {
        loadQuotes().catch((e) => setQuoteStatus(e.message || "Gagal load", "err"));
      }
    });
  });
}

function wireQuoteUi() {
  if (!quoteForm) return;

  quoteForm.addEventListener("submit", saveQuote);
  quoteResetBtn?.addEventListener("click", resetQuoteForm);
  quotePublishBtn?.addEventListener("click", () => publishQuotes());
  quoteReloadBtn?.addEventListener("click", () => {
    loadQuotes().catch((e) => setQuoteStatus(e.message || "Gagal reload", "err"));
  });
  quoteSeedBtn?.addEventListener("click", () => seedSampleQuotes());
  quoteConfigVersionInput?.addEventListener("change", () => {
    draftQuotes.configVersion = quoteConfigVersionInput.value.trim() || "1.0.0";
    refreshQuotePreview();
  });

  quoteDropZone?.addEventListener("click", () => quoteIconFile?.click());
  quoteIconFile?.addEventListener("change", () => {
    const file = quoteIconFile.files?.[0];
    if (file) setPendingIcon(file);
  });
  quoteDropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    quoteDropZone.classList.add("is-dragover");
  });
  quoteDropZone?.addEventListener("dragleave", () => quoteDropZone.classList.remove("is-dragover"));
  quoteDropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    quoteDropZone.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) setPendingIcon(file);
  });

  quoteList?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-act]");
    if (!btn) return;
    const card = btn.closest(".emo-card");
    const id = card?.getAttribute("data-id");
    if (!id) return;
    if (btn.getAttribute("data-act") === "edit") editQuote(id);
    if (btn.getAttribute("data-act") === "delete") deleteQuote(id);
  });
}

wireTabs();
wireQuoteUi();
refreshQuotePreview();

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadQuotes().catch((e) => {
      console.error(e);
      setQuoteStatus(e.message || "Gagal load quotes", "err");
    });
  } else {
    draftQuotes = { configVersion: "1.0.0", quotes: [] };
    resetQuoteForm();
    refreshQuotePreview();
    setQuoteStatus("Login dulu untuk load & publish quotes.", "");
  }
});
