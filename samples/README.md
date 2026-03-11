# Test Fixtures for Toastmasters Voting App

This directory contains sample input and expected output files for testing and validating the voting application logic.

## Files

### sample-council.csv
A sample Council Member List containing:
- **10 clubs** with both President and VP Education positions registered
- **2 incomplete clubs** with leadership roles (Area Director, Division Director) 
- **22 council members** in total

### sample-registration.csv
A sample Registration List with:
- **20 registered members** (Will you be attending? = Yes)
- **2 unregistered members** (Diana White, Fiona Miller) to test incomplete club representation
- Test case: Charlie Club's VPE (Diana) is not registered, so President (Charlie) gets all 2 votes

### sample-expected-output.csv
Expected voting results after applying rules:
- Each complete club with both officers registered: President gets 1, VPE gets 1 (e.g., Alice Smith & Bob Johnson from Alpha Club)
- Each complete club with only President registered: President gets 2 (e.g., Charlie Brown from Bravo Club)
- Each complete club with only VPE registered: VPE gets 2
- Leadership roles (Area Director, Division Director): +1 independent vote if registered
- Victor King: Area Director with 1 independent vote
- Walter Prince: Division Director with 1 independent vote

## Test Scenarios Covered

1. **Both officers registered** (Alpha Club): President gets 1, VPE gets 1
2. **Only President registered** (Bravo Club): President gets 2
3. **Only VPE registered** (Charlie Club after Diana doesn't attend): President gets 2
4. **Leadership roles** (Victor, Walter): +1 independent vote
5. **Incomplete clubs** (District Leadership): Members without Complete status

## How to Use

1. Open `index.html` in a web browser
2. Upload `sample-council.csv` as the Council Member List
3. Upload `sample-registration.csv` as the Registration List
4. Click "Process Votes"
5. Verify the output matches `sample-expected-output.csv`
6. Download CSV and compare exact match

## Notes

- The sample council CSV contains a "Date Generated" preface line that the parser must skip
- Member IDs are numeric for easy sorting verification
- Some members are registered but not attending (test attendance flag logic)
- The app should report club 10004 (Delta Club) as unrepresented if Edward Davis votes but Fiona Miller doesn't (both marked as attending vs not)
