window.addEventListener('error', (e) => {
  document.getElementById('errorBanner').textContent = "Script error: " + e.message;
  document.getElementById('errorBanner').classList.add('show');
  document.getElementById('statusText').textContent = "error — see message above";
});
window.addEventListener('unhandledrejection', (e) => {
  document.getElementById('errorBanner').textContent = "Async error: " + (e.reason?.message || e.reason);
  document.getElementById('errorBanner').classList.add('show');
  document.getElementById('statusText').textContent = "error — see message above";
});

let createClient, createAccount, studionet;
try {
  const mod1 = await import("https://esm.sh/genlayer-js");
  const mod2 = await import("https://esm.sh/genlayer-js/chains");
  createClient = mod1.createClient;
  createAccount = mod1.createAccount;
  studionet = mod2.studionet;
} catch (e) {
  document.getElementById('errorBanner').textContent = "Failed to load genlayer-js library: " + e.message;
  document.getElementById('errorBanner').classList.add('show');
  document.getElementById('statusText').textContent = "library load failed";
  throw e;
}

// ---- CONFIG: paste your deployed contract address below ----
const CONTRACT_ADDRESS = "0xf445b8ecD30c1B0E5db2a63652fe4EB9ef7D5359";
// ---------------------------------------------------------------

const STORAGE_KEY = "depositjudge_pk"; // sessionStorage only — cleared when tab closes

let account = null;
let client = null;

function buildClient(pk) {
  account = pk ? createAccount(pk) : createAccount();
  client = createClient({ chain: studionet, account });
}

const sigIdentity = document.getElementById('sigIdentity');
const sigLabel = document.getElementById('sigLabel');
const regenBtn = document.getElementById('regenBtn');
const sigToggle = document.getElementById('sigToggle');
const sigForm = document.getElementById('sigForm');
const pkInput = document.getElementById('pkInput');
const pkConnectBtn = document.getElementById('pkConnectBtn');

function shortAddr(addr) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function setSignedIn(connected) {
  if (connected) {
    sigLabel.textContent = "Signing as " + shortAddr(account.address);
    sigIdentity.classList.add('connected');
    regenBtn.style.display = "none";
  } else {
    sigLabel.textContent = "Guest wallet: " + shortAddr(account.address);
    sigIdentity.classList.remove('connected');
    regenBtn.style.display = "";
  }
}

sigToggle.addEventListener('click', () => {
  sigForm.classList.toggle('show');
  sigToggle.classList.toggle('open');
});

// Try to restore a key from this tab's session (never sent anywhere, never persisted to disk)
const savedKey = sessionStorage.getItem(STORAGE_KEY);
if (savedKey) {
  buildClient(savedKey);
  setSignedIn(true);
} else {
  buildClient(null);
  setSignedIn(false);
}

pkConnectBtn.addEventListener('click', () => {
  const pk = pkInput.value.trim();
  if (!pk) return showError("Enter a private key first.");
  try {
    buildClient(pk);
    sessionStorage.setItem(STORAGE_KEY, pk);
    pkInput.value = "";
    setSignedIn(true);
    sigForm.classList.remove('show');
    sigToggle.classList.remove('open');
    refreshCase();
  } catch (e) {
    showError("Invalid private key: " + e.message);
  }
});

regenBtn.addEventListener('click', () => {
  sessionStorage.removeItem(STORAGE_KEY);
  buildClient(null);
  setSignedIn(false);
  refreshCase();
});

const statusText = document.getElementById('statusText');
const statusPill = document.getElementById('statusPill');
const errorBanner = document.getElementById('errorBanner');
const leaseTerms = document.getElementById('leaseTerms');
const tenantClaim = document.getElementById('tenantClaim');
const landlordClaim = document.getElementById('landlordClaim');
const submitTenantBtn = document.getElementById('submitTenantBtn');
const submitLandlordBtn = document.getElementById('submitLandlordBtn');
const resolveBtn = document.getElementById('resolveBtn');
const verdictBox = document.getElementById('verdictBox');
const stamp = document.getElementById('stamp');
const stampPct = document.getElementById('stampPct');
const splitLine = document.getElementById('splitLine');
const reasoningText = document.getElementById('reasoningText');

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add('show');
}
function clearError() {
  errorBanner.classList.remove('show');
}

async function refreshCase() {
  try {
    const summary = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_case_summary",
      args: [],
    });
    statusText.textContent = summary.status;
    statusPill.style.setProperty('--dot-color', summary.status === 'resolved' ? 'var(--forest)' : 'var(--brass)');
    leaseTerms.textContent = summary.lease_terms;

    if (summary.status !== "created") {
      submitTenantBtn.disabled = true;
    }
    if (summary.status !== "tenant_submitted") {
      submitLandlordBtn.disabled = true;
    }
    if (summary.status === "resolved") {
      resolveBtn.disabled = true;
      await refreshVerdict();
    }
  } catch (e) {
    showError("Could not load case: " + e.message);
  }
}

async function refreshVerdict() {
  try {
    const verdict = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_verdict",
      args: [],
    });
    if (verdict.status === "not yet resolved") return;

    stampPct.textContent = verdict.tenant_pct + "%";
    if (verdict.tenant_pct >= 50) {
      stamp.classList.add('tenant-favor');
    }
    splitLine.textContent =
      `TENANT RECEIVES ${verdict.tenant_amount}  ·  LANDLORD RETAINS ${verdict.landlord_amount}`;
    reasoningText.textContent = verdict.reasoning;
    verdictBox.classList.add('show');
  } catch (e) {
    showError("Could not load verdict: " + e.message);
  }
}

submitTenantBtn.addEventListener('click', async () => {
  clearError();
  if (!tenantClaim.value.trim()) return showError("Enter a statement before filing.");
  submitTenantBtn.disabled = true;
  submitTenantBtn.textContent = "Filing…";
  try {
    const tx = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "submit_tenant_claim",
      args: [tenantClaim.value.trim()],
      value: 0,
    });
    await client.waitForTransactionReceipt({ hash: tx });
    submitTenantBtn.textContent = "Filed ✓";
    await refreshCase();
  } catch (e) {
    showError("Failed to file tenant statement: " + e.message);
    submitTenantBtn.disabled = false;
    submitTenantBtn.textContent = "File Statement";
  }
});

submitLandlordBtn.addEventListener('click', async () => {
  clearError();
  if (!landlordClaim.value.trim()) return showError("Enter a statement before filing.");
  submitLandlordBtn.disabled = true;
  submitLandlordBtn.textContent = "Filing…";
  try {
    const tx = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "submit_landlord_claim",
      args: [landlordClaim.value.trim()],
      value: 0,
    });
    await client.waitForTransactionReceipt({ hash: tx });
    submitLandlordBtn.textContent = "Filed ✓";
    await refreshCase();
  } catch (e) {
    showError("Failed to file landlord statement: " + e.message);
    submitLandlordBtn.disabled = false;
    submitLandlordBtn.textContent = "File Statement";
  }
});

resolveBtn.addEventListener('click', async () => {
  clearError();
  resolveBtn.disabled = true;
  resolveBtn.textContent = "Deliberating…";
  try {
    const tx = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "resolve_dispute",
      args: [],
      value: 0,
    });
    await client.waitForTransactionReceipt({ hash: tx });
    resolveBtn.textContent = "Ruling Delivered";
    await refreshCase();
  } catch (e) {
    showError("Failed to resolve dispute: " + e.message);
    resolveBtn.disabled = false;
    resolveBtn.textContent = "Request Ruling";
  }
});

refreshCase();
