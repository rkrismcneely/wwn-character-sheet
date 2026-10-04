const RECOVERY_PREFIX = "recovery/";

export const R2_RECOVERY_RETENTION_DAYS = 35;

export function r2RecoveryObjectKey(
  sourceKey: string,
  retiredAt = new Date(),
  recoveryId = crypto.randomUUID(),
): string {
  const timestamp = retiredAt.toISOString().replaceAll(":", "-");
  return `${RECOVERY_PREFIX}${sourceKey}/${timestamp}-${recoveryId}`;
}

export async function retireR2ObjectWithRecovery(
  bucket: R2Bucket,
  sourceKey: string,
  retiredAt = new Date(),
): Promise<boolean> {
  try {
    const object = await bucket.get(sourceKey);
    if (!object) return true;

    const retiredAtIso = retiredAt.toISOString();
    const recoveryKey = r2RecoveryObjectKey(sourceKey, retiredAt);
    await bucket.put(recoveryKey, await object.arrayBuffer(), {
      httpMetadata: object.httpMetadata,
      customMetadata: {
        ...object.customMetadata,
        tweRecoverySourceKey: sourceKey,
        tweRecoveryRetiredAt: retiredAtIso,
      },
    });
    await bucket.delete(sourceKey);
    return true;
  } catch (error) {
    console.error(
      "R2 object retirement skipped because a recovery copy could not be guaranteed.",
      error,
    );
    return false;
  }
}
