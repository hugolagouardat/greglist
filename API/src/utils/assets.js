const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PROFILE_DIRECTORY = path.join(__dirname, "..", "img", "profile");
const AD_DIRECTORY = path.join(__dirname, "..", "img", "annonce");
const DEFAULT_PROFILE_STORAGE_KEY = "default/pixelArt-1778341787010.avif";
const PROFILE_KIND = "profile";
const AD_KIND = "annonce";
const MANAGED_IMAGE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(svg|png|avif|jpg|jpeg|webp)$/i;
const MIME_TO_EXTENSION = new Map([
  ["image/svg+xml", ".svg"],
  ["image/png", ".png"],
  ["image/avif", ".avif"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);
const ALLOWED_IMAGE_MIME_TYPES = new Set(MIME_TO_EXTENSION.keys());
const ALLOWED_IMAGE_EXTENSIONS = new Set([".svg", ".png", ".avif", ".jpg", ".jpeg", ".webp"]);

const directoryByKind = {
  [PROFILE_KIND]: PROFILE_DIRECTORY,
  [AD_KIND]: AD_DIRECTORY,
};

function getDirectoryForKind(kind) {
  const directory = directoryByKind[kind];

  if (!directory) {
    throw new Error(`Unknown asset kind: ${kind}`);
  }

  return directory;
}

function encodeStorageKey(storageKey) {
  return storageKey.split("/").map(encodeURIComponent).join("/");
}

function buildAssetUrl(request, kind, storageKey) {
  const relativeUrl = `/static/${kind}/${encodeStorageKey(storageKey)}`;

  if (!request) {
    return relativeUrl;
  }

  return `${request.protocol}://${request.get("host")}${relativeUrl}`;
}

function getExtensionForFile(file) {
  const mimeExtension = MIME_TO_EXTENSION.get(file.mimetype);

  if (mimeExtension) {
    return mimeExtension;
  }

  const originalExtension = path.extname(file.originalname || "").toLowerCase();

  if (ALLOWED_IMAGE_EXTENSIONS.has(originalExtension)) {
    return originalExtension;
  }

  return null;
}

function assertAllowedImageFile(file) {
  const extension = getExtensionForFile(file);

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype) || !extension) {
    const error = new Error("Format d'image non supporté");
    error.statusCode = 400;
    throw error;
  }

  return extension;
}

async function ensureStorageDirectories() {
  await Promise.all([
    fs.mkdir(PROFILE_DIRECTORY, { recursive: true }),
    fs.mkdir(AD_DIRECTORY, { recursive: true }),
  ]);
}

async function writeUploadedFiles(kind, files) {
  const directory = getDirectoryForKind(kind);
  const normalizedFiles = Array.isArray(files) ? files : [];

  await ensureStorageDirectories();

  const storedEntries = [];

  for (const file of normalizedFiles) {
    const extension = assertAllowedImageFile(file);
    const storageKey = `${randomUUID()}${extension}`;
    const filePath = path.join(directory, storageKey);

    await fs.writeFile(filePath, file.buffer);
    storedEntries.push({
      storageKey,
      filePath,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
  }

  return storedEntries;
}

async function deleteManagedAsset(kind, storageKey) {
  if (typeof storageKey !== "string" || !MANAGED_IMAGE_NAME_PATTERN.test(storageKey)) {
    return;
  }

  const directory = getDirectoryForKind(kind);
  const filePath = path.join(directory, storageKey);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function deleteManagedAssets(entries) {
  await Promise.all(entries.map((entry) => deleteManagedAsset(entry.kind, entry.storageKey)));
}

module.exports = {
  AD_DIRECTORY,
  AD_KIND,
  ALLOWED_IMAGE_MIME_TYPES,
  DEFAULT_PROFILE_STORAGE_KEY,
  PROFILE_DIRECTORY,
  PROFILE_KIND,
  buildAssetUrl,
  deleteManagedAsset,
  deleteManagedAssets,
  ensureStorageDirectories,
  writeUploadedFiles,
};