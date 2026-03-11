// ============================================================================
// Toastmasters Council Voting Application
// Core: CSV parsing, vote engine, display, export
// ============================================================================

// Configuration - Election leadership roles eligible for independent vote
const INDEPENDENT_VOTE_ROLES = [
    'Area Director',
    'Area Director Emeritus',
    'Division Director',
    'Division Director Emeritus',
    'District Manager',
    'Club Growth Director',
    'Program Quality Director',
    'District Director',
    'District Director Emeritus',
    'Immediate Past District Director'
];

// Club officer positions eligible for club votes
const CLUB_OFFICER_POSITIONS = ['Club President', 'Club VP Education'];

// Maximum votes per member
const MAX_VOTES_PER_MEMBER = 3;

// ============================================================================
// CSV Parsing & Normalization
// ============================================================================

/**
 * Parse CSV text into rows (handles quoted fields, embedded commas/newlines)
 */
function parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            if (inQuotes && text[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === '\n' && !inQuotes) {
            // End of row
            if (current.trim()) {
                rows.push(parseCSVRow(current));
            }
            current = '';
        } else {
            current += char;
        }
    }

    // Final row
    if (current.trim()) {
        rows.push(parseCSVRow(current));
    }

    return rows;
}

/**
 * Parse a single CSV row by comma boundaries, respecting quoted fields
 */
function parseCSVRow(rowText) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < rowText.length; i++) {
        const char = rowText[i];

        if (char === '"') {
            if (inQuotes && rowText[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
        } else {
            current += char;
        }
    }

    fields.push(current.trim().replace(/^"|"$/g, ''));
    return fields;
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
        positionDescription: columnMap['position description']
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
            positionDescription: row[cols.positionDescription]
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
function normalizeRegistrationData(csvText) {
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
        throw new Error('Registration CSV must contain header and at least one data row.');
    }

    const headerRow = rows[0];
    const columnMap = {};
    headerRow.forEach((col, idx) => {
        columnMap[col.toLowerCase().trim()] = idx;
    });

    // Map expected columns
    const cols = {
        memberId: columnMap['member number'],
        name: columnMap['name'],
        lastName: columnMap['last name'],
        email: columnMap['email'],
        attending: columnMap['will you be attending?']
    };

    if (cols.memberId === undefined) {
        throw new Error('Missing required column: Member Number');
    }

    const members = [];
    const seen = new Set();

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 1 && !row[0].trim()) continue; // Skip empty rows

        const memberId = (row[cols.memberId] || '').trim();
        if (!memberId) continue;

        // Deduplication: skip if already seen
        if (seen.has(memberId)) {
            console.warn(`Duplicate registration for member ${memberId}; skipping.`);
            continue;
        }
        seen.add(memberId);

        const attendingVal = (row[cols.attending] || '').toLowerCase().trim();
        const isAttending = ['yes', 'y', 'true', 'attending'].includes(attendingVal);

        if (isAttending) {
            members.push({
                memberId: memberId,
                name: row[cols.name] || '',
                lastName: row[cols.lastName] || '',
                email: row[cols.email] || ''
            });
        }
    }

    return members;
}

/**
 * Normalize a single council member record
 */
function normalizeMemberRecord(raw) {
    return {
        memberId: (raw.memberId || '').trim(),
        firstName: (raw.firstName || '').trim(),
        lastName: (raw.lastName || '').trim(),
        email: (raw.email || '').trim(),
        clubId: (raw.clubId || '').trim(),
        clubName: (raw.clubName || '').trim(),
        clubStatus: (raw.clubStatus || '').trim(),
        positionDescription: (raw.positionDescription || '').trim()
    };
}

// ============================================================================
// Vote Assignment Engine
// ============================================================================

/**
 * Compute votes for all registered members based on council data and rules
 */
function computeVotes(councilMembers, registeredMembers) {
    const validationIssues = [];

    // Index registered members by ID
    const registered = new Set(registeredMembers.map(m => m.memberId));

    // Index council members by ID for quick lookup
    const councilById = {};
    councilMembers.forEach(m => {
        if (!councilById[m.memberId]) {
            councilById[m.memberId] = [];
        }
        councilById[m.memberId].push(m);
    });

    // Step 1: Identify eligible clubs and their officers
    const clubs = {}; // clubId -> { clubName, status, president: [], vpe: [] }

    councilMembers.forEach(member => {
        if (member.clubStatus !== 'Complete') return;

        if (!clubs[member.clubId]) {
            clubs[member.clubId] = {
                clubName: member.clubName,
                status: member.clubStatus,
                president: [],
                vpe: [],
                allOfficers: []
            };
        }

        clubs[member.clubId].allOfficers.push(member);

        if (member.positionDescription === 'Club President') {
            clubs[member.clubId].president.push(member);
        } else if (member.positionDescription === 'Club VP Education') {
            clubs[member.clubId].vpe.push(member);
        }
    });

    // Step 2: Assign initial club votes
    const memberVotes = {}; // memberId -> { clubVotes: [], independentVotes: 0, totalVotes: 0 }

    Object.entries(clubs).forEach(([clubId, club]) => {
        const presReg = club.president.filter(m => registered.has(m.memberId));
        const vpeReg = club.vpe.filter(m => registered.has(m.memberId));

        if (presReg.length === 0 && vpeReg.length === 0) {
            validationIssues.push({
                type: 'unrepresentedClub',
                message: `Club unrepresented: ${club.clubName} (${clubId}) has no registered President or VP Education`
            });
            return;
        }

        if (presReg.length > 0 && vpeReg.length > 0) {
            // Both registered: split votes 1-1
            presReg.forEach(m => {
                if (!memberVotes[m.memberId]) memberVotes[m.memberId] = { clubVotes: [], independentVotes: 0 };
                memberVotes[m.memberId].clubVotes.push({ clubId, votes: 1 });
            });
            vpeReg.forEach(m => {
                if (!memberVotes[m.memberId]) memberVotes[m.memberId] = { clubVotes: [], independentVotes: 0 };
                memberVotes[m.memberId].clubVotes.push({ clubId, votes: 1 });
            });
        } else if (presReg.length > 0) {
            // Only president: gets 2 votes
            presReg.forEach(m => {
                if (!memberVotes[m.memberId]) memberVotes[m.memberId] = { clubVotes: [], independentVotes: 0 };
                memberVotes[m.memberId].clubVotes.push({ clubId, votes: 2 });
            });
        } else if (vpeReg.length > 0) {
            // Only VPE: gets 2 votes
            vpeReg.forEach(m => {
                if (!memberVotes[m.memberId]) memberVotes[m.memberId] = { clubVotes: [], independentVotes: 0 };
                memberVotes[m.memberId].clubVotes.push({ clubId, votes: 2 });
            });
        }
    });

    // Step 3: Assign independent leadership votes
    councilMembers.forEach(member => {
        if (!registered.has(member.memberId)) return;

        if (INDEPENDENT_VOTE_ROLES.some(role => member.positionDescription.includes(role))) {
            if (!memberVotes[member.memberId]) {
                memberVotes[member.memberId] = { clubVotes: [], independentVotes: 0 };
            }
            memberVotes[member.memberId].independentVotes += 1;
        }
    });

    // Step 4: Calculate total votes and enforce cap
    Object.entries(memberVotes).forEach(([memberId, voteData]) => {
        const clubVotesTotal = voteData.clubVotes.reduce((sum, cv) => sum + cv.votes, 0);
        voteData.totalVotes = clubVotesTotal + voteData.independentVotes;
    });

    // Step 5: Redistribute overflow
    memberVotes = redistributeOverflow(memberVotes, clubs, councilById, registered, validationIssues);

    // Step 6: Filter output to only registered members
    const result = [];
    registeredMembers.forEach(regMember => {
        const councilEntries = councilById[regMember.memberId];
        if (!councilEntries) {
            validationIssues.push({
                type: 'missingCouncil',
                message: `Registered member ${regMember.memberId} not found in Council list`
            });
            return;
        }

        const votes = memberVotes[regMember.memberId]
            ? memberVotes[regMember.memberId].totalVotes
            : 0;

        result.push({
            memberName: [regMember.firstName || regMember.name, regMember.lastName]
                .filter(Boolean)
                .join(' ')
                .trim(),
            memberId: regMember.memberId,
            email: regMember.email,
            votes: votes
        });
    });

    // Sort by member ID for determinism
    result.sort((a, b) => {
        const aNum = parseInt(a.memberId, 10);
        const bNum = parseInt(b.memberId, 10);
        return aNum - bNum;
    });

    return { result, validationIssues };
}

/**
 * Redistribute votes for members exceeding vote cap
 */
function redistributeOverflow(memberVotes, clubs, councilById, registered, validationIssues) {
    let redone = true;

    while (redone) {
        redone = false;

        // Identify overflow members
        const overflowMembers = Object.entries(memberVotes)
            .filter(([_, vd]) => vd.totalVotes > MAX_VOTES_PER_MEMBER)
            .map(([mid, vd]) => ({
                memberId: mid,
                totalVotes: vd.totalVotes,
                clubCount: vd.clubVotes.length,
                voteData: vd
            }))
            .sort((a, b) => {
                // Sort by: (1) club count descending, (2) memberId ascending
                if (b.clubCount !== a.clubCount) return b.clubCount - a.clubCount;
                return parseInt(a.memberId, 10) - parseInt(b.memberId, 10);
            });

        if (overflowMembers.length === 0) break;

        const member = overflowMembers[0];
        const voteData = member.voteData;
        let excess = voteData.totalVotes - MAX_VOTES_PER_MEMBER;

        // Attempt same-club reassignment
        for (let i = 0; i < voteData.clubVotes.length && excess > 0; i++) {
            const clubVote = voteData.clubVotes[i];
            const club = clubs[clubVote.clubId];

            if (!club) continue;

            // Determine alternate officer
            const councilRoles = councilById[member.memberId] || [];
            const isPresident = councilRoles.some(c => c.clubId === clubVote.clubId && c.positionDescription === 'Club President');
            const isVPE = councilRoles.some(c => c.clubId === clubVote.clubId && c.positionDescription === 'Club VP Education');

            let alternateRegMembers = [];
            if (isPresident && club.vpe.length > 0) {
                alternateRegMembers = club.vpe.filter(m => registered.has(m.memberId));
            } else if (isVPE && club.president.length > 0) {
                alternateRegMembers = club.president.filter(m => registered.has(m.memberId));
            }

            // Try to move votes to alternate registered officer
            for (const alt of alternateRegMembers) {
                if (excess <= 0) break;

                if (!memberVotes[alt.memberId]) {
                    memberVotes[alt.memberId] = { clubVotes: [], independentVotes: 0 };
                }

                const altTotalBefore = memberVotes[alt.memberId].clubVotes.reduce((sum, cv) => sum + cv.votes, 0) + memberVotes[alt.memberId].independentVotes;

                if (altTotalBefore < MAX_VOTES_PER_MEMBER) {
                    const canTake = Math.min(excess, MAX_VOTES_PER_MEMBER - altTotalBefore);
                    
                    // Move votes from current member to alternate
                    voteData.clubVotes[i].votes -= canTake;
                    memberVotes[alt.memberId].clubVotes.push({ clubId: clubVote.clubId, votes: canTake });
                    excess -= canTake;
                    redone = true;
                }
            }
        }

        // If same-club reassignment didn't work, move to next-prioritized unrepresented club
        if (excess > 0) {
            // Find clubs with no representative
            const representedClubs = new Set(voteData.clubVotes.map(cv => cv.clubId));
            const unrepresentedClubs = Object.entries(clubs)
                .filter(([cid, _]) => !representedClubs.has(cid))
                .map(([cid, club]) => ({ clubId: cid, club }))
                .sort((a, b) => parseInt(a.clubId, 10) - parseInt(b.clubId, 10));

            for (const { clubId, club } of unrepresentedClubs) {
                if (excess <= 0) break;

                // Prefer VPE then President
                let candidates = [];
                candidates = club.vpe.filter(m => registered.has(m.memberId));
                if (candidates.length === 0) {
                    candidates = club.president.filter(m => registered.has(m.memberId));
                }

                for (const candidate of candidates) {
                    if (excess <= 0) break;

                    if (!memberVotes[candidate.memberId]) {
                        memberVotes[candidate.memberId] = { clubVotes: [], independentVotes: 0 };
                    }

                    const candTotalBefore = memberVotes[candidate.memberId].clubVotes.reduce((sum, cv) => sum + cv.votes, 0) + memberVotes[candidate.memberId].independentVotes;

                    if (candTotalBefore < MAX_VOTES_PER_MEMBER) {
                        const canTake = Math.min(excess, MAX_VOTES_PER_MEMBER - candTotalBefore);
                        voteData.clubVotes.push({ clubId, votes: canTake });
                        memberVotes[candidate.memberId].clubVotes.push({ clubId, votes: canTake });
                        excess -= canTake;
                        redone = true;
                    }
                }
            }
        }

        // Recalculate totals
        Object.entries(memberVotes).forEach(([_, vd]) => {
            const clubTotal = vd.clubVotes.reduce((sum, cv) => sum + cv.votes, 0);
            vd.totalVotes = clubTotal + vd.independentVotes;
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
        const severity = issue.type === 'missingCouncil' ? 'error' : (issue.type === 'unrepresentedClub' ? 'warning' : 'info');
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

/**
 * Display voting results in table
 */
function displayResults(results) {
    const section = document.getElementById('results-section');
    const tbody = document.getElementById('results-body');
    const totalMembers = document.getElementById('total-members');
    const totalVotes = document.getElementById('total-votes');

    tbody.innerHTML = '';

    results.forEach(member => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(member.memberName)}</td>
            <td>${escapeHtml(member.memberId)}</td>
            <td><a href="mailto:${escapeHtml(member.email)}">${escapeHtml(member.email)}</a></td>
            <td style="text-align: center; font-weight: bold; color: #667eea;">${member.votes}</td>
        `;
        tbody.appendChild(tr);
    });

    const sum = results.reduce((acc, m) => acc + m.votes, 0);
    totalMembers.textContent = results.length;
    totalVotes.textContent = sum;

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
            const { members: councilMembers, validation: councilVal } = normalizeCouncilData(councilText);
            const registeredMembers = normalizeRegistrationData(registrationText);

            // Compute votes
            const { result, validationIssues } = computeVotes(councilMembers, registeredMembers);

            // Display results
            displayValidation(validationIssues);
            displayResults(result);
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
