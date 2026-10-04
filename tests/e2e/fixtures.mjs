export const E2E_ORIGIN = "http://127.0.0.1:4173";
export const E2E_AUTH_SECRET = "e2e-only-better-auth-secret-2026-10-04-long";

export const E2E_SESSION_TOKENS = {
  userA: "e2e-user-a-session-token",
  userB: "e2e-user-b-session-token",
};

export const E2E_CHARACTER_IDS = {
  userA: `chr_${"A".repeat(22)}`,
  userB: `chr_${"B".repeat(22)}`,
};

export const E2E_CAMPAIGN_ID = `cmp_${"C".repeat(22)}`;

const createdAt = "2026-10-04T12:00:00.000Z";

function characterData({ name, player, className, hpCurrent }) {
  return JSON.stringify({
    name,
    player,
    level: 1,
    classMode: "full",
    className,
    classOne: className,
    attrs: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hpCurrent,
    hpMax: 6,
    hpRolls: [6],
  }).replaceAll("'", "''");
}

export function e2eFixtureSql() {
  const userAData = characterData({
    name: "User A Sentinel",
    player: "Player A",
    className: "Warrior",
    hpCurrent: 5,
  });
  const userBData = characterData({
    name: "User B Scholar",
    player: "Player B",
    className: "Expert",
    hpCurrent: 6,
  });

  return `
    INSERT INTO user
      (id, name, email, email_verified, role, created_at, updated_at)
    VALUES
      ('e2e-user-a', 'User A', 'user-a@example.invalid', 1, 'user',
       1791115200000, 1791115200000),
      ('e2e-user-b', 'User B', 'user-b@example.invalid', 1, 'user',
       1791115200000, 1791115200000);

    INSERT INTO characters
      (id, owner_user_id, public_id, visibility, portrait_key, name, player,
       class_label, level, data, version, created_at, updated_at)
    VALUES
      ('e2e-character-a', 'e2e-user-a', '${E2E_CHARACTER_IDS.userA}', 'private', NULL,
       'User A Sentinel', 'Player A', 'Warrior', 1, '${userAData}', 1, '${createdAt}', '${createdAt}'),
      ('e2e-character-b', 'e2e-user-b', '${E2E_CHARACTER_IDS.userB}', 'private', NULL,
       'User B Scholar', 'Player B', 'Expert', 1, '${userBData}', 1, '${createdAt}', '${createdAt}');

    INSERT INTO campaigns
      (id, public_id, owner_user_id, name, description, version, created_at, updated_at)
    VALUES
      ('e2e-campaign', '${E2E_CAMPAIGN_ID}', 'e2e-user-a', 'E2E Test Campaign',
       'Disposable browser smoke campaign.', 1, '${createdAt}', '${createdAt}');

    INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
    VALUES ('e2e-campaign', 'e2e-user-a', 'gm', '${createdAt}');

    INSERT INTO campaign_characters (campaign_id, character_id, added_at)
    VALUES ('e2e-campaign', 'e2e-character-a', '${createdAt}');

    INSERT INTO campaign_maps
      (id, campaign_id, name, is_active, background_key, background_content_type,
       background_width, background_height, grid_enabled, grid_size,
       grid_offset_x, grid_offset_y, version, created_at, updated_at)
    VALUES
      ('e2e-map', 'e2e-campaign', 'E2E Map', 1, NULL, NULL, NULL, NULL,
       0, 64, 0, 0, 1, '${createdAt}', '${createdAt}');

    INSERT INTO campaign_map_preferences (map_id, campaign_id, snap_enabled, updated_at)
    VALUES ('e2e-map', 'e2e-campaign', 0, '${createdAt}');

    INSERT INTO session
      (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
    VALUES
      ('e2e-user-a-session', 1893456000000, '${E2E_SESSION_TOKENS.userA}',
       1791115200000, 1791115200000, '127.0.0.1', 'playwright', 'e2e-user-a'),
      ('e2e-user-b-session', 1893456000000, '${E2E_SESSION_TOKENS.userB}',
       1791115200000, 1791115200000, '127.0.0.1', 'playwright', 'e2e-user-b');
  `;
}
