const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm, stat } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");
const { createGeminiKeyStore, validateApiKey } = require("../desktop/secrets.cjs");

function mockSafeStorage(backend = "gnome_libsecret") {
  return {
    getSelectedStorageBackend: () => backend,
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) => Buffer.from(`encrypted:${value}`),
    decryptStringAsync: async (value) => ({
      result: value.toString("utf8").slice("encrypted:".length),
      shouldReEncrypt: false,
    }),
  };
}

test("encrypts API keys at rest and removes them on request", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexroute-secrets-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const storePath = join(directory, "gemini-api-key.json");
  const store = createGeminiKeyStore({
    safeStorage: mockSafeStorage(),
    storePath,
    platform: "linux",
  });
  const key = "AIza-test-secret-key-123456789";

  await store.save(key);
  const encryptedFile = await readFile(storePath, "utf8");
  assert.equal(encryptedFile.includes(key), false);
  assert.equal(await store.get(), key);
  assert.equal((await stat(storePath)).mode & 0o777, 0o600);
  await store.remove();
  assert.equal(await store.get(), null);
});

test("refuses Linux key storage without an OS keyring", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexroute-secrets-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createGeminiKeyStore({
    safeStorage: mockSafeStorage("basic_text"),
    storePath: join(directory, "gemini-api-key.json"),
    platform: "linux",
  });

  await assert.rejects(store.save("AIza-test-secret-key-123456789"), /GNOME Keyring or KWallet/);
});

test("validates API key length and control characters", () => {
  assert.throws(() => validateApiKey("too-short"), /valid Gemini API key/);
  assert.throws(() => validateApiKey(`AIza-${"a".repeat(30)}\n`), /valid Gemini API key/);
});
