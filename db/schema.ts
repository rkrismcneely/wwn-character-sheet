import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.generated";

export const characters = sqliteTable(
  "characters",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    publicId: text("public_id"),
    visibility: text("visibility").notNull().default("private"),
    portraitKey: text("portrait_key"),
    archivedAt: text("archived_at"),
    name: text("name").notNull(),
    player: text("player").notNull().default(""),
    classLabel: text("class_label").notNull().default(""),
    level: integer("level").notNull().default(1),
    data: text("data").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("characters_public_id_unique").on(table.publicId),
    index("characters_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
    index("characters_visibility_updated_idx").on(
      table.visibility,
      table.updatedAt,
    ),
    index("characters_owner_archive_updated_idx").on(
      table.ownerUserId,
      table.archivedAt,
      table.updatedAt,
    ),
    check(
      "characters_visibility_check",
      sql`${table.visibility} in ('private', 'unlisted', 'public')`,
    ),
  ],
);

export const characterRevisions = sqliteTable("character_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  characterId: text("character_id").notNull(),
  version: integer("version").notNull(),
  data: text("data").notNull(),
  savedAt: text("saved_at").notNull(),
});

export const legacyCharacterClaims = sqliteTable(
  "legacy_character_claims",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    claimedAt: text("claimed_at"),
    claimedByUserId: text("claimed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("legacy_character_claims_token_hash_unique").on(
      table.tokenHash,
    ),
    index("legacy_character_claims_status_idx").on(
      table.claimedAt,
      table.revokedAt,
      table.expiresAt,
    ),
  ],
);

export const legacyCharacterClaimItems = sqliteTable(
  "legacy_character_claim_items",
  {
    claimId: text("claim_id")
      .notNull()
      .references(() => legacyCharacterClaims.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.claimId, table.characterId] }),
    index("legacy_character_claim_items_character_idx").on(table.characterId),
  ],
);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    archivedAt: text("archived_at"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("campaigns_public_id_unique").on(table.publicId),
    index("campaigns_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
    index("campaigns_owner_archive_updated_idx").on(
      table.ownerUserId,
      table.archivedAt,
      table.updatedAt,
    ),
    check(
      "campaigns_public_id_check",
      sql`length(${table.publicId}) = 26 and substr(${table.publicId}, 1, 4) = 'cmp_'`,
    ),
  ],
);

export const campaignMembers = sqliteTable(
  "campaign_members",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["gm", "player"] }).notNull(),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.userId] }),
    index("campaign_members_user_joined_idx").on(
      table.userId,
      table.joinedAt,
    ),
    check(
      "campaign_members_role_check",
      sql`${table.role} in ('gm', 'player')`,
    ),
  ],
);

export const campaignCharacters = sqliteTable(
  "campaign_characters",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    addedAt: text("added_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.characterId] }),
    index("campaign_characters_character_idx").on(table.characterId),
  ],
);

export const campaignInvites = sqliteTable(
  "campaign_invites",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    role: text("role", { enum: ["player"] }).notNull().default("player"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("campaign_invites_token_hash_unique").on(table.tokenHash),
    index("campaign_invites_campaign_status_idx").on(
      table.campaignId,
      table.acceptedAt,
      table.revokedAt,
      table.expiresAt,
    ),
    check("campaign_invites_role_check", sql`${table.role} = 'player'`),
    check(
      "campaign_invites_token_hash_check",
      sql`length(${table.tokenHash}) = 64 and ${table.tokenHash} not glob '*[^0-9a-f]*'`,
    ),
  ],
);


export const campaignResources = sqliteTable(
  "campaign_resources",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: text("type", { enum: ["text", "link"] }).notNull(),
    content: text("content").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("campaign_resources_campaign_position_idx").on(
      table.campaignId,
      table.position,
      table.createdAt,
    ),
    check(
      "campaign_resources_type_check",
      sql`${table.type} in ('text', 'link')`,
    ),
  ],
);

export const campaignItems = sqliteTable(
  "campaign_items",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["mundane", "magical", "weapon", "armor"] }).notNull().default("mundane"),
    description: text("description").notNull().default(""),
    propertiesJson: text("properties_json").notNull().default("{}"),
    visibilityMode: text("visibility_mode", { enum: ["all", "selected"] }).notNull().default("all"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("campaign_items_campaign_name_idx").on(table.campaignId, table.name, table.updatedAt),
    check("campaign_items_kind_check", sql`${table.kind} in ('mundane', 'magical', 'weapon', 'armor')`),
    check("campaign_items_visibility_check", sql`${table.visibilityMode} in ('all', 'selected')`),
  ],
);

export const campaignItemCharacters = sqliteTable(
  "campaign_item_characters",
  {
    campaignItemId: text("campaign_item_id").notNull().references(() => campaignItems.id, { onDelete: "cascade" }),
    characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.campaignItemId, table.characterId] }),
    index("campaign_item_characters_character_idx").on(table.characterId, table.campaignItemId),
  ],
);

export const campaignSessions = sqliteTable(
  "campaign_sessions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    startedByUserId: text("started_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    endedByUserId: text("ended_by_user_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("campaign_sessions_campaign_started_idx").on(table.campaignId, table.startedAt),
  ],
);

export const campaignSessionParticipants = sqliteTable(
  "campaign_session_participants",
  {
    sessionId: text("session_id").notNull().references(() => campaignSessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.userId] }),
    index("campaign_session_participants_user_idx").on(table.userId),
  ],
);

/** Campaign journal pages, including folders (kind = folder). */
export const campaignJournalEntries = sqliteTable(
  "campaign_journal_entries",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    kind: text("kind", { enum: ["folder", "page"] }).notNull().default("page"),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    icon: text("icon").notNull().default("file-text"),
    visibility: text("visibility", { enum: ["gm", "players", "selected"] }).notNull().default("gm"),
    source: text("source"),
    sourcePath: text("source_path"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("campaign_journal_campaign_parent_idx").on(table.campaignId, table.parentId),
    uniqueIndex("campaign_journal_source_path_idx").on(table.campaignId, table.source, table.sourcePath),
    check("campaign_journal_kind_check", sql`${table.kind} in ('folder', 'page')`),
    check("campaign_journal_visibility_check", sql`${table.visibility} in ('gm', 'players', 'selected')`),
  ],
);

export const campaignJournalReaders = sqliteTable(
  "campaign_journal_readers",
  {
    entryId: text("entry_id").notNull().references(() => campaignJournalEntries.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.userId] }),
    index("campaign_journal_readers_user_idx").on(table.userId),
  ],
);

export const campaignJournalFiles = sqliteTable(
  "campaign_journal_files",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    entryId: text("entry_id").notNull().references(() => campaignJournalEntries.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("campaign_journal_files_entry_idx").on(table.campaignId, table.entryId),
    uniqueIndex("campaign_journal_files_storage_key_unique").on(table.storageKey),
  ],
);

export const campaignAvailability=sqliteTable("campaign_availability",{
  campaignId:text("campaign_id").notNull().references(()=>campaigns.id,{onDelete:"cascade"}),
  userId:text("user_id").notNull().references(()=>user.id,{onDelete:"cascade"}),
  sessionDate:text("session_date").notNull(),
  status:text("status",{enum:["yes","maybe","no"]}).notNull(),
  updatedAt:text("updated_at").notNull(),
},table=>[
  primaryKey({columns:[table.campaignId,table.userId,table.sessionDate]}),
  index("campaign_availability_by_date_idx").on(table.campaignId,table.sessionDate),
]);

export const campaignGameDays=sqliteTable("campaign_game_days",{
 campaignId:text("campaign_id").notNull().references(()=>campaigns.id,{onDelete:"cascade"}),
 sessionDate:text("session_date").notNull(),
 createdBy:text("created_by").notNull().references(()=>user.id),
 createdAt:text("created_at").notNull(),
},table=>[primaryKey({columns:[table.campaignId,table.sessionDate]})]);

export const campaignPreparedEncounters=sqliteTable("campaign_prepared_encounters",{
 id:text("id").primaryKey(),
 campaignId:text("campaign_id").notNull().references(()=>campaigns.id,{onDelete:"cascade"}),
 name:text("name").notNull(),
 entriesJson:text("entries_json").notNull(),
 createdAt:text("created_at").notNull(),
 updatedAt:text("updated_at").notNull(),
},table=>[index("campaign_prepared_encounters_campaign_idx").on(table.campaignId,table.updatedAt)]);


// Recording ingestion foundation. Craig access keys are private; never
// return sourceReference through a client API response.
export const campaignRecapSpeakers = sqliteTable("campaign_recap_speakers", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  speakerKey: text("speaker_key").notNull(),
  discordUserId: text("discord_user_id"),
  discordName: text("discord_name").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["player", "gm", "guest"] }).notNull(),
  characterId: text("character_id").references(() => characters.id, { onDelete: "set null" }),
  characterName: text("character_name"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("campaign_recap_speakers_campaign_key_unique").on(table.campaignId, table.speakerKey),
  index("campaign_recap_speakers_campaign_idx").on(table.campaignId, table.updatedAt),
]);

export const campaignRecapRecordingImports = sqliteTable("campaign_recap_recording_imports", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => user.id),
  sourceType: text("source_type", { enum: ["craig", "upload", "drive"] }).notNull(),
  sourceReference: text("source_reference").notNull(),
  sourceLabel: text("source_label").notNull(),
  sessionDate: text("session_date").notNull(),
  status: text("status", { enum: ["awaiting_speakers", "ready", "processing", "failed", "completed"] }).notNull().default("awaiting_speakers"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  index("campaign_recap_recordings_campaign_idx").on(table.campaignId, table.createdAt),
]);

export const campaignRecapRecordingSpeakers = sqliteTable("campaign_recap_recording_speakers", {
  importId: text("import_id").notNull().references(() => campaignRecapRecordingImports.id, { onDelete: "cascade" }),
  associationId: text("association_id"),
  discordUserId: text("discord_user_id"),
  discordName: text("discord_name").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["player", "gm", "guest"] }).notNull(),
  characterId: text("character_id"),
  characterName: text("character_name"),
}, table => [
  primaryKey({ columns: [table.importId, table.discordName] }),
]);


/** Durable multi-hour Session Recap v2 jobs; this schema does not activate processing. */
export const campaignRecapProcessingJobs = sqliteTable("campaign_recap_processing_jobs", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  importId: text("import_id").notNull().references(() => campaignRecapRecordingImports.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull().references(() => user.id),
  sourceLane: text("source_lane", { enum: ["craig-multitrack", "audio-upload", "timed-captions"] }).notNull(),
  status: text("status", { enum: ["awaiting_source", "queued", "preparing", "transcribing", "assembling", "awaiting_review", "completed", "failed", "cancelled"] }).notNull().default("awaiting_source"),
  provider: text("provider").notNull().default("none"),
  recapId: text("recap_id").references(() => campaignSessionRecaps.id, {onDelete: "set null"}),
  providerConnectionId: text("provider_connection_id"),
  quotaMode: text("quota_mode", {enum: ["provider-free-only", "gm-owned-paid-allowed"]}).notNull().default("provider-free-only"),
  nextEligibleAt: text("next_eligible_at"),
  pausedAt: text("paused_at"),
  cancelledAt: text("cancelled_at"),
  sourceManifestKey: text("source_manifest_key"),
  assembledTranscriptKey: text("assembled_transcript_key"),
  assembledAt: text("assembled_at"),
  assemblyCursor: integer("assembly_cursor").notNull().default(0),
  assemblyLeaseToken: text("assembly_lease_token"),
  assemblyLeaseExpiresAt: text("assembly_lease_expires_at"),
  durationMs: integer("duration_ms"),
  speakerTracks: integer("speaker_tracks"),
  totalChunks: integer("total_chunks").notNull().default(0),
  completedChunks: integer("completed_chunks").notNull().default(0),
  failedChunks: integer("failed_chunks").notNull().default(0),
  maxCostMicrousd: integer("max_cost_microusd").notNull().default(0),
  spentCostMicrousd: integer("spent_cost_microusd").notNull().default(0),
  sourceCheckedAt: text("source_checked_at"),
  sourceVerifyAttemptedAt: text("source_verify_attempted_at"),
  sourceVerifiedAt: text("source_verified_at"),
  failureCode: text("failure_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("campaign_recap_processing_jobs_import_idx").on(table.importId),
  index("campaign_recap_processing_jobs_campaign_idx").on(table.campaignId, table.createdAt),
  index("campaign_recap_processing_jobs_status_idx").on(table.status, table.updatedAt),
  index("campaign_recap_processing_jobs_gemini_schedule_idx").on(table.provider, table.status, table.nextEligibleAt, table.updatedAt),
  index("campaign_recap_processing_jobs_owner_recap_idx").on(table.requestedBy, table.recapId, table.createdAt),
  index("campaign_recap_processing_jobs_assembly_idx").on(table.provider,table.status,table.assembledAt,table.assemblyLeaseExpiresAt),
]);

export const campaignRecapProcessingChunks = sqliteTable("campaign_recap_processing_chunks", {
  jobId: text("job_id").notNull().references(() => campaignRecapProcessingJobs.id, { onDelete: "cascade" }),
  trackIndex: integer("track_index").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  status: text("status", { enum: ["pending", "leased", "completed", "failed", "skipped"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: text("lease_token"),
  leaseExpiresAt: text("lease_expires_at"),
  transcriptKey: text("transcript_key"),
  audioKey: text("audio_key"),
  audioMimeType: text("audio_mime_type"),
  audioBytes: integer("audio_bytes"),
  sourceDigest: text("source_digest"),
  driveAssetId: text("drive_asset_id"),
  providerInteractionId: text("provider_interaction_id"),
  providerSubmittedAt: text("provider_submitted_at"),
  providerPollAfter: text("provider_poll_after"),
  nextEligibleAt: text("next_eligible_at"),
  errorCode: text("error_code"),
  updatedAt: text("updated_at").notNull(),
}, table => [
  primaryKey({ columns: [table.jobId, table.trackIndex, table.chunkIndex] }),
  index("campaign_recap_processing_chunks_work_idx").on(table.jobId, table.status, table.trackIndex, table.chunkIndex),
  index("campaign_recap_processing_chunks_eligible_idx").on(table.status, table.nextEligibleAt, table.leaseExpiresAt),
  index("campaign_recap_processing_chunks_asset_idx").on(table.driveAssetId),
]);


/** Typed mirror of the existing 0032 session recaps migration. */
export const campaignSessionRecaps = sqliteTable("campaign_session_recaps", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  sessionDate: text("session_date").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  index("campaign_session_recaps_date_idx").on(table.campaignId, table.sessionDate, table.createdAt, table.id),
]);

/** Per-user connected storage, never shared as a campaign credential. */
export const userRecapStorageConnections = sqliteTable("user_recap_storage_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["google-drive", "dropbox", "onedrive"] }).notNull(),
  displayName: text("display_name").notNull().default(""),
  grantedScopes: text("granted_scopes").notNull().default(""),
  status: text("status", { enum: ["disconnected", "connected", "reconnect_required"] }).notNull().default("disconnected"),
  credentialCiphertext: text("credential_ciphertext"),
  credentialNonce: text("credential_nonce"),
  credentialVersion: integer("credential_version"),
  connectedAt: text("connected_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("user_recap_storage_connections_id_owner_idx").on(table.id, table.userId),
  index("user_recap_storage_connections_owner_idx").on(table.userId, table.provider),
]);

/** Every connected transcription account is exclusively owned by one TWE user.
 * Secret material is encrypted before D1 insertion; no campaign can share a key.
 */
export const userRecapAIConnections = sqliteTable("user_recap_ai_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["gemini"] }).notNull(),
  status: text("status", { enum: ["connected", "disconnected", "needs_attention"] }).notNull(),
  keyCiphertext: text("key_ciphertext"),
  keyNonce: text("key_nonce"),
  keyVersion: integer("key_version"),
  keyFingerprint: text("key_fingerprint"),
  connectedAt: text("connected_at"),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("user_recap_ai_connections_user_provider_unique").on(table.userId,table.provider),
  index("user_recap_ai_connections_owner_idx").on(table.userId,table.provider,table.status),
]);

/** Stable, provider-neutral audio association. Remote file IDs are server-only. */
export const campaignRecapAudioAssets = sqliteTable("campaign_recap_audio_assets", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  recapId: text("recap_id").references(() => campaignSessionRecaps.id, { onDelete: "set null" }),
  recordingImportId: text("recording_import_id").references(() => campaignRecapRecordingImports.id, { onDelete: "set null" }),
  connectionId: text("connection_id").notNull(),
  storageOwnerUserId: text("storage_owner_user_id").notNull(),
  remoteFileId: text("remote_file_id"),
  processingJobId: text("processing_job_id"),
  label: text("label").notNull().default(""),
  mimeType: text("mime_type"),
  byteSize: integer("byte_size"),
  durationMs: integer("duration_ms"),
  trackIndex: integer("track_index").notNull().default(0),
  offsetMs: integer("offset_ms").notNull().default(0),
  primaryAudio: integer("primary_audio", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["preparing", "ready", "auth_required", "unavailable"] }).notNull().default("preparing"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  index("campaign_recap_audio_assets_recap_idx").on(table.campaignId, table.recapId, table.primaryAudio, table.createdAt),
  index("campaign_recap_audio_assets_connection_idx").on(table.connectionId, table.status),
  index("campaign_recap_audio_assets_processing_idx").on(table.processingJobId,table.storageOwnerUserId,table.status),
  uniqueIndex("campaign_recap_audio_assets_one_primary_idx").on(table.recapId).where(sql`${table.recapId} IS NOT NULL AND ${table.primaryAudio} = 1`),
]);


export const userRecapStorageOAuthStates = sqliteTable("user_recap_storage_oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [
  index("user_recap_storage_oauth_states_owner_idx").on(table.userId, table.expiresAt),
]);
