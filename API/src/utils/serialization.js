const { AD_KIND, PROFILE_KIND, buildAssetUrl, mimeTypeForStorageKey, pickDefaultProfileKey } = require("./assets");

function toNumber(value) {
  if (value == null) return null
  if (typeof value === "number") return value
  return parseFloat(String(value))
}

function serializeAvatar(avatar, request, seed) {
  if (avatar?.storageKey) {
    return {
      storageKey: avatar.storageKey,
      mimeType: avatar.mimeType,
      originalName: avatar.originalName,
      url: buildAssetUrl(request, PROFILE_KIND, avatar.storageKey),
      isDefault: false,
    };
  }

  const storageKey = pickDefaultProfileKey(seed);
  return {
    storageKey,
    mimeType: mimeTypeForStorageKey(storageKey),
    originalName: "default-profile",
    url: buildAssetUrl(request, PROFILE_KIND, storageKey),
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
    avatar: serializeAvatar(user.avatar, request, user.id),
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