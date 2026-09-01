const MOCK_EMAIL = "privacy-mock@example.invalid";
const MOCK_USER_ID = "mock-user-130";

export function createDisposablePrivacyFixture() {
  return {
    users: [{ id: MOCK_USER_ID, email: MOCK_EMAIL, name: "Disposable Traveller", preferences: { pace: "balanced", interests: ["food"] } }],
    authUsers: [{ id: MOCK_USER_ID, email: MOCK_EMAIL, emailVerified: true }],
    authAccounts: [{ userId: MOCK_USER_ID, providerId: "credential", passwordHash: "NEVER_EXPORT_A_HASH" }],
    sessions: [{ userId: MOCK_USER_ID, expiresAt: "2026-09-08T12:00:00.000Z", ipAddress: "192.0.2.130", userAgent: "privacy-mock" }],
    verifications: [{ identifier: MOCK_EMAIL, value: "NEVER_EXPORT_A_TOKEN" }],
    trips: [{ id: "mock-trip-130", ownerId: MOCK_USER_ID, title: "Disposable route", brief: "Disposable access request fixture" }],
    bookingAliases: [{ ownerId: MOCK_USER_ID, alias: "mock-booking-130@example.invalid" }],
    bookingCandidates: [{ id: "mock-candidate-130", ownerId: MOCK_USER_ID, source: "forwarded_email", document: { provider: "Mock Rail" } }],
    bookingImportEvents: [{ id: "mock-import-event-130", ownerId: MOCK_USER_ID, candidateId: "mock-candidate-130", resultCode: "candidate_created" }],
    feedback: [{ id: "mock-feedback-130", ownerId: MOCK_USER_ID, comment: "Disposable feedback" }],
    emailEvents: [{ id: "mock-email-event-130", recipientEmail: MOCK_EMAIL, template: "trip_gift", status: "sent" }],
    gifts: [{ id: "mock-gift-130", senderId: "another-disposable-user", recipientEmail: MOCK_EMAIL, note: "Disposable gift" }],
    adminAudit: [{ id: "mock-audit-130", actorEmail: "privacy-operator@example.invalid", action: "rights_case_opened", target: `user:${MOCK_USER_ID}` }],
    localDevice: [{ key: "easyt-home-trip-draft", ownerHint: MOCK_EMAIL, value: "Disposable local draft" }],
    providerCopies: [{ provider: "mock-email-provider", subjectEmail: MOCK_EMAIL, status: "requires_manual_provider_action" }],
  };
}

const copy = (value) => structuredClone(value);

export function simulateAccessRequest(source) {
  const fixture = copy(source);
  return {
    subject: { id: MOCK_USER_ID, email: MOCK_EMAIL },
    generatedAt: "2026-09-01T12:00:00.000Z",
    account: fixture.users.filter((row) => row.id === MOCK_USER_ID),
    authentication: {
      users: fixture.authUsers.filter((row) => row.id === MOCK_USER_ID),
      accounts: fixture.authAccounts.filter((row) => row.userId === MOCK_USER_ID).map(({ passwordHash: _secret, ...metadata }) => metadata),
      sessions: fixture.sessions.filter((row) => row.userId === MOCK_USER_ID),
      verifications: fixture.verifications.filter((row) => row.identifier.toLowerCase() === MOCK_EMAIL).map(({ value: _secret, ...metadata }) => metadata),
    },
    trips: fixture.trips.filter((row) => row.ownerId === MOCK_USER_ID),
    booking: {
      aliases: fixture.bookingAliases.filter((row) => row.ownerId === MOCK_USER_ID),
      candidates: fixture.bookingCandidates.filter((row) => row.ownerId === MOCK_USER_ID),
      events: fixture.bookingImportEvents.filter((row) => row.ownerId === MOCK_USER_ID),
    },
    feedback: fixture.feedback.filter((row) => row.ownerId === MOCK_USER_ID),
    emailEvents: fixture.emailEvents.filter((row) => row.recipientEmail.toLowerCase() === MOCK_EMAIL),
    gifts: fixture.gifts.filter((row) => row.recipientEmail.toLowerCase() === MOCK_EMAIL || row.senderId === MOCK_USER_ID),
    auditReferences: fixture.adminAudit.filter((row) => row.actorEmail.toLowerCase() === MOCK_EMAIL || row.target === `user:${MOCK_USER_ID}`),
    localDevice: fixture.localDevice.filter((row) => row.ownerHint.toLowerCase() === MOCK_EMAIL),
    providerCopies: fixture.providerCopies.filter((row) => row.subjectEmail.toLowerCase() === MOCK_EMAIL),
  };
}

export function simulateCurrentDeletion(source) {
  const fixture = copy(source);
  fixture.feedback = fixture.feedback.filter((row) => row.ownerId !== MOCK_USER_ID);
  fixture.sessions = fixture.sessions.filter((row) => row.userId !== MOCK_USER_ID);
  fixture.authAccounts = fixture.authAccounts.filter((row) => row.userId !== MOCK_USER_ID);
  fixture.verifications = fixture.verifications.filter((row) => row.identifier.toLowerCase() !== MOCK_EMAIL);
  fixture.bookingAliases = fixture.bookingAliases.filter((row) => row.ownerId !== MOCK_USER_ID);
  const deletedCandidateIds = new Set(fixture.bookingCandidates.filter((row) => row.ownerId === MOCK_USER_ID).map((row) => row.id));
  fixture.bookingCandidates = fixture.bookingCandidates.filter((row) => row.ownerId !== MOCK_USER_ID);
  fixture.bookingImportEvents = fixture.bookingImportEvents.map((row) => row.ownerId === MOCK_USER_ID || deletedCandidateIds.has(row.candidateId)
    ? { ...row, ownerId: null, candidateId: null }
    : row);
  fixture.trips = fixture.trips.filter((row) => row.ownerId !== MOCK_USER_ID);
  fixture.users = fixture.users.filter((row) => row.id !== MOCK_USER_ID);
  fixture.authUsers = fixture.authUsers.filter((row) => row.id !== MOCK_USER_ID);
  fixture.adminAudit.push({
    id: "mock-deletion-audit-130",
    actorEmail: "privacy-operator@example.invalid",
    action: "account_deleted",
    target: `user:${MOCK_USER_ID}`,
  });
  return fixture;
}

export function summarizeExercise() {
  const source = createDisposablePrivacyFixture();
  const access = simulateAccessRequest(source);
  const afterDeletion = simulateCurrentDeletion(source);
  return {
    fixture: { disposable: true, email: MOCK_EMAIL, databaseOpened: false, providerCalled: false },
    access: {
      categoriesFound: Object.keys(access).filter((key) => !["subject", "generatedAt"].includes(key)),
      passwordHashExported: JSON.stringify(access).includes("NEVER_EXPORT_A_HASH"),
      verificationTokenExported: JSON.stringify(access).includes("NEVER_EXPORT_A_TOKEN"),
    },
    deletion: {
      canonicalAccountRemaining: afterDeletion.users.some((row) => row.id === MOCK_USER_ID),
      cloudTripRemaining: afterDeletion.trips.some((row) => row.ownerId === MOCK_USER_ID),
      authRecordRemaining: afterDeletion.authUsers.some((row) => row.id === MOCK_USER_ID) || afterDeletion.authAccounts.some((row) => row.userId === MOCK_USER_ID),
      emailEventResiduals: afterDeletion.emailEvents.filter((row) => row.recipientEmail.toLowerCase() === MOCK_EMAIL).length,
      recipientGiftResiduals: afterDeletion.gifts.filter((row) => row.recipientEmail.toLowerCase() === MOCK_EMAIL).length,
      deidentifiedImportEventResiduals: afterDeletion.bookingImportEvents.filter((row) => row.ownerId === null && row.candidateId === null).length,
      deletionAuditResiduals: afterDeletion.adminAudit.filter((row) => row.target === `user:${MOCK_USER_ID}`).length,
      localDeviceResiduals: afterDeletion.localDevice.filter((row) => row.ownerHint.toLowerCase() === MOCK_EMAIL).length,
      providerResiduals: afterDeletion.providerCopies.filter((row) => row.subjectEmail.toLowerCase() === MOCK_EMAIL).length,
    },
    verdict: "manual_residual_search_required",
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  console.log(JSON.stringify(summarizeExercise(), null, 2));
}
