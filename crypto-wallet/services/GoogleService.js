// services/GoogleService.js
// Google sign-in → Firebase account, with optional Drive (app-data) access
// for the recovery-phrase backup (services/cloudBackup.js).
import { useEffect, useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { exchangeCodeAsync } from "expo-auth-session";
import {
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "./firebase";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_IDS = {
  webClientId:
    "1072621486591-u9id33f0rqm7uben2bgd4dih0ii4lpdt.apps.googleusercontent.com",
  // TODO: create the iOS OAuth client in Google Cloud Console (bundle id
  // com.awarizon.wallet) — iOS sign-in fails until this is a real id.
  iosClientId: "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com",
  androidClientId:
    "1072621486591-reti5l56ssl0q7eukb3cbbph4ug6cm5e.apps.googleusercontent.com",
};

// drive.appdata = a hidden folder only this app can read/write. Rizon never
// sees the rest of the user's Drive.
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const BASE_SCOPES = ["openid", "profile", "email"];

// Granular consent: the user may untick Drive on Google's screen, so check
// what was actually granted. The auth response usually lists it; if not,
// Google's tokeninfo endpoint is the authority.
const hasDriveScope = async (grantedScope, accessToken) => {
  const listed = grantedScope ?? "";
  if (listed.trim()) return listed.includes(DRIVE_SCOPE);
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    const info = await res.json();
    return String(info.scope ?? "").includes(DRIVE_SCOPE);
  } catch {
    return false;
  }
};

/**
 * @param {object} opts { withDrive: boolean } — ask for Drive backup access.
 *   Google's consent screen still lets the user untick it; `signIn()`
 *   reports what was actually granted.
 */
export function useGoogleAuth({ withDrive = true } = {}) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // useAuthRequest (not useIdTokenAuthRequest) so we get an access token too.
  // On iOS/Android this is the authorization-code flow: promptAsync() only
  // resolves with a one-time `code`, and the hook would swap it for tokens
  // later, in an effect, surfacing them in its `response` value — too late
  // for an awaited signIn(). So signIn() exchanges the code itself, and the
  // hook's own exchange is switched off (a code can only be redeemed once).
  const [request, , promptAsync] = Google.useAuthRequest({
    ...GOOGLE_CLIENT_IDS,
    scopes: withDrive ? [...BASE_SCOPES, DRIVE_SCOPE] : BASE_SCOPES,
    shouldAutoExchangeCode: false,
  });

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  /**
   * Run the Google flow and sign in to Firebase.
   * @returns {Promise<{ uid, email, name, accessToken, driveGranted } | null>}
   *   null if the user cancelled.
   */
  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await promptAsync();
      if (response.type === "cancel" || response.type === "dismiss") return null;
      if (response.type !== "success") {
        throw new Error(response.error?.message ?? "Google sign-in failed");
      }

      // Web/implicit flows return tokens directly; native returns a code
      let tokens = response.authentication;
      if (!tokens && response.params?.code) {
        tokens = await exchangeCodeAsync(
          {
            clientId: request.clientId,
            redirectUri: request.redirectUri,
            code: response.params.code,
            scopes: request.scopes,
            extraParams: { code_verifier: request.codeVerifier ?? "" },
          },
          Google.discovery,
        );
      }

      const { idToken, accessToken } = tokens ?? {};
      if (!idToken) throw new Error("Google didn't return an ID token");

      const { user: fbUser } = await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(idToken, accessToken),
      );

      return {
        uid: fbUser.uid,
        email: fbUser.email,
        name: fbUser.displayName,
        accessToken: accessToken ?? null,
        driveGranted:
          withDrive &&
          !!accessToken &&
          (await hasDriveScope(tokens?.scope ?? response.params?.scope, accessToken)),
      };
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [promptAsync, request, withDrive]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return {
    user,
    error,
    busy,
    ready: !!request,
    signIn,
    signOut,
  };
}
