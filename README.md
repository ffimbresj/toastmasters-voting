# Toastmasters Council Voting Application

A lightweight, client-side web application for assigning voting power to Toastmasters Council members based on registration and council leadership roles. Built for GitHub Pages deployment.

## Overview

This application:
1. **Accepts two CSV files**: Council Member List and Registration List
2. **Applies deterministic voting rules** encoded in `docs/voting-rules.md`
3. **Computes vote assignments** based on club representation and leadership roles
4. **Displays results** in an interactive HTML table
5. **Exports to CSV** for further processing or record-keeping
6. **Supports manual field mapping** when a registration CSV uses unfamiliar headers
7. **Supports full UI language switching** (English/Spanish) including labels, messages, and modal text

The results summary also reports:
- Represented clubs
- Assigned club votes
- Assigned leadership votes
- Quorum status (met/not met), where quorum is 1/3 of Member Clubs in good standing

**Key Feature**: Entirely client-side. No backend, no server calls, no authentication needed. Safe to host on GitHub Pages.

## Directory Structure

```
voting/
├── index.html                          # Main application UI
├── style.css                          # Responsive styling
├── app.js                             # Core vote engine & data processing
├── docs/
│   ├── voting-rules.md                 # Canonical voting rules & algorithm
│   └── voting-rules.html               # Reader-friendly rules page (linked from the app)
├── samples/
│   ├── README.md                      # Test scenario documentation
│   ├── sample-council.csv             # Example council member list
│   ├── sample-registration.csv        # Example registration list
│   └── sample-expected-output.csv     # Expected voting results
├── DistrictCouncilMembersList-*.csv   # Real council data (reference)
└── .gitignore
```

## Quick Start

### Local Deployment

1. Clone or download this repository:
   ```bash
   git clone <repo-url> toastmasters-voting
   cd toastmasters-voting
   ```

2. Open `index.html` in a web browser (double-click or drag to browser):
   ```bash
   open index.html
   ```

3. Upload your CSVs:
   - **Council Member List CSV**: The official Toastmasters council roster
   - **Registration List CSV**: Member registrations with attendance flag

4. Click "Process Votes" to compute vote assignments

5. Review the results table and download the CSV if needed

6. Use the language selector in the header to switch the interface between English and Spanish

### GitHub Pages Deployment

If hosting on GitHub Pages:

1. Push to your GitHub repository
2. Go to **Settings → Pages**
3. Select **Deploy from branch** and choose `master` (or main) with `/root` folder
4. Your app will be live at `https://username.github.io/toastmasters-voting`

## CSV File Requirements

### Council Member List
**Expected columns** (exact header names required):
- `Member ID` - Unique member identifier
- `First Name` - Member first name
- `Last Name` - Member last name
- `Email Address` - Contact email
- `Club ID` - Club identifier
- `Club Name` - Club name
- `Club Status` - "Complete" or other status
- `Position Description` - Role in club (e.g., "Club President", "Club VP Education")

**Notes**:
- The app will skip preface lines (e.g., "Date Generated: ...") before the header
- Only "Complete" clubs are eligible for club votes
- Only "Club President" and "Club VP Education" positions count for club voting

### Registration List
**Expected columns** (exact header names required):
- `Member Number` - Must match Council Member List "Member ID"
- `Name` - Member first name
- `Last Name` - Member last name
- `Email` - Contact email
- `Will you be attending?` - Attendance flag ("Yes", "No", etc.)

**Also supported (Spanish Google Form format):**
- `Número de socio`
- `Nombre(s)`
- `Apellidos`
- `Proporciona correctamente tu correo electrónico`
- `¿Asistirás a la reunión?` (for example: `Sí, asistiré en persona`, `Sí, asistiré de manera remota`, `No asistiré`)

The parser also auto-detects equivalent labels that contain `correo/email`, `asist/attend`, and `socio/member` in case the form question text changes slightly.

If auto-detection cannot identify required columns confidently, the app opens a **Map Registration CSV Columns** dialog so the user can map source columns to:
- Member Number (required)
- First Name, Last Name, Email, Attendance (optional)

The selected mapping is cached for the same header format during the current browser session.

UI language selection is independent from CSV parsing. The parser still supports English and Spanish CSV headers regardless of which UI language is selected.

**Notes**:
- Members are considered registered if present in this list **and** `Will you be attending? = Yes` (case-insensitive)
- Duplicate entries for same Member Number are deduplicated (last occurrence retained)

## Voting Rules Summary

See [docs/voting-rules.md](docs/voting-rules.md) for complete rules. Quick overview:

### Club Votes
- Each "Complete" club has **2 votes** to assign
- **If both President and VP Education registered**: 1 vote each
- **If only President registered**: President gets 2 votes
- **If only VP Education registered**: VP Education gets 2 votes
- **If neither registered**: Club is unrepresented (warning)

### Leadership Votes
- Members in specific leadership roles get **+1 leadership vote** if registered:
   - Area Director, Division Director
   - Administration Manager, Finance Manager, Public Relations Manager
  - Club Growth Director, Program Quality Director
  - District Director, Immediate Past District Director

### Vote Cap
- **Maximum 3 votes per member** (club votes + leadership votes)
- If exceeded, votes are redistributed to allow maximum club representation
- Redistribution is deterministic (same input → same output)

## Testing

Sample test files are in the `samples/` directory:

```bash
cd samples/
# Use sample-council.csv and sample-registration.csv as test inputs
# Compare output with sample-expected-output.csv
```

See [samples/README.md](samples/README.md) for detailed test scenarios.

## Features

✅ **Pure Client-Side**: No backend required; works completely in the browser  
✅ **Robust CSV Parsing**: Handles quoted fields, embedded commas, multiline values  
✅ **Flexible Registration Mapping**: Auto-detects known headers and falls back to manual mapping for custom CSV formats  
✅ **Bilingual UI**: Live switch between English and Spanish for interface text and runtime messages  
✅ **Deterministic Output**: Same input always produces same output  
✅ **Comprehensive Validation**: Reports missing registrations, duplicate entries, unrepresented clubs  
✅ **Governance Metrics**: Shows represented clubs, club/leadership vote totals, and quorum status  
✅ **Brand-Aligned Styling**: Uses Toastmasters brand manual palette and gradient direction patterns  
✅ **Responsive Design**: Works on desktop, tablet, and mobile devices  
✅ **CSV Export**: Download results with timestamp (`toastmasters-votes-YYYYMMDD.csv`)  
✅ **Accessible**: Proper semantic HTML, ARIA labels, keyboard navigation  
✅ **GitHub Pages Ready**: Deploy as static site, no action required  

## Troubleshooting

### "Could not find header row in Council CSV"
- Check that your CSV contains the expected column names
- Verify the column names match exactly (spacing and capitalization matter)
- Remove any extra preface lines before the header row

### "Missing required column"
- Verify both CSV files have all required columns
- Check for trailing spaces in column names
- Re-export from source system if available

### "No results showing"
- Verify members exist in **both** Council and Registration lists
- Check that `Club Status = Complete` (member must be from valid club)
- Confirm `Will you be attending? = Yes` in registration (case-insensitive)

### Members missing from output
- Check if they're in both Council and Registration lists
- Verify their club status is "Complete"
- Confirm they're marked as attending in registration

## Development

### Project Structure Notes

- **app.js**: All logic isolated in this file for easy deployment
- **style.css**: Fully responsive; uses CSS Grid for layouts
- **index.html**: Vanilla HTML with no frameworks needed

No build process, no dependencies, no npm install required.

### Extending the Application

To modify voting rules:
1. Edit `docs/voting-rules.md` (documentation)
2. Update `LEADERSHIP_VOTE_ROLES` array in `app.js` (code)
3. Adjust vote calculation logic in `computeVotes()` function
4. Update `redistributeOverflow()` for redistribution tie-breakers

## License

Internal use for Toastmasters District 0113. Contact voting administrator for questions.

## Support

For technical issues or feature requests, see `docs/voting-rules.md` for algorithm details or review `samples/README.md` for test cases.

---

**Last Updated**: March 11, 2026  
**Version**: 1.0  
**Status**: Production Ready
