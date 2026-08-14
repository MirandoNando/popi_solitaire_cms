# Popi Solitaire CMS

Browser CMS untuk upload sprite emoticon ke Firebase Storage dan publish config ke Firestore, siap dikonsumsi Unity (`EmoticonCMSConfig`).

## Live URL (GitHub Pages)

Setelah Pages aktif:

`https://mirandonando.github.io/popi_solitaire_cms/`

## Fitur

- Login admin (Firebase Auth Email/Password)
- Drag & drop **multiple** gambar sekaligus
- `emoticonId` otomatis dari nama file jika field ID dikosongkan (multi-file selalu pakai nama file)
- Upload gambar → Storage path `emoticons/{emoticonId}.{ext}`
- Draft list emoticon + Publish ke Firestore `emoticon_cms/current`
- JSON output cocok dengan Unity:

```json
{
  "configVersion": "1.0.0",
  "activeEmoticons": [
    {
      "emoticonId": "emo_smile",
      "spriteUrl": "https://...",
      "hexColorCode": "#FFCC00"
    }
  ]
}
```

## Setup sekali

### 1. GitHub Pages

Repo → **Settings → Pages**:

- Source: **Deploy from a branch**
- Branch: `main` / folder `/ (root)`
- Save

### 2. Firebase Auth

Console → **Authentication → Sign-in method** → enable **Email/Password**.

Buat 1 user admin (Authentication → Users → Add user).

**Authorized domains** tambahkan:

- `mirandonando.github.io`
- `localhost` (untuk test lokal)

### 3. Firestore + Storage rules

Di Firebase Console:

- Firestore → Rules → paste isi `firestore.rules` → Publish
- Storage → Rules → paste isi `storage.rules` → Publish

Pastikan Firestore database dan Storage bucket sudah dibuat.

### 4. CORS Storage (wajib untuk GitHub Pages)

Upload dari browser (`mirandonando.github.io`) akan kena **CORS error** kalau belum di-set.

Login Google Cloud dengan akun **owner** project `popi-solitaire`, lalu:

```bash
cd popi_solitaire_cms
gcloud auth login
gcloud config set project popi-solitaire

# Cek nama bucket (biasanya salah satu ini)
gcloud storage buckets list

# Set CORS (ganti bucket jika beda)
gsutil cors set cors.json gs://popi-solitaire.firebasestorage.app

# Verifikasi
gsutil cors get gs://popi-solitaire.firebasestorage.app
```

Kalau bucket-nya `popi-solitaire.appspot.com`, pakai path itu.

Setelah CORS OK, hard refresh CMS lalu upload lagi.

### 5. Test

1. Buka URL Pages
2. Login dengan akun admin
3. Upload emoticon → **Publish ke Firebase**
4. Cek dokumen `emoticon_cms/current` di Firestore

## Local preview

Dari folder repo:

```bash
python3 -m http.server 8080
```

Buka `http://localhost:8080` (butuh authorized domain `localhost`).

## Events / Quest (tab Events)

Publish config ke Firestore `events_cms/current`. Unity akan baca untuk float quest di Home.

### Field event

| Field | Keterangan |
|-------|------------|
| `startAt` / `endAt` | Jadwal event (ISO 8601) |
| `imageUrl` | Banner float (Storage `events/{id}.png`) |
| `titleEn` / `titleId` | Judul event |
| `descriptionEn` / `descriptionId` | Deskripsi singkat |
| `objectiveDetailEn` / `objectiveDetailId` | Detail cara objective dihitung |
| `objective.kind` | Tipe quest (lihat daftar di bawah) |
| `objective.target` | Target angka |
| `reward` | `points` / `score` / `lives` / `hints` / `title` / `none` |
| `enabled` | Aktif/nonaktif |
| `sortOrder` | Urutan tampil |

### Tipe objective (Unity)

| `kind` | Arti |
|--------|------|
| `play_hours` | Main berapa jam (waktu foreground saat event aktif) |
| `play_minutes` | Main berapa menit |
| `win_levels` | Menang X level |
| `play_levels` | Main X level |
| `total_score` | Total score akumulasi event |
| `reach_score_single` | Score dalam 1 level |
| `reach_combo` | Capai combo X |
| `total_matches` | Total match |
| `complete_objective` | Selesaikan in-level objective |
| `happy_mood_level` | Capai mood happy |
| `match_bomb` | Match bomb tile |
| `reach_level` | Capai level campaign |
| `read_daily_quote` | Baca daily quote |
| `login_days` | Login harian (streak) |
| `share_game` | Share game |

### Backend Firestore (Unity tulis)

- **Progress live (agregat):** `event_progress_users/{uid}` — map `events` + `joinedEventIds`, flush ~10 detik dari game
- **Legacy:** `event_progress/{eventId}/users/{uid}` (CMS masih baca sebagai fallback)
- **Pemenang (list admin CMS):** `event_completions/{eventId}/users/{uid}`

CMS tab Events → bagian **User yang berhasil objective** membaca collection completions.

Deploy rules terbaru:

```bash
firebase deploy --only firestore:rules,storage
```

## Unity

Game cukup fetch dokumen `emoticon_cms/current` (Firestore SDK) atau REST JSON, lalu:

```csharp
EmoticonDataManager.Instance.LoadDataFromCloud(jsonContent);
```

Field yang dipakai:

| Field | C# |
|-------|-----|
| `configVersion` | `EmoticonCMSConfig.configVersion` |
| `activeEmoticons[].emoticonId` | `EmoticonData.emoticonId` |
| `activeEmoticons[].spriteUrl` | `EmoticonData.spriteUrl` |
| `activeEmoticons[].hexColorCode` | `EmoticonData.hexColorCode` |

## Security note

Web config Firebase di `app.js` memang untuk client. Proteksi utama ada di Auth + Security Rules (write hanya user login).
