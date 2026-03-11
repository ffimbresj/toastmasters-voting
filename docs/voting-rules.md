# Toastmasters Council Voting Rules

## Version
**1.0** - Effective March 11, 2026

## Overview
These rules establish how voting power is assigned to registered Council members based on the official Council Member List and Registration List.

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

## Independent Votes: Leadership Roles

**Rule 2.1: Eligible Leadership Roles**
Members holding one of the following positions receive an **additional independent vote** (separate from club votes) if they are registered:
- `Area Director`
- `Area Director Emeritus`
- `Division Director`
- `Division Director Emeritus`
- `District Manager`
- `Club Growth Director`
- `Program Quality Director`
- `District Director`
- `District Director Emeritus`
- `Immediate Past District Director`

**Rule 2.2: Independent Vote Stacking**
- Each registered member in a qualifying leadership role gets exactly **+1** independent vote.
- This vote is **independent** of club votes and does **not** reduce club vote allocation.

## Vote Cap

**Rule 3.1: Maximum Votes Per Member**
- No member may have more than **3 total votes** (combination of club votes + independent leadership votes).
- Total votes = (club votes) + (independent leadership votes)

## Overflow Redistribution (Rule 3.2)

If a member would exceed 3 votes after applying Rules 1 and 2, votes must be redistributed to allow the maximum number of clubs to have vote representation while respecting the vote cap.

### Redistribution Algorithm

1. **Identify overflow members**: Those exceeding 3 total votes.
2. **For each overflow member (in priority order below)**:
   - First, attempt to reassign excess club votes to the alternate registered officer from the **same club** (to keep votes with their club):
     - If President has overflow and VPE is also registered, move up to 1 vote to VPE (if VPE does not exceed cap).
     - If VPE has overflow and President is also registered, move up to 1 vote to President (if President does not exceed cap).
   - If same-club redistribution is not possible:
     - Move excess club votes to the next-prioritized unrepresented or under-represented club (in ascending order by Club ID) whose registered officer(s) can receive them without exceeding the cap.

3. **Priority order for processing overflow**:
   - Sort by: (1) number of clubs officer represents (descending), then (2) Member ID (ascending).
   - Process highest-club-count officers first.

4. **Deterministic tie-breaking**:
   - When multiple clubs compete for reassigned votes, prioritize Club ID in ascending order (lowest ID first).
   - When choosing which registered officer receives reassigned votes, prefer VP Education → President (to distribute load).

### Overflow Redistribution Example

**Scenario**: Officer Alice is President of Club A (completing basic vote) and President of Club B (completing basic vote), plus holds Division Director role.
- Club A: 2 votes (Alice-President)
- Club B: 2 votes (Alice-President)
- Independent: 1 vote (Division Director)
- **Total: 5 votes → exceeds cap of 3**

**Resolution**:
1. Attempt same-club reassignment: Club A has no VPE registered; Club B has no VPE registered.
2. Redistribute 2 votes to the next-prioritized unrepresented club. Suppose Club C has a registered VPE but no votes yet:
   - Alice keeps 1 vote from Club A (her primary role).
   - Alice keeps 1 independent vote (Division Director).
   - Reassign Club B's 2 votes to Club C's VPE.
   - **Final: Alice gets 2 votes total (1 club + 1 independent), Club C's VPE gets 2 votes.**

This ensures Alice stays at cap and Club B's votes are not lost; they flow to Club C.

## Registration Deduplication

**Rule 4.1: Duplicate Registration Entries**
If a member appears multiple times in the Registration List with the same Member Number:
- Retain the **first occurrence** by row order.
- Discard all subsequent duplicates.
- This ensures deterministic output: same input → same output.

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

1. **Case sensitivity**: Perform case-insensitive matching on `Will you be attending?` values (accept "yes", "YES", "Yes", "true", "True", "TRUE", "attending", "Attending", etc. as affirmative).
2. **Whitespace**: Trim all string fields during normalization.
3. **CSV parsing**: Support quoted fields; handle embedded commas and newlines within quoted strings.
4. **Council CSV preface**: Skip non-data lines (e.g., "Date Generated: ...") before the header row.
5. **Determinism**: Always sort output by Member ID (ascending) for consistent reproducibility.
6. **Role aliases**: The list of leadership roles in Rule 2.1 uses the exact Position Description values from the Council CSV. If role names vary across data sources, use the alias mapping below:
   - *Future: Add role aliases if variation is observed.*

---

**Last Updated**: March 11, 2026  
**Author**: Toastmasters Council Voting System
