# shaadi-dashboard

Static front end for the family wedding dashboard. It contains no plan data: after sign-in (Cognito) the page loads everything from the private `core-services` `db-service`.

- `config.js` holds public identifiers and a salted hash for the edit-mode PIN.
- `set_pin.py` sets that PIN hash locally.
