require("dotenv").config()

const cors = require("cors")
const express = require("express")
const helmet = require("helmet")
const morgan = require("morgan")
const multer = require("multer")
const prisma = require("./lib/prisma")
const { requireAuth } = require("./middleware/auth")
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
} = require("./utils/assets")
const { serializeAd, serializeConversationSummary, serializeUser } = require("./utils/serialization")
const { hashPassword, verifyPassword } = require("./utils/hash")
const { signAuthToken, verifyAuthToken } = require("./utils/token")

const app = express()
const port = process.env.PORT || 3000

const AD_TYPES = ["OFFER", "REQUEST"]
const AD_CATEGORIES = ["HOME_HELP", "GARDENING", "TUTORING", "IT_SUPPORT", "BEAUTY_WELLNESS", "EVENTS", "MOVING_DELIVERY", "OTHER"]
const PRICE_MODES = ["FREE", "HOURLY", "FIXED"]
const SERVICE_TERMS = ["REMOTE", "AT_PROVIDER", "AT_CUSTOMER"]
const AD_STATUSES = ["DRAFT", "PUBLISHED"]
const MAX_AD_IMAGES = 10

// Erreur HTTP avec un code de statut
function createHttpError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

// Lit le token Bearer si présent, sans bloquer la requête
function getOptionalAuth(req) {
  const authorization = req.headers.authorization
  if (!authorization || !authorization.startsWith("Bearer ")) return null
  const token = authorization.slice(7).trim()
  if (!token) return null
  try {
    return verifyAuthToken(token)
  } catch {
    return null
  }
}

// Pour les routes multipart, le payload JSON est dans body.payload
function parseBodyPayload(req) {
  if (req.is("multipart/form-data")) {
    if (typeof req.body?.payload !== "string") {
      throw createHttpError("Payload manquant", 400)
    }
    try {
      return JSON.parse(req.body.payload)
    } catch {
      throw createHttpError("Payload JSON invalide", 400)
    }
  }
  return req.body
}

// --- Gestion de la galerie d'images ---
// Ces fonctions permettent de gérer le réordonnancement des images lors des mises à jour.

function normalizeIntegerList(value, fieldName) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw createHttpError(`${fieldName} invalide`, 400)
  return [...new Set(value.map((entry) => {
    const parsed = parseInt(String(entry), 10)
    if (isNaN(parsed) || parsed <= 0) throw createHttpError(`${fieldName} invalide`, 400)
    return parsed
  }))]
}

function normalizeStringList(value, fieldName) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw createHttpError(`${fieldName} invalide`, 400)
  return [...new Set(value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) throw createHttpError(`${fieldName} invalide`, 400)
    return entry.trim()
  }))]
}

function normalizeImageOrder(value) {
  if (value === undefined) return null
  if (!Array.isArray(value)) throw createHttpError("imageOrder invalide", 400)
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw createHttpError("imageOrder invalide", 400)
    }
    if (entry.type === "existing") {
      const id = parseInt(String(entry.id), 10)
      if (isNaN(id) || id <= 0) throw createHttpError("imageOrder invalide", 400)
      return { type: "existing", id }
    }
    if (entry.type === "new") {
      if (typeof entry.clientId !== "string" || !entry.clientId.trim()) {
        throw createHttpError("imageOrder invalide", 400)
      }
      return { type: "new", clientId: entry.clientId.trim() }
    }
    throw createHttpError("imageOrder invalide", 400)
  })
}

function hasAdImageMutation(payload, files) {
  return Boolean(
    (Array.isArray(files) && files.length > 0) ||
    payload.imageOrder !== undefined ||
    payload.removedImageIds !== undefined,
  )
}

function buildAdImagePlan(existingImages, payload, files, { allowExisting }) {
  const normalizedFiles = Array.isArray(files) ? files : []
  const removedImageIds = new Set(normalizeIntegerList(payload.removedImageIds, "removedImageIds"))
  const newImageClientIds = normalizeStringList(payload.newImageClientIds, "newImageClientIds")
  const imageOrder = normalizeImageOrder(payload.imageOrder)
  const existingById = new Map(existingImages.map((img) => [img.id, img]))
  const retainedExistingIds = new Set()
  const finalEntries = []

  if (normalizedFiles.length > MAX_AD_IMAGES) {
    throw createHttpError(`Maximum ${MAX_AD_IMAGES} images par annonce`, 400)
  }

  if (imageOrder) {
    if (newImageClientIds.length !== normalizedFiles.length) {
      throw createHttpError("newImageClientIds invalide", 400)
    }
    const fileByClientId = new Map()
    newImageClientIds.forEach((clientId, index) => {
      if (fileByClientId.has(clientId)) throw createHttpError("newImageClientIds invalide", 400)
      fileByClientId.set(clientId, normalizedFiles[index])
    })

    for (const entry of imageOrder) {
      if (entry.type === "existing") {
        if (!allowExisting) throw createHttpError("imageOrder invalide", 400)
        const existingImage = existingById.get(entry.id)
        if (!existingImage || removedImageIds.has(entry.id) || retainedExistingIds.has(entry.id)) {
          throw createHttpError("imageOrder invalide", 400)
        }
        retainedExistingIds.add(entry.id)
        finalEntries.push({ type: "existing", image: existingImage })
        continue
      }
      const file = fileByClientId.get(entry.clientId)
      if (!file) throw createHttpError("imageOrder invalide", 400)
      fileByClientId.delete(entry.clientId)
      finalEntries.push({ type: "new", file })
    }
    if (fileByClientId.size > 0) throw createHttpError("imageOrder invalide", 400)
  } else {
    if (allowExisting) {
      for (const img of [...existingImages].sort((a, b) => a.position - b.position)) {
        if (!removedImageIds.has(img.id)) {
          retainedExistingIds.add(img.id)
          finalEntries.push({ type: "existing", image: img })
        }
      }
    }
    normalizedFiles.forEach((file) => finalEntries.push({ type: "new", file }))
  }

  if (finalEntries.length > MAX_AD_IMAGES) {
    throw createHttpError(`Maximum ${MAX_AD_IMAGES} images par annonce`, 400)
  }

  return {
    removedImages: allowExisting ? existingImages.filter((img) => !retainedExistingIds.has(img.id)) : [],
    finalEntries,
  }
}

// Récupère une annonce et vérifie que l'utilisateur en est le propriétaire
async function getOwnedAdOrThrow(adId, userId) {
  const ad = await prisma.ad.findUnique({
    where: { id: adId },
    include: { images: { orderBy: { position: "asc" } } },
  })
  if (!ad) throw createHttpError("Annonce introuvable", 404)
  if (ad.ownerId !== userId) throw createHttpError("Accès refusé", 403)
  return ad
}

// Récupère une conversation et vérifie que l'utilisateur en est un participant
async function getConversationForUserOrThrow(conversationId, userId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      ad: {
        select: {
          id: true,
          title: true,
          status: true,
          images: { orderBy: { position: "asc" } },
        },
      },
      owner: { include: { avatar: true } },
      participant: { include: { avatar: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!conversation) throw createHttpError("Conversation introuvable", 404)
  if (conversation.ownerId !== userId && conversation.participantId !== userId) {
    throw createHttpError("Accès refusé", 403)
  }
  return conversation
}

// Upload de photos de profil (une seule image, max 5 Mo)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(createHttpError("Format d'image non supporté", 400))
      return
    }
    cb(null, true)
  },
})

// Upload de photos d'annonce (max 10 images, 15 Mo chacune)
const adImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_AD_IMAGES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(createHttpError("Format d'image non supporté", 400))
      return
    }
    cb(null, true)
  },
})

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))
app.use(cors({ origin: ["http://127.0.0.1:4173", "http://localhost:4173"] }))
app.use(morgan("dev"))
app.use(express.json())
app.use("/static/profile", express.static(PROFILE_DIRECTORY))
app.use("/static/annonce", express.static(AD_DIRECTORY))

app.get("/", (req, res) => {
  res.json({ status: "ok" })
})

// --- Authentification ---

app.post("/register", async (req, res, next) => {
  try {
    const { pseudo, city, bio, password } = req.body

    if (!pseudo || pseudo.trim().length < 3) return next(createHttpError("Pseudo trop court (3 caractères min.)", 400))
    if (!city || city.trim().length < 2) return next(createHttpError("Ville invalide", 400))
    if (!password || password.length < 8) return next(createHttpError("Mot de passe trop court (8 caractères min.)", 400))
    if (bio !== undefined && typeof bio !== "string") return next(createHttpError("Bio invalide", 400))

    const existingUser = await prisma.user.findUnique({ where: { pseudo: pseudo.trim() } })
    if (existingUser) return next(createHttpError("Ce pseudo est déjà pris", 409))

    const user = await prisma.user.create({
      data: {
        pseudo: pseudo.trim(),
        city: city.trim(),
        bio: typeof bio === "string" && bio.trim() ? bio.trim() : null,
        password: await hashPassword(password),
      },
      include: { avatar: true },
    })

    const token = signAuthToken({ userId: user.id, pseudo: user.pseudo })
    res.status(201).json({ token, user: serializeUser(user, req) })
  } catch (error) {
    next(error)
  }
})

app.post("/login", async (req, res, next) => {
  try {
    const { pseudo, password } = req.body

    if (!pseudo || pseudo.trim().length < 3) return next(createHttpError("Pseudo invalide", 400))
    if (!password || password.length < 8) return next(createHttpError("Mot de passe invalide", 400))

    const user = await prisma.user.findUnique({
      where: { pseudo: pseudo.trim() },
      include: { avatar: true },
    })

    if (!user || !(await verifyPassword(password, user.password))) {
      return next(createHttpError("Identifiants incorrects", 401))
    }

    const token = signAuthToken({ userId: user.id, pseudo: user.pseudo })
    res.json({ token, user: serializeUser(user, req) })
  } catch (error) {
    next(error)
  }
})

app.post("/logout", requireAuth, (req, res) => {
  res.status(204).send()
})

// --- Profil utilisateur ---

app.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      include: { avatar: true },
    })
    if (!user) return next(createHttpError("Utilisateur introuvable", 404))
    res.json({ user: serializeUser(user, req) })
  } catch (error) {
    next(error)
  }
})

app.put("/me", requireAuth, async (req, res, next) => {
  try {
    const { pseudo, city, bio, currentPassword, newPassword } = req.body
    const update = {}

    if (pseudo !== undefined) {
      if (!pseudo || pseudo.trim().length < 3) return next(createHttpError("Pseudo trop court", 400))
      update.pseudo = pseudo.trim()
    }
    if (city !== undefined) {
      if (!city || city.trim().length < 2) return next(createHttpError("Ville invalide", 400))
      update.city = city.trim()
    }
    if (bio !== undefined) {
      if (typeof bio !== "string") return next(createHttpError("Bio invalide", 400))
      update.bio = bio.trim() || null
    }

    const changingPassword = currentPassword !== undefined || newPassword !== undefined
    if (changingPassword) {
      if (!currentPassword || currentPassword.length < 8) return next(createHttpError("Mot de passe actuel invalide", 400))
      if (!newPassword || newPassword.length < 8) return next(createHttpError("Nouveau mot de passe trop court", 400))
    }

    if (Object.keys(update).length === 0 && !changingPassword) {
      return next(createHttpError("Aucun champ à modifier", 400))
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      include: { avatar: true },
    })
    if (!existingUser) return next(createHttpError("Utilisateur introuvable", 404))

    if (update.pseudo && update.pseudo !== existingUser.pseudo) {
      const taken = await prisma.user.findUnique({ where: { pseudo: update.pseudo } })
      if (taken && taken.id !== existingUser.id) return next(createHttpError("Ce pseudo est déjà pris", 409))
    }

    if (changingPassword) {
      const valid = await verifyPassword(currentPassword, existingUser.password)
      if (!valid) return next(createHttpError("Mot de passe actuel incorrect", 401))
      update.password = await hashPassword(newPassword)
    }

    const user = await prisma.user.update({
      where: { id: existingUser.id },
      data: update,
      include: { avatar: true },
    })
    res.json({ user: serializeUser(user, req) })
  } catch (error) {
    next(error)
  }
})

app.put("/me/avatar", requireAuth, avatarUpload.single("avatar"), async (req, res, next) => {
  const storedFiles = []
  try {
    if (!req.file) return next(createHttpError("Fichier avatar requis", 400))

    const existingUser = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      include: { avatar: true },
    })
    if (!existingUser) return next(createHttpError("Utilisateur introuvable", 404))

    const [stored] = await writeUploadedFiles(PROFILE_KIND, [req.file])
    storedFiles.push(stored)

    const user = await prisma.$transaction(async (tx) => {
      await tx.userAvatar.deleteMany({ where: { userId: existingUser.id } })
      await tx.userAvatar.create({
        data: {
          userId: existingUser.id,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
        },
      })
      return tx.user.findUnique({ where: { id: existingUser.id }, include: { avatar: true } })
    })

    if (existingUser.avatar?.storageKey) {
      await deleteManagedAsset(PROFILE_KIND, existingUser.avatar.storageKey)
    }
    res.json({ user: serializeUser(user, req) })
  } catch (error) {
    await Promise.all(storedFiles.map((f) => deleteManagedAsset(PROFILE_KIND, f.storageKey)))
    next(error)
  }
})

app.delete("/me/avatar", requireAuth, async (req, res, next) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      include: { avatar: true },
    })
    if (!existingUser) return next(createHttpError("Utilisateur introuvable", 404))

    const oldKey = existingUser.avatar?.storageKey || null
    await prisma.userAvatar.deleteMany({ where: { userId: existingUser.id } })
    if (oldKey) await deleteManagedAsset(PROFILE_KIND, oldKey)

    const user = await prisma.user.findUnique({ where: { id: existingUser.id }, include: { avatar: true } })
    res.json({ user: serializeUser(user, req) })
  } catch (error) {
    next(error)
  }
})

app.delete("/me", requireAuth, async (req, res, next) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      include: {
        avatar: true,
        ads: { select: { images: { orderBy: { position: "asc" } } } },
      },
    })
    if (!existingUser) return next(createHttpError("Utilisateur introuvable", 404))

    await prisma.user.delete({ where: { id: existingUser.id } })

    const toDelete = []
    if (existingUser.avatar?.storageKey) toDelete.push({ kind: PROFILE_KIND, storageKey: existingUser.avatar.storageKey })
    for (const ad of existingUser.ads) {
      for (const img of ad.images) toDelete.push({ kind: AD_KIND, storageKey: img.storageKey })
    }
    await deleteManagedAssets(toDelete)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

// --- Annonces ---

app.get("/me/ads", requireAuth, async (req, res, next) => {
  try {
    const ads = await prisma.ad.findMany({
      where: { ownerId: req.auth.userId },
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { include: { avatar: true } },
        images: { orderBy: { position: "asc" } },
      },
    })
    res.json(ads.map((ad) => serializeAd(ad, req)))
  } catch (error) {
    next(error)
  }
})

app.post("/ads", requireAuth, adImagesUpload.array("images", MAX_AD_IMAGES), async (req, res, next) => {
  const storedFiles = []
  try {
    const payload = parseBodyPayload(req)
    const { type, title, description, category, city, availability, priceMode, serviceTerms } = payload

    if (!AD_TYPES.includes(type)) return next(createHttpError("Type invalide", 400))
    if (!AD_CATEGORIES.includes(category)) return next(createHttpError("Catégorie invalide", 400))
    if (!PRICE_MODES.includes(priceMode)) return next(createHttpError("Mode de tarif invalide", 400))
    if (!title || title.trim().length < 3) return next(createHttpError("Titre trop court (3 caractères min.)", 400))
    if (!description || description.trim().length < 10) return next(createHttpError("Description trop courte (10 caractères min.)", 400))
    if (!city || city.trim().length < 2) return next(createHttpError("Ville invalide", 400))
    if (!Array.isArray(serviceTerms) || serviceTerms.length === 0) return next(createHttpError("Au moins une modalité requise", 400))
    if (!serviceTerms.every((t) => SERVICE_TERMS.includes(t))) return next(createHttpError("Modalité invalide", 400))

    let priceValue = null
    if (priceMode !== "FREE") {
      priceValue = parseFloat(payload.priceValue)
      if (isNaN(priceValue) || priceValue < 0) return next(createHttpError("Tarif invalide", 400))
    }

    const status = AD_STATUSES.includes(payload.status) ? payload.status : "DRAFT"

    const imagePlan = buildAdImagePlan([], payload, req.files, { allowExisting: false })
    const persisted = await writeUploadedFiles(AD_KIND, imagePlan.finalEntries.filter((e) => e.type === "new").map((e) => e.file))
    storedFiles.push(...persisted)

    const ad = await prisma.ad.create({
      data: {
        type,
        title: title.trim(),
        description: description.trim(),
        category,
        city: city.trim(),
        availability: availability?.trim() || null,
        priceMode,
        priceValue,
        serviceTerms,
        status,
        ownerId: req.auth.userId,
        images: {
          create: persisted.map((img, i) => ({
            storageKey: img.storageKey,
            originalName: img.originalName,
            mimeType: img.mimeType,
            position: i,
          })),
        },
      },
      include: {
        owner: { include: { avatar: true } },
        images: { orderBy: { position: "asc" } },
      },
    })
    res.status(201).json(serializeAd(ad, req))
  } catch (error) {
    await Promise.all(storedFiles.map((f) => deleteManagedAsset(AD_KIND, f.storageKey)))
    next(error)
  }
})

app.get("/ads", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : ""
    const type = typeof req.query.type === "string" ? req.query.type.trim() : ""
    const sort = typeof req.query.sort === "string" ? req.query.sort.trim() : "newest"
    const category = typeof req.query.category === "string" ? req.query.category.trim() : ""
    const city = typeof req.query.city === "string" ? req.query.city.trim() : ""

    const where = { status: "PUBLISHED" }
    let orderBy = [{ createdAt: "desc" }]

    if (sort === "price_asc") orderBy = [{ priceValue: "asc" }, { createdAt: "desc" }]
    else if (sort === "price_desc") orderBy = [{ priceValue: "desc" }, { createdAt: "desc" }]
    else if (sort !== "newest") return next(createHttpError("Tri invalide", 400))

    if (type) {
      if (!AD_TYPES.includes(type)) return next(createHttpError("Type de filtre invalide", 400))
      where.type = type
    }
    if (category) {
      if (!AD_CATEGORIES.includes(category)) return next(createHttpError("Catégorie invalide", 400))
      where.category = category
    }
    if (city) {
      where.city = { equals: city, mode: "insensitive" }
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    const ads = await prisma.ad.findMany({
      where,
      orderBy,
      include: {
        owner: { include: { avatar: true } },
        images: { orderBy: { position: "asc" } },
      },
    })
    res.json(ads.map((ad) => serializeAd(ad, req)))
  } catch (error) {
    next(error)
  }
})

app.get("/ads/:id", async (req, res, next) => {
  try {
    const adId = parseInt(req.params.id, 10)
    if (isNaN(adId) || adId <= 0) return next(createHttpError("Id invalide", 400))

    const ad = await prisma.ad.findUnique({
      where: { id: adId },
      include: {
        owner: { include: { avatar: true } },
        images: { orderBy: { position: "asc" } },
      },
    })
    if (!ad) return next(createHttpError("Annonce introuvable", 404))

    const auth = getOptionalAuth(req)
    if (ad.status !== "PUBLISHED" && auth?.userId !== ad.ownerId) {
      return next(createHttpError("Annonce introuvable", 404))
    }
    res.json(serializeAd(ad, req))
  } catch (error) {
    next(error)
  }
})

app.put("/ads/:id", requireAuth, adImagesUpload.array("images", MAX_AD_IMAGES), async (req, res, next) => {
  const storedFiles = []
  try {
    const adId = parseInt(req.params.id, 10)
    if (isNaN(adId) || adId <= 0) return next(createHttpError("Id invalide", 400))

    const payload = parseBodyPayload(req)
    const existingAd = await getOwnedAdOrThrow(adId, req.auth.userId)
    const shouldMutateImages = hasAdImageMutation(payload, req.files)

    const hasFieldUpdate = ["type", "title", "description", "category", "city", "availability", "priceMode", "priceValue", "serviceTerms", "status"].some((f) => f in payload)
    if (!hasFieldUpdate && !shouldMutateImages) {
      return next(createHttpError("Aucun champ à modifier", 400))
    }

    // Fusionne les données existantes avec le payload
    const type = payload.type ?? existingAd.type
    const title = payload.title ?? existingAd.title
    const description = payload.description ?? existingAd.description
    const category = payload.category ?? existingAd.category
    const city = payload.city ?? existingAd.city
    const availability = payload.availability !== undefined ? payload.availability : existingAd.availability
    const priceMode = payload.priceMode ?? existingAd.priceMode
    const serviceTerms = payload.serviceTerms ?? existingAd.serviceTerms
    const status = payload.status ?? existingAd.status

    if (!AD_TYPES.includes(type)) return next(createHttpError("Type invalide", 400))
    if (!AD_CATEGORIES.includes(category)) return next(createHttpError("Catégorie invalide", 400))
    if (!PRICE_MODES.includes(priceMode)) return next(createHttpError("Mode de tarif invalide", 400))
    if (!AD_STATUSES.includes(status)) return next(createHttpError("Statut invalide", 400))
    if (!title || title.trim().length < 3) return next(createHttpError("Titre trop court", 400))
    if (!description || description.trim().length < 10) return next(createHttpError("Description trop courte", 400))
    if (!city || city.trim().length < 2) return next(createHttpError("Ville invalide", 400))
    if (!Array.isArray(serviceTerms) || serviceTerms.length === 0) return next(createHttpError("Au moins une modalité requise", 400))
    if (!serviceTerms.every((t) => SERVICE_TERMS.includes(t))) return next(createHttpError("Modalité invalide", 400))

    let priceValue = "priceValue" in payload
      ? (payload.priceValue !== null ? parseFloat(payload.priceValue) : null)
      : (existingAd.priceValue !== null ? parseFloat(existingAd.priceValue) : null)

    if (priceMode !== "FREE" && (priceValue === null || isNaN(priceValue))) {
      return next(createHttpError("Tarif requis pour ce mode", 400))
    }
    if (priceMode === "FREE") priceValue = null

    const updateData = {
      type,
      title: title.trim(),
      description: description.trim(),
      category,
      city: city.trim(),
      availability: typeof availability === "string" ? (availability.trim() || null) : null,
      priceMode,
      priceValue,
      serviceTerms,
      status,
    }

    const imagePlan = buildAdImagePlan(existingAd.images, payload, req.files, { allowExisting: true })
    const persisted = await writeUploadedFiles(AD_KIND, imagePlan.finalEntries.filter((e) => e.type === "new").map((e) => e.file))
    storedFiles.push(...persisted)

    let createdIndex = 0
    const ad = await prisma.$transaction(async (tx) => {
      if (hasFieldUpdate) {
        await tx.ad.update({ where: { id: adId }, data: updateData })
      }
      if (shouldMutateImages) {
        await tx.adImage.deleteMany({ where: { adId } })
        if (imagePlan.finalEntries.length > 0) {
          await tx.adImage.createMany({
            data: imagePlan.finalEntries.map((entry, position) => {
              if (entry.type === "existing") {
                return { adId, storageKey: entry.image.storageKey, originalName: entry.image.originalName, mimeType: entry.image.mimeType, position }
              }
              const img = persisted[createdIndex++]
              return { adId, storageKey: img.storageKey, originalName: img.originalName, mimeType: img.mimeType, position }
            }),
          })
        }
      }
      return tx.ad.findUnique({
        where: { id: adId },
        include: {
          owner: { include: { avatar: true } },
          images: { orderBy: { position: "asc" } },
        },
      })
    })

    await deleteManagedAssets(imagePlan.removedImages.map((img) => ({ kind: AD_KIND, storageKey: img.storageKey })))
    res.json(serializeAd(ad, req))
  } catch (error) {
    await Promise.all(storedFiles.map((f) => deleteManagedAsset(AD_KIND, f.storageKey)))
    next(error)
  }
})

app.post("/ads/:id/publish", requireAuth, async (req, res, next) => {
  try {
    const adId = parseInt(req.params.id, 10)
    if (isNaN(adId) || adId <= 0) return next(createHttpError("Id invalide", 400))
    await getOwnedAdOrThrow(adId, req.auth.userId)
    const ad = await prisma.ad.update({
      where: { id: adId },
      data: { status: "PUBLISHED" },
      include: {
        owner: { include: { avatar: true } },
        images: { orderBy: { position: "asc" } },
      },
    })
    res.json(serializeAd(ad, req))
  } catch (error) {
    next(error)
  }
})

app.post("/ads/:id/unpublish", requireAuth, async (req, res, next) => {
  try {
    const adId = parseInt(req.params.id, 10)
    if (isNaN(adId) || adId <= 0) return next(createHttpError("Id invalide", 400))
    await getOwnedAdOrThrow(adId, req.auth.userId)
    const ad = await prisma.ad.update({
      where: { id: adId },
      data: { status: "DRAFT" },
      include: {
        owner: { include: { avatar: true } },
        images: { orderBy: { position: "asc" } },
      },
    })
    res.json(serializeAd(ad, req))
  } catch (error) {
    next(error)
  }
})

app.delete("/ads/:id", requireAuth, async (req, res, next) => {
  try {
    const adId = parseInt(req.params.id, 10)
    if (isNaN(adId) || adId <= 0) return next(createHttpError("Id invalide", 400))
    const existingAd = await getOwnedAdOrThrow(adId, req.auth.userId)
    await prisma.ad.delete({ where: { id: adId } })
    await deleteManagedAssets(existingAd.images.map((img) => ({ kind: AD_KIND, storageKey: img.storageKey })))
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

// --- Messagerie ---

app.post("/ads/:id/conversations", requireAuth, async (req, res, next) => {
  try {
    const adId = parseInt(req.params.id, 10)
    if (isNaN(adId) || adId <= 0) return next(createHttpError("Id invalide", 400))

    const content = req.body?.content
    if (!content || content.trim().length === 0) return next(createHttpError("Message vide", 400))

    const ad = await prisma.ad.findUnique({
      where: { id: adId },
      select: { id: true, ownerId: true, status: true },
    })
    if (!ad || ad.status !== "PUBLISHED") return next(createHttpError("Annonce introuvable", 404))
    if (ad.ownerId === req.auth.userId) return next(createHttpError("Tu ne peux pas contacter ta propre annonce", 403))

    const conversation = await prisma.conversation.upsert({
      where: { adId_ownerId_participantId: { adId: ad.id, ownerId: ad.ownerId, participantId: req.auth.userId } },
      update: {},
      create: { adId: ad.id, ownerId: ad.ownerId, participantId: req.auth.userId },
    })

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: { content: content.trim(), conversationId: conversation.id, senderId: req.auth.userId },
      })
      await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })
      return msg
    })

    res.status(201).json({ conversation, message })
  } catch (error) {
    next(error)
  }
})

app.get("/conversations", requireAuth, async (req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ ownerId: req.auth.userId }, { participantId: req.auth.userId }],
      },
      include: {
        ad: {
          select: {
            id: true,
            title: true,
            status: true,
            images: { orderBy: { position: "asc" } },
          },
        },
        owner: { include: { avatar: true } },
        participant: { include: { avatar: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    })

    res.json(conversations.map((conv) => {
      const coverImage = conv.ad?.images?.[0]
      return serializeConversationSummary(
        {
          ...conv,
          owner: conv.owner,
          participant: conv.participant,
          ad: conv.ad ? {
            id: conv.ad.id,
            title: conv.ad.title,
            status: conv.ad.status,
            coverImage: coverImage ? { ...coverImage, url: buildAssetUrl(req, AD_KIND, coverImage.storageKey) } : null,
          } : null,
        },
        req,
      )
    }))
  } catch (error) {
    next(error)
  }
})

app.get("/conversations/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
    if (isNaN(conversationId) || conversationId <= 0) return next(createHttpError("Id invalide", 400))

    const conv = await getConversationForUserOrThrow(conversationId, req.auth.userId)
    const coverImage = conv.ad?.images?.[0]

    res.json(serializeConversationSummary(
      {
        ...conv,
        owner: conv.owner,
        participant: conv.participant,
        ad: conv.ad ? {
          id: conv.ad.id,
          title: conv.ad.title,
          status: conv.ad.status,
          coverImage: coverImage ? { ...coverImage, url: buildAssetUrl(req, AD_KIND, coverImage.storageKey) } : null,
        } : null,
      },
      req,
    ))
  } catch (error) {
    next(error)
  }
})

app.post("/conversations/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const conversationId = parseInt(req.params.id, 10)
    if (isNaN(conversationId) || conversationId <= 0) return next(createHttpError("Id invalide", 400))

    await getConversationForUserOrThrow(conversationId, req.auth.userId)

    const content = req.body?.content
    if (!content || content.trim().length === 0) return next(createHttpError("Message vide", 400))

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: { content: content.trim(), conversationId, senderId: req.auth.userId },
      })
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
      return msg
    })

    res.status(201).json(message)
  } catch (error) {
    next(error)
  }
})

// Route non trouvée
app.use((req, res, next) => {
  next(createHttpError(`Route introuvable: ${req.method} ${req.originalUrl}`, 404))
})

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Image trop volumineuse" })
    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: `Maximum ${MAX_AD_IMAGES} images par annonce` })
    }
    return res.status(400).json({ error: error.message })
  }
  const statusCode = error.statusCode || 500
  res.status(statusCode).json({ error: error.message || "Erreur serveur interne" })
})

if (require.main === module) {
  ensureStorageDirectories().then(() => {
    app.listen(port, () => {
      console.log(`API démarrée sur le port ${port}`)
    })
  }).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = app
