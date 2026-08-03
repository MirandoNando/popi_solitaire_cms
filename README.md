# Popi Solitaire CMS

Browser CMS untuk upload sprite emoticon ke Firebase Storage dan publish config ke Firestore, siap dikonsumsi Unity (`EmoticonCMSConfig`).

## Live URL (GitHub Pages)

Setelah Pages aktif:

`https://mirandonando.github.io/popi_solitaire_cms/`

## Fitur

- Login admin (Firebase Auth Email/Password)
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

### 4. Test

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
