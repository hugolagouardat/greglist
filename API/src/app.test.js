const test = require("node:test");
const assert = require("node:assert/strict");
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

async function resetDatabase() {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.ad.deleteMany();
  await prisma.user.deleteMany();
}

async function registerUser(user) {
  const response = await request(app)
    .post("/register")
    .send(user)
    .expect(201);

  return response.body;
}

test.beforeEach(async () => {
  await resetDatabase();
});

test.after(async () => {
  await resetDatabase();
  await prisma.$disconnect();
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