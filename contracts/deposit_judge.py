# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import typing
import json


class DepositJudge(gl.Contract):
    # Case data
    landlord: str
    tenant: str
    deposit_amount: bigint       # in smallest currency unit, e.g. cents/wei-equivalent
    lease_terms: str             # plain text: what condition was expected at move-out

    tenant_claim: str            # tenant's description of condition + evidence (text)
    landlord_claim: str          # landlord's counter-claim: damages, deductions wanted

    status: str                  # "created" -> "tenant_submitted" -> "landlord_submitted" -> "resolved"

    verdict_split_tenant_pct: bigint   # 0-100, filled in after resolution
    verdict_reasoning: str          # AI's explanation, stored for transparency

    def __init__(self, landlord_address: str, tenant_address: str, deposit_amount: bigint, lease_terms: str):
        self.landlord = landlord_address
        self.tenant = tenant_address
        self.deposit_amount = deposit_amount
        self.lease_terms = lease_terms

        self.tenant_claim = ""
        self.landlord_claim = ""
        self.status = "created"

        self.verdict_split_tenant_pct = bigint(-1)  # -1 means "not yet decided"
        self.verdict_reasoning = ""

    @gl.public.write
    def submit_tenant_claim(self, claim_text: str) -> None:
        if self.status != "created":
            raise Exception("Tenant claim already submitted or case in wrong state")
        self.tenant_claim = claim_text
        self.status = "tenant_submitted"

    @gl.public.write
    def submit_landlord_claim(self, claim_text: str) -> None:
        if self.status != "tenant_submitted":
            raise Exception("Tenant must submit first, or landlord already submitted")
        self.landlord_claim = claim_text
        self.status = "landlord_submitted"

    @gl.public.write
    def resolve_dispute(self) -> typing.Any:
        if self.status != "landlord_submitted":
            raise Exception("Both claims must be submitted before resolving")

        lease_terms = self.lease_terms
        tenant_claim = self.tenant_claim
        landlord_claim = self.landlord_claim

        def get_input() -> str:
            return f"""LEASE TERMS (what was expected at move-out):
{lease_terms}

TENANT'S CLAIM (their account of the property condition / evidence):
{tenant_claim}

LANDLORD'S CLAIM (their account of damages / deductions wanted):
{landlord_claim}"""

        raw = gl.eq_principle.prompt_non_comparative(
            get_input,
            task="""You are an impartial rental deposit dispute arbitrator. Given the lease terms, tenant's claim, and landlord's claim above, decide what percentage of the deposit the TENANT should receive back.

The percentage MUST be one of exactly these values: 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.

Respond using ONLY the following JSON format, nothing else, no markdown formatting:
{
    "tenant_pct": int,
    "reasoning": str
}
The reasoning should be at most 2 sentences explaining the decision.""",
            criteria="""The response must be valid JSON with exactly the keys "tenant_pct" and "reasoning".
tenant_pct must be one of: 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.
The decision must be a reasonable, fair judgment based on the lease terms and both claims provided — not an arbitrary or clearly biased number.
The reasoning must be at most 2 sentences and must logically support the chosen percentage.""",
        )

        raw_clean = raw.replace("```json", "").replace("```", "").strip()
        dat = json.loads(raw_clean)
        allowed = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        if dat["tenant_pct"] not in allowed:
            dat["tenant_pct"] = min(allowed, key=lambda x: abs(x - dat["tenant_pct"]))

        self.verdict_split_tenant_pct = bigint(dat["tenant_pct"])
        self.verdict_reasoning = dat["reasoning"]
        self.status = "resolved"

    @gl.public.view
    def get_case_summary(self) -> typing.Any:
        return {
            "landlord": self.landlord,
            "tenant": self.tenant,
            "deposit_amount": self.deposit_amount,
            "lease_terms": self.lease_terms,
            "status": self.status,
            "tenant_claim": self.tenant_claim,
            "landlord_claim": self.landlord_claim,
        }

    @gl.public.view
    def get_verdict(self) -> typing.Any:
        if self.status != "resolved":
            return {"status": "not yet resolved"}
        tenant_amount = (self.deposit_amount * self.verdict_split_tenant_pct) // 100
        landlord_amount = self.deposit_amount - tenant_amount
        return {
            "tenant_pct": self.verdict_split_tenant_pct,
            "tenant_amount": tenant_amount,
            "landlord_amount": landlord_amount,
            "reasoning": self.verdict_reasoning,
        }
        
