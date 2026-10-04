# Character save-failure recovery

Tales Without End keeps a small browser-local recovery copy when an editable cloud character has changes that are not yet confirmed online.

## What is protected

- Each cloud character uses its own local recovery key.
- Recovery records are scoped to the signed-in account that created them.
- The record stores the latest browser copy, the character public ID, the online version it was based on when that version can be verified, and a timestamp.
- A confirmed successful save clears the local recovery record.
- A failed save keeps the record and blocks ordinary navigation through the existing character save guard.
- When the browser reports that connectivity has returned, a normal failed save gets one retry through the existing Save Now path.

## Conflict safety

Recovery never guesses that it is safe to overwrite a newer online character.

Restore to Original is enabled only when the recovery record has a verified base version and the current online character is still exactly that version. If the online version changed, the original disappeared, ownership changed, or the recovery base version cannot be proven, the user can instead save the recovered data as a new private character.

Conflict-state recovery records deliberately discard their base version so they cannot later be mistaken for a safe overwrite candidate.

## Portraits

A recovered character saved as a new copy starts without a portrait. The existing portrait object belongs to the original character lifecycle; a new copy must upload its own portrait rather than sharing the same R2 object.

## Data location

These recovery records live only in that browser's localStorage. They are not a replacement for the D1/R2 operational backup procedure. A recovery JSON download is also available as a manual escape hatch.
