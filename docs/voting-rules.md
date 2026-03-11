# Toastmasters Council Voting Rules

## Version
**1.1** - Effective March 11, 2026

## Overview
These rules establish how voting power is assigned to registered Council members based on the official Council Member List and Registration List.

## Rule 0: Eligibility

**Rule 0.1: Paid Member Requirement**
- Only members whose `Is Paid` field in the Council Member List equals **`Paid Member`** are eligible to vote.
- Members who appear in the Registration List but are not paid council members are excluded from all vote calculations and from the output.

## Base Rule: Club Votes

**Rule 1.1: Club Eligibility**
- Only members from clubs with `Club Status = Complete` are eligible to receive club votes.
- Each club contributes exactly **2 votes** to be distributed among its registered representatives.

**Rule 1.2: Club Officer Positions**
- Only the following positions are considered for club vote distribution:
  - `Club President`
  - `Club VP Education`

**Rule 1.3: Club Vote Distribution**

| Scenario | President Registered | VP Education Registered | Result |
|----------|:---:|:---:|---------|
| A (Both) | ✓ | ✓ | President gets 1 vote, VPE gets 1 vote |
| B (Only President) | ✓ | ✗ | President gets 2 votes |
| C (Only VPE) | ✗ | ✓ | VPE gets 2 votes |
| D (Neither) | ✗ | ✗ | **No club votes assigned** (club unrepresented) |

A member is considered "registered" if they appear in the Registration List with `Will you be attending?` = YES.

## Leadership Votes

**Rule 2.1: Eligible Leadership Roles**
Registered paid members holding one of the following positions receive an additional **leadership vote**:
- `Area Director`
- `Division Director`
- `Administration Manager`
- `Finance Manager`
- `Public Relations Manager`
- `Club Growth Director`
- `Program Quality Director`
- `District Director`
- `Immediate Past District Director`

**Rule 2.2: Leadership Vote**
- Each registered member in a qualifying leadership role gets exactly **+1** leadership vote.
- This vote is awarded **regardless** of whether the member also holds a club officer position (President or VP Education).
- A member receives at most **1 leadership vote** in total, even if they hold multiple leadership positions.

## Vote Cap

**Rule 3.1: Maximum Votes Per Member**
- No member may carry more than **2 club votes** across all clubs they represent.
- No member may carry more than **1 leadership vote**.
- Maximum total votes per member: **3** (2 club + 1 leadership).

## Overflow Redistribution (Rule 3.2)

When a member would accumulate more than 2 club votes (e.g., because they are the sole registered representative of multiple clubs), votes must be redistributed to maximise the number of clubs with representation.

### Redistribution Algorithm

**Goal**: Keep every member at or below 2 club votes while preserving as many clubs with vote representation as possible.

1. **Identify overflow members**: Those whose total club votes exceed 2.
2. **Processing order**: Sort by club-vote total (descending), then by Member ID (ascending). Process one member at a time per iteration.
3. **For each overflow member, run two passes**:

   **Pass 1 — Hand off clubs with eligible alternates**
   - For each of the member's clubs (in ascending Club ID order), check if the *alternate* registered paid officer for that club has room:
     - If member is President → look for a registered paid VP Education in the same club.
     - If member is VP Education → look for a registered paid President in the same club.
   - An alternate is **eligible** only if: `(alternate's current club votes) + (votes being transferred) ≤ 2`.
   - If eligible: transfer all votes for that club to the alternate; remove those votes from the overflow member.
   - Repeat until the overflow member is within the 2-vote club cap, or no more eligible alternates exist.

   **Pass 2 — Drop remaining clubs if still over cap**
   - If Pass 1 alone is not enough, drop the overflow member's clubs starting from the **highest Club ID** first.
   - Each dropped club emits an **[UNREPRESENTED CLUB]** warning.
   - Continue until the member is at or below 2 club votes.

4. **Iterate**: After each member is resolved, recalculate all totals. If an alternate received votes and is now over their own cap, they are processed in the next loop iteration.

### Redistribution Example

**Scenario**: Alice (paid) is sole registered President of Club A (10001) and Club B (10002). Club A also has Carol (paid VPE) registered. Alice also holds Division Director.

| Item | Alice | Carol |
|------|------:|------:|
| Club A initial | 1 (split) | 1 (split) |
| Club B initial | 2 (sole) | — |
| Leadership | 1 | — |
| **Club total** | **3 → overflow** | **1** |

*Pass 1*: Club A (10001) — Carol is an eligible alternate (1 + 1 = 2 ≤ 2). Transfer Alice's 1 club vote for Club A to Carol.

| Item | Alice | Carol |
|------|------:|------:|
| Club A | 0 | **2** |
| Club B | 2 | — |
| Leadership | 1 | — |
| **Total** | **3** ✓ | **2** ✓ |

Both clubs represented; Alice is within cap.

## Registration Deduplication

**Rule 4.1: Duplicate Registration Entries**
If a member appears multiple times in the Registration List with the same Member Number:
- Retain the **last occurrence** by row order.
- Emit a **[WARNING]** for each duplicated Member Number.
- If the last occurrence has `Will you be attending? = No`, the member is treated as not attending (removed from eligible voters).
- This ensures the most recently submitted response always takes effect.

## Output Format

**Rule 5.1: Output Columns (in order)**
1. `Member Name` (concatenation of `First Name` and `Last Name`)
2. `Member Number`
3. `Email`
4. `Votes Available` (total computed votes, 0–3)

**Rule 5.2: Output Eligibility**
- Only output members who appear in **both** the Council Member List (belonging to a Complete club) and the Registration List with `Will you be attending? = YES`.

## Validation and Diagnostics

The application **must** report the following validation issues (non-blocking; display in UI):
- **Missing registrations**: Council members from Complete clubs with no registration entry.
- **Duplicate Member Numbers**: Multiple entries in Registration List for same Member Number (after dedup, note as warning).
- **Unrepresented clubs**: Complete clubs with no registered Club President or VP Education.
- **Invalid positions**: Council entries with Position Description not matching known roles (log as info).

## Notes for Implementation

1. **Paid status**: Filter by `Is Paid = Paid Member` (case-insensitive) before any vote calculation.
2. **Case sensitivity**: Perform case-insensitive matching on `Will you be attending?` values (accept "yes", "YES", "Yes", "true", "True", "TRUE", "attending", "Attending", etc. as affirmative).
3. **Whitespace**: Trim all string fields during normalization.
4. **CSV parsing**: Support quoted fields; handle embedded commas and newlines within quoted strings.
5. **Council CSV preface**: Skip non-data lines (e.g., "Date Generated: ...") before the header row.
6. **Determinism**: Always sort output by Member ID (ascending) for consistent reproducibility.
7. **Leadership roles**: The list in Rule 2.1 uses the exact `Position Description` values from the Council CSV.

---

**Last Updated**: March 11, 2026  
**Version**: 1.1  
**Author**: Toastmasters Council Voting System
