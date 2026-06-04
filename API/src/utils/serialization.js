const { AD_KIND, DEFAULT_PROFILE_STORAGE_KEY, PROFILE_KIND, buildAssetUrl } = require("./assets");

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value?.toNumber === "function") {
    return value.toNumber();
  }

  if (typeof value?.toString === "function" && typeof value === "object") {
    return Number(value.toString());
  }

  return Number(value);
}

function serializeAvatar(avatar, request) {
  if (avatar?.storageKey) {
    return {
      storageKey: avatar.storageKey,
      mimeType: avatar.mimeType,
      originalName: avatar.originalName,
      url: buildAssetUrl(request, PROFILE_KIND, avatar.storageKey),
      isDefault: false,
    };
  }

  return {
    storageKey: DEFAULT_PROFILE_STORAGE_KEY,
    mimeType: "image/avif",
    originalName: "default-profile.avif",
    url: buildAssetUrl(request, PROFILE_KIND, DEFAULT_PROFILE_STORAGE_KEY),
    isDefault: true,
  };
}

function serializeUser(user, request) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    pseudo: user.pseudo,
    city: user.city,
    bio: user.bio,
    avatar: serializeAvatar(user.avatar, request),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function serializeAdImage(image, request) {
  return {
    id: image.id,
    storageKey: image.storageKey,
    mimeType: image.mimeType,
    originalName: image.originalName,
    position: image.position,
    url: buildAssetUrl(request, AD_KIND, image.storageKey),
  };
}

function serializeAd(ad, request) {
  const images = Array.isArray(ad.images)
    ? [...ad.images].sort((left, right) => left.position - right.position).map((image) => serializeAdImage(image, request))
    : [];

  return {
    id: ad.id,
    type: ad.type,
    title: ad.title,
    description: ad.description,
    category: ad.category,
    city: ad.city,
    availability: ad.availability,
    priceMode: ad.priceMode,
    priceValue: toNumber(ad.priceValue),
    serviceTerms: ad.serviceTerms,
    status: ad.status,
    ownerId: ad.ownerId,
    owner: serializeUser(ad.owner, request),
    images,
    coverImage: images[0] || null,
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt,
  };
}

function serializeConversationSummary(conversation, request) {
  return {
    ...conversation,
    owner: serializeUser(conversation.owner, request),
    participant: serializeUser(conversation.participant, request),
  };
}

module.exports = {
  serializeAd,
  serializeAvatar,
  serializeConversationSummary,
  serializeUser,
};