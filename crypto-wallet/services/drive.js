// services/drive.js
// ─────────────────────────────────────────────────────────────────────────────
// Google Drive REST helpers, scoped to the app-data folder.
//
// Everything here lives in `appDataFolder` (scope drive.appdata): a hidden,
// per-app folder in the user's Drive. Only Rizon can read or write it — it
// doesn't show up in the user's Drive file list, other apps can't see it, and
// Rizon can't see anything else in their Drive.
// ─────────────────────────────────────────────────────────────────────────────

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

const authHeaders = (accessToken) => {
  if (!accessToken) throw new Error("Not signed in to Google Drive");
  return { Authorization: `Bearer ${accessToken}` };
};

const check = async (res, action) => {
  if (res.status === 401) {
    throw new Error("Your Google session expired. Sign in with Google again.");
  }
  if (res.status === 403) {
    throw new Error(
      "Rizon doesn't have Google Drive access. Sign in again and allow Drive backup.",
    );
  }
  if (!res.ok) throw new Error(`Drive ${action} failed (${res.status})`);
  return res;
};

/**
 * Find an app-data file by name. Newest first if there are several.
 * @returns {Promise<{ id, name, modifiedTime } | null>}
 */
export const findAppDataFile = async (accessToken, name) => {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: "1",
  });
  const res = await check(
    await fetch(`${API}?${params}`, { headers: authHeaders(accessToken) }),
    "lookup",
  );
  const { files } = await res.json();
  return files?.[0] ?? null;
};

/** Download an app-data file's contents as text. */
export const readAppDataFile = async (accessToken, fileId) => {
  const res = await check(
    await fetch(`${API}/${fileId}?alt=media`, {
      headers: authHeaders(accessToken),
    }),
    "download",
  );
  return res.text();
};

/**
 * Create the file in appDataFolder, or overwrite it in place when `fileId`
 * is given (keeps one backup file instead of piling up copies).
 * @returns {Promise<{ id, name }>}
 */
export const writeAppDataFile = async (
  accessToken,
  { name, content, fileId = null, mimeType = "application/json" },
) => {
  if (fileId) {
    const res = await check(
      await fetch(`${UPLOAD}/${fileId}?uploadType=media&fields=id,name`, {
        method: "PATCH",
        headers: { ...authHeaders(accessToken), "Content-Type": mimeType },
        body: content,
      }),
      "update",
    );
    return res.json();
  }

  const boundary = `rizon_${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name, mimeType, parents: ["appDataFolder"] })}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await check(
    await fetch(`${UPLOAD}?uploadType=multipart&fields=id,name`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }),
    "upload",
  );
  return res.json();
};

/** Permanently delete an app-data file. */
export const deleteAppDataFile = async (accessToken, fileId) => {
  const res = await fetch(`${API}/${fileId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (res.status !== 404) await check(res, "delete");
};
