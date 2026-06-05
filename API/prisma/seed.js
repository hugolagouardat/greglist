require("dotenv").config({ quiet: true });

const fs = require("node:fs/promises");
const path = require("node:path");
const prisma = require("../src/lib/prisma");
const { hashPassword } = require("../src/utils/hash");
const { AD_DIRECTORY, PROFILE_DIRECTORY, ensureStorageDirectories } = require("../src/utils/assets");

const adFixturesDirectory = path.join(__dirname, "..", "src", "img", "annonce");

const mimeTypeByExtension = {
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const demoUsers = [
  {
    pseudo: "diane",
    city: "Paris",
    bio: "Propose des services de jardinage et d'aide a domicile.",
    password: "secret987",
  },
  {
    pseudo: "emma",
    city: "Lyon",
    bio: "Recherche des services ponctuels et depannages locaux.",
    password: "secret654",
  },
  {
    pseudo: "leo",
    city: "Bordeaux",
    bio: "Donne des cours et aide sur les outils numeriques.",
    password: "secret321",
  },
  {
    pseudo: "nora",
    city: "Nantes",
    bio: "Disponible pour evenements, livraisons et petits services du quotidien.",
    password: "secret159",
  },
];

const demoAds = [
  {
    ownerPseudo: "diane",
    type: "OFFER",
    title: "Jardinage et taille de haies le week-end",
    description: "Entretien de jardin, tonte et taille pour petits exterieurs autour de Paris.",
    category: "GARDENING",
    city: "Paris",
    availability: "Samedi matin et dimanche apres-midi",
    priceMode: "HOURLY",
    priceValue: "25.00",
    serviceTerms: ["AT_CUSTOMER"],
    status: "PUBLISHED",
    imageSources: [
      "lucid-origin_Candid_snapshot_of_a_chipped_and_faded_ceramic_garden_gnome_strangely_painted_in-0.jpg",
      "lucid-origin_High-detail_photo_of_a_collection_of_old_rusty_hand_tools_hammers_screwdrivers_w-0.jpg",
    ],
  },
  {
    ownerPseudo: "diane",
    type: "OFFER",
    title: "Aide menagere et courses a domicile",
    description: "Menage leger, rangement et courses de proximite pour personnes actives ou seniors.",
    category: "HOME_HELP",
    city: "Paris",
    availability: "En semaine apres 18h",
    priceMode: "HOURLY",
    priceValue: "22.00",
    serviceTerms: ["AT_CUSTOMER"],
    status: "PUBLISHED",
    imageSources: [
      "gemini-2.5-flash-image_Photorealistic_image_of_a_worn_brown_fabric_three-seater_sofa._A_few_faint_stain-0.jpg",
    ],
  },
  {
    ownerPseudo: "emma",
    type: "REQUEST",
    title: "Recherche aide pour demenagement samedi",
    description: "Besoin de deux heures d'aide pour porter des cartons et charger un utilitaire.",
    category: "MOVING_DELIVERY",
    city: "Lyon",
    availability: "Samedi a partir de 10h",
    priceMode: "FIXED",
    priceValue: "80.00",
    serviceTerms: ["AT_CUSTOMER"],
    status: "PUBLISHED",
    imageSources: [
      "lucid-origin_Realistic_amateur_snapshot_of_a_slightly_dented_blue_2005_Ford_Focus_parked_on_a-0.jpg",
    ],
  },
  {
    ownerPseudo: "emma",
    type: "REQUEST",
    title: "Cherche depannage informatique a domicile",
    description: "PC lent et imprimante mal configuree, intervention souhaitee en soiree.",
    category: "IT_SUPPORT",
    city: "Lyon",
    availability: "Lundi ou mardi soir",
    priceMode: "HOURLY",
    priceValue: "30.00",
    serviceTerms: ["AT_CUSTOMER"],
    status: "PUBLISHED",
    imageSources: [
      "lucid-origin_Realistic_photo_of_a_dusty_slightly_yellowed_classic_Nintendo_64_game_console_on-0.jpg",
    ],
  },
  {
    ownerPseudo: "leo",
    type: "OFFER",
    title: "Cours de mathematiques et soutien college",
    description: "Accompagnement en visio ou a domicile pour revoir les bases et preparer les controles.",
    category: "TUTORING",
    city: "Bordeaux",
    availability: "Mercredi et vendredi",
    priceMode: "HOURLY",
    priceValue: "28.00",
    serviceTerms: ["REMOTE", "AT_CUSTOMER"],
    status: "PUBLISHED",
    imageSources: [
      "Gemini_Generated_Image_l3r9nql3r9nql3r9.png",
    ],
  },
  {
    ownerPseudo: "nora",
    type: "OFFER",
    title: "Livraison locale et aide logistique express",
    description: "Transport de petits meubles, colis volumineux et courses urgentes dans Nantes centre.",
    category: "MOVING_DELIVERY",
    city: "Nantes",
    availability: "Tous les jours sauf dimanche matin",
    priceMode: "FIXED",
    priceValue: "35.00",
    serviceTerms: ["AT_CUSTOMER"],
    status: "PUBLISHED",
    imageSources: [
      "lucid-origin_Realistic_candid_snapshot_of_an_old_faded_red_classic_city_bike_with_a_rusted_fr-0.jpg",
      "lucid-origin_Realistic_candid_snapshot_of_an_old_faded_red_classic_city_bike_with_a_rusted_fr-0(1).jpg",
      "lucid-origin_Realistic_candid_snapshot_of_an_old_faded_red_classic_city_bike_with_a_rusted_fr-0(2).jpg",
    ],
  },
];

async function upsertUser({ pseudo, city, bio, password }) {
  return prisma.user.upsert({
    where: { pseudo },
    update: {
      city,
      bio,
      password: await hashPassword(password),
    },
    create: {
      pseudo,
      city,
      bio,
      password: await hashPassword(password),
    },
  });
}

function getMimeTypeForFilename(filename) {
  const extension = path.extname(filename).toLowerCase();
  const mimeType = mimeTypeByExtension[extension];

  if (!mimeType) {
    throw new Error(`Extension non supportee: ${filename}`);
  }

  return mimeType;
}

async function copySeedAsset(sourceDirectory, destinationDirectory, sourceName, targetName) {
  await fs.copyFile(path.join(sourceDirectory, sourceName), path.join(destinationDirectory, targetName));

  return {
    storageKey: targetName,
    originalName: sourceName,
    mimeType: getMimeTypeForFilename(sourceName),
  };
}

async function resetDemoAssets(userIds) {
  const [avatars, adImages] = await Promise.all([
    prisma.userAvatar.findMany({
      where: { userId: { in: userIds } },
      select: { storageKey: true },
    }),
    prisma.adImage.findMany({
      where: { ad: { ownerId: { in: userIds } } },
      select: { storageKey: true },
    }),
  ]);

  await Promise.all([
    ...avatars.map((avatar) => fs.rm(path.join(PROFILE_DIRECTORY, avatar.storageKey), { force: true })),
    ...adImages.map((image) => fs.rm(path.join(AD_DIRECTORY, image.storageKey), { force: true })),
  ]);

  // Les comptes de demo piochent un avatar dans la bibliotheque par defaut: on retire les anciens avatars persistes
  await prisma.userAvatar.deleteMany({ where: { userId: { in: userIds } } });
}

async function resetDemoAds(userIds) {
  await prisma.message.deleteMany({
    where: {
      conversation: {
        ad: {
          ownerId: { in: userIds },
        },
      },
    },
  });

  await prisma.conversation.deleteMany({
    where: {
      ad: {
        ownerId: { in: userIds },
      },
    },
  });

  await prisma.adImage.deleteMany({
    where: {
      ad: {
        ownerId: { in: userIds },
      },
    },
  });

  await prisma.ad.deleteMany({
    where: {
      ownerId: { in: userIds },
    },
  });
}

async function main() {
  await ensureStorageDirectories();
  const users = [];

  for (const demoUser of demoUsers) {
    users.push(await upsertUser(demoUser));
  }

  const userIdByPseudo = new Map(users.map((user) => [user.pseudo, user.id]));
  const userIds = users.map((user) => user.id);
  await resetDemoAssets(userIds);
  await resetDemoAds(userIds);

  for (const [adIndex, ad] of demoAds.entries()) {
    await prisma.ad.create({
      data: {
        type: ad.type,
        title: ad.title,
        description: ad.description,
        category: ad.category,
        city: ad.city,
        availability: ad.availability,
        priceMode: ad.priceMode,
        priceValue: ad.priceValue,
        serviceTerms: ad.serviceTerms,
        status: ad.status,
        ownerId: userIdByPseudo.get(ad.ownerPseudo),
        images: {
          create: await Promise.all(ad.imageSources.map(async (sourceName, imageIndex) => {
            const copiedAsset = await copySeedAsset(
              adFixturesDirectory,
              AD_DIRECTORY,
              sourceName,
              `seed-ad-${adIndex + 1}-${imageIndex + 1}${path.extname(sourceName).toLowerCase()}`,
            );

            return {
              ...copiedAsset,
              position: imageIndex,
            };
          })),
        },
      },
    });
  }

  console.log(`Seed termine: ${users.length} comptes de test et ${demoAds.length} annonces publiees.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });