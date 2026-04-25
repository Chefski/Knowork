import {
  KNOWORK_RULES_END_MARKER,
  KNOWORK_RULES_START_MARKER,
} from '@apb/shared';

// Manage only the marker-bounded region. Anything outside the markers belongs
// to the user and is preserved byte-for-byte. The block argument is expected
// to come from `knoworkRulesBlock()` and already include both markers and a
// trailing newline.

export function applyRulesBlock(existing: string | null, block: string): string {
  if (existing === null) {
    return block;
  }

  const startIdx = existing.indexOf(KNOWORK_RULES_START_MARKER);
  const endIdx = existing.indexOf(KNOWORK_RULES_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace the entire managed region, including the markers themselves and
    // the newline that follows the end marker (if present). The new block
    // already ends with `\n`, so re-emitting the same suffix keeps the file
    // byte-identical across re-applies.
    const endMarkerEnd = endIdx + KNOWORK_RULES_END_MARKER.length;
    const suffixStart =
      existing[endMarkerEnd] === '\n' ? endMarkerEnd + 1 : endMarkerEnd;
    const before = existing.slice(0, startIdx);
    const after = existing.slice(suffixStart);
    return before + block + after;
  }

  // Append. Separate from prior content with exactly one blank line so the
  // managed region is visually distinct, but only if the file doesn't already
  // end with a blank line.
  if (existing.length === 0) {
    return block;
  }
  let separator: string;
  if (existing.endsWith('\n\n')) {
    separator = '';
  } else if (existing.endsWith('\n')) {
    separator = '\n';
  } else {
    separator = '\n\n';
  }
  return existing + separator + block;
}

export function removeRulesBlock(existing: string): string {
  const startIdx = existing.indexOf(KNOWORK_RULES_START_MARKER);
  const endIdx = existing.indexOf(KNOWORK_RULES_END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return existing;
  }

  const endMarkerEnd = endIdx + KNOWORK_RULES_END_MARKER.length;
  // Consume the newline immediately after the end marker so we don't leave a
  // stray blank line where the block used to be.
  let cutEnd = endMarkerEnd;
  if (existing[cutEnd] === '\n') cutEnd += 1;

  // If removing the block would leave a blank-line pair (the separator we
  // inserted in `applyRulesBlock` when appending), collapse it back to a
  // single newline so apply-then-remove round-trips on append-style files.
  let cutStart = startIdx;
  if (
    cutStart >= 2 &&
    existing[cutStart - 1] === '\n' &&
    existing[cutStart - 2] === '\n'
  ) {
    cutStart -= 1;
  }

  return existing.slice(0, cutStart) + existing.slice(cutEnd);
}
