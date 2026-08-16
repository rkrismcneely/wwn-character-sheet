export const E2E_ORIGIN = "http://127.0.0.1:4173";
export const E2E_AUTH_SECRET = "e2e-only-better-auth-secret-2026-08-15-long";
export const E2E_SESSION_TOKENS = {
  userA: "e2e-user-a-session-token",
  userB: "e2e-user-b-session-token",
  admin: "e2e-admin-session-token",
};

export const E2E_CHARACTER_IDS = {
  userAPrivate: `chr_${"A".repeat(22)}`,
  userBPrivate: `chr_${"B".repeat(22)}`,
  public: `chr_${"P".repeat(22)}`,
  unlisted: `chr_${"U".repeat(22)}`,
  adminPrivate: `chr_${"M".repeat(22)}`,
};

const createdAt = "2026-08-15T00:00:00.000Z";

function characterInsert({
  id,
  owner,
  publicId,
  visibility,
  name,
  player,
  classLabel,
  level,
}) {
  const data = JSON.stringify({
    name,
    player,
    level,
    classOne: classLabel,
  }).replaceAll("'", "''");

  return `
    INSERT INTO characters
      (id, owner_user_id, public_id, visibility, portrait_key, name, player,
       class_label, level, data, version, created_at, updated_at)
    VALUES
      ('${id}', '${owner}', '${publicId}', '${visibility}', NULL,
       '${name}', '${player}', '${classLabel}', ${level}, '${data}',
       1, '${createdAt}', '${createdAt}');
  `;
}

export function e2eFixtureSql() {
  const characters = [
    {
      id: "e2e-user-a-private",
      owner: "e2e-user-a",
      publicId: E2E_CHARACTER_IDS.userAPrivate,
      visibility: "private",
      name: "User A Sentinel",
      player: "Player A",
      classLabel: "Warrior",
      level: 3,
    },
    {
      id: "e2e-user-b-private",
      owner: "e2e-user-b",
      publicId: E2E_CHARACTER_IDS.userBPrivate,
      visibility: "private",
      name: "User B Scholar",
      player: "Player B",
      classLabel: "Expert",
      level: 2,
    },
    {
      id: "e2e-public",
      owner: "e2e-user-b",
      publicId: E2E_CHARACTER_IDS.public,
      visibility: "public",
      name: "Public Wayfarer",
      player: "Player B",
      classLabel: "Adventurer",
      level: 4,
    },
    {
      id: "e2e-unlisted",
      owner: "e2e-user-b",
      publicId: E2E_CHARACTER_IDS.unlisted,
      visibility: "unlisted",
      name: "Unlisted Envoy",
      player: "Player B",
      classLabel: "Expert",
      level: 1,
    },
    {
      id: "e2e-admin-private",
      owner: "e2e-admin",
      publicId: E2E_CHARACTER_IDS.adminPrivate,
      visibility: "private",
      name: "Admin Archivist",
      player: "Administrator",
      classLabel: "Mage",
      level: 5,
    },
  ].map(characterInsert).join("\n");

  return `
    INSERT INTO user
      (id, name, email, email_verified, role, created_at, updated_at)
    VALUES
      ('e2e-user-a', 'User A', 'user-a@example.invalid', 1, 'user',
       1786752000000, 1786752000000),
      ('e2e-user-b', 'User B', 'user-b@example.invalid', 1, 'user',
       1786752000000, 1786752000000),
      ('e2e-admin', 'Admin User', 'admin@example.invalid', 1, 'admin',
       1786752000000, 1786752000000);

    ${characters}

    INSERT INTO session
      (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
    VALUES
      ('e2e-user-a-session', 1893456000000, '${E2E_SESSION_TOKENS.userA}',
       1786752000000, 1786752000000, '127.0.0.1', 'playwright', 'e2e-user-a'),
      ('e2e-user-b-session', 1893456000000, '${E2E_SESSION_TOKENS.userB}',
       1786752000000, 1786752000000, '127.0.0.1', 'playwright', 'e2e-user-b'),
      ('e2e-admin-session', 1893456000000, '${E2E_SESSION_TOKENS.admin}',
       1786752000000, 1786752000000, '127.0.0.1', 'playwright', 'e2e-admin');
  `;
}
