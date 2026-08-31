# AZEE HARDWARE

Offline-first Plumbing Work Logger, Work Manager, Expense Tracker and Invoice
Generator. Plain HTML/CSS/JavaScript — no build step, no framework, no
network calls anywhere in the app. Everything (jsPDF included) is bundled
locally so it keeps working with the device in airplane mode.

CREDITS: BLACKMARK

## What's inside

```
index.html              App shell, splash screen, bottom navigation
css/styles.css           Full design system (dark + light themes)
js/db.js                 IndexedDB wrapper (Works, Daily Logs, Materials,
                          Expenses, Attachments, Invoices, Settings)
js/utils.js               Formatting, toasts, confirm dialogs, image helpers
js/pdf-generator.js       Multi-page invoice PDF engine (jsPDF + autotable)
js/app.js                 Router + every screen's UI and logic
vendor/                   jsPDF + jspdf-autotable, bundled locally (offline)
assets/icons/             App icons (splash + home screen icon)
manifest.json             Web app manifest (used by the APK wrapper)
```

## Try it right now

Any static file server works, e.g.:

```bash
cd azee-hardware
python3 -m http.server 8080
```

Open `http://localhost:8080` in a phone or a desktop browser resized to a
phone width. All data is stored in the browser's IndexedDB, so it survives
reloads. To reset data during testing, clear site data for the origin.

## Packing it into an APK

This is a static web app, so any WebView-based wrapper works. **Capacitor**
is the recommended path because it keeps the web code untouched and gives
you a real Android project you can build in Android Studio.

### Option A — Capacitor (recommended)

```bash
npm install @capacitor/core @capacitor/android
npx cap init "AZEE HARDWARE" "com.blackmark.azeehardware" --web-dir=.
npx cap add android
npx cap copy
npx cap open android
```

Then in Android Studio: **Build → Generate Signed Bundle / APK**, choose
APK, create/select a keystore, and build the release APK.

Notes for `capacitor.config.json` / `capacitor.config.ts`:

- `webDir` should point at this folder (the one containing `index.html`).
- No plugins are required for the app to function — everything used
  (IndexedDB, `<input type=file>`, downloads, `window.print()`,
  `navigator.share`) works inside a standard Android WebView on API 28+.
- If you want native "Share to WhatsApp/Gmail" instead of the browser share
  sheet fallback, add `@capacitor/share` and `@capacitor/filesystem` and wire
  them into the `shareBtn` handlers in `js/app.js` (currently they use the
  Web Share API `navigator.share`, which Capacitor's WebView supports on
  modern Android out of the box — the extra plugins are only needed for
  saving the PDF to a public folder before sharing).

### Option B — Cordova

```bash
npm install -g cordova
cordova create azee-app com.blackmark.azeehardware "AZEE HARDWARE"
# copy this folder's contents into azee-app/www/
cd azee-app
cordova platform add android
cordova build android
```

### Android manifest permissions

The app only needs what the WebView needs for file picking/camera capture —
Capacitor/Cordova add these automatically:

- `READ_EXTERNAL_STORAGE` / `READ_MEDIA_IMAGES` (attaching existing photos)
- `CAMERA` (only if you want in-app photo capture from `capture="environment"`)

No `INTERNET` permission is required for the app to function — it's fully
offline. If your wrapper insists on it for the WebView to load local files
correctly on some old devices, it doesn't compromise offline behaviour,
since the app never calls out to the network.

## Data storage

All data lives in the WebView's IndexedDB (`azee_hardware_db`), which is
sandboxed per app and persists across restarts/updates as long as the user
doesn't clear app storage. Attachments (bill photos/PDFs) are stored as
base64 inside IndexedDB too, so a single **Backup & Restore** JSON export
(Settings → Backup & Restore) captures everything, including attachments,
and can be moved to another device without the cloud.

## Invoice PDF and the ₹ symbol

The PDF engine (`js/pdf-generator.js`) uses jsPDF's built-in Helvetica font,
which — like most PDF core fonts — has no glyph for the Indian Rupee sign
(₹). To guarantee invoices always render correctly on every device without
shipping an extra multi-hundred-KB font file, generated PDFs print amounts
as `Rs. 1,23,456.00` instead of `₹1,23,456.00`. The in-app screens (which
run in a real WebView with system fonts) show the actual ₹ symbol.

If you'd like the ₹ glyph inside the PDF itself, embed a Unicode font (e.g.
Noto Sans) via `doc.addFont()` in `pdf-generator.js` — the invoice layout
code doesn't need to change, only the `rs()` helper and font selection.

## Known scope notes

This build implements every screen and workflow in the brief: works,
daily logs with editable start/stop times, materials, expenses, bills &
attachments (image/PDF), multi-page invoice PDF generation with automatic
page breaks and repeated table headers, share/print/PDF actions, reports,
search, settings (business details, appearance, invoice numbering, backup
& restore), and cascading delete-with-confirmation everywhere. Malayalam
localisation was intentionally left out of scope for this pass, but every
UI string lives in the screen render functions in `js/app.js`, so it can be
centralised into a strings table later without restructuring the app.
