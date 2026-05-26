# ADR 008 — AI-Assisted Development as a First-Class Engineering Practice

**Status:** Accepted  
**Date:** 2026-05-25

---

## Context

This repository is maintained by a single contributor. At solo scale, the 
gap between what one engineer can design and what one engineer can 
implement without quality loss is the primary constraint on the work.

The conventional response to that constraint is to narrow scope. This 
repository takes a different approach: use AI assistance not as a code 
generator but as a constrained contributor operating under the same 
engineering standards as a human team member.

The distinction matters. A code generator produces output. A constrained 
contributor follows conventions, respects architectural decisions, operates 
within stated boundaries, and produces work that is reviewable and 
mergeable without a full rewrite. The difference between those two modes 
is the difference between a tool and a force multiplier.

This ADR documents the deliberate model used in this repository and the 
reasoning behind it. It exists because the model itself is an engineering 
decision with tradeoffs, not an implementation detail.

---

## Decision

AI assistance in this repository operates under a contributor model, not 
a consultation model. This means:

1. **The DEVELOPER_GUIDE is the harness.** Every AI contributor is given 
   the DEVELOPER_GUIDE as primary context before any work begins. The 
   guide defines what this contributor is allowed to do, how they should 
   think about the work, and what they must not do. This is the same 
   contract a human contributor would receive on their first day.

2. **Architectural decisions precede implementation.** AI contributors do 
   not propose architecture during implementation. If a change requires an 
   architectural decision, an ADR is written and accepted before any code 
   is generated. This keeps the decision record clean and prevents 
   architecture-by-accident, which is the most common failure mode of 
   AI-assisted development at scale.

3. **Output is reviewed before it lands.** No AI-generated output is 
   committed without human review. The review is not a spell-check. It is 
   the same code review a human contributor's PR would receive: does this 
   follow the conventions, does it solve the right problem, does it 
   introduce technical debt, does it match the stated intent of the ADR.

4. **The contributor model is explicit in the output.** Work produced 
   under this model does not obscure its origin. The DEVELOPER_GUIDE 
   states that AI assistance is used. This ADR states how. Any engineer 
   reviewing this repository should be able to understand the 
   collaboration model without asking.

---

## Why This Model Matters at Scale

The value of the contributor model over the consultation model becomes 
visible at scale. A consultation model produces correct answers to the 
questions asked. A contributor model produces work that fits into a 
larger system coherently over time.

The specific risks that the contributor model addresses:

**Architecture drift.** Without ADRs gating implementation, AI 
contributors will make architectural decisions implicitly in the code. 
Those decisions are invisible, unreviewed, and accumulate into a system 
that no one fully understands. The ADR-first workflow makes every 
architectural decision visible and reviewable.

**Convention erosion.** Without a harness, each AI interaction produces 
output that is locally correct but globally inconsistent. Over time the 
codebase develops multiple competing styles, naming patterns, and 
structural approaches that are individually defensible but collectively 
incoherent. The DEVELOPER_GUIDE harness prevents this by making 
consistency a constraint rather than a preference.

**Review surface collapse.** A human reviewer cannot effectively review 
AI-generated output that arrives without context. The contributor model 
produces output that arrives with stated rationale, referenced decisions, 
and explicit conventions. This makes review tractable even at high output 
velocity.

These are the same failure modes that emerge in human teams without 
engineering standards. The contributor model applies the same solution: 
constraints that protect the system rather than individual contributors.

---

## Mapping to Production Team Practices

This model is intentionally isomorphic to how high-performing engineering 
teams manage distributed contribution at scale:

| This repository | Production team equivalent |
|---|---|
| DEVELOPER_GUIDE | Engineering handbook / contribution guide |
| ADR before implementation | RFC or design doc before PR |
| Human review before commit | Code review / PR approval |
| Explicit contributor model | Onboarding contract for new team members |
| Convention harness | Linter, formatter, CI enforcement |

The implication is that the patterns demonstrated here are not specific 
to AI collaboration. They are the patterns that make any distributed 
contribution model work. AI assistance makes the value of those patterns 
visible at solo scale because without them the failure modes appear 
immediately rather than over months.

---

## Tradeoffs

**What this model costs:** Speed on individual tasks. A consultation model 
produces output faster because it skips the ADR, the harness review, and 
the convention check. For throwaway work, that tradeoff is correct.

**What this model buys:** A codebase that remains coherent and reviewable 
over time, a decision record that explains why the system is the way it 
is, and a demonstration that the contributor — human or AI — was 
operating under professional standards rather than individual judgment.

---

## What This Does Not Mean

This model does not mean every line of code in this repository was 
written by AI and reviewed by a human. Some sections were written 
entirely by the human contributor. Some were drafted by AI and revised 
substantially. Some were generated under the harness and required minimal 
review.

The model does not require a particular ratio. It requires that whatever 
was produced arrived through a reviewable process and meets the same 
standards regardless of origin. That is the point. A well-constrained AI 
contributor and a well-onboarded human contributor should be 
indistinguishable in their output. When they are not, the harness needs 
tightening, not the AI.

---

## Alternatives Considered

**Consultation model:** Use AI as an on-demand expert to answer questions 
and generate isolated code snippets without a governing harness. Rejected 
because it produces locally correct but globally incoherent output at any 
meaningful scale of use.

**No AI assistance:** Maintain the repository as purely human-authored 
work. Rejected because it artificially constrains the scope of what one 
contributor can demonstrate and because it misrepresents a skill — 
effective AI collaboration — that is increasingly central to senior 
engineering work.

**Implicit model:** Use AI assistance without documenting the model. 
Rejected because transparency about the collaboration model is itself 
an engineering decision with professional implications. Hiding it is not 
neutral; it is misleading.

---

## References

- [DEVELOPER_GUIDE](../../DEVELOPER_GUIDE.md) — the primary harness 
  document governing all contributors to this repository
- [ADR 002](002-003-004-decisions.md) — migration strategy rationale, 
  an example of the ADR-first workflow applied to implementation decisions
- [ADR 006](006-scale-and-cost-considerations.md) — scale reasoning 
  applied before implementation, demonstrating the model in practice