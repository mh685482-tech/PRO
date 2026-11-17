# AMAR DOKAN PRO — আমার দোকান প্রো

বাংলা ও ইংরেজি ভাষার শপ ম্যানেজমেন্ট অ্যাপ (POS, ইনভেন্টরি, কাস্টমার বাকি, ক্যাশ/bKash/Nagad/Rocket/Upay অ্যাকাউন্ট, রিপোর্ট, লাভ-ক্ষতি, ইউজার রোল)।
Firebase Authentication + Cloud Firestore দিয়ে লগইন ও ক্লাউড সিঙ্ক। GitHub Actions নিজে থেকে APK বানায়।

> English summary is at the bottom: [README_EN](README_EN.md)

---

## প্রজেক্টের ফাইল

| ফাইল / ফোল্ডার | কাজ |
|---|---|
| `web/index.html`, `web/styles.css`, `web/app.js` | পুরো অ্যাপ (ব্রাউজারেও চলে, Android WebView-তেও চলে) |
| `web/firebase-config.js` | **আপনার Firebase Web কনফিগ এখানে বসাবেন** |
| `firestore.rules` | Firestore সিকিউরিটি রুলস (রোল/পারমিশন ব্যাকএন্ডে বাধ্যতামূলক) |
| `firestore.indexes.json` | প্রয়োজনীয় ইনডেক্স |
| `app/` | Android প্রজেক্ট (`MainActivity.kt`, `AndroidManifest.xml`, `build.gradle`, আইকন) |
| `build.gradle`, `settings.gradle`, `gradlew` | Gradle কনফিগারেশন |
| `.github/workflows/android-build.yml` | `main`-এ push করলেই debug APK বানায় |
| `.github/workflows/build-from-zip.yml` | ZIP ফাইল আপলোড করলে নিজে খুলে APK বানায় |

---

## ধাপ ১ — Firebase সেটআপ (একবারই)

1. <https://console.firebase.google.com> → **Add project** → নাম দিন (যেমন `amar-dokan-pro`) → Create।
2. **Build → Authentication → Get started → Sign-in method → Google → Enable** → আপনার ইমেইল দিয়ে Save।
3. **Build → Firestore Database → Create database** → **Production mode** → লোকেশন `asia-south1` (মুম্বাই) বা `asia-southeast1` (সিঙ্গাপুর) → Enable।
4. **Rules**: Firestore → **Rules** ট্যাবে সব মুছে এই প্রজেক্টের `firestore.rules` ফাইলের পুরো লেখা পেস্ট করুন → **Publish**।
   *(এটা না করলে সবকিছু `permission-denied` দেখাবে।)*
5. **Index**: Firestore → **Indexes → Composite → Add index**
   Collection ID: `sales` · Query scope: *Collection* · Fields: `createdBy` (Ascending), `date` (Ascending) → Create।
   *(এমপ্লয়ির নিজের বিক্রি দেখার জন্য দরকার। না করলে অ্যাপে console-এ লিংক সহ error আসবে, সেই লিংকে ক্লিক করলেও হয়।)*
6. **Project settings (⚙) → General → Your apps → Web (`</>`)** → নাম দিয়ে Register →
   `firebaseConfig` এর মানগুলো `web/firebase-config.js` ফাইলে বসান।
   > এই মানগুলো গোপন চাবি নয় (প্রতিটি Firebase ওয়েব অ্যাপে থাকে)। ডেটা সুরক্ষিত থাকে Authentication + `firestore.rules` দিয়ে। **কখনও service-account / admin private key এখানে রাখবেন না।**
7. **Android অ্যাপ যোগ করুন** (Google লগইনের জন্য জরুরি):
   Project settings → Your apps → **Add app → Android**
   - Package name: `com.amardokan.pro`
   - **Debug signing certificate SHA-1:** `CB:4D:E3:BE:72:A0:2D:1E:AD:13:0E:BE:23:6F:00:7D:AD:D5:F5:79`
     *(এই প্রজেক্টে একটি স্থায়ী debug keystore দেওয়া আছে, তাই GitHub থেকে প্রতিবার বানানো APK-র SHA-1 একই থাকে।)*
   - `google-services.json` ডাউনলোড করার দরকার নেই — Skip/Next করুন।
8. **Web client ID নিন:** Authentication → Sign-in method → Google → **Web SDK configuration → Web client ID** (দেখতে `123456-abc.apps.googleusercontent.com`) কপি করুন। এটি ধাপ ২-এ GitHub Secret হবে।

---

## ধাপ ২ — GitHub-এ আপলোড ও APK বানানো

### পদ্ধতি A — ফাইল খুলে আপলোড (কম্পিউটার হলে সহজ)
1. <https://github.com/new> → নতুন repository খুলুন (Private রাখাই ভালো)।
2. ZIP **Extract** করে ভেতরের সব ফাইল (লুকানো `.github` ফোল্ডারসহ) repository-তে `main` ব্রাঞ্চে আপলোড করুন
   (GitHub Desktop / `git push`, অথবা ওয়েবে *Add file → Upload files*)।
3. নিচের **Secrets** যোগ করুন, তারপর `main`-এ আবার একটি commit করুন বা **Actions → Android Build → Run workflow** চাপুন।

### পদ্ধতি B — শুধু ZIP আপলোড (মোবাইল থেকেও করা যায়)
1. নতুন repository খুলুন (**Add a README** চেক করে দিলে `main` ব্রাঞ্চ তৈরি হয়ে যাবে)।
2. **Add file → Upload files** → `amar-dokan-pro.zip` ফাইলটি **repository-র রুটে** আপলোড করুন → Commit।
3. **Add file → Create new file** → ফাইলের নাম লিখুন: `.github/workflows/build-from-zip.yml`
   → এই ZIP-এর সাথে দেওয়া `build-from-zip.yml` ফাইলের পুরো লেখা কপি করে পেস্ট করুন → Commit।
   *(GitHub ZIP-এর ভেতরের workflow নিজে চালায় না; তাই এই একটি ফাইল repository-তে আলাদা থাকতে হবে।)*
4. নিচের **Secrets** যোগ করুন।
5. **Actions → Build APK from uploaded ZIP → Run workflow**। এটি ZIP নিজে খুলে APK বানাবে।

### Secrets যোগ করা
Repository → **Settings → Secrets and variables → Actions → New repository secret**

| Secret নাম | মান | বাধ্যতামূলক? |
|---|---|---|
| `GOOGLE_WEB_CLIENT_ID` | ধাপ ১-এর (৮) Web client ID | **হ্যাঁ** (অ্যাপের ভেতরে Google লগইনের জন্য) |
| `FIREBASE_CONFIG_JS` | `web/firebase-config.js` ফাইলের পুরো লেখা (`export const firebaseConfig = {...};`) | না — repository-তে ফাইলে বসালে লাগে না; কনফিগ repo-র বাইরে রাখতে চাইলে ব্যবহার করুন |

### APK ডাউনলোড ও ইনস্টল
1. **Actions** ট্যাব → সবুজ ✔ হওয়া সর্বশেষ run → নিচে **Artifacts → `AmarDokanPro-debug-apk`** ডাউনলোড (ZIP আসবে, ভেতরে `app-debug.apk`)।
2. ফোনে APK খুলে ইনস্টল করুন (প্রথমবার "Install unknown apps" অনুমতি দিতে হবে)।
3. Google দিয়ে লগইন করুন → দোকানের নাম দিন → আপনি **Owner** হবেন।

---

## অ্যাপ ব্যবহার

- **প্রথম লগইন** → দোকান তৈরি → ৭টি অ্যাকাউন্ট (Cash, bKash Agent/Personal, Nagad Agent/Personal, Rocket, Upay) নিজে তৈরি হয়। **ক্যাশ ও অ্যাকাউন্ট → ডিপোজিট/অ্যাডজাস্টমেন্ট** দিয়ে শুরুর ব্যালেন্স বসান, বা নতুন অ্যাকাউন্ট যোগ করার সময় Opening Balance দিন।
- **কর্মী যোগ:** ব্যবহারকারী → *নতুন ইনভাইট* → কর্মীর Gmail + রোল (Manager/Employee) + পারমিশন দিন। কর্মী ঐ Gmail দিয়ে লগইন করলে ইনভাইট Accept করে যুক্ত হবে। মালিক যেকোনো সময় পারমিশন বদলাতে বা সরাতে পারেন।
- **POS:** পণ্য ট্যাপ → প্রতিটি পণ্যের **বিক্রয় মূল্য বদলানো যায়** → পেমেন্ট (Cash/bKash/Nagad/Rocket/Upay/বাকি, ভাগ করেও দেওয়া যায়) → রসিদ প্রিন্ট/শেয়ার।
  **লাভ = আসল বিক্রয় মূল্য − ক্রয়মূল্য** (তালিকা মূল্য দিয়ে কখনও নয়)।
- **ট্রান্সফার** দুই অ্যাকাউন্টে মিলে একটিই লেনদেন গ্রুপ; রিপোর্টে আয়/ব্যয়ে গণনা হয় না, তাই দ্বিগুণ হিসাব হয় না। ফি আলাদা "চার্জ" হিসেবে যায়।
- **ব্যাকআপ/রিস্টোর:** সেটিংস → ব্যাকআপ (JSON ডাউনলোড / আপলোড করে রিস্টোর)। **ব্যালেন্স পুনর্গণনা** টুল সব লেনদেন যোগ করে ব্যালেন্স মিলিয়ে দেয়।
- অফলাইনে কাজ চলে; ইন্টারনেট এলে নিজে সিঙ্ক হয়। একাধিক ডিভাইসে একই Gmail বা কর্মীর Gmail দিয়ে লগইন করলে একই ডেটা পাওয়া যায়।

---

## নিরাপত্তা কীভাবে কাজ করে

- সব পারমিশন `firestore.rules`-এ **সার্ভার সাইডে** যাচাই হয়, শুধু বাটন লুকিয়ে নয়।
- ক্রয়মূল্য আলাদা কালেকশনে (`productCosts`, `saleCosts`) থাকে। `viewCost`/`profit` পারমিশন ছাড়া Firestore নিজেই সেগুলো পড়তে দেয় না — কর্মী নেটওয়ার্ক থেকেও দেখতে পারবে না।
- কর্মীর বিক্রির খরচ/লাভ কর্মী নিজে লিখতে পারে না (খরচ জানে না)। মালিক/ম্যানেজারের ডিভাইসে অ্যাপ খোলা থাকলে সেগুলো **নিজে থেকে** হিসাব হয়ে যায় (তখনকার ক্রয়মূল্য ধরে)। ড্যাশবোর্ডে "খরচ হিসাব বাকি" দেখায়।
- কর্মী ডিফল্টে শুধু নিজের করা বিক্রি দেখতে পায় (`viewAllSales` পারমিশন দিলে সবগুলো)।
- ইনপুট ভ্যালিডেশন অ্যাপে এবং রুলসে দুই জায়গাতেই আছে।

## সীমাবদ্ধতা (সৎভাবে)

- এখানে (আমার পরীক্ষার পরিবেশে) নেটওয়ার্ক বন্ধ থাকায় **Android SDK দিয়ে APK কম্পাইল করা যায়নি** এবং **Firebase Emulator-এ রুলস চালানো যায়নি**। ওয়েব অ্যাপের পুরো লজিক ব্রাউজারে সিমুলেটেড Firestore দিয়ে পরীক্ষা করা হয়েছে (বিক্রি, লাভ, ব্যালেন্স, বাকি, রোল-ভিত্তিক মেনু ইত্যাদি)। প্রথম GitHub build-এ কোনো ত্রুটি এলে **Actions → ব্যর্থ run → লগ** আমাকে পাঠান, ঠিক করে দেব।
- Firebase-এ Cloud Functions ছাড়া শুধু রুলস দিয়ে করা হয়েছে (বিনামূল্যের Spark প্ল্যানে চলে)।
- লোগো/ব্যাকগ্রাউন্ড ছবি ছোট করে (≈ 300KB) Firestore ডকুমেন্টে রাখা হয়; Firebase Storage লাগে না।
- Android-এ প্রিন্ট সিস্টেমের Print/Save as PDF সার্ভিস ব্যবহার করে।

## সমস্যা হলে

| সমস্যা | সমাধান |
|---|---|
| অ্যাপে "Firebase সেটআপ হয়নি" | `web/firebase-config.js`-এ `REPLACE_ME` বদলে আসল মান দিন (বা `FIREBASE_CONFIG_JS` secret) |
| Google লগইনে error / `12500` / `10` | ধাপ ১ (৭): package নাম ও SHA-1 ঠিক আছে কিনা; `GOOGLE_WEB_CLIENT_ID` secret ঠিক কিনা; Secret বদলালে নতুন করে build করুন |
| ব্রাউজারে `unauthorized-domain` | Authentication → Settings → **Authorized domains**-এ আপনার ডোমেইন যোগ করুন |
| `permission-denied` | `firestore.rules` Publish হয়েছে কিনা দেখুন |
| Build ফেল | Actions → ব্যর্থ run → লাল ধাপের লগ দেখুন |

## লোকালি চালানো (ঐচ্ছিক)
`web` ফোল্ডারে যেকোনো স্ট্যাটিক সার্ভার চালান (`python3 -m http.server 8080`) → <http://localhost:8080>। `localhost` Firebase-এ ডিফল্ট Authorized।
