# Idle musings and the user card

Date: 2026-10-08

Status: implemented, with live listening review pending.

## Context

The user asked AIRI to speak up occasionally when the user is idle.
A musing is an existentialist question, an existentialist thought, or a tiny piece of trivia.
Each musing is one sentence at most.
Musings stop while the user shares a tab.

The user also supplied a personal card with taste, philosophy, and personality notes.
The local Qwen lane keeps and reads the card.
Cloud models receive the card only while a cloud model is selected and the user allows it.

## User card

`useUserProfileStore` keeps the card in local profile storage under `hybrid/user-profile`.
AIRI account sync does not replicate it.
The local lane appends the card to its opening system turn in `llm.ts`.
The same turn also carries the private viewing preferences.

The saved `Share my card with cloud models` control starts disabled in a new profile.
The current user approved enabling it.
`PrivacyRouter.capture` freezes the card into a cloud request only when sharing is on.
Only the cloud chat system turn uses it. Idle musings use that turn too.
Free Inkling, shared-video reactions, and habit reactions never receive the card.
The card is quoted data. The prompt tells the model to let it shape topics and banter without reciting it.

## Idle musings

`IdleMusingSchedule` owns the timing in a pure class.
A musing waits for five quiet minutes after any activity.
Later musings wait a random gap from 8 to 20 minutes.
Activity includes a chat turn, speech, a spark reaction, a scheduled spark, and an active tab share.
Activity during a long gap does not shorten that gap.
The kinds rotate through an existential question, trivia, and an existential thought.

The orchestrator ticker enqueues an internal `spark:notify` event with the `airi-idle-musing` payload source.
The handler checks the conditions again before it calls a model.
It captures the request through the privacy router as the `idle-musings` session.
The local mode uses Qwen. Other modes use the selected cloud model.
The reply uses the existing spark reaction path for captions and speech.
A 45-second deadline covers a cold local model.

Recent musings stay in RAM per scope.
Local musings can use private context, so their lines never enter a cloud request.
The prompt lists recent lines from the same scope and asks for a different topic and opening.

A saved `Let AIRI muse when I am idle and not sharing a tab` control turns musings off.
It starts enabled because the feature only speaks in an idle, unshared state.
