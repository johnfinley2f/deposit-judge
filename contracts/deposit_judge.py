# { "Depends": "py-genlayer:test" }
from genlayer import *
import typing


class DepositJudge(gl.Contract):
    # Case data
    landlord: str
    tenant: str
    deposit_amount: int          # in smallest currency unit, e.g. cents/wei-equivalent
    lease_terms: str             # plain text: what condition was expected at move-out

    tenant_claim: str            # tenant's description of condition + evidence (text)
    landlord_claim: str          # landlord's counter-claim: damages, deductions wanted

    status: str                  # "created" -> "tenant_submitted" -> "landlord_submitted" -> "resolved"

    verdict_split_tenant_pct: int   # 0-100, filled in after resolution
    verdict_reasoning: str          # AI's explanation, stored for transparency

    def __init__(self, landlord_address: str, tenant_address: str, deposit_amount: int, lease_terms: str):
        self.landlord = landlord_address
        self.tenant = tenant_address
        self.deposit_amount = deposit_amount
        self.lease_terms = lease_terms

        self.tenant_claim = ""
        self.landlord_claim = ""
        self.status = "created"

        self.verdict_split_tenant_pct = -1  # -1 means "not yet decided"
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

    # Resolution logic (LLM call) comes in Day 2 — this is just a placeholder for now
    @gl.public.write
    def resolve_dispute(self) -> None:
        if self.status != "landlord_submitted":
            raise Exception("Both claims must be submitted before resolving")
        # TODO Day 2: call LLM here, set verdict_split_tenant_pct and verdict_reasoning
        raise Exception("resolve_dispute not implemented yet — Day 2 task")

    @gl.public.view
    def get_case_summary(self) -> dict:
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
    def get_verdict(self) -> dict:
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
