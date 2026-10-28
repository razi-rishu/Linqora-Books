# Android setup

## Identity (independent from Linqora QR)

| | Linqora Books | Linqora QR (do not touch) |
|---|---|---|
| applicationId / namespace | `com.linqora.books` | `com.linqora.app` |
| App name | Linqora Books | Linqora |
| Version | versionCode 4, versionName 0.2.0 | separate |
| Signing key | **to be created** for Books (Phase 7) | `~/.linqora-signing/linqora-release.jks` — never reuse |

Changing `applicationId` after users install the app forces a reinstall, so treat `com.linqora.books` as
final unless changed before the first client install.

## Toolchain (verified on this machine, 28 Oct 2026)

- Node 24.13.0, pnpm 12.15.0
- Capacitor 8.5.3 (`@capacitor/core`, `cli`, `android`)
- Android SDK at `C:\Users\rashi\AppData\Local\Android\Sdk`: platform `android-36`, build-tools 35/36/37
- Gradle wrapper 8.14.3, Android Gradle Plugin 8.13.0, compile/target SDK 36, min SDK 24
- **JDK 21**: `C:\Users\rashi\.jdks\jbr-21.0.11`. Android Studio's bundled JBR is Java 25, which this Gradle
  version cannot run build scripts with ("Unsupported class file major version 69"). Always set `JAVA_HOME` to JDK 21.
- `java` is not on PATH and `JAVA_HOME`/`ANDROID_HOME` are not set globally — set them per shell as below.

## Build a debug APK

PowerShell:

```powershell
$env:JAVA_HOME = "$HOME\.jdks\jbr-21.0.11"; $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

```powershell
pnpm android:debug
```

That runs `vite build` → `cap sync android` → `gradlew assembleDebug`. Output:

`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Install on a phone with USB debugging enabled:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

A debug APK is signed with the local debug key. It can be side-loaded for testing but cannot be updated
by a release build (different signature) — uninstall first when switching.

## After changing web code

```bash
pnpm android:sync
```

Then rebuild in Android Studio (open `apps/mobile/android`) or run `gradlew.bat assembleDebug` again.

## Install on a Samsung (or any Android) phone

The APK is at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

**Option A — copy the file (no cable setup)**

1. Copy `app-debug.apk` to the phone: USB cable (phone shows as a drive → put it in *Download*), Google Drive,
   or Quick Share / Nearby Share from the PC.
2. On the phone open **My Files → Downloads** (or Internal storage → Download) and tap `app-debug.apk`.
3. If asked, allow **Install unknown apps** for My Files (or the app you opened it from) → go back → tap again.
4. If **Auto Blocker** is on (One UI 6+), Samsung blocks it: *Settings → Security and privacy → Auto Blocker* → turn off
   temporarily, install, then turn it back on.
5. Play Protect may warn about an unknown developer → *More details → Install anyway*. This is expected for a debug build.
6. Open **Linqora Books** from the app drawer.

**Option B — USB debugging (adb)**

1. *Settings → About phone → Software information* → tap **Build number** 7 times (Developer options).
2. *Settings → Developer options → USB debugging* on; connect the cable; accept the "Allow USB debugging" prompt.
3. On the PC:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

Updating: install a newer `app-debug.apk` the same way; it replaces the old one and keeps data (same debug key on this PC).
A build from another computer has a different debug key — uninstall first, which deletes the local data on the phone.
(The app's backup export does not work inside Android yet — Phase 4 — so treat phone data as test data.)

## Cloud vs local-preview APK

| Command | Build |
|---|---|
| `pnpm android:debug` | **Cloud**: needs `apps/mobile/.env.production.local` with the Supabase URL + publishable key (SUPABASE_SETUP.md) |
| `pnpm android:debug:preview` | **Local preview**: on-device records, local-only sign-in, labelled TEST MODE |

Without the cloud settings, `pnpm android:debug` produces an app that only shows "not configured".

## Sign-in links (deep link)

Verification and password-reset e-mails open `com.linqora.books://auth/callback?...`, registered in
`AndroidManifest.xml` (VIEW + BROWSABLE). Open the e-mail **on the same phone** that signed up / requested the reset
(PKCE). Opened elsewhere, the address is still verified — the app then asks the user to sign in. Verified HTTPS App
Links need a Linqora Books domain with `assetlinks.json` (later phase).

## Session storage

Sessions are kept by `@aparajita/capacitor-secure-storage` (encrypted with an Android Keystore key), refreshed only
while the app is in the foreground, and survive restarts. Plugins in the APK: `@capacitor/app`,
`@aparajita/capacitor-secure-storage`. Permissions: `INTERNET` only (plus AndroidX's internal receiver permission).

## Back button

Hardware/system Back is handled by `@capacitor/app` + React Router (`src/navigation/`). One native listener is
installed for the page lifetime; each press is decided by `resolveBack`, in this order:

1. A text field is focused → the field is blurred (keyboard hides). Nothing else happens.
2. A panel or dialog is open (record payment, apply advance, void, reconcile, refund, reset, "discard changes?") → it closes.
3. Dashboard (and onboarding entry screens: welcome, subscription intro, setup) → "Press back again to exit";
   a second press within 2 seconds exits.
4. Otherwise → previous screen; if the screen was opened without history (e.g. after a restart) → its parent
   screen (e.g. invoice → Quotations & invoices → Dashboard). Back never closes the app from a secondary screen.

Forms with unsaved changes (add entry, quotation/invoice/bill editor, customer/supplier, project, account,
business setup and Settings profile) ask "Discard unsaved changes?" before leaving — for hardware Back, the bottom
navigation and browser Back alike. "Keep editing" (or Back) stays with the typed values intact. Inline panels
(payment, advance, void reason) close on Back like a dialog and keep no draft.

## Backup and data extraction

`android:allowBackup="false"` and `res/xml/data_extraction_rules.xml` exclude **all** app data from Google cloud
backup and from device-to-device transfer (Android 12+ needs the rules file; `allowBackup=false` alone still allows
device transfer). Consequences while data is local-only:

- Uninstalling, clearing app data, or switching phones **loses the books**. *Settings → Export full backup (JSON)*
  works in the browser version only; on Android, file export arrives in Phase 4. Treat phone data as test data until then.
- Samsung Smart Switch and Google's phone-to-phone copy will not carry Linqora Books data.

Cloud builds: books live in Supabase, so reinstalling or changing phones only needs a sign-in. Session tokens stay
excluded from backup by design (a restored token on another phone would be a security risk).

## Release builds (Phase 7 — not done)

1. Generate a **new** keystore for Linqora Books, store it outside the repo (e.g. `~/.linqora-books-signing/`), back it up.
2. Add a `signingConfigs.release` reading a properties file outside the repo (`*.jks` and `keystore.properties` are git-ignored).
3. Enable minify/shrink, verify `debuggable false`, bump `versionCode` on every release.
4. Add app icon and splash assets (currently Capacitor defaults).

## Known Android limitations in Phase 1

- "Print / PDF" uses `window.print()`, which does nothing in Android WebView. PDF generation and sharing arrive in Phase 4.
- CSV/JSON exports use a browser download, which Android WebView does not handle; Phase 4 adds Filesystem/Share.
- Data lives in the WebView's storage; clearing app data deletes it.
- Default Capacitor launcher icon and splash.
