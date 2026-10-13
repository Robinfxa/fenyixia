export interface Member {
  id: string
  name: string
  emoji: string
  color?: string
}

export interface BillItem {
  id?: string
  name: string
  price: number
  qty: number
  members: Member[]
}

export interface BillSettlementAudit {
  cycle_id: string
  cycle_start: string
  cycle_end: string
  confirmed_at: string
  confirmed_by: {
    id: string
    name: string
    emoji: string
  }
  proof_image_url?: string
  proof_note?: string
  settled_member_id?: string | null
}

export interface Bill {
  id: string
  icon: string
  title: string
  description: string
  total_amount: number
  date: string // ISO 'YYYY-MM-DD'
  payer_id: string
  payer_name: string
  payer_emoji: string
  payer_email: string
  settled: boolean
  color: string
  items: BillItem[]
  members: Member[]
  per_amount: number
  my_share: number
  /** Whether current user has uploaded a payment proof */
  _hasMeProof?: boolean
  /** Set of user IDs who have uploaded proofs for this bill */
  _proofUserIds?: Set<string>
  /** Set of user IDs manually marked as paid by the payer */
  _manualPaidUserIds?: Set<string>
  /** Active pending dispute on this bill, if any */
  _dispute?: BillDispute | null
  /** Settlement cycle audit information if settled via weekly settlement */
  _settlement?: BillSettlementAudit | null
  /** Map of memberId -> BillSettlementAudit for members settled via weekly cycle */
  _memberSettlements?: Record<string, BillSettlementAudit>
}

export interface PaymentProof {
  id: string
  bill_id: string
  user_id: string
  image_url: string
  created_at: string
  user?: Member | null
}

export interface BillReaction {
  id: string
  bill_id: string
  user_id: string
  anger_count: number
  seen: boolean
  user?: Member | null
}

export interface DisputeSuggestedItem {
  name: string
  price: number
  qty: number
  member_ids: string[]
}

export interface BillDispute {
  id: string
  bill_id: string
  challenger_id: string
  challenger?: Member
  reason: string
  suggested_items: DisputeSuggestedItem[]
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export interface CreateBillData {
  icon: string
  title: string
  description?: string
  date?: string
  color?: string
  items: {
    name: string
    price: number
    qty?: number
    member_ids: string[]
  }[]
}

export interface UpdateBillData {
  title: string
  icon: string
  description?: string
  items: {
    name: string
    price: number
    qty?: number
    member_ids: string[]
  }[]
}
