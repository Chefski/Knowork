import {
  KNOWORK_RULES_END_MARKER,
  KNOWORK_RULES_START_MARKER,
} from './protocol-text.js';

export function applyRulesBlock(existing: string | null, block: string): string {
  if (existing === null) {
    return block;
  }

  const startIdx = existing.indexOf(KNOWORK_RULES_START_MARKER);
  const endIdx = existing.indexOf(KNOWORK_RULES_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // The new block already ends with `\n`; consuming the trailing newline
    // after the end marker keeps the file byte-identical across re-applies.
    const endMarkerEnd = endIdx + KNOWORK_RULES_END_MARKER.length;
    const suffixStart =
      existing[endMarkerEnd] === '\n' ? endMarkerEnd + 1 : endMarkerEnd;
    return existing.slice(0, startIdx) + block + existing.slice(suffixStart);
  }

  if (existing.length === 0) {
    return block;
  }

  // Separate appended block from prior content with exactly one blank line,
  // but don't double-up if the file already ends with one.
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
