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
let pendingFile = null;

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
    emoticonList.innerHTML = `<div class="empty-state">Belum ada emoticon. Upload sprite pertama di form atas.</div>`;
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

function resetForm() {
  editingId = null;
  pendingFile = null;
  emoticonForm.reset();
  hexColorInput.value = "#FFCC00";
  spritePreview.hidden = true;
  spritePreview.removeAttribute("src");
  previewPlaceholder.hidden = false;
  setFormError("");
  saveEmoticonBtn.textContent = "Simpan emoticon";
  emoticonIdInput.disabled = false;
}

function fillForm(item) {
  editingId = item.emoticonId;
  emoticonIdInput.value = item.emoticonId;
  emoticonIdInput.disabled = true;
  hexColorInput.value = item.hexColorCode || "#FFCC00";
  pendingFile = null;
  spriteFileInput.value = "";
  if (item.spriteUrl) {
    spritePreview.src = item.spriteUrl;
    spritePreview.hidden = false;
    previewPlaceholder.hidden = true;
  }
  saveEmoticonBtn.textContent = "Update emoticon";
  setFormError("");
}

async function loadConfig() {
  setStatus("Memuat config dari Firestore...");
  const snap = await getDoc(configDocRef());
  if (!snap.exists()) {
    draftConfig = { configVersion: "1.0.0", activeEmoticons: [] };
    refreshPreview();
    setStatus("Belum ada dokumen. Buat emoticon lalu Publish.", "ok");
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

async function saveEmoticon(event) {
  event.preventDefault();
  setFormError("");

  const emoticonId = emoticonIdInput.value.trim();
  const hexColorCode = hexColorInput.value.trim();

  if (!/^[A-Za-z0-9_\-]+$/.test(emoticonId)) {
    setFormError("emoticonId hanya boleh huruf, angka, _ atau -");
    return;
  }

  if (hexColorCode && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hexColorCode)) {
    setFormError("hexColorCode harus format #RGB atau #RRGGBB");
    return;
  }

  const existingIndex = draftConfig.activeEmoticons.findIndex(
    (item) => item.emoticonId === emoticonId
  );

  if (!editingId && existingIndex !== -1) {
    setFormError("emoticonId sudah ada. Edit item yang existing, atau pakai ID baru.");
    return;
  }

  if (!editingId && !pendingFile) {
    setFormError("Pilih file gambar untuk emoticon baru.");
    return;
  }

  saveEmoticonBtn.disabled = true;
  try {
    let spriteUrl =
      existingIndex !== -1 ? draftConfig.activeEmoticons[existingIndex].spriteUrl : "";

    if (pendingFile) {
      setStatus(`Upload ${emoticonId} ke Storage...`);
      spriteUrl = await uploadSprite(emoticonId, pendingFile);
    }

    const nextItem = { emoticonId, spriteUrl, hexColorCode };

    if (existingIndex === -1) {
      draftConfig.activeEmoticons.push(nextItem);
    } else {
      draftConfig.activeEmoticons[existingIndex] = nextItem;
    }

    // Bump patch version hint locally; user still controls final publish version.
    refreshPreview();
    resetForm();
    setStatus(`Emoticon ${emoticonId} disimpan di draft. Klik Publish untuk Unity.`, "ok");
  } catch (error) {
    console.error(error);
    setFormError(error.message || "Gagal menyimpan emoticon");
    setStatus(error.message || "Gagal upload", "err");
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

spriteFileInput.addEventListener("change", () => {
  const file = spriteFileInput.files?.[0] || null;
  pendingFile = file;
  if (!file) {
    if (!editingId) {
      spritePreview.hidden = true;
      previewPlaceholder.hidden = false;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  spritePreview.src = url;
  spritePreview.hidden = false;
  previewPlaceholder.hidden = true;
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
