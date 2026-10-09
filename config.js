// Public identifiers only (no secrets). Plan and task data is NOT in this repo: it is fetched after sign-in.
window.CFG = {
  userPoolId: "us-west-2_WMOgHf6cc",
  clientId: "1kb3vbjtm4ppcme9g0hgt37fhk",
  dbBase: "https://1bf7lx4i1b.execute-api.us-west-2.amazonaws.com/prod",
  // Edit-mode PIN check. Set with `python3 set_pin.py`. It only guards against accidental edits,
  // it is not a security control (anyone can read this file).
  pinSalt: "3c8eea7c67a56429",
  pinHash: "91d1ee823a9164dd33de326ed7bea2e0608f5f0e48b5f2f0f8ef64025eef2e6f"
};
