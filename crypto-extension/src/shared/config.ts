// Shared with the mobile app so phone and desktop see the same @usernames and
// the same Google Drive backup (crypto-wallet/services/firebase.js, GoogleService.js).

export const FIREBASE = {
  apiKey: "AIzaSyDSu1BUytABFl145cj1gcY825kYeXe9w5U",
  projectId: "rizon-wallet",
};

/**
 * Google OAuth "Web application" client in the same Google Cloud project as the
 * mobile app (so Drive's appDataFolder is shared). For the extension to sign
 * in, add this redirect URI to that client in Google Cloud Console →
 * Credentials → Authorized redirect URIs:
 *     https://<extension-id>.chromiumapp.org/
 * (Settings → Cloud backup shows the exact value.)
 */
export const GOOGLE_WEB_CLIENT_ID = "1072621486591-u9id33f0rqm7uben2bgd4dih0ii4lpdt.apps.googleusercontent.com";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const BACKUP_FILE = "rizon-wallet-backup.json";
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
