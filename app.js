// ============================================================================
// Toastmasters Council Voting Application
// Core: CSV parsing, vote engine, display, export
// ============================================================================

// Configuration - Leadership roles eligible for the leadership vote
const LEADERSHIP_VOTE_ROLES = [
    'Area Director',
    'Division Director',
    'Administration Manager',
    'Finance Manager',
    'Public Relations Manager',
    'Club Growth Director',
    'Program Quality Director',
    'District Director',
    'Immediate Past District Director'
];

// Club officer positions eligible for club votes
const CLUB_OFFICER_POSITIONS = ['Club President', 'Club VP Education'];

// Maximum votes per member
const MAX_VOTES_PER_MEMBER = 3;

const REGISTRATION_MAPPING_STORAGE_KEY = 'registrationColumnMappingsV1';
const REGISTRATION_FIELD_CONFIG = [
    { key: 'memberId', label: 'Member Number', required: true },
    { key: 'name', label: 'First Name', required: false },
    { key: 'lastName', label: 'Last Name', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'attending', label: 'Attendance', required: false }
];

const REGISTRATION_FIELD_ALIASES = {
    memberId: ['member number', 'numero de socio', 'numero socio', 'número de socio', 'member id', 'socio'],
    name: ['name', 'first name', 'nombre', 'nombre(s)', 'nombres'],
    lastName: ['last name', 'apellido', 'apellidos', 'surname'],
    email: ['email', 'correo', 'correo electronico', 'correo electrónico'],
    attending: ['will you be attending?', 'attending', 'asistiras', 'asistirás', 'asistencia', 'attend']
};

function normalizeText(value) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function buildRegistrationHeaderSignature(headerRow) {
    return headerRow.map((h) => normalizeText(h)).join('|');
}

function loadRegistrationMappingCache() {
    try {
        const raw = sessionStorage.getItem(REGISTRATION_MAPPING_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        return {};
    }
}

function saveRegistrationMappingCache(cache) {
    try {
        sessionStorage.setItem(REGISTRATION_MAPPING_STORAGE_KEY, JSON.stringify(cache));
    } catch (err) {
        // Ignore storage write failures (private mode / disabled storage).
    }
}

function getCachedRegistrationMapping(signature) {
    const cache = loadRegistrationMappingCache();
    return cache[signature] || null;
}

function setCachedRegistrationMapping(signature, mapping) {
    const cache = loadRegistrationMappingCache();
    cache[signature] = mapping;
    saveRegistrationMappingCache(cache);
}

function detectRegistrationColumns(headerRow) {
    const normalizedHeaders = headerRow.map((col) => normalizeText(col));
    const detected = {};

    const findBestIndex = (fieldKey) => {
        const aliases = REGISTRATION_FIELD_ALIASES[fieldKey] || [];
        let best = { idx: undefined, score: 0 };

        normalizedHeaders.forEach((header, idx) => {
            for (const alias of aliases) {
                const normAlias = normalizeText(alias);
                if (header === normAlias && best.score < 1.0) {
                    best = { idx, score: 1.0 };
                } else if (header.includes(normAlias) && best.score < 0.75) {
                    best = { idx, score: 0.75 };
                }
            }
        });

        return best;
    };

    REGISTRATION_FIELD_CONFIG.forEach((field) => {
        const best = findBestIndex(field.key);
        if (best.idx !== undefined) detected[field.key] = best.idx;
    });

    return { detected, normalizedHeaders };
}

function normalizeRegistrationMapping(mapping, headerLength) {
    const normalized = {};
    REGISTRATION_FIELD_CONFIG.forEach((field) => {
        const raw = mapping ? mapping[field.key] : undefined;
        if (raw === '' || raw === null || raw === undefined) {
            normalized[field.key] = undefined;
            return;
        }
        const idx = Number(raw);
        normalized[field.key] = Number.isInteger(idx) && idx >= 0 && idx < headerLength ? idx : undefined;
    });
    return normalized;
}

function validateRegistrationMapping(mapping) {
    const errors = [];
    if (mapping.memberId === undefined) {
        errors.push('Member Number is required.');
    }

    const used = new Map();
    Object.entries(mapping).forEach(([field, idx]) => {
        if (idx === undefined) return;
        if (used.has(idx)) {
            errors.push(`Columns cannot be reused: ${field} and ${used.get(idx)} use the same source column.`);
        } else {
            used.set(idx, field);
        }
    });

    return errors;
}

// ============================================================================
// CSV Parsing & Normalization
// ============================================================================

/**
 * Parse CSV text into an array of field arrays.
 * Handles quoted fields (which may contain commas and newlines), escaped
 * double-quotes (""), and both \r\n and \n line endings.
 */
function parseCSV(text) {
    const rows = [];
    let fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            if (inQuotes && text[i + 1] === '"') {
                // Escaped double-quote inside a quoted field
                current += '"';
                i++;
            } else {
                // Start or end of a quoted field
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            // Handle \r\n as a single newline
            if (char === '\r' && text[i + 1] === '\n') i++;
            fields.push(current.trim());
            if (fields.some(f => f !== '')) {
                rows.push(fields);
            }
            fields = [];
            current = '';
        } else {
            current += char;
        }
    }

    // Final field / row
    fields.push(current.trim());
    if (fields.some(f => f !== '')) {
        rows.push(fields);
    }

    return rows;
}

/**
 * Find header row in council CSV by detecting expected column names
 * Skip preface lines like "Date Generated: ..."
 */
function findHeaderRowIndex(rows, councilColumns) {
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const row = rows[i];
        const lowerRow = row.map(c => c.toLowerCase());

        // Check for known council columns
        if (lowerRow.includes('member id') && lowerRow.includes('position description')) {
            return i;
        }
    }
    return -1;
}

/**
 * Normalize council CSV: extract members with their club and position info
 */
function normalizeCouncilData(csvText) {
    const rows = parseCSV(csvText);

    // Find header row and extract columns
    const headerIdx = findHeaderRowIndex(rows);
    if (headerIdx === -1) {
        throw new Error('Could not find header row in Council CSV. Expected columns: Member ID, Position Description, etc.');
    }

    const headerRow = rows[headerIdx];
    const columnMap = {};
    headerRow.forEach((col, idx) => {
        columnMap[col.toLowerCase().trim()] = idx;
    });

    // Map expected columns
    const cols = {
        memberId: columnMap['member id'],
        firstName: columnMap['first name'],
        lastName: columnMap['last name'],
        email: columnMap['email address'],
        clubId: columnMap['club id'],
        clubName: columnMap['club name'],
        clubStatus: columnMap['club status'],
        positionDescription: columnMap['position description'],
        isPaid: columnMap['is paid']
    };

    if (cols.memberId === undefined || cols.positionDescription === undefined) {
        throw new Error('Missing required columns: Member ID, Position Description');
    }

    // Parse data rows
    const members = [];
    const validation = {
        invalidPositions: new Set(),
        totalRows: rows.length - (headerIdx + 1)
    };

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 1 && !row[0].trim()) continue; // Skip empty rows

        const member = normalizeMemberRecord({
            memberId: row[cols.memberId],
            firstName: row[cols.firstName],
            lastName: row[cols.lastName],
            email: row[cols.email],
            clubId: row[cols.clubId],
            clubName: row[cols.clubName],
            clubStatus: row[cols.clubStatus],
            positionDescription: row[cols.positionDescription],
            isPaid: row[cols.isPaid]
        });

        if (member) {
            members.push(member);
        }
    }

    return { members, validation };
}

/**
 * Normalize registration CSV: extract members with attendance flag
 */
function normalizeRegistrationData(csvText, options = {}) {
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
        throw new Error('Registration CSV must contain header and at least one data row.');
    }

    const headerRow = rows[0];
    const detected = detectRegistrationColumns(headerRow);
    const cols = normalizeRegistrationMapping(
        options.columnMapping || detected.detected,
        headerRow.length
    );

    const mappingErrors = validateRegistrationMapping(cols);
    if (mappingErrors.length > 0) {
        const err = new Error('COLUMN_MAPPING_REQUIRED');
        err.code = 'COLUMN_MAPPING_REQUIRED';
        err.mappingErrors = mappingErrors;
        err.headerRow = headerRow;
        err.detectedColumns = detected.detected;
        throw err;
    }

    // Auto-correct swapped email/attendance columns using row-value heuristics.
    const detectEmailLike = (value) => (value || '').includes('@');
    const detectAttendanceLike = (value) => {
        const t = normalizeText(value || '');
        return t.startsWith('si') || t.startsWith('no') || t.includes('attend');
    };

    const sampleRows = rows.slice(1, 31);
    const scoreColumn = (colIdx, predicate) => {
        if (colIdx === undefined) return 0;
        let hits = 0;
        let total = 0;
        sampleRows.forEach((r) => {
            if (colIdx < r.length && (r[colIdx] || '').trim()) {
                total += 1;
                if (predicate(r[colIdx])) hits += 1;
            }
        });
        return total === 0 ? 0 : hits / total;
    };

    const emailScoreAtEmail = scoreColumn(cols.email, detectEmailLike);
    const emailScoreAtAttending = scoreColumn(cols.attending, detectEmailLike);
    const attendanceScoreAtAttending = scoreColumn(cols.attending, detectAttendanceLike);

    if (
        cols.email !== undefined &&
        cols.attending !== undefined &&
        emailScoreAtEmail < 0.4 &&
        emailScoreAtAttending > 0.7 &&
        attendanceScoreAtAttending < 0.4
    ) {
        const tmp = cols.email;
        cols.email = cols.attending;
        cols.attending = tmp;
    }

    const memberMap = new Map();
    const seenAny = new Set();
    const duplicateIds = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 1 && !row[0].trim()) continue; // Skip empty rows

        const memberId = (row[cols.memberId] || '').trim().replace(/^0+(?=\d)/, '');  // strip leading zeros
        if (!memberId) continue;

        // Track duplicates; last occurrence wins
        if (seenAny.has(memberId)) {
            duplicateIds.push(memberId);
        }
        seenAny.add(memberId);

        const attendingVal = cols.attending !== undefined ? normalizeText(row[cols.attending] || '') : 'yes';
        const isAttending = attendingVal.startsWith('si') || ['yes', 'y', 'true', 'attending'].includes(attendingVal);

        if (isAttending) {
            // Overwrite — last occurrence retained
            memberMap.set(memberId, {
                memberId,
                name: cols.name !== undefined ? row[cols.name] || '' : '',
                lastName: cols.lastName !== undefined ? row[cols.lastName] || '' : '',
                email: cols.email !== undefined ? row[cols.email] || '' : ''
            });
        } else {
            // Last entry says "not attending" — remove from eligible list
            memberMap.delete(memberId);
        }
    }

    return {
        members: Array.from(memberMap.values()),
        duplicates: duplicateIds,
        headerRow,
        detectedColumns: detected.detected,
        appliedColumns: cols
    };
}

/**
 * Normalize a single council member record
 */
function normalizeMemberRecord(raw) {
    return {
        memberId: (raw.memberId || '').trim().replace(/^0+(?=\d)/, ''),  // strip leading zeros
        firstName: (raw.firstName || '').trim(),
        lastName: (raw.lastName || '').trim(),
        email: (raw.email || '').trim(),
        clubId: (raw.clubId || '').trim(),
        clubName: (raw.clubName || '').trim(),
        clubStatus: (raw.clubStatus || '').trim(),
        positionDescription: (raw.positionDescription || '').trim(),
        isPaid: (raw.isPaid || '').trim()
    };
}

// ============================================================================
// Vote Assignment Engine
// ============================================================================

/**
 * Compute votes for all registered paid members based on council data and rules
 */
function computeVotes(councilMembers, registeredMembers) {
    const validationIssues = [];

    // Index ALL council members by ID (for name/info lookup and role detection)
    const councilById = {};
    councilMembers.forEach(m => {
        if (!councilById[m.memberId]) councilById[m.memberId] = [];
        councilById[m.memberId].push(m);
    });

    // Only paid council members are eligible to vote
    const paidCouncilMembers = councilMembers.filter(
        m => m.isPaid.toLowerCase() === 'paid member'
    );
    const paidMemberIds = new Set(paidCouncilMembers.map(m => m.memberId));

    // Build registered+paid set (registered AND confirmed paid in council)
    const registered = new Set(
        registeredMembers.map(m => m.memberId).filter(id => paidMemberIds.has(id))
    );

    // Step 1: Identify eligible clubs and officers (paid council members, Complete clubs only)
    const clubs = {}; // clubId -> { clubName, president: [], vpe: [] }
    const goodStandingClubIds = new Set(
        councilMembers
            .filter(m => m.clubStatus === 'Complete' && m.clubId)
            .map(m => m.clubId)
    );

    paidCouncilMembers.forEach(member => {
        if (member.clubStatus !== 'Complete') return;

        if (!clubs[member.clubId]) {
            clubs[member.clubId] = {
                clubName: member.clubName,
                president: [],
                vpe: []
            };
        }

        if (member.positionDescription === 'Club President') {
            clubs[member.clubId].president.push(member);
        } else if (member.positionDescription === 'Club VP Education') {
            clubs[member.clubId].vpe.push(member);
        }
    });

    // Step 2: Assign initial club votes
    let memberVotes = {}; // memberId -> { clubVotes: [], leadershipVotes: 0, totalVotes: 0 }

    Object.entries(clubs).forEach(([clubId, club]) => {
        const presReg = club.president.filter(m => registered.has(m.memberId));
        const vpeReg = club.vpe.filter(m => registered.has(m.memberId));

        if (presReg.length === 0 && vpeReg.length === 0) {
            validationIssues.push({
                type: 'unrepresentedClub',
                message: `Club unrepresented: ${club.clubName} (${clubId}) has no registered paid President or VP Education`
            });
            return;
        }

        if (presReg.length > 0 && vpeReg.length > 0) {
            // Both registered: split 1 vote each
            presReg.forEach(m => {
                if (!memberVotes[m.memberId]) memberVotes[m.memberId] = { clubVotes: [], leadershipVotes: 0 };
                memberVotes[m.memberId].clubVotes.push({ clubId, votes: 1 });
            });
            vpeReg.forEach(m => {
                if (!memberVotes[m.memberId]) memberVotes[m.memberId] = { clubVotes: [], leadershipVotes: 0 };
                memberVotes[m.memberId].clubVotes.push({ clubId, votes: 1 });
            });
        } else if (presReg.length > 0) {
            // Only president registered: gets both votes
            presReg.forEach(m => {
                if (!memberVotes[m.memberId]) memberVotes[m.memberId] = { clubVotes: [], leadershipVotes: 0 };
                memberVotes[m.memberId].clubVotes.push({ clubId, votes: 2 });
            });
        } else {
            // Only VPE registered: gets both votes
            vpeReg.forEach(m => {
                if (!memberVotes[m.memberId]) memberVotes[m.memberId] = { clubVotes: [], leadershipVotes: 0 };
                memberVotes[m.memberId].clubVotes.push({ clubId, votes: 2 });
            });
        }
    });

    // Step 3: Assign leadership vote (+1, regardless of whether member is also a club officer)
    paidCouncilMembers.forEach(member => {
        if (!registered.has(member.memberId)) return;

        if (LEADERSHIP_VOTE_ROLES.some(role => member.positionDescription.includes(role))) {
            if (!memberVotes[member.memberId]) {
                memberVotes[member.memberId] = { clubVotes: [], leadershipVotes: 0 };
            }
            memberVotes[member.memberId].leadershipVotes = 1; // max 1 leadership vote per member
        }
    });

    // Step 4: Calculate totals
    Object.values(memberVotes).forEach(vd => {
        const clubTotal = vd.clubVotes.reduce((sum, cv) => sum + cv.votes, 0);
        vd.totalVotes = clubTotal + vd.leadershipVotes;
    });

    // Step 5: Redistribute overflow (club votes capped at 2; total capped at 3)
    memberVotes = redistributeOverflow(memberVotes, clubs, councilById, registered, validationIssues);

    // Step 6: Build output (registered + paid members only)
    const result = [];
    registeredMembers.forEach(regMember => {
        if (!registered.has(regMember.memberId)) {
            if (!councilById[regMember.memberId]) {
                validationIssues.push({
                    type: 'missingCouncil',
                    message: `Registered member ${regMember.memberId} not found in Council list`
                });
            }
            return;
        }

        const votes = memberVotes[regMember.memberId]
            ? memberVotes[regMember.memberId].totalVotes
            : 0;

        if (votes <= 0) return; // Do not report members with zero assigned votes

        result.push({
            memberName: [regMember.name, regMember.lastName].filter(Boolean).join(' ').trim(),
            memberId: regMember.memberId,
            email: regMember.email,
            votes
        });
    });

    // Sort by member ID ascending for determinism
    result.sort((a, b) => parseInt(a.memberId, 10) - parseInt(b.memberId, 10));

    // Reporting metrics
    const representedClubs = new Set();
    let assignedClubVotes = 0;
    let assignedLeadershipVotes = 0;

    Object.values(memberVotes).forEach(vd => {
        vd.clubVotes.forEach(cv => {
            representedClubs.add(cv.clubId);
            assignedClubVotes += cv.votes;
        });
        assignedLeadershipVotes += vd.leadershipVotes || 0;
    });

    const quorumRequired = Math.ceil(goodStandingClubIds.size / 3);
    const quorumMet = representedClubs.size >= quorumRequired;

    const report = {
        representedClubs: representedClubs.size,
        assignedClubVotes,
        assignedLeadershipVotes,
        goodStandingClubCount: goodStandingClubIds.size,
        quorumRequired,
        quorumMet
    };

    return { result, validationIssues, report };
}

/**
 * Redistribute votes for members whose club votes exceed the 2-vote club cap.
 *
 * Goal: maximise the number of clubs with vote representation.
 *
 * Per overflow member (sorted by club-vote total desc, member ID asc):
 *   Pass 1 – Release clubs that have an eligible alternate registered officer.
 *            The alternate absorbs those votes (club stays represented).
 *   Pass 2 – If still over cap, drop highest-ID solo clubs (no available
 *            alternate); those clubs become unrepresented (warning emitted).
 *
 * Eligibility for an alternate: opposite officer role in the same club,
 * registered, paid, and their current club-vote total + transfer <= 2.
 */
function redistributeOverflow(memberVotes, clubs, councilById, registered, validationIssues) {
    let changed = true;

    while (changed) {
        changed = false;

        // Members whose club votes exceed the 2-vote cap
        const overflowMembers = Object.entries(memberVotes)
            .filter(([_, vd]) => vd.clubVotes.reduce((s, cv) => s + cv.votes, 0) > 2)
            .map(([mid, vd]) => ({
                memberId: mid,
                clubTotal: vd.clubVotes.reduce((s, cv) => s + cv.votes, 0),
                voteData: vd
            }))
            .sort((a, b) =>
                b.clubTotal !== a.clubTotal
                    ? b.clubTotal - a.clubTotal
                    : parseInt(a.memberId, 10) - parseInt(b.memberId, 10)
            );

        if (overflowMembers.length === 0) break;

        // Process one member per iteration so totals stay current
        const member = overflowMembers[0];
        const voteData = member.voteData;
        const councilRoles = councilById[member.memberId] || [];

        /**
         * Return eligible alternates for a given club/role that have room
         * to absorb 'votesToTransfer' more club votes without exceeding the cap.
         */
        const getEligibleAlts = (clubId, memberRole, votesToTransfer) => {
            const club = clubs[clubId];
            if (!club) return [];
            let pool = [];
            if (memberRole === 'Club President') {
                pool = club.vpe.filter(m => registered.has(m.memberId) && m.memberId !== member.memberId);
            } else if (memberRole === 'Club VP Education') {
                pool = club.president.filter(m => registered.has(m.memberId) && m.memberId !== member.memberId);
            }
            return pool.filter(alt => {
                const altClubTotal = memberVotes[alt.memberId]
                    ? memberVotes[alt.memberId].clubVotes.reduce((s, c) => s + c.votes, 0)
                    : 0;
                return altClubTotal + votesToTransfer <= 2;
            });
        };

        // Enrich each club-vote entry with role context and available alts
        const enriched = voteData.clubVotes.map(cv => {
            const role = councilRoles.find(
                r => r.clubId === cv.clubId &&
                    (r.positionDescription === 'Club President' ||
                     r.positionDescription === 'Club VP Education')
            );
            const memberRole = role ? role.positionDescription : null;
            const alts = memberRole ? getEligibleAlts(cv.clubId, memberRole, cv.votes) : [];
            return { ...cv, memberRole, alts, hasAlt: alts.length > 0 };
        });

        // Release clubs WITH eligible alternates first (club stays represented);
        // within that group process lower club IDs first (member keeps lower IDs).
        enriched.sort((a, b) => {
            if (a.hasAlt !== b.hasAlt) return a.hasAlt ? -1 : 1; // hasAlt first
            return parseInt(a.clubId, 10) - parseInt(b.clubId, 10);
        });

        let clubTotal = voteData.clubVotes.reduce((s, cv) => s + cv.votes, 0);
        const toRemove = new Set();

        // Pass 1: hand off clubs that have eligible alternates
        for (const cv of enriched) {
            if (clubTotal <= 2) break;
            if (!cv.hasAlt) continue;

            const alt = cv.alts[0];
            if (!memberVotes[alt.memberId]) {
                memberVotes[alt.memberId] = { clubVotes: [], leadershipVotes: 0 };
            }
            const existing = memberVotes[alt.memberId].clubVotes.find(x => x.clubId === cv.clubId);
            if (existing) {
                existing.votes += cv.votes;
            } else {
                memberVotes[alt.memberId].clubVotes.push({ clubId: cv.clubId, votes: cv.votes });
            }
            toRemove.add(cv.clubId);
            clubTotal -= cv.votes;
            changed = true;
        }

        // Pass 2: still over cap — drop highest-ID remaining solo clubs
        if (clubTotal > 2) {
            const remaining = enriched
                .filter(cv => !toRemove.has(cv.clubId))
                .sort((a, b) => parseInt(b.clubId, 10) - parseInt(a.clubId, 10));

            for (const cv of remaining) {
                if (clubTotal <= 2) break;
                toRemove.add(cv.clubId);
                clubTotal -= cv.votes;
                validationIssues.push({
                    type: 'unrepresentedClub',
                    message: `Club ${clubs[cv.clubId]?.clubName || cv.clubId} (${cv.clubId}) lost representation due to vote cap overflow`
                });
                changed = true;
            }
        }

        // Apply removals from overflow member
        if (toRemove.size > 0) {
            voteData.clubVotes = voteData.clubVotes.filter(cv => !toRemove.has(cv.clubId));
        }

        // Recalculate all totals after each member is resolved
        Object.values(memberVotes).forEach(vd => {
            const ct = vd.clubVotes.reduce((s, cv) => s + cv.votes, 0);
            vd.totalVotes = ct + (vd.leadershipVotes || 0);
        });
    }

    return memberVotes;
}

// ============================================================================
// UI Rendering & Export
// ============================================================================

/**
 * Display validation issues in the UI
 */
function displayValidation(issues) {
    const section = document.getElementById('validation-section');
    const container = document.getElementById('validation-messages');

    if (issues.length === 0) {
        section.classList.add('hidden');
        return;
    }

    container.innerHTML = '';
    const issueGroups = {
        error: [],
        warning: [],
        info: []
    };

    issues.forEach(issue => {
        const severity = issue.type === 'missingCouncil' ? 'error' :
            (issue.type === 'unrepresentedClub' || issue.type === 'duplicateRegistration' ? 'warning' : 'info');
        issueGroups[severity].push(issue.message);
    });

    [...issueGroups.error, ...issueGroups.warning, ...issueGroups.info].forEach((msg, idx) => {
        const li = document.createElement('li');
        const severity = 
            issueGroups.error.includes(msg) ? 'error' :
            issueGroups.warning.includes(msg) ? 'warning' : 'info';
        li.className = severity;
        li.textContent = `[${severity.toUpperCase()}] ${msg}`;
        container.appendChild(li);
    });

    section.classList.remove('hidden');
}

function renderMappingPreview(rows, mapping) {
    const previewBody = document.getElementById('mapping-preview-body');
    if (!previewBody) return;

    previewBody.innerHTML = '';
    rows.slice(1, 6).forEach((row) => {
        const tr = document.createElement('tr');
        const values = [
            mapping.memberId !== undefined ? row[mapping.memberId] || '' : '',
            mapping.name !== undefined ? row[mapping.name] || '' : '',
            mapping.lastName !== undefined ? row[mapping.lastName] || '' : '',
            mapping.email !== undefined ? row[mapping.email] || '' : '',
            mapping.attending !== undefined ? row[mapping.attending] || '' : '(defaults to Yes)'
        ];

        tr.innerHTML = values.map((v) => `<td>${escapeHtml(v)}</td>`).join('');
        previewBody.appendChild(tr);
    });
}

function requestRegistrationColumnMapping(rows, detectedColumns) {
    const modal = document.getElementById('column-mapping-modal');
    const form = document.getElementById('column-mapping-form');
    const errorBox = document.getElementById('mapping-errors');
    const confirmBtn = document.getElementById('mapping-confirm-btn');
    const cancelBtn = document.getElementById('mapping-cancel-btn');
    const headerRow = rows[0];

    const buildOptions = (select) => {
        select.innerHTML = '';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '-- Not set --';
        select.appendChild(blank);

        headerRow.forEach((col, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = `${idx + 1}. ${col}`;
            select.appendChild(opt);
        });
    };

    REGISTRATION_FIELD_CONFIG.forEach((field) => {
        const select = document.getElementById(`map-${field.key}`);
        if (!select) return;
        buildOptions(select);
        if (detectedColumns && detectedColumns[field.key] !== undefined) {
            select.value = String(detectedColumns[field.key]);
        }
    });

    const readMapping = () => {
        const mapping = {};
        REGISTRATION_FIELD_CONFIG.forEach((field) => {
            const select = document.getElementById(`map-${field.key}`);
            mapping[field.key] = select && select.value !== '' ? Number(select.value) : undefined;
        });
        return mapping;
    };

    const validateAndRender = () => {
        const mapping = readMapping();
        const validationErrors = validateRegistrationMapping(mapping);
        renderMappingPreview(rows, mapping);

        errorBox.innerHTML = validationErrors.map((msg) => `<p>${escapeHtml(msg)}</p>`).join('');
        confirmBtn.disabled = validationErrors.length > 0;
        return { mapping, validationErrors };
    };

    return new Promise((resolve, reject) => {
        const onChange = () => validateAndRender();
        const onCancel = () => {
            cleanup();
            reject(new Error('Column mapping was cancelled by the user.'));
        };
        const onSubmit = (e) => {
            e.preventDefault();
            const { mapping, validationErrors } = validateAndRender();
            if (validationErrors.length > 0) return;
            cleanup();
            resolve(mapping);
        };

        const cleanup = () => {
            form.removeEventListener('change', onChange);
            form.removeEventListener('submit', onSubmit);
            cancelBtn.removeEventListener('click', onCancel);
            modal.classList.add('hidden');
        };

        form.addEventListener('change', onChange);
        form.addEventListener('submit', onSubmit);
        cancelBtn.addEventListener('click', onCancel);

        validateAndRender();
        modal.classList.remove('hidden');
    });
}

/**
 * Display voting results in table
 */
function displayResults(results, report) {
    const section = document.getElementById('results-section');
    const tbody = document.getElementById('results-body');
    const totalMembers = document.getElementById('total-members');
    const totalVotes = document.getElementById('total-votes');
    const representedClubs = document.getElementById('represented-clubs');
    const assignedClubVotes = document.getElementById('assigned-club-votes');
    const assignedLeadershipVotes = document.getElementById('assigned-leadership-votes');
    const quorumStatus = document.getElementById('quorum-status');

    tbody.innerHTML = '';

    results.forEach(member => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(member.memberName)}</td>
            <td>${escapeHtml(member.memberId)}</td>
            <td><a href="mailto:${escapeHtml(member.email)}">${escapeHtml(member.email)}</a></td>
            <td style="text-align: center; font-weight: bold; color: #004165;">${member.votes}</td>
        `;
        tbody.appendChild(tr);
    });

    const sum = results.reduce((acc, m) => acc + m.votes, 0);
    totalMembers.textContent = results.length;
    totalVotes.textContent = sum;

    if (report) {
        representedClubs.textContent = report.representedClubs;
        assignedClubVotes.textContent = report.assignedClubVotes;
        assignedLeadershipVotes.textContent = report.assignedLeadershipVotes;
        quorumStatus.textContent = report.quorumMet
            ? `Yes (${report.representedClubs}/${report.goodStandingClubCount} clubs; required ${report.quorumRequired})`
            : `No (${report.representedClubs}/${report.goodStandingClubCount} clubs; required ${report.quorumRequired})`;
    }

    section.classList.remove('hidden');
}

/**
 * Safely escape HTML characters
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Generate and download CSV file
 */
function downloadAsCSV(results) {
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `toastmasters-votes-${timestamp}.csv`;

    const header = ['Member Name', 'Member Number', 'Email', 'Votes Available'];
    const rows = results.map(m => [
        `"${m.memberName.replace(/"/g, '""')}"`,
        m.memberId,
        `"${m.email.replace(/"/g, '""')}"`,
        m.votes
    ]);

    const csv = [header, ...rows].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ============================================================================
// Main UI Event Handlers
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const councilInput = document.getElementById('council-file');
    const registrationInput = document.getElementById('registration-file');
    const processBtn = document.getElementById('process-btn');
    const downloadBtn = document.getElementById('download-csv-btn');

    let lastResults = null;

    // Handle file input changes
    councilInput.addEventListener('change', (e) => {
        const name = e.target.files[0] ? e.target.files[0].name : 'No file selected';
        document.getElementById('council-file-name').textContent = name;
    });

    registrationInput.addEventListener('change', (e) => {
        const name = e.target.files[0] ? e.target.files[0].name : 'No file selected';
        document.getElementById('registration-file-name').textContent = name;
    });

    // Handle process button
    processBtn.addEventListener('click', async () => {
        try {
            processBtn.disabled = true;
            processBtn.textContent = '⏳ Processing...';

            if (!councilInput.files.length || !registrationInput.files.length) {
                alert('Please select both CSV files.');
                throw new Error('Missing files');
            }

            // Read files
            const councilText = await councilInput.files[0].text();
            const registrationText = await registrationInput.files[0].text();

            // Parse and normalize
            const { members: councilMembers } = normalizeCouncilData(councilText);

            const registrationRows = parseCSV(registrationText);
            const registrationHeader = registrationRows[0] || [];
            const headerSignature = buildRegistrationHeaderSignature(registrationHeader);
            const cachedMapping = getCachedRegistrationMapping(headerSignature);

            let registrationData;
            try {
                registrationData = normalizeRegistrationData(registrationText, {
                    columnMapping: cachedMapping || undefined
                });
            } catch (error) {
                if (error.code !== 'COLUMN_MAPPING_REQUIRED') throw error;

                const selectedMapping = await requestRegistrationColumnMapping(
                    registrationRows,
                    error.detectedColumns
                );

                registrationData = normalizeRegistrationData(registrationText, {
                    columnMapping: selectedMapping
                });
                setCachedRegistrationMapping(headerSignature, selectedMapping);
            }

            const { members: registeredMembers, duplicates: duplicateRegistrations } = registrationData;

            // Compute votes
            const { result, validationIssues, report } = computeVotes(councilMembers, registeredMembers);

            // Add duplicate registration warnings
            duplicateRegistrations.forEach(memberId => {
                validationIssues.push({
                    type: 'duplicateRegistration',
                    message: `Duplicate registration for member ${memberId}; last entry retained`
                });
            });

            // Display results
            displayValidation(validationIssues);
            displayResults(result, report);
            lastResults = result;

            processBtn.textContent = 'Process Votes';
        } catch (error) {
            console.error(error);
            alert(`Error processing files: ${error.message}`);
            document.getElementById('validation-section').classList.add('hidden');
            document.getElementById('results-section').classList.add('hidden');
            processBtn.textContent = 'Process Votes';
        } finally {
            processBtn.disabled = false;
        }
    });

    // Handle download button
    downloadBtn.addEventListener('click', () => {
        if (lastResults) {
            downloadAsCSV(lastResults);
        }
    });
});
