# AMAR DOKAN PRO — setup summary (English)

1. **Firebase**: create a project → enable *Authentication → Google* → create *Firestore* (production mode) → paste `firestore.rules` into *Rules* and publish → add composite index `sales (createdBy ASC, date ASC)` → register a *Web app* and put its config into `web/firebase-config.js` → add an *Android app* with package `com.amardokan.pro` and SHA-1 `CB:4D:E3:BE:72:A0:2D:1E:AD:13:0E:BE:23:6F:00:7D:AD:D5:F5:79` (the bundled fixed debug keystore) → copy the **Web client ID** from *Authentication → Sign-in method → Google*.
2. **GitHub**: create a repo and either (A) push the extracted files to `main`, or (B) upload `amar-dokan-pro.zip` to the repo root and add `.github/workflows/build-from-zip.yml` (copy of the provided file) via the GitHub web UI.
3. **Secrets** (Settings → Secrets and variables → Actions): `GOOGLE_WEB_CLIENT_ID` (required), `FIREBASE_CONFIG_JS` (optional: whole content of `web/firebase-config.js`).
4. **Build**: push to `main` (or *Actions → Run workflow*) → download artifact `AmarDokanPro-debug-apk` → install on the phone → sign in with Google → name your shop (you become *Owner*).

Notes: roles are enforced by `firestore.rules` (server side). Purchase costs live in separate collections (`productCosts`, `saleCosts`) that employees cannot read. Profit always uses the actual selling price. See the Bengali `README.md` for details and troubleshooting.
