export const R2_RECOVERY_PREFIX = "recovery/";
export const R2_RECOVERY_RETENTION_DAYS = 30;

interface RetireOptions {
  now?: Date;
  recoveryId?: string;
}

export function recoveryPrefixForObject(originalKey: string): string {
  return `${R2_RECOVERY_PREFIX}${originalKey}/`;
}

export function recoveryObjectKey(
  originalKey: string,
  now = new Date(),
  recoveryId = crypto.randomUUID(),
): string {
  const timestamp = now.toISOString().replaceAll(/[-:.]/gu, "");
  return `${recoveryPrefixForObject(originalKey)}${timestamp}-${recoveryId}`;
}

export async function retireR2Object(
  bucket: R2Bucket,
  originalKey: string,
  options: RetireOptions = {},
): Promise<string | null> {
  const object = await bucket.get(originalKey);
  if (!object) return null;

  const now = options.now ?? new Date();
  const archivedAt = now.toISOString();
  const recoveryKey = recoveryObjectKey(
    originalKey,
    now,
    options.recoveryId ?? crypto.randomUUID(),
  );

  await bucket.put(recoveryKey, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: {
      ...(object.customMetadata ?? {}),
      tweRecoveryOriginalKey: originalKey,
      tweRecoveryArchivedAt: archivedAt,
    },
  });

  // Never delete the committed object unless the recovery copy succeeded.
  await bucket.delete(originalKey);
  return recoveryKey;
}
