require("dotenv").config({ quiet: true });

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
const prisma = require("./lib/prisma");
const { requireAuth } = require("./middleware/auth");
const {
  AD_DIRECTORY,
  AD_KIND,
  ALLOWED_IMAGE_MIME_TYPES,
  PROFILE_DIRECTORY,
  PROFILE_KIND,
  buildAssetUrl,
  deleteManagedAsset,
  deleteManagedAssets,
  ensureStorageDirectories,
  writeUploadedFiles,
} = require("./utils/assets");
const { serializeAd, serializeConversationSummary, serializeUser } = require("./utils/serialization");
const { hashPassword, verifyPassword } = require("./utils/hash");
const { signAuthToken, verifyAuthToken } = require("./utils/token");

const app = express();
const port = process.env.PORT || 3000;

const adTypes = new Set(["OFFER", "REQUEST"]);
const adCategories = new Set([
  "HOME_HELP",
  "GARDENING",
  "TUTORING",
  "IT_SUPPORT",
  "BEAUTY_WELLNESS",
  "EVENTS",
  "MOVING_DELIVERY",
  "OTHER",
]);
const priceModes = new Set(["FREE", "HOURLY", "FIXED"]);
const serviceTerms = new Set(["REMOTE", "AT_PROVIDER", "AT_CUSTOMER"]);
const adStatuses = new Set(["DRAFT", "PUBLISHED"]);
const MAX_AD_IMAGES = 10;
const MAX_AD_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const avatarInclude = {
  select: {
    id: true,
    storageKey: true,
    originalName: true,
    mimeType: true,
    createdAt: true,
    updatedAt: true,
  },
};

const adImageInclude = {
  orderBy: { position: "asc" },
  select: {
    id: true,
    storageKey: true,
    originalName: true,
    mimeType: true,
    position: true,
    createdAt: true,
    updatedAt: true,
  },
};

const userSelect = {
  id: true,
  pseudo: true,
  city: true,
  bio: true,
  createdAt: true,
  updatedAt: true,
  avatar: avatarInclude,
};

const adInclude = {
  owner: { select: userSelect },
  images: adImageInclude,
};

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(createHttpError("Unsupported image format", 400));
      return;
    }

    callback(null, true);
  },
});

const adImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AD_IMAGE_BYTES, files: MAX_AD_IMAGES },
  fileFilter: (_request, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(createHttpError("Unsupported image format", 400));
      return;
    }

    callback(null, true);
  },
});

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getOptionalAuth(request) {
  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return null;
  }

  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}

function normalizeRequiredString(value, fieldName, minLength) {
  if (typeof value !== "string" || value.trim().length < minLength) {
    throw createHttpError(`Invalid ${fieldName}`, 400);
  }

  return value.trim();
}

function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(`Invalid ${fieldName}`, 400);
  }

  return value.trim() ? value.trim() : null;
}

function normalizePriceValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalizedValue = typeof value === "number" ? value : Number(value);

  if (Number.isNaN(normalizedValue) || normalizedValue < 0) {
    throw createHttpError("Invalid priceValue", 400);
  }

  return normalizedValue;
}

function normalizeServiceTerms(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createHttpError("At least one service term is required", 400);
  }

  const normalized = [...new Set(value.map((term) => {
    if (typeof term !== "string" || !serviceTerms.has(term)) {
      throw createHttpError("Invalid serviceTerms", 400);
    }

    return term;
  }))];

  if (normalized.length === 0) {
    throw createHttpError("At least one service term is required", 400);
  }

  return normalized;
}

function normalizeAdInput(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createHttpError("Invalid ad payload", 400);
  }

  if (!adTypes.has(payload.type)) {
    throw createHttpError("Invalid type", 400);
  }

  if (!adCategories.has(payload.category)) {
    throw createHttpError("Invalid category", 400);
  }

  if (!priceModes.has(payload.priceMode)) {
    throw createHttpError("Invalid priceMode", 400);
  }

  if (payload.status !== undefined && !adStatuses.has(payload.status)) {
    throw createHttpError("Invalid status", 400);
  }

  const priceValue = normalizePriceValue(payload.priceValue);

  if (payload.priceMode === "FREE" && priceValue !== null) {
    throw createHttpError("priceValue must be null when priceMode is FREE", 400);
  }

  if ((payload.priceMode === "HOURLY" || payload.priceMode === "FIXED") && priceValue === null) {
    throw createHttpError("priceValue is required when priceMode is HOURLY or FIXED", 400);
  }

  return {
    type: payload.type,
    title: normalizeRequiredString(payload.title, "title", 3),
    description: normalizeRequiredString(payload.description, "description", 10),
    category: payload.category,
    city: normalizeRequiredString(payload.city, "city", 2),
    availability: normalizeOptionalString(payload.availability, "availability"),
    priceMode: payload.priceMode,
    priceValue,
    serviceTerms: normalizeServiceTerms(payload.serviceTerms),
    status: payload.status || "DRAFT",
  };
}

function buildAdUpdateData(existingAd, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createHttpError("Invalid ad payload", 400);
  }

  const allowedFields = [
    "type",
    "title",
    "description",
    "category",
    "city",
    "availability",
    "priceMode",
    "priceValue",
    "serviceTerms",
    "status",
  ];
  const hasAllowedField = allowedFields.some((field) => Object.hasOwn(payload, field));

  if (!hasAllowedField) {
    throw createHttpError("At least one field is required", 400);
  }

  return normalizeAdInput({
    type: Object.hasOwn(payload, "type") ? payload.type : existingAd.type,
    title: Object.hasOwn(payload, "title") ? payload.title : existingAd.title,
    description: Object.hasOwn(payload, "description") ? payload.description : existingAd.description,
    category: Object.hasOwn(payload, "category") ? payload.category : existingAd.category,
    city: Object.hasOwn(payload, "city") ? payload.city : existingAd.city,
    availability: Object.hasOwn(payload, "availability") ? payload.availability : existingAd.availability,
    priceMode: Object.hasOwn(payload, "priceMode") ? payload.priceMode : existingAd.priceMode,
    priceValue: Object.hasOwn(payload, "priceValue")
      ? payload.priceValue
      : (existingAd.priceValue === null ? null : Number(existingAd.priceValue)),
    serviceTerms: Object.hasOwn(payload, "serviceTerms") ? payload.serviceTerms : existingAd.serviceTerms,
    status: Object.hasOwn(payload, "status") ? payload.status : existingAd.status,
  });
}

function hasAdFieldUpdate(payload) {
  return [
    "type",
    "title",
    "description",
    "category",
    "city",
    "availability",
    "priceMode",
    "priceValue",
    "serviceTerms",
    "status",
  ].some((field) => Object.hasOwn(payload, field));
}

function parseBodyPayload(request) {
  if (request.is("multipart/form-data")) {
    if (typeof request.body?.payload !== "string") {
      throw createHttpError("Missing payload", 400);
    }

    try {
      return JSON.parse(request.body.payload);
    } catch {
      throw createHttpError("Invalid payload", 400);
    }
  }

  return request.body;
}

function normalizeIntegerList(value, fieldName) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createHttpError(`Invalid ${fieldName}`, 400);
  }

  return [...new Set(value.map((entry) => {
    const parsed = Number.parseInt(String(entry), 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      throw createHttpError(`Invalid ${fieldName}`, 400);
    }

    return parsed;
  }))];
}

function normalizeStringList(value, fieldName) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createHttpError(`Invalid ${fieldName}`, 400);
  }

  return [...new Set(value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw createHttpError(`Invalid ${fieldName}`, 400);
    }

    return entry.trim();
  }))];
}

function normalizeImageOrder(value) {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw createHttpError("Invalid imageOrder", 400);
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw createHttpError("Invalid imageOrder", 400);
    }

    if (entry.type === "existing") {
      const id = Number.parseInt(String(entry.id), 10);

      if (Number.isNaN(id) || id <= 0) {
        throw createHttpError("Invalid imageOrder", 400);
      }

      return { type: "existing", id };
    }

    if (entry.type === "new") {
      if (typeof entry.clientId !== "string" || !entry.clientId.trim()) {
        throw createHttpError("Invalid imageOrder", 400);
      }

      return { type: "new", clientId: entry.clientId.trim() };
    }

    throw createHttpError("Invalid imageOrder", 400);
  });
}

function hasAdImageMutation(payload, files) {
  return Boolean(
    (Array.isArray(files) && files.length > 0) ||
    payload.imageOrder !== undefined ||
    payload.removedImageIds !== undefined,
  );
}

function buildAdImagePlan(existingImages, payload, files, { allowExisting }) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  const removedImageIds = new Set(normalizeIntegerList(payload.removedImageIds, "removedImageIds"));
  const newImageClientIds = normalizeStringList(payload.newImageClientIds, "newImageClientIds");
  const imageOrder = normalizeImageOrder(payload.imageOrder);
  const existingById = new Map(existingImages.map((image) => [image.id, image]));
  const retainedExistingIds = new Set();
  const finalEntries = [];

  if (normalizedFiles.length > MAX_AD_IMAGES) {
    throw createHttpError(`You can upload up to ${MAX_AD_IMAGES} images`, 400);
  }

  if (imageOrder) {
    if (newImageClientIds.length !== normalizedFiles.length) {
      throw createHttpError("Invalid newImageClientIds", 400);
    }

    const fileByClientId = new Map();

    newImageClientIds.forEach((clientId, index) => {
      if (fileByClientId.has(clientId)) {
        throw createHttpError("Invalid newImageClientIds", 400);
      }

      fileByClientId.set(clientId, normalizedFiles[index]);
    });

    for (const entry of imageOrder) {
      if (entry.type === "existing") {
        if (!allowExisting) {
          throw createHttpError("Invalid imageOrder", 400);
        }

        const existingImage = existingById.get(entry.id);

        if (!existingImage || removedImageIds.has(entry.id) || retainedExistingIds.has(entry.id)) {
          throw createHttpError("Invalid imageOrder", 400);
        }

        retainedExistingIds.add(entry.id);
        finalEntries.push({ type: "existing", image: existingImage });
        continue;
      }

      const file = fileByClientId.get(entry.clientId);

      if (!file) {
        throw createHttpError("Invalid imageOrder", 400);
      }

      fileByClientId.delete(entry.clientId);
      finalEntries.push({ type: "new", file });
    }

    if (fileByClientId.size > 0) {
      throw createHttpError("Invalid imageOrder", 400);
    }
  } else {
    if (allowExisting) {
      for (const image of [...existingImages].sort((left, right) => left.position - right.position)) {
        if (!removedImageIds.has(image.id)) {
          retainedExistingIds.add(image.id);
          finalEntries.push({ type: "existing", image });
        }
      }
    }

    normalizedFiles.forEach((file) => {
      finalEntries.push({ type: "new", file });
    });
  }

  if (finalEntries.length > MAX_AD_IMAGES) {
    throw createHttpError(`You can upload up to ${MAX_AD_IMAGES} images`, 400);
  }

  return {
    removedImages: allowExisting
      ? existingImages.filter((image) => !retainedExistingIds.has(image.id))
      : [],
    finalEntries,
  };
}

function normalizeProfileUpdate(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createHttpError("Invalid profile payload", 400);
  }

  const data = {};

  if (Object.hasOwn(payload, "pseudo")) {
    data.pseudo = normalizeRequiredString(payload.pseudo, "pseudo", 3);
  }

  if (Object.hasOwn(payload, "city")) {
    data.city = normalizeRequiredString(payload.city, "city", 2);
  }

  if (Object.hasOwn(payload, "bio")) {
    data.bio = normalizeOptionalString(payload.bio, "bio");
  }

  if (Object.hasOwn(payload, "currentPassword") || Object.hasOwn(payload, "newPassword")) {
    data.currentPassword = normalizeRequiredString(payload.currentPassword, "currentPassword", 8);
    data.newPassword = normalizeRequiredString(payload.newPassword, "newPassword", 8);
  }

  if (Object.keys(data).length === 0) {
    throw createHttpError("At least one profile field is required", 400);
  }

  return data;
}

function normalizeConversationMessage(payload) {
  return normalizeRequiredString(payload?.content, "message content", 1);
}

async function createConversationMessage(conversationId, senderId, content) {
  return prisma.$transaction(async (transaction) => {
    const message = await transaction.message.create({
      data: {
        content: content.trim(),
        conversationId,
        senderId,
      },
    });

    await transaction.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  });
}

async function getOwnedAdOrThrow(adId, userId) {
  const ad = await prisma.ad.findUnique({
    where: { id: adId },
    include: { images: adImageInclude },
  });

  if (!ad) {
    throw createHttpError("Ad not found", 404);
  }

  if (ad.ownerId !== userId) {
    throw createHttpError("You are not allowed to manage this ad", 403);
  }

  return ad;
}

async function getConversationForUserOrThrow(conversationId, userId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      ad: {
        select: {
          id: true,
          title: true,
          status: true,
          images: adImageInclude,
        },
      },
      owner: { select: userSelect },
      participant: { select: userSelect },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) {
    throw createHttpError("Conversation not found", 404);
  }

  if (conversation.ownerId !== userId && conversation.participantId !== userId) {
    throw createHttpError("You are not allowed to access this conversation", 403);
  }

  return conversation;
}

function serializeConversation(conversation, request) {
  return serializeConversationSummary(
    {
      ...conversation,
      ad: conversation.ad
        ? {
            id: conversation.ad.id,
            title: conversation.ad.title,
            status: conversation.ad.status,
            coverImage: conversation.ad.images?.[0]
              ? {
                  id: conversation.ad.images[0].id,
                  storageKey: conversation.ad.images[0].storageKey,
                  originalName: conversation.ad.images[0].originalName,
                  mimeType: conversation.ad.images[0].mimeType,
                  position: conversation.ad.images[0].position,
                  url: buildAssetUrl(request, AD_KIND, conversation.ad.images[0].storageKey),
                }
              : null,
          }
        : null,
    },
    request,
  );
}

async function deleteStoredFilesOnFailure(entries, kind) {
  await Promise.all(entries.map((entry) => deleteManagedAsset(kind, entry.storageKey)));
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({ origin: ["http://127.0.0.1:4173", "http://localhost:4173"] }));
app.use(morgan("dev"));
app.use(express.json());
app.use("/static/profile", express.static(PROFILE_DIRECTORY));
app.use("/static/annonce", express.static(AD_DIRECTORY));

app.get("/", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/register", async (request, response, next) => {
  try {
    const { pseudo, city, bio, password } = request.body;

    if (
      typeof pseudo !== "string" ||
      pseudo.trim().length < 3 ||
      typeof city !== "string" ||
      city.trim().length < 2 ||
      (bio !== undefined && typeof bio !== "string") ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      throw createHttpError("Invalid registration payload", 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { pseudo: pseudo.trim() },
    });

    if (existingUser) {
      throw createHttpError("Pseudo already in use", 409);
    }

    const user = await prisma.user.create({
      data: {
        pseudo: pseudo.trim(),
        city: city.trim(),
        bio: typeof bio === "string" && bio.trim() ? bio.trim() : null,
        password: await hashPassword(password),
      },
      include: { avatar: avatarInclude },
    });

    const token = signAuthToken({ userId: user.id, pseudo: user.pseudo });

    response.status(201).json({
      token,
      user: serializeUser(user, request),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/login", async (request, response, next) => {
  try {
    const { pseudo, password } = request.body;

    if (
      typeof pseudo !== "string" ||
      pseudo.trim().length < 3 ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      throw createHttpError("Invalid login payload", 400);
    }

    const user = await prisma.user.findUnique({
      where: { pseudo: pseudo.trim() },
      include: { avatar: avatarInclude },
    });

    if (!user || !(await verifyPassword(password, user.password))) {
      throw createHttpError("Invalid credentials", 401);
    }

    const token = signAuthToken({ userId: user.id, pseudo: user.pseudo });

    response.json({
      token,
      user: serializeUser(user, request),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/logout", requireAuth, (_request, response) => {
  response.status(204).send();
});

app.get("/me", requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      include: { avatar: avatarInclude },
    });

    if (!user) {
      throw createHttpError("User not found", 404);
    }

    response.json({ user: serializeUser(user, request) });
  } catch (error) {
    next(error);
  }
});

app.put("/me", requireAuth, async (request, response, next) => {
  try {
    const profileUpdate = normalizeProfileUpdate(request.body);
    const existingUser = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      include: { avatar: avatarInclude },
    });

    if (!existingUser) {
      throw createHttpError("User not found", 404);
    }

    const updateData = {};

    if (profileUpdate.pseudo && profileUpdate.pseudo !== existingUser.pseudo) {
      const userWithPseudo = await prisma.user.findUnique({ where: { pseudo: profileUpdate.pseudo } });

      if (userWithPseudo && userWithPseudo.id !== existingUser.id) {
        throw createHttpError("Pseudo already in use", 409);
      }

      updateData.pseudo = profileUpdate.pseudo;
    }

    if (Object.hasOwn(profileUpdate, "city")) {
      updateData.city = profileUpdate.city;
    }

    if (Object.hasOwn(profileUpdate, "bio")) {
      updateData.bio = profileUpdate.bio;
    }

    if (profileUpdate.currentPassword || profileUpdate.newPassword) {
      const isCurrentPasswordValid = await verifyPassword(profileUpdate.currentPassword, existingUser.password);

      if (!isCurrentPasswordValid) {
        throw createHttpError("Invalid currentPassword", 401);
      }

      updateData.password = await hashPassword(profileUpdate.newPassword);
    }

    const user = await prisma.user.update({
      where: { id: existingUser.id },
      data: updateData,
      include: { avatar: avatarInclude },
    });

    response.json({ user: serializeUser(user, request) });
  } catch (error) {
    next(error);
  }
});

app.put("/me/avatar", requireAuth, avatarUpload.single("avatar"), async (request, response, next) => {
  const storedFiles = [];

  try {
    if (!request.file) {
      throw createHttpError("Avatar file is required", 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      include: { avatar: avatarInclude },
    });

    if (!existingUser) {
      throw createHttpError("User not found", 404);
    }

    const [storedAvatar] = await writeUploadedFiles(PROFILE_KIND, [request.file]);
    storedFiles.push(storedAvatar);

    const user = await prisma.$transaction(async (transaction) => {
      await transaction.userAvatar.deleteMany({ where: { userId: existingUser.id } });

      await transaction.userAvatar.create({
        data: {
          userId: existingUser.id,
          storageKey: storedAvatar.storageKey,
          originalName: storedAvatar.originalName,
          mimeType: storedAvatar.mimeType,
        },
      });

      return transaction.user.findUnique({
        where: { id: existingUser.id },
        include: { avatar: avatarInclude },
      });
    });

    if (existingUser.avatar?.storageKey) {
      await deleteManagedAsset(PROFILE_KIND, existingUser.avatar.storageKey);
    }

    response.json({ user: serializeUser(user, request) });
  } catch (error) {
    await deleteStoredFilesOnFailure(storedFiles, PROFILE_KIND);
    next(error);
  }
});

app.delete("/me/avatar", requireAuth, async (request, response, next) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      include: { avatar: avatarInclude },
    });

    if (!existingUser) {
      throw createHttpError("User not found", 404);
    }

    const deletedAvatarStorageKey = existingUser.avatar?.storageKey || null;

    await prisma.userAvatar.deleteMany({ where: { userId: existingUser.id } });

    if (deletedAvatarStorageKey) {
      await deleteManagedAsset(PROFILE_KIND, deletedAvatarStorageKey);
    }

    const user = await prisma.user.findUnique({
      where: { id: existingUser.id },
      include: { avatar: avatarInclude },
    });

    response.json({ user: serializeUser(user, request) });
  } catch (error) {
    next(error);
  }
});

app.delete("/me", requireAuth, async (request, response, next) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      include: {
        avatar: avatarInclude,
        ads: {
          select: {
            images: adImageInclude,
          },
        },
      },
    });

    if (!existingUser) {
      throw createHttpError("User not found", 404);
    }

    await prisma.user.delete({ where: { id: existingUser.id } });

    const assetsToDelete = [];

    if (existingUser.avatar?.storageKey) {
      assetsToDelete.push({ kind: PROFILE_KIND, storageKey: existingUser.avatar.storageKey });
    }

    for (const ad of existingUser.ads) {
      for (const image of ad.images) {
        assetsToDelete.push({ kind: AD_KIND, storageKey: image.storageKey });
      }
    }

    await deleteManagedAssets(assetsToDelete);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/me/ads", requireAuth, async (request, response, next) => {
  try {
    const ads = await prisma.ad.findMany({
      where: { ownerId: request.auth.userId },
      orderBy: [{ updatedAt: "desc" }],
      include: adInclude,
    });

    response.json(ads.map((ad) => serializeAd(ad, request)));
  } catch (error) {
    next(error);
  }
});

app.post("/ads", requireAuth, adImagesUpload.array("images", MAX_AD_IMAGES), async (request, response, next) => {
  const storedFiles = [];

  try {
    const payload = parseBodyPayload(request);
    const adInput = normalizeAdInput(payload);
    const imagePlan = buildAdImagePlan([], payload, request.files, { allowExisting: false });
    const persistedImages = await writeUploadedFiles(
      AD_KIND,
      imagePlan.finalEntries.filter((entry) => entry.type === "new").map((entry) => entry.file),
    );

    storedFiles.push(...persistedImages);

    const ad = await prisma.ad.create({
      data: {
        ...adInput,
        ownerId: request.auth.userId,
        images: {
          create: persistedImages.map((image, index) => ({
            storageKey: image.storageKey,
            originalName: image.originalName,
            mimeType: image.mimeType,
            position: index,
          })),
        },
      },
      include: adInclude,
    });

    response.status(201).json(serializeAd(ad, request));
  } catch (error) {
    await deleteStoredFilesOnFailure(storedFiles, AD_KIND);
    next(error);
  }
});

app.get("/ads", async (request, response, next) => {
  try {
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const type = typeof request.query.type === "string" ? request.query.type.trim() : "";
    const sort = typeof request.query.sort === "string" ? request.query.sort.trim() : "newest";
    const category = typeof request.query.category === "string" ? request.query.category.trim() : "";
    const city = typeof request.query.city === "string" ? request.query.city.trim() : "";
    const where = { status: "PUBLISHED" };
    let orderBy = [{ createdAt: "desc" }];

    if (sort === "price_asc") {
      orderBy = [{ priceValue: "asc" }, { createdAt: "desc" }];
    } else if (sort === "price_desc") {
      orderBy = [{ priceValue: "desc" }, { createdAt: "desc" }];
    } else if (sort !== "newest") {
      throw createHttpError("Invalid sort option", 400);
    }

    if (type) {
      if (!adTypes.has(type)) {
        throw createHttpError("Invalid ad type filter", 400);
      }

      where.type = type;
    }

    if (category) {
      if (!adCategories.has(category)) {
        throw createHttpError("Invalid category filter", 400);
      }

      where.category = category;
    }

    if (city) {
      where.city = {
        equals: city,
        mode: "insensitive",
      };
    }

    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    const ads = await prisma.ad.findMany({
      where,
      orderBy,
      include: adInclude,
    });

    response.json(ads.map((ad) => serializeAd(ad, request)));
  } catch (error) {
    next(error);
  }
});

app.get("/ads/:id", async (request, response, next) => {
  try {
    const adId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(adId) || adId <= 0) {
      throw createHttpError("Invalid ad id", 400);
    }

    const ad = await prisma.ad.findUnique({
      where: { id: adId },
      include: adInclude,
    });

    if (!ad) {
      throw createHttpError("Ad not found", 404);
    }

    const auth = getOptionalAuth(request);
    const isOwner = auth?.userId === ad.ownerId;

    if (ad.status !== "PUBLISHED" && !isOwner) {
      throw createHttpError("Ad not found", 404);
    }

    response.json(serializeAd(ad, request));
  } catch (error) {
    next(error);
  }
});

app.put("/ads/:id", requireAuth, adImagesUpload.array("images", MAX_AD_IMAGES), async (request, response, next) => {
  const storedFiles = [];

  try {
    const adId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(adId) || adId <= 0) {
      throw createHttpError("Invalid ad id", 400);
    }

    const payload = parseBodyPayload(request);
    const existingAd = await getOwnedAdOrThrow(adId, request.auth.userId);
    const shouldMutateImages = hasAdImageMutation(payload, request.files);

    if (!hasAdFieldUpdate(payload) && !shouldMutateImages) {
      throw createHttpError("At least one field is required", 400);
    }

    const updateData = hasAdFieldUpdate(payload) ? buildAdUpdateData(existingAd, payload) : null;
    const imagePlan = buildAdImagePlan(existingAd.images, payload, request.files, { allowExisting: true });
    const persistedImages = await writeUploadedFiles(
      AD_KIND,
      imagePlan.finalEntries.filter((entry) => entry.type === "new").map((entry) => entry.file),
    );

    storedFiles.push(...persistedImages);

    let createdImageIndex = 0;

    const ad = await prisma.$transaction(async (transaction) => {
      if (updateData) {
        await transaction.ad.update({
          where: { id: adId },
          data: updateData,
        });
      }

      if (shouldMutateImages) {
        await transaction.adImage.deleteMany({ where: { adId } });

        if (imagePlan.finalEntries.length > 0) {
          await transaction.adImage.createMany({
            data: imagePlan.finalEntries.map((entry, position) => {
              if (entry.type === "existing") {
                return {
                  adId,
                  storageKey: entry.image.storageKey,
                  originalName: entry.image.originalName,
                  mimeType: entry.image.mimeType,
                  position,
                };
              }

              const createdImage = persistedImages[createdImageIndex++];

              return {
                adId,
                storageKey: createdImage.storageKey,
                originalName: createdImage.originalName,
                mimeType: createdImage.mimeType,
                position,
              };
            }),
          });
        }
      }

      return transaction.ad.findUnique({
        where: { id: adId },
        include: adInclude,
      });
    });

    await deleteManagedAssets(imagePlan.removedImages.map((image) => ({ kind: AD_KIND, storageKey: image.storageKey })));
    response.json(serializeAd(ad, request));
  } catch (error) {
    await deleteStoredFilesOnFailure(storedFiles, AD_KIND);
    next(error);
  }
});

app.post("/ads/:id/publish", requireAuth, async (request, response, next) => {
  try {
    const adId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(adId) || adId <= 0) {
      throw createHttpError("Invalid ad id", 400);
    }

    await getOwnedAdOrThrow(adId, request.auth.userId);
    const ad = await prisma.ad.update({
      where: { id: adId },
      data: { status: "PUBLISHED" },
      include: adInclude,
    });

    response.json(serializeAd(ad, request));
  } catch (error) {
    next(error);
  }
});

app.post("/ads/:id/unpublish", requireAuth, async (request, response, next) => {
  try {
    const adId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(adId) || adId <= 0) {
      throw createHttpError("Invalid ad id", 400);
    }

    await getOwnedAdOrThrow(adId, request.auth.userId);
    const ad = await prisma.ad.update({
      where: { id: adId },
      data: { status: "DRAFT" },
      include: adInclude,
    });

    response.json(serializeAd(ad, request));
  } catch (error) {
    next(error);
  }
});

app.delete("/ads/:id", requireAuth, async (request, response, next) => {
  try {
    const adId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(adId) || adId <= 0) {
      throw createHttpError("Invalid ad id", 400);
    }

    const existingAd = await getOwnedAdOrThrow(adId, request.auth.userId);
    await prisma.ad.delete({
      where: { id: adId },
    });

    await deleteManagedAssets(existingAd.images.map((image) => ({ kind: AD_KIND, storageKey: image.storageKey })));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/ads/:id/conversations", requireAuth, async (request, response, next) => {
  try {
    const adId = Number.parseInt(request.params.id, 10);
    const content = normalizeConversationMessage(request.body);

    if (Number.isNaN(adId) || adId <= 0) {
      throw createHttpError("Invalid ad id", 400);
    }

    const ad = await prisma.ad.findUnique({
      where: { id: adId },
      select: { id: true, ownerId: true, status: true },
    });

    if (!ad || ad.status !== "PUBLISHED") {
      throw createHttpError("Ad not found", 404);
    }

    if (ad.ownerId === request.auth.userId) {
      throw createHttpError("You cannot message your own ad", 403);
    }

    const conversation = await prisma.conversation.upsert({
      where: {
        adId_ownerId_participantId: {
          adId: ad.id,
          ownerId: ad.ownerId,
          participantId: request.auth.userId,
        },
      },
      update: {},
      create: {
        adId: ad.id,
        ownerId: ad.ownerId,
        participantId: request.auth.userId,
      },
    });

    const message = await createConversationMessage(conversation.id, request.auth.userId, content);

    response.status(201).json({ conversation, message });
  } catch (error) {
    next(error);
  }
});

app.get("/conversations", requireAuth, async (request, response, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { ownerId: request.auth.userId },
          { participantId: request.auth.userId },
        ],
      },
      include: {
        ad: {
          select: {
            id: true,
            title: true,
            status: true,
            images: adImageInclude,
          },
        },
        owner: { select: userSelect },
        participant: { select: userSelect },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    response.json(conversations.map((conversation) => serializeConversation(conversation, request)));
  } catch (error) {
    next(error);
  }
});

app.get("/conversations/:id/messages", requireAuth, async (request, response, next) => {
  try {
    const conversationId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(conversationId) || conversationId <= 0) {
      throw createHttpError("Invalid conversation id", 400);
    }

    const conversation = await getConversationForUserOrThrow(conversationId, request.auth.userId);
    response.json(serializeConversation(conversation, request));
  } catch (error) {
    next(error);
  }
});

app.post("/conversations/:id/messages", requireAuth, async (request, response, next) => {
  try {
    const conversationId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(conversationId) || conversationId <= 0) {
      throw createHttpError("Invalid conversation id", 400);
    }

    await getConversationForUserOrThrow(conversationId, request.auth.userId);
    const content = normalizeConversationMessage(request.body);
    const message = await createConversationMessage(conversationId, request.auth.userId, content);

    response.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

app.use((request, _response, next) => {
  next(createHttpError(`Route not found: ${request.method} ${request.originalUrl}`, 404));
});

app.use((error, _request, response, _next) => {
  const statusCode = error.statusCode || (error instanceof multer.MulterError ? 400 : 500);

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    response.status(400).json({ error: "Image file is too large" });
    return;
  }

  if (
    error instanceof multer.MulterError &&
    (error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT")
  ) {
    response.status(400).json({ error: `You can upload up to ${MAX_AD_IMAGES} images` });
    return;
  }

  response.status(statusCode).json({
    error: error.message || "Internal server error",
  });
});

if (require.main === module) {
  ensureStorageDirectories()
    .then(() => {
      app.listen(port, () => {
        console.log(`API listening on port ${port}`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = app;
