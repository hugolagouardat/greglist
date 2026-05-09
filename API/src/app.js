require("dotenv").config({ quiet: true });

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const prisma = require("./lib/prisma");
const { requireAuth } = require("./middleware/auth");
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

  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw createHttpError("Invalid priceValue", 400);
  }

  return value;
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
  if (!payload || typeof payload !== "object") {
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
  if (!payload || typeof payload !== "object") {
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

  const mergedPayload = {
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
  };

  return normalizeAdInput(mergedPayload);
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
        },
      },
      owner: {
        select: {
          id: true,
          pseudo: true,
          city: true,
        },
      },
      participant: {
        select: {
          id: true,
          pseudo: true,
          city: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
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

app.use(helmet());
app.use(cors({ origin: ["http://127.0.0.1:4173", "http://localhost:4173"] }));
app.use(morgan("dev"));
app.use(express.json());

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
    });

    const token = signAuthToken({ userId: user.id, pseudo: user.pseudo });

    response.status(201).json({
      token,
      user: {
        id: user.id,
        pseudo: user.pseudo,
        city: user.city,
        bio: user.bio,
      },
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
    });

    if (!user || !(await verifyPassword(password, user.password))) {
      throw createHttpError("Invalid credentials", 401);
    }

    const token = signAuthToken({ userId: user.id, pseudo: user.pseudo });

    response.json({
      token,
      user: {
        id: user.id,
        pseudo: user.pseudo,
        city: user.city,
        bio: user.bio,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/logout", requireAuth, (_request, response) => {
  response.status(204).send();
});

app.get("/me/ads", requireAuth, async (request, response, next) => {
  try {
    const ads = await prisma.ad.findMany({
      where: { ownerId: request.auth.userId },
      orderBy: [{ updatedAt: "desc" }],
    });

    response.json(ads);
  } catch (error) {
    next(error);
  }
});

app.post("/ads", requireAuth, async (request, response, next) => {
  try {
    const adInput = normalizeAdInput(request.body);

    const ad = await prisma.ad.create({
      data: {
        ...adInput,
        ownerId: request.auth.userId,
      },
    });

    response.status(201).json(ad);
  } catch (error) {
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
      include: {
        owner: {
          select: {
            id: true,
            pseudo: true,
            city: true,
          },
        },
      },
    });

    response.json(ads);
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
      include: {
        owner: {
          select: {
            id: true,
            pseudo: true,
            city: true,
            bio: true,
          },
        },
      },
    });

    if (!ad) {
      throw createHttpError("Ad not found", 404);
    }

    const auth = getOptionalAuth(request);
    const isOwner = auth?.userId === ad.ownerId;

    if (ad.status !== "PUBLISHED" && !isOwner) {
      throw createHttpError("Ad not found", 404);
    }

    response.json(ad);
  } catch (error) {
    next(error);
  }
});

app.put("/ads/:id", requireAuth, async (request, response, next) => {
  try {
    const adId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(adId) || adId <= 0) {
      throw createHttpError("Invalid ad id", 400);
    }

    const existingAd = await getOwnedAdOrThrow(adId, request.auth.userId);
    const ad = await prisma.ad.update({
      where: { id: adId },
      data: buildAdUpdateData(existingAd, request.body),
    });

    response.json(ad);
  } catch (error) {
    next(error);
  }
});

app.post("/ads/:id/publish", requireAuth, async (request, response, next) => {
  try {
    const adId = Number.parseInt(request.params.id, 10);

    if (Number.isNaN(adId) || adId <= 0) {
      throw createHttpError("Invalid ad id", 400);
    }

    const existingAd = await getOwnedAdOrThrow(adId, request.auth.userId);
    const ad = await prisma.ad.update({
      where: { id: existingAd.id },
      data: { status: "PUBLISHED" },
    });

    response.json(ad);
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

    const existingAd = await getOwnedAdOrThrow(adId, request.auth.userId);
    const ad = await prisma.ad.update({
      where: { id: existingAd.id },
      data: { status: "DRAFT" },
    });

    response.json(ad);
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

    await getOwnedAdOrThrow(adId, request.auth.userId);
    await prisma.ad.delete({
      where: { id: adId },
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/ads/:id/conversations", requireAuth, async (request, response, next) => {
  try {
    const adId = Number.parseInt(request.params.id, 10);
    const content = normalizeRequiredString(request.body?.content, "message content", 1);

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
          },
        },
        owner: {
          select: {
            id: true,
            pseudo: true,
          },
        },
        participant: {
          select: {
            id: true,
            pseudo: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    response.json(conversations);
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
    response.json(conversation);
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
    const content = normalizeRequiredString(request.body?.content, "message content", 1);
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
  const statusCode = error.statusCode || 500;

  response.status(statusCode).json({
    error: error.message || "Internal server error",
  });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}

module.exports = app;
