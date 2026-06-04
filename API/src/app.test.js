const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const request = require("supertest");
const app = require("./app");
const prisma = require("./lib/prisma");

const validAdPayload = {
  type: "OFFER",
  title: "Jardinage du week-end",
  description: "Entretien de jardin et taille de haies pour petits exterieurs.",
  category: "GARDENING",
  city: "Paris",
  availability: "Samedi matin",
  priceMode: "HOURLY",
  priceValue: 25,
  serviceTerms: ["AT_CUSTOMER"],
};

const profileFixture = path.join(__dirname, "img", "profile", "default", "pixelArt-1778341783265.png");
const adFixtureOne = path.join(__dirname, "img", "annonce", "Gemini_Generated_Image_l3r9nql3r9nql3r9.png");
const adFixtureTwo = path.join(__dirname, "img", "annonce", "lucid-origin_Realistic_amateur_snapshot_of_a_slightly_dented_blue_2005_Ford_Focus_parked_on_a-0.jpg");
const adFixtureThree = path.join(__dirname, "img", "annonce", "lucid-origin_Realistic_candid_snapshot_of_an_old_faded_red_classic_city_bike_with_a_rusted_fr-0.jpg");
const managedImagePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(svg|png|avif|jpg|jpeg|webp)$/i;

async function resetDatabase() {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.adImage.deleteMany();
  await prisma.userAvatar.deleteMany();
  await prisma.ad.deleteMany();
  await prisma.user.deleteMany();
}

async function cleanupManagedUploads() {
  await Promise.all([
    cleanupDirectory(path.join(__dirname, "img", "profile")),
    cleanupDirectory(path.join(__dirname, "img", "annonce")),
  ]);
}

async function cleanupDirectory(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || !managedImagePattern.test(entry.name)) {
      return;
    }

    await fs.unlink(path.join(directory, entry.name));
  }));
}

async function registerUser(user) {
  const response = await request(app)
    .post("/register")
    .send(user)
    .expect(201);

  return response.body;
}

async function assertExists(filePath) {
  await fs.access(filePath);
}

async function assertMissing(filePath) {
  await assert.rejects(() => fs.access(filePath));
}

test.beforeEach(async () => {
  await cleanupManagedUploads();
  await resetDatabase();
});

test.after(async () => {
  await cleanupManagedUploads();
  await resetDatabase();
  await prisma.$disconnect();
});

test("uploads, replaces, and removes an avatar while keeping profile serialization usable", async () => {
  const user = await registerUser({
    pseudo: "diane",
    city: "Paris",
    bio: "Profil test",
    password: "secret987",
  });

  const firstUpload = await request(app)
    .put("/me/avatar")
    .set("Authorization", `Bearer ${user.token}`)
    .attach("avatar", profileFixture)
    .expect(200);

  assert.equal(firstUpload.body.user.avatar.isDefault, false);
  assert.match(firstUpload.body.user.avatar.storageKey, managedImagePattern);

  const firstAvatarPath = path.join(__dirname, "img", "profile", firstUpload.body.user.avatar.storageKey);
  await assertExists(firstAvatarPath);

  const replacementUpload = await request(app)
    .put("/me/avatar")
    .set("Authorization", `Bearer ${user.token}`)
    .attach("avatar", profileFixture)
    .expect(200);

  const secondAvatarPath = path.join(__dirname, "img", "profile", replacementUpload.body.user.avatar.storageKey);
  assert.notEqual(replacementUpload.body.user.avatar.storageKey, firstUpload.body.user.avatar.storageKey);
  await assertMissing(firstAvatarPath);
  await assertExists(secondAvatarPath);

  const deletedAvatar = await request(app)
    .delete("/me/avatar")
    .set("Authorization", `Bearer ${user.token}`)
    .expect(200);

  assert.equal(deletedAvatar.body.user.avatar.isDefault, true);
  await assertMissing(secondAvatarPath);
});

test("deleting an account removes its avatar file and cascades owned resources", async () => {
  const user = await registerUser({
    pseudo: "marie",
    city: "Nantes",
    bio: "Profil test",
    password: "secret987",
  });

  const avatarUpload = await request(app)
    .put("/me/avatar")
    .set("Authorization", `Bearer ${user.token}`)
    .attach("avatar", profileFixture)
    .expect(200);

  const avatarPath = path.join(__dirname, "img", "profile", avatarUpload.body.user.avatar.storageKey);
  await assertExists(avatarPath);

  await request(app)
    .delete("/me")
    .set("Authorization", `Bearer ${user.token}`)
    .expect(204);

  await assertMissing(avatarPath);
  assert.equal(await prisma.user.count(), 0);
  assert.equal(await prisma.userAvatar.count(), 0);
});

test("creates an ad with several ordered images and exposes serialization needed by the front", async () => {
  const owner = await registerUser({
    pseudo: "leo",
    city: "Bordeaux",
    bio: "Profil test",
    password: "secret987",
  });

  const createResponse = await request(app)
    .post("/ads")
    .set("Authorization", `Bearer ${owner.token}`)
    .field("payload", JSON.stringify({ ...validAdPayload, status: "PUBLISHED" }))
    .attach("images", adFixtureOne)
    .attach("images", adFixtureTwo)
    .expect(201);

  assert.equal(createResponse.body.images.length, 2);
  assert.equal(createResponse.body.coverImage.position, 0);
  assert.equal(createResponse.body.owner.avatar.isDefault, true);
  assert.match(createResponse.body.images[0].storageKey, managedImagePattern);

  const storedImagePath = path.join(__dirname, "img", "annonce", createResponse.body.images[0].storageKey);
  await assertExists(storedImagePath);

  const publicList = await request(app).get("/ads").expect(200);
  assert.equal(publicList.body.length, 1);
  assert.equal(publicList.body[0].coverImage.storageKey, createResponse.body.images[0].storageKey);
  assert.equal(publicList.body[0].images[1].position, 1);
});

test("rejects creating an ad with more than ten images", async () => {
  const owner = await registerUser({
    pseudo: "jules",
    city: "Lille",
    bio: "Profil test",
    password: "secret987",
  });

  let createRequest = request(app)
    .post("/ads")
    .set("Authorization", `Bearer ${owner.token}`)
    .field("payload", JSON.stringify({ ...validAdPayload, status: "PUBLISHED" }));

  for (let index = 0; index < 11; index += 1) {
    createRequest = createRequest.attach("images", adFixtureOne);
  }

  const response = await createRequest.expect(400);
  assert.equal(response.body.error, "You can upload up to 10 images");
});

test("updates ad images, removes files from disk, and cleans up every image on ad deletion", async () => {
  const owner = await registerUser({
    pseudo: "nora",
    city: "Paris",
    bio: "Profil test",
    password: "secret987",
  });

  const createdAd = await request(app)
    .post("/ads")
    .set("Authorization", `Bearer ${owner.token}`)
    .field("payload", JSON.stringify({ ...validAdPayload, status: "PUBLISHED" }))
    .attach("images", adFixtureOne)
    .attach("images", adFixtureTwo)
    .expect(201);

  const adId = createdAd.body.id;
  const removedImage = createdAd.body.images[0];
  const keptImage = createdAd.body.images[1];
  const removedImagePath = path.join(__dirname, "img", "annonce", removedImage.storageKey);
  const keptImagePath = path.join(__dirname, "img", "annonce", keptImage.storageKey);

  const updatedAd = await request(app)
    .put(`/ads/${adId}`)
    .set("Authorization", `Bearer ${owner.token}`)
    .field(
      "payload",
      JSON.stringify({
        ...validAdPayload,
        status: "PUBLISHED",
        imageOrder: [
          { type: "existing", id: keptImage.id },
          { type: "new", clientId: "fresh-bike" },
        ],
        newImageClientIds: ["fresh-bike"],
      }),
    )
    .attach("images", adFixtureThree)
    .expect(200);

  assert.equal(updatedAd.body.images.length, 2);
  assert.equal(updatedAd.body.images[0].storageKey, keptImage.storageKey);
  assert.notEqual(updatedAd.body.images[1].storageKey, removedImage.storageKey);
  await assertMissing(removedImagePath);
  await assertExists(keptImagePath);

  const newImagePath = path.join(__dirname, "img", "annonce", updatedAd.body.images[1].storageKey);
  await assertExists(newImagePath);

  await request(app)
    .delete(`/ads/${adId}`)
    .set("Authorization", `Bearer ${owner.token}`)
    .expect(204);

  await assertMissing(keptImagePath);
  await assertMissing(newImagePath);
  assert.equal(await prisma.adImage.count(), 0);
  assert.equal(await prisma.ad.count(), 0);
});

test("protects private ad management and enforces compliant ad lifecycle", async () => {
  await request(app).get("/me/ads").expect(401);

  const owner = await registerUser({
    pseudo: "diane",
    city: "Paris",
    bio: "Profil test",
    password: "secret987",
  });
  const otherUser = await registerUser({
    pseudo: "emma",
    city: "Lyon",
    bio: "Profil test",
    password: "secret654",
  });

  const createResponse = await request(app)
    .post("/ads")
    .set("Authorization", `Bearer ${owner.token}`)
    .send(validAdPayload)
    .expect(201);

  assert.equal(createResponse.body.status, "DRAFT");

  const adId = createResponse.body.id;

  const publicListBeforePublish = await request(app).get("/ads").expect(200);
  assert.equal(publicListBeforePublish.body.length, 0);

  await request(app)
    .put(`/ads/${adId}`)
    .set("Authorization", `Bearer ${otherUser.token}`)
    .send({ title: "Tentative" })
    .expect(403);

  await request(app)
    .post(`/ads/${adId}/publish`)
    .set("Authorization", `Bearer ${otherUser.token}`)
    .expect(403);

  await request(app)
    .post(`/ads/${adId}/publish`)
    .set("Authorization", `Bearer ${owner.token}`)
    .expect(200);

  const publicListAfterPublish = await request(app)
    .get("/ads")
    .query({ search: "jardin", category: "GARDENING", type: "OFFER", sort: "price_asc" })
    .expect(200);

  assert.equal(publicListAfterPublish.body.length, 1);
  assert.equal(publicListAfterPublish.body[0].id, adId);

  await request(app)
    .post(`/ads/${adId}/unpublish`)
    .set("Authorization", `Bearer ${owner.token}`)
    .expect(200);

  const publicListAfterUnpublish = await request(app).get("/ads").expect(200);
  assert.equal(publicListAfterUnpublish.body.length, 0);

  await request(app)
    .delete(`/ads/${adId}`)
    .set("Authorization", `Bearer ${otherUser.token}`)
    .expect(403);

  await request(app)
    .delete(`/ads/${adId}`)
    .set("Authorization", `Bearer ${owner.token}`)
    .expect(204);
});

test("supports a two-party conversation with first contact, follow-up messages, inbox visibility, and access control", async () => {
  const owner = await registerUser({
    pseudo: "diane",
    city: "Paris",
    bio: "Profil test",
    password: "secret987",
  });
  const participant = await registerUser({
    pseudo: "emma",
    city: "Lyon",
    bio: "Profil test",
    password: "secret654",
  });
  const outsider = await registerUser({
    pseudo: "lucas",
    city: "Lille",
    bio: "Profil test",
    password: "secret321",
  });

  const adResponse = await request(app)
    .post("/ads")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({
      ...validAdPayload,
      status: "PUBLISHED",
    })
    .expect(201);

  const adId = adResponse.body.id;

  await request(app)
    .post(`/ads/${adId}/conversations`)
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ content: "Je me contacte moi-meme" })
    .expect(403);

  const firstContact = await request(app)
    .post(`/ads/${adId}/conversations`)
    .set("Authorization", `Bearer ${participant.token}`)
    .send({ content: "Bonjour, votre annonce m'interesse." })
    .expect(201);

  const conversationId = firstContact.body.conversation.id;

  const participantInbox = await request(app)
    .get("/conversations")
    .set("Authorization", `Bearer ${participant.token}`)
    .expect(200);

  assert.equal(participantInbox.body.length, 1);
  assert.equal(participantInbox.body[0].messages[0].content, "Bonjour, votre annonce m'interesse.");

  const initialThread = await request(app)
    .get(`/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${owner.token}`)
    .expect(200);

  assert.equal(initialThread.body.messages.length, 1);
  assert.equal(initialThread.body.messages[0].content, "Bonjour, votre annonce m'interesse.");

  await request(app)
    .post(`/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ content: "Bonjour, je suis disponible samedi." })
    .expect(201);

  const updatedThread = await request(app)
    .get(`/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${participant.token}`)
    .expect(200);

  assert.deepEqual(
    updatedThread.body.messages.map((message) => message.content),
    [
      "Bonjour, votre annonce m'interesse.",
      "Bonjour, je suis disponible samedi.",
    ],
  );

  await request(app)
    .get(`/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${outsider.token}`)
    .expect(403);

  const outsiderInbox = await request(app)
    .get("/conversations")
    .set("Authorization", `Bearer ${outsider.token}`)
    .expect(200);

  assert.equal(outsiderInbox.body.length, 0);
});