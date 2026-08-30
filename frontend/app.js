// app.js — Full ruthless version (GenLayer DepositJudge frontend)
window.addEventListener('error', (e) => {
  document.getElementById('errorBanner').textContent = "Script error: " + e.message;
  document.getElementById('errorBanner').classList.add('show');
});
window.addEventListener('unhandledrejection', (e) => {
  document.getElementById('errorBanner').textContent = "Async error: " + (e.reason?.message || e.reason);
  document.getElementById('errorBanner').classList.add('show');
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

// ==================== CONFIG ====================
const CONTRACT_ADDRESS = "0xf445b8ecD30c1B0E5db2a63652fe4EB9ef7D5359";
const STORAGE_KEY = "depositjudge_pk";

// ==================== CLIENT SETUP ====================
let account = null;
let client = null;

function buildClient(pk) {
  account = pk ? createAccount(pk) : createAccount();
  client = createClient({ chain: studionet, account });
}

// ==================== DOM ELEMENTS ====================
const sigIdentity = document.getElementById('sigIdentity');
const sigLabel = document.getElementById('sigLabel');
const regenBtn = document.getElementById('regenBtn');
const sigToggle = document.getElementById('sigToggle');
const sigForm = document.getElementById('sigForm');
const pkInput = document.getElementById('pkInput');
const pkConnectBtn = document.getElementById('pkConnectBtn');

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

// ==================== UTILITIES ====================
function shortAddr(addr) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function setSignedIn(connected) {
  if (connected) {
    sigLabel.textContent = "Signed in as " + shortAddr(account.address);
    sigIdentity.classList.add('connected');
    regenBtn.style.display = "none";
  } else {
    sigLabel.textContent = "Guest wallet: " + shortAddr(account.address);
    sigIdentity.classList.remove('connected');
    regenBtn.style.display = "";
  }
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add('show');
  setTimeout(() => errorBanner.classList.remove('show'), 4500);
}

function clearError() {
  errorBanner.classList.remove('show');
}

// ==================== SIGN-IN FLOW ====================
sigToggle.addEventListener('click', () => {
  sigForm.classList.toggle('show');
  sigToggle.classList.toggle('open');
});

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
  if (!pk) return showError("Enter private key first");
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

// ==================== CASE & VERDICT REFRESH ====================
async function refreshCase() {
  try {
    const summary = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_case_summary",
      args: [],
    });

    statusText.textContent = summary.status;
    statusPill.style.setProperty('--dot-color', summary.status === 'resolved' ? '#3a7d4f' : '#b98d3e');

    leaseTerms.textContent = summary.lease_terms || "—";

    // Disable buttons based on state
    submitTenantBtn.disabled = summary.status !== "created";
    submitLandlordBtn.disabled = summary.status !== "tenant_submitted";
    resolveBtn.disabled = summary.status !== "landlord_submitted";

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

    if (verdict.status === "not yet resolved") {
      verdictBox.classList.remove('show');
      return;
    }

    stampPct.textContent = verdict.tenant_pct + "%";

    if (verdict.tenant_pct >= 50) {
      stamp.classList.add('tenant-favor');
    } else {
      stamp.classList.remove('tenant-favor');
    }

    stamp.style.transition = 'none';
    stamp.offsetHeight; // force reflow
    stamp.style.transition = 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1), opacity 0.6s';

    stampPct.textContent = verdict.tenant_pct + "%";
    splitLine.textContent = `TENANT RECEIVES ${verdict.tenant_amount}  ·  LANDLORD RETAINS ${verdict.landlord_amount}`;
    reasoningText.textContent = verdict.reasoning || "No reasoning available";

    verdictBox.classList.add('show');
  } catch (e) {
    showError("Could not load verdict: " + e.message);
  }
}

// ==================== CLAIM SUBMISSIONS ====================
submitTenantBtn.addEventListener('click', async () => {
  clearError();
  const text = tenantClaim.value.trim();
  if (!text) return showError("Tenant statement cannot be empty");

  submitTenantBtn.disabled = true;
  submitTenantBtn.textContent = "Filing…";

  try {
    const tx = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "submit_tenant_claim",
      args: [text],
      value: 0,
    });
    await client.waitForTransactionReceipt({ hash: tx });

    submitTenantBtn.textContent = "Filed ✓";
    setTimeout(() => {
      submitTenantBtn.textContent = "File Statement";
      submitTenantBtn.disabled = false;
    }, 1800);
    await refreshCase();
  } catch (e) {
    showError("Failed to file tenant statement: " + e.message);
    submitTenantBtn.disabled = false;
    submitTenantBtn.textContent = "File Statement";
  }
});

submitLandlordBtn.addEventListener('click', async () => {
  clearError();
  const text = landlordClaim.value.trim();
  if (!text) return showError("Landlord statement cannot be empty");

  submitLandlordBtn.disabled = true;
  submitLandlordBtn.textContent = "Filing…";

  try {
    const tx = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "submit_landlord_claim",
      args: [text],
      value: 0,
    });
    await client.waitForTransactionReceipt({ hash: tx });

    submitLandlordBtn.textContent = "Filed ✓";
    setTimeout(() => {
      submitLandlordBtn.textContent = "File Statement";
      submitLandlordBtn.disabled = false;
    }, 1800);
    await refreshCase();
  } catch (e) {
    showError("Failed to file landlord statement: " + e.message);
    submitLandlordBtn.disabled = false;
    submitLandlordBtn.textContent = "File Statement";
  }
});

// ==================== RESOLVE ====================
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
    setTimeout(() => {
      resolveBtn.textContent = "Request Ruling";
      resolveBtn.disabled = false;
    }, 2000);
    await refreshCase();
  } catch (e) {
    showError("Failed to resolve dispute: " + e.message);
    resolveBtn.disabled = false;
    resolveBtn.textContent = "Request Ruling";
  }
});

// ==================== INITIAL LOAD ====================
refreshCase();
