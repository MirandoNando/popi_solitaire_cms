import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
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

const CONFIG_PATH = { collection: "emoticon_cms", docId: "current" };
const STORAGE_PREFIX = "emoticons";
const IMAGE_TYPES = new Set(["image/png", "image/webp", "image/jpeg", "image/jpg"]);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const userEmail = document.getElementById("user-email");
const configVersionInput = document.getElementById("config-version");
const publishBtn = document.getElementById("publish-btn");
const reloadBtn = document.getElementById("reload-btn");
const statusMsg = document.getElementById("status-msg");
const jsonPreview = document.getElementById("json-preview");
const emoticonForm = document.getElementById("emoticon-form");
const emoticonIdInput = document.getElementById("emoticon-id");
const hexColorInput = document.getElementById("hex-color");
const spriteFileInput = document.getElementById("sprite-file");
const dropZone = document.getElementById("drop-zone");
const fileQueueEl = document.getElementById("file-queue");
const spritePreview = document.getElementById("sprite-preview");
const previewPlaceholder = document.getElementById("preview-placeholder");
const saveEmoticonBtn = document.getElementById("save-emoticon-btn");
const resetFormBtn = document.getElementById("reset-form-btn");
const formError = document.getElementById("form-error");
const emoticonList = document.getElementById("emoticon-list");
const emoticonCount = document.getElementById("emoticon-count");

/** @type {{ configVersion: string, activeEmoticons: Array<{emoticonId: string, spriteUrl: string, hexColorCode: string}> }} */
let draftConfig = {
  configVersion: "1.0.0",
  activeEmoticons: [],
};

let editingId = null;
/** @type {File[]} */
let pendingFiles = [];

function setStatus(message, type = "") {
  statusMsg.textContent = message;
  statusMsg.className = `status ${type}`.trim();
}

function setFormError(message) {
  if (!message) {
    formError.hidden = true;
    formError.textContent = "";
    return;
  }
  formError.hidden = false;
  formError.textContent = message;
}

function configDocRef() {
  return doc(db, CONFIG_PATH.collection, CONFIG_PATH.docId);
}

function buildUnityPayload() {
  return {
    configVersion: draftConfig.configVersion || "1.0.0",
    activeEmoticons: draftConfig.activeEmoticons.map((item) => ({
      emoticonId: item.emoticonId,
      spriteUrl: item.spriteUrl,
      hexColorCode: item.hexColorCode || "",
    })),
  };
}

function refreshPreview() {
  const payload = buildUnityPayload();
  configVersionInput.value = payload.configVersion;
  jsonPreview.textContent = JSON.stringify(payload, null, 2);
  emoticonCount.textContent = `${payload.activeEmoticons.length} item`;
  renderList();
}

function renderList() {
  const items = draftConfig.activeEmoticons;
  if (!items.length) {
    emoticonList.innerHTML = `<div class="empty-state">Belum ada emoticon. Drag & drop sprite di form atas.</div>`;
    return;
  }

  emoticonList.innerHTML = items
    .map(
      (item) => `
      <article class="emoticon-card" data-id="${escapeHtml(item.emoticonId)}">
        <img src="${escapeAttr(item.spriteUrl)}" alt="${escapeAttr(item.emoticonId)}" loading="lazy" />
        <div>
          <h3>${escapeHtml(item.emoticonId)}</h3>
          <p class="emoticon-meta">${escapeHtml(item.hexColorCode || "—")}</p>
        </div>
        <div class="emoticon-actions">
          <button type="button" class="btn ghost" data-action="edit">Edit</button>
          <button type="button" class="btn danger" data-action="delete">Hapus</button>
        </div>
      </article>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

/** Convert filename to valid emoticonId, e.g. "Emo Smile.PNG" -> "emo_smile" */
function idFromFilename(filename) {
  const base = String(filename).replace(/\.[^.]+$/, "");
  const cleaned = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned;
}

function isImageFile(file) {
  if (!file) return false;
  if (file.type && IMAGE_TYPES.has(file.type)) return true;
  return /\.(png|jpe?g|webp)$/i.test(file.name || "");
}

function uniqueId(baseId, usedIds) {
  if (!usedIds.has(baseId)) return baseId;
  let i = 2;
  while (usedIds.has(`${baseId}_${i}`)) i += 1;
  return `${baseId}_${i}`;
}

function resolveIdForFile(file, overrideId, usedIds) {
  const fromName = idFromFilename(file.name);
  const preferred = (overrideId || fromName || "emoticon").trim();
  if (!/^[A-Za-z0-9_\-]+$/.test(preferred)) {
    throw new Error(`ID tidak valid dari file "${file.name}". Rename file atau isi ID manual.`);
  }
  const finalId = uniqueId(preferred, usedIds);
  usedIds.add(finalId);
  return finalId;
}

function resetForm() {
  editingId = null;
  pendingFiles = [];
  emoticonForm.reset();
  hexColorInput.value = "#FFCC00";
  spritePreview.hidden = true;
  spritePreview.removeAttribute("src");
  previewPlaceholder.hidden = false;
  fileQueueEl.hidden = true;
  fileQueueEl.innerHTML = "";
  setFormError("");
  saveEmoticonBtn.textContent = "Upload & simpan";
  emoticonIdInput.disabled = false;
  dropZone.classList.remove("dragover");
}

function fillForm(item) {
  editingId = item.emoticonId;
  emoticonIdInput.value = item.emoticonId;
  emoticonIdInput.disabled = true;
  hexColorInput.value = item.hexColorCode || "#FFCC00";
  pendingFiles = [];
  spriteFileInput.value = "";
  fileQueueEl.hidden = true;
  fileQueueEl.innerHTML = "";
  if (item.spriteUrl) {
    spritePreview.src = item.spriteUrl;
    spritePreview.hidden = false;
    previewPlaceholder.hidden = true;
  }
  saveEmoticonBtn.textContent = "Update emoticon";
  setFormError("");
}

function previewQueueIds() {
  const overrideId = emoticonIdInput.value.trim();
  const usedIds = new Set(draftConfig.activeEmoticons.map((item) => item.emoticonId));
  if (editingId) usedIds.delete(editingId);

  return pendingFiles.map((file) => {
    try {
      if (editingId && pendingFiles.length === 1) return editingId;
      const manual = pendingFiles.length === 1 ? overrideId : "";
      return resolveIdForFile(file, manual, usedIds);
    } catch {
      return "(rename file)";
    }
  });
}

function renderFileQueue() {
  if (!pendingFiles.length) {
    fileQueueEl.hidden = true;
    fileQueueEl.innerHTML = "";
    spritePreview.hidden = true;
    spritePreview.removeAttribute("src");
    previewPlaceholder.hidden = false;
    return;
  }

  const ids = previewQueueIds();
  fileQueueEl.hidden = false;
  fileQueueEl.innerHTML = pendingFiles
    .map(
      (file, index) =>
        `<div class="file-queue-item"><strong>${escapeHtml(ids[index])}</strong><span>${escapeHtml(file.name)}</span></div>`
    )
    .join("");

  const url = URL.createObjectURL(pendingFiles[0]);
  spritePreview.src = url;
  spritePreview.hidden = false;
  previewPlaceholder.hidden = true;
}

function setPendingFiles(fileList) {
  const images = Array.from(fileList || []).filter(isImageFile);
  if (!images.length) {
    setFormError("Tidak ada file gambar yang valid (PNG / WebP / JPG).");
    return;
  }

  if (editingId && images.length > 1) {
    setFormError("Mode edit hanya menerima 1 file. Lepas edit dulu untuk multi-upload.");
    return;
  }

  setFormError("");
  pendingFiles = images;
  renderFileQueue();

  // Single file: auto-fill ID from filename when field empty and not editing
  if (!editingId && pendingFiles.length === 1 && !emoticonIdInput.value.trim()) {
    emoticonIdInput.placeholder = idFromFilename(pendingFiles[0].name) || "kosongkan = nama file";
  }
}

async function loadConfig() {
  setStatus("Memuat config dari Firestore...");
  const snap = await getDoc(configDocRef());
  if (!snap.exists()) {
    draftConfig = { configVersion: "1.0.0", activeEmoticons: [] };
    refreshPreview();
    setStatus("Belum ada dokumen. Upload emoticon lalu Publish.", "ok");
    return;
  }

  const data = snap.data() || {};
  draftConfig = {
    configVersion: data.configVersion || "1.0.0",
    activeEmoticons: Array.isArray(data.activeEmoticons) ? data.activeEmoticons : [],
  };
  refreshPreview();
  setStatus(`Loaded versi ${draftConfig.configVersion}`, "ok");
}

async function publishConfig() {
  draftConfig.configVersion = (configVersionInput.value || "1.0.0").trim();
  const payload = {
    ...buildUnityPayload(),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email || null,
  };

  publishBtn.disabled = true;
  setStatus("Publishing...");
  try {
    await setDoc(configDocRef(), payload, { merge: false });
    refreshPreview();
    setStatus("Published ke emoticon_cms/current", "ok");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Gagal publish", "err");
  } finally {
    publishBtn.disabled = false;
  }
}

function extensionFromFile(file) {
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "png";
  return name.slice(dot + 1).toLowerCase() || "png";
}

async function uploadSprite(emoticonId, file) {
  const ext = extensionFromFile(file);
  const path = `${STORAGE_PREFIX}/${emoticonId}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/png",
    cacheControl: "public,max-age=31536000",
  });
  return getDownloadURL(storageRef);
}

function upsertEmoticon(item) {
  const index = draftConfig.activeEmoticons.findIndex((entry) => entry.emoticonId === item.emoticonId);
  if (index === -1) draftConfig.activeEmoticons.push(item);
  else draftConfig.activeEmoticons[index] = item;
}

async function saveEmoticon(event) {
  event.preventDefault();
  setFormError("");

  const hexColorCode = hexColorInput.value.trim();
  if (hexColorCode && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hexColorCode)) {
    setFormError("hexColorCode harus format #RGB atau #RRGGBB");
    return;
  }

  // Edit existing without replacing image
  if (editingId && pendingFiles.length === 0) {
    const index = draftConfig.activeEmoticons.findIndex((item) => item.emoticonId === editingId);
    if (index === -1) {
      setFormError("Item edit tidak ditemukan.");
      return;
    }
    draftConfig.activeEmoticons[index] = {
      ...draftConfig.activeEmoticons[index],
      hexColorCode,
    };
    refreshPreview();
    resetForm();
    setStatus(`${editingId} diupdate di draft. Klik Publish untuk Unity.`, "ok");
    return;
  }

  if (!pendingFiles.length) {
    setFormError("Pilih atau drop minimal 1 gambar.");
    return;
  }

  const overrideId = emoticonIdInput.value.trim();
  if (pendingFiles.length === 1 && overrideId && !/^[A-Za-z0-9_\-]+$/.test(overrideId)) {
    setFormError("emoticonId hanya boleh huruf, angka, _ atau -");
    return;
  }

  if (editingId && pendingFiles.length === 1) {
    // Keep editing id; ignore filename for id
  } else if (pendingFiles.length > 1 && overrideId) {
    // Multi-upload ignores manual ID — filename wins
  }

  saveEmoticonBtn.disabled = true;
  const usedIds = new Set(draftConfig.activeEmoticons.map((item) => item.emoticonId));
  if (editingId) usedIds.delete(editingId);

  const savedIds = [];
  try {
    for (let i = 0; i < pendingFiles.length; i += 1) {
      const file = pendingFiles[i];
      let emoticonId;
      if (editingId && pendingFiles.length === 1) {
        emoticonId = editingId;
      } else {
        const manual = pendingFiles.length === 1 ? overrideId : "";
        emoticonId = resolveIdForFile(file, manual, usedIds);
      }

      setStatus(`Upload ${i + 1}/${pendingFiles.length}: ${emoticonId}...`);
      const spriteUrl = await uploadSprite(emoticonId, file);
      upsertEmoticon({ emoticonId, spriteUrl, hexColorCode });
      savedIds.push(emoticonId);
    }

    refreshPreview();
    resetForm();
    setStatus(
      `${savedIds.length} emoticon disimpan di draft (${savedIds.join(", ")}). Klik Publish untuk Unity.`,
      "ok"
    );
  } catch (error) {
    console.error(error);
    setFormError(error.message || "Gagal menyimpan emoticon");
    setStatus(error.message || "Gagal upload", "err");
    refreshPreview();
  } finally {
    saveEmoticonBtn.disabled = false;
  }
}

async function deleteEmoticon(emoticonId) {
  const confirmed = window.confirm(`Hapus ${emoticonId} dari draft?`);
  if (!confirmed) return;

  const item = draftConfig.activeEmoticons.find((entry) => entry.emoticonId === emoticonId);
  draftConfig.activeEmoticons = draftConfig.activeEmoticons.filter(
    (entry) => entry.emoticonId !== emoticonId
  );

  if (item?.spriteUrl) {
    try {
      const pathMatch = decodeURIComponent(item.spriteUrl).match(/\/o\/([^?]+)/);
      if (pathMatch?.[1]) {
        await deleteObject(ref(storage, pathMatch[1]));
      }
    } catch (error) {
      console.warn("Storage delete skipped:", error);
    }
  }

  if (editingId === emoticonId) resetForm();
  refreshPreview();
  setStatus(`${emoticonId} dihapus dari draft. Publish untuk apply.`, "ok");
}

function showApp(user) {
  loginView.hidden = true;
  appView.hidden = false;
  userEmail.textContent = user.email || user.uid;
  loadConfig().catch((error) => {
    console.error(error);
    setStatus(error.message || "Gagal load config", "err");
  });
}

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
  userEmail.textContent = "";
  draftConfig = { configVersion: "1.0.0", activeEmoticons: [] };
  refreshPreview();
  resetForm();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    loginError.hidden = false;
    loginError.textContent = error.message || "Login gagal";
  }
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

publishBtn.addEventListener("click", () => {
  publishConfig();
});

reloadBtn.addEventListener("click", () => {
  loadConfig().catch((error) => setStatus(error.message || "Gagal reload", "err"));
});

configVersionInput.addEventListener("change", () => {
  draftConfig.configVersion = configVersionInput.value.trim() || "1.0.0";
  refreshPreview();
});

emoticonForm.addEventListener("submit", saveEmoticon);
resetFormBtn.addEventListener("click", resetForm);

emoticonIdInput.addEventListener("input", () => {
  if (pendingFiles.length) renderFileQueue();
});

dropZone.addEventListener("click", () => spriteFileInput.click());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    spriteFileInput.click();
  }
});

spriteFileInput.addEventListener("change", () => {
  if (spriteFileInput.files?.length) setPendingFiles(spriteFileInput.files);
});

["dragenter", "dragover"].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "dragend"].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  dropZone.classList.remove("dragover");
  if (event.dataTransfer?.files?.length) {
    setPendingFiles(event.dataTransfer.files);
  }
});

// Prevent browser from opening dropped files outside the zone
["dragover", "drop"].forEach((type) => {
  window.addEventListener(type, (event) => {
    event.preventDefault();
  });
});

emoticonList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest(".emoticon-card");
  const id = card?.dataset.id;
  if (!id) return;

  if (button.dataset.action === "edit") {
    const item = draftConfig.activeEmoticons.find((entry) => entry.emoticonId === id);
    if (item) fillForm(item);
    return;
  }

  if (button.dataset.action === "delete") {
    deleteEmoticon(id);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) showApp(user);
  else showLogin();
});
