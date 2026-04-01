require("dotenv").config({ quiet: true });

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const prisma = require("./lib/prisma");
const { requireAuth } = require("./middleware/auth");
const { hashPassword, verifyPassword } = require("./utils/hash");
const { signAuthToken } = require("./utils/token");

const app = express();
const port = process.env.PORT || 3000;
const adTypes = new Set(["OFFER", "REQUEST"]);
const adStatuses = new Set(["PUBLISHED", "ARCHIVED"]);

function buildAdCreateInput(payload) {
  const { type, title, description, category, city, availability, price, terms, status } = payload;

  if (
    !adTypes.has(type) ||
    typeof title !== "string" ||
    title.trim().length < 3 ||
    typeof description !== "string" ||
    description.trim().length < 10 ||
    typeof category !== "string" ||
    category.trim().length < 2 ||
    typeof city !== "string" ||
    city.trim().length < 2 ||
    (availability !== undefined && availability !== null && typeof availability !== "string") ||
    (price !== undefined && price !== null && (typeof price !== "number" || Number.isNaN(price) || price < 0)) ||
    (terms !== undefined && terms !== null && typeof terms !== "string") ||
    (status !== undefined && !adStatuses.has(status))
  ) {
    const error = new Error("Invalid ad payload");
    error.statusCode = 400;
    throw error;
  }

  return {
    type,
    title: title.trim(),
    description: description.trim(),
    category: category.trim(),
    city: city.trim(),
    availability: typeof availability === "string" && availability.trim() ? availability.trim() : null,
    price: typeof price === "number" ? price : null,
    terms: typeof terms === "string" && terms.trim() ? terms.trim() : null,
    status: status || "PUBLISHED",
  };
}

function buildAdUpdateInput(payload) {
  const update = {};

  if (payload.type !== undefined) {
    if (!adTypes.has(payload.type)) {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.type = payload.type;
  }

  if (payload.title !== undefined) {
    if (typeof payload.title !== "string" || payload.title.trim().length < 3) {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.title = payload.title.trim();
  }

  if (payload.description !== undefined) {
    if (typeof payload.description !== "string" || payload.description.trim().length < 10) {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.description = payload.description.trim();
  }

  if (payload.category !== undefined) {
    if (typeof payload.category !== "string" || payload.category.trim().length < 2) {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.category = payload.category.trim();
  }

  if (payload.city !== undefined) {
    if (typeof payload.city !== "string" || payload.city.trim().length < 2) {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.city = payload.city.trim();
  }

  if (payload.availability !== undefined) {
    if (payload.availability !== null && typeof payload.availability !== "string") {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.availability = typeof payload.availability === "string" && payload.availability.trim()
      ? payload.availability.trim()
      : null;
  }

  if (payload.price !== undefined) {
    if (payload.price !== null && (typeof payload.price !== "number" || Number.isNaN(payload.price) || payload.price < 0)) {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.price = typeof payload.price === "number" ? payload.price : null;
  }

  if (payload.terms !== undefined) {
    if (payload.terms !== null && typeof payload.terms !== "string") {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.terms = typeof payload.terms === "string" && payload.terms.trim()
      ? payload.terms.trim()
      : null;
  }

  if (payload.status !== undefined) {
    if (!adStatuses.has(payload.status)) {
      const error = new Error("Invalid ad payload");
      error.statusCode = 400;
      throw error;
    }

    update.status = payload.status;
  }

  if (Object.keys(update).length === 0) {
    const error = new Error("At least one field is required");
    error.statusCode = 400;
    throw error;
  }

  return update;
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
      const error = new Error("Invalid registration payload");
      error.statusCode = 400;
      throw error;
    }

    const existingUser = await prisma.user.findUnique({
      where: { pseudo: pseudo.trim() },
    });

    if (existingUser) {
      const error = new Error("Pseudo already in use");
      error.statusCode = 409;
      throw error;
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
      const error = new Error("Invalid login payload");
      error.statusCode = 400;
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { pseudo: pseudo.trim() },
    });

    if (!user || !(await verifyPassword(password, user.password))) {
      const error = new Error("Invalid credentials");
      error.statusCode = 401;
      throw error;
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

app.post("/ads", requireAuth, async (request, response, next) => {
  try {
    const adInput = buildAdCreateInput(request.body);

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
    const where = {
      status: "PUBLISHED",
    };
    let orderBy = [{ createdAt: "desc" }];

    if (sort === "price_asc") {
      orderBy = [{ price: "asc" }, { createdAt: "desc" }];
    } else if (sort === "price_desc") {
      orderBy = [{ price: "desc" }, { createdAt: "desc" }];
    } else if (sort !== "newest") {
      const error = new Error("Invalid sort option");
      error.statusCode = 400;
      throw error;
    }

    if (type) {
      if (!adTypes.has(type)) {
        const error = new Error("Invalid ad type filter");
        error.statusCode = 400;
        throw error;
      }

      where.type = type;
    }

    if (typeof request.query.category === "string" && request.query.category.trim()) {
      where.category = {
        equals: request.query.category.trim(),
        mode: "insensitive",
      };
    }

    if (typeof request.query.city === "string" && request.query.city.trim()) {
      where.city = {
        equals: request.query.city.trim(),
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
      const error = new Error("Invalid ad id");
      error.statusCode = 400;
      throw error;
    }

    const ad = await prisma.ad.findUnique({
      where: { id: adId },
    });

    if (!ad) {
      const error = new Error("Ad not found");
      error.statusCode = 404;
      throw error;
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
      const error = new Error("Invalid ad id");
      error.statusCode = 400;
      throw error;
    }

    const existingAd = await prisma.ad.findUnique({
      where: { id: adId },
      select: { ownerId: true },
    });

    if (!existingAd) {
      const error = new Error("Ad not found");
      error.statusCode = 404;
      throw error;
    }

    if (existingAd.ownerId !== request.auth.userId) {
      const error = new Error("You are not allowed to modify this ad");
      error.statusCode = 403;
      throw error;
    }

    const ad = await prisma.ad.update({
      where: { id: adId },
      data: buildAdUpdateInput(request.body),
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
      const error = new Error("Invalid ad id");
      error.statusCode = 400;
      throw error;
    }

    const existingAd = await prisma.ad.findUnique({
      where: { id: adId },
      select: { ownerId: true },
    });

    if (!existingAd) {
      const error = new Error("Ad not found");
      error.statusCode = 404;
      throw error;
    }

    if (existingAd.ownerId !== request.auth.userId) {
      const error = new Error("You are not allowed to delete this ad");
      error.statusCode = 403;
      throw error;
    }

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
    const { content } = request.body;

    if (Number.isNaN(adId) || adId <= 0) {
      const error = new Error("Invalid ad id");
      error.statusCode = 400;
      throw error;
    }

    if (typeof content !== "string" || content.trim().length < 1) {
      const error = new Error("Message content is required");
      error.statusCode = 400;
      throw error;
    }

    const ad = await prisma.ad.findUnique({
      where: { id: adId },
      select: { id: true, ownerId: true },
    });

    if (!ad) {
      const error = new Error("Ad not found");
      error.statusCode = 404;
      throw error;
    }

    if (ad.ownerId === request.auth.userId) {
      const error = new Error("You cannot message your own ad");
      error.statusCode = 403;
      throw error;
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

    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        conversationId: conversation.id,
        senderId: request.auth.userId,
      },
    });

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
        ad: true,
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
      const error = new Error("Invalid conversation id");
      error.statusCode = 400;
      throw error;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      const error = new Error("Conversation not found");
      error.statusCode = 404;
      throw error;
    }

    if (
      conversation.ownerId !== request.auth.userId &&
      conversation.participantId !== request.auth.userId
    ) {
      const error = new Error("You are not allowed to access this conversation");
      error.statusCode = 403;
      throw error;
    }

    response.json(conversation);
  } catch (error) {
    next(error);
  }
});

app.use((request, _response, next) => {
  const error = new Error(`Route not found: ${request.method} ${request.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

app.use((error, _request, response, _next) => {
  const statusCode = error.statusCode || 500;

  response.status(statusCode).json({
    error: error.message || "Internal server error",
  });
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});