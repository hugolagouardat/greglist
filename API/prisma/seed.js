require("dotenv").config({ quiet: true });

const prisma = require("../src/lib/prisma");
const { hashPassword } = require("../src/utils/hash");

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

async function main() {
  await upsertUser({
    pseudo: "diane",
    city: "Paris",
    bio: "Propose des services de jardinage et d'aide a domicile.",
    password: "secret987",
  });

  await upsertUser({
    pseudo: "emma",
    city: "Lyon",
    bio: "Recherche des services ponctuels et depannages locaux.",
    password: "secret654",
  });

  console.log("Seed completed: test users are available.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });