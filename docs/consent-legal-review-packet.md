# Coleman Storybook — Consent & Media Release: Legal Review Packet

**Prepared for: Camp Coleman's counsel / designated legal reviewer.**
**Prepared by: engineering, as a technical description of what the product does and the exact language it currently shows — not as a legal opinion. Nothing below should be treated as lawyer-approved until you say so.**

## What this product does, briefly

Coleman Storybook invites Camp Coleman alumni, staff, parents, and volunteers to record short video/audio answers to guided questions about their camp experience. Before recording anything, a contributor is shown the consent text below and must affirmatively accept it, along with choosing how their story may be used (see "Permitted use classifications" below). Recordings and consent records are stored privately; nothing is made public without a separate internal review step. Contributors must self-attest they are adults; there is currently no pathway for minors to contribute.

## The exact current draft consent text

This is DRAFT, placeholder language written by engineering to make the technical consent-tracking system demonstrable — it has not been reviewed by anyone with legal training. `[Organization Name]` is replaced with "Camp Coleman" (or whatever the org's configured name is) when actually shown to a contributor.

> By continuing, you agree to let [Organization Name] record, store, and use the video/audio you provide, along with the answers and information you share, for the following purposes: sharing your story internally, considering it for use in [Organization Name]'s marketing, fundraising, recruitment, and archival materials (online, in print, and in social media), and preserving it as part of [Organization Name]'s ongoing oral history.
>
> You do not have to share anything you are not comfortable sharing. You may stop recording at any time before you submit. [Organization Name] will not publish your story publicly without separate, explicit review and approval.

## Permitted-use classifications a contributor chooses at consent time

In addition to the text above, each contributor picks one of these four options, so someone can agree to internal review without necessarily agreeing to public marketing use:

1. Internal review only (no external use)
2. Website and social media
3. Fundraising and recruitment materials
4. All of the above (full permitted use)

## Specific questions we need your input on

1. **Is the consent/media-release text above legally sufficient** as a release for the stated uses (internal review, website/social, fundraising/recruitment materials, archival oral history)? What needs to change?
2. **Data retention:** how long should recorded video, transcripts, and AI-derived metadata (themes/summaries/quotes) be kept? Indefinitely until the contributor asks for removal, or a fixed period?
3. **Withdrawal:** if a contributor asks to withdraw after submitting, what should actually happen — stop future use only, or delete the underlying recording/transcript too? Does it matter whether the story was already used in a published marketing piece?
4. **Deletion rights:** should contributors have an affirmative right to request deletion, separate from "withdrawal of consent for future use"?
5. **Recording-consent law:** since contributors record themselves from wherever they are (not necessarily on camp property), does anything need to change given U.S. states (and other countries) vary on one-party vs. all-party consent for recordings? The product's current approach relies on the contributor's own self-attestation/consent to their own recording — is that sufficient, or does anything else need to be added (e.g. a jurisdiction question, additional language)?
6. **Third-party processors:** the product will send recordings to a speech-to-text vendor and an AI vendor for analysis (specific vendors: still being finalized — currently evaluating AssemblyAI or Deepgram for transcription, and Anthropic's Claude API for thematic analysis). Does Camp Coleman's privacy posture require disclosing these processors to contributors, or a specific data-processing agreement with them?
7. **Minors:** the product currently excludes anyone who isn't an adult (self-attested at the start of the flow). Confirming this is an acceptable interim posture, and flagging that any future minor/guardian-consent pathway would need its own separate legal review before being built.

## Where this fits in the launch process

This review is one of a small number of items standing between where the product is now (built and tested, not yet in front of any real contributor) and a real, bounded pilot. See `docs/privacy-and-consent.md` and `docs/legal-review-required.md` in the project repository for the fuller technical picture if useful, but this packet should contain everything needed to do the review without digging through code.
