const { mkdir, open, readFile, rename, stat, unlink } = require("node:fs/promises");
const { dirname, join } = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_KEY_LENGTH = 512;
const MAX_SECRET_FILE_BYTES = 8192;
const linuxKeyringBackends = new Set(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]);

function validateApiKey(value) {
  if (
    typeof value !== "string" ||
    value.trim().length < 20 ||
    value.trim().length > MAX_KEY_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("Enter a valid Gemini API key.");
  }
  return value.trim();
}

function createGeminiKeyStore({ safeStorage, storePath, platform = process.platform }) {
  if (!safeStorage || typeof storePath !== "string") {
    throw new TypeError("Gemini key storage requires Electron safeStorage and a file path.");
  }

  async function assertSecureStorage() {
    if (platform === "linux" && !linuxKeyringBackends.has(safeStorage.getSelectedStorageBackend())) {
      throw new Error("Set up GNOME Keyring or KWallet before saving an API key on Linux.");
    }
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error("The operating system's secure credential storage is unavailable.");
    }
  }

  async function writeEncryptedKey(encryptedKey) {
    const directory = dirname(storePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(directory, `.gemini-key-${randomUUID()}.tmp`);
    const file = await open(temporaryPath, "wx", 0o600);
    let renamed = false;
    try {
      await file.writeFile(
        `${JSON.stringify({ schemaVersion: 1, encryptedKey: encryptedKey.toString("base64") })}\n`,
        "utf8",
      );
      await file.sync();
      await file.close();
      await rename(temporaryPath, storePath);
      renamed = true;
    } finally {
      if (!renamed) {
        await file.close().catch(() => {});
        await unlink(temporaryPath).catch(() => {});
      }
    }
  }

  return {
    async save(value) {
      const apiKey = validateApiKey(value);
      await assertSecureStorage();
      const encryptedKey = await safeStorage.encryptStringAsync(apiKey);
      await writeEncryptedKey(encryptedKey);
      return true;
    },

    async get() {
      let serialized;
      try {
        const fileInfo = await stat(storePath);
        if (fileInfo.size > MAX_SECRET_FILE_BYTES) {
          throw new Error("Saved Gemini credential data is too large.");
        }
        const file = await readFile(storePath);
        serialized = JSON.parse(file.toString("utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }

      if (
        !serialized ||
        serialized.schemaVersion !== 1 ||
        typeof serialized.encryptedKey !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(serialized.encryptedKey)
      ) {
        throw new Error("Saved Gemini credential data is invalid.");
      }

      await assertSecureStorage();
      const decrypted = await safeStorage.decryptStringAsync(
        Buffer.from(serialized.encryptedKey, "base64"),
      );
      return validateApiKey(decrypted.result);
    },

    async remove() {
      try {
        await unlink(storePath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    },
  };
}

module.exports = { createGeminiKeyStore, validateApiKey };
