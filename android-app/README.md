# Situation X - Android app

A thin Android shell (Capacitor) that opens the live site, https://situation-x-pwa.onrender.com, full screen.
The backend runs on Render and the database is Supabase, exactly as for the website; nothing runs on the phone
except the screen. New website versions therefore reach the app without a new APK.

If the Render server is asleep, the app shows a "Waking up the server" screen (www/error.html) and opens
the site by itself as soon as the server answers.

## Get the APK
GitHub -> Actions -> **Build Android APK** -> Run workflow. When it is green, the file is at
`https://github.com/<owner>/<repo>/releases/latest/download/Situation-X.apk` - share that link; opened on a phone
it downloads the app.

## Signing key (so updates install over the old app)
Create it once on any computer with Java:
`keytool -genkeypair -v -keystore situationx.keystore -alias situationx -keyalg RSA -keysize 2048 -validity 10000`
then add the repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 situationx.keystore`),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Keep the keystore file safe: losing it
means future versions cannot update the installed app.

## Changing the site address
Edit `server.url` in `capacitor.config.json` and `SITE` in `www/error.html`, then run the workflow again.

## Known limit
"Continue with Google" does not work inside an app WebView (Google blocks it); email + password sign-in does.
